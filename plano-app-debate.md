# Plano da mini app de moderação do debate

Tema: **Superintelligence and the future of humanity: Science or Speculation?**

Questão geral: **Superinteligência: progresso ou ameaça?**

Equipa A: **A favor — Progresso**. Equipa B: **Contra — Ameaça**.

Este documento conserva a especificação acordada. A implementação local encontra-se nesta pasta; o README explica o modo de ensaio, a configuração do Supabase e a publicação.

## 1. Decisões já confirmadas

- Dois relógios independentes: podem estar ambos a contar, ambos parados ou apenas um a contar.
- A aplicação usa os tempos de cada ronda/pergunta. Não impõe um limite global de 40 minutos.
- Existem pelo menos cinco participantes por equipa, permitindo cinco respostas relâmpago por pessoas diferentes.
- São esperados cerca de 20 espectadores ou mais, e a ligação à Internet pode ser lenta.
- A página pública não exige login.
- O painel dos moderadores exige login e autorização.
- O envio de perguntas pelo público exige confirmação antes da submissão.
- Os avisos sonoros existem apenas nas rondas iniciais e nos closing statements.
- A tolerância e a perda de respostas relâmpago são geridas pela equipa de moderação fora da app. Os relógios seguem o funcionamento normal, sem bloquear respostas.
- Existe um inquérito inicial e outro final com as opções **A favor**, **Neutro** e **Contra**.
- A comparação e o cálculo do vencedor usam apenas os espectadores que responderam nas duas fases.
- Cada espectador vota nas duas fases no mesmo navegador, sem login, para permitir ligar as respostas através de um identificador anónimo.
- Vence a equipa que tiver o maior ganho líquido positivo de votos. Ganhos iguais ou ausência de ganho positivo nas duas equipas resultam em **Empate**.
- Os moderadores controlam a abertura e fecho dos inquéritos, a apresentação dos gráficos e a revelação do vencedor.
- Depois das cinco perguntas relâmpago, os moderadores podem realizar zero, uma ou várias perguntas extra escolhidas entre as sugestões do público, sem limite fixo. Após cada extra podem adicionar outra ou avançar para os closing statements.

## 2. Solução técnica proposta

**HTML, CSS e JavaScript**, com o SDK do Supabase. Não é necessário um framework de interface para este tamanho de aplicação.

**GitHub Pages** aloja os ficheiros das duas páginas. **Supabase** fornece autenticação, base de dados, sincronização em tempo real e pequenas funções para receber perguntas e votos do público com validação e limite de frequência. Não há um servidor próprio para instalar ou manter.

Percurso dos dados:

1. Um moderador autenticado executa uma ação.
2. O Supabase verifica a autorização e guarda a alteração.
3. As páginas ligadas recebem o novo estado e atualizam a interface.
4. Cada página desenha a contagem decrescente localmente, a partir dos instantes guardados.

São necessários uma conta GitHub, um repositório e um projeto Supabase. Para cerca de 20 espectadores, a proposta é começar nos planos gratuitos. O limite atual de ligações Realtime simultâneas do Supabase Free é 200; as páginas de projeção e moderação também usam ligações. Se o público previsto aumentar significativamente, revê-se esse dimensionamento.

A interface não inclui vídeos, imagens pesadas ou fontes externas obrigatórias. Os relógios não fazem pedidos a cada segundo: apenas as mudanças de estado precisam de ser transmitidas. Isto reduz a dependência de largura de banda; a latência da rede ainda pode atrasar a chegada de um comando a outros dispositivos, pelo que a app não promete sincronização instantânea numa ligação lenta.

