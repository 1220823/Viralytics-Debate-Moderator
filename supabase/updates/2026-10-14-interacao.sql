-- Executar supabase/setup.sql (gerado por npm run build) no SQL Editor do Supabase.
-- Não remove dados existentes. Apenas este projeto de debate deve usar estas tabelas.
begin;
create schema if not exists debate_private;
revoke all on schema debate_private from public, anon, authenticated;

create table if not exists debate_private.moderators (user_id uuid primary key references auth.users(id));
create table if not exists debate_private.control (id integer primary key check(id=1), state jsonb not null, version bigint not null default 1);
create table if not exists public.debate_state (id text primary key check(id='main'), state jsonb not null, version bigint not null, updated_at timestamptz not null default now());
create table if not exists debate_private.votes (
  session_id uuid not null, token_hash text not null,
  initial_choice text check(initial_choice in ('favor','neutral','contra')),
  final_choice text check(final_choice in ('favor','neutral','contra')),
  initial_at timestamptz, final_at timestamptz,
  primary key(session_id,token_hash), check(final_choice is null or initial_choice is not null)
);
create table if not exists debate_private.questions (
  id uuid primary key, session_id uuid not null, token_hash text not null,
  text text not null check(char_length(text) between 1 and 500),
  status text not null default 'new' check(status in ('new','selected','debated','discarded')),
  created_at timestamptz not null default now()
);
alter table debate_private.questions add column if not exists origin text not null default 'audience' check(origin in ('audience','moderation'));
create table if not exists debate_private.question_reactions (
 question_id uuid not null references debate_private.questions(id) on delete cascade,
 token_hash text not null, value smallint not null check(value in (-1,1)),
 primary key(question_id,token_hash)
);
alter table debate_private.question_reactions enable row level security;
create index if not exists debate_questions_session on debate_private.questions(session_id,created_at desc);
create table if not exists debate_private.actions (
  id bigint generated always as identity primary key, request_id uuid not null unique,
  session_id uuid not null, user_id uuid, action text not null,
  previous_state jsonb not null, detail jsonb not null default '{}', created_at timestamptz not null default now()
);
alter table public.debate_state enable row level security;
drop policy if exists debate_public_read on public.debate_state;
create policy debate_public_read on public.debate_state for select to anon, authenticated using (true);
revoke all on public.debate_state from anon, authenticated;
grant select on public.debate_state to anon, authenticated;
-- RLS e ausência de grants protegem igualmente o schema privado.
alter table debate_private.moderators enable row level security;
alter table debate_private.control enable row level security;
alter table debate_private.votes enable row level security;
alter table debate_private.questions enable row level security;
alter table debate_private.actions enable row level security;

create or replace function debate_private.now_ms() returns bigint language sql volatile set search_path='' as $$ select floor(extract(epoch from clock_timestamp())*1000)::bigint $$;
create or replace function debate_private.fresh_state() returns jsonb language sql volatile set search_path='' as $$
 select '{"sessionId":"00000000-0000-4000-8000-000000000001","phase":"initial_poll","qrVisible":false,"dimmed":{"a":false,"b":false},"roundIndex":0,"rounds":[{"id":"initial-1","kind":"initial","title":"Se uma superinteligência fosse capaz de tomar decisões melhores do que os seres humanos, deveríamos permitir-lhe tomar decisões que atualmente pertencem às pessoas?","durationMs":300000,"first":"a","label":"Ronda inicial · 1 de 2"},{"id":"initial-2","kind":"initial","title":"Poderemos realmente controlar uma inteligência que seja superior à nossa?","durationMs":300000,"first":"b","label":"Ronda inicial · 2 de 2"},{"id":"lightning-1","kind":"lightning","title":"Será seguro criar uma tecnologia cujas capacidades e comportamentos futuros não conseguimos prever?","durationMs":30000,"first":"a","label":"Ronda Relâmpago · 1 de 3"},{"id":"lightning-2","kind":"lightning","title":"Poderá a superinteligência ajudar a humanidade a ultrapassar por completo limitações biológicas e cognitivas?","durationMs":30000,"first":"b","label":"Ronda Relâmpago · 2 de 3"},{"id":"lightning-3","kind":"lightning","title":"Poderá a superinteligência ser a ferramenta mais poderosa alguma vez criada para resolver problemas da humanidade?","durationMs":30000,"first":"a","label":"Ronda Relâmpago · 3 de 3"},{"id":"closing","kind":"closing","title":"Superinteligência: progresso ou ameaça?","durationMs":150000,"first":"a","label":"Closing statements"}],"timers":{"a":{"remainingMs":300000,"endsAt":null,"epoch":0},"b":{"remainingMs":300000,"endsAt":null,"epoch":0}},"penalties":{"a":0,"b":0},"speakers":{"a":"","b":""},"history":{},"teams":{"a":{"label":"A favor","stance":"Progresso","members":["Elemento 1","Elemento 2","Elemento 3","Elemento 4","Elemento 5"]},"b":{"label":"Contra","stance":"Ameaça","members":["Elemento 1","Elemento 2","Elemento 3","Elemento 4","Elemento 5"]}},"result":null,"revealAt":null,"createdAt":0}'::jsonb || jsonb_build_object('sessionId',gen_random_uuid(),'createdAt',debate_private.now_ms())
