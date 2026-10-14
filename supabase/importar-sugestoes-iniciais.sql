-- Executar no SQL Editor: importa as duas sugestões na sessão atual sem as duplicar.
do $$ declare s jsonb; v bigint; begin select state,version into s,v from debate_private.control where id=1 for update; perform debate_private.seed_questions((s->>'sessionId')::uuid); perform debate_private.publish(s,v); end $$;
