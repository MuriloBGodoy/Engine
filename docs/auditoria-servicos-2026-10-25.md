# Auditoria + pesquisa — seção Serviços (pré-lançamento)

Data: **25/10/2026**. Autor: Han (pesquisa). Somente leitura — nenhum arquivo de código alterado.
Código lido: `engine/src/pages/Services.jsx` (3.034 linhas, inteiro), `engine/src/services/db.js`
(partes de serviço e notificação), `supabase/migrations/20261016230000_schema.sql` (linhas 30–36 e
1197–1290), `supabase/migrations/20261024120000_listing_metrics_daily.sql`, `engine/src/services/i18n.js`
(bloco `servicesPt`), `engine/src/App.jsx`, `ROADMAP.md`, `docs/pesquisa-direitos-e-patrocinio-2026-10-24.md`.

Camadas das fontes externas: 1 primária · 2 governamental secundária · 3 imprensa de registro ·
4 agregador · 5 comercial (quem vende a coisa). "**Inferência**" = conclusão minha, não da fonte.

---

## 0. Os 8 achados que mais pesam

1. **Visitante preenche o formulário inteiro e só no fim descobre que precisa de conta.** `/services` é
   aberta (`App.jsx:466`), o botão "Cadastrar novo serviço" abre o editor sem checar login
   (`Services.jsx:2316`), e o envio cai em `throw new Error("Usuario nao identificado.")`
   (`db.js:1582`) — sem acento, sem rascunho salvo. A foto falha antes com "Entre **novamente** para
   enviar fotos" (`Services.jsx:2343`, i18n 5423), o que é falso para quem nunca entrou. É exatamente o
   caminho de quem chega pelo link na bio do Instagram.
2. **Clique no WhatsApp do card não é contado.** O botão verde do card (`Services.jsx:811-827`) não chama
   `trackServiceListingMetric`; só o botão do modal de detalhe conta (`1065-1069`). O número "Chamaram
   no WhatsApp" — que o ROADMAP §2 chama de "o produto" — sai subcontado. E nenhum link `wa.me` leva
   texto pré-preenchido: o prestador não sabe que o cliente veio do Engine.
3. **Editar um anúncio aprovado tira ele do ar.** Toda edição do dono volta a `pending`
   (`db.js:1586-1590`; RLS `schema.sql:1225-1230`), e a leitura pública só mostra `approved`
   (`schema.sql:1214-1218`). Trocar o preço derruba o anúncio até a moderação olhar de novo.
4. **Filtro de região mostra "Todos" enquanto filtra por estado.** O filtro nasce da região do header
   (`Services.jsx:2139-2140`), mas as opções dos `<select>` só listam estados/países que já têm anúncio
   aprovado (`2179-2208`). Se a pessoa está em "SP" e ainda não há anúncio em SP, o select não tem a
   opção "SP", aparece "Todos os estados" (ou desabilitado, `2675`) e a grade fica vazia com "Ajuste os
   filtros" (`2795-2798`, i18n 5229-5230). Não há alargamento automático (o `region.widened` existe no
   i18n mas não é usado aqui).
5. **O e-mail de login vira e-mail público, e não dá para tirar.** O formulário já vem com o e-mail da
   conta (`Services.jsx:397`) e, se a pessoa apagar, o servidor recoloca:
   `email: listing.email || auth.currentUser?.email` (`db.js:1598`). Para quem entrou com Gmail pessoal,
   é exposição de dado pessoal que ela tentou remover (LGPD art. 6º, III — minimização; **inferência**
   de enquadramento).
6. **Moderação não tem como tirar do ar um anúncio já aprovado.** A fila só tem ações nos pendentes
   (`1953-2004`); o histórico não tem botão (`2017-2040`); no `/services` o admin não é dono, então o
   card não mostra editar/excluir (`730`). Também não existe botão "Denunciar anúncio" para o público.
   A pesquisa de 24/10 (tese do STF, itens 3 e 8–9) aponta canal de notificação e remoção como
   obrigação — hoje isso só se faz por SQL.
