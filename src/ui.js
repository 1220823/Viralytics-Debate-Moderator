import { currentRound, remaining, formatTime, CHOICES, TITLE, roundLabel } from './core.js';
import { isDemo } from './backend.js';
export function esc(value = '') { return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
export const bolt = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m13 2-9 12h7l-1 8 10-13h-7l0-7Z" fill="currentColor"/></svg>';
export function toast(message, error = false) { const el = document.querySelector('#toast'); el.textContent = message; el.classList.toggle('error', error); el.classList.add('visible'); clearTimeout(toast.id); toast.id = setTimeout(() => el.classList.remove('visible'), 5000); }
export function connection(backend) { return `<span class="connection ${esc(backend.connection)}"><i></i>${isDemo ? 'Ensaio local' : backend.connection === 'online' ? 'Ligado ao debate' : backend.connection === 'offline' ? 'Sem ligação · estado pode estar desatualizado' : 'A ligar…'}</span>`; }
export function header(backend, moderator = false) {
  return `<header class="site-header"><a class="brand" href="./index.html"><img src="./assets/icon.svg" alt="" width="36" height="36"><span>SUPERINTELIGÊNCIA<small>${moderator ? 'PAINEL DE MODERAÇÃO' : 'O FUTURO EM DISCUSSÃO'}</small></span></a><div class="header-actions">${connection(backend)}<button class="button quiet compact" id="fullscreen" type="button" aria-label="Entrar em ecrã inteiro">Ecrã inteiro</button></div></header>${isDemo ? '<div class="demo-banner">Ensaio local: dados partilhados apenas entre separadores deste navegador. Para o evento, configura o Supabase.</div>' : ''}`;
}
export function timerCards(s, controls = false) {
  const r = currentRound(s);
  return `<div class="timer-grid">${['a', 'b'].map((k) => `<section class="timer-card team-${k}" data-team="${k}"><div class="timer-head"><div><span class="team-kicker">EQUIPA ${k.toUpperCase()} · ${esc(s.teams[k].stance)}</span><h2>${esc(s.teams[k].label)}</h2></div><span class="timer-status" data-status="${k}">Em pausa</span></div><div class="clock" data-clock="${k}" role="timer" aria-label="Tempo ${esc(s.teams[k].label)}">${formatTime(s.timers[k].remainingMs)}</div><div class="timer-progress" aria-hidden="true"><i data-progress="${k}" style="width:100%"></i></div><div class="timer-foot"><span>${s.speakers[k] ? esc(s.speakers[k]) : 'Tempo disponível nesta ronda'}</span><span>${esc(formatTime(r.durationMs))}</span></div>${controls ? `<div class="clock-controls"><button class="button primary" data-action="start" data-team="${k}">Retomar</button><button class="button secondary" data-action="pause" data-team="${k}">Pausar</button><button class="button secondary" data-action="adjust" data-team="${k}" data-seconds="30">+30 s</button><button class="button secondary" data-action="adjust" data-team="${k}" data-seconds="-30">−30 s</button><button class="button secondary" data-action="edit-time" data-team="${k}">Definir tempo</button>${r.kind === 'initial' ? `<button class="button danger" data-action="penalty" data-team="${k}">Interrupção: −${Math.min(s.penalties[k] + 1, 3) * 30} s</button>` : ''}</div>` : ''}</section>`).join('')}</div>`;
}
export function debateView(s, controls = false) {
  const r = currentRound(s), lightning = ['lightning', 'extra'].includes(r.kind);
  return `<section class="question-card ${lightning ? 'lightning' : ''}"><div class="question-top"><span class="eyebrow">${lightning ? bolt : ''}${esc(roundLabel(s))}</span><span class="first-team">${esc(s.teams[r.first].label)} começa</span></div><h1>${esc(r.title)}</h1>${r.kind === 'closing' ? '<p>Dois minutos e meio para a mensagem final de cada equipa.</p>' : ''}</section>${timerCards(s, controls)}`;
}
export function charts(result) {
  if (!result?.paired) return '<section class="empty-state"><span class="eyebrow">RESULTADOS</span><h1>Sem respostas completas para comparar.</h1><p>É necessário votar no início e no fim, no mesmo navegador.</p></section>';
  const max = Math.max(1, ...Object.values(result.before), ...Object.values(result.after));
  return `<section class="results-intro"><span class="eyebrow">ANTES & DEPOIS</span><h1>O debate mudou opiniões?</h1><p>Comparação de <strong>${result.paired} espectadores</strong> que votaram no início e no fim.</p><small>Votos recebidos: ${result.totalInitial} no início · ${result.totalFinal} no fim. A comparação usa apenas pares completos.</small></section><div class="charts-grid">${[['before', 'Antes do debate'], ['after', 'Depois do debate']].map(([key, label]) => `<figure class="chart-card"><figcaption>${label}</figcaption><div class="chart-scale">${max} votos</div><div class="bars">${Object.entries(CHOICES).map(([choice, text]) => `<div class="bar-column"><div class="bar-space"><div class="bar ${choice}" style="height:${result[key][choice] / max * 100}%"><span>${result[key][choice]}</span></div></div><strong>${esc(text)}</strong></div>`).join('')}</div><div class="chart-zero">0</div><p class="sr-only">${Object.entries(CHOICES).map(([c, label]) => `${label}: ${result[key][c]} votos`).join('; ')}</p></figure>`).join('')}</div>`;
}
export function winner(result) {
  const text = result.winner === 'tie' ? 'Empate' : CHOICES[result.winner];
  const gain = (n) => `${n > 0 ? '+' : ''}${n} ${Math.abs(n) === 1 ? 'voto' : 'votos'}`;
  return `<div class="winner-orbit" aria-hidden="true"></div><span class="eyebrow">${result.winner === 'tie' ? 'O RESULTADO É…' : 'A EQUIPA VENCEDORA É…'}</span><h1 class="winner-name ${esc(result.winner)}">${esc(text)}</h1><p>${result.winner === 'tie' ? 'Ganhos iguais ou nenhuma equipa ganhou votos.' : 'A equipa com o maior ganho líquido positivo de votos.'}</p><div class="gains"><span>A favor <strong>${gain(result.gains.favor)}</strong></span><span>Contra <strong>${gain(result.gains.contra)}</strong></span></div><small>Base: ${result.paired} espectadores com as duas respostas completas.</small>`;
}
export class Sound {
  constructor() { this.enabled = false; this.previous = new Map(); this.played = new Set(); }
  async toggle() {
    if (this.enabled) { this.enabled = false; return; }
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw Error('Este navegador não suporta os avisos sonoros.');
    this.audio ||= new Audio(); await this.audio.resume();
    if (this.audio.state !== 'running') throw Error('O navegador bloqueou o som. Tenta ativá-lo novamente.');
    this.enabled = true; this.beep(1);
  }
  beep(count = 1) {
    if (!this.enabled || this.audio?.state !== 'running') return;
    for (let i = 0; i < count; i++) { const at = this.audio.currentTime + i * 0.22; const o = this.audio.createOscillator(), g = this.audio.createGain(); o.type = 'sine'; o.frequency.value = count > 1 ? 740 : 560; g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.09, at + 0.015); g.gain.exponentialRampToValueAtTime(0.001, at + 0.16); o.connect(g); g.connect(this.audio.destination); o.start(at); o.stop(at + 0.18); }
  }
  tick(s, now) {
    const r = currentRound(s), thresholds = window.DEBATE_CONFIG?.soundWarnings || [30, 10, 0]; let crossed = null;
    for (const k of ['a', 'b']) {
      const t = s.timers[k], key = `${s.sessionId}/${r.id}/${k}/${t.epoch}`, sec = remaining(t, now) / 1000, previous = this.previous.get(key);
      if (s.phase === 'debate' && ['initial', 'closing'].includes(r.kind) && t.endsAt !== null && previous !== undefined) for (const threshold of thresholds) { const id = `${key}/${threshold}`; if (previous > threshold && sec <= threshold && !this.played.has(id)) { this.played.add(id); crossed = crossed === null ? threshold : Math.min(crossed, threshold); } }
      this.previous.set(key, sec);
    }
    if (crossed !== null) this.beep(crossed === 0 ? 3 : crossed === 10 ? 2 : 1);
  }
}
export function tickClocks(s, backend, sound) {
  if (!s) return;
  const now = backend.now(), r = currentRound(s);
  for (const k of ['a', 'b']) {
    const t = s.timers[k], ms = remaining(t, now), clock = document.querySelector(`[data-clock="${k}"]`);
    if (!clock) continue;
    clock.textContent = formatTime(ms);
    const card = clock.closest('.timer-card'); card.classList.toggle('running', t.endsAt !== null); card.classList.toggle('low-time', ms <= 10000); card.classList.toggle('overtime', ms < 0);
    document.querySelector(`[data-status="${k}"]`).textContent = ms <= 0 ? 'Tempo esgotado' : t.endsAt !== null ? 'Em contagem' : 'Em pausa';
    document.querySelector(`[data-progress="${k}"]`).style.width = `${Math.max(0, Math.min(100, ms / r.durationMs * 100))}%`;
  }
  sound?.tick(s, now);
}
export function bindHeader(backend, sound) {
  const button = document.querySelector('#sound-toggle');
  if (button && sound) { button.textContent = sound.enabled ? 'Som ligado' : 'Ativar som'; button.classList.toggle('active', sound.enabled); button.onclick = async () => { try { await sound.toggle(); button.textContent = sound.enabled ? 'Som ligado' : 'Ativar som'; button.classList.toggle('active', sound.enabled); } catch (e) { toast(e.message, true); } }; }
  document.querySelector('#fullscreen')?.addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { toast('O ecrã inteiro não está disponível neste navegador.', true); } });
}
export function fatal(error) { document.querySelector('#app').innerHTML = `<main class="auth-shell"><section class="auth-card"><span class="eyebrow">NÃO FOI POSSÍVEL LIGAR</span><h1>Vamos verificar a ligação.</h1><p>${esc(error.message)}</p><button class="button primary" onclick="location.reload()">Tentar novamente</button></section></main>`; }
export { TITLE };
