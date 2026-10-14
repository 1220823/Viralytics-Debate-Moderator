import { Backend, voterToken } from './backend.js';
import { CHOICES } from './core.js';
import { sortQuestions } from './seeds.js';
import { esc, thumbIcon, debateView, charts, winner, Sound, tickClocks, bindHeader, toast, fatal, TITLE } from './ui.js';

const app = document.querySelector('#app'), dialog = document.querySelector('#question-dialog');
const projector = new URLSearchParams(location.search).get('projecao') === '1';
const qrDialog = document.querySelector('#presentation-qr-dialog');
const suggestionsDialog = document.querySelector('#suggestions-dialog');
let suggestions = [], suggestionsLoading = false, reactionBusy = false, suggestionsSession = '';
let suggestionsRevision = 0;
document.body.classList.toggle('presentation-page', projector);
// Só o computador de apresentação pode ativar e emitir avisos sonoros.
const sound = projector ? new Sound() : null;
let backend, data, token, receipt = { initial: null, final: null }, receiptKey = '', selected = '', voteBusy = false, lastRender = '';
try { token = voterToken(); backend = new Backend(); } catch (e) { fatal(e); }

function waiting(title, text, subtitle = 'A TUA OPINIÃO CONTA') {
  return `<section class="waiting"><span class="eyebrow">${esc(subtitle)}</span><h1>${esc(title)}</h1><p>${esc(text)}</p><div class="waiting-dots" aria-hidden="true"><i></i><i></i><i></i></div></section>`;
}
function presentationControls() {
  return '<div class="presentation-tools" role="group" aria-label="Controlos da apresentação"><button class="button quiet compact" id="sound-toggle" type="button">Ativar som</button><button class="button quiet compact" id="fullscreen" type="button" aria-label="Entrar em ecrã inteiro">Ecrã inteiro</button></div>';
}
function qrScreen(popup = false) {
  const url = new URL('./index.html', location.href).href;
  return `<section class="presentation-join ${popup ? 'qr-popup-content' : ''}"><span class="eyebrow">${popup ? 'PÁGINA DOS ESPECTADORES' : 'ANTES DO DEBATE'}</span><h1 id="presentation-qr-title">${popup ? 'Acompanha o debate' : 'Participa no debate'}</h1><p class="presentation-topic">${esc(TITLE)}</p><div id="projection-qr" role="img" aria-label="QR code para aceder à página dos espectadores"></div><a class="spectator-url" href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a><p class="qr-instruction">Lê o QR code com o telemóvel ou abre este endereço.</p></section>`;
}
function presentationPoll(phase) {
  const total = data.state.voteCounts?.[phase];
  const url = new URL('./index.html', location.href).href;
  return `<section class="projection-poll ${phase === 'initial' ? 'with-qr' : ''}"><div class="projection-poll-question"><span class="eyebrow">${phase === 'initial' ? 'ANTES DO DEBATE · INQUÉRITO INICIAL' : 'DEPOIS DO DEBATE · INQUÉRITO FINAL'}</span><h1>${esc(TITLE)}</h1><p class="poll-subtitle">Qual é ${phase === 'final' ? 'agora ' : ''}a tua posição?</p><div class="projection-options" aria-label="Opções do inquérito">${Object.entries(CHOICES).map(([k, v]) => `<span class="${k}">${v}</span>`).join('')}</div><div class="poll-participation"><strong data-vote-total>${Number.isFinite(total) ? total : '—'}</strong><span data-vote-label>${total === 1 ? 'pessoa já votou' : 'pessoas já votaram'}</span></div><p class="poll-note">${phase === 'initial' ? 'Participa na página dos espectadores. O debate começa quando a moderação avançar.' : 'Responde na página dos espectadores, no mesmo navegador que usaste no início.'}</p></div>${phase === 'initial' ? `<div class="projection-poll-access"><div id="projection-qr" role="img" aria-label="QR code para aceder à página dos espectadores"></div><a class="spectator-url" href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a><p class="qr-instruction">Lê o QR code com o telemóvel para votar.</p></div>` : ''}</section>`;
}
function initialWaiting() {
  return `<section class="waiting audience-waiting"><span class="eyebrow">VOTO INICIAL REGISTADO</span><h1>O debate está prestes a começar</h1><p>O teu voto foi registado. A moderação dará início ao debate.</p><div class="audience-invitation"><h2>A tua participação continua aqui.</h2><p>Ao longo do debate, poderás sugerir perguntas, consultar as ideias do público e votar nas que gostarias de ver debatidas. A moderação irá acompanhar as sugestões.</p><button class="button primary" id="ask-question" type="button">Ver sugestões ou enviar uma pergunta</button></div></section>`;
}
function poll(phase) {
  const s = data.state;
  if (projector) return presentationPoll(phase);
  if (phase === 'initial' && receipt.initial) return initialWaiting();
  if (phase === 'final' && receipt.final) return waiting('Obrigado pelo teu voto.', 'Os resultados serão apresentados em breve.', 'VOTO FINAL REGISTADO');
  if (phase === 'final' && !receipt.initial) return waiting('A votação final está a decorrer.', 'A comparação inclui quem votou no início e no fim, no mesmo navegador. Já podes aguardar pelos resultados.', 'O DEBATE TERMINOU');
  return `<section class="poll-intro"><span class="eyebrow">${phase === 'initial' ? 'ANTES DO DEBATE' : 'DEPOIS DO DEBATE'} · A TUA OPINIÃO CONTA</span><h1>${esc(TITLE)}</h1><p class="poll-subtitle">Qual é a tua posição?</p><form id="vote-form"><fieldset class="vote-options"><legend class="sr-only">Escolhe a tua posição</legend>${Object.entries(CHOICES).map(([k, label]) => `<label class="vote-option ${k}"><input type="radio" name="choice" value="${k}" ${selected === k ? 'checked' : ''} required><strong>${label}</strong><span class="option-description">${k === 'favor' ? 'Vejo uma oportunidade de progresso.' : k === 'neutral' ? 'Ainda estou a formar a minha opinião.' : 'Vejo uma ameaça para a humanidade.'}</span><span class="radio-indicator" aria-hidden="true"></span></label>`).join('')}</fieldset><button class="button primary vote-submit" type="submit" ${voteBusy ? 'disabled' : ''}>${voteBusy ? 'A registar…' : 'Registar o meu voto →'}</button></form><p class="poll-note">Um voto por fase neste navegador. Usa-o também na votação final.</p></section>`;
}
function render(force = false) {
  if (!data) return;
  const s = data.state, revealDone = s.phase === 'reveal' && backend.now() >= s.revealAt;
  const count = s.voteCounts?.[s.phase === 'initial_poll' ? 'initial' : 'final'];
  const countElement = document.querySelector('[data-vote-total]');
  if (countElement) countElement.textContent = Number.isFinite(count) ? count : '—';
  const countLabel = document.querySelector('[data-vote-label]');
  if (countLabel) countLabel.textContent = count === 1 ? 'pessoa já votou' : 'pessoas já votaram';
  const key = `${data.version}|${s.sessionId}|${backend.connection}|${receiptKey}|${receipt.initial}|${receipt.final}|${voteBusy}|${revealDone}`;
  if (!force && key === lastRender) return;
  lastRender = key;
  let main;
  if (receiptKey !== `${s.sessionId}/${s.phase}` && ['initial_poll', 'final_poll'].includes(s.phase) && !projector) main = waiting('A preparar o inquérito…', 'A verificar o teu voto neste navegador.');
  else if (s.phase === 'initial_poll') main = poll('initial');
  else if (s.phase === 'debate') main = debateView(s);
  else if (s.phase === 'final_poll') main = poll('final');
  else if (s.phase === 'final_wait') main = waiting('Os resultados estão quase a chegar.', 'A votação terminou. Aguarda a apresentação dos resultados.', 'VOTAÇÃO ENCERRADA');
  else if (s.phase === 'results') main = charts(s.result);
  else if (s.phase === 'reveal') main = `<section class="winner-stage ${revealDone ? 'revealed' : ''}">${revealDone ? winner(s.result) : '<span class="eyebrow">O MOMENTO DA DECISÃO</span><h1>A equipa vencedora é…</h1><div class="suspense-dots" aria-hidden="true"><i></i><i></i><i></i></div>'}</section>`;
  const popup = projector && s.phase !== 'initial_poll' && Boolean(s.qrVisible);
  const inlineQuestion = !projector && s.phase === 'initial_poll' && Boolean(receipt.initial);
  const canParticipate = !projector && receiptKey.startsWith(`${s.sessionId}/`) && Boolean(receipt.initial) && !(s.phase === 'final_poll' && !receipt.final);
  app.innerHTML = `<main class="public-main ${projector ? 'projector' : ''}">${main}</main>${projector ? (popup ? '' : presentationControls()) : canParticipate && !inlineQuestion ? '<div class="spectator-actions"><button class="button primary" id="ask-question">Perguntas do público · Sugerir / votar</button></div>' : ''}${backend.connection === 'offline' ? '<aside class="public-connection-notice" role="status">Sem ligação · o estado pode estar desatualizado</aside>' : ''}`;
  if (!canParticipate) { suggestionsDialog?.close(); if (dialog.open) dialog.close(); }
  if (qrDialog) {
    if (popup) { qrDialog.innerHTML = `${qrScreen(true)}${presentationControls()}`; if (!qrDialog.open) qrDialog.showModal(); }
    else { if (qrDialog.open) qrDialog.close(); qrDialog.innerHTML = ''; }
    // A apresentação segue o controlo remoto do moderador; Escape não o altera localmente.
    qrDialog.oncancel = (event) => event.preventDefault();
  }
  bindHeader(backend, sound); tickClocks(s, backend, sound);
  if (projector && document.querySelector('#projection-qr')) import('./qr.js').then(async ({ qrCode }) => { const svg = await qrCode(new URL('./index.html', location.href).href); const holder = document.querySelector('#projection-qr'); if (holder) holder.innerHTML = svg; }).catch(() => {});
  document.querySelectorAll('[name="choice"]').forEach((input) => input.onchange = () => { selected = input.value; });
  document.querySelector('#vote-form')?.addEventListener('submit', async (e) => {
    e.preventDefault(); if (voteBusy) return;
    selected = new FormData(e.currentTarget).get('choice'); if (!selected) return;
    const phase = s.phase === 'initial_poll' ? 'initial' : 'final', session = s.sessionId;
    voteBusy = true; render(true);
    try { const answer = await backend.vote(token, phase, selected); if (data.state.sessionId === session) receipt = answer; selected = ''; }
    catch (error) { toast(error.message, true); try { receipt = await backend.voteStatus(token); } catch {} }
    finally { voteBusy = false; render(true); }
  });
  document.querySelector('#ask-question')?.addEventListener('click', openSuggestions);
}
function renderSuggestions() {
  if (!suggestionsDialog.open) return;
  const list = suggestionsDialog.querySelector('#public-questions');
  if (!suggestions.length) { list.innerHTML = `<p>${suggestionsLoading ? 'A carregar sugestões…' : 'Ainda não há sugestões. Podes enviar a primeira.'}</p>`; return; }
  const existing = new Map([...list.querySelectorAll('[data-suggestion]')].map(el=>[el.dataset.suggestion,el]));
  // Preserve each card so changing the score does not restart the whole list.
  let position = 0;
  for (const q of sortQuestions(suggestions)) {
    let card = existing.get(q.id);
    if (!card) {
      card = document.createElement('article'); card.className = 'public-question'; card.dataset.suggestion = q.id;
      card.innerHTML = `<span class="question-points"><span class="score-number"></span><span class="sr-only"> pontos</span></span><p class="suggestion-text"></p><div class="reaction-row"><button class="reaction reaction-negative" type="button" data-reaction="-1" aria-label="Não gosto" title="Não gosto (−1)">${thumbIcon(-1)}</button><button class="reaction reaction-positive" type="button" data-reaction="1" aria-label="Gosto" title="Gosto (+1)">${thumbIcon(1)}</button></div>`;
      card.querySelectorAll('[data-reaction]').forEach(b=>b.dataset.question=q.id);
    }
    const score = card.querySelector('.score-number'), previous = score.dataset.value;
    score.textContent = `${q.score > 0 ? '+' : ''}${q.score}`;
    score.dataset.value = String(q.score);
    card.querySelector('.question-points').setAttribute('aria-label', `${q.score} pontos`);
    if (previous !== undefined && Number(previous) !== q.score && !matchMedia('(prefers-reduced-motion: reduce)').matches) score.animate([{transform:'translateY(5px)',opacity:.3},{transform:'translateY(0)',opacity:1}],{duration:260,easing:'ease-out'});
    card.querySelector('.suggestion-text').textContent = q.text;
    card.querySelectorAll('[data-reaction]').forEach(b=>{ const active = Number(b.dataset.reaction) === q.myReaction; b.classList.toggle('active',active); b.setAttribute('aria-pressed',String(active)); b.disabled = reactionBusy; });
    const next = list.children[position++];
    if (next !== card) list.insertBefore(card, next || null);
    existing.delete(q.id);
  }
  existing.forEach(card=>card.remove());
  list.querySelectorAll(':scope > p').forEach(el=>el.remove());
}
async function loadSuggestions() {
  if (suggestionsLoading || reactionBusy || !suggestionsDialog.open || !data) return;
  const session = data.state.sessionId, revision = suggestionsRevision; suggestionsLoading = true;
  try { const answer = await backend.questions(token); if (data.state.sessionId === session && suggestionsRevision === revision) { suggestions = sortQuestions(answer); suggestionsSession = session; renderSuggestions(); } }
  catch (e) { toast('Não foi possível atualizar as sugestões. ' + e.message, true); }
  finally { suggestionsLoading = false; }
}
function openSuggestions() {
  if (!receipt.initial || projector) return;
  if (suggestionsSession !== data.state.sessionId) suggestions = [];
  suggestionsDialog.innerHTML = '<div class="dialog-header"><h2 id="suggestions-title">Perguntas do público</h2><button class="icon-button close-dialog" aria-label="Fechar">×</button></div><p class="suggestions-description">Vê e avalia as ideias já recebidas antes de sugerires outra.</p><div class="suggest-new-row"><button class="button primary suggest-new" id="new-question">Enviar uma pergunta</button></div><div id="public-questions" class="public-questions"></div>';
  suggestionsDialog.querySelector('.close-dialog').onclick = () => suggestionsDialog.close();
  suggestionsDialog.querySelector('#new-question').onclick = () => { suggestionsDialog.close(); questionDialog(); };
  suggestionsDialog.showModal(); renderSuggestions(); loadSuggestions();
}
suggestionsDialog.addEventListener('click', async e => {
  const button = e.target.closest('[data-reaction]'); if (!button || button.disabled || reactionBusy) return;
  const q = suggestions.find(q => q.id === button.dataset.question); if (!q) return;
  const value = Number(button.dataset.reaction), session = data.state.sessionId;
  reactionBusy = true; suggestionsRevision++; renderSuggestions();
  try { const answer = await backend.reactQuestion(token, q.id, q.myReaction === value ? 0 : value); if (data.state.sessionId === session) suggestions = sortQuestions(answer); }
  catch (e) { toast(e.message, true); }
  finally { reactionBusy = false; renderSuggestions(); }
});
setInterval(() => { if (suggestionsDialog.open) loadSuggestions(); }, 5000);
function questionDialog() {
  let text = '', id = crypto.randomUUID(), submitting = false;
  function edit() {
    dialog.innerHTML = `<div class="dialog-header"><h2 id="question-title">Que pergunta gostarias de debater?</h2><button class="icon-button close-dialog" aria-label="Fechar">×</button></div><p>A moderação irá ler a tua sugestão antes de a apresentar.</p><form id="question-edit"><label for="question-text">A tua pergunta</label><textarea id="question-text" name="question" maxlength="500" rows="5" required placeholder="Escreve a tua pergunta…">${esc(text)}</textarea><small>Até 500 caracteres. Não incluas dados pessoais.</small><div class="dialog-actions"><button type="button" class="button secondary close-dialog">Cancelar</button><button class="button primary" type="submit">Rever pergunta →</button></div></form>`;
    dialog.querySelector('#question-edit').onsubmit = (e) => { e.preventDefault(); text = new FormData(e.currentTarget).get('question').trim(); if (text) confirm(); };
    bindClose();
  }
  function bindClose() { dialog.querySelectorAll('.close-dialog').forEach((b) => b.onclick = () => { if (!submitting) dialog.close(); }); }
  function confirm() {
    dialog.innerHTML = `<div class="dialog-header"><h2 id="question-title">Confirmar envio</h2><button class="icon-button close-dialog" aria-label="Fechar">×</button></div><p>A tua pergunta ficará visível aos espectadores e à moderação. O público poderá reagir à sugestão.</p><blockquote>${esc(text)}</blockquote><div class="dialog-actions"><button class="button secondary" id="question-back">Voltar a editar</button><button class="button secondary close-dialog">Cancelar</button><button class="button primary" id="question-send">Confirmar envio</button></div>`;
    dialog.querySelector('#question-back').onclick = edit; bindClose();
    dialog.querySelector('#question-send').onclick = async () => {
      if (submitting) return; submitting = true;
      dialog.querySelectorAll('button').forEach((b) => b.disabled = true);
      dialog.querySelector('#question-send').textContent = 'A enviar…';
      try { await backend.submitQuestion(token, text, id); dialog.close(); toast('Pergunta enviada. Obrigado pela tua participação!'); openSuggestions(); }
      catch (e) { toast(e.message, true); submitting = false; confirm(); }
      finally { submitting = false; }
    };
  }
  dialog.oncancel = (e) => { if (submitting) e.preventDefault(); };
  edit(); dialog.showModal();
}
if (backend) {
  backend.onChange(async (snapshot) => {
    if (!snapshot) return; data = snapshot;
    const key = `${data.state.sessionId}/${data.state.phase}`;
    render();
    if (receiptKey !== key) {
      const session = data.state.sessionId;
      try { const answer = await backend.voteStatus(token); if (data.state.sessionId === session && `${data.state.sessionId}/${data.state.phase}` === key) { receipt = answer; receiptKey = key; render(true); } }
      catch (e) { toast('Não foi possível verificar o voto. Tenta atualizar quando a ligação voltar.', true); }
    }
  });
  backend.connect().catch(fatal);
  setInterval(() => { if (data) { tickClocks(data.state, backend, sound); if (data.state.phase === 'reveal') render(); } }, 200);
}
