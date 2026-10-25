# Auditoria — seções sociais (pré-lançamento)

Data: **25/10/2026**. Autor: Han. Pedido do Murilo. Somente leitura — nenhum arquivo de código alterado.
Escopo: Comunidade (feed, posts, curtidas, comentários), Perfil público (`/community/@username`),
Mensagens (DM), Clubes e Eventos.

Código lido: `supabase/migrations/20261016230000_schema.sql` (inteiro), `engine/src/services/db.js`
(580–1030, 1360–1565, 1851–2770), `services/chat.js`, `services/events.js`, `services/notifications.js`,
`services/clubs.js` (486–1020), `services/photos.js` (80–160), `services/region.js` (150–178),
`pages/Community.jsx` (578–1257, 2107–3396), `pages/UserProfile.jsx`, `pages/PostPage.jsx`,
`pages/Messages.jsx` (60–360), `pages/Events.jsx`, `pages/EventDetails.jsx` (40–170),
`components/CreateEventForm.jsx` (100–245), `components/clubs/ClubDetail.jsx` (150–221),
`components/MobileNav.jsx`, `components/TopBar.jsx`, `pages/Register.jsx`, `pages/Privacy.jsx` (76–92),
trechos de `services/i18n.js`.

**Como ler.** "Confirmado" = li o código e o caminho é esse. Nada aqui foi executado contra o banco de
produção nem num celular; os achados de RLS são leitura das políticas, não teste com dois usuários (a
regra do projeto pede esse teste antes de corrigir). "**Inferência**" = conclusão minha, marcada na
frase. Nenhum número de uso/desempenho aqui foi medido.

---

## 0. Os 10 achados que mais pesam

1. **No celular não existe botão para publicar.** "Publicar" e "Compartilhar meta" só existem no
   trilho lateral, que é `hidden xl:block` — aparece a partir de 1280 px (`Community.jsx:3070`,
   `3086-3101`). O `CreateFeedPostModal` só é aberto ali e pelo "Postar no mural" de um clube
   (`Community.jsx:2839`, `ClubDetail.jsx:177`). A Garagem não tem ação de publicar (procurei
   `publi|share|compart` em `Garagem.jsx` e `CarCard.jsx`: zero). Resultado: no celular a pessoa só
   consegue publicar se for membro de um clube. E o botão "Publicar meu carro" da garagem do clube leva
   para `/garagem` (`ClubDetail.jsx:187`, i18n 497-498), onde não há como publicar — beco sem saída.
2. **Denúncia de post não chega a ninguém.** `reportContent` grava em `reports` (`db.js:2333-2345`), mas
   a única leitura de `reports` no app é a de anúncio (`target_type = 'service_listing'`,
   `db.js:2295-2327`). Denúncias de post (`target_type 'goal'`, `Community.jsx:2713`) ficam na tabela
   sem tela, sem aviso e sem motivo (o campo `reason` vai vazio). O diálogo promete "A moderação do
   Engine vai revisar" (i18n 1428-1429). E mesmo lendo, o admin não tem como apagar o post: a RLS de
   `community_goals` só deixa o **dono** apagar (`schema.sql:696-697`) — sem cláusula de admin.
   Não existe denúncia de comentário, de perfil, de mensagem, de clube nem de evento.
3. **Bloqueio é só um filtro do feed.** A lista mora em `user_private` (`db.js:2380-2399`) e só a
   Comunidade a lê (`Community.jsx:2217-2230`). O bloqueado continua podendo: mandar DM
   (`send_message`, `schema.sql:1107-1168`, sem checagem), abrir conversa (`start_conversation`,
   `1075-1102`), comentar nos posts de quem bloqueou (`add_comment`, `795-827`), curtir, seguir e
   gerar notificação. Na página do post (`/post/:id`, que é para onde o celular vai) os posts e
   comentários do bloqueado aparecem, porque `PostPage` não filtra. Mensagens e Perfil não têm botão
   de bloquear nem de denunciar.