7. **Regressão de espaços em strings (commit `1a1fc25`, 21/07/2026).** Literais `" "` viraram `""`:
   `getInitials` faz `.split("")` e "João Silva" vira "JO" (`216`); a tecla Espaço não abre o card
   (`643`, acessibilidade); busca concatena campos sem separador (`2266`, `1793`); endereço exibido
   como "Rua X, 10,São Paulo" (`358`). Confirmado comparando com `d3c3518`, que tinha `split(" ")`,
   `join(", ")`, `join(" ")`. Só `Services.jsx` tem o padrão no `src/`.
8. **Placeholder promete o que o campo não aceita.** "A partir de R$ 120" (i18n 5322), mas
   `formatCurrencyInput` apaga tudo que não é dígito (`Services.jsx:306-314`) e força BRL em qualquer
   país. "A partir de", "R$ 80–150" ou "sob orçamento" são impossíveis de digitar.

---

## 1. Auditoria por papel

### (a) Prestador vindo do Instagram/TikTok, primeira vez, no celular

| # | O que acontece | Onde | Gravidade |
|---|---|---|---|
| a1 | Sem conta: preenche tudo, falha no envio (achado 0.1). | `2316`, `db.js:1582` | **Alta** |
| a2 | 20 entradas no formulário, numa página só: fotos, título, nome, categoria, descrição, modo, país, estado, cidade, endereço, área, DDI, WhatsApp, e-mail, preço, disponibilidade, experiência, Instagram, TikTok, vídeo, tags. Tempo real até publicar: **não medido** (não há PostHog com evento de funil de anúncio — procurei). | `1381-1661` | Alta |
| a3 | Modo padrão é **híbrido** (`emptyForm.serviceMode`, `110`), que exige endereço **e** área (`2421-2428`). O detailer que atende em casa do cliente tem que perceber e trocar o modo, senão é obrigado a publicar o endereço da própria casa com mapa embutido (`1559-1566`, `1013`). | `110`, `2421` | Alta |
| a4 | WhatsApp **não** é obrigatório; foto **não** é obrigatória. Anúncio sem foto mostra foto de banco do Unsplash (`211-212`) como se fosse do prestador — engano para o cliente e dependência externa. | `2417-2432`, `601` | Alta |
| a5 | Foto do celular sobe crua (até 6 MB cada, `2362`), sem compressão, com timeout de 15 s (`79`); só no fallback ela é comprimida e vira **base64 dentro da linha** do banco (`2373-2379`), que todo visitante baixa porque `fetchListings` traz todos os anúncios sem paginação (`db.js:993-1006`). | `2357-2381` | Média |
| a6 | Preço (achado 0.8). E-mail (achado 0.5). | | Média |
| a7 | Cidade é texto livre com sugestão; "sao paulo" e "São Paulo" viram duas cidades no filtro (`2211-2227` compara string exata). | `1524-1536` | Média |
| a8 | **Enquanto espera:** toast "Anúncio enviado para aprovação." (i18n 5436) e o modal fecha. Não diz prazo, não diz o que fazer, não oferece link para compartilhar. O status aparece no card dele (`790-797`) e em "Meus anúncios" (`1857`). | `2442` | Média |
| a9 | **Aviso da decisão:** só notificação **dentro do app** (`db.js:1732-1764` → linha em `notifications`, `db.js:2312-2324`). Sem e-mail, sem push. Quem veio do Instagram e fechou a aba não fica sabendo. O link do aviso vai para `/services`, não para o anúncio nem para o editor (`db.js:1752`). Texto hardcoded em pt-BR, fora do i18n (`db.js:1739-1763`, `notifications.js:96-107`). | | **Alta** |
| a10 | Edição derruba o anúncio (achado 0.3). Não existe "pausar" (o campo `active` existe em `db.js:948`, sem UI). | | Alta |
| a11 | Métricas: o dono vê "Abriram" e "Chamaram no WhatsApp" acumulados (`556-595`), só no modal de detalhe do próprio anúncio. A tabela por dia/origem existe (`20261024120000`) mas nada lê ela ainda (painel do mês é da Jesse). | | Média |
| a12 | Não há link próprio do anúncio para pôr na bio: o detalhe é estado de modal, não rota. (A Jesse está fazendo `/servicos/:slug`.) | `2309-2314` | **Alta** |
| a13 | Linguagem de "vendedor" ("conta vendedor", "Vendedor ativo", i18n 5382-5390) — o público é prestador de serviço. | | Baixa |

