-- Publica apenas os totais de participação, sem divulgar escolhas. Preserva dados e tempos.
begin;
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
do $$ declare s jsonb; v bigint; begin select state,version into s,v from debate_private.control where id=1; perform debate_private.publish(s,v); end $$;
commit;
