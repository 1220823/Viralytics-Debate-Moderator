# Superinteligência — app do debate

Página pública e painel de moderação, em português, com HTML/CSS/JavaScript e Supabase. Os ficheiros de `dist/` já estão gerados.

## Instalação publicada

Esta cópia está configurada em **modo live**, com a base de dados Supabase do projeto **Debate Moderator 3000** e publicação pelo GitHub Pages:

- Público: <https://1220823.github.io/Viralytics-Debate-Moderator/>
- Moderação: <https://1220823.github.io/Viralytics-Debate-Moderator/moderacao.html>
- Apresentação: <https://1220823.github.io/Viralytics-Debate-Moderator/index.html?projecao=1>

O acesso de moderação foi criado e autorizado no Supabase. Usa o email e a palavra-passe definidos no Dashboard. Os espectadores não precisam de conta. O registo público de novas contas está desativado; novas contas de moderação devem ser criadas no Dashboard e autorizadas na tabela `debate_private.moderators`.

Para testar em vários dispositivos, abre a moderação no computador, a apresentação no ecrã da sala e a página pública num telemóvel. Todos precisam de Internet; não precisam de estar na mesma rede. Faz o voto inicial no telemóvel, confirma o contador na apresentação, começa o debate pelo painel e envia uma sugestão com confirmação. Para testar o voto final, mantém o mesmo navegador no telemóvel. Só a apresentação emite os avisos sonoros depois de carregares em **Ativar som**.

**Preparar novo debate** cria uma sessão nova e preserva os votos e sugestões da sessão anterior. O estado é partilhado: evita reiniciar a sessão enquanto outro moderador estiver a conduzir um evento.

## Atualização de interação

O público só vê o acesso às perguntas depois de votar no inquérito inicial; durante os formulários de votação esse botão fica oculto. Em **Perguntas do público**, pode consultar sugestões, enviar uma nova com confirmação e dar **Gosto (+1)** ou **Não gosto (−1)**. Uma reação por pergunta e navegador; carregar novamente retira a reação. Perguntas iguais, ignorando maiúsculas e espaços, são recusadas. A moderação recebe as perguntas ordenadas por pontuação, incluindo na seleção de extras.

Cada equipa tem um único botão branco que alterna entre **Retomar tempo** e **Parar tempo**. Em todas as rondas do debate, **Atenuar cartão / Destacar cartão** altera apenas o aspeto público do cartão, sem pausar o relógio. A configuração visual é guardada por pergunta; voltar à anterior recupera-a com os relógios em pausa.

O popup do público mostra a pergunta, a pontuação no canto superior direito e dois ícones: **Não gosto** à esquerda (vermelho) e **Gosto** à direita (verde). A seleção intensifica a cor e o número muda com uma pequena animação. As perguntas surgem por pontuação descendente. Na moderação, cada sugestão mostra apenas o texto, a pontuação e **Usar como extra**.

Nas primeiras cinco relâmpago (três fixas e duas primeiras extras), os participantes são preenchidos automaticamente pelo primeiro ao quinto nome de cada equipa. A moderação pode alterar a escolha; voltar à pergunta anterior preserva a seleção guardada. Extras seguintes ficam para seleção manual. A migração **supabase/updates/2026-10-14-participantes.sql** atualiza estes comandos sem apagar dados ou alterar tempos.

O build usa nomes de ficheiro com identificadores de conteúdo para JavaScript e CSS. Ao recarregar a página, o navegador pode identificar os ficheiros atualizados sem reutilizar os controlos antigos em cache.

Há **três relâmpago fixas**. As duas antigas perguntas finais entram automaticamente como sugestões da organização em cada sessão nova. Estão guardadas em `data/sugestoes-iniciais.json`; a fonte é `src/seeds.js`. Para voltar a importá-las no debate atual, executar **supabase/importar-sugestoes-iniciais.sql** no SQL Editor. A importação não as duplica.

Para atualizar outro projeto já instalado, executar **supabase/updates/2026-10-14-interacao.sql**; preserva os dados existentes. Preparar depois um novo debate para passar a três perguntas fixas. **supabase/limpar-dados-debate.sql** é uma limpeza completa dos dados de todas as sessões (votos, perguntas, reações e ações), seguida de um debate novo com as duas sugestões; preserva as contas de moderação e os participantes. Guardar uma cópia antes de o usar. A cópia local desta atualização está em **backups/antes-limpeza-2026-10-14.json**, ignorada pelo Git e fora da pasta publicada.

## Experimentar já, neste computador

Na pasta do projeto, executa:

```powershell
node scripts/serve.mjs
```

Abre:

- Público: <http://127.0.0.1:4173/>
- Moderação: <http://127.0.0.1:4173/moderacao.html>
- Projeção: <http://127.0.0.1:4173/index.html?projecao=1>

Nesta instalação, o servidor local também usa a **BD real**, porque `config.js` tem `mode: 'live'`. Para um ensaio isolado neste computador, muda temporariamente para `mode: 'demo'` e volta a gerar `dist/` com `npm run build`. Nesse modo, abre público e moderação em separadores do mesmo navegador e escolhe **Entrar no ensaio local**. Não há palavra-passe nem sincronização entre computadores. Volta a `mode: 'live'` antes de publicar; um push para `main` publica a configuração que estiver no ficheiro.

Para ensaiar resultados, o botão **Gerar 22 votos de teste** cria os votos 15/2/5 durante o inquérito inicial e 12/1/9 durante o final. Se também votares nesse navegador, o teu voto é contado adicionalmente. **Preparar novo debate** abre uma nova sessão sem apagar a anterior.

Não abras os HTML diretamente com `file://`: os módulos e o armazenamento necessitam de um servidor HTTP. O endereço `127.0.0.1` só funciona neste computador; o QR code será utilizável pelos espectadores depois da publicação online.

## Usar no evento, com login e dispositivos diferentes

### 1. Criar o projeto Supabase

Cria um projeto no [Supabase](https://supabase.com/dashboard). Guarda a palavra-passe da base de dados na tua conta; não é usada pela app.

### 2. Preparar a base de dados

No **SQL Editor**, executa o conteúdo completo de `supabase/setup.sql`. O ficheiro cria as tabelas, funções, permissões e a publicação Realtime da tabela pública. Não são necessárias Edge Functions nem um servidor adicional.

A migração é repetível e não apaga votos ou perguntas existentes. `schema.template.sql` é a fonte da migração; após alterações ao código, `npm run build` atualiza `setup.sql`.

**Se o Supabase já está configurado**, executa `supabase/updates/2026-10-14-interacao.sql` no SQL Editor. Inclui o popup QR, os totais de participação, as sugestões e as reações. Preserva os votos, perguntas e tempos existentes. Uma instalação nova já inclui tudo em `setup.sql`.

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
3. Em cada ronda, usa os controlos por equipa ou **Retomar/Parar ambos**. Os dois relógios podem contar simultaneamente.
4. Rondas iniciais: **5 minutos por equipa**, A começa na primeira e Contra na segunda.
5. Relâmpago: **30 segundos por equipa** em cada uma das três perguntas fixas. Os participantes já usados são assinalados; é necessária confirmação para repetir nas perguntas previstas.
6. Depois da terceira pergunta, escolhe **Adicionar pergunta do público** ou **Closing statements**. Depois de cada extra mantêm-se as mesmas opções, sem limite fixo de extras. Cada extra tem 30 segundos por equipa e permite repetir participantes.
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
