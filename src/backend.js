import { createClient } from '@supabase/supabase-js';
import { applyCommand, copy, newState, pausedState, UNDOABLE } from './core.js';
import { seedQuestions, questionKey, sortQuestions } from './seeds.js';
import { validateConfig } from './config.js';

const STORAGE = 'superinteligencia-demo-v1';
const config = window.DEBATE_CONFIG || {};
export const isDemo = config.mode === 'demo';
export function voterToken() {
  let token = localStorage.getItem('superinteligencia-voter-v1');
  if (!/^[a-f0-9]{48}$/.test(token || '')) { token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (n) => n.toString(16).padStart(2, '0')).join(''); localStorage.setItem('superinteligencia-voter-v1', token); }
  return token;
}
function publicCopy(s) {
  const p = copy(s); delete p.history;
  for (const k of ['a', 'b']) delete p.teams[k].members;
  if (!['results', 'reveal'].includes(p.phase)) p.result = null;
  return p;
}
export class Backend {
  constructor() {
    this.admin = false; this.listeners = new Set(); this.offset = 0; this.connection = 'connecting'; this.latest = null;
    if (!isDemo) {
      validateConfig(config);
      this.client = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { storageKey: 'debate-moderator-auth-v1', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    }
  }
  now() { return Date.now() + this.offset; }
  onChange(listener) { this.listeners.add(listener); if (this.latest) listener(this.latest); return () => this.listeners.delete(listener); }
  emit() { for (const fn of this.listeners) fn(this.latest); }
  demoRead() {
    const raw = localStorage.getItem(STORAGE);
    if (raw) return JSON.parse(raw);
    const data = { state: newState(), version: 1, votes: [], questions: [], actions: [] };
    data.questions = seedQuestions(data.state.sessionId); localStorage.setItem(STORAGE, JSON.stringify(data)); return data;
  }
  demoWrite(data) { localStorage.setItem(STORAGE, JSON.stringify(data)); this.channel?.postMessage('changed'); }
  async rpc(name, args = {}) { const { data, error } = await this.client.rpc(name, args); if (error) throw Error(error.message); return data; }
  accept(data, start = Date.now(), end = Date.now()) {
    if (!data?.state) throw Error('O backend ainda não foi configurado. Executa supabase/setup.sql no Supabase.');
    if (this.latest && data.state.sessionId === this.latest.state.sessionId && data.version < this.latest.version) return;
    if (data.serverNow) this.offset = data.serverNow - (start + end) / 2;
    this.latest = data; this.connection = 'online'; this.emit();
  }
  async refresh() {
    const role = this.admin;
    try {
      const start = Date.now();
      if (isDemo) {
        const d = this.demoRead(), votes = d.votes.filter((v) => v.sessionId === d.state.sessionId);
        const data = { state: role ? d.state : publicCopy(d.state), version: d.version, serverNow: Date.now() };
        if (!role) data.state.voteCounts = { initial: votes.filter((v) => v.initial).length, final: votes.filter((v) => v.final).length };
        if (role) { data.questions = this.demoQuestions(d); data.stats = { initial: votes.filter((v) => v.initial).length, final: votes.filter((v) => v.final).length, paired: votes.filter((v) => v.initial && v.final).length }; }
        this.accept(data, start); return data;
      }
      const data = await this.rpc(role ? 'debate_admin_data' : 'debate_get_state');
      if (role === this.admin) this.accept(data, start);
      return data;
    } catch (e) { this.connection = 'offline'; this.emit(); throw e; }
  }
  async connect() {
    await this.refresh();
    if (isDemo) {
      this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(STORAGE) : null;
      if (this.channel) this.channel.onmessage = () => this.refresh().catch(() => {});
      this.storageListener = (e) => { if (e.key === STORAGE) this.refresh().catch(() => {}); };
      window.addEventListener('storage', this.storageListener);
    } else {
      this.channel = this.client.channel('debate-public').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'debate_state', filter: 'id=eq.main' }, () => this.refresh().catch(() => {})).subscribe((status) => { this.realtimeConnected = status === 'SUBSCRIBED'; if (this.realtimeConnected) this.refresh().catch(() => {}); });
    }
    this.poll = setInterval(() => { if (this.admin || !this.realtimeConnected || Date.now() - (this.lastFetch || 0) > 30000) { this.lastFetch = Date.now(); this.refresh().catch(() => {}); } }, isDemo ? 2000 : 3000);
    this.onlineListener = () => this.refresh().catch(() => {}); window.addEventListener('online', this.onlineListener);
  }
  async login(email, password) {
    if (isDemo) { this.admin = true; sessionStorage.setItem('debate-demo-moderator', 'yes'); return this.refresh(); }
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw Error('Não foi possível iniciar sessão. Verifica o email e a palavra-passe.');
    if (!(await this.rpc('debate_is_moderator'))) { await this.client.auth.signOut(); throw Error('Esta conta não está autorizada a moderar este debate.'); }
    this.admin = true; return this.refresh();
  }
  async restoreLogin() {
    if (isDemo) { this.admin = sessionStorage.getItem('debate-demo-moderator') === 'yes'; }
    else { const { data } = await this.client.auth.getSession(); this.admin = Boolean(data.session && await this.rpc('debate_is_moderator')); }
    if (this.admin) await this.refresh(); return this.admin;
  }
  async logout() { this.admin = false; if (isDemo) sessionStorage.removeItem('debate-demo-moderator'); else await this.client.auth.signOut(); return this.refresh(); }
  async voteStatus(token) {
    const sessionId = this.latest.state.sessionId;
    if (isDemo) { const v = this.demoRead().votes.find((v) => v.sessionId === sessionId && v.token === token); return { initial: v?.initial || null, final: v?.final || null }; }
    return this.rpc('debate_vote_status', { p_session: sessionId, p_token: token });
  }
  async vote(token, phase, choice) {
    if (!['favor', 'neutral', 'contra'].includes(choice)) throw Error('Escolhe uma opção.');
    const sessionId = this.latest.state.sessionId;
    if (!isDemo) return this.rpc('debate_vote', { p_session: sessionId, p_token: token, p_phase: phase, p_choice: choice });
    const d = this.demoRead();
    if (d.state.sessionId !== sessionId || d.state.phase !== `${phase}_poll`) throw Error('A votação já terminou ou ainda não abriu.');
    let v = d.votes.find((v) => v.sessionId === sessionId && v.token === token);
    if (phase === 'final' && !v?.initial) throw Error('Só pode votar no fim quem votou no início, no mesmo navegador.');
    if (!v) { v = { sessionId, token, initial: null, final: null }; d.votes.push(v); }
    if (!v[phase]) v[phase] = choice;
    this.demoWrite(d); await this.refresh(); return { initial: v.initial, final: v.final };
  }
  demoQuestions(d, token) {
    return sortQuestions(d.questions.filter(q => q.sessionId === d.state.sessionId).map(q => {
      const values = Object.values(q.reactions || {});
      return { id: q.id, text: q.text, status: q.status, origin: q.origin || 'audience', createdAt: q.createdAt, score: values.reduce((a,b)=>a+b,0), likes: values.filter(v=>v===1).length, dislikes: values.filter(v=>v===-1).length, myReaction: q.reactions?.[token] || 0 };
    }));
  }
  async questions(token) {
    if (!isDemo) return this.rpc('debate_questions', { p_session: this.latest.state.sessionId, p_token: token });
    return this.demoQuestions(this.demoRead(), token).filter(q=>q.status!=='discarded');
  }
  async reactQuestion(token, id, value) {
    if (![-1,0,1].includes(value)) throw Error('Reação inválida.');
    if (!isDemo) return this.rpc('debate_react_question', { p_session: this.latest.state.sessionId, p_token: token, p_id: id, p_value: value });
    const d=this.demoRead();
    if (d.state.sessionId !== this.latest.state.sessionId) throw Error('Esta sessão de debate terminou.');
    if (!d.votes.some(v=>v.sessionId===d.state.sessionId && v.token===token && v.initial)) throw Error('Vota no inquérito inicial para participar.');
    const q=d.questions.find(q=>q.sessionId===d.state.sessionId && q.id===id && q.status!=='discarded');
    if (!q) throw Error('Pergunta indisponível.');
    q.reactions ||= {}; if(value===0) delete q.reactions[token]; else q.reactions[token]=value;
    this.demoWrite(d); return this.questions(token);
  }
  async submitQuestion(token, text, id) {
    const sessionId = this.latest.state.sessionId;
    if (!isDemo) return this.rpc('debate_submit_question', { p_session: sessionId, p_token: token, p_id: id, p_text: text });
    const d = this.demoRead();
    if (d.state.sessionId !== sessionId) throw Error('Esta sessão de debate terminou.');
    if (!d.votes.some(v=>v.sessionId===sessionId && v.token===token && v.initial)) throw Error('Vota no inquérito inicial para participar.');
    if (d.questions.some((q) => q.id === id && q.token === token && q.sessionId === sessionId)) return id;
    if (d.questions.some(q=>q.sessionId===sessionId && questionKey(q.text)===questionKey(text))) throw Error('Esta pergunta já foi recebida. Podes reagir à sugestão existente.');
    if (d.questions.some((q) => q.token === token && Date.now() - q.createdAt < 30000)) throw Error('Espera 30 segundos antes de enviar outra pergunta.');
    if (!text.trim() || text.length > 500) throw Error('A pergunta deve ter entre 1 e 500 caracteres.');
    d.questions.push({ id, sessionId, token, text: text.trim(), status: 'new', createdAt: Date.now() }); this.demoWrite(d); return id;
  }
  async command(action, payload = {}, requestId = crypto.randomUUID()) {
    if (!this.admin) throw Error('Inicia sessão para controlar o debate.');
    if (!isDemo) {
      try { const start = Date.now(); const data = await this.rpc('debate_command', { p_action: action, p_payload: payload, p_version: this.latest.version, p_request: requestId }); this.accept(data, start); return data; }
      catch (e) { await this.refresh().catch(() => {}); throw e; }
    }
    const d = this.demoRead();
    if (d.actions.some((a) => a.id === requestId)) return this.refresh();
    if (d.version !== this.latest.version) { await this.refresh(); throw Error('O estado mudou noutro separador. Tenta novamente.'); }
    const prev = pausedState(d.state, this.now()); let detail = {};
    if (action === 'undo') {
      const last = d.actions.at(-1);
      if (!last || !UNDOABLE.includes(last.action) || last.sessionId !== d.state.sessionId) throw Error('Esta transição não pode ser desfeita.');
      if (last.action === 'add_extra') { const q = d.questions.find((q) => q.id === last.payload.sourceId); if (q) q.status = last.detail.questionPreviousStatus; }
      d.state = copy(last.previous);
    } else if (action === 'question_status') {
      const q = d.questions.find((q) => q.id === payload.id && q.sessionId === d.state.sessionId);
      if (!q || !['new', 'selected', 'debated', 'discarded'].includes(payload.status)) throw Error('Pergunta inválida.'); q.status = payload.status;
    } else {
      if (action === 'add_extra') {
        const q = d.questions.find((q) => q.id === payload.sourceId && q.sessionId === d.state.sessionId);
        if (!q) throw Error('Seleciona uma sugestão recebida nesta sessão.'); detail.questionPreviousStatus = q.status; q.status = 'selected'; payload = { ...payload, id: requestId };
      }
      d.state = applyCommand(d.state, action, payload, this.now(), { votes: d.votes.filter((v) => v.sessionId === d.state.sessionId) });
    }
    if (action === 'reset_event') d.questions.push(...seedQuestions(d.state.sessionId));
    d.actions.push({ id: requestId, action, previous: prev, payload, detail, sessionId: prev.sessionId }); d.version++;
    this.demoWrite(d); return this.refresh();
  }
  async sampleVotes() {
    if (!isDemo || !this.admin) throw Error('Disponível apenas no ensaio local.');
    const d = this.demoRead(), phase = d.state.phase;
    if (!['initial_poll', 'final_poll'].includes(phase)) throw Error('Abre uma votação para gerar votos de ensaio.');
    const initial = [...Array(15).fill('favor'), ...Array(2).fill('neutral'), ...Array(5).fill('contra')];
    const final = [...Array(12).fill('favor'), 'neutral', ...Array(9).fill('contra')];
    for (let i = 0; i < 22; i++) { let v = d.votes.find((v) => v.sessionId === d.state.sessionId && v.token === `sample-${i}`); if (!v && phase === 'initial_poll') { v = { sessionId: d.state.sessionId, token: `sample-${i}`, initial: initial[i], final: null }; d.votes.push(v); } if (v && phase === 'final_poll') v.final = final[i]; }
    this.demoWrite(d); return this.refresh();
  }
}
