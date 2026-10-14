-- Atualiza apenas os comandos de moderação. Preserva votos, perguntas e tempos.
-- Executar no SQL Editor se o projeto Supabase já foi configurado.
begin;
create or replace function public.debate_command(p_action text,p_payload jsonb,p_version bigint,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb; prev jsonb; v bigint; n bigint; k text; keys text[]; t jsonb; ms bigint; running boolean; r jsonb; idx integer; count_rounds integer; ded integer; qid uuid; qstatus text; sid uuid; j jsonb; rr jsonb; arr jsonb; rec record; last_action debate_private.actions; members jsonb; name text;
begin
 if not debate_private.is_mod() then raise exception 'Sem autorização de moderação.' using errcode='42501'; end if;
 select state,version into s,v from debate_private.control where id=1 for update;
 if exists(select 1 from debate_private.actions where request_id=p_request) then return public.debate_admin_data(); end if;
 if v<>p_version then raise exception 'O estado mudou noutro dispositivo. Atualiza e tenta novamente.' using errcode='40001'; end if;
 n:=debate_private.now_ms(); sid:=(s->>'sessionId')::uuid; prev:=s||debate_private.snapshot(s,n);
 idx:=(s->>'roundIndex')::integer; r:=s->'rounds'->idx; count_rounds:=jsonb_array_length(s->'rounds');
 if p_action in ('start','pause','start_all','pause_all','toggle_timer','toggle_all','toggle_dim','adjust','set_time','penalty','reset_round','goto','next','previous','add_extra','set_speaker') and s->>'phase'<>'debate' then raise exception 'Este controlo está disponível durante o debate.'; end if;
 if p_action in ('start','pause','toggle_timer','toggle_dim','adjust','set_time','penalty','set_speaker') then k:=p_payload->>'team'; if k is null or k not in ('a','b') then raise exception 'Equipa inválida.'; end if; end if;
 case p_action
 when 'start_debate' then
  if s->>'phase'<>'initial_poll' then raise exception 'A votação inicial já terminou.'; end if;
  s:=jsonb_set(s,'{phase}','"debate"'); s:=jsonb_set(s,'{qrVisible}','false');
 when 'toggle_qr' then
  s:=jsonb_set(s,'{qrVisible}',to_jsonb(not coalesce((s->>'qrVisible')::boolean,false)));
 when 'toggle_dim' then
  if r->>'kind' not in ('lightning','extra') then raise exception 'Atenuar cartões está disponível nas rondas relâmpago.'; end if;
  if s->'dimmed' is null then s:=jsonb_set(s,'{dimmed}','{"a":false,"b":false}'); end if;
  s:=jsonb_set(s,array['dimmed',k],to_jsonb(not coalesce((s->'dimmed'->>k)::boolean,false)));
 when 'toggle_timer','toggle_all' then
  if p_action='toggle_all' then keys:=array['a','b']; else keys:=array[k]; end if;
  running:=false;
  foreach k in array keys loop running:=running or s->'timers'->k->>'endsAt' is not null; end loop;
  foreach k in array keys loop
   t:=s->'timers'->k;
   if running then t:=debate_private.paused_timer(t,n); else t:=jsonb_set(t,'{endsAt}',to_jsonb(n+(t->>'remainingMs')::bigint)); end if;
   s:=jsonb_set(s,array['timers',k],t);
  end loop;
 when 'start','start_all','pause','pause_all' then
  if p_action in ('start_all','pause_all') then keys:=array['a','b']; else keys:=array[k]; end if;
  foreach k in array keys loop
   t:=s->'timers'->k;
   if p_action in ('start','start_all') then
    if t->>'endsAt' is null then t:=jsonb_set(t,'{endsAt}',to_jsonb(n+(t->>'remainingMs')::bigint)); end if;
   else t:=debate_private.paused_timer(t,n); end if;
   s:=jsonb_set(s,array['timers',k],t);
  end loop;
 when 'adjust','set_time','penalty' then
  t:=s->'timers'->k; ms:=debate_private.remaining(t,n); running:=t->>'endsAt' is not null;
  if p_action='penalty' then
   if r->>'kind'<>'initial' then raise exception 'A escala de interrupções aplica-se às rondas iniciais.'; end if;
   ded:=(s->'penalties'->>k)::integer+1;
   s:=jsonb_set(s,array['penalties',k],to_jsonb(ded)); if ms>=0 then ms:=greatest(0,ms-least(ded,3)*30000); end if;
  else
   if p_payload->>'seconds' is null or (p_payload->>'seconds')::numeric not between -3600 and 3600 or (p_action='set_time' and (p_payload->>'seconds')::numeric<0) then raise exception 'Tempo inválido.'; end if;
   if p_action='set_time' then ms:=round((p_payload->>'seconds')::numeric*1000)::bigint; else ms:=ms+round((p_payload->>'seconds')::numeric*1000)::bigint; end if;
   ms:=greatest(-3600000,least(3600000,ms));
  end if;
  t:=t||jsonb_build_object('remainingMs',ms,'endsAt',case when running then n+ms else null end);
  s:=jsonb_set(s,array['timers',k],t);
 when 'reset_round' then
  foreach k in array array['a','b'] loop s:=jsonb_set(s,array['timers',k],jsonb_build_object('remainingMs',(r->>'durationMs')::bigint,'endsAt',null,'epoch',(s->'timers'->k->>'epoch')::integer+1)); end loop;
  s:=s||jsonb_build_object('penalties',jsonb_build_object('a',0,'b',0),'speakers',jsonb_build_object('a','','b',''),'dimmed',jsonb_build_object('a',false,'b',false));
 when 'goto','next','previous' then
  if p_action='goto' then idx:=(p_payload->>'index')::integer; elsif p_action='next' then idx:=idx+1; else idx:=idx-1; end if;
  s:=debate_private.goto_round(s,idx,n);
 when 'add_extra' then
  if idx<>count_rounds-2 or r->>'kind' not in ('lightning','extra') then raise exception 'Avança para a última pergunta relâmpago antes de adicionar outra.'; end if;
  if p_payload->>'text' is null or char_length(btrim(p_payload->>'text')) not between 1 and 500 then raise exception 'Escolhe uma pergunta com até 500 caracteres.'; end if;
  qid:=(p_payload->>'sourceId')::uuid;
  select status into qstatus from debate_private.questions where id=qid and session_id=sid;
  if qstatus is null then raise exception 'Seleciona uma sugestão recebida nesta sessão.'; end if;
  select count(*) into ded from jsonb_array_elements(s->'rounds') el where el->>'kind'='extra';
  rr:=jsonb_build_object('id',p_request,'kind','extra','title',btrim(p_payload->>'text'),'durationMs',30000,'first',case when r->>'first'='a' then 'b' else 'a' end,'label','Pergunta extra do público · '||(ded+1)::text,'sourceId',qid);
  select jsonb_agg(el order by pos) into arr from (select value el,ordinality::numeric pos from jsonb_array_elements(s->'rounds') with ordinality union all select rr,(idx+1.5)::numeric) ordered;
  s:=jsonb_set(s,'{rounds}',arr); s:=debate_private.goto_round(s,idx+1,n);
  update debate_private.questions set status='selected' where id=qid;
 when 'set_speaker' then
  name:=coalesce(p_payload->>'name','');
  if name<>'' and not (s->'teams'->k->'members' ? name) then raise exception 'Participante inválido.'; end if;
  if name<>'' and r->>'kind'='lightning' and not coalesce((p_payload->>'allowRepeat')::boolean,false) then
   for rec in select value from jsonb_array_elements(s->'rounds') loop
    if rec.value->>'kind'='lightning' and rec.value->>'id'<>r->>'id' and s->'history'->(rec.value->>'id')->'speakers'->>k=name then raise exception 'Este participante já respondeu. Confirma a repetição.'; end if;
   end loop;
  end if;
  s:=jsonb_set(s,array['speakers',k],to_jsonb(name));
 when 'configure' then
  foreach k in array array['a','b'] loop
   members:=p_payload->k;
   if jsonb_typeof(members) is distinct from 'array' then raise exception 'Lista de participantes inválida.'; end if;
   if jsonb_array_length(members) not between 5 and 30 or exists(select 1 from jsonb_array_elements_text(members) x where char_length(btrim(x)) not between 1 and 60) or (select count(distinct btrim(value)) from jsonb_array_elements_text(members))<>jsonb_array_length(members) then raise exception 'Indica entre 5 e 30 nomes distintos por equipa.'; end if;
   select jsonb_agg(btrim(value)) into members from jsonb_array_elements_text(members);
   s:=jsonb_set(s,array['teams',k,'members'],members);
  end loop;
  k:=coalesce(p_payload->>'lightningFirst',s->'rounds'->2->>'first'); name:=coalesce(p_payload->>'closingFirst',s->'rounds'->(jsonb_array_length(s->'rounds')-1)->>'first');
  if k not in ('a','b') or name not in ('a','b') then raise exception 'Equipa inicial inválida.'; end if;
  arr:='[]'::jsonb; ded:=0;
  for rec in select value from jsonb_array_elements(s->'rounds') loop
   rr:=rec.value;
   if rr->>'kind' in ('lightning','extra') then rr:=jsonb_set(rr,'{first}',to_jsonb(case when ded%2=0 then k else case when k='a' then 'b' else 'a' end end)); ded:=ded+1;
   elsif rr->>'kind'='closing' then rr:=jsonb_set(rr,'{first}',to_jsonb(name)); end if;
   arr:=arr||jsonb_build_array(rr);
  end loop;
  s:=jsonb_set(s,'{rounds}',arr);
 when 'open_final' then
  if s->>'phase'<>'debate' or r->>'kind'<>'closing' then raise exception 'Termina as rondas e avança para os closing statements.'; end if;
  s:=s||debate_private.snapshot(s,n)||jsonb_build_object('phase','final_poll');
 when 'close_final' then
  if s->>'phase'<>'final_poll' then raise exception 'A votação final não está aberta.'; end if;
  s:=s||jsonb_build_object('phase','final_wait','result',debate_private.result_for(sid));
 when 'show_results' then
  if s->>'phase'<>'final_wait' then raise exception 'Fecha a votação final antes de apresentar os resultados.'; end if;
  s:=jsonb_set(s,'{phase}','"results"');
 when 'reveal' then
  if s->>'phase'<>'results' or coalesce((s->'result'->>'paired')::integer,0)=0 then raise exception 'São necessárias respostas completas para revelar um vencedor.'; end if;
  s:=s||jsonb_build_object('phase','reveal','revealAt',n+3000);
 when 'reset_event' then s:=debate_private.fresh_state()||jsonb_build_object('teams',s->'teams'); perform debate_private.seed_questions((s->>'sessionId')::uuid);
 when 'question_status' then
  if p_payload->>'status' is null or p_payload->>'status' not in ('new','selected','debated','discarded') then raise exception 'Estado da pergunta inválido.'; end if;
  update debate_private.questions set status=p_payload->>'status' where id=(p_payload->>'id')::uuid and session_id=sid;
  if not found then raise exception 'Pergunta não encontrada.'; end if;
 when 'undo' then
  select * into last_action from debate_private.actions where session_id=sid order by id desc limit 1;
  if last_action.action is null or last_action.action not in ('start','pause','start_all','pause_all','toggle_timer','toggle_all','toggle_dim','adjust','set_time','penalty','reset_round','goto','next','previous','add_extra','set_speaker','configure') then raise exception 'Esta transição não pode ser desfeita.'; end if;
  if last_action.action='add_extra' then update debate_private.questions set status=coalesce(last_action.detail->>'questionPreviousStatus','new') where id=(last_action.detail->>'sourceId')::uuid; end if;
  s:=last_action.previous_state;
 else raise exception 'Ação desconhecida.';
 end case;
 v:=v+1;
 insert into debate_private.actions(request_id,session_id,user_id,action,previous_state,detail) values(p_request,sid,auth.uid(),p_action,prev,coalesce(p_payload,'{}')||jsonb_build_object('questionPreviousStatus',qstatus));
 update debate_private.control set state=s,version=v where id=1;
 perform debate_private.publish(s,v);
 return public.debate_admin_data();
end $$;
commit;
