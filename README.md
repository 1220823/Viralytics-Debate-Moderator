# Superinteligência — app do debate

Página pública e painel de moderação, em português, com HTML/CSS/JavaScript e Supabase. Os ficheiros de `dist/` já estão gerados.

## Experimentar já, neste computador

Na pasta do projeto, executa:

```powershell
node scripts/serve.mjs
```

Abre:

- Público: <http://127.0.0.1:4173/>
- Moderação: <http://127.0.0.1:4173/moderacao.html>
- Projeção: <http://127.0.0.1:4173/index.html?projecao=1>

O modo inicial é **ensaio local**. Abre público e moderação em separadores do mesmo navegador. No painel escolhe **Entrar no ensaio local**. Neste modo não há palavra-passe nem sincronização entre computadores. O painel identifica o modo de ensaio; não o uses para o evento público.

Para ensaiar resultados, o botão **Gerar 22 votos de teste** cria os votos 15/2/5 durante o inquérito inicial e 12/1/9 durante o final. Se também votares nesse navegador, o teu voto é contado adicionalmente. **Preparar novo debate** abre uma nova sessão sem apagar a anterior.

Não abras os HTML diretamente com `file://`: os módulos e o armazenamento necessitam de um servidor HTTP. O endereço `127.0.0.1` só funciona neste computador; o QR code será utilizável pelos espectadores depois da publicação online.

## Usar no evento, com login e dispositivos diferentes

### 1. Criar o projeto Supabase

