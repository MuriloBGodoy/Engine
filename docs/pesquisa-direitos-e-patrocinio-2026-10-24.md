# Pesquisa — avisos e direitos do usuário + patrocínio e apoio financeiro

Data de acesso de todas as fontes: **24/10/2026**, salvo indicação contrária.
Autor: Han (pesquisa). **Não é parecer jurídico** — é o mapa do que a fonte diz,
para levar a um advogado e a um contador com as perguntas certas.

## Legenda das camadas

1. **Primária** — lei, decreto, resolução, documento oficial da própria empresa sobre o próprio produto.
2. **Governamental secundária** — órgão público resumindo regra (Procon, gov.br).
3. **Legislativo / imprensa de registro** — Câmara, Senado, notícia do STF sobre o próprio julgamento.
4. **Agregador** — blog, jornal, escritório de advocacia. Só aponta onde procurar.
5. **Comercial** — quem vende a coisa. Tratado como marketing.

"**Inferência**" no texto quer dizer que a conclusão é minha e não está escrita na fonte.

---

## 0. Cinco achados que mudam decisões já tomadas

1. **MEI provavelmente não cobre a atividade do Engine** (inferência forte, precisa de contador).
   Baixei pela API do portal gov.br as 26 páginas (A–Z) da lista oficial de ocupações permitidas ao MEI
   (`https://www.gov.br/empresas-e-negocios/++api++/pt-br/empreendedor/quero-ser-mei/atividades-permitidas/{a..z}`, camada 2;
   469 linhas com CNAE). **Não existe nenhum CNAE 62xx** (software/SaaS), **nem 6319-4/00** (portais e provedores de conteúdo na
   internet), **nem 7311/7312** (agência / venda de espaço publicitário). O mais próximo que aparece é
   "EDITOR(A) DE LISTA DE DADOS E DE OUTRAS INFORMAÇÕES" (5819-1/00) e "PROMOTOR(A) DE VENDAS" (7319-0/02) — nenhum descreve
   assinatura de plataforma digital nem venda de anúncio. A página-raiz foi modificada em 2021; a letra M em 13/01/2026.
   Se o contador confirmar, a saída é ME no Simples Nacional, não MEI. **Isso precisa ser resolvido antes de abrir o CNPJ.**
2. **Idade mínima de 13 anos conflita com o ECA Digital** (Lei 15.211/2025, em vigor desde **17/03/2026**, art. 41-A
   incluído pela Lei 15.352/2026 — camada 1). `engine/src/pages/Privacy.jsx` diz "não é destinado a menores de 13 anos".
   O art. 24 exige que contas de até 16 anos estejam **vinculadas à conta de um responsável legal** em serviços
   "direcionados a crianças e adolescentes ou de acesso provável por eles"; os arts. 22 e 26 **proíbem perfilamento para
   publicidade comercial** a crianças e adolescentes. Se o AdSense entrar com anúncio personalizado e houver usuário de
   13–17 anos, é violação direta. Se o Engine cai em "acesso provável" é **inferência** (o art. 1º, parágrafo único, usa
   critérios abertos: atratividade, facilidade de acesso, risco). Opções: subir a idade mínima para 18, ou anúncio não
   personalizado para todos.
3. **O AdSense carrega sem consentimento.** `engine/src/components/AdSlot.jsx` injeta `adsbygoogle.js` direto, sem banner
   nem CMP. O Guia de Cookies da ANPD (out/2022, camada 1 orientativa) diz que o legítimo interesse "dificilmente será a
   hipótese legal mais apropriada" para cookies de publicidade e que o consentimento "pode ser considerado uma hipótese
   legal mais apropriada". Para tráfego da UE/Reino Unido/Suíça o Google **exige CMP certificada** (ver Parte 1, linha AdSense).
4. **Stripe no Brasil: Pix é "disponível somente por convite"** (stripe.com/br/pricing, camada 1). O plano do ROADMAP
   ("Pix recorrente converte melhor") não se resolve com Stripe hoje. Taxas confirmadas: cartão nacional **3,99% + R$ 0,39**;
   Stripe Billing **+0,7%**; boleto **R$ 3,45**; contestação **R$ 55**.
5. **Destaque pago na lista de Serviços tem presunção de responsabilidade.** A tese do STF sobre o art. 19 do Marco Civil
   (26/06/2025, documento oficial da tese, camada 1) diz no item 4: "Fica estabelecida a presunção de responsabilidade dos
   provedores em caso de conteúdos ilícitos quando se tratar de (a) anúncios e impulsionamentos pagos". O item 7 diz que
   marketplaces respondem pelo CDC. Os itens 8–9 exigem autorregulação, sistema de notificações e **relatório anual de
   transparência** sobre notificações, anúncios e impulsionamentos, mais canal de atendimento para usuários e não usuários.

---

## Parte 1 — Avisos e direitos do usuário

### 1.1 Tabela: Ponto do app | O que avisar/garantir | Obrigatório ou boa prática | Fonte