4. **Qualquer conta logada escreve no sino de qualquer outra, com qualquer texto.** A política
   `"avisos: honesto"` (`schema.sql:181-186`) só exige `actor_id = eu`, `read = false` e
   `data->>'text' < 500`. `notificationTitle`, `notificationBody` e `targetPath` não têm limite e são
   o que a tela mostra primeiro (`notifications.js:85-94`). O `type` pode ser `service_rejected` ou
   `achievement`. Dá para mandar a alguém um aviso "Anúncio recusado — ..." com texto livre: é a
   forma de golpe mais barata do app. Também não há limite de volume.
5. **Conquistas são forjáveis.** `"conquistas: qualquer logado concede"` é `insert ... with check (true)`
   (`schema.sql:135-136`): pelo console, qualquer conta grava `likes_1000000` ou `followers_1000` para
   si ou para outra pessoa (lista fechada de ids, mas qualquer id da lista, para qualquer usuário). A aba
   Conquistas do perfil mostra o que está na tabela (`UserProfile.jsx:167`, `560-564`). O selo do
   *post* é seguro (vem de `likes_count`, mantido por trigger).
6. **"Valores privados ocultos" não é verdade na API.** O card diz "Valores privados ocultos. A
   comunidade vê apenas progresso e faixa" (i18n 1462-1463) e a Política diz "Metas publicadas aparecem
   sem os valores em dinheiro" (`Privacy.jsx:89-91`). Mas `savedValue` e `targetValue` vão no `data`
   do post (`db.js:643-644`, `706-707`), e `community_goals` é legível por **anônimo**
   (`schema.sql:686`). Com a chave pública do app, qualquer um lê quanto cada pessoa já guardou. A tela
   esconde; o banco entrega. (O comentário em `db.js:681-697` decide publicar `targetValue` de
   propósito; `savedValue` não é discutido ali.)
7. **Mexer no tema joga todos os seus posts para o topo do feed.** O feed ordena por `updated_at`
   (`db.js:991`), e o trigger carimba `updated_at = now()` em qualquer update do dono
   (`schema.sql:729`). `saveSettings` chama `syncCommunityProfile`, que faz **um update por post**
   (`db.js:1965-1992`, `2680`). `saveSettings` roda ao trocar o tema no topo (`TopBar.jsx:62`), a cada
   chave das Configurações (auto-save, `Settings.jsx:828`) e ao salvar renda no simulador
   (`OwnershipModal.jsx:293`). Curtir, descurtir, comentar e avaliar também sobem o post
   (`schema.sql:767`, `771`, `820`, `897`). Ou seja: a ordem do feed é "último que alguém mexeu", dá
   para ser manipulada com curtir/descurtir, e cada um desses updates dispara o Realtime que faz
   **todo cliente aberto** reler a página 1 (`db.js:1413`).
8. **Visitante "interage" e nada acontece — com toast de sucesso.** `/community` é aberta. Comentar sem
   conta mostra "Comentário salvo" (`Community.jsx:2474`) e `addCommunityComment` sai em silêncio
   (`db.js:2537`); avaliar mostra "Avaliação salva" (`2501`) e não grava; curtir não faz nada
   (`db.js:2481`); "Seguir" vira "seguindo" só no navegador (`2509-2517`). Nenhum desses leva ao login.
   Contraste: a `PostPage` faz certo (`requireLogin`, `PostPage.jsx:50-54`), mas manda para `/login`
   sem `?next`, perdendo o post.
9. **A página do post no celular tem metade dos botões mortos.** Tocar num post no celular navega para
   `/post/:id` (`Community.jsx:2385-2391`). Lá o `GoalCard` recebe `onFollow`, `onUnshare`,
   `onEditComment` e `onDeleteComment` como funções vazias e **não recebe** `onReport`/`onBlock`
   (`PostPage.jsx:137-144`). O menu mostra "Excluir" no comentário e não faz nada — o dono do post não
   consegue apagar um comentário ofensivo pelo celular. Erro de comentar/avaliar não é tratado
   (`await` sem `try`, `65`, `71`).
