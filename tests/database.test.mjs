import { SEED_QUESTIONS } from '../src/seeds.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { newState } from '../src/core.js';

test('backend PostgreSQL: permissões, votações, pares e perguntas extra',async(t)=>{
  const db=new PGlite();
  const mod=crypto.randomUUID(), stranger=crypto.randomUUID();
  try{
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema public to anon,authenticated;`);
    const template=await readFile(new URL('../supabase/schema.template.sql',import.meta.url),'utf8');
    await db.exec(template.replace('__SUGGESTION_SEEDS__',JSON.stringify(SEED_QUESTIONS).replaceAll("'","''")).replace('__INITIAL_STATE__',JSON.stringify(newState(0,'00000000-0000-4000-8000-000000000001')).replaceAll("'","''")));
    await db.query('insert into auth.users(id) values($1),($2)',[mod,stranger]);await db.query('insert into debate_private.moderators values($1)',[mod]);
    async function role(name,id=''){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`set role ${name}`);}
    async function api(name,args=[]){const placeholders=args.map((_,i)=>`$${i+1}`).join(',');return(await db.query(`select public.${name}(${placeholders}) as value`,args)).rows[0].value;}
    async function admin(){await role('authenticated',mod);return api('debate_admin_data');}
    async function command(action,payload={}){const d=await admin();return api('debate_command',[action,JSON.stringify(payload),d.version,crypto.randomUUID()]);}
    await t.test('anon e utilizador autenticado não autorizado não podem controlar nem ler dados privados',async()=>{
      await role('anon');assert.ok((await api('debate_get_state')).state);
      await assert.rejects(api('debate_admin_data'),/permission denied/);
      await assert.rejects(api('debate_command',['start_debate','{}',1,crypto.randomUUID()]),/permission denied/);
      await assert.rejects(db.query('select * from debate_private.votes'),/permission denied/);
      await assert.rejects(db.query("update public.debate_state set version=99"),/permission denied/);
      await role('authenticated',stranger);assert.equal(await api('debate_is_moderator'),false);await assert.rejects(api('debate_admin_data'),/Sem autorização/);
    });
    const d0=await admin(), sid=d0.state.sessionId, token='a'.repeat(48), other='b'.repeat(48);
    await t.test('voto inicial único, idempotente e opção validada',async()=>{
      await role('anon');await api('debate_vote',[sid,token,'initial','favor']);await api('debate_vote',[sid,token,'initial','contra']);
      assert.equal((await api('debate_vote_status',[sid,token])).initial,'favor');
      await assert.rejects(api('debate_vote',[sid,other,'initial','bad']),/inválida/);await assert.rejects(api('debate_vote',[sid,'weak','initial','favor']),/inválido/);
      assert.equal((await admin()).stats.initial,1);
    });
    await t.test('totais públicos atualizam sem divulgar votos e a migração preserva dados',async()=>{
      await role('postgres');
      await db.exec(await readFile(new URL('../supabase/updates/2026-10-13-poll-counts.sql',import.meta.url),'utf8'));
      await role('anon');
      const publicData=await api('debate_get_state');
      assert.deepEqual(publicData.state.voteCounts,{initial:1,final:0});
      assert.equal(publicData.state.result,null);
      assert.equal(publicData.state.history,undefined);
      assert.equal(publicData.state.teams.a.members,undefined);
      assert.equal(publicData.votes,undefined);
      assert.equal((await api('debate_vote_status',[sid,token])).initial,'favor');
      await api('debate_vote',[sid,token,'initial','contra']);
      assert.deepEqual((await api('debate_get_state')).state.voteCounts,{initial:1,final:0});
      assert.equal((await admin()).version,d0.version);
    });
    await t.test('perguntas têm confirmação no frontend, validação, limite e idempotência no servidor',async()=>{
      await role('anon');const id=crypto.randomUUID();await api('debate_submit_question',[sid,token,id,'Uma pergunta do público?']);assert.equal(await api('debate_submit_question',[sid,token,id,'Uma pergunta do público?']),id);
      await assert.rejects(api('debate_submit_question',[sid,token,crypto.randomUUID(),'Outra pergunta?']),/30 segundos/);
      await assert.rejects(api('debate_submit_question',[sid,other,crypto.randomUUID(),'x'.repeat(501)]),/500 caracteres/);
      assert.equal((await admin()).questions.length,3);
    });
    await t.test('sugestões públicas, reações únicas, alteração, retirada, pontuação e duplicados',async()=>{
      await role('anon');
      const questions=await api('debate_questions',[sid,token]);
      assert.equal(questions.length,3);
      assert.equal(questions.filter(q=>q.origin==='moderation').length,2);
      assert.equal(questions[0].token_hash,undefined);
      const q=questions.find(q=>q.origin==='audience'), seed=questions.find(q=>q.origin==='moderation');
      await assert.rejects(api('debate_react_question',[sid,other,q.id,1]),/Vota no inquérito/);
      await assert.rejects(api('debate_react_question',[sid,token,q.id,2]),/inválida/);
      let answer=await api('debate_react_question',[sid,token,q.id,1]);
      assert.equal(answer[0].id,q.id);assert.equal(answer[0].score,1);assert.equal(answer[0].likes,1);
      answer=await api('debate_react_question',[sid,token,q.id,1]);assert.equal(answer[0].score,1);
      answer=await api('debate_react_question',[sid,token,q.id,-1]);
      assert.equal(answer.at(-1).score,-1);assert.equal(answer.at(-1).likes,0);assert.equal(answer.at(-1).dislikes,1);
      answer=await api('debate_react_question',[sid,token,q.id,0]);assert.equal(answer.find(x=>x.id===q.id).score,0);
      await role('postgres');
      await db.exec("update debate_private.questions set created_at=created_at-interval '1 minute' where origin='audience'");
      await role('anon');
      await assert.rejects(api('debate_submit_question',[sid,token,crypto.randomUUID(),'  UMA   pergunta do público?  ']),/já foi recebida/);
      await command('question_status',{id:seed.id,status:'discarded'});
      await role('anon');assert.equal((await api('debate_questions',[sid,token])).length,2);
      await assert.rejects(api('debate_react_question',[sid,token,seed.id,1]),/indisponível/);
      await command('question_status',{id:seed.id,status:'new'});
      await role('anon');await api('debate_react_question',[sid,token,q.id,1]);
      assert.equal((await admin()).questions[0].id,q.id);
      await role('anon');await api('debate_react_question',[sid,token,q.id,0]);
    });
    await t.test('comandos idempotentes e versão impedem alterações concorrentes',async()=>{
      const d=await admin(), req=crypto.randomUUID();const after=await api('debate_command',['start_debate','{}',d.version,req]);
      const retry=await api('debate_command',['start_debate','{}',d.version,req]);assert.equal(retry.version,after.version);
      await assert.rejects(api('debate_command',['pause_all','{}',d.version,crypto.randomUUID()]),/estado mudou/);
      await role('anon');await assert.rejects(api('debate_vote',[sid,other,'initial','favor']),/votação já terminou/);
    });
    await t.test('atualização do popup QR suporta estados antigos e preserva relógios em contagem',async()=>{
      await role('postgres');await db.exec("update debate_private.control set state=state-'qrVisible' where id=1");
      await db.exec(await readFile(new URL('../supabase/updates/2026-10-13-qr-popup.sql',import.meta.url),'utf8'));
      const running=await command('start_all'),clocks=running.state.timers;
      const shown=await command('toggle_qr');assert.equal(shown.state.qrVisible,true);assert.equal(shown.state.phase,'debate');assert.deepEqual(shown.state.timers,clocks);
      await role('anon');assert.equal((await api('debate_get_state')).state.qrVisible,true);
      const hidden=await command('toggle_qr');assert.equal(hidden.state.qrVisible,false);assert.deepEqual(hidden.state.timers,clocks);await command('pause_all');await command('reset_round');
    });
    await t.test('botão de tempo alterna e atenuar cartões preserva relógios',async()=>{
      let d=await command('toggle_timer',{team:'a'});assert.notEqual(d.state.timers.a.endsAt,null);assert.equal(d.state.timers.b.endsAt,null);
      d=await command('toggle_all');assert.equal(d.state.timers.a.endsAt,null);assert.equal(d.state.timers.b.endsAt,null);
      d=await command('toggle_all');assert.notEqual(d.state.timers.a.endsAt,null);assert.notEqual(d.state.timers.b.endsAt,null);
      await command('goto',{index:2});d=await command('toggle_all');const clocks=d.state.timers;
      d=await command('toggle_dim',{team:'b'});assert.equal(d.state.dimmed.b,true);assert.deepEqual(d.state.timers,clocks);
      d=await command('toggle_dim',{team:'b'});assert.equal(d.state.dimmed.b,false);assert.deepEqual(d.state.timers,clocks);
      d=await command('next');assert.equal(d.state.dimmed.b,false);
      await command('goto',{index:0});await command('reset_round');
    });
    await t.test('configuração, penalizações e participantes são também validados no servidor',async()=>{
      let d=await admin();d=await command('configure',{a:d.state.teams.a.members,b:d.state.teams.b.members,lightningFirst:'b',closingFirst:'b'});
      assert.equal(d.state.rounds[2].first,'b');assert.equal(d.state.rounds.at(-1).first,'b');
      for(let i=0;i<3;i++)d=await command('penalty',{team:'a'});assert.equal(d.state.timers.a.remainingMs,120000);assert.equal(d.state.penalties.a,3);
      d=await command('undo');assert.equal(d.state.timers.a.remainingMs,210000);d=await command('reset_round');assert.equal(d.state.timers.a.remainingMs,300000);
      d=await command('goto',{index:2});await command('set_speaker',{team:'a',name:'Elemento 1'});await command('next');
      await assert.rejects(command('set_speaker',{team:'a',name:'Elemento 1'}),/já respondeu/);
      await command('set_speaker',{team:'a',name:'Elemento 1',allowRepeat:true});await command('goto',{index:0});
    });
    await t.test('relógios independentes; zero extras ou várias, sem limite fixo e com alternância',async()=>{
      let d=await command('start_all');assert.notEqual(d.state.timers.a.endsAt,null);d=await command('pause',{team:'a'});assert.equal(d.state.timers.a.endsAt,null);assert.notEqual(d.state.timers.b.endsAt,null);
      d=await command('goto',{index:4});d=await command('next');assert.equal(d.state.rounds[d.state.roundIndex].kind,'closing');d=await command('previous');
      const q=(await admin()).questions[0];
      for(let i=1;i<=6;i++){const previous=d.state.rounds[d.state.roundIndex].first;d=await command('add_extra',{sourceId:q.id,text:`Extra ${i}?`});assert.equal(d.state.rounds.filter(r=>r.kind==='extra').length,i);assert.notEqual(d.state.rounds[d.state.roundIndex].first,previous);assert.equal(d.state.timers.a.remainingMs,30000);assert.equal(d.state.timers.a.endsAt,null);}
      d=await command('undo');assert.equal(d.state.rounds.filter(r=>r.kind==='extra').length,5);d=await command('next');assert.equal(d.state.rounds[d.state.roundIndex].kind,'closing');
    });
    await t.test('final só com voto inicial; resultado oculto até apresentação; zero ganho dá empate',async()=>{
      await command('open_final');await role('anon');await assert.rejects(api('debate_vote',[sid,other,'final','contra']),/Só pode votar/);
      await api('debate_vote',[sid,token,'final','neutral']);await api('debate_vote',[sid,token,'final','contra']);assert.equal((await api('debate_vote_status',[sid,token])).final,'neutral');
      assert.deepEqual((await api('debate_get_state')).state.voteCounts,{initial:1,final:1});
      const closed=await command('close_final');assert.equal(closed.state.result.winner,'tie');assert.equal(closed.state.result.paired,1);
      await role('anon');assert.equal((await api('debate_get_state')).state.result,null);assert.equal((await db.query("select state->'result' r from public.debate_state")).rows[0].r,null);
      await command('show_results');await role('anon');assert.equal((await api('debate_get_state')).state.result.winner,'tie');await command('reveal');
    });
    await t.test('novo evento preserva o anterior e exemplo 15/2/5 → 12/1/9 é ganho de Contra',async()=>{
      const fresh=await command('reset_event'), newsid=fresh.state.sessionId;assert.notEqual(newsid,sid);
      assert.equal(fresh.questions.length,2);assert.ok(fresh.questions.every(q=>q.origin==='moderation' && q.score===0));
      await role('postgres');await db.exec(await readFile(new URL('../supabase/importar-sugestoes-iniciais.sql',import.meta.url),'utf8'));
      assert.equal((await admin()).questions.length,2);
      await role('anon');assert.deepEqual((await api('debate_get_state')).state.voteCounts,{initial:0,final:0});
      const initial=[...Array(15).fill('favor'),...Array(2).fill('neutral'),...Array(5).fill('contra')],final=[...Array(12).fill('favor'),'neutral',...Array(9).fill('contra')];
      await role('anon');for(let i=0;i<22;i++)await api('debate_vote',[newsid,i.toString(16).padStart(48,'0'),'initial',initial[i]]);
      await api('debate_vote',[newsid,'f'.repeat(48),'initial','favor']);
      await command('start_debate');await command('goto',{index:5});await command('open_final');await role('anon');for(let i=0;i<22;i++)await api('debate_vote',[newsid,i.toString(16).padStart(48,'0'),'final',final[i]]);
      const end=await command('close_final');assert.deepEqual(end.state.result.before,{favor:15,neutral:2,contra:5});assert.deepEqual(end.state.result.after,{favor:12,neutral:1,contra:9});assert.equal(end.state.result.winner,'contra');assert.equal(end.state.result.totalInitial,23);
      await role('postgres');assert.equal((await db.query('select count(*) n from debate_private.votes where session_id=$1',[sid])).rows[0].n,1);
    });
    await t.test('migração preserva os dados e preenche os cinco primeiros participantes',async()=>{
      let d=await admin();const before=d.state;
      await role('postgres');await db.exec(await readFile(new URL('../supabase/updates/2026-10-14-participantes.sql',import.meta.url),'utf8'));
      d=await admin();assert.deepEqual(d.state,before);
      d=await command('reset_event');const seeds=d.questions;
      await command('start_debate');
      d=await command('toggle_dim',{team:'a'});assert.equal(d.state.dimmed.a,true);
      assert.equal(d.state.timers.a.remainingMs,300000);
      for(let i=1;i<=3;i++) { d=await command('goto',{index:i+1});assert.deepEqual(d.state.speakers,{a:`Elemento ${i}`,b:`Elemento ${i}`}); }
      for(let i=4;i<=6;i++) { d=await command('add_extra',{sourceId:seeds[(i-4)%2].id,text:`Extra ${i}?`});assert.deepEqual(d.state.speakers,i<=5?{a:`Elemento ${i}`,b:`Elemento ${i}`}:{a:'',b:''}); }
      await command('previous');await command('set_speaker',{team:'b',name:'Elemento 1'});await command('next');
      d=await command('previous');assert.equal(d.state.speakers.b,'Elemento 1');
      d=await command('reset_round');assert.deepEqual(d.state.speakers,{a:'Elemento 5',b:'Elemento 5'});
      d=await command('configure',{a:Array.from({length:5},(_,i)=>`A${i+1}`),b:Array.from({length:5},(_,i)=>`B${i+1}`)});
      assert.deepEqual(d.state.speakers,{a:'A5',b:'B5'});
    });
  }finally{await db.close();}
});