| Ponto do app | O que avisar / garantir | Obrigatório ou boa prática | Fonte (camada) |
|---|---|---|---|
| **Rodapé / tela de checkout** (identificação) | Nome empresarial e CNPJ (ou CPF enquanto PF), endereço físico **e** eletrônico, contato. | **Obrigatório** | Decreto 7.962/2013, art. 2º, I e II (1) |
| **Página do plano Pro / Premium** (antes de pagar) | Características essenciais; preço com qualquer acréscimo discriminado; modalidades de pagamento; **restrições "claras e ostensivas"** (ex.: o que o Pro não inclui; que o preço de fundador só vale enquanto a assinatura não for interrompida, se for essa a regra). | **Obrigatório** | Decreto 7.962, art. 2º, III–VI (1); CDC art. 31 (1) |
| **Checkout** (sumário) | **Sumário do contrato antes da contratação**, "enfatizadas as cláusulas que limitem direitos" (renovação automática, cobrança ao fim do teste, regra do preço de fundador). | **Obrigatório** | Decreto 7.962, art. 4º, I (1); CDC art. 54, §4º e art. 46 (1) |
| **Checkout** (erros) | Ferramenta para corrigir erros antes de finalizar (tela de revisão). | **Obrigatório** | Decreto 7.962, art. 4º, II (1) |
| **Pós-pagamento** | Confirmação **imediata** da contratação; contrato/termos disponíveis em meio que permita guardar e reproduzir (e-mail com PDF ou link permanente com versão datada). | **Obrigatório** | Decreto 7.962, art. 4º, III e IV (1) |
| **Atendimento** | Canal eletrônico para informação, dúvida, reclamação, **suspensão ou cancelamento**; confirmar recebimento imediatamente pelo mesmo meio; **resposta em até 5 dias**. | **Obrigatório** | Decreto 7.962, art. 4º, V, VI e parágrafo único (1) |
| **Arrependimento (7 dias)** — Pro, Premium anual, passe avulso | Informar "de forma clara e ostensiva" como exercer; permitir pela **mesma ferramenta da contratação** (botão no app); confirmar recebimento imediatamente; comunicar a operadora do cartão para não lançar ou estornar; devolver **"os valores eventualmente pagos, a qualquer título"**, **"de imediato, monetariamente atualizados"**. | **Obrigatório** | CDC art. 49 e parágrafo único (1); Decreto 7.962, art. 5º, §§1º–4º (1); Procon-SP, *Guia de Comércio Eletrônico* (jul/2019), p. 19 confirma que vale para **serviço contratado pela internet** (2) |
| **Arrependimento x conteúdo digital já usado** | O texto do CDC **não tem exceção** para serviço digital já fruído (diferente da UE). Achado de fato: reembolso integral em 7 dias, mesmo do passe avulso usado. Como os tribunais tratam o uso parcial **não foi pesquisado**. | **Obrigatório** (texto da lei); jurisprudência em aberto | CDC art. 49 (1) |
| **Teste grátis de 30 dias com cartão** (Pro) | Na tela de cadastro: data exata da primeira cobrança, valor, que renova sozinho e como cancelar. **Lembrete antes do fim do teste.** Cancelar durante o teste = nada cobrado. | Lembrete: **exigência das bandeiras** (via Stripe), não de lei brasileira encontrada. Informar a cobrança futura: **obrigatório** (restrição à fruição, Decreto 7.962 art. 2º VI). | Stripe Docs, *Manage compliance requirements for trials* (1 — política da Stripe/bandeiras): reminder "7 days before a trial ends", URL de cancelamento no recibo, descritor da fatura com "* TRIAL OVER". Evento `customer.subscription.trial_will_end` sai por padrão **3 dias antes** (Stripe Docs, *trials*). |
| **Teste grátis → 1ª cobrança** | Os 7 dias do art. 49 contam "a contar de sua assinatura" — ou seja, **vencem durante o teste**. Se a 1ª cobrança abre nova janela **não está resolvido na lei** (não achei). Recomendação: aceitar reembolso integral até 7 dias após a 1ª cobrança. | **Boa prática** (inferência) | CDC art. 49 (1) |
| **Renovação automática** (mensal Pro; anual Premium) | Aviso antes de renovar; para o **anual**, avisar com antecedência (30 dias é o número do PL abaixo). Desligar a renovação no app, efeito imediato para as próximas cobranças. | **Boa prática.** **Não existe lei federal** exigindo aviso de renovação (procurado). Projetos: **PL 4734/2024** (cancelamento pelo mesmo meio + aviso de 30 dias em contratos ≥12 meses; aprovado na Comissão de Defesa do Consumidor; situação em 08/10/2025: "Aguardando Designação de Relator(a)"); **PL 5453/2025** (aviso prévio qualificado; "Pronta para Pauta" na CDC desde 14/05/2026); **PL 4983/2026** (proíbe renovação automática sem autorização expressa; "Aguardando Autorização do Despacho" desde 11/08/2026). | API Dados Abertos da Câmara, consultada hoje (3) |
| **Cancelar tão fácil quanto contratar** | Botão "Cancelar assinatura" no app, sem retenção forçada, sem telefone. | Para o **cancelamento em geral**: **boa prática** (a regra de "mesmo meio" do Decreto 11.034/2022 vale só para **serviços regulados pelo Executivo federal** — art. 1º — não para o Engine). Para o **arrependimento**: **obrigatório** pelo mesmo meio (Decreto 7.962, art. 5º §1º). Cláusula que dá ao fornecedor direito de cancelar sem dar igual direito ao consumidor é **nula** (CDC art. 51, XI). | Decreto 11.034/2022 art. 1º (1); Decreto 7.962 art. 5º (1); CDC art. 51 (1). Senado, *Texto para Discussão 359* sobre dark patterns (3, não aberto). |
| **O que perde ao cancelar** | Dizer antes de confirmar: o que some (benefícios Pro / sem anúncios), o que **fica** (o anúncio de serviço continua, porque publicar é grátis; dados e histórico mantidos), até quando o acesso pago vale. | **Boa prática**, com base obrigatória no dever de informação | CDC art. 6º, III e art. 31 (1) |
| **Preço de fundador R$ 15 "travado"** | A promessa **vincula** e integra o contrato. Escrever as condições: travado enquanto a assinatura ficar ativa sem interrupção? volta se cancelar? reajuste por qual índice? | **Obrigatório** honrar o que for anunciado; reajuste fora do contrato é prática abusiva | CDC art. 30; art. 39, XIII; art. 51, X (1) |
| **Passe avulso (1 ou 3 meses)** | Preço, **data de início e de fim**, que **não renova** e não guarda cartão para cobrança futura, o que inclui, 7 dias de arrependimento com reembolso integral, o que acontece no fim (volta ao grátis, nada é apagado). | **Obrigatório** (informação + arrependimento); "não renova" em destaque é boa prática | Decreto 7.962 arts. 2º e 5º; CDC arts. 31 e 49 (1) |
| **Cookies / AdSense** | Banner com **"Rejeitar" tão visível quanto "Aceitar"**, segundo nível por categoria (necessários / analíticos / publicidade), **cookies de consentimento desligados por padrão**, link para revogar a qualquer momento. **Não carregar o AdSense antes do aceite.** | Consentimento para publicidade: **obrigatório na prática** (LGPD art. 7º I + art. 8º; ANPD diz que legítimo interesse "dificilmente" serve). O formato do banner: **boa prática da ANPD**. | LGPD arts. 7º, 8º §§4º–5º (1); ANPD, *Guia orientativo Cookies e proteção de dados pessoais*, out/2022, pp. 24–33 (1, orientativo) |
| **Política de privacidade x AdSense** | A política deve dizer que terceiros, inclusive o Google, usam cookies para anúncios com base em visitas anteriores; que o usuário pode desativar a personalização em "Configurações de anúncios"; e listar outras redes, se houver. | **Obrigatório pelo contrato do AdSense** | Google AdSense Help, answer 1348695 ("Conteúdo obrigatório") (1) |
| **AdSense fora do Brasil** | Para servir anúncio personalizado no **EEE, Reino Unido e Suíça**, o Google exige **CMP certificada pelo Google integrada ao TCF da IAB**; sem ela, só "Limited Ads". | **Obrigatório pelo Google** para essas regiões (o Engine atende PT, ES, FR, DE, IT, GB) | Google AdSense Help, answer 13554116 (1 — **não aberto**, conteúdo via resultado de busca; conferir) |
| **AdSense e menores** | Sem anúncio personalizado para menores de 18. | **Obrigatório** se o serviço for de "acesso provável" por adolescentes | Lei 15.211/2025 (ECA Digital), arts. 22 e 26 (1) |
| **Métricas (PostHog)** | `observability.js` identifica o usuário (`posthog.identify(user.uid)`). Medição de audiência **pode** usar legítimo interesse, segundo a ANPD, "quando o tratamento se limitar à … identificação de padrões e tendências, com base em dados agregados". Com identificação por usuário, informar na política e oferecer opt-out. | Transparência: **obrigatória** (LGPD art. 10 §2º); opt-out: **boa prática** forte | ANPD, Guia de Cookies, p. 24 (1); LGPD art. 10 (1) |
| **Métricas do prestador** (aberturas, cliques no WhatsApp, origem) | Entregar ao prestador **só número agregado**, nunca quem clicou. Base: legítimo interesse do Engine e do prestador (art. 7º IX + art. 10), com aviso na política. Se um dia mostrar o perfil de quem clicou, vira compartilhamento de dado pessoal e muda tudo. | **Obrigatório**: base legal + transparência. Agregação: **boa prática** (minimização, art. 10 §1º: "somente os dados pessoais estritamente necessários") | LGPD arts. 7º IX, 10 §§1º–2º (1) |
| **Pedido de orçamento com os dados do carro** | Tela de confirmação: "Vamos enviar a [prestador] seu nome, contato e estes dados do carro: …". O envio a pedido do titular se apoia em "procedimentos preliminares relacionados a contrato … a pedido do titular". Avisar que o prestador passa a tratar esses dados por conta própria. | Base legal: **obrigatório** ter uma, e esta é a que encaixa (**inferência** de enquadramento); aviso de compartilhamento: **obrigatório** | LGPD art. 7º, V; art. 9º, V; art. 18, VII (1) |
| **Exportar / apagar dados** | Configurações → "Baixar meus dados" e "Excluir conta" (já existe exclusão em cascata). Resposta completa em até **15 dias** (art. 19 II); agente de pequeno porte tem **prazo em dobro** "nos termos de regulamentação específica". | **Obrigatório** (direitos do art. 18); botão self-service é boa prática | LGPD arts. 18 (I, II, V, VI, IX) e 19 (1); Res. CD/ANPD nº 2/2022, art. 14 (1) |
| **Encarregado (DPO)** | Agente de pequeno porte **não precisa** indicar encarregado, mas **deve** ter canal de comunicação com o titular. | **Obrigatório** o canal | Res. CD/ANPD nº 2/2022, art. 11 e §1º (1, texto do site da ANPD, alterado pela Res. 15/2024) |
| **Rótulo "Anúncio"** em todo AdSlot | Já existe (`ads.label`). O formato `native` "VESTE o formato dos cards do feed" — manter o rótulo visível e o card visualmente distinto. | **Obrigatório** | CDC art. 36: "A publicidade deve ser veiculada de tal forma que o consumidor, fácil e imediatamente, a identifique como tal" (1); CONAR, Código, art. 28: "O anúncio deve ser claramente distinguido como tal" (autorregulação); AdSense proíbe "formatar anúncios de um jeito que não possam ser diferenciados de outros conteúdos" e rótulos enganosos — permitido "Anúncios" ou "Links patrocinados" (Google, answer 48182) (1) |
| **Destaque pago na lista de Serviços** | Selo "Patrocinado" ou "Destaque pago" no card; explicar, em "Como a lista é ordenada", que existe posição paga. Verificar o prestador antes de vender destaque. | Rótulo: **obrigatório** (CDC art. 36). Diligência: **obrigatória na prática**, porque há presunção de responsabilidade por conteúdo ilícito em anúncio pago (STF, tese item 4) | CDC art. 36 (1); STF, teses Temas 987/533, item 4 (1) |
| **Conteúdo pago de parceiro** (post patrocinado, "oferecido por") | Identificar como publicidade, não como conteúdo editorial ou de usuário. | **Obrigatório** | CDC art. 36 (1); CONAR art. 30 (peça paga "deve ser apropriadamente identificada") |
| **Simulador de custo / FIPE / financiamento** | "Estimativa com base em [fontes, data]. Não é oferta de crédito, não é recomendação financeira. Taxa e CET reais vêm da instituição." Mostrar a data da FIPE e dos preços ANP. | **Boa prática** (não achei regra da CVM ou do BCB que alcance o Engine). Mas o CDC art. 30 vincula "informação … suficientemente precisa" — o aviso de estimativa protege contra isso (**inferência**). | Res. CVM 20/2021, art. 1º: só vale para análise de **valores mobiliários** (1). CDC art. 52 (deveres de quem **concede** crédito) (1). Se o Engine algum dia receber comissão por indicar financiamento, verificar enquadramento como correspondente (**não pesquisado**). |
| **Aporte na meta** | Se algum dia sugerir investimento específico (CDB X, fundo Y), entra no território da CVM. Hoje não sugere. | Atenção futura | Res. CVM 20/2021, art. 1º §1º (1) |
| **Serviços: responsabilidade por serviço mal prestado** | Termos dizendo que o Engine divulga e não presta o serviço; canal de denúncia; remoção de prestador denunciado. **Cláusula que exonera o Engine perante consumidor é nula** — o texto serve para esclarecer papéis, não para blindar. | Canal de notificação e devido processo: **obrigatório** (STF itens 8–9). Exoneração: não vale contra consumidor. | STF tese itens 7–9 (1); CDC arts. 25, 51 I e III (1). Se a aba conta como "marketplace" (item 7) ou como classificados é **questão em aberto**; jurisprudência do STJ sobre classificados **não pesquisada**. |
| **Avaliações** (se existirem — não achei sistema de avaliação no código) | Política publicada de moderação; só quem teve contato verificado avalia; o prestador **não pode pagar** para remover nota; dizer se há filtro. | **Boa prática** no Brasil (**não achei lei específica** sobre avaliação falsa); publicidade enganosa por omissão é proibida (CDC art. 37 §3º). EUA: regra da FTC 16 CFR Part 465, em vigor desde **21/10/2024**, proíbe review falsa, supressão de review e site de reviews controlado pela empresa. | CDC art. 37 (1); FTC, regra final (1, via resultado de busca) |
| **Contas falsas / denúncia** | Remover após notificação de ilícito; vale também para "contas denunciadas como inautênticas". | **Obrigatório** (responsabilidade civil se não remover após notificação) | STF tese item 3 (1) |
| **Apoio / doação ao app** | Dizer o que é: doação sem contrapartida **ou** pagamento com benefício (selo). Sem promessa de reembolso diferente da lei. | Ver 1.3 | LC 214/2025 (1) |
| **Nota fiscal** | Ver 1.4 | — | — |

