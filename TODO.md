# TODO — o que falta

Lista acionável do que ficou pendente. O **porquê** de cada decisão está no
`ROADMAP.md`; aqui é só o que fazer.

Última atualização: 20 de agosto de 2026.

---

## Estado em 20/08/2026 — quanto falta, honestamente

Leitura de escopo pedida pelo Murilo. O detalhe de cada item está nas seções
abaixo; aqui é só a **ordem de grandeza** e quem é o dono de cada monte.

### Monte 1 — depende de você. Poucas horas, e é o que trava o resto

Sentry, PostHog, domínio, chave do `dados.gov.br`, Blaze, advogado. Somando, é
o trabalho de um sábado. Não é grande em horas; é grande em consequência —
enquanto o Sentry não tiver chave, ninguém fica sabendo quando um usuário toma
erro, e o produto segue sendo decidido no escuro.

### Monte 2 — código, com fim à vista. 2 a 3 dias

- [x] ~~As três travas do casamento de versão na ficha~~ — fechadas em
  21/08/2026 (`dd9ab50`). A varredura versão a versão achou mais quatro casos
  da mesma classe, e o defeito maior estava escondido: o `return` antecipado
  da cilindrada engolia a checagem de aspiração, e isso **servia número errado
  agora** — 11 Creta 1.6 aspirado recebendo os 8,1 s do 1.6 turbo, 29 HB20
  recebendo o tempo do aspirado incluindo as TB. Cobertura de desempenho caiu
  de 4,8% para 3,4%: 48 perdas, todas de outro carro, zero ganho por
  afrouxamento
- [x] ~~O rasterizador de PDF~~ — feito em 06/10/2026, com resultado diferente
  do previsto. **Hilux destravada** (82 versões×ano ganharam número, 0 perdas,
  0 trocas): o torque "ilegível" era daN.m sem o prefixo, não algarismo
  perdido. **Tracker MY≤2025 e o 1.2T de 132/133 CV NÃO destravam**: a imagem
  mostra duas calibrações por motor no mesmo ano-modelo, separadas pelo tipo de
  injeção, que a FIPE não escreve. Continuam retendo, pelo motivo certo
- O parser por coluna do anexo SFP-40/25, meio dia
- [x] ~~Híbrido em SP isento até 31/12/2026~~ — fechado em 06/10/2026
- [x] ~~Isenção de IPVA por idade nas ~15 UFs que faltam~~ — fechado em 06/10/2026
- [x] ~~O corte de 1 ponto na régua de conforto~~ — fechado em 21/08/2026
  (`ade8575`), e o caso real era pior do que o anotado: sobra de **R$ 17.789
  por mês** perdida por 0,2 ponto de fatia. A zona morta sozinha só mudou o
  penhasco de lugar (pior caso R$ 15.414), então entrou junto a **folga
  enfática**: quem termina o mês com mais da metade da renda livre não é
  rebaixado pela fatia. Rebaixadas caem de 453 para 297 células
- Os 5 erros de lint anteriores em `Services.jsx`

### Monte 3 — não tem fim, e tudo bem

Precisão de dado é esteira, não linha de chegada:

- **Manutenção não distingue veículo nenhum** — um Lancer 2.0 e um Onix do mesmo
  preço custam igual para manter. Sem fonte verificada; não inventar fator
- **A base de consumo não é do INMETRO** e decide ~2/3 da conta da tela.
  Bloqueada numa chave de API, não morta
- **Ficha técnica**: potência em 15,5%, desempenho em 2,4%, frota em 16/26
  motores. Cada rodada de pesquisa sobe alguns pontos

### A resposta curta

Para **abrir o link**, falta pouco, e quase tudo é decisão sua. Para o
**simulador ser confiável**, falta sempre — a pergunta certa não é "quando
acaba", é "dá para alguém decidir a compra de um carro com isto?". Para o custo
mensal, hoje a resposta é sim. Para a ficha técnica, ainda não.

### O que não está em lista nenhuma, e é o maior risco

**O simulador nunca foi aberto por um humano num navegador logado.** Foi
construído, medido, testado por script e prototipado — mas olho humano, zero.
Isso não é uma linha de TODO que se marca; é a validação que falta.