Cria um projeto no [Supabase](https://supabase.com/dashboard). Guarda a palavra-passe da base de dados na tua conta; não é usada pela app.

### 2. Preparar a base de dados

No **SQL Editor**, executa o conteúdo completo de `supabase/setup.sql`. O ficheiro cria as tabelas, funções, permissões e a publicação Realtime da tabela pública. Não são necessárias Edge Functions nem um servidor adicional.

A migração é repetível e não apaga votos ou perguntas existentes. `schema.template.sql` é a fonte da migração; após alterações ao código, `npm run build` atualiza `setup.sql`.

**Se já configuraste o Supabase antes desta atualização visual**, executa apenas `supabase/updates/2026-10-13-qr-popup.sql` no SQL Editor para acrescentar o comando do popup QR. Preserva os votos, sugestões e tempos existentes. Uma instalação nova já inclui esse comando em `setup.sql`.

Para mostrar o número de votos recebidos na apresentação num Supabase já configurado, executa também `supabase/updates/2026-10-13-poll-counts.sql`. Esta atualização publica apenas os totais de participação, preserva os dados existentes e mantém privadas as escolhas individuais. Novas instalações incluem tudo em `setup.sql`.

### 3. Criar as contas de moderação

Em **Authentication → Users**, cria uma conta por moderador, com email e palavra-passe. Confirma a conta no Dashboard para evitar depender de emails no dia do evento. Não há registo de utilizadores na app; desativa a criação pública de novas contas nas definições de autenticação do projeto.

Autoriza cada conta no SQL Editor, substituindo o email do exemplo:

```sql
insert into debate_private.moderators(user_id)
select id from auth.users where email = 'moderador@exemplo.pt'
on conflict (user_id) do nothing;
```

A conta precisa de existir primeiro. Para verificar que foi autorizada:

```sql
select u.email
from debate_private.moderators m
join auth.users u on u.id = m.user_id;
```

Ter uma conta Supabase Auth, por si só, não permite controlar o evento. Só as contas desta lista têm acesso aos comandos, contadores e sugestões.

### 4. Configurar a app

Em `config.js`, muda para:

```js
window.DEBATE_CONFIG = {
  mode: 'live',
  supabaseUrl: 'https://TEU-PROJETO.supabase.co',
  supabasePublishableKey: 'sb_publishable_A_TUA_CHAVE_PUBLICA',
  soundWarnings: [30, 10, 0],
};
```

O URL e a chave **publishable** estão nas definições de API do projeto. Uma chave antiga `anon` também funciona. São configurações públicas, protegidas pelas permissões da base de dados. **Nunca uses `secret`, `service_role`, a palavra-passe da base de dados ou um token pessoal.** A app rejeita as chaves privilegiadas conhecidas.

Instala as dependências e gera os ficheiros atualizados:

```powershell
npm ci
npm run build
```

Edita sempre o `config.js` da raiz. O build copia-o para `dist/config.js`.

### 5. Publicar no GitHub Pages

Coloca este projeto na raiz de um repositório GitHub, sem `node_modules/`. Para GitHub Free, usa um repositório público. O código não contém palavras-passe.

Em **Settings → Pages → Source**, escolhe **GitHub Actions**. A workflow `.github/workflows/pages.yml` instala dependências, executa os testes, gera `dist/` e publica essa pasta quando houver um push para `main`. Se usares outra branch, ajusta o campo `branches` da workflow.

O público abre o endereço do site; os moderadores acrescentam `/moderacao.html`. O modo de projeção usa `/index.html?projecao=1`. Todos os caminhos são relativos, pelo que funciona também em `https://utilizador.github.io/nome-do-repositorio/`.

Testa o login e a sincronização entre dois dispositivos antes do evento. A integração com uma conta Supabase real só pode ser verificada depois destes passos. Os testes incluídos verificam as funções e permissões em PostgreSQL local através de PGlite.

## Percurso do evento

1. O espectador vê primeiro o inquérito inicial: **A favor / Neutro / Contra**. Depois de votar, vê **O debate está prestes a começar**, uma mensagem sobre a participação ao longo do debate e o botão **Sugerir uma pergunta**. A apresentação mostra o tema, as três opções, o total de pessoas que já votaram e o QR para participar. A moderação vê o contador e carrega em **Começar debate** quando estiver pronta.
2. **Começar debate** fecha a votação inicial e mostra a primeira pergunta com os relógios pausados.
3. Em cada ronda, usa os controlos por equipa ou **Retomar/Pausar ambos**. Os dois relógios podem contar simultaneamente.
4. Rondas iniciais: **5 minutos por equipa**, A começa na primeira e Contra na segunda.
5. Relâmpago: **30 segundos por equipa** em cada uma das cinco perguntas. Os participantes já usados são assinalados; é necessária confirmação para repetir nas perguntas previstas.
6. Depois da quinta pergunta, escolhe **Adicionar pergunta do público** ou **Closing statements**. Depois de cada extra mantêm-se as mesmas opções, sem limite fixo de extras. Cada extra tem 30 segundos por equipa e permite repetir participantes.
7. Closing statements: **2 minutos e 30 segundos por equipa**.
8. **Abrir votação final** apresenta o mesmo inquérito a quem votou no início, no mesmo navegador.
9. **Fechar votação final** fixa os pares completos. **Mostrar resultados** publica os dois gráficos. **Revelar vencedor** apresenta três segundos de suspense e o resultado.

O relógio passa a indicar `+MM:SS` quando o tempo se esgota. Não há troca automática de equipa nem mudança de pergunta ao chegar a zero.

**Anterior** recupera a pergunta e os tempos guardados, em pausa. **Reiniciar pergunta** repõe tempos, participantes selecionados e penalizações dessa pergunta, após confirmação. **Desfazer última ação** restaura a ação anterior em pausa; as transições de votação e a preparação de um novo debate não podem ser desfeitas, para não reabrir votações já encerradas.

No botão de interrupção indevida, as deduções são 30, 60, 90 e depois sempre 90 segundos, por equipa e ronda inicial. A app não calcula a tolerância de 15 segundos nem retira respostas: essa indicação fica a cargo da moderação. Também não impõe o limite global de 40 minutos.

## Vencedor

Os gráficos e o vencedor usam **apenas as mesmas pessoas com dois votos completos**. Votos iniciais sem resposta final continuam no contador de votos recebidos, mas ficam fora da comparação.

`ganho = votos finais − votos iniciais`

- Vence a equipa com o maior ganho **positivo**.
- Ganhos positivos iguais: **Empate**.
- Nenhuma equipa ganha votos: **Empate**, mesmo que uma tenha perdido menos.
- Sem pares completos: não se revela um vencedor.
- Neutro aparece nos gráficos, mas não é uma equipa candidata.

No exemplo 15/2/5 → 12/1/9, ganha **Contra com +4 votos**, enquanto A favor perde 3.

O identificador do espectador fica no navegador, sem nome, email ou login. Limpar os dados, mudar de dispositivo ou usar navegação privada pode impedir o emparelhamento ou criar outro identificador. Não se comprova a identidade de cada pessoa; pede aos espectadores que votem uma vez por fase e mantenham o mesmo navegador.

## Perguntas, sons e ligação

As vistas de espectador e apresentação não têm cabeçalho nem rodapé. Os relógios usam azul para **A favor** e vermelho para **Contra**, com números brancos. O espectador mantém um botão discreto **Enviar uma pergunta** no canto inferior; na apresentação ficam os controlos de som e ecrã inteiro.

Antes de começar o debate, a apresentação mostra o **inquérito com opções e contador**, junto de um **QR code grande**, com o endereço completo da página de espectadores por baixo. Ao começar o debate, passa para a pergunta e os relógios. O pequeno ícone QR no topo do painel de moderação permite **mostrar ou ocultar um popup na apresentação em qualquer fase**, incluindo a votação final. Abrir o popup não pausa os relógios nem muda a fase; não afeta a página dos espectadores. Antes do início, o ícone assinala o QR automático. A votação final também mostra o total de votos recebidos.

As perguntas do público exigem **Rever pergunta → Confirmar envio**. Só ficam registadas após confirmação do servidor. Têm até 500 caracteres e um intervalo mínimo de 30 segundos por identificador. São apresentadas como texto, nunca como HTML. Os moderadores podem selecionar, editar o texto de uma extra, marcar debatida ou descartar/restaurar uma sugestão.

Só a **página de apresentação** tem o botão **Ativar som** e pode emitir avisos. Ativa-o nesse computador antes do debate; o botão emite um som de teste. Os avisos ocorrem aos 30 s, 10 s e zero apenas nas rondas iniciais e nos closing statements. Não há sons nas relâmpago ou na revelação do vencedor. Um refresh exige nova ativação.

Os relógios são calculados localmente a partir do instante de fim guardado no servidor; não há escritas por segundo. As mudanças usam Realtime e há leitura periódica de recuperação. Os contadores e sugestões do painel atualizam aproximadamente a cada três segundos.

Sem ligação, a página identifica o estado como potencialmente desatualizado. A contagem conhecida continua, mas não conhece novas pausas ou ajustes. Os comandos não são apresentados como concluídos sem resposta do servidor, nem guardados para executar silenciosamente depois. Uma ligação lenta pode atrasar a chegada das alterações.

Confirma que o projeto Supabase está ativo antes do evento: os projetos gratuitos podem ser pausados por baixa atividade. Mantém o navegador de projeção visível, o computador acordado e ensaia os sons na rede e equipamento da sala.

## Desenvolvimento e verificações

```powershell
npm ci
npm test
npm run build
npm run preview
```

`npm test` verifica relógios, penalizações, navegação, participantes, extras, cálculos e transições. Também executa a migração num PostgreSQL real em WASM (PGlite) e verifica permissões, duplicação de votos, fecho das votações e privacidade dos resultados antes da apresentação.

Estrutura principal:

- `src/`: interface, estilos, motor do debate e adaptadores local/Supabase.
- `config.js`: configuração pública do ambiente.
- `supabase/setup.sql`: backend pronto para o SQL Editor.
- `tests/`: verificações automáticas.
- `scripts/`: build e servidor local.
- `dist/`: site estático gerado, pronto para alojamento.
- `.github/workflows/pages.yml`: publicação no GitHub Pages.

O login e a API online ainda necessitam da configuração do teu projeto Supabase. O ficheiro `plano-app-debate.md` conserva a especificação acordada.
