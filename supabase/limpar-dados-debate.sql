-- APAGA todos os votos, sugestões, reações e ações do debate, incluindo sessões antigas.
-- Preserva as contas Auth, moderadores autorizados e nomes das equipas/participantes.
-- Executar apenas depois de guardar uma cópia de segurança.
begin;
do $$ declare s jsonb; v bigint; begin
 select state,version into s,v from debate_private.control where id=1 for update;
 delete from debate_private.question_reactions;
 delete from debate_private.questions;
 delete from debate_private.votes;
 delete from debate_private.actions;
 s:=debate_private.fresh_state()||jsonb_build_object('teams',s->'teams');
 update debate_private.control set state=s,version=v+1 where id=1;
 perform debate_private.seed_questions((s->>'sessionId')::uuid);
 perform debate_private.publish(s,v+1);
end $$;
commit;