10. **Cadastro com Google/Facebook pula o 18+.** A caixa "Tenho 18 anos ou mais" só vale para o
    formulário de e-mail (`Register.jsx:42-45`, `251`). Os botões sociais estão acima dela
    (`Register.jsx:137`) e no Login (`Login.jsx:67`) e criam conta sem confirmação nenhuma. Nem no
    caminho de e-mail a confirmação é gravada (procurei `adult` fora de `Register.jsx`: zero) — não há
    prova de que a pessoa declarou.

---

## 1. Primeiro uso no celular (cidade sem posts, sem amigos)

| # | O que acontece | Onde | Gravidade |
|---|---|---|---|
| p1 | Sem botão de publicar (achado 0.1). | `Community.jsx:3070` | **Alta** |
| p2 | Feed vazio mostra **"Nenhuma meta encontrada — Ajuste a busca ou limpe o campo"** mesmo sem busca nenhuma. O `EmptyFeed` é o estado de busca sem resultado reaproveitado. Não convida a publicar, nem a seguir, nem a entrar num clube. | `3011`, `3252-3264`, i18n 1513-1515 | Alta |
| p3 | Aba **Vídeos** é sempre vazia: `videoPosts = []` constante; mostra "quando o upload real for conectado". Aba de promessa no lançamento. | `62`, `3027-3049`, i18n 1553 | Média |
| p4 | **Sugestões de pessoas** nunca aparecem: `friendSuggestions = []` constante. Para achar gente, só o ícone de "+pessoa" (busca por nome). | `63`, `3106` | Média |
| p5 | **Região não filtra o feed de verdade.** Post não carrega país/estado — só `city`, que é `profile.location` em texto livre (`db.js:607`, `637`, `1901`). O cadastro grava país/estado em `settings.profile`, não `location` (`Register.jsx:100-102`), então conta nova publica com cidade **"Engine Garage"** (padrão, `db.js:607`) e aparece assim no card (`Community.jsx:755`) e no perfil (`UserProfile.jsx:387-390`). `matchesRegion` não esconde quem não tem país (`region.js:157`): na prática o filtro só age sobre posts cuja cidade o dataset reconhece, e só dentro dos 20 carregados. "Feed da minha cidade" não existe. | `Community.jsx:2413-2417` | Alta |
| p6 | **"Top da semana" não é da semana nem do app**: ordena só os posts já carregados (página de 20, pela ordem do achado 0.7), sem janela de data. As estatísticas do trilho ("metas no feed", "interações") também somam só a página carregada. | `2421-2447` | Média |
| p7 | Eventos: logado cai primeiro em **"Meus eventos"**, vazio para conta nova (`Events.jsx:41`); o filtro de estado começa em "todos" e não lê a pílula de região do topo; a lista de estados é só do Brasil (`Events.jsx:144`). | | Média |
| p8 | Clubes: a descoberta tem trilho "pro seu carro" por marca da garagem (`clubs.js:530-553`) — o melhor gancho de primeiro uso do social. "Em alta" depende de evento de clube, que hoje não nasce vinculado (achado e3), então tende a ficar vazio. **Inferência** a partir do código. | | Média |
| p9 | Perfil de visitante aberto por link: sem botão "Seguir"/"Mensagem" e sem convite para entrar — os botões só existem com sessão (`UserProfile.jsx:402`). Os contadores Seguidores/Seguindo mostram **0** para visitante, porque `follows` só é legível por logado (`schema.sql:301-302`) e a leitura volta vazia, não erro. | | Média |

## 2. Comunidade — bugs e fricções