---

## Depende de você (não é código)

### Chaves de observabilidade — 10 minutos

O código está pronto e desligado até as chaves existirem.

- [ ] Criar conta no **Sentry** e pegar o DSN
- [ ] Criar conta no **PostHog** e pegar a chave (começa com `phc_`)
- [ ] Colar `VITE_SENTRY_DSN` e `VITE_POSTHOG_KEY` no `engine/.env`
- [ ] Colar as mesmas duas nas variáveis de ambiente do **Netlify** — sem isso
      só funciona no seu localhost

Sem isso você não fica sabendo quando alguém toma um erro, e continua decidindo
produto no escuro.

### Gateways de pagamento — algumas semanas à frente

Checklist completo e passo a passo em **`SETUP-PAGAMENTOS.md`**. Resumo:

- [ ] Service account do Firebase
- [ ] Conta Mercado Pago (aceita CPF) + access token + webhook
- [ ] Conta Stripe (também aceita CPF) + produto/preços + webhook
- [ ] Seis variáveis de ambiente no Netlify
- [ ] Testar de ponta a ponta em modo teste

### Domínio próprio — ~R$ 40/ano

- [ ] Comprar no registro.br
- [ ] Apontar no Netlify
- [ ] Depois de apontar, revisar três lugares que hoje usam o domínio do
      Netlify: `start_url` no manifest do PWA, URLs de retorno do checkout em
      `subscription-create.js`, e os endereços de webhook cadastrados nos dois
      gateways

### Firebase Blaze — quando decidir

Enquanto o Storage estiver desligado, `photos.js` cai no fallback e grava a
imagem em **base64 dentro do documento do Firestore** (teto de 1 MiB por
documento; o feed lê 20 documentos por página com a imagem embutida). Funciona
com poucos usuários; quebra com gente de verdade subindo foto.

### Legal — antes de divulgar

- [ ] Revisão por advogado (as páginas descrevem o sistema com precisão, mas
      isso não é revisão jurídica)
- [ ] Traduzir termos e privacidade — hoje só em português, e o produto suporta
      12 países. Para a Europa o GDPR exige mais que tradução: base legal,
      consentimento de cookie e canal de exercício de direitos
- [ ] Trocar o responsável para o CNPJ quando abrir MEI
- [ ] Consentimento de cookies para quando o AdSense entrar

### MEI — quando o faturamento justificar

Nem Mercado Pago nem Stripe exigem CNPJ; os dois aceitam CPF. Mas recebendo
como pessoa física o dinheiro é renda tributável pelo IR (até 27,5%) e não dá
para emitir nota, que prestador com empresa pode pedir. Confirmar com contador
se a atividade está na lista de ocupações permitidas do MEI.

---

## Bugs resolvidos em 07/08/2026

Todos verificados no app. Ficou de pé só o que a causa raiz exige: **as fotos
moram dentro do documento do Firestore**, então cada uma pesa no limite de
1 MiB, na velocidade da gravação e no custo da leitura. O Blaze resolve os
quatro de uma vez, sem código novo.

| Bug | Commit |
| --- | --- |
| Salvar carro apagava a foto | `5bfc370` |
| Miniaturas de moto no "Compartilhar meta" | `5bfc370` |
| Legenda virava a bio do perfil | `5bfc370` |
| Publicação levava uma foto só | `5bfc370` |
| Perda silenciosa ao estourar 1 MiB | `4f8a11d` |
| Garagem "sumindo" e foto não chegando ao servidor | `278e043` |

<details>
<summary>Diagnóstico original, para referência</summary>

### 1. CRÍTICO — salvar carro em dev apaga a foto

Reproduzido: clicar em "Consegui, é meu!" no Corsa apagou a imagem e não
gravou o tipo. Confirmado no Firestore: `image` vazio, `images: 0`,
`type` ausente.

**Causa raiz** (duas somadas):

- `normalizeCarImages` (`db.js:227`) só lê `car.images` e **ignora
  `car.image`**. Como deriva a capa de `images[0] || ""`, um carro que só
  tem capa vira carro sem foto nenhuma.
- Em dev, `getCars()` chama o backend Java, que devolve `image` mas
  **não** `images` — e no `saveCar` descarta os campos que não conhece
  (`type`, `images`, `ownership`, `contributions`).