$$;
create or replace function debate_private.is_mod() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from debate_private.moderators where user_id=auth.uid())
$$;
create or replace function debate_private.token_hash(t text) returns text language plpgsql immutable set search_path='' as $$
begin
 if t is null or t !~ '^[a-f0-9]{48}$' then raise exception 'Identificador de espectador inválido.'; end if;
 return encode(sha256(convert_to(t,'UTF8')),'hex');
end $$;
create or replace function debate_private.remaining(t jsonb,n bigint) returns bigint language sql immutable set search_path='' as $$
 select case when t->>'endsAt' is null then (t->>'remainingMs')::bigint else (t->>'endsAt')::bigint-n end
$$;
create or replace function debate_private.paused_timer(t jsonb,n bigint) returns jsonb language sql immutable set search_path='' as $$
 select t||jsonb_build_object('remainingMs',debate_private.remaining(t,n),'endsAt',null)
$$;
create or replace function debate_private.snapshot(s jsonb,n bigint) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('timers',jsonb_build_object('a',debate_private.paused_timer(s->'timers'->'a',n),'b',debate_private.paused_timer(s->'timers'->'b',n)), 'penalties',s->'penalties','speakers',s->'speakers','dimmed',coalesce(s->'dimmed','{"a":false,"b":false}'::jsonb))
$$;
create or replace function debate_private.auto_speakers(s jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare r jsonb; idx integer; ordinal integer; k text;
begin
 idx:=(s->>'roundIndex')::integer; r:=s->'rounds'->idx;
 if r->>'kind' not in ('lightning','extra') then return s; end if;
 select count(*) into ordinal from jsonb_array_elements(s->'rounds') with ordinality where ordinality<=idx+1 and value->>'kind' in ('lightning','extra');
 if ordinal<=5 then foreach k in array array['a','b'] loop
  if coalesce(s->'speakers'->>k,'')='' or not (s->'teams'->k->'members' ? (s->'speakers'->>k)) then s:=jsonb_set(s,array['speakers',k],to_jsonb(coalesce(s->'teams'->k->'members'->>(ordinal-1),''))); end if;
 end loop; end if;
 return s;
end $$;
create or replace function debate_private.goto_round(s jsonb,i integer,n bigint) returns jsonb language plpgsql immutable set search_path='' as $$
declare old_id text; r jsonb; saved jsonb;
begin
 if i is null or i<0 or i>=jsonb_array_length(s->'rounds') then raise exception 'Pergunta inválida.'; end if;
 old_id:=s->'rounds'->((s->>'roundIndex')::integer)->>'id';
 s:=jsonb_set(s,array['history',old_id],debate_private.snapshot(s,n));
 s:=jsonb_set(s,'{roundIndex}',to_jsonb(i)); r:=s->'rounds'->i; saved:=s->'history'->(r->>'id');
 if saved is not null then s:=s||saved;
 else s:=s||jsonb_build_object('timers',jsonb_build_object('a',jsonb_build_object('remainingMs',(r->>'durationMs')::bigint,'endsAt',null,'epoch',0),'b',jsonb_build_object('remainingMs',(r->>'durationMs')::bigint,'endsAt',null,'epoch',0)),'penalties',jsonb_build_object('a',0,'b',0),'speakers',jsonb_build_object('a','','b',''),'dimmed',jsonb_build_object('a',false,'b',false)); end if;
 return debate_private.auto_speakers(s);
end $$;
create or replace function debate_private.publish(s jsonb,v bigint) returns void language plpgsql set search_path='' as $$
declare pub jsonb;
begin
 pub:=s-'history';
 pub:=jsonb_set(pub,'{teams,a}',(pub->'teams'->'a')-'members');
 pub:=jsonb_set(pub,'{teams,b}',(pub->'teams'->'b')-'members');
 if s->>'phase' not in ('results','reveal') then pub:=jsonb_set(pub,'{result}','null'::jsonb); end if;
 select pub||jsonb_build_object('voteCounts',jsonb_build_object('initial',count(*) filter(where initial_choice is not null),'final',count(*) filter(where final_choice is not null))) into pub
 from debate_private.votes where session_id=(s->>'sessionId')::uuid;
 insert into public.debate_state(id,state,version) values('main',pub,v)
 on conflict(id) do update set state=excluded.state,version=excluded.version,updated_at=clock_timestamp();
end $$;
create or replace function debate_private.result_for(sid uuid) returns jsonb language plpgsql set search_path='' as $$
declare bef jsonb; aft jsonb; paired bigint; ga bigint; gb bigint; winner text; ti bigint; tf bigint;
begin
 select count(*) filter(where initial_choice is not null),count(*) filter(where final_choice is not null) into ti,tf from debate_private.votes where session_id=sid;
 select count(*),jsonb_build_object('favor',count(*) filter(where initial_choice='favor'),'neutral',count(*) filter(where initial_choice='neutral'),'contra',count(*) filter(where initial_choice='contra')),
 jsonb_build_object('favor',count(*) filter(where final_choice='favor'),'neutral',count(*) filter(where final_choice='neutral'),'contra',count(*) filter(where final_choice='contra'))
 into paired,bef,aft from debate_private.votes where session_id=sid and initial_choice is not null and final_choice is not null;
 ga:=(aft->>'favor')::bigint-(bef->>'favor')::bigint; gb:=(aft->>'contra')::bigint-(bef->>'contra')::bigint;
 if paired=0 then winner:=null; elsif ga>0 and ga>gb then winner:='favor'; elsif gb>0 and gb>ga then winner:='contra'; else winner:='tie'; end if;
 return jsonb_build_object('paired',paired,'before',bef,'after',aft,'gains',jsonb_build_object('favor',ga,'contra',gb),'winner',winner,'totalInitial',ti,'totalFinal',tf);
end $$;

create or replace function debate_private.seed_questions(sid uuid) returns void language plpgsql set search_path='' as $$
declare item text;
begin
 for item in select value from jsonb_array_elements_text('["Poderá uma superinteligência tomar decisões mais eficazes do que os seres humanos em problemas extremamente complexos?","Será que os potenciais benefícios da superinteligência justificam os riscos associados ao seu desenvolvimento?"]'::jsonb) loop
  if not exists(select 1 from debate_private.questions where session_id=sid and lower(regexp_replace(btrim(text),'\s+',' ','g'))=lower(regexp_replace(btrim(item),'\s+',' ','g'))) then
   insert into debate_private.questions(id,session_id,token_hash,text,origin) values(gen_random_uuid(),sid,repeat('0',64),item,'moderation');
  end if;
 end loop;
end $$;
create or replace function debate_private.questions_for(sid uuid,h text,include_discarded boolean default false) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'text',text,'status',status,'origin',origin,'createdAt',floor(extract(epoch from created_at)*1000),'score',score,'likes',likes,'dislikes',dislikes,'myReaction',my_reaction) order by score desc,created_at,id),'[]'::jsonb)
 from (select q.*, coalesce(sum(r.value),0) score, count(*) filter(where r.value=1) likes, count(*) filter(where r.value=-1) dislikes, coalesce(max(r.value) filter(where r.token_hash=h),0) my_reaction
  from debate_private.questions q left join debate_private.question_reactions r on r.question_id=q.id
  where q.session_id=sid and (include_discarded or q.status<>'discarded') group by q.id) ranked