| # | O que acontece | Onde |
|---|---|---|
| c1 | Toasts de sucesso antes da escrita terminar, erro só no console: comentar, editar comentário, apagar comentário, avaliar, seguir. | `Community.jsx:2470-2525` |
| c2 | **Dois "seguindo" que discordam.** O feed usa `communityState.following` (doc privado) para decidir o botão (`621`, `2508`); o Perfil usa a tabela `follows` (`UserProfile.jsx:198-200`). Seguir pelo perfil não muda o botão do feed; tocar "Seguir" de novo no feed chama `setFollow(true)` outra vez — novo upsert e **nova notificação "Novo seguidor"**. | `2504-2525` |
| c3 | Spam de notificação sem esforço: cada curtir (depois de descurtir) gera "Nova curtida" de novo (`db.js:2519-2530`), cada seguir gera "Novo seguidor" (`2214-2218`), cada avaliação gera aviso (`2613-2624`). Sem deduplicação nem janela. | `db.js` |
| c4 | **Selo de verificado em todo mundo.** Toda meta publicada nasce com `verified: true` (`db.js:653`) e o card mostra o `ShieldCheck` ao lado do nome (`Community.jsx:748-750`). O ícone universal de "conta verificada" está em todas as metas — e o campo é do `data`, que o dono edita. | |
| c5 | Comentário guarda nome/@/avatar enviados pelo cliente (`add_comment`, `schema.sql:811-814`). O `userId` é do banco, mas o **nome exibido** é o que a pessoa mandar — dá para comentar como "Engine Oficial". `avatar` não tem limite de tamanho (`813`). | |
| c6 | Comentários moram dentro da linha do post (`comments jsonb`, `schema.sql:675`), sem teto de quantidade. Todo carregamento do feed baixa todos os comentários dos 20 posts; todo comentário reescreve a linha e dispara o Realtime para todos. | |
| c7 | Strings fora do i18n: "Opções", "Editar", "Excluir", "Salvar", "Cancelar" no comentário (`1163`, `1179`, `1192`, `1215`, `1222`); "Comentário atualizado." (`2481`). Em en-US/es-ES aparecem em português. | |
| c8 | Paginação por `updated_at` instável: post que recebe curtida enquanto a pessoa rola sai da página 2 e vai para a 1, que já foi carregada — some até recarregar. Consequência direta do achado 0.7. | `db.js:987-1006` |
| c9 | Foto pequena sobe **sem reprocessar**: JPEG < 500 KB vai como está (`photos.js:152-154`), com EXIF — inclusive GPS, se a câmera gravou — num bucket público. Foto maior é redesenhada em canvas (o que descarta EXIF). | |

## 3. Perfil público (`/community/@username`)

| # | O que acontece | Onde |
|---|---|---|
| f1 | **A bio nunca aparece.** A tela lê `profile.bio` (`UserProfile.jsx:380`), mas o perfil público grava a bio como `note` (`db.js:608`, `612-623`). | |
| f2 | Aba "Metas" lista também post livre: card sem título (`goal.title` vazio cai em `"${brand} ${model}"` = vazio) e barra 0% (`461-495`). Cards não são clicáveis — não abrem o post. | |
| f3 | Sem denunciar/bloquear no perfil. | |
| f4 | Strings fora do i18n: "Usuário não encontrado", "Voltar para Comunidade", "Metas", "Seguidores", "Seguindo", "Editar Perfil", "Seguir", "Mensagem", "Nenhuma meta compartilhada", "Ir para a Garagem", "Sem seguidores ainda", "Não segue ninguém ainda". | `284-289`, `346-362`, `400-418`, `500-512`, `535`, `552` |
| f5 | Contadores para visitante (p9). Conquistas forjáveis (0.5). | |

## 4. Mensagens (DM)