### 1.2 O que o CDC e o Decreto 7.962 dizem, literalmente (para o advogado)

- **CDC art. 49**: "O consumidor pode desistir do contrato, no prazo de 7 dias a contar de sua assinatura ou do ato de recebimento do produto ou serviço, sempre que a contratação de fornecimento de produtos e serviços ocorrer fora do estabelecimento comercial, especialmente por telefone ou a domicílio. Parágrafo único. Se o consumidor exercitar o direito de arrependimento previsto neste artigo, os valores eventualmente pagos, a qualquer título, durante o prazo de reflexão, serão devolvidos, de imediato, monetariamente atualizados."
- **Decreto 7.962, art. 5º §1º**: "O consumidor poderá exercer seu direito de arrependimento pela mesma ferramenta utilizada para a contratação, sem prejuízo de outros meios disponibilizados."
- **Decreto 7.962, art. 4º parágrafo único**: "A manifestação do fornecedor às demandas previstas no inciso V do caput será encaminhada em até cinco dias ao consumidor."
- **Sanção**: Decreto 7.962, art. 7º remete às sanções do CDC art. 56.
- O CDC compilado no Planalto **não tem nenhum dispositivo sobre renovação automática** (procurei "renova" e "cancel" no texto inteiro; as últimas alterações são da Lei 14.181/2021).