Referências: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Supabase Realtime](https://supabase.com/docs/guides/realtime/postgres-changes), [planos Supabase](https://supabase.com/pricing).

## 3. Página pública

### Percurso do espectador

**Inquérito inicial → espera → debate → inquérito final → espera → gráficos comparativos → suspense → vencedor.**

Durante o inquérito inicial, ao abrir a página, aparece o tema **Superinteligência: progresso ou ameaça?**, a indicação **Qual é a tua posição?** e três opções: **A favor**, **Neutro** e **Contra**. O espectador escolhe uma opção e carrega em **Votar**. Depois de o servidor confirmar o voto, aparece **O debate está prestes a começar**. O tema completo do evento pode surgir como subtítulo.

Essa espera é individual: quem já votou fica a aguardar, enquanto os restantes ainda podem responder. O ecrã de espera explica que o espectador pode sugerir perguntas ao longo do debate e inclui um botão para o fazer. A apresentação mostra a pergunta, as opções, o QR para participar e o total de pessoas que já votaram. O moderador vê o mesmo total e um botão para começar o debate. Os votos por opção não são divulgados nesta fase, para não influenciar as respostas seguintes.

Quando o moderador começa o debate, todos passam para a pergunta e os relógios, sem precisarem de atualizar a página. Quem abrir a página depois do fecho do inquérito inicial acompanha a fase atual; não preenche retroativamente o inquérito nem entra na comparação final.

Depois dos closing statements, o moderador abre o inquérito final. Os espectadores que votaram no início veem exatamente a mesma pergunta e as mesmas três opções. Depois de votar, veem **Obrigado pelo teu voto. Os resultados serão apresentados em breve.** Quem não votou no início pode acompanhar esta fase e os resultados, mas não submete um voto final para a comparação.

O moderador fecha o inquérito final antes de apresentar os resultados. A partir daí, os resultados ficam fixos e os pedidos de voto tardios são recusados.

### Disposição

- Faixa superior com a pergunta completa, ocupando toda a largura.
- Identificação da fase: ronda inicial 1, ronda inicial 2, relâmpago 1/5 a 5/5, pergunta extra do público com o respetivo número ou closing statement.
- Dois cartões grandes abaixo: nome e posição da equipa, tempo em formato `MM:SS` e estado do relógio.
- Cores distintas para as equipas, com texto e símbolos para que a identificação não dependa apenas da cor.
- Destaque dos relógios em contagem. Ambos podem estar destacados simultaneamente.
- Indicação textual de pausa, fim do tempo e eventual excedente.
- Botão **Enviar uma pergunta** e indicação discreta do estado da ligação.

Em computador/projetor, os cartões ficam lado a lado. Em ecrãs estreitos, adaptam-se sem cortar a pergunta nem criar deslocamento horizontal. O tamanho do texto acompanha o espaço disponível.

Um **modo de projeção** permite ecrã inteiro, oculta o formulário de perguntas e apresenta o essencial para a sala. Antes do debate mostra automaticamente um QR code grande com o endereço da página dos espectadores por baixo. Ao começar o debate passa para a pergunta e os relógios. Um pequeno ícone no painel dos moderadores mostra ou oculta o QR como popup em qualquer fase, incluindo no fim, sem pausar os relógios. Na votação final o QR só aparece se a moderação o pedir. Não exige que o computador de projeção vote para acompanhar as fases. É uma opção da mesma página pública. As vistas de espectador e projeção não têm cabeçalho nem rodapé; os cartões dos relógios são azul e vermelho, com números brancos.

### Gráficos e revelação

Após o fecho do inquérito final, o moderador carrega em **Mostrar resultados**. Aparecem dois gráficos de barras, **Antes do debate** e **Depois do debate**, com as categorias **A favor**, **Neutro** e **Contra**. Os gráficos usam as mesmas cores por categoria, uma escala comum que começa em zero e valores numéricos visíveis. Ficam lado a lado no projetor e adaptam-se a ecrãs pequenos.

Os dois gráficos usam apenas os participantes com as duas respostas completas. A legenda identifica a base: **Comparação de X espectadores que votaram no início e no fim**. Os totais gerais de votos recebidos em cada fase podem aparecer como informação adicional, claramente separados da base de comparação.

Em seguida, o moderador carrega em **Revelar vencedor**. Surge **A equipa vencedora é…**, com cerca de três segundos de suspense visual, seguido de **A favor**, **Contra** ou **Empate**. A revelação é uma fase partilhada, com o instante de apresentação guardado no servidor. Abrir a página ou atualizar depois da revelação mostra diretamente o resultado, sem repetir a animação. Não se acrescentam avisos sonoros nesta fase.

Junto do resultado final aparecem os ganhos de cada equipa, por exemplo **A favor: −3 votos** e **Contra: +4 votos**, para tornar o critério transparente.

### Ronda relâmpago

- Identificação visível **⚡ Ronda Relâmpago** e contador de perguntas, por exemplo **3 de 5**.
- Ícone de raio e uma transição breve ao entrar nesta fase, respeitando a preferência do dispositivo por movimento reduzido.
- Dois relógios de 30 segundos, um por equipa, para cada pergunta.
- Indicação de quem responde primeiro, alternando entre perguntas.
- Nome ou número do participante selecionado, se os moderadores quiserem mostrá-lo.
- Os relógios mantêm o funcionamento normal mesmo quando a moderação indica que uma equipa não pode responder; não há bloqueio nem retirada de oportunidades na app.

Depois da quinta pergunta e depois de cada pergunta extra, o painel oferece duas ações: **Adicionar pergunta do público** ou **Avançar para closing statements**. As perguntas extra são opcionais: podem ser realizadas zero, uma ou várias, sem limite fixo imposto pela app.

Ao escolher adicionar, o moderador consulta as sugestões recebidas, seleciona uma e revê o texto antes de confirmar. Só a pergunta confirmada aparece na página pública, identificada como **⚡ Pergunta extra do público — 1**, **2**, etc. Para cada nova pergunta, os dois relógios são preparados com **30 segundos por equipa**, inicialmente em pausa. Mantém-se a alternância da equipa que responde primeiro relativamente à pergunta imediatamente anterior, incluindo entre perguntas extra, e não há sons nesta fase.

Nas perguntas extra podem ser selecionados participantes já usados, para permitir várias intervenções com equipas de apenas cinco elementos. A regra de participantes diferentes mantém-se nas cinco perguntas do programa.

Cancelar a seleção não altera a pergunta pública nem os tempos e não consome um número de pergunta extra. Se não houver sugestões disponíveis, o painel informa o moderador e permite avançar para os closing statements. O moderador pode terminar esta fase após qualquer pergunta ou dispensá-la completamente. O avanço para os closing statements é sempre uma escolha explícita, e o moderador mantém o controlo sobre o início dos relógios e a mudança de fase.

### Sons

Proposta inicial: um aviso aos **30 segundos**, outro aos **10 segundos** e um sinal ao chegar a **zero**, apenas nas rondas iniciais e nos closing statements. Os momentos podem ser ajustados antes do evento.

Os espectadores têm som desligado por defeito. No computador de projeção existe **Ativar e testar som**. A ativação é local ao dispositivo; não se transmite a todos os telemóveis. Os avisos não se repetem por causa de um refresh, pausa ou reconexão, e não são reproduzidos retroativamente para quem abre a página mais tarde.

Os navegadores podem bloquear áudio iniciado sem interação do utilizador, pelo que esse botão faz parte do funcionamento previsto. Referência: [políticas de reprodução de áudio](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).

## 4. Painel dos moderadores

Login por email e palavra-passe, com contas criadas previamente para os moderadores. Não existe registo público.

O painel inclui uma pré-visualização da pergunta e dos dois relógios, seguida dos controlos:

| Ação | Comportamento |
| --- | --- |
| Iniciar/retomar A ou B | Atua apenas sobre o relógio escolhido. |
| Pausar A ou B | Guarda o tempo restante desse relógio. |
| Iniciar/pausar ambos | Atua sobre os dois relógios numa única ação. |
| Ajustar tempo | Permite acrescentar/retirar segundos ou definir um valor exato. |
| Aplicar penalização | Mostra a dedução prevista e regista a ocorrência. |
| Desfazer última ação | Corrige um clique acidental e restaura o estado anterior em pausa. |
| Próxima pergunta | Carrega a pergunta e os tempos previstos, inicialmente em pausa. |
| Pergunta anterior | Recupera o estado guardado dessa pergunta, em pausa. |
| Reiniciar pergunta | Repõe os tempos previstos, após confirmação. |
| Escolher pergunta | Permite saltar para uma pergunta/fase ou colocar uma pergunta aprovada do público. |
| Adicionar pergunta relâmpago do público | Após a quinta pergunta e cada extra, permite escolher e confirmar outra sugestão, preparando 0:30 por equipa, sem limite fixo de extras. |
| Avançar para closing statements | Permite dispensar todas as extras ou avançar depois de qualquer uma. |
| Abrir inquérito inicial | Ativa a votação inicial na página pública. |
| Começar debate | Fecha a votação inicial e apresenta a primeira pergunta, com relógios em pausa. |
| Abrir inquérito final | Apresenta a mesma pergunta aos espectadores elegíveis, após os closing statements. |
| Fechar inquérito final | Encerra os votos e fixa a comparação dos pares completos. |
| Mostrar resultados | Apresenta os dois gráficos de barras. |
| Revelar vencedor | Inicia o suspense visual e apresenta o resultado calculado. |

**Regressar à pergunta anterior** e **reiniciar a pergunta** são ações distintas: regressar preserva o estado guardado; reiniciar começa de novo. Tempos, participantes e penalizações da pergunta não se apagam implicitamente ao navegar.

Na ronda relâmpago, o painel indica quem começa e permite selecionar um participante por equipa. Os participantes já usados ficam assinalados; uma repetição exige uma decisão explícita do moderador. Como proposta inicial, a equipa A começa a primeira pergunta relâmpago; essa escolha é configurável. A ordem dos closing statements também é selecionável.

Vários moderadores podem consultar o painel. Recomenda-se combinar quem opera os relógios. As alterações usam a versão atual do estado para impedir que dois comandos concorrentes se sobrescrevam silenciosamente.

Durante o inquérito inicial e a espera, o painel mostra **Já votaram: X pessoas**. Durante o inquérito final mostra **Votos iniciais: X**, **Votos finais: Y** e **Respostas completas para comparação: Z**. Os contadores atualizam-se à medida que os votos são aceites. O vencedor só é calculado a partir da comparação fixada ao fechar o inquérito final.

Navegar entre perguntas ou reiniciar um relógio não apaga votos nem reabre inquéritos. Um reinício completo do evento é uma ação separada, com confirmação, que cria uma nova sessão de votação e preserva os dados da anterior.

## 5. Tempos e regras

| Fase | Número de perguntas/intervenções | Tempo por equipa |
| --- | --- | --- |
| Ronda inicial 1 | 1 pergunta; A começa | 5:00 |
| Ronda inicial 2 | 1 pergunta; B começa | 5:00 |
| Ronda relâmpago | 5 perguntas; primeira equipa alternada | 0:30 por pergunta |
| Relâmpago extra do público | 0 ou mais perguntas, sem limite fixo, por decisão dos moderadores | 0:30 por pergunta |
| Closing statement | 1 intervenção por equipa | 2:30 |

As indicações de ordem orientam a moderação, mas não bloqueiam a possibilidade confirmada de ter os dois relógios a contar ao mesmo tempo.

Ao chegar a zero, a proposta é mostrar **Tempo esgotado** e medir o excedente até o moderador parar o relógio. Não se muda automaticamente de pergunta nem se começa o relógio adversário. Isso permite verificar excessos de tempo sem perder controlo sobre o debate.

### Penalizações

Nas rondas iniciais, o botão de interrupção indevida sugere:

- Primeira ocorrência: retirar 30 segundos.
- Segunda ocorrência: retirar 60 segundos.
- Terceira e seguintes: retirar 90 segundos.

Proposta a validar: contar as ocorrências separadamente por equipa e por ronda. A aplicação calcula a dedução seguinte, mas o moderador decide quando a aplicar. Tempo retirado por penalização é distinguido de tempo efetivamente excedido.

**Decisão confirmada:** a app não calcula a tolerância de 15 segundos nem a perda de respostas relâmpago. A equipa de moderação dá diretamente a indicação de que uma equipa não pode responder. Os tempos continuam disponíveis normalmente, sem contadores de oportunidades ou bloqueios. Mantêm-se os controlos de pausa, retoma e ajuste de tempo.

A eventual retirada de um closing statement também pode ser gerida pela moderação, não iniciando essa intervenção e avançando para a fase seguinte. Não é necessário um mecanismo de elegibilidade na app.

## 6. Perguntas do público

Fluxo: **escrever → rever → confirmar envio → receber confirmação**.

- Sem login e, por defeito, sem pedir nome ou email.
- Campo de texto com limite proposto de 500 caracteres.
- Ecrã de confirmação com **Voltar a editar**, **Cancelar** e **Confirmar envio**.
- Mensagem de sucesso apenas depois de a pergunta ser aceite pelo servidor.
- Validação e limite de frequência no servidor, com prevenção de duplicados em novas tentativas.
- Perguntas apresentadas como texto; nunca interpretadas como HTML.

Os moderadores recebem uma lista com estados **nova**, **selecionada**, **debatida** e **descartada**. Podem filtrar, selecionar e colocar uma pergunta no ecrã público com duração escolhida. Existe também o percurso específico de **perguntas relâmpago extra**, disponível depois das cinco perguntas previstas e repetível após cada extra, com 30 segundos por equipa em cada pergunta. As extras mantêm-se separadas das sete perguntas do programa para não alterar os seus textos ou tempos. Cada sugestão escolhida fica assinalada na lista para os moderadores acompanharem o que já foi selecionado e debatido.

As perguntas submetidas não são publicadas automaticamente. Só a pergunta que os moderadores escolhem mostrar passa a ser pública.

## 7. Votação, comparação e vencedor

### Identificação anónima e resposta única

Um identificador e um token anónimos são guardados no navegador para esta sessão de debate. Ligam o voto inicial ao final e permitem recuperar o estado após refresh, sem pedir nome, email ou login.

O servidor aceita no máximo um voto inicial e um final por identificador e sessão. Valida a opção escolhida, a fase aberta e a existência do voto inicial antes de aceitar o final. Novas tentativas após falha de rede ou pedidos feitos em dois separadores não criam votos duplicados. O voto só é apresentado como concluído após confirmação do servidor.

Esta solução limita votos por navegador, não comprova a identidade de cada pessoa: usar outro dispositivo ou limpar os dados do navegador pode criar outro identificador. Os espectadores recebem a instrução simples **Usa o mesmo navegador para votar no início e no fim**. A proposta mantém o acesso sem login, adequado ao evento pequeno descrito.

### Base de comparação

Depois do fecho final, selecionam-se apenas os identificadores com um voto inicial e um voto final. As contagens das três opções são calculadas duas vezes sobre esse mesmo conjunto de pessoas. Votos iniciais sem resposta final ficam fora dos gráficos comparativos e do cálculo do vencedor, embora permaneçam no total de votos iniciais recebido pelo moderador.

Não se publicam identificadores, tokens ou respostas individuais. A página pública recebe apenas as contagens agregadas autorizadas e o resultado final. Os resultados agregados não ficam disponíveis ao público antes da fase de apresentação.

### Critério de vitória confirmado

Para cada equipa:

**Ganho líquido = votos finais − votos iniciais**, usando apenas as respostas emparelhadas.

- **A favor** vence se o seu ganho for positivo e superior ao ganho de Contra.
- **Contra** vence se o seu ganho for positivo e superior ao ganho de A favor.
- **Empate** se os ganhos positivos forem iguais ou se nenhuma das duas equipas tiver ganho positivo.
- Os votos **Neutro** aparecem nos gráficos, mas não correspondem a uma equipa candidata à vitória.

Exemplo fornecido:

| Opção | Início | Fim | Variação |
| --- | ---: | ---: | ---: |
| A favor | 15 | 12 | −3 |
| Neutro | 2 | 1 | −1 |
| Contra | 5 | 9 | +4 |

Resultado: **Contra vence, com um ganho líquido de 4 votos.** O número final absoluto de votos não decide a vitória.

Se não existir nenhum par de respostas completo, os gráficos indicam **Sem respostas completas para comparar** e a revelação do vencedor fica indisponível. Não se declara um empate sem dados.

## 8. Relógios, dados e acesso

Um relógio guarda o tempo restante em pausa ou o instante de fim quando está em contagem. Os instantes são calculados com referência ao relógio do servidor. O ecrã calcula a diferença localmente; não há uma escrita na base de dados por segundo.

O estado mínimo contém a sessão do evento, fase, pergunta, versão, relógios A/B, participantes selecionados e estado de abertura dos inquéritos. Inclui uma lista ordenada das perguntas relâmpago extra, cada uma com identificador, número, texto confirmado, referência à sugestão escolhida e estado dos relógios. Novos comandos podem acrescentar novas extras; reenviar o mesmo comando após falha não duplica uma pergunta. Regressar a uma extra anterior recupera o seu estado guardado em pausa. Guardam-se também o estado de cada pergunta, um histórico de ações para correções, as perguntas do público e os votos anónimos. A comparação final fica num resultado agregado fixo, com o número de pares completos, contagens, ganhos, vencedor e instante de revelação. O histórico, as perguntas submetidas e os votos individuais são privados.

O Supabase valida permissões no servidor: visitantes podem ler o estado público e usar as funções de submissão de perguntas e votos; apenas contas autorizadas de moderadores podem controlar o debate, abrir/fechar inquéritos, consultar contadores privados, ler a caixa de perguntas e publicar resultados. A leitura direta de votos individuais é bloqueada. Esconder botões ou um endereço não é a proteção. As chaves privilegiadas nunca são incluídas no site ou no repositório.

No GitHub Pages, os ficheiros estáticos da página de moderação podem ser descarregados publicamente; os dados privados e comandos continuam protegidos por autenticação e autorização no Supabase. O painel só apresenta os controlos e dados após validar a sessão e a autorização.

Referência: [permissões por linha no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

## 9. Perda de ligação e preparação do evento

- Um refresh recupera a pergunta e os tempos atuais, sem reiniciar o debate.
- Se uma página perder ligação, identifica o estado como potencialmente desatualizado. Pode continuar a desenhar a contagem a partir do último instante conhecido, mas não sabe de novas pausas ou ajustes.
- Comandos de moderação sem confirmação do servidor não aparecem como concluídos. Não são guardados para executar silenciosamente mais tarde.
- Ao recuperar ligação, a página lê novamente o estado atual.
- Um voto com erro de rede pode ser reenviado com o mesmo identificador, sem duplicar a contagem. Se a fase entretanto fechar, a app apresenta que a votação terminou, sem afirmar que o voto foi aceite.
- O funcionamento partilhado depende de Internet. Não está previsto sincronizar dispositivos offline na primeira versão.

No plano gratuito, o Supabase pode pausar projetos com pouca atividade durante um período de sete dias. Antes do evento é necessário confirmar que o projeto está ativo e ensaiar a app na rede e no computador de projeção. Referência: [pausa de projetos gratuitos](https://supabase.com/docs/guides/platform/free-project-pausing).

## 10. Sequência de implementação e verificação

1. **Interface pública:** inquéritos, espera, pergunta, cartões, adaptação a telemóvel/projetor, raio, sons e resultados.
2. **Motor do debate:** todas as fases, relógios independentes, ajustes, estados anteriores e penalizações manuais.
3. **Painel e sincronização:** Supabase, login, permissões e comandos consistentes entre dispositivos.
4. **Perguntas do público:** confirmação, submissão validada, caixa privada dos moderadores e escolha de zero ou mais perguntas relâmpago extra.
5. **Votação e vencedor:** identificação anónima, pares completos, contadores, fecho de votação, gráficos e revelação.
6. **Publicação e ensaio:** GitHub Pages, configuração do projeto e simulação de um debate completo, desde a votação inicial até à revelação final.

Critérios principais de aceitação:

- A alteração feita no painel aparece noutro dispositivo sem refresh manual.
- Os relógios podem contar simultaneamente e ser pausados separadamente.
- Refresh, mudança de separador e reconexão recuperam tempos corretos.
- Voltar a uma pergunta preserva o estado; reiniciar exige confirmação.
- As cinco perguntas relâmpago alternam a equipa inicial e assinalam participantes já usados.
- Após a quinta pergunta e após cada extra, o moderador pode acrescentar outra pergunta do público ou avançar para os closing statements.
- É possível realizar zero, uma ou várias extras; não existe um limite fixo nem passagem automática para os closing statements.
- Cada extra só aparece após confirmação, começa com 0:30 por equipa em pausa, mantém a alternância relativamente à pergunta anterior e permite repetir participantes.
- Cancelar a escolha de uma extra não altera a página pública nem avança a numeração; a ausência de sugestões não impede avançar para os closing statements.
- Regressar a uma extra anterior preserva a pergunta e os tempos; reenviar um comando não acrescenta uma extra duplicada.
- Sons funcionam após ativação e ficam ausentes na ronda relâmpago.
- Uma pergunta cancelada na confirmação não é submetida; um novo envio após falha não cria duplicados.
- Visitantes não conseguem executar comandos nem ler perguntas privadas, mesmo fazendo pedidos diretamente à API.
- Comandos concorrentes ou rejeitados não produzem um estado falso no painel.
- O texto completo das perguntas e os tempos são legíveis no telemóvel e no projetor.
- Votar no início leva à espera e aumenta o contador dos moderadores apenas uma vez.
- O mesmo navegador pode votar novamente apenas na fase final; refresh e dois separadores não duplicam votos.
- Quem abre a página depois do fecho inicial pode acompanhar o debate, mas não entra no cálculo do vencedor.
- Os gráficos e o vencedor usam exatamente o mesmo conjunto de participantes nas duas fases.
- Pedidos tardios não alteram votos após o fecho nem os resultados já fixados.
- No exemplo 15/2/5 → 12/1/9, vence Contra com +4 votos.
- Se as duas equipas ganharem o mesmo número de votos, o resultado é Empate.
- Se nenhuma equipa ganhar votos, o resultado é Empate, incluindo o caso em que uma mantém os votos e a outra perde.
- Sem pares completos, não se revela um vencedor.
- A revelação acompanha a fase global; refresh não repete suspense já terminado.
- Os votos individuais e os resultados antes da apresentação não são acessíveis pela API pública.

## 11. Perguntas do programa

### Ronda inicial 1 — equipa A começa

Se uma superinteligência fosse capaz de tomar decisões melhores do que os seres humanos, deveríamos permitir-lhe tomar decisões que atualmente pertencem às pessoas?

### Ronda inicial 2 — equipa B começa

Poderemos realmente controlar uma inteligência que seja superior à nossa?

### Ronda relâmpago

1. Será seguro criar uma tecnologia cujas capacidades e comportamentos futuros não conseguimos prever?
2. Poderá a superinteligência ajudar a humanidade a ultrapassar por completo limitações biológicas e cognitivas?
3. Poderá a superinteligência ser a ferramenta mais poderosa alguma vez criada para resolver problemas da humanidade?
4. Poderá uma superinteligência tomar decisões mais eficazes do que os seres humanos em problemas extremamente complexos?
5. Será que os potenciais benefícios da superinteligência justificam os riscos associados ao seu desenvolvimento?

### Closing statement

Mostrar a identificação da fase e a questão geral: **Superinteligência: progresso ou ameaça?**