### (b) Dono do carro procurando serviço na cidade

| # | O que acontece | Onde |
|---|---|---|
| b1 | No celular, antes do primeiro anúncio vêm: título, 3 números, e o bloco inteiro do **anunciante** (perfil vendedor + "Cadastrar" + "Meus anúncios"). Quem procura rola por cima do que é de quem vende. | `2500-2579` |
| b2 | No lançamento os números do topo serão "0 serviços ativos · 0 vão até você · 0 cidades" — prova social negativa. | `2513-2515` |
| b3 | Filtro de região quebrado (achado 0.4); filtros de cidade/categoria escondidos atrás de "Filtros" recolhido (`2628-2632`). Categoria — o filtro mais útil — exige abrir o painel. | |
| b4 | Busca sem acento: "estetica" não acha "Estética" (`2244-2275` só faz `toLowerCase`). Busca por bairro só funciona se o prestador escreveu o bairro em "área" ou "descrição". | |
| b5 | Ordem = `updated_at` desc (`db.js:994`, `1006`): quem edita por último sobe. Sem relevância, sem distância. | |
| b6 | Card: sem bairro, sem "atende em casa" em destaque visual (é um ícone + texto), sem nota/avaliação (outro Han), sem selo de verificação. O status "Aprovado" aparece para o público como `InfoPill` (`1043`) — informação de bastidor; poderia virar "Verificado pelo Engine". | |
| b7 | Contato: WhatsApp sem mensagem pronta (achado 0.2); e-mail e mapa sem contagem; o botão de e-mail do modal abre `mailto:` com `target="_blank"` (`1298-1311`), o que em alguns navegadores móveis abre aba vazia (**inferência**, não testado). | |
| b8 | Vazio na cidade: mensagem genérica "Ajuste os filtros ou cadastre um serviço…", sem "ainda não tem ninguém em X — veja o estado" nem "indique um prestador". | `2791-2801` |
| b9 | Sem "Denunciar" e sem "Compartilhar com um amigo". | |

### (c) Moderador

| # | O que acontece | Onde |
|---|---|---|
| c1 | Moderador é **um e-mail fixo** em dois lugares: front (`Services.jsx:82-87`, env com padrão `muxdtuber@gmail.com`) e SQL (`schema.sql:35`). Trocar exige migration + env. Coerente com o memo de trocar `muxdtuber@` pelo Gmail do Engine — os dois precisam mudar juntos. | |
| c2 | Ninguém avisa o moderador que entrou anúncio novo: `saveServiceListing` não notifica. Só o contador no botão "Aprovações" (`2564-2576`), visível apenas se ele abrir `/services`. | `db.js:1581-1645` |
| c3 | Fila em ordem do mais **novo** para o mais velho (herda `updated_at` desc) — quem espera há mais tempo fica embaixo. Sem idade do pedido na tela (`submittedAt` existe, `db.js:939`, e não é exibido). | `1925` |
| c4 | Linha da fila sem foto, sem WhatsApp, sem Instagram. "Revisar" abre o detalhe, mas o detalhe **não tem** aprovar/recusar (`2996-3003` passa `onEdit/onDelete` vazios) — vai e volta para cada anúncio. | `1953-2004` |
| c5 | Sem "tirar do ar" após aprovar (achado 0.6). "Histórico" mostra os 8 anúncios mais recentes já decididos, não o log `moderationHistory` (`1926-1930`). | |
| c6 | Se o update funciona mas a inserção da notificação falha, `moderateServiceListing` lança erro e a tela diz "Não foi possível aprovar agora" com o anúncio já aprovado (`db.js:1732` com `await` sem `try`). Risco baixo, mas confunde. | |
| c7 | Sem limite de anúncios por conta nem de reenvio: recusado pode voltar à fila indefinidamente (RLS permite `pending` ao dono). | `schema.sql:1225-1230` |
| c8 | Código morto em `Services`: `rejectionTarget`, `confirmRejectListing`, `RejectionModal` (`2147-2149`, `2470-2495`, `2859-2870`) — sobra da fila que saiu para `/services/approvals` (bate com a "dívida" do ROADMAP §10). | |