**Prestador como consumidor?** O Pro é vendido a microempreendedor que usa o Engine para o próprio negócio. Se o CDC o protege depende de ele ser "destinatário final", o que a jurisprudência discute (**inferência; não pesquisado**). Recomendação prática: tratar o prestador como consumidor — custa pouco e elimina a discussão.

### 1.3 Doações e apoio financeiro

- **IBS/CBS (reforma tributária, LC 214/2025, camada 1)**: o art. 4º §2º, V inclui entre as operações onerosas a "doação com contraprestação em benefício do doador"; o art. 6º, VIII diz que IBS e CBS **não incidem** sobre "doações sem contraprestação em benefício do doador".
  **Inferência**: um apoio que dá selo de Apoiador, nome no mural ou qualquer vantagem tende a ser contraprestação, ou seja, venda. "Apoio" com recompensa deve ser tratado como receita de serviço, com nota.
- **ITCMD** (imposto estadual sobre doação, para quem recebe como pessoa física): exemplo de SP, Lei 10.705/2000, art. 6º, II, "a" — isenta doação "cujo valor não ultrapassar 2.500 (duas mil e quinhentas) UFESPs" (camada 1, repositório da Alesp). Outros estados: não verificado.
- **MEI pode receber?** Pode receber dinheiro; a pergunta é se entra como receita bruta. **Inferência**: com contrapartida, é receita e entra no teto (LC 123 art. 18-A §1º: **R$ 81.000,00** no ano anterior, redação da LC 188/2021). Sem contrapartida, a classificação contábil fica para o contador.
- **Apoia.se/Catarse** recebem e repassam. Quem recebe continua sendo o Engine.

