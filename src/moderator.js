import { sortQuestions } from './seeds.js';
import { Backend, isDemo } from './backend.js';
import { currentRound, remaining, usedSpeakers, formatTime, TITLE, CHOICES } from './core.js';
import { esc, header, debateView, charts, winner, tickClocks, bindHeader, toast, fatal } from './ui.js';

const app = document.querySelector('#app'), dialog = document.querySelector('#moderator-dialog');
let backend, data, busy = false, filter = 'all', lastRender = '';
try { backend = new Backend(); } catch (e) { fatal(e); }
const phaseNames = { initial_poll: 'Inquérito inicial', debate: 'Debate em curso', final_poll: 'Inquérito final', final_wait: 'Votação encerrada', results: 'Resultados no ecrã', reveal: 'Revelação do vencedor' };
function qrControl(s) {
  const automatic = s.phase === 'initial_poll', visible = automatic || Boolean(s.qrVisible);
  const label = automatic ? 'QR code automático antes do debate' : visible ? 'Ocultar QR code na apresentação' : 'Mostrar QR code na apresentação';
  return `<button class="button secondary qr-control ${visible ? 'active' : ''}" data-action="toggle_qr" type="button" aria-label="${label}" title="${label}" aria-pressed="${visible}" ${automatic ? 'disabled' : ''}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3z" stroke="currentColor" stroke-width="1.8"/><path d="M15 15h3v3h3v3h-6v-3h-3v-3h3Zm6-3v3M12 3v3M3 12h3M12 9v3h3M9 12h3v3" stroke="currentColor" stroke-width="1.8"/></svg></button>`;
}
function canExtra() { return data?.state.phase === 'debate' && data.state.roundIndex === data.state.rounds.length - 2 && ['lightning', 'extra'].includes(currentRound(data.state).kind); }
function modal(title, content, bind) {
  dialog.innerHTML = `<div class="dialog-header"><h2 id="dialog-title">${esc(title)}</h2><button class="icon-button close-dialog" aria-label="Fechar">×</button></div>${content}`;
  dialog.setAttribute('aria-labelledby', 'dialog-title'); dialog.querySelectorAll('.close-dialog').forEach((b) => b.onclick = () => { if (!busy) dialog.close(); });
  dialog.oncancel = (e) => { if (busy) e.preventDefault(); };
  bind?.(); if (!dialog.open) dialog.showModal();
}
async function run(action, payload = {}) {
  if (busy) return false; busy = true;
  app.querySelectorAll('button').forEach((b) => b.disabled = true);
  dialog.querySelectorAll('button').forEach((b) => b.disabled = true);
  try { await backend.command(action, payload); return true; }
  catch (e) { toast(e.message, true); return false; }
  finally { busy = false; dialog.querySelectorAll('button').forEach((b) => b.disabled = false); render(true); }
}
function confirmAction(title, text, action, payload = {}) {
  modal(title, `<p>${esc(text)}</p><div class="dialog-actions"><button class="button secondary close-dialog">Cancelar</button><button class="button primary" id="confirm-action">Confirmar</button></div>`, () => { dialog.querySelector('#confirm-action').onclick = async () => { if (await run(action, payload)) dialog.close(); }; });
}
function renderLogin() {
  app.innerHTML = `${header(backend, true)}<main class="auth-shell"><section class="auth-card"><span class="eyebrow">BASTIDORES DO DEBATE</span><h1>A palavra está nas tuas mãos.</h1><p>${isDemo ? 'Entra no ensaio para testar os relógios, as perguntas e os resultados. Este modo local não usa uma palavra-passe e não deve ser usado como painel público do evento.' : 'Inicia sessão com uma conta autorizada pela organização.'}</p>${isDemo ? '<button class="button primary" id="demo-login">Entrar no ensaio local →</button>' : '<form id="login-form"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required><label for="password">Palavra-passe</label><input id="password" name="password" type="password" autocomplete="current-password" required><button class="button primary" type="submit">Entrar na moderação →</button></form>'}<a class="text-link" href="./index.html">← Voltar à página pública</a></section></main>`;
  bindHeader(backend);
  const submit = async (email = '', password = '') => { const b = document.querySelector('#demo-login, #login-form button'); if (b.disabled) return; b.disabled = true; try { await backend.login(email, password); render(true); } catch (e) { toast(e.message, true); b.disabled = false; } };
  document.querySelector('#demo-login')?.addEventListener('click', () => submit());
  document.querySelector('#login-form')?.addEventListener('submit', (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); submit(f.get('email'), f.get('password')); });
}
function tally() {
  const stats = data.stats || { initial: 0, final: 0, paired: 0 };
  if (data.state.phase === 'initial_poll') return `<div class="tally-grid initial-tally"><div class="tally"><span>Participação no inquérito inicial</span><strong data-count="initial">${stats.initial}</strong><small>Votos recebidos · quando estiverem prontos, começa o debate</small></div></div>`;
  return `<div class="tally-grid"><div class="tally"><span>Votos iniciais</span><strong data-count="initial">${stats.initial}</strong><small>Já votaram no início</small></div><div class="tally"><span>Votos finais</span><strong data-count="final">${stats.final}</strong><small>Já votaram no fim</small></div><div class="tally"><span>Respostas completas</span><strong data-count="paired">${stats.paired}</strong><small>Base para comparar opiniões</small></div></div>`;
}
function phasePanel() {
  const s = data.state;
  if (s.phase === 'initial_poll') return `<section class="stage-panel initial-stage-panel"><div><span class="eyebrow">INQUÉRITO INICIAL</span><h1>${esc(TITLE)}</h1><p>Qual é a tua posição?</p><div class="projection-options">${Object.entries(CHOICES).map(([k,v]) => `<span class="${k}">${v}</span>`).join('')}</div><p>O público está a votar. Quem já respondeu aguarda pelo início.</p></div><button class="button primary" data-action="start_debate">Começar debate →</button></section>`;
  const actions = {
    initial_poll: ['O público está a votar. Quem já respondeu aguarda pelo início.', 'Começar debate →', 'start_debate'],
    final_poll: ['Quem votou no início pode responder novamente. Fecha a votação quando estiverem prontos.', 'Fechar votação final', 'close_final'],
    final_wait: ['Os resultados estão fixos. Mostra os gráficos quando quiseres.', 'Mostrar resultados →', 'show_results'],
    results: ['Os gráficos estão visíveis. O próximo passo inicia três segundos de suspense.', 'Revelar vencedor ✳', 'reveal'],
  };
  const info = actions[s.phase];
  return `<section class="stage-panel"><div><span class="eyebrow">${esc(phaseNames[s.phase])}</span><h1>${s.phase === 'initial_poll' ? 'O debate está prestes a começar.' : s.phase === 'final_poll' ? 'Como mudou a opinião do público?' : s.phase === 'reveal' ? 'O resultado está no ecrã público.' : 'A próxima fase começa contigo.'}</h1><p>${esc(info?.[0] || 'Podes acompanhar o resultado ou preparar um novo evento.')}</p></div>${info ? `<button class="button primary" data-action="${info[2]}" ${info[2] === 'reveal' && !s.result?.paired ? 'disabled' : ''}>${info[1]}</button>` : ''}</section>${s.result ? charts(s.result) : ''}${s.phase === 'reveal' && s.result?.paired ? `<section class="winner-preview">${winner(s.result)}</section>` : ''}`;
}
function navigation() {
  const s = data.state, r = currentRound(s);
  return `<section class="moderator-tools"><div class="navigation"><button class="button secondary" data-action="previous" ${s.roundIndex === 0 ? 'disabled' : ''}>← Anterior</button><label class="sr-only" for="round-select">Pergunta atual</label><select id="round-select">${s.rounds.map((r, i) => `<option value="${i}" ${i === s.roundIndex ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select><button class="button primary" data-action="${r.kind === 'closing' ? 'open_final' : 'next'}">${r.kind === 'closing' ? 'Abrir votação final →' : canExtra() ? 'Closing statements →' : 'Próxima →'}</button></div><div class="global-controls"><button class="button primary timer-toggle" data-action="toggle_all">${['a','b'].some(k=>s.timers[k].endsAt!==null) ? 'Parar ambos' : 'Retomar ambos'}</button><button class="button secondary" data-action="reset_round">Reiniciar pergunta</button><button class="button secondary" data-action="undo">Desfazer última ação</button></div>${canExtra() ? '<div class="extra-callout"><div><strong>Mais uma perspetiva do público?</strong><p>Podes fazer zero, uma ou várias extras, com 30 segundos por equipa.</p></div><button class="button primary" data-action="extra">⚡ Adicionar pergunta do público</button></div>' : ''}<div class="speaker-grid">${['a', 'b'].map((k) => `<label>Quem responde · ${esc(s.teams[k].label)}<select data-speaker-team="${k}"><option value="">Selecionar participante</option>${s.teams[k].members.map((name) => `<option value="${esc(name)}" ${s.speakers[k] === name ? 'selected' : ''}>${esc(name)}${usedSpeakers(s, k).includes(name) ? ' · já respondeu' : ''}</option>`).join('')}</select></label>`).join('')}</div></section>`;
}
function questionPool() {
  const qs = sortQuestions(data.questions || []).filter((q) => filter === 'all' || q.status === filter);
  const status = { new: 'Nova', selected: 'Selecionada', debated: 'Debatida', discarded: 'Descartada' };
  return `<section class="question-pool"><div class="section-title"><div><span class="eyebrow">A VOZ DO PÚBLICO</span><h2>Sugestões recebidas <span class="count-pill">${(data.questions || []).length}</span></h2></div><label><span class="sr-only">Filtrar perguntas</span><select id="question-filter">${[['all','Todas'],...Object.entries(status)].map(([v,l])=>`<option value="${v}" ${filter===v?'selected':''}>${l}</option>`).join('')}</select></label></div><div class="questions-list">${qs.length ? qs.map((q) => `<article class="audience-question"><div><span class="question-status ${esc(q.status)}">${status[q.status]}</span><p>${esc(q.text)}</p><div class="question-score"><strong>${q.score > 0 ? '+' : ''}${q.score || 0} pontos</strong><span>Gostos: ${q.likes || 0} · Não gostos: ${q.dislikes || 0}${q.origin === 'moderation' ? ' · Sugestão da organização' : ''}</span></div><small>${new Date(q.createdAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</small></div><div class="question-actions"><button class="button secondary compact" data-action="extra" data-id="${esc(q.id)}" ${!canExtra() ? 'disabled title="Disponível no fim das perguntas relâmpago"' : ''}>Usar como extra</button><button class="button quiet compact" data-action="question_status" data-id="${esc(q.id)}" data-status="debated">Marcar debatida</button><button class="button quiet compact" data-action="question_status" data-id="${esc(q.id)}" data-status="${q.status === 'discarded' ? 'new' : 'discarded'}">${q.status === 'discarded' ? 'Restaurar' : 'Descartar'}</button></div></article>`).join('') : '<div class="empty-questions">Ainda não há perguntas neste filtro. As sugestões do público aparecem aqui.</div>'}</div></section>`;
}
function render(force = false) {
  if (!backend.admin) { if (force || lastRender !== 'login') { lastRender = 'login'; renderLogin(); } return; }
  if (!data?.stats) return;
  const key = `${data.version}|${backend.connection}|${JSON.stringify(data.questions)}|${filter}|${busy}`;
  // Contagens atualizam sem reconstruir a interface ou interromper uma seleção.
  if (!force && key === lastRender) { for (const k of ['initial','final','paired']) { const el = app.querySelector(`[data-count="${k}"]`); if (el) el.textContent = data.stats[k]; } return; }
  lastRender = key;
  const s = data.state;
  app.innerHTML = `${header(backend, true)}<main class="moderator-main"><div class="moderator-top"><div><span class="eyebrow">CONTROLO DO EVENTO</span><p>${esc(phaseNames[s.phase])}</p></div><div><a class="button secondary compact" href="./index.html?projecao=1" target="_blank" rel="noopener">Abrir projeção ↗</a>${qrControl(s)}<button class="button secondary compact" data-action="configure">Participantes</button><button class="button quiet compact" id="logout">Sair</button></div></div>${tally()}${isDemo && ['initial_poll','final_poll'].includes(s.phase) ? '<div class="demo-tools"><span>Para ensaiar o exemplo completo:</span><button class="button secondary compact" id="sample-votes">Gerar 22 votos de teste</button></div>' : ''}${s.phase === 'debate' ? `${debateView(s,true)}${navigation()}` : phasePanel()}${questionPool()}<div class="moderator-bottom"><p>As sanções de perda de resposta são indicadas pela moderação.</p><button class="button danger compact" data-action="reset_event">Preparar novo debate</button></div></main>`;
  bindHeader(backend); tickClocks(s,backend);
  document.querySelector('#logout').onclick = async () => { await backend.logout(); lastRender = ''; render(true); };
  document.querySelector('#sample-votes')?.addEventListener('click',async()=>{ try { await backend.sampleVotes(); toast('Votos de ensaio registados.'); render(true); } catch(e){toast(e.message,true);} });
  if(busy) app.querySelectorAll('button').forEach((b)=>b.disabled=true);
}
function extraDialog(id) {
  const qs=sortQuestions(data.questions||[]).filter((q)=>q.status!=='discarded');
  if(!qs.length){modal('Pergunta extra do público','<p>Ainda não há sugestões disponíveis. Podes aguardar por perguntas ou avançar para os closing statements.</p><div class="dialog-actions"><button class="button secondary close-dialog">Fechar</button></div>');return;}
  const chosen=qs.find((q)=>q.id===id)||qs[0];
  modal('Adicionar pergunta relâmpago',`<p>30 segundos por equipa. Podes acrescentar outra pergunta depois desta.</p><form id="extra-form"><label for="extra-source">Sugestão · ordenada por pontuação</label><select id="extra-source" name="source">${qs.map(q=>`<option value="${esc(q.id)}" ${q.id===chosen.id?'selected':''}>${q.score > 0 ? '+' : ''}${q.score || 0} pontos · ${esc(q.text.slice(0,100))}${q.status==='debated'?' · já debatida':''}</option>`).join('')}</select><label for="extra-text">Pergunta a apresentar</label><textarea id="extra-text" name="text" rows="5" maxlength="500" required>${esc(chosen.text)}</textarea><div class="dialog-actions"><button class="button secondary close-dialog" type="button">Cancelar</button><button class="button primary" type="submit">Confirmar pergunta extra</button></div></form>`,()=>{
    dialog.querySelector('#extra-source').onchange=(e)=>{dialog.querySelector('#extra-text').value=qs.find(q=>q.id===e.target.value).text;};
    dialog.querySelector('#extra-form').onsubmit=async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);if(await run('add_extra',{sourceId:f.get('source'),text:f.get('text').trim()}))dialog.close();};
  });
}
function configureDialog(){
  const s=data.state;
  const first=s.rounds.find(r=>r.kind==='lightning').first,closing=s.rounds.find(r=>r.kind==='closing').first;
  modal('Participantes e ordem das equipas',`<p>Um nome por linha, pelo menos cinco por equipa.</p><form id="members-form"><div class="speaker-grid">${['a','b'].map(k=>`<label>${esc(s.teams[k].label)}<textarea name="${k}" rows="7" maxlength="1830" required>${esc(s.teams[k].members.join('\n'))}</textarea></label>`).join('')}</div><div class="speaker-grid"><label>Quem começa a primeira relâmpago<select name="lightningFirst">${['a','b'].map(k=>`<option value="${k}" ${first===k?'selected':''}>${esc(s.teams[k].label)}</option>`).join('')}</select></label><label>Quem começa o closing statement<select name="closingFirst">${['a','b'].map(k=>`<option value="${k}" ${closing===k?'selected':''}>${esc(s.teams[k].label)}</option>`).join('')}</select></label></div><div class="dialog-actions"><button class="button secondary close-dialog" type="button">Cancelar</button><button class="button primary" type="submit">Guardar configuração</button></div></form>`,()=>{dialog.querySelector('#members-form').onsubmit=async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);const p={lightningFirst:f.get('lightningFirst'),closingFirst:f.get('closingFirst')};for(const k of ['a','b'])p[k]=f.get(k).split('\n').map(x=>x.trim()).filter(Boolean);if(await run('configure',p))dialog.close();};});
}
function editTime(team){
  const sec=Math.max(0,Math.ceil(remaining(data.state.timers[team],backend.now())/1000));
  modal(`Definir tempo · ${data.state.teams[team].label}`,`<form id="time-form"><div class="time-fields"><label>Minutos<input name="minutes" type="number" min="0" max="60" step="1" required value="${Math.floor(sec/60)}"></label><label>Segundos<input name="seconds" type="number" min="0" max="59" step="1" required value="${sec%60}"></label></div><p>O estado de pausa ou contagem será mantido.</p><div class="dialog-actions"><button class="button secondary close-dialog" type="button">Cancelar</button><button class="button primary" type="submit">Aplicar tempo</button></div></form>`,()=>{dialog.querySelector('#time-form').onsubmit=async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);if(await run('set_time',{team,seconds:Number(f.get('minutes'))*60+Number(f.get('seconds'))}))dialog.close();};});
}
app.addEventListener('click',async(e)=>{
  const b=e.target.closest('[data-action]');if(!b||b.disabled||busy||!backend.admin)return;
  const action=b.dataset.action, p={};if(b.dataset.team)p.team=b.dataset.team;if(b.dataset.seconds)p.seconds=Number(b.dataset.seconds);
  if(action==='extra')return extraDialog(b.dataset.id);
  if(action==='configure')return configureDialog();
  if(action==='edit-time')return editTime(p.team);
  if(action==='question_status')return run(action,{id:b.dataset.id,status:b.dataset.status});
  if(action==='reset_round')return confirmAction('Reiniciar esta pergunta?','Os dois tempos, participantes e penalizações desta pergunta serão repostos.',action);
  if(action==='reset_event')return confirmAction('Preparar um novo debate?','Uma nova votação inicial será aberta. O evento anterior fica guardado e deixa de ser o evento ativo.',action);
  if(action==='start_debate')return confirmAction('Começar o debate?','A votação inicial será encerrada e a primeira pergunta aparecerá com os relógios em pausa.',action);
  if(action==='open_final')return confirmAction('Abrir a votação final?','Os relógios serão pausados e o público poderá responder ao inquérito final.',action);
  if(action==='close_final')return confirmAction('Fechar a votação final?','Não serão aceites novos votos. A comparação será fixada com os pares completos recebidos.',action);
  await run(action,p);
});
app.addEventListener('change',async(e)=>{
  if(!backend.admin||busy)return;
  if(e.target.id==='question-filter'){filter=e.target.value;render(true);return;}
  if(e.target.id==='round-select'){await run('goto',{index:Number(e.target.value)});return;}
  const team=e.target.dataset.speakerTeam;if(!team)return;
  const name=e.target.value;
  if(currentRound(data.state).kind==='lightning'&&usedSpeakers(data.state,team).includes(name))confirmAction('Repetir participante?',`${name} já respondeu noutra pergunta relâmpago. Confirmas esta exceção?`,'set_speaker',{team,name,allowRepeat:true});
  else await run('set_speaker',{team,name});
});
if(backend){
  backend.onChange(snapshot=>{if(snapshot){data=snapshot;render();}});
  (async()=>{await backend.connect();await backend.restoreLogin();render(true);})().catch(fatal);
  setInterval(()=>{if(data&&backend.admin)tickClocks(data.state,backend);},200);
}