| # | O que acontece | Onde |
|---|---|---|
| m1 | Qualquer conta abre conversa com qualquer outra, e a conversa **nasce antes da primeira mensagem**: tocar num nome da lista de sugestões já cria a linha (`Messages.jsx:150-160` → `start_conversation`). Quem foi tocado vê na caixa dele uma conversa vazia de um estranho. Não há "pedido de mensagem" nem opção "só quem eu sigo". | `schema.sql:1075-1102` |
| m2 | Sem bloquear, sem denunciar, sem silenciar conversa (achado 0.3). | |
| m3 | Lista de sugestões para quem não tem conversa = perfis atualizados mais recentemente (`db.js:1532-1543`) — um diretório de estranhos para DM a frio. Com o achado 0.7, quem mexe nas configurações sobe nessa lista. | |
| m4 | Imagem vai como **base64 dentro da mensagem** (`Messages.jsx:226-238`, `chat.js:236-240`), comprimida a 1600 px (`227`). `p_data` não tem limite no banco (`schema.sql:1129-1131`). Cada mensagem nova faz o cliente reler as últimas 200 (`chat.js:170-191`), com as imagens. | |
| m5 | `imageData`/`gifData` não são validados no banco: um cliente alterado manda uma URL externa e o destinatário a carrega ao abrir a conversa (`Messages.jsx:650-685`) — pixel de rastreio que entrega o IP e o horário de leitura. **Inferência** sobre o uso; o caminho no código está confirmado. | |
| m6 | Aviso de mensagem só no sino e só quando o contador do destinatário estava zerado (`schema.sql:1152`) — bom contra enxurrada. Sem push/e-mail: quem fechou o app não fica sabendo. | |
| m7 | "Visto" sem opção de desligar (`mark_conversation_read`, `1173-1191`). Baixa. | |

## 5. Clubes

| # | O que acontece | Onde |
|---|---|---|
| k1 | Beco sem saída "Publicar meu carro" → Garagem (achado 0.1). | `ClubDetail.jsx:187` |
| k2 | **Direção do clube não modera o próprio mural**: capitão/fundador não apaga post nem comentário (RLS só do dono, `schema.sql:696-697`; `delete_comment` só autor ou dono do post, `857-879`). Membro removido de clube aberto entra de novo na hora (`446-453`) — não existe banimento. | |
| k3 | Sem denunciar clube. Sigla é única e livre (`create_club`, `537-584`), sem limite de clubes por conta: dá para registrar `BMW`, `VW`, `AUDI` antes de qualquer clube real. O selo `official` é só do admin (`343-344`), mas a sigla fica com quem chegou primeiro. | |
| k4 | Nenhum aviso de clube: pedido de entrada não notifica a direção (`clubs.js:846`), aprovação não notifica quem pediu (`891-920`). O `check` de `notifications.type` nem tem tipo de clube (`schema.sql:163-166`). | |
| k5 | O mural mostra os posts sem curtir/comentar/abrir (`ClubPanels.jsx:54-130`); a interação só acontece no feed geral. **Inferência** de leitura parcial do componente. | |

## 6. Eventos

| # | O que acontece | Onde |
|---|---|---|
| e1 | **Horário salvo como UTC.** `eventDate = "${data}T${hora}:00Z"` (`CreateEventForm.jsx:210`, `220`): o 20:00 que a pessoa digita em Brasília vira 17:00 local. A lista de próximos filtra por `event_date >= agora` (`events.js:130`) — **inferência** do código: o evento sai da lista 3 h antes de começar (em UTC−3), e evento entre 00:00 e 02:59 aparece no detalhe com a **data do dia anterior** (`EventDetails.jsx:152-157`). | |
| e2 | Só Brasil no evento: mapa monta "…, Brasil" (`EventDetails.jsx:128`), filtro de estados `getStates("BR")` (`Events.jsx:144`); " até " e " às " fixos em português (`EventDetails.jsx:163-165`). | |
| e3 | **Encontro de clube não nasce vinculado.** O clube manda para `/events?create=1&club=<id>` (`ClubDetail.jsx:198`), mas `Events.jsx` não lê parâmetro nenhum, e `CreateEventForm` não envia `clubId`/`clubTag` (`216-235`). A aba Encontros do clube e o trilho "Em alta" (que dependem de `events.club_id`) ficam vazios. | |
| e4 | Visitante abre "Criar evento", preenche, e só no envio recebe "Usuário não autenticado." (`Events.jsx:105` → `events.js:102`). Mesmo padrão do achado 0.1 da auditoria de Serviços. | |
| e5 | Toast "criado" duas vezes (`CreateEventForm.jsx:238` e `Events.jsx:80`). | |
| e6 | Lista de presença é **pública para anônimo** (`schema.sql:961`) com nome e carro (`events.js:204-221`). O nome é `auth.currentUser.displayName` (`206`), não o nome de exibição do Engine — **inferência**: para conta Google é o nome completo da conta Google. Quem vai estar onde e quando fica legível por qualquer um, mesmo que a tela só mostre o total. | |
| e7 | Links de grupo (WhatsApp/Facebook) são texto livre sem validação (`events.js:74-77`) → vetor de golpe. React 19 (`package.json:45`) neutraliza `javascript:`, então o risco é phishing, não XSS (**inferência** sobre o comportamento do React 19). Evento não tem denúncia nem moderação. | |
| e8 | Sem aviso de presença ao organizador, sem lembrete, e apagar o evento derruba as presenças em cascata sem avisar ninguém (`events.js:188-198`). | |