### 1.4 Nota fiscal

- **MEI dispensado de nota para pessoa física** — LC 123, art. 26 §1º: "ficando dispensado da emissão do documento fiscal … ressalvadas as hipóteses de emissão obrigatória previstas pelo referido Comitê" (camada 1).
- **Obrigatório para operações com PJ**: a página gov.br "Emitir NFS-e – Padrão Nacional" (modificada em 23/02/2026) diz "Microempreendedores Individuais (MEI) – Obrigatório para operações com Pessoas Jurídicas" e lista como base a LC 123/2006, a Resolução CGSN 169/2022 e a LC 214/2025 (camada 2). A data de **01/09/2023** para o MEI usar o Emissor Nacional vem de prefeituras e imprensa contábil (camadas 2 e 4). O texto da Res. CGSN 169 **não foi aberto**: a base da Receita (`normas.receita.fazenda.gov.br`) é uma SPA e não devolveu o conteúdo.
- **Consequência prática**: prestadores com CNPJ (muitos serão MEI) que assinam o Pro exigem **NFS-e mensal** do Engine. Com dezenas deles, isso precisa de automação (o Emissor Nacional tem API — **não testado**).
- Para ME/EPP do Simples Nacional, a Receita anunciou a NFS-e Nacional **obrigatória a partir de 01/11/2026** (Res. CGSN 191/2026, segundo a notícia da Receita de ago/2026; camada 2, via resultado de busca, **não aberta**). Relevante se o achado 0.1 levar a ME.
- **Tudo isso depende do achado 0.1.** Se a atividade não cabe no MEI, a discussão de nota muda de regime.

