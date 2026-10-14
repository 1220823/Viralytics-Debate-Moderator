import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, applyCommand, remaining, results, formatTime, currentRound } from '../src/core.js';
import { validateConfig } from '../src/config.js';
const initial = () => applyCommand(newState(0), 'start_debate', {}, 0);

test('três relâmpago fixas e controlo visual separado do relógio',()=>{
  assert.equal(newState().rounds.filter(r=>r.kind==='lightning').length,3);
  let s=applyCommand(initial(),'toggle_timer',{team:'a'},1000);
  assert.equal(s.timers.a.endsAt,301000);assert.equal(s.timers.b.endsAt,null);
  s=applyCommand(s,'toggle_all',{},11000);assert.equal(s.timers.a.remainingMs,290000);assert.equal(s.timers.a.endsAt,null);
  s=applyCommand(s,'goto',{index:2},11000);s=applyCommand(s,'toggle_all',{},12000);
  const timers=structuredClone(s.timers);
  s=applyCommand(s,'toggle_dim',{team:'b'},16000);assert.equal(s.dimmed.b,true);assert.deepEqual(s.timers,timers);
  s=applyCommand(s,'next',{},17000);assert.equal(s.dimmed.b,false);
  s=applyCommand(s,'previous',{},18000);assert.equal(s.dimmed.b,true);assert.equal(s.timers.b.endsAt,null);
});
test('popup QR é reversível e não altera a fase nem os relógios',()=>{
  let s=applyCommand(initial(),'start_all',{},1000);const clocks=structuredClone(s.timers);
  s=applyCommand(s,'toggle_qr',{},5000);assert.equal(s.qrVisible,true);assert.equal(s.phase,'debate');assert.deepEqual(s.timers,clocks);
  s=applyCommand(s,'toggle_qr',{},9000);assert.equal(s.qrVisible,false);assert.deepEqual(s.timers,clocks);assert.equal(remaining(s.timers.a,9000),292000);
  const start=applyCommand({...newState(0),qrVisible:true},'start_debate',{},0);assert.equal(start.qrVisible,false);
});
test('configuração rejeita chaves secret/service_role e aceita apenas publishable/anon',()=>{
  const config={mode:'live',supabaseUrl:'https://example.supabase.co',supabasePublishableKey:'sb_secret_should_never_be_public'};
  assert.throws(()=>validateConfig(config),/Nunca uses/);
  const jwt=(role)=>`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({role})).toString('base64url')}.signature`;
  assert.throws(()=>validateConfig({...config,supabasePublishableKey:jwt('service_role')}),/Nunca uses/);
  assert.doesNotThrow(()=>validateConfig({...config,supabasePublishableKey:jwt('anon')}));
  assert.doesNotThrow(()=>validateConfig({...config,supabasePublishableKey:'sb_publishable_test_public_key'}));
});
test('configuração da ordem mantém alternância em todas as relâmpago',()=>{
  let s=applyCommand(initial(),'goto',{index:4},0);s=applyCommand(s,'add_extra',{text:'Extra?'},0);
  s=applyCommand(s,'configure',{a:s.teams.a.members,b:s.teams.b.members,lightningFirst:'b',closingFirst:'b'},0);
  assert.deepEqual(s.rounds.filter(r=>['lightning','extra'].includes(r.kind)).map(r=>r.first),['b','a','b','a']);
  assert.equal(s.rounds.at(-1).first,'b');
});

