export const TITLE = 'Superinteligência: progresso ou ameaça?';
export const SUBTITLE = 'Superintelligence and the future of humanity: Science or Speculation?';
export const CHOICES = { favor: 'A favor', neutral: 'Neutro', contra: 'Contra' };
export const UNDOABLE = ['start', 'pause', 'start_all', 'pause_all', 'toggle_timer', 'toggle_all', 'toggle_dim', 'adjust', 'set_time', 'penalty', 'reset_round', 'goto', 'next', 'previous', 'add_extra', 'set_speaker', 'configure'];
export const copy = (value) => structuredClone(value);
export function timer(ms, epoch = 0) { return { remainingMs: ms, endsAt: null, epoch }; }
export function remaining(t, now) { return t.endsAt === null ? t.remainingMs : t.endsAt - now; }
export function pauseTimer(t, now) { return { ...t, remainingMs: remaining(t, now), endsAt: null }; }
export function formatTime(ms) {
  const n = Math.ceil(Math.abs(ms) / 1000);
  return `${ms < 0 ? '+' : ''}${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}
export function initialRounds() {
  return [
    { id: 'initial-1', kind: 'initial', title: 'Se uma superinteligência fosse capaz de tomar decisões melhores do que os seres humanos, deveríamos permitir-lhe tomar decisões que atualmente pertencem às pessoas?', durationMs: 300000, first: 'a', label: 'Ronda inicial · 1 de 2' },
    { id: 'initial-2', kind: 'initial', title: 'Poderemos realmente controlar uma inteligência que seja superior à nossa?', durationMs: 300000, first: 'b', label: 'Ronda inicial · 2 de 2' },
    ...[
      'Será seguro criar uma tecnologia cujas capacidades e comportamentos futuros não conseguimos prever?',
      'Poderá a superinteligência ajudar a humanidade a ultrapassar por completo limitações biológicas e cognitivas?',
      'Poderá a superinteligência ser a ferramenta mais poderosa alguma vez criada para resolver problemas da humanidade?',
    ].map((title, i) => ({ id: `lightning-${i + 1}`, kind: 'lightning', title, durationMs: 30000, first: i % 2 ? 'b' : 'a', label: `Ronda Relâmpago · ${i + 1} de 3` })),
    { id: 'closing', kind: 'closing', title: TITLE, durationMs: 150000, first: 'a', label: 'Closing statements' },
  ];
}
export function newState(now = Date.now(), sessionId = crypto.randomUUID()) {
  return { sessionId, phase: 'initial_poll', qrVisible: false, dimmed: { a: false, b: false }, roundIndex: 0, rounds: initialRounds(), timers: { a: timer(300000), b: timer(300000) }, penalties: { a: 0, b: 0 }, speakers: { a: '', b: '' }, history: {}, teams: { a: { label: 'A favor', stance: 'Progresso', members: Array.from({ length: 5 }, (_, i) => `Elemento ${i + 1}`) }, b: { label: 'Contra', stance: 'Ameaça', members: Array.from({ length: 5 }, (_, i) => `Elemento ${i + 1}`) } }, result: null, revealAt: null, createdAt: now };
}
export function currentRound(state) { return state.rounds[state.roundIndex]; }
export function roundLabel(state) { const r = currentRound(state); return `${['lightning', 'extra'].includes(r.kind) ? '⚡ ' : ''}${r.label}`; }
export function snapshot(state, now) {
  return { timers: { a: pauseTimer(state.timers.a, now), b: pauseTimer(state.timers.b, now) }, penalties: copy(state.penalties), speakers: copy(state.speakers), dimmed: copy(state.dimmed || { a: false, b: false }) };
}
export function pausedState(state, now) { const s = copy(state); s.timers = snapshot(s, now).timers; return s; }
export function usedSpeakers(state, team) {
  return state.rounds.filter((r) => r.kind === 'lightning' && r.id !== currentRound(state).id).map((r) => state.history[r.id]?.speakers[team]).filter(Boolean);
}
export function results(votes) {
  const pairs = votes.filter((v) => CHOICES[v.initial] && CHOICES[v.final]);
  const before = { favor: 0, neutral: 0, contra: 0 }, after = { ...before };
  for (const v of pairs) { before[v.initial]++; after[v.final]++; }
  const gains = { favor: after.favor - before.favor, contra: after.contra - before.contra };
  let winner = null;
  if (pairs.length) winner = gains.favor > 0 && gains.favor > gains.contra ? 'favor' : gains.contra > 0 && gains.contra > gains.favor ? 'contra' : 'tie';
  return { paired: pairs.length, before, after, gains, winner, totalInitial: votes.filter((v) => v.initial).length, totalFinal: votes.filter((v) => v.final).length };
}
function requireDebate(s) { if (s.phase !== 'debate') throw Error('Este controlo está disponível durante o debate.'); }
function number(value, min, max) { const n = Number(value); if (!Number.isFinite(n) || n < min || n > max) throw Error('Tempo inválido.'); return n; }
function teamKey(team) { if (!['a', 'b'].includes(team)) throw Error('Equipa inválida.'); return team; }
function switchRound(s, index, now) {
  if (!Number.isInteger(index) || index < 0 || index >= s.rounds.length) throw Error('Pergunta inválida.');
  s.history[currentRound(s).id] = snapshot(s, now);
  s.roundIndex = index;
  const saved = s.history[currentRound(s).id];
  Object.assign(s, saved ? copy(saved) : { timers: { a: timer(currentRound(s).durationMs), b: timer(currentRound(s).durationMs) }, penalties: { a: 0, b: 0 }, speakers: { a: '', b: '' }, dimmed: { a: false, b: false } });
}
export function applyCommand(state, action, p = {}, now = Date.now(), context = {}) {
  const s = copy(state);
  s.dimmed ||= { a: false, b: false };
  if (['toggle_timer', 'toggle_all', 'toggle_dim'].includes(action)) requireDebate(s);
  if (['start', 'pause', 'start_all', 'pause_all', 'adjust', 'set_time', 'penalty', 'reset_round', 'goto', 'next', 'previous', 'add_extra', 'set_speaker'].includes(action)) requireDebate(s);
  switch (action) {
    case 'start_debate':
      if (s.phase !== 'initial_poll') throw Error('A votação inicial já terminou.');
      s.phase = 'debate'; s.qrVisible = false; break;
    case 'toggle_qr': s.qrVisible = !s.qrVisible; break;
    case 'toggle_dim': {
      if (!['lightning', 'extra'].includes(currentRound(s).kind)) throw Error('Atenuar cartões está disponível nas rondas relâmpago.');
      const k = teamKey(p.team); s.dimmed[k] = !s.dimmed[k]; break;
    }
    case 'toggle_timer': case 'toggle_all': {
      const keys = action === 'toggle_all' ? ['a', 'b'] : [teamKey(p.team)];
      const running = keys.some(k => s.timers[k].endsAt !== null);
      for (const k of keys) s.timers[k] = running ? pauseTimer(s.timers[k], now) : { ...s.timers[k], endsAt: now + s.timers[k].remainingMs };
      break;
    }
    case 'start': case 'start_all':
      for (const k of action === 'start_all' ? ['a', 'b'] : [teamKey(p.team)]) if (s.timers[k].endsAt === null) s.timers[k].endsAt = now + s.timers[k].remainingMs;
      break;
    case 'pause': case 'pause_all':
      for (const k of action === 'pause_all' ? ['a', 'b'] : [teamKey(p.team)]) s.timers[k] = pauseTimer(s.timers[k], now);
      break;
    case 'adjust': case 'set_time': case 'penalty': {
      const k = teamKey(p.team), t = s.timers[k], wasRunning = t.endsAt !== null;
      let ms = remaining(t, now);
      if (action === 'penalty') {
        if (currentRound(s).kind !== 'initial') throw Error('A escala de interrupções aplica-se às rondas iniciais.');
        s.penalties[k]++; if (ms >= 0) ms -= Math.min(s.penalties[k], 3) * 30000;
        // Uma penalização pode esgotar o tempo, mas não cria um excedente fictício.
        if (remaining(t, now) >= 0) ms = Math.max(0, ms);
      } else if (action === 'set_time') ms = number(p.seconds, 0, 3600) * 1000;
      else ms += number(p.seconds, -3600, 3600) * 1000;
      ms = Math.max(-3600000, Math.min(3600000, ms));
      s.timers[k] = { ...t, remainingMs: ms, endsAt: wasRunning ? now + ms : null };
      break;
    }
    case 'reset_round': {
      const duration = currentRound(s).durationMs;
      s.timers = { a: timer(duration, s.timers.a.epoch + 1), b: timer(duration, s.timers.b.epoch + 1) };
      s.penalties = { a: 0, b: 0 }; s.speakers = { a: '', b: '' }; s.dimmed = { a: false, b: false }; break;
    }
    case 'goto': switchRound(s, Number(p.index), now); break;
    case 'previous': switchRound(s, s.roundIndex - 1, now); break;
    case 'next': switchRound(s, s.roundIndex + 1, now); break;
    case 'add_extra': {
      if (s.roundIndex !== s.rounds.length - 2 || !['lightning', 'extra'].includes(currentRound(s).kind)) throw Error('Avança para a última pergunta relâmpago antes de adicionar outra.');
      const text = String(p.text || '').trim();
      if (!text || text.length > 500) throw Error('Escolhe uma pergunta com até 500 caracteres.');
      const n = s.rounds.filter((r) => r.kind === 'extra').length + 1;
      const r = { id: p.id || crypto.randomUUID(), kind: 'extra', title: text, durationMs: 30000, first: currentRound(s).first === 'a' ? 'b' : 'a', label: `Pergunta extra do público · ${n}`, sourceId: p.sourceId || null };
      s.rounds.splice(s.roundIndex + 1, 0, r); switchRound(s, s.roundIndex + 1, now); break;
    }
    case 'set_speaker': {
      const k = teamKey(p.team), name = String(p.name || '');
      if (name && !s.teams[k].members.includes(name)) throw Error('Participante inválido.');
      if (currentRound(s).kind === 'lightning' && usedSpeakers(s, k).includes(name) && !p.allowRepeat) throw Error('Este participante já respondeu. Confirma a repetição.');
      s.speakers[k] = name; break;
    }
    case 'configure':
      for (const k of ['a', 'b']) { const members = p[k]; if (!Array.isArray(members) || members.length < 5 || members.length > 30 || members.some((x) => typeof x !== 'string' || !x.trim() || x.length > 60) || new Set(members.map(x => x.trim())).size !== members.length) throw Error('Indica entre 5 e 30 nomes distintos por equipa.'); s.teams[k].members = members.map((x) => x.trim()); }
      { const first = p.lightningFirst || s.rounds.find(r => r.kind === 'lightning').first, closing = p.closingFirst || s.rounds.find(r => r.kind === 'closing').first; teamKey(first); teamKey(closing); let i = 0; for (const r of s.rounds) { if (['lightning', 'extra'].includes(r.kind)) { r.first = i++ % 2 ? (first === 'a' ? 'b' : 'a') : first; } else if (r.kind === 'closing') r.first = closing; } }
      break;
    case 'open_final':
      if (s.phase !== 'debate' || currentRound(s).kind !== 'closing') throw Error('Termina as rondas e avança para os closing statements.');
      s.timers = snapshot(s, now).timers; s.phase = 'final_poll'; break;
    case 'close_final':
      if (s.phase !== 'final_poll') throw Error('A votação final não está aberta.');
      s.result = results(context.votes || []); s.phase = 'final_wait'; break;
    case 'show_results':
      if (s.phase !== 'final_wait') throw Error('Fecha a votação final antes de apresentar os resultados.');
      s.phase = 'results'; break;
    case 'reveal':
      if (s.phase !== 'results' || !s.result?.paired) throw Error('São necessárias respostas completas para revelar um vencedor.');
      s.phase = 'reveal'; s.revealAt = now + 3000; break;
    case 'reset_event': { const fresh = newState(now, p.sessionId || crypto.randomUUID()); fresh.teams = copy(s.teams); return fresh; }
    default: throw Error('Ação desconhecida.');
  }
  return s;
}