---

## Parte 2 — Patrocínio e apoio financeiro

### 2.1 Como os comparáveis vendem

| Quem | Formatos | Preço público? | Fonte (camada) |
|---|---|---|---|
| **Strava** | *Sponsored Challenges* ("awareness, engagement and conversion"), *Sponsored Segments* (trecho real de estrada ou pista com marca, recompensa por completar), *Subscription Partnerships* (a marca compra assinatura com desconto para a própria comunidade). | **Não** — "Get started" / contato | business.strava.com (5, página comercial da própria Strava) |
| **Waze** | Pin no mapa, busca promovida, *zero-speed takeover*; leilão por **CPM**. Starter a partir de ~US$ 2/dia; Plus ~US$ 100/dia. | Números de **2018–2019** | Imprensa (4). A página oficial `support.google.com/wazelocal/answer/9227698` deu **404** hoje: o produto pode ter mudado. **Não confirmado.** |
| **Webmotors** | Time comercial "OEM & Mídia" vende para montadoras e agências; patrocina atletas e eventos (Stock Car 2019, Rio Open 2023). | **Não** — nenhum mídia kit público encontrado | Imprensa de trade (4) |
| **DriveTribe** (Clarkson/Hammond/May) | Rede social automotiva bancada por publicidade. **Fechou em jan/2022**, alegando queda de verba publicitária (pandemia, falta de chips). | — | Motor1, The Drive, Driving.co.uk (4) |
| **Fuelly** | Não pesquisado a fundo nesta rodada. | — | — |
| **Encontros de carro / clubes BR** | Nenhuma tabela de cotas encontrada (**beco sem saída**). Referência de ordem de grandeza mais próxima, de fonte primária: edital da equipe de competição automotiva da UTFPR Pato Branco (2024) — Bronze **R$ 500**, Prata **R$ 1.000**, Ouro **R$ 2.000**, Platina **R$ 5.000**, Diamante **R$ 10.000**. Contrapartidas: de "divulgação nas redes sociais" (Bronze) a logomarca em destaque no veículo e nos uniformes (Diamante). | Sim (é um edital) | Edital UTFPR nº 17/2024 (1 — mas é equipe universitária, não clube) |
| **Canais e podcasts automotivos BR** | Nenhum valor público de publi encontrado (**beco sem saída**). Os mídia kits encontrados (ex.: AutoData 2025) trazem audiência e formatos, sem preço. | Não | (4) |
| **Newsletters (referência de preço)** | CPM de US$ 25–80 para listas de 1 mil a 10 mil assinantes; hobby/lifestyle US$ 25–60 direto. | Sim, mas é estimativa de vendedor | Dupple, beehiiv (5 — vendem a ferramenta). Útil como teto, nunca como valor. |

**Quem compra** (inferência a partir dos formatos acima e do nicho do Engine, não de dado medido): estética automotiva e oficinas locais (cota fixa mensal, cidade), autopeças e acessórios, seguradoras e corretoras (lead), marcas de óleo e pneu (desafio ou conteúdo), concessionárias e lojas de seminovos (evento, encontro).

**Como se precifica, no tamanho do Engine:**
- **Cota fixa mensal por cidade** (ex.: "oferecido por" na aba Serviços de uma cidade). É o único modelo que não depende de volume. O ROADMAP §7 estima R$ 300–1.000/mês para 1.000 usuários engajados numa cidade — **número interno, sem fonte**; não achei dado externo que confirme ou derrube.
- **Por evento** (patrocínio de encontro do Engine ou de clube): cotas de R$ 500 a R$ 2.000 são compatíveis com a única referência primária (UTFPR). Isso é **inferência por analogia**.
- **CPM** só faz sentido com escala. O AdSense já cobre esse papel.

**O que o patrocinador pede** (mídia kit): usuários ativos por mês e por cidade, perfil (idade, região, carro que tem e carro que quer — esse é o diferencial do Engine), engajamento (posts, membros de clube, presença confirmada em evento), cases e formatos com preço. A Ajuda do YouTube descreve o mídia kit do próprio YouTube com "banner e biografia do canal, público-alvo principal, principais estatísticas e demografia" (support.google.com/youtube/answer/11322980, camada 1 para o produto deles; via resultado de busca).

### 2.2 Página "Apoie o Engine" — plataformas e taxas