test('relógios independentes, simultâneos e pausa sem perder tempo', () => {
  let s = applyCommand(initial(), 'start_all', {}, 1000);
  assert.equal(remaining(s.timers.a, 11000), 290000);
  s = applyCommand(s, 'pause', { team: 'a' }, 11000);
  assert.equal(remaining(s.timers.a, 21000), 290000);
  assert.equal(remaining(s.timers.b, 21000), 280000);
  s = applyCommand(s, 'start', { team: 'a' }, 21000);
  assert.equal(remaining(s.timers.a, 31000), 280000);
  assert.equal(remaining(s.timers.b, 31000), 270000);
});
test('excedente continua a contar e pode ser pausado', () => {
  let s=applyCommand(initial(),'set_time',{team:'a',seconds:1},0);
  s=applyCommand(s,'start',{team:'a'},0);
  assert.equal(formatTime(remaining(s.timers.a,2500)),'+00:02');
  s=applyCommand(s,'pause',{team:'a'},2500);
  assert.equal(remaining(s.timers.a,10000),-1500);
});
test('penalizações 30/60/90/90 por equipa e reinício por ronda',()=>{
  let s=initial();for(let i=0;i<3;i++)s=applyCommand(s,'penalty',{team:'a'},0);
  assert.equal(s.timers.a.remainingMs,120000);assert.equal(s.timers.b.remainingMs,300000);
  s=applyCommand(s,'penalty',{team:'a'},0);assert.equal(s.timers.a.remainingMs,30000);
  s=applyCommand(s,'next',{},0);assert.equal(s.penalties.a,0);assert.equal(s.timers.a.remainingMs,300000);
  s=applyCommand(s,'previous',{},0);assert.equal(s.penalties.a,4);assert.equal(s.timers.a.remainingMs,30000);
});
test('pergunta anterior recupera relógios pausados; reiniciar repõe o valor',()=>{
  let s=applyCommand(initial(),'start_all',{},0);s=applyCommand(s,'next',{},15000);s=applyCommand(s,'previous',{},50000);
  assert.equal(s.timers.a.endsAt,null);assert.equal(s.timers.a.remainingMs,285000);
  s=applyCommand(s,'reset_round',{},50000);assert.equal(s.timers.a.remainingMs,300000);assert.equal(s.timers.a.epoch,1);
});
test('zero extras ou várias extras com alternância e 30 segundos',()=>{
  let s=applyCommand(initial(),'goto',{index:4},0);
  assert.equal(currentRound(applyCommand(s,'next',{},0)).kind,'closing');
  for(let n=1;n<=8;n++){const previous=currentRound(s).first;s=applyCommand(s,'add_extra',{text:`Pergunta ${n}?`,sourceId:crypto.randomUUID()},0);assert.equal(currentRound(s).kind,'extra');assert.notEqual(currentRound(s).first,previous);assert.equal(s.timers.a.remainingMs,30000);assert.equal(s.timers.a.endsAt,null);}
  s=applyCommand(s,'next',{},0);assert.equal(currentRound(s).kind,'closing');assert.equal(s.timers.a.remainingMs,150000);
});
test('participantes diferentes nas três perguntas; repetição explícita e extras',()=>{
  let s=applyCommand(initial(),'goto',{index:2},0);s=applyCommand(s,'set_speaker',{team:'a',name:'Elemento 1'},0);s=applyCommand(s,'next',{},0);
  assert.throws(()=>applyCommand(s,'set_speaker',{team:'a',name:'Elemento 1'},0),/já respondeu/);
  s=applyCommand(s,'set_speaker',{team:'a',name:'Elemento 1',allowRepeat:true},0);s=applyCommand(s,'goto',{index:4},0);s=applyCommand(s,'add_extra',{text:'Extra?'},0);
  assert.doesNotThrow(()=>applyCommand(s,'set_speaker',{team:'a',name:'Elemento 1'},0));
});
test('vencedor por ganho positivo em pares completos, não por votos finais',()=>{
  const initial=[...Array(15).fill('favor'),...Array(2).fill('neutral'),...Array(5).fill('contra')];const final=[...Array(12).fill('favor'),'neutral',...Array(9).fill('contra')];
  const r=results([...initial.map((v,i)=>({initial:v,final:final[i]})),...Array(50).fill({initial:'favor',final:null})]);
  assert.equal(r.paired,22);assert.equal(r.totalInitial,72);assert.deepEqual(r.before,{favor:15,neutral:2,contra:5});assert.deepEqual(r.after,{favor:12,neutral:1,contra:9});assert.equal(r.winner,'contra');assert.deepEqual(r.gains,{favor:-3,contra:4});
});
test('empate por ganhos iguais, ausência de ganho, ou uma mantém enquanto outra perde',()=>{
  assert.equal(results([{initial:'neutral',final:'favor'},{initial:'neutral',final:'contra'}]).winner,'tie');
  assert.equal(results([{initial:'favor',final:'neutral'},{initial:'contra',final:'neutral'}]).winner,'tie');
  assert.equal(results([{initial:'favor',final:'favor'},{initial:'contra',final:'neutral'}]).winner,'tie');
  assert.equal(results([{initial:'favor',final:null}]).winner,null);
});
test('transições de votação exigem fecho antes da revelação',()=>{
  let s=applyCommand(initial(),'goto',{index:5},0);s=applyCommand(s,'open_final',{},0);
  assert.throws(()=>applyCommand(s,'reveal',{},0),/respostas completas/);
  s=applyCommand(s,'close_final',{},0,{votes:[{initial:'neutral',final:'favor'}]});s=applyCommand(s,'show_results',{},0);s=applyCommand(s,'reveal',{},1000);assert.equal(s.revealAt,4000);
});