## 7. Notificações

- Só existem no sino, dentro do app. Não há push (procurei `PushManager`, `Notification.requestPermission`,
  `serviceWorker` relacionado: nada) nem e-mail para nada social. **Para uma rede social, sem push o
  ciclo de volta não fecha** — curtida, comentário, seguidor e DM só são vistos por quem abrir o app.
- Textos gravados em pt-BR pelo **remetente** (`db.js:2527-2529`, `2569-2571`, `schema.sql:1161-1163`):
  quem usa o app em inglês recebe aviso em português. O título/corpo gravado tem precedência sobre o
  rótulo traduzido (`notifications.js:85-94`).
- Escrita aberta (achado 0.4) e spam por repetição (c3).
- Silenciar por tipo é filtro de exibição (`notifications.js:158-166`) — o aviso continua sendo gravado.

## 8. Desempenho com muitos posts

Nada medido; o que segue é leitura do código.

- **Realtime do feed é da tabela inteira**: qualquer mudança em qualquer post faz cada cliente com o
  feed aberto reler a página 1 (debounce de 150 ms, `supabase.js:227-241`; `db.js:1413`). Somado ao
  achado 0.7 (um update por post a cada troca de tema) e a c6 (comentário reescreve a linha), o custo
  cresce com (clientes abertos × escritas). `community_goals` está na publicação do Realtime com
  leitura pública (`schema.sql:1364-1370`, `686`).
- Perfil carrega **todos** os posts da pessoa, sem limite (`db.js:2118-2123`, `2234-2239`), com
  comentários embutidos.
- `syncCommunityProfile` faz N requisições (uma por post) a cada `saveSettings` (`db.js:1973-1991`).
- DM: base64 nas linhas + releitura das 200 últimas a cada mensagem (m4).
- Eventos: uma contagem por evento listado (`events.js:141`, `170`) — até 50 consultas por tela.

## 9. Como uma seção leva à outra (inclusive Serviços)

| De → para | Existe? | Onde / observação |
|---|---|---|
| Feed → Perfil → Mensagem | Sim | `Community.jsx:2596-2617`, `UserProfile.jsx:232-249` |
| Feed → Clube (pelo chip `[TAG]`) | **Não** | o chip é um `<span>` sem clique (`ClubEmblem.jsx:103-112`); o mural diz que o chip é "propaganda do clube" (`clubs.js:648-650`), mas ele não leva ao clube |
| Clube → postar no mural | Sim | `ClubDetail.jsx:177` |
| Clube → publicar carro | **Quebrado** (k1) | |
| Clube → marcar encontro | **Quebrado** (e3) | |
| Evento → organizador / clube | Não | o detalhe não mostra quem organiza nem leva ao clube |
| DM → post compartilhado | Sim | `Messages.jsx:426` |
| **Qualquer seção social → Serviços** | **Não** | nenhum link para `/services` em Comunidade, Perfil, Mensagens, Clubes ou Eventos (procurei `/services` e `/servicos`). Só pela barra de navegação (`MobileNav.jsx:89`). |

