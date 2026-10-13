# Verificação da implementação

## Automática

Última execução: **23 testes passaram, zero falhas**. O build também terminou com sucesso, incluindo a publicação pelo GitHub Actions.

Testes Node.js e PostgreSQL em PGlite cobrem:

- Relógios independentes e simultâneos, pausa/retoma e excedente.
- Deduções 30/60/90/90 por equipa e recuperação do estado anterior.
- Zero ou várias perguntas extra, alternância e 30 segundos por equipa.
- Participantes diferentes nas perguntas previstas e repetição nas extras.
- Vencedor por ganho líquido positivo, pares completos e empates.
- Bloqueio de comandos e dados privados para visitantes e contas não autorizadas.
- Voto único por fase, idempotência, opções inválidas e fecho de votação.
- Resultado privado antes da apresentação pública.
- Sugestões com limite de caracteres, intervalo mínimo e prevenção de duplicados.
- Comandos concorrentes e novas tentativas sem duplicar uma ação.
- Preservação dos votos do evento anterior ao preparar um novo.
- Rejeição de chaves privilegiadas na configuração pública.
- Mostrar/ocultar o QR preserva a fase e os instantes de fim dos dois relógios.
- A atualização SQL incremental funciona com estados anteriores sem o campo do QR e publica o comando corretamente.
- Totais públicos de votos iniciais/finais, sem duplicação por novas tentativas e sem divulgação de escolhas, participantes ou histórico. A migração do contador preserva votos e a versão dos comandos.

## No navegador

Percurso ensaiado no Codex In-app Browser:

- Voto inicial → ecrã de espera → contador na moderação.
- Apresentação abre com pergunta, opções, contador de participação e QR. Contador passou de 0 para 1 e 23 sem refresh.
- Ecrã de espera após o voto inclui convite para participar e botão para sugerir uma pergunta, com confirmação antes do envio.
- Pergunta só recebida pela moderação após confirmar o envio.
- Início do debate e atualização da página pública sem refresh.
- Contagem de ambos os relógios e pausa independente.
- Seleção de duas extras consecutivas com alternância e novos relógios.
- Closing statements → voto final → contagem de pares completos.
- Fecho da votação → dois gráficos → suspense → Contra com +4 votos.
- Refresh depois da revelação mantém o vencedor, sem repetir o suspense.
- QR code SVG grande gerado localmente, automático apenas antes do debate e com endereço legível por baixo.
- Ícone de moderação mostra/oculta o popup QR na apresentação, incluindo na votação final, sem parar os relógios em contagem.
- Página dos espectadores mantém a pergunta e os relógios quando o popup aparece na apresentação.
- Cabeçalhos e rodapés removidos nas duas vistas públicas; cartões azul/vermelho e dígitos brancos verificados no navegador.
- Ativação do som e passagem do relógio de um segundo a excedente, sem erros de execução no navegador.
- Avisos e controlo de som restritos à página de apresentação; espectador e moderação não criam áudio.

Validação responsiva no Chrome a **390 × 844 pixels**: inquérito, pergunta, relógios empilhados e painel de moderação, com largura do conteúdo dentro do ecrã e sem deslocamento horizontal. A ordem de navegação e os controlos adaptam-se ao ecrã estreito.

## Limite da verificação

## Ensaio na instalação online

A base de dados do projeto **Debate Moderator 3000** foi instalada e a app foi publicada em <https://1220823.github.io/Viralytics-Debate-Moderator/>. O modo da app é `live`.

Verificações realizadas no projeto real, com autorização para os dados de teste:

- Conta de moderação criada pelo proprietário, autorizada e login confirmado.
- Espectador no Chrome e moderação/apresentação no navegador do Codex: voto inicial, contador e mudança de fase sincronizados pela BD e Realtime.
- Envio de uma sugestão após confirmação e receção no painel.
- Dois relógios em contagem, pausa e popup QR sem modificar os relógios.
- Voto inicial Neutro e final Contra do mesmo espectador: um par completo, gráficos corretos e Contra com ganho de um voto.
- API dos dados de moderação rejeita acesso anónimo.
- Registo público de contas desativado e Site URL configurado para o endereço publicado.
- Sessão nova preparada no fim: zero votos e zero sugestões; dados do ensaio preservados na sessão anterior.

O teste usou navegadores separados no computador. O teste físico no telemóvel e a reprodução dos avisos no equipamento de som da sala ficam para o proprietário. O SQL continua a ter a cobertura local em PostgreSQL/PGlite.
