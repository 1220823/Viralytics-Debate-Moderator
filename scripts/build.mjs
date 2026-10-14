import { build } from 'esbuild';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { newState } from '../src/core.js';
import { SEED_QUESTIONS } from '../src/seeds.js';
await mkdir('dist/assets', { recursive: true });
await build({ entryPoints: { public: 'src/public.js', moderator: 'src/moderator.js' }, outdir: 'dist/assets', bundle: true, format: 'esm', splitting: true, chunkNames: 'shared-[hash]', minify: true, target: ['es2022'], legalComments: 'eof' });
for (const f of ['index.html', 'moderacao.html', 'config.js']) await copyFile(f, `dist/${f}`);
const { readFile } = await import('node:fs/promises');
await writeFile('dist/assets/style.css', await readFile('src/style.css', 'utf8') + '\n' + await readFile('src/interaction.css', 'utf8'));
await copyFile('static/icon.svg', 'dist/assets/icon.svg');
await writeFile('dist/.nojekyll', '');
// A migração contém o estado inicial para não exigir um segundo ficheiro no SQL Editor.
const template = await readFile('supabase/schema.template.sql', 'utf8');
const setup = template.replace('__INITIAL_STATE__', JSON.stringify(newState(0, '00000000-0000-4000-8000-000000000001')).replaceAll("'", "''")).replace('__SUGGESTION_SEEDS__', JSON.stringify(SEED_QUESTIONS).replaceAll("'", "''"));
await writeFile('supabase/setup.sql', setup);
await mkdir('data', { recursive: true });
await writeFile('data/sugestoes-iniciais.json', JSON.stringify(SEED_QUESTIONS, null, 2) + '\n');
await writeFile('supabase/importar-sugestoes-iniciais.sql', '-- Executar no SQL Editor: importa as duas sugestões na sessão atual sem as duplicar.\ndo $$ declare s jsonb; v bigint; begin select state,version into s,v from debate_private.control where id=1 for update; perform debate_private.seed_questions((s->>\'sessionId\')::uuid); perform debate_private.publish(s,v); end $$;\n');
await mkdir('supabase/updates', { recursive: true });
await writeFile('supabase/updates/2026-10-14-interacao.sql', setup);
const commandStart = template.indexOf('create or replace function public.debate_command(');
const commandEnd = template.indexOf('\nend $$;', commandStart) + '\nend $$;'.length;
await writeFile('supabase/updates/2026-10-13-qr-popup.sql', '-- Atualiza apenas os comandos de moderação. Preserva votos, perguntas e tempos.\n-- Executar no SQL Editor se o projeto Supabase já foi configurado.\nbegin;\n' + template.slice(commandStart, commandEnd) + '\ncommit;\n');
console.log('Pronto: dist/ (páginas estáticas) e supabase/setup.sql (configuração do backend).');
function sqlFunction(name) {
  const start = template.indexOf(`create or replace function ${name}(`);
  const end = template.indexOf('\nend $$;', start);
  if (start < 0 || end < 0) throw Error(`Função SQL não encontrada: ${name}`);
  return template.slice(start, end + '\nend $$;'.length);
}
await writeFile('supabase/updates/2026-10-13-poll-counts.sql', '-- Publica apenas os totais de participação, sem divulgar escolhas. Preserva dados e tempos.\nbegin;\n' + sqlFunction('debate_private.publish') + '\n' + sqlFunction('public.debate_vote') + '\ndo $$ declare s jsonb; v bigint; begin select state,version into s,v from debate_private.control where id=1; perform debate_private.publish(s,v); end $$;\ncommit;\n');