Oportunidades óbvias (decisão de produto, não bug): post de carro → "serviços para este carro na sua
região"; evento → "estética/detalhamento perto do encontro"; clube de marca → prestadores que atendem
a marca; perfil de prestador ↔ anúncio dele (o anúncio já tem Instagram; o perfil do Engine não liga
ao anúncio). Pelo `ROADMAP.md` a receita vem do prestador (memória do projeto), então o social é o
canal de distribuição dos anúncios — hoje desconectado.

---

## 10. Moderação, segurança e privacidade — consolidado

| Risco | Estado hoje | Camada que precisa mudar |
|---|---|---|
| Denúncia sem leitor; admin não remove post alheio | Confirmado (0.2) | RLS + tela de fila |
| Bloqueio não vale no servidor (DM, comentário, aviso) | Confirmado (0.3) | funções `send_message`/`start_conversation`/`add_comment` |
| Aviso falso no sino de outra pessoa | Confirmado por leitura da política (0.4) | RLS de `notifications` |
| Conquista forjada | Confirmado por leitura da política (0.5) | RLS de `achievements` |
| Valor guardado legível por anônimo, contra a Política | Confirmado por leitura (0.6) | payload do post ou texto da Política |
| Nome exibido falsificável em comentário | Confirmado (c5) | `add_comment` ler o cartão do perfil público |
| Selo de verificado em todos | Confirmado (c4) | |
| GPS em foto pequena | Confirmado no código (c9); depende do aparelho | `photos.js:152` |
| Lista de presença pública com nome | Confirmado (e6) | RLS de `event_participants` |
| DM de estranho / conversa vazia criada à toa | Confirmado (m1) | `start_conversation` |
| Pixel de rastreio em DM | Caminho confirmado, uso é inferência (m5) | validar `imageData` |
| Sigla de clube ocupada por oportunista | Confirmado (k3) | política + limite |
| Menor de idade | Ver abaixo | |

**Menor de idade — o que a lei diz (camada 1, texto do Planalto, acessado em 25/10/2026).**
Lei 15.211/2025 ("ECA Digital"), em vigor desde **17/03/2026** (art. 41-A, redação da Lei 15.352/2026):
- Art. 1º, parágrafo único: aplica-se a serviço "de acesso provável" por crianças e adolescentes, o que
  inclui "suficiente probabilidade de uso e atratividade" (I) e "considerável facilidade ao acesso" (II).
- Art. 9º, §1º: "mecanismos confiáveis de verificação de idade a cada acesso [...] **vedada a
  autodeclaração**" — para conteúdo impróprio a menores, que o §2º define como "material pornográfico,
  ou quaisquer outros vedados pela legislação vigente".
- Art. 24, §1º: rede social com serviço inadequado a menores deve (I) informar de forma destacada que
  não é apropriado, (II) restringir conteúdo que atraia crianças, (III) aprimorar continuamente a
  verificação de idade; §4º trata de conta com "fundados indícios" de ser operada por criança ou
  adolescente.

**Inferência (para advogado confirmar, não é parecer):** o Engine não oferece conteúdo do art. 9º, §2º,
então a caixa de 18+ provavelmente não é ilegal por si. Mas um app de carros com feed, clubes e DM
tem "atratividade" para adolescente (art. 1º), e o art. 24 pede ação quando há indício de conta de
menor. Hoje: a confirmação não cobre OAuth (0.10), não é gravada, e não existe motivo de denúncia
"parece ser menor de idade" nem fluxo para suspender a conta. O Decreto 12.880/2026 regulamenta a
aferição de idade (fonte camada 4, Mobile Time; não abri o decreto).

---

## 11. Top 10 por impacto/esforço

Esforço: **P** = horas, **M** = 1–3 dias, **G** = semana ou mais. Estimativa minha, não medida.