### (d) Métrica — o que o modelo de negócio depende dela

- `track_listing_metric` é `security definer`, liberada a `anon` (`20261024120000`, última linha), e a
  trava de "uma vez" é `sessionStorage` no navegador (`db.js:2248-2254`). Qualquer pessoa infla
  aberturas e cliques chamando o RPC em loop; o dono só é excluído no cliente (`2311`, `612`). Para o
  painel grátis é aceitável; **antes de cobrar o Pro com base nesses números, deduplicar no servidor**.
- Origem é sempre `"search"` nas chamadas atuais; `link`/`profile`/`community` dependem da página
  pública e de pontos de entrada que ainda não existem.

---

## 2. Pesquisa externa (acesso em 25/10/2026)

### 2.1 Como o brasileiro fala com empresa — o canal é o WhatsApp

- **79% dos usuários ativos de WhatsApp dizem se comunicar com marcas/empresas pelo app; 64% no
  Instagram Direct, 48% Telegram, 47% Messenger.** Entre os que já se comunicaram com empresas pelo
  WhatsApp, **62%** consideram adequado usá-lo para "comprar produtos e serviços" e **81%** para "tirar
  dúvidas/pedir informações". Panorama Mobile Time/Opinion Box "Mensageria no Brasil", março/2024,
  2.112 entrevistados on-line de 10 a 23/01/2024, margem 2,1 p.p. (Gráfico 14 e Tabela 3). Camada:
  **pesquisa de instituto privado** (dado próprio deles; não é oficial). PDF via
  [poder360](https://static.poder360.com.br/2024/03/Panorama-Mensageria-MAR-24.pdf). Edição 2025/2026:
  **não encontrada**.
- Consequência (inferência): o Engine não deve tentar ser o canal de conversa. Deve ser **a vitrine que
  termina num WhatsApp com contexto** — e o contexto ("Vi seu anúncio no Engine: …") é o que prova
  retorno ao prestador sem depender do nosso contador.
- `wa.me/<número>?text=<texto url-encoded>` abre conversa com texto pronto. A página oficial
  (`faq.whatsapp.com/5913398998672934`) retornou só o título no fetch; o formato foi confirmado em
  [Mailchimp](https://mailchimp.com/resources/whatsapp-click-to-chat/) e [Bird](https://bird.com/explained/whatsapp/what-is-a-whatsapp-click-to-chat-link)
  (camada 5). **Limite de caracteres do texto: não confirmado.**

### 2.2 Instagram, TikTok, Linktree — o "link na bio"

- Instagram permite **até 5 links na bio** para todas as contas desde 18/04/2023
  ([TechCrunch](https://techcrunch.com/2023/04/18/instagram-takes-on-linktree-and-others-with-support-for-up-to-5-links-in-bio/), camada 3/4,
  citando post da Meta Newsroom). Ou seja: o Engine não precisa **substituir** o Linktree do prestador,
  só **ganhar um dos 5 espaços**.
- TikTok: o link clicável na bio exige **1.000 seguidores ou conta comercial registrada**, segundo
  guias de terceiros ([Shopify](https://www.shopify.com/blog/how-to-add-link-to-tiktok-bio), camada 5); as fontes divergem e a
  página oficial do TikTok não trouxe o texto no fetch. **Não confirmado.** Se for verdade, o prestador
  pequeno de TikTok **não tem** link na bio — um perfil Engine com @ fácil de digitar ajuda.
- **Linktree** (página oficial de preços, [linktr.ee/s/pricing](https://linktr.ee/s/pricing), camada 5 — é o preço deles):
  Free = "unlimited links, core appearance options, basic analytics". Valores em reais não exibidos no
  fetch. Copiar: contagem de cliques por link, grátis. Evitar: ser só uma lista de links — o Engine
  ganha por **descoberta na cidade**, que o Linktree não tem.
- **Instagram Basic Display API foi encerrada em 04/12/2024**
  ([Meta for Developers](https://developers.facebook.com/blog/post/2024/09/04/update-on-instagram-basic-display-api), camada 1).
  "Importar fotos do Instagram" automático hoje só pela Instagram API com login de conta
  comercial/criador, com revisão de app da Meta (**inferência**: esforço G). Para o lançamento,
  importar = **à mão** (o prestador manda as fotos pelo WhatsApp e alguém monta o anúncio).

### 2.3 Google Perfil da Empresa (concorrente gratuito direto)

- Negócio sem vitrine **deve ocultar o endereço** e pode ter **até 20 áreas de cobertura**
  ([support.google.com/business/answer/10514137](https://support.google.com/business/answer/10514137?hl=pt-BR), camada 1).
  Copiar: modo "atendo no local do cliente" sem endereço público, com bairros/cidades atendidos — é o
  oposto do nosso padrão híbrido com endereço obrigatório (a3).
- Serviços com **descrição e preço por item**, de graça; nome de serviço com preço ou telefone é
  recusado automaticamente ([answer/9455399](https://support.google.com/business/answer/9455399?hl=pt-BR), camada 1, via resultado de busca).
  Copiar: lista curta "Serviço — a partir de R$".
- O **chat do Perfil da Empresa acabou em 31/07/2024** ([answer/14919062](https://support.google.com/business/answer/14919062), camada 1, via
  busca). Leitura (inferência): nem o Google conseguiu manter um chat próprio entre cliente e pequeno
  negócio; reforça "terminar no WhatsApp".

### 2.4 GetNinjas — o modelo a **evitar**

- Profissional vê pedidos de graça e **paga em moedas para liberar o contato**; "100% do valor do
  serviço é seu. E sem mensalidade!" ([getninjas.com.br/anuncie](https://www.getninjas.com.br/anuncie/design-e-tecnologia/web-design), camada 5).
- Respostas da própria GetNinjas no Reclame Aqui (ago/2026, segundo resultado de busca): pedido fica
  visível "por até 48 horas ou até que quatro profissionais liberem o contato"; "Pedidos em que o
  cliente não responde as mensagens não são reembolsados". Profissionais relatam moedas gastas em
  clientes que "pedem e depois não respondem". A página do Reclame Aqui deu **HTTP 403** no fetch — o
  texto vem do resumo da busca; trate como **relato (camada 4), não verificado na página**.
- Lição: a dor nº 1 do prestador nesse tipo de plataforma é **pagar por contato que não fecha**. O
  modelo do Engine (publicar grátis, Pro vende ferramenta) já evita isso — manter. **Nunca cobrar por
  lead.**

### 2.5 Webmotors Serviços Automotivos — o concorrente com marca

- Página "para oficinas" ([webmotors.com.br/servicos-automotivos/para-oficinas](https://www.webmotors.com.br/servicos-automotivos/para-oficinas), camada 5):
  lava-rápido "livre de mensalidade"; "Plano Destaque" para oficinas, **estéticas**, funilarias, sem
  preço público ("Consulte condições com um Gerente Comercial"); contato do cliente chega via WhatsApp;
  cadastro por formulário + "aguardar o contato da nossa equipe". Não cita CNPJ nem endereço.
- Herdou a Car10 (2021); "mais de 8.000 oficinas parceiras" vem de blog do Santander
  ([santander.com.br](https://www.santander.com.br/hotsite/santanderfinanciamentos/blog/servicos-automotivos-webmotors-car10.html), camada 5, sem data) — **não confirmado**.
- Leitura (inferência): Webmotors mira oficina estabelecida e vende por gerente comercial. O
  microempreendedor que só existe no Instagram (sem vitrine, sem CNPJ) é o espaço livre — que é
  exatamente o nicho do ROADMAP §2.

### 2.6 Doutor Multas e Autoavaliar — não são comparáveis

- **Doutor Multas**: empresa que presta recurso de multa; não é marketplace de prestadores
  ([Poder360](https://www.poder360.com.br/poder-empreendedor/empresa-que-recorre-de-multas-de-transito-atende-2-000-clientes-ao-mes/), camada 3/4).
- **Autoavaliar**: plataforma B2B de avaliação e leilão de seminovos entre lojistas/concessionárias
  (imprensa de 2018, camada 4). Nenhum dos dois serve de referência para Serviços. **Beco sem saída.**

### 2.7 Booksy — o que copiar **depois**

- Página oficial "No-Show Protection" ([biz.booksy.com](https://biz.booksy.com/en-us/features/no-show-protection), camada 5): sinal na
  reserva abatido no total; taxa de cancelamento com cartão salvo; lembrete automático; **política de
  cancelamento visível no perfil**. Números deles ("20% fewer cancellations", "up to $400") com a
  ressalva "*Figures based on average Booksy usage data" — marketing, **não usar como valor**.
- Copiar já (custo P): campo "política" livre no anúncio ("sinal de 30% por Pix para agendar"). Sinal
  e agenda integrados: depois do lançamento.

### 2.8 Dores do prestador — o que achei e o que não achei

- Pesquisa da Professional Carwashing & Detailing (EUA): mão de obra 67% e preço 50% como maiores
  desafios — **página deu 403**; o número veio do resumo da busca e refere-se a 2023. Camada 4, **não
  verificado**, e não é Brasil.
- Sebrae: material específico de **estética automotiva** sobre divulgação **não encontrado**; o que há
  é genérico (Sebrae-PR para salão de beleza: pedir ao cliente foto do resultado, responder rápido,
  WhatsApp Business) — [sebraepr.com.br](https://sebraepr.com.br/comunidade/artigo/saiba-como-vender-mais-utilizando-o-instagram), camada 2. **Beco sem saída** para dado BR do setor.
- Taxa de no-show, % de orçamentos que não fecham, tempo de resposta esperado no setor automotivo BR:
  **não encontrados** em fonte primária. Números que circulam (ex.: "23% de no-show") vêm de páginas de
  vendedor de software de agenda — não usar.
- O que **dá** para afirmar com fonte: o cliente brasileiro quer falar com empresa no WhatsApp (2.1);
  plataformas que cobram por lead geram queixa de contato que não fecha (2.4); negócio sem vitrine
  esconde endereço no Google (2.3). O resto das "dores" (prova de trabalho, preço, agenda) é
  **inferência** razoável, a validar nas 30 conversas de aquisição (seção 4).
- Avaliações: BrightLocal (pesquisa anual de reviews) deu **403**. Fica com o outro Han.

---

## 3. Recomendação — top 10 por impacto/esforço

Esforço: **P** ≤ 1 dia · **M** 2–4 dias · **G** semana+.

### Antes de lançar

| # | Mudança | Esforço | Por quê |
|---|---|---|---|
| 1 | **WhatsApp com contexto + contagem em todo botão**: `wa.me/<n>?text=` com "Olá! Vi seu anúncio *{título}* no Engine…" (i18n nos 3 idiomas) no card e no modal; `trackServiceListingMetric(..., "whatsapp")` também no card (`811`). | P | Corrige subcontagem (0.2) e faz o próprio WhatsApp do prestador provar que o cliente veio do Engine — a resposta ao "mês 2" que não depende do nosso painel. |
| 2 | **Login antes do formulário** para visitante, com volta ao editor; rascunho em `localStorage` enquanto preenche; trocar "Usuario nao identificado." e "Entre novamente". | P | 0.1 / a1 — é o caminho de quem chega pela bio. |
| 3 | **Formulário curto**: obrigatório = 1 foto, título, categoria, cidade, WhatsApp. Modo padrão "Vou até você" (ou pergunta antes); endereço opcional e só com mapa se o prestador marcar "tenho espaço"; resto em "Detalhes (opcional)". Preço em texto livre. E-mail não pré-preenchido e não reposto pelo servidor (`db.js:1598`). Comprimir foto **sempre** antes de subir. | M | a2–a6, 0.5, 0.8. Google faz exatamente isso para negócio sem vitrine (2.3). |
| 4 | **Edição não derruba**: pelo menos preço, disponibilidade e WhatsApp editáveis sem voltar à fila (whitelist no trigger `service_listings_guard`); o resto pode ir para `pending_data` com a versão aprovada continuando no ar. | M | 0.3 / a10. Prestador ajusta preço toda semana. |
| 5 | **Região e vazio**: só semear o filtro se a região tem anúncio; mostrar no select a opção ativa mesmo sem anúncio; se vazio, alargar para o estado/país com aviso (reusar `region.widened`), CTA "Conhece um bom prestador aqui? Convide"; esconder os 3 números enquanto `total < 10`; categoria visível sem abrir "Filtros"; busca sem acento. | P | 0.4, b2–b4, b8. |
| 6 | **Moderação mínima viável**: fila do mais antigo para o mais novo com idade; foto + WhatsApp + @ na linha; aprovar/recusar dentro do detalhe; **"Tirar do ar"** para aprovados; **"Denunciar anúncio"** público (reaproveitar `reports`); aviso ao moderador quando entra anúncio. Trocar o e-mail fixo (`Services.jsx:83` + `schema.sql:35`) junto. | M | 0.6, c1–c5; obrigação de canal de notificação/remoção (pesquisa 24/10, STF itens 3, 8–9). |
| 7 | **Espera com informação**: após enviar, tela "Recebido — aprovamos em até 24 h" (o prazo é decisão do Murilo, **não inventei**), status no card, aviso com link para o próprio anúncio, e **e-mail** na aprovação (depende do SMTP que o memo do Supabase lista como pendente). | P/M | a8–a9. Quem veio do Instagram não volta sozinho ao app. |
| 8 | **Corrigir a regressão de espaços** (0.7): `split(" ")`, `event.key === " "`, `join(" ")`, `join(", ")`, `") "` no telefone. | P | Bugs visíveis no primeiro uso (iniciais, endereço, acessibilidade). |

### Logo depois (primeiras semanas)

| # | Mudança | Esforço | Por quê |
|---|---|---|---|
| 9 | **Kit de bio** em cima da página `/servicos/:slug` (Jesse): botão "Copiar link para a bio", texto pronto, QR para imprimir no balcão/adesivo; métrica com `source=link`. | P sobre a página dela | Instagram tem 5 links (2.2): o objetivo é ganhar um deles. |
| 10 | **Programa Fundador (aquisição dos 30)** — ver seção 4. Selo "Fundador" gravado só pelo servidor (coluna que o dono não edita; o memo já registra que `user_plans` é privado e selo público precisa campo gravado pelo servidor). | M | ROADMAP §2: outbound um a um; preço de fundador R$ 15 já decidido para o Pro. |

**Depois (fora do lançamento):** avaliações (outro Han); pedido de orçamento com os dados do carro da
Garagem (base legal e aviso de compartilhamento já mapeados na pesquisa de 24/10, linha "Pedido de
orçamento"); política de sinal/cancelamento no anúncio (2.7) e só mais tarde sinal por Pix integrado;
ordenação por relevância/distância; deduplicação de métrica no servidor (1.d) **antes** de cobrar o Pro;
paginação de `fetchListings`; botão "pausar" (campo `active` já existe); importação automática do
Instagram pela API (G, revisão da Meta).

### Descoberta fora da busca

- **Garagem** (maior alavanca, P): já existe o convite no `ExpensesModal.jsx:302-315` para quem lança
  uma despesa. Evoluir para "prestadores de *{categoria da despesa}* em *{cidade}*" com 2–3 cards, e
  na ficha do carro "Lavagem/polimento perto de você". Origem de métrica nova (`garage` — exige mudar o
  `check` da tabela diária, que hoje aceita só `search/profile/link/community/direct`).
- **Comunidade** (M): post "trabalho feito" (antes/depois) do prestador com cartão do anúncio embutido;
  dono do carro marca o prestador no post do carro dele ("polido por @fulano") — prova social que o
  Instagram já faz e que gera `source=community`.
- **Clubes** (M): aba "Parceiros do clube" curada pelo capitão; desconto para membros. É o "Sponsored
  Challenge/Subscription Partnership" da Strava em versão de bairro (pesquisa 24/10, 2.1).
- **Eventos** (P): campo "Apoio/serviço no encontro" ligando ao anúncio; cota fixa por evento já
  recomendada na pesquisa de 24/10 (2.4).
- **Perfil público** (P): selo "Prestador" no `/community/@username` com link para o anúncio.

---

## 4. Como trazer os primeiros 30 prestadores

Fatos que restringem: publicar é grátis (decisão 24/10); Pro R$ 25 com preço de fundador R$ 15 para 30
(`FOUNDER_SLOTS`, memo de 24/10); ROADMAP §2 manda outbound manual. O resto é proposta.

1. **Uma cidade, duas categorias.** Começar onde o Murilo consegue visitar, com estética/detailing e som
   (as que mais vivem de vídeo). Vazio em 26 estados é pior que cheio em 1 (achado 0.4 mostra o efeito).
2. **Lista de 100 perfis** de Instagram/TikTok da cidade (busca por hashtag + "estética automotiva
   {cidade}"); DM curta, sem link frio: "montei uma vitrine de serviços automotivos de {cidade}, posso
   montar a sua de graça com as fotos do seu perfil?".
3. **Montagem feita por nós** ("importar do Instagram" manual): o prestador manda fotos e preço pelo
   WhatsApp; alguém do Engine cria o anúncio **na conta dele** (convite por link que já abre o
   formulário preenchido) e ele só aprova. Remove a fricção a2 inteira para os 30.
4. **Convite pula a fila**: anúncio vindo de link de convite entra aprovado (ou pré-aprovado), com selo
   "Fundador" gravado pelo servidor.
5. **Contrapartida explícita**: o link do Engine num dos 5 espaços da bio + um story marcando o Engine.
   Em troca: fundador (selo + R$ 15 travado quando o Pro existir, condições escritas — CDC art. 30,
   pesquisa de 24/10).
6. **Prova no mês 1**: mandar a cada fundador, no dia 30, o print do painel + "N pessoas te chamaram
   dizendo que viram no Engine" — o número que a recomendação 1 torna verificável no WhatsApp dele.
7. **Medir**: das 100 DMs, quantas respondem, quantas publicam, quantas põem na bio. Sem PostHog com
   evento de funil (a2) esse número não sai do app — anotar à mão no começo.

---

## 5. Verificado × inferido × beco sem saída

**Verificado no código:** todos os itens com `arquivo:linha`; a regressão de espaços comparando
`git show d3c3518` com o atual; notificação só em tabela (`db.js:2312-2324`); ausência de
trilha para tirar anúncio aprovado do ar.

**Verificado em fonte externa:** Panorama Mensageria mar/2024 (PDF lido, tabela e gráfico); Google
áreas de cobertura (help oficial lido); Webmotors "para oficinas" (página lida); GetNinjas "anuncie"
(página lida); Booksy No-Show (página lida); Linktree preços (página lida); Instagram Basic Display
encerrada (blog oficial via busca); 5 links na bio (TechCrunch via busca).

**Inferido (marcado no texto):** WhatsApp com contexto como prova de retorno; espaço livre abaixo da
Webmotors; esforço da importação via API; dores do prestador além das citadas; `mailto` com
`_blank` em celular.

**Becos sem saída / falhas de acesso:** `faq.whatsapp.com/5913398998672934` (só título no fetch);
regra oficial de link na bio do TikTok (página sem o texto); Reclame Aqui (**403**); carwash.com
(**403**); BrightLocal (**403**); material Sebrae específico de estética automotiva (não encontrado);
taxa de no-show e de orçamento não fechado no setor automotivo BR (não encontrada em fonte primária);
edição 2025/26 do Panorama Mensageria (não encontrada); número atual de parceiros da Webmotors (só
blog sem data).