$$;
create or replace function public.debate_questions(p_session uuid,p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare h text; s jsonb;
begin
 h:=debate_private.token_hash(p_token);
 select state into s from debate_private.control where id=1;
 if (s->>'sessionId')::uuid<>p_session then raise exception 'Esta sessão de debate terminou.'; end if;
 return debate_private.questions_for(p_session,h);
end $$;
create or replace function public.debate_react_question(p_session uuid,p_token text,p_id uuid,p_value integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare h text; s jsonb; v bigint;
begin
 h:=debate_private.token_hash(p_token);
 if p_value is null or p_value not in (-1,0,1) then raise exception 'Reação inválida.'; end if;
 select state,version into s,v from debate_private.control where id=1 for update;
 if (s->>'sessionId')::uuid<>p_session then raise exception 'Esta sessão de debate terminou.'; end if;
 if not exists(select 1 from debate_private.votes where session_id=p_session and token_hash=h and initial_choice is not null) then raise exception 'Vota no inquérito inicial para participar.'; end if;
 if not exists(select 1 from debate_private.questions where id=p_id and session_id=p_session and status<>'discarded') then raise exception 'Pergunta indisponível.'; end if;
 if p_value=0 then delete from debate_private.question_reactions where question_id=p_id and token_hash=h;
 else insert into debate_private.question_reactions(question_id,token_hash,value) values(p_id,h,p_value) on conflict(question_id,token_hash) do update set value=excluded.value; end if;
 perform debate_private.publish(s,v);
 return debate_private.questions_for(p_session,h);
end $$;

create or replace function public.debate_get_state() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('state',state,'version',version,'serverNow',debate_private.now_ms()) from public.debate_state where id='main'
$$;
create or replace function public.debate_is_moderator() returns boolean language sql stable security definer set search_path='' as $$ select debate_private.is_mod() $$;
create or replace function public.debate_admin_data() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb; v bigint; qs jsonb; stats jsonb;
begin
 if not debate_private.is_mod() then raise exception 'Sem autorização de moderação.' using errcode='42501'; end if;
 select state,version into s,v from debate_private.control where id=1;
 qs:=debate_private.questions_for((s->>'sessionId')::uuid,null,true);
 select jsonb_build_object('initial',count(*) filter(where initial_choice is not null),'final',count(*) filter(where final_choice is not null),'paired',count(*) filter(where initial_choice is not null and final_choice is not null)) into stats from debate_private.votes where session_id=(s->>'sessionId')::uuid;
 return jsonb_build_object('state',s,'version',v,'serverNow',debate_private.now_ms(),'questions',qs,'stats',stats);
end $$;
create or replace function public.debate_vote_status(p_session uuid,p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare h text; answer jsonb;
begin
 h:=debate_private.token_hash(p_token);
 select jsonb_build_object('initial',initial_choice,'final',final_choice) into answer from debate_private.votes where session_id=p_session and token_hash=h;
 return coalesce(answer,jsonb_build_object('initial',null,'final',null));
end $$;
create or replace function public.debate_vote(p_session uuid,p_token text,p_phase text,p_choice text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb; v bigint; h text; existing debate_private.votes;
begin
 h:=debate_private.token_hash(p_token);
 if p_choice is null or p_choice not in ('favor','neutral','contra') or p_phase is null or p_phase not in ('initial','final') then raise exception 'Opção de voto inválida.'; end if;
 -- A mesma linha é bloqueada no fecho da votação: não há aceitação de votos após o fecho.
 select state,version into s,v from debate_private.control where id=1 for update;
 if (s->>'sessionId')::uuid<>p_session then raise exception 'Esta sessão de debate terminou.'; end if;
 select * into existing from debate_private.votes where session_id=p_session and token_hash=h;
 if p_phase='initial' and existing.initial_choice is not null then return public.debate_vote_status(p_session,p_token); end if;
 if p_phase='final' and existing.final_choice is not null then return public.debate_vote_status(p_session,p_token); end if;
 if s->>'phase' <> p_phase||'_poll' then raise exception 'A votação já terminou ou ainda não abriu.'; end if;
 if p_phase='initial' then
  insert into debate_private.votes(session_id,token_hash,initial_choice,initial_at) values(p_session,h,p_choice,clock_timestamp());
 else
  if existing.initial_choice is null then raise exception 'Só pode votar no fim quem votou no início, no mesmo navegador.'; end if;
  update debate_private.votes set final_choice=p_choice,final_at=clock_timestamp() where session_id=p_session and token_hash=h;
 end if;
 -- Atualiza só o total público; as escolhas individuais continuam privadas.
 perform debate_private.publish(s,v);
 return public.debate_vote_status(p_session,p_token);
end $$;
create or replace function public.debate_submit_question(p_session uuid,p_token text,p_id uuid,p_text text) returns uuid language plpgsql security definer set search_path='' as $$
declare h text; s jsonb; v bigint;
begin
 h:=debate_private.token_hash(p_token);
 if p_text is null or char_length(btrim(p_text)) not between 1 and 500 then raise exception 'A pergunta deve ter entre 1 e 500 caracteres.'; end if;
 select state,version into s,v from debate_private.control where id=1 for update;
 if (s->>'sessionId')::uuid<>p_session then raise exception 'Esta sessão de debate terminou.'; end if;
 if not exists(select 1 from debate_private.votes where session_id=p_session and token_hash=h and initial_choice is not null) then raise exception 'Vota no inquérito inicial para participar.'; end if;
 if exists(select 1 from debate_private.questions where id=p_id and token_hash=h and session_id=p_session) then return p_id; end if;
 if exists(select 1 from debate_private.questions where session_id=p_session and lower(regexp_replace(btrim(text),'\s+',' ','g'))=lower(regexp_replace(btrim(p_text),'\s+',' ','g'))) then raise exception 'Esta pergunta já foi recebida. Podes reagir à sugestão existente.'; end if;
 if exists(select 1 from debate_private.questions where token_hash=h and created_at>clock_timestamp()-interval '30 seconds') then raise exception 'Espera 30 segundos antes de enviar outra pergunta.'; end if;
 if (select count(*) from debate_private.questions where session_id=p_session and created_at>clock_timestamp()-interval '1 minute')>=120 then raise exception 'Muitas perguntas neste momento. Tenta novamente dentro de um minuto.'; end if;
 insert into debate_private.questions(id,session_id,token_hash,text) values(p_id,p_session,h,btrim(p_text));
 perform debate_private.publish(s,v);
 return p_id;
end $$;

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
  s:=debate_private.auto_speakers(s);
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
  s:=debate_private.auto_speakers(s);
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

-- Fechar o EXECUTE por defeito antes de conceder apenas a API pública necessária.
do $$ declare f record; begin
 for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname in ('debate_get_state','debate_is_moderator','debate_admin_data','debate_vote_status','debate_vote','debate_submit_question','debate_questions','debate_react_question','debate_command') loop
  execute format('revoke all on function %s from public, anon, authenticated',f.sig);
 end loop;
end $$;
grant execute on function public.debate_get_state(), public.debate_vote_status(uuid,text), public.debate_vote(uuid,text,text,text), public.debate_submit_question(uuid,text,uuid,text), public.debate_questions(uuid,text), public.debate_react_question(uuid,text,uuid,integer) to anon,authenticated;
grant execute on function public.debate_is_moderator(), public.debate_admin_data(), public.debate_command(text,jsonb,bigint,uuid) to authenticated;
insert into debate_private.control(id,state) values(1,debate_private.fresh_state()) on conflict(id) do nothing;
select debate_private.seed_questions((state->>'sessionId')::uuid) from debate_private.control where id=1;
do $$ declare s jsonb; v bigint; begin select state,version into s,v from debate_private.control where id=1; perform debate_private.publish(s,v); end $$;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='debate_state') then alter publication supabase_realtime add table public.debate_state; end if;
end $$;
commit;