| # | O quê | Impacto | Esforço | Quando |
|---|---|---|---|---|
| 1 | Botão "Publicar" no celular (FAB ou na barra do feed) + "Publicar na Comunidade" no card da Garagem; conserta k1 de quebra. | Sem isso o feed não enche | **P** | **Antes** |
| 2 | Visitante: curtir/comentar/seguir/avaliar/criar evento levam ao login com `?next=` e voltam ao ponto; tirar os toasts falsos (0.8, e4, PostPage sem `next`). | Primeira impressão de quem vem por link | **P** | **Antes** |
| 3 | `PostPage`: ligar seguir, apagar/editar comentário, denunciar, bloquear e o filtro de bloqueados (0.9). | Celular é o caminho principal | **P** | **Antes** |
| 4 | Cadastro social com 18+: tela de confirmação após o primeiro OAuth e gravar data/versão do aceite (0.10). | Jurídico | **P** | **Antes** |
| 5 | Fechar escrita aberta: `notifications` só via funções `security definer` por tipo (ou restringir `type`/campos e limitar título/corpo); `achievements` só o próprio dono, ou conceder dentro das funções que já existem (0.4, 0.5). Testar com segunda conta e com valor que muda. | Golpe + integridade | **M** | **Antes** |
| 6 | Tirar `savedValue` do payload público (publicar só a porcentagem) **ou** corrigir a Política e o texto do card (0.6). Decisão do Murilo; a primeira é a que bate com o que foi prometido. | LGPD / confiança | **P** | **Antes** |
| 7 | Moderação mínima: fila de denúncias de post/comentário/perfil/DM na tela de aprovações que já existe, com motivo (incluindo "menor de idade"); RLS de admin para apagar post e comentário; denunciar em comentário, perfil e DM. | Obrigação de canal de remoção (pesquisa de 24/10) | **M** | **Antes** |
| 8 | Bloqueio no servidor: `send_message`, `start_conversation` e `add_comment` recusam se o destinatário bloqueou; bloquear em DM e perfil. Exige mover a lista de `user_private` para algo que a função leia (tabela `blocks`). | Assédio | **M** | **Antes** |
| 9 | Feed ordenado por `created_at`, e `syncCommunityProfile` só quando nome/@/avatar/cidade mudarem (0.7, c8). | Ordem do feed + carga | **P–M** | **Antes** |
| 10 | Eventos: gravar com fuso real, filtro de "próximos" por data local, vínculo com clube via `?club=` (e1, e3). | Eventos e "Em alta" de clubes | **M** | **Antes** |

**Depois do lançamento** (em ordem): push (Web Push/PWA) para DM, comentário e seguidor; dedupe de
avisos (c3); comentários numa tabela própria (c6); imagem de DM no Storage e validação de URL (m4, m5);
pedido de mensagem para quem não se segue (m1); ligar o social a Serviços (§9); moderação do mural pela
direção do clube e banimento (k2); limite/reserva de siglas (k3); i18n das strings fixas (c7, f4, e2) e
dos avisos gravados em pt-BR; tirar ou esconder as abas Vídeos e Sugestões até terem conteúdo (p3, p4);
lista de presença só para logados ou só contagem (e6); bio no perfil (f1, é **P** e poderia ir antes);
reprocessar toda foto para remover EXIF (c9, **P**, poderia ir antes).

---

## 12. Não verifiquei

- Nada rodado contra produção nem em aparelho; RLS lida, não testada com duas contas.
- `ClubPanels.jsx`, `ClubCard.jsx`, `ClubCaptainPanel.jsx`, `UserProfileModal` e `ShareToChatModal` lidos
  só em parte.
- Se o Supabase Realtime em produção está entregando eventos de `community_goals` para anônimo
  (depende da configuração de Realtime + RLS no painel).
- O Decreto 12.880/2026 e as orientações da ANPD sobre aferição de idade não foram abertos.

Fontes externas:
- [Lei 15.211/2025 — Planalto](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15211.htm) (camada 1)
- [Mobile Time — coluna sobre o Decreto 12.880/2026](https://www.mobiletime.com.br/colunistas/31/03/2026/eca-digital-gorgen/) (camada 4, só para localizar o decreto)