| Opção | Taxa da plataforma | Funciona para o Engine? | Fonte (camada) |
|---|---|---|---|
| **Pix direto** (chave do CNPJ) | 0% de plataforma; tarifa do banco PJ varia (**não verificado**) | Sim. É o mais barato. Sem recorrência automática. | — |
| **Stripe** (já integrado) | 3,99% + R$ 0,39 + 0,7% Billing se for recorrente | Sim. Pix só por convite. | stripe.com/br/pricing (1) |
| **Apoia.se** | **13%** na modalidade contínua (mensal); de 6% a 15% (à escolha) na pontual; boleto/Pix híbrido soma R$ 2 ao apoiador; repasse até o 10º dia útil do mês seguinte, mínimo de R$ 20; campanha sem apoio por 90 dias paga R$ 5/mês | Sim | suporte.apoia.se, "Quanto custa usar a APOIA.se?" (atualizado em 08/08/2024) (1); repasse e inatividade via resultado de busca dos Termos (1, não aberto) |
| **Catarse Assinaturas** | **Não confirmado.** 13% aparece em artigo acadêmico e no blog da Shopify (4), não em página do Catarse | Sim | Página oficial sem o percentual (`crowdfunding.catarse.com.br/comece/recorrente`) |
| **Ko-fi** | 0% em gorjeta avulsa (fora do Ko-fi Standard); **5%** em membership, loja e comissão; mais a taxa do processador | Sim, se o processador pagar no Brasil (**não verificado** para BR) | ko-fi.com/pricing (5 — página de venda, mas é o preço deles) |
| **GitHub Sponsors** | 0% para patrocínio de contas pessoais; até 6% para contas de organização; Brasil é região suportada | **Provavelmente não**: o programa é para quem mantém projeto open source (**inferência**; o repositório do Engine não é público) | docs.github.com (1) |
| **Buy Me a Coffee** | 5% segundo blogs (4); a página oficial de taxas deu **404** | Não confirmado para BR | — |

**Quanto sobra de R$ 25** (cálculo meu sobre as taxas acima): Stripe recorrente ≈ R$ 1,56 de taxa (6,2%); Apoia.se contínuo = R$ 3,25 (13%). No preço de fundador, R$ 15 via Stripe ≈ R$ 1,09 (7,3%). Premium anual de R$ 79,90 via Stripe ≈ R$ 4,14 (5,2%).

**O que se dá em troca:** selo "Apoiador" no perfil, nome num mural (com opt-in, porque é dado pessoal exposto — LGPD art. 7º I), acesso antecipado a funcionalidade, voto no roadmap.

**Canibaliza o Premium?** (inferência) Sim, se o apoio der benefício funcional (sem anúncio, recursos). Não, se for só simbólico. Os modelos limpos:
- (a) **o Premium é o apoio**: a página "Apoie" vende o Premium e o selo vem junto com ele;
- (b) gorjeta avulsa por Pix sem nenhum benefício funcional.

Rodar Apoia.se mensal ao lado do Premium cria dois produtos recorrentes competindo, e o pior deles fica com 13%.

### 2.3 Regras do AdSense que limitam patrocínio ou anúncio próprio

- **Não há proibição de vender patrocínio direto** ou de rodar outras redes no mesmo app. A própria página de conteúdo obrigatório do AdSense pressupõe outras redes: "Se outros fornecedores ou redes de publicidade também veiculam anúncios no seu site", informe-os, com links e opt-out (answer 1348695, camada 1).
- **Limites reais** (Políticas do Programa, answer 48182, camada 1):
  - o anúncio não pode ser formatado de modo que não se distinga do conteúdo;
  - os rótulos permitidos são "Anúncios" ou "Links patrocinados", não "Sites favoritos" nem "Melhores ofertas de hoje";
  - é proibido pedir clique ou visualização e "incentivar os usuários a clicar em anúncios do Google" com frases como **"ajude-nos"**. **A página "Apoie o Engine" não pode ter bloco do AdSense nem texto que ligue apoio a clique em anúncio.**
  - não se pode compensar usuário por ver anúncio. **Inferência**: "ganhe selo vendo anúncios" está fora.
- **App empacotado**: anúncio do AdSense não pode estar "Integrado a um aplicativo de software (não se aplica à AdMob)", e WebView exige integração específica. Bate com o ROADMAP §6 (TWA → AdMob).
- **Exclusividade**: patrocinador que exija "nenhum anúncio do Google na mesma tela" é cláusula comercial, não regra do Google. Basta desligar o AdSlot naquela seção.

### 2.4 Recomendação — o mais simples para começar com poucos usuários

1. **Não vender CPM. Vender cota fixa local**: "Serviços em [cidade] oferecido por [marca]" ou "Encontro Engine [cidade] — patrocínio [marca]". Uma cota por cidade, preço fixo mensal ou por evento, contrato simples, pagamento por Pix ou boleto com nota. É o único formato que fecha com 1 cidade e poucas centenas de usuários.
2. **Primeiros compradores**: os próprios prestadores do Pro de maior porte (estética, autopeças locais) e quem organiza encontro. A venda é pessoal (outbound), igual à aquisição de prestador do ROADMAP §2.
3. **"Apoie o Engine" = página que vende o Premium** + Pix copia-e-cola para gorjeta sem benefício. Sem Apoia.se no começo: 13% e um segundo produto recorrente.