Ou seja: **qualquer save de carro em dev apaga a foto**, não só o botão
novo. Em produção não acontece, porque lá o caminho é o Firestore direto.

**Correção:** fazer `normalizeCarImages` cair em `car.image` quando
`images` estiver vazio (para a sangria imediata) e tirar o branch de API
de `getCars`/`saveCar`, como já foi feito em `setFollow`,
`updateCommunityGoalNote` e `subscribeCommunityGoals`.

**Dado perdido:** a foto do Corsa precisa ser enviada de novo.

### 2. Miniaturas erradas no "Compartilhar meta"

Todos os carros aparecem com a mesma foto de moto no modal de
compartilhar. Provavelmente um fallback sendo usado porque a imagem real
não chega — possivelmente o mesmo problema do item 1.

### 3. Legenda da publicação não é usada

Ao compartilhar a meta, a descrição escrita na hora é ignorada e o que
aparece é a **bio do perfil**. O comentário em `buildCommunityGoal` diz
justamente o contrário ("Legenda escrita na hora de publicar — não é mais
a bio do perfil"), então a intenção existe e a ligação quebrou em algum
ponto entre o modal e o `note`.

### 4. Publicação não leva as fotos do veículo

Compartilhar uma meta da garagem deveria puxar **todas** as fotos
cadastradas naquele carro, e hoje não leva. Ajustar também o
enquadramento para caber direito na tela.

</details>

## Código

### Fechar o portão de cobrança

Está tudo pronto; falta só a decisão de negócio.

- [ ] Dar plano cortesia aos 20–30 primeiros prestadores (escrever
      `plan: "premium"` no doc deles via Admin SDK)
- [ ] Virar `SUBSCRIPTION_GATE_OPEN` para `false` em `Services.jsx`

**Não fechar antes de conseguir mostrar retorno ao prestador.** O painel de
métricas do anúncio já existe justamente para isso — sem número para mostrar, o
cancelamento vem no segundo mês.

### Simulador — puxar dado real das fontes mapeadas

Inventário completo, com endpoints verificados, em **`SIMULADOR-FONTES.md`**.
Na ordem de retorno:

- [ ] **ANP semanal → Firestore.** Os valores foram remedidos à mão em
      14/08/2026 (preços, `FUEL_FACTOR_BR` e o novo `FUEL_FACTOR_BR_ETHANOL`),
      então o ganho agora é não apodrecer. CSV público, sem autenticação, ~8 MB
      por semana. Falta também o **diesel**, que está noutro arquivo da ANP e
      segue com valor de jul/2026 não reconferido
- [ ] **BCB SGS 25471 mensal → Firestore.** Cinco linhas. Hoje o ganho é nulo
      (1,97% contra 1,99%), mas a série já marcou 1,63% e vai divergir de novo
- [x] ~~**IPVA do Amazonas está 2× errado**~~ — corrigido em 13/08/2026: AM foi
      para 2,0% (1,5% elétrico), CE para 3,0%, e o PR já estava certo com 1,9%
- [x] ~~**`MT: 0.0345` sem confirmação**~~ — corrigido em 14/08/2026 para 3,0%
      (Portaria SEFAZ-MT 196/2025, art. 2º VII). O 3,45% era a alíquota de
      utilitários de GOIÁS; provável contaminação entre UFs vizinhas
- [x] ~~**IPVA cobrado em carro de qualquer idade**~~ — corrigido em 14/08/2026.
      A EC 137/2025 tornou imune o veículo com 20+ anos de fabricação em todo o
      país; `IPVA_BR_EXEMPT_AGE` cobre GO (15), RJ (16) e MT (18) por cima disso
- [x] ~~**MS, PI e BA — únicos suspeitos de erro PARA BAIXO**~~ — fechado em
      17/08/2026, e os três escalares estavam **certos**. O que a calculadora
      comercial via era uma segunda dimensão da lei que um escalar não carrega,
      e que o motor conhece. Entraram `IPVA_BR_DIESEL` (BA 3,0% · MS 4,5%),
      `IPVA_BR_VALUE_BRACKET` (PI acima de R$ 150 mil → 3,0%) e
      `IPVA_BR_ELECTRIC_EXEMPT_MAX` (BA isenta 100% elétrico até R$ 300 mil, e
      nós cobrávamos). Picape diesel de R$ 220 mil em MS: IPVA de R$ 550 para
      **R$ 825/mês**. Método que vale guardar: o **SAPL das assembleias
      estaduais** (`sapl.al.pi.leg.br/api/norma/normajuridica/?numero=&ano=`)
      entrega o PDF da lei sancionada por API sem chave, e foi ele que resolveu
      o PI depois que o consolidado oficial da SEFAZ-PI se revelou congelado em
      2011
- [ ] **Alíquota de primeira tributação (zero km) por UF.** MS cobra 5% do zero
      km sobre a nota fiscal contra 3% de usado; provavelmente não é o único. O
      motor fica na de usado de propósito — ver `SIMULADOR-FONTES.md` —, e o
      lugar certo disso é uma linha de **custo de entrada** que a tela não tem,
      junto com transferência e emplacamento
- [x] ~~**Híbrido em SP é isento até 31/12/2026**~~ — feito em 06/10/2026. Não
      precisou de combustível novo: a isenção é do CARRO (híbrido pleno, flex,
      até R$ 261.154,45), não do que se põe no tanque. Regra por lista
      (Corolla, Corolla Cross, Yaris Cross híbridos), porque o nome da FIPE não
      separa híbrido leve de pleno — isentar pelo marcador daria IPVA zero a um
      Pulse Hybrid. Escada 2027–2029 já modelada. `npm run check:ipva`
- [ ] **Medir o viés FIPE × base do IPVA.** Formato do anexo da Resolução
      SFP-40/25 conferido em 17/08/2026: é **PDF** (8,3 MB, 286 páginas) — mas
      com camada de texto e coordenadas, então um parser por coluna lê a tabela.
      Meio dia. O PDF ainda declara na folha `MÊS BASE: SETEMBRO/2025`, o que
      confirma o congelamento por fonte primária. **Um spot check de 4 versões
      2024 deu a base do IPVA ACIMA da FIPE em três delas (+2,0%, +0,2%, +1,9%,
      −2,2%)** — ou seja, a suposição de que erramos para cima em SP não se
      sustentou, e o erro pode ser para baixo. Quatro pontos não medem viés; a
      medição completa virou a parte que falta, e o comentário no código já não
      afirma direção
- [x] ~~**Isenção por idade nas ~15 UFs que faltam.**~~ — feito em 06/10/2026.
      14 UFs entraram (AP, AM, BA, CE, DF, ES, MA, PA, PB, PI, RN, RO, RR, SE),
      cada uma com lei ou página oficial no comentário. As listas da imprensa
      erram: Tocantins COBRA de quem tem 15+ anos, e ficou no piso de 20. AP
      (decreto de 2004) e RR (página da SEFAZ-RR não abriu) são as duas de
      confiança menor. Na mesma pesquisa: **PE cobra 2,4%, não 3%** — corrigido
- [ ] **Elétrico no CE e no RN.** A página de isenções da SEFAZ-CE lista "veículos
      movidos a motor elétrico" (Lei 12.023/92, art. 4º, IX) — conferir se ainda
      vale antes de isentar. O RN revogou a isenção do elétrico (Lei 12.026/2024)
      e pôs 0,5% subindo meio ponto por ano até metade da alíquota normal
- [ ] **Alíquota de elétrico por UF.** Existe `IPVA_BR_ELECTRIC`, mas só com o
      AM — e continua só com o AM depois da rodada de 14/08: o MT não tem inciso
      de elétrico na portaria vigente, e o DF isenta mas de forma **condicional**
      (só se comprado de revendedor do DF), o que não cabe num escalar
- [x] ~~**Job mensal de amostragem FIPE histórica**~~ — recalibrada em
      13/08/2026 por corte transversal (90 pares, 21 modelos). Curva era o
      padrão americano (16/12/10/8/6/4), virou 10/7/5,5/5/5,5. Falta a série
      longitudinal para separar depreciação de efeito de safra
- [ ] **Manutenção não distingue veículo nenhum.** É `valor × 4% × fator de km`,
      então um Lancer 2.0 e um Onix 1.0 do mesmo preço custam igual para manter.
      Sem fonte verificada de custo de peça e mão de obra por marca — não
      inventar fator; procurar dado antes
- [x] ~~**Completo mais barato que terceiros abaixo de R$ 11 mil**~~ — fechado em
      14/08/2026: o prêmio de terceiros virou piso do completo
- [x] ~~**Casco não existe em carro velho, e o motor finge que existe**~~ —
      fechado em 17/08/2026. Acima de `INSURANCE_FULL_COVERAGE_MAX_AGE = 20`
      anos, e só no Brasil, pedir completo devolve o prêmio de terceiros com
      `basis: "thirdparty_forced"` e a tela explica por quê (chave nova em
      pt-BR, en-US e es-ES). O corte é o **topo** da faixa de aceitação de 15 a
      20 anos, para o silêncio significar "nenhuma seguradora vende isto" e não
      "algumas não vendem"; critério escrito no comentário. `null` foi
      descartado porque `monthly.insurance` alimenta o total e viraria `NaN`.
      Carro de 22 anos e R$ 20 mil em SP, condutor 18-25: seguro de R$ 136,20
      para **R$ 76,67/mês**, total de R$ 689,38 para R$ 629,85
- [x] ~~**Piso absoluto do seguro — os R$ 700/ano de `thirdPartyPremium`**~~ —
      caçada de fonte feita em 17/08/2026 a pedido do Murilo. **O piso fica em
      R$ 700 e nenhum número mudou** (efeito na tela: R$ 0,00/mês). Atacado por
      decomposição, e duas das quatro parcelas supostas fecharam: **emissão de
      apólice vale R$ 0** (cobrança separada do prêmio vedada desde 01/01/2013;
      Res. CNSP 413/2021, art. 6º, para bilhete) e o **IOF é 7,38% do prêmio**
      (Decreto 6.306/2007, art. 22, § 1º, IV — conferido no texto consolidado,
      as mexidas de 2025 pegaram crédito, câmbio e VGBL, não "demais seguros"),
      ou seja **multiplicador, não piso**. Sobraram RCF e assistência 24h, sem
      fonte: o AUTOSEG voltou ao ar mas é **casco e só casco**, e o Open
      Insurance publica o campo de prêmio com zero em todas as seguradoras. Como
      uma das parcelas vale zero, o material aponta para **baixo**, não para
      cima — subir seria inventar. Detalhe em `SIMULADOR-FONTES.md`, seção 4
- [ ] **AUTOSEG voltou ao ar em 17/08/2026 (~17h40 BRT) — extrair os fatores
      relativos de faixa etária e região.** SES e AUTOSEG devolvem 200; o
      servidor oscila, então reconfira a data antes de concluir qualquer coisa.
      O caminho de download que estava registrado era errado: o certo é
      `redarq.asp?arq=Autoseg2021A.zip`, que redireciona para
      `/download/estatisticas/`. A base está congelada no 2º semestre de 2020
      (confirmado nos downloads **e** no formulário on-line, cujo último período
      é 31/12/2020). Serve para `INSURANCE_AGE_RATES` e `INSURANCE_REGION_BR`,
      porque publica prêmio médio E IS média por exposição — a razão entre os
      dois é o prêmio como % do valor. Atenção: faixas do AUTOSEG são 18-25 /
      26-35 / 36-45 / 46-55 / >55 e o motor usa 36-55 como faixa única; e
      rotular como "base SUSEP 2020", ancorando o nível num parâmetro calibrável
- [ ] **DECISÃO DO MURILO — chave do `dados.gov.br`.** Segue em 401
      (reconfirmado 17/08/2026). O cadastro **não é auto-serviço anônimo**: sai
      por conta gov.br, que exige CPF e nível de identidade, então é decisão
      dele e não minha. Destravaria dois itens de uma vez: dado estruturado da
      SUSEP e o PBEV estruturado da seção 6
- [ ] **Franquia via Open Insurance** — API pública sem autenticação, chaveada
      por CEP + FIPE + ano. Não traz prêmio (o campo `premiumRates` existe na
      v2/v3 e **todas** as seguradoras mandam zero, varrido em 17/08/2026), mas
      traz franquia, pacote de assistência e o LMI de RCF, que hoje o simulador
      ignora. O LMI vendido varia de R$ 5 mil a R$ 1 milhão — "seguro de
      terceiros" não é um produto só, e o simulador não pergunta o LMI

- [ ] **A base de consumo não é do INMETRO.** Desrotulada na tela em 14/08/2026
      (eram 24 tuplas distintas para 91 modelos, com diesel em Gol e Kwid).
      Continua em uso como estimativa por categoria, que ainda separa um Hilux
      de um Mobi. Trocar por medição real é caso para o `expenses.js`, igual à
      manutenção — e decide ~2/3 da conta da tela.
      **Estado em 17/08/2026: bloqueado numa chave de API, não morto.** As
      quatro APIs de ficha técnica auditadas não têm consumo de carro
      brasileiro, e as que têm consumo têm EPA ou ciclo europeu — que não são
      intercambiáveis com INMETRO/PBEV, e trocar em silêncio repetiria o erro de
      rótulo que a gente acabou de corrigir. O PBEV 2026 tem as 895 versões
      certas, 277 flex, e continua só em PDF com download bloqueado por
      Cloudflare. **O fio vivo é a chave grátis do `dados.gov.br`** (401 hoje),
      que responderia se existe PBEV estruturado publicado lá

Não fazer: pipeline de PDF do INMETRO, pipeline por país para seguro
internacional, e procurar API de cotação de seguro — está bloqueada por registro
de corretora na SUSEP, é decisão de parceria e não de engenharia. Também não
adianta API comercial de IPVA (Infosimples, Celcoin, APIBrasil): todas consultam
débito por placa + RENAVAM, e aqui o carro ainda não foi comprado.

### Notificação de lembrete

Agora destravada: o registro de gastos existe, então há conteúdo para lembrar
("faz 40 dias do último abastecimento lançado"). Com parcimônia — notificação
sem conteúdo bom vira desinstalação. Web push funciona no Android e, no iOS,
para quem adicionou o app à tela de início.

### Dívida técnica conhecida

- [ ] `Services.jsx` tem 5 erros de lint anteriores a esta sessão: dois
      `setState` dentro de efeito e três funções de moderação declaradas e nunca
      usadas (`approveListing`, `openReturnListing`, `openRejectListing`) —
      cheiram a funcionalidade que ficou pela metade
- [ ] Backend Java só roda em dev e não tem paridade de payload; inventário
      completo em `engine-api/PARIDADE.md`
- [ ] Itens das listas Seguidores/Seguindo no perfil já abrem o perfil da
      pessoa, mas o mesmo não vale para outras listas de usuário do app

---

## Já feito nesta sessão (06/08/2026)

| Entrega | Commit |
| --- | --- |
| Brecha de edição em `communityGoals` fechada e testada | `6651f29` |
| Denúncia e bloqueio | `6651f29` |
| Sentry + PostHog (desligados até ter chave) | `b13eec2` |
| PWA instalável | `6afe1d3` |
| Portfólio do prestador (Instagram, TikTok, vídeo) | `b0aeb6f` |
| Métricas do anúncio + leitura pública sem login | `eb8d663` |
| Assinatura Premium (Mercado Pago + Stripe) | `a28021b` |
| Aporte como evento + previsão da meta | `f88745c` |
| Termos de uso e política de privacidade | `e792d55` |

## Já feito em 11/08/2026

| Entrega | Commit |
| --- | --- |
| Gasto real do carro que a pessoa já tem (item 9) | `02b5e9e` |
| Simulador comparando com o gasto real | `68049ab` |

O item 9 fechou os três encaixes que justificavam ele: o simulador agora bebe
de dado medido em vez de estimativa, a meta ganha contexto ("você gasta X com o
que tem; o que quer sairia por Y") e lançar lavagem, revisão ou pneu oferece um
prestador na hora — que é onde frequência de uso encontra receita.

Fica de pé uma tensão conhecida: cada lançamento lê a garagem inteira e
reescreve o documento do carro, que hoje carrega as fotos em base64. Funciona,
mas é mais um lugar em que o Blaze deixaria de ser opcional.