**Telas e seções que o app precisa ter:**
- **"Anuncie no Engine"** (rodapé + Configurações): 3 formatos com preço "a partir de", números do mês (usuários ativos, por cidade), formulário (nome, empresa, CNPJ, cidade, orçamento, formato). O formulário coleta dado pessoal de contato: base legal em procedimentos preliminares de contrato (LGPD art. 7º V).
- **Mídia kit em PDF gerado dos dados reais**: MAU por cidade, distribuição de "carro que tem / carro que quer", membros de clube, eventos e presenças. Tem que sair de consulta, não ser digitado à mão — mesmo princípio de "nunca inventar número" do simulador.
- **Componente de slot patrocinado** (o `AdSlot` já é provider-agnostic): variante "direto" com rótulo "Patrocinado", link com UTM e contagem de impressões e cliques por patrocinador. O relatório para o patrocinador sai daí.
- **Selo "Patrocinado"** no card de destaque pago em Serviços, e o texto "Como ordenamos a lista".
- **"Apoie o Engine"** sem AdSense na página.
- **Política de patrocínio** pública (o que não se aceita: apostas, bebida associada a direção etc. — escolha editorial) e entrada no relatório anual de transparência (STF item 8).

---

## O que foi verificado e o que foi inferido

**Verificado na fonte primária hoje:**
- CDC: arts. 6º, 14, 25, 30, 31, 34, 36, 37, 39, 46, 49, 51, 52, 54.
- Decreto 7.962/2013: arts. 1º–9º.
- Decreto 11.034/2022: art. 1º e escopo.
- LGPD: arts. 7º, 8º, 9º, 10, 14, 18, 19, 41.
- Res. CD/ANPD 2/2022: arts. 11 e 14.
- Guia de Cookies da ANPD: pp. 24–33.
- ECA Digital: arts. 1º, 22, 24, 26 e 41-A.
- Tese do STF Temas 987/533: itens 1–11.
- Res. CVM 20/2021: art. 1º.
- LC 123: art. 18-A §1º e art. 26 §1º.
- LC 214/2025: arts. 4º §2º V e 6º VIII.
- SP Lei 10.705: art. 6º II "a".
- Lista de ocupações MEI no gov.br (26 páginas).
- Situação dos PLs 4734/2024, 5453/2025, 4983/2026 e 3514/2015 na API da Câmara.
- Stripe: preços BR e docs de trial e compliance.
- AdSense: answers 48182 e 1348695.
- Strava Business, Ko-fi, Apoia.se, GitHub Sponsors.
- CONAR: Código, arts. 28 e 30, extraídos do site conar.org.br. A página do código respondeu **403**; o texto saiu do JSON da home.
- Edital UTFPR.
- Procon-SP: Guia de Comércio Eletrônico.

**Inferência (marcada no texto):**
- MEI não cobre a atividade.
- Engine como serviço de "acesso provável" por adolescentes.
- Base legal do pedido de orçamento.
- Janela de arrependimento depois do teste.
- Doação com selo = operação onerosa.
- Canibalização do Premium.
- Preços de cota por analogia.
- GitHub Sponsors inadequado.

**Becos sem saída:**
- Lei federal sobre aviso de renovação automática ou cancelamento pelo mesmo meio: **não existe**; só PLs.
- Nota técnica da Senacon sobre assinaturas digitais: **não encontrada**. A Nota Técnica 2/2024 é sobre planos de saúde.
- Lei brasileira específica sobre avaliação falsa: **não encontrada**.
- Tabela de cotas de encontro de carros, preço de publi de canal automotivo BR, mídia kit da Webmotors, preço de Sponsored Challenge da Strava: **não públicos**.
- Taxa do Catarse Assinaturas na fonte oficial: **não encontrada**.
- Waze Ads: help oficial **404**.
- Buy Me a Coffee: página de taxas **404**.
- Res. CGSN 169/2022 na base da Receita: SPA, conteúdo não devolvido.
- EUR-Lex (Diretiva Omnibus 2019/2161, ranking pago e reviews na UE): **HTTP 202 sem corpo** (anti-bot). Regras da UE para ranking pago **não verificadas**.
- In.gov.br (DOU): **timeout** de 60 s. O texto da Res. ANPD 2/2022 veio do site da ANPD.

## Perguntas para levar ao contador e ao advogado

1. Qual CNAE descreve "assinatura de plataforma digital + venda de espaço publicitário"? Está no Anexo XI da Res. CGSN 140/2018? Se não, ME no Simples (qual anexo)?
2. Apoio com selo é receita de serviço? Exige NFS-e?
3. O Engine é "de acesso provável" por adolescentes pelo ECA Digital? Subir a idade mínima para 18 resolve?
4. Na aba Serviços, o Engine é "marketplace" (STF item 7) ou classificados? Que diligência mínima vale como "atuou diligentemente" (item 4) para destaque pago?
5. O relatório anual de transparência (STF item 8) se aplica a um provedor deste porte?
