# Auditoria pré-lançamento — Garagem (carros, metas/aportes, previsão, ficha técnica, gastos)

Data: **25/10/2026**. Autor: Brian (Garagem/ficha). Somente leitura — nenhum arquivo de código alterado.

Código lido: `engine/src/pages/Garagem.jsx` (inteiro), `components/CarCard.jsx` (inteiro),
`components/ModalNewCar.jsx` (inteiro), `components/ContributionModal.jsx` (inteiro),
`components/ExpensesModal.jsx` (inteiro), `components/specsheet/SpecSheetModal.jsx` e `labels.js`,
`services/expenses.js`, `services/forecast.js`, `services/carDisplay.js`, `services/vehicleSpecs.js`
(linhas 1–600), `services/db.js` (300–520, 690–730, 1030–1360, 1990–2050), `App.jsx` (75–440, 540–701),
`services/i18n.js` (blocos pt-BR da Garagem e da ficha), `supabase/migrations/20261016230000_schema.sql`
(tabela `cars`, linhas 83–91), `src/services/engine-specs.json` (`_meta`).

O que eu **rodei** (sem escrever no repo; scripts auxiliares só no scratchpad):
- `node scripts/check-fipe-parser.mjs` e `node scripts/check-spec-sheet.mjs`, contra a amostra
  `scripts/.cache/fipe-models.json` (4.864 versões, baixada em 17/08/2026).
- A paridade de chaves i18n dos blocos `garage`, `car`, `modalCar`, `contribution`, `expenses`,
  `specSheet`, `deleteModal` e `ownership` entre pt-BR, en-US e es-ES: **0 chaves faltando** nos dois sentidos.
- Uma sondagem da ficha de fábrica em versões reais de Onix, HB20, Gol, Kwid, Cronos, Kicks, Yaris,
  Polo, T-Cross, Strada, Compass, Renegade, City e Corolla.
- Três chamadas à FIPE (parallelum) em 25/10/2026: GM tem **557** modelos na lista, VW **549**,
  e **157** deles começam com "Gol".

O que **não** medi: a taxa de acerto da ficha na base real de carros. Não tenho acesso de leitura ao
Supabase nesta tarefa. Os números de cobertura abaixo se referem ao **catálogo FIPE** e não à base. Ver §4.

---

## 0. Os achados que mais pesam

1. **Achar a versão certa no celular é o maior atrito do cadastro.** O modelo é um `<select>` nativo, sem
   busca, com **557** opções na GM e **549** na VW (157 só de Gol). E vem **antes** do ano
   (`ModalNewCar.jsx:433-469`), então quem tem um "Onix 2022" percorre as versões de 2012 a 2026 sem filtro.
   Também não dá para começar pelo que a pessoa sabe ("Onix 2022 automático").
2. **Vírgula e ponto corrompem aporte, gasto e litros.** `parse` remove **todo ponto** e troca a vírgula por
   ponto (`ContributionModal.jsx:43`, `ExpensesModal.jsx:272-273`). Resultado: "38.5" litros vira
   **385 L**, e "1500.50" de aporte vira **R$ 150.050**. O teclado é `inputMode="decimal"`, e em teclado
   Android com ponto (**inferência**, não testei aparelho) isso é o caminho natural. Nenhum valor tem faixa
   de plausibilidade: 385 L num Kwid (tanque de dezenas de litros) entra sem aviso, e daí a previsão, a
   meta "batida" e o consumo real saem errados com cara de certos.
3. **Falha da FIPE é silenciosa, e o preço velho fica.** Os quatro `axios.get` engolem o erro
   (`ModalNewCar.jsx:66`, `157`, `176`, `197`): sem marcas, a lista fica vazia, sem mensagem e sem "tentar de
   novo". Pior, `targetValue` não é zerado ao trocar marca ou modelo (`138-146`, `161-166`) nem ao trocar o
   ano (`180-183`). Se a consulta de preço falhar, o carro é salvo com o **preço da versão anterior** ou com
   **R$ 0**. Meta com alvo 0 mostra "Falta 100% · R$ 0" (`CarCard.jsx:26-39`), e o campo é só-leitura
   (`ModalNewCar.jsx:477-481`): não há como consertar sem refazer a cascata inteira.
4. **A meta é congelada no preço FIPE do dia do cadastro, e não é editável.** Nada no código reconsulta a
   FIPE (o único `targetValue` atribuído fora do cadastro é o de `App.jsx:287`). Usado desvaloriza e 0 km
   sobe, e a meta e a previsão envelhecem sem aviso. O rótulo "Preço FIPE" (i18n `modalCar.fipePrice`) dá a
   entender que o valor é atual. Também não dá para pôr a meta em "o preço que eu achei" nem incluir
   documentação.
5. **O "Consumo real" pode ser um número errado com selo de real** (`expenses.js:78-98`).
   (a) Não há campo "tanque cheio?": se o **último** abastecimento foi parcial (os "R$ 50" do brasileiro),
   o km/l estoura. (b) Não há campo de combustível: num flex, etanol e gasolina entram na mesma média, e o
   número não é nem um nem outro. (c) Um abastecimento lançado com odômetro mas **sem litros** é filtrado,
   e o trecho seguinte soma a distância dos dois com os litros de um só, o que infla o km/l. A tela mostra
   o resultado como "Consumo real" (`ExpensesModal.jsx:377-388`), com o mesmo peso de um dado medido.
6. **Dois "por mês" lado a lado no card do carro próprio, e o estimado é que se chama "real".** O botão da
   esquerda mostra o gasto **medido** ("R$ X/mês", `CarCard.jsx:97-103`). O da direita mostra a
   **estimativa** do simulador, com o title "Custo real/mês" (i18n pt `ownership.cardMonthly`, linha 947).
   A média medida também não amortiza despesa anual: com 30 dias de histórico e um IPVA ou seguro pago no
   período, o "/mês" do card sai com o ano inteiro dentro (`expenses.js:156-157`).
7. **Data em UTC.** `today()` usa `toISOString()` (`ContributionModal.jsx:9`, `ExpensesModal.jsx:217`,
   `expenses.js:40`). No Brasil (UTC−3), a partir das 21h o lançamento nasce com a data de **amanhã**, e o
   `max` do campo também deixa escolher amanhã.
8. **Apagar aporte ou gasto custa um toque, sem confirmação nem desfazer, e a falha não aparece.**
   `remove` usa `try/finally` sem `catch` (`ContributionModal.jsx:63-71`, `ExpensesModal.jsx:305-313`).
   Se o servidor recusar, sobra uma rejeição não tratada e a tela fica igual. O botão de lixeira fica
   colado ao valor, numa lista feita para o polegar.
9. **Ficha técnica: o botão "voltar" do Android sai da Garagem.** `SpecSheetModal` não usa
   `useHistoryDismiss`, que todos os outros modais da Garagem usam (verificado com grep em
   `components/specsheet/`).
10. **A ficha não tem potência para os carros de volume da Garagem, e uma das frases de ausência acusa
    a montadora sem prova.** Ver §3. Na sondagem, Onix 2022 (aspirado e turbo), HB20 Sense, Gol 1.0,
    Kwid, Cronos e Kicks saem sem potência. A frase `absent.no_engine_row`, "A montadora não publica em
    formato aberto", aparece no **Yaris 1.3**, e o `_meta` do próprio `engine-specs.json` documenta a API de
    manuais da Toyota com Yaris 2018–2024 no ar. O buraco é nosso, não da Toyota. É o mesmo erro do
    `consumption.js`, só que no rótulo.

---

## 1. Por jornada

### (a) Usuário novo, celular, primeiro carro

| # | O que acontece | Onde | Gravidade |
|---|---|---|---|
| a1 | Garagem vazia: texto e alvo, sem botão dentro do vazio e sem explicar meta × "já é meu". O único CTA é o "Adicionar carro" do topo. O subtítulo "Gerencie seus sonhos" não serve para quem cadastra o carro que já tem. | `Garagem.jsx:115-140`, i18n `garage.subtitle` | Média |
| a2 | Seletor de modelo com 549–557 opções, sem busca, com o modelo antes do ano (achado 0.1). | `ModalNewCar.jsx:433-469` | **Alta** |
| a3 | FIPE fora do ar ou com limite de requisições estourado: lista vazia e muda (achado 0.3). | `66`, `157`, `176`, `197` | **Alta** |
| a4 | Preço da versão anterior grudado ao trocar a seleção (achado 0.3). | `138-199` | **Alta** |
| a5 | O campo "Já tenho" é texto sem `inputMode`, então o celular abre o teclado completo. A máscara de moeda divide por 100 a cada dígito. | `490-495`, `55-58` | Média |
| a6 | O input de foto aceita `multiple`, mas só a 1ª foto vai para o cropper e as outras somem sem aviso. | `97`, `372` | Baixa |
| a7 | A mensagem de foto diz "até 4 MB", mas o limite real é **6 MB**. | i18n `modalCar.imageError` (l. 1292) × `photos.js:16` | Baixa |
| a8 | "Máximo de N fotos **por meta**", também para carro próprio. Erro em `text-red-500` cravado (regra de tokens). O comentário da linha 309 diz "foto é obrigatória", e não é desde 25/09. | i18n 1296, `ModalNewCar.jsx:502`, `309` | Baixa |
| a9 | O cadastro só funciona com FIPE e em BRL (`currency: "BRL"` cravado em `ModalNewCar.jsx:51`, `CarCard.jsx:224`, nos dois modais). O Engine abre em 12 países, e fora do Brasil a pessoa vê marcas e preços brasileiros. É limitação a declarar, não a esconder. | | Média |

### (b) Entender a meta e a previsão

| # | O que acontece | Onde | Gravidade |
|---|---|---|---|
| b1 | Meta congelada e não editável (achado 0.4). | `ModalNewCar.jsx:477-481` | **Alta** |
| b2 | No card, a previsão aparece como uma data solta embaixo de "APORTE" (ex.: "mar. de 2027"), sem dizer que é previsão. O texto explicativo só existe dentro do modal. | `CarCard.jsx:110-115` | Média |
| b3 | O piso de 1 mês em `monthlyPace` faz um **aporte único** virar ritmo mensal. Quem lança hoje R$ 10.000 guardados "de antes" ganha uma previsão como se guardasse R$ 10 mil por mês. | `forecast.js:243` | Média |
| b4 | O valor do modal arredonda para real inteiro (`maximumFractionDigits: 0`), então R$ 500,50 aparece como R$ 501. | `ContributionModal.jsx:31-36` | Baixa |
| b5 | Se a gravação de "Consegui, é meu!" falhar, nada aparece: `markCarAchieved` ignora o retorno de `saveCarAction`. | `App.jsx:284-288` | Média |
| b6 | O modal de exclusão diz "Você já conquistou {{percentage}}% desse objetivo" também para carro próprio (sempre 100%). E não avisa o que de fato se perde: histórico de gastos e aportes, ficha declarada e a publicação na Comunidade (`deleteCar` apaga `community_goals`). | i18n `deleteModal.message`, `db.js:1321-1336` | Média |

### (c) Lançar gasto (usuário recorrente)

| # | O que acontece | Onde | Gravidade |
|---|---|---|---|
| c1 | Parse de decimal (achado 0.2) e nenhuma faixa: litros, valor e odômetro aceitam qualquer coisa. Odômetro menor que o anterior é aceito e depois ignorado em silêncio no consumo. | `ExpensesModal.jsx:272-293`, `expenses.js:91` | **Alta** |
| c2 | Consumo real sem tanque cheio, sem combustível e com o trecho sem litros inflado (achado 0.5). | `expenses.js:78-98` | **Alta** |
| c3 | Média mensal sem amortizar anual (IPVA, seguro, licenciamento) (achado 0.6). | `expenses.js:156-157` | Alta |
| c4 | Data UTC (achado 0.7). | | Alta |
| c5 | Excluir sem confirmação, sem desfazer, sem erro visível (achado 0.8). Gasto não tem edição: errou o valor, apaga e relança. | | Alta |
| c6 | O histórico mostra os 30 últimos, sem "ver mais". O teto de 300 descarta os **mais antigos** sem avisar, e as médias e o consumo mudam sozinhos. Com abastecimento semanal e outras despesas, isso chega em alguns anos (**inferência** de ritmo). | `ExpensesModal.jsx:530`, `expenses.js:33`, `66` | Média |
| c7 | O valor da lista é arredondado para real inteiro. | `ExpensesModal.jsx:256-261` | Baixa |

### (d) Ficha técnica

| # | O que acontece | Onde | Gravidade |
|---|---|---|---|
| d1 | O botão voltar do Android sai da Garagem (achado 0.9). Fechar pelo X tem alvo de 40×40 (os outros modais têm 44×44). | `SpecSheetModal.jsx:32-38`, `107` | Alta |
| d2 | Cobertura baixa nos carros de volume e frase que acusa a montadora (achado 0.10, §3). | i18n `specSheet.absent.no_engine_row` | Alta |
| d3 | O card mostra o **maior** número do par flex ("84 cv" no Polo Track) sem dizer que é no etanol. Na gasolina são 77. A ficha mostra os dois, o card não. | `labels.js:123-126` | Baixa |
| d4 | No card de meta, a identidade inteira é o botão da ficha, e o resto do card abre a edição. Dois alvos grandes vizinhos fazem coisas diferentes, sem pista visual além de um chevron. Decisão de design registrada (Murilo), mas vale observar no teste com usuário. | `CarCard.jsx:309-325`, `Garagem.jsx:73-77` | Baixa |

### (e) Robustez de dados

| # | O que acontece | Onde | Gravidade |
|---|---|---|---|
| e1 | `getCar` cai no **cache local** quando a leitura do servidor falha ou estoura o tempo. Em seguida `addCarContribution`/`addCarExpense` gravam o **documento inteiro** (upsert de `data`). Com dois aparelhos, ou um cache velho, um aporte lançado pode apagar gastos lançados do outro lado (última escrita vence). | `db.js:1162-1164`, `1180-1252`, `1276-1287` | Média (Alta com uso multi-aparelho) |
| e2 | `getLocalCars` cai em `LEGACY_CARS_KEY` (garagem de visitante do aparelho) quando o cache da conta está vazio. Numa falha de leitura, um aparelho compartilhado pode mostrar os carros de outra pessoa. | `db.js:510-511` | Baixa |
| e3 | As mensagens de erro de carro estão cravadas em pt-BR (`CAR_TOO_LARGE_MESSAGE`, `CAR_NOT_SYNCED_MESSAGE`, `NOT_DELETED_MESSAGE`, `FalhaDeLeitura`, rótulos de `withTimeout`) e chegam à tela em en/es pelo `saved.message` e pelo toast. | `db.js:345-366`, `395-402`, `498-507` | Média |
| e4 | Foto quebrada no card vira foto de banco de **outro carro** (Unsplash), o que contradiz o comentário de 25/09 logo abaixo. | `CarCard.jsx:12-13`, `279-283` | Baixa |

---

## 2. Promessas que o produto não cumpre (ou cumpre pela metade)

- **"Consumo real"**: é real só com tanque cheio no último abastecimento, um só combustível e litros em
  todos os lançamentos. Nenhuma das três condições é pedida nem dita.
- **"Custo real/mês"** (title do botão do simulador) é **estimativa**. O gasto que de fato é real aparece
  ao lado com o mesmo formato.
- **"Preço FIPE" / "Valor FIPE hoje"**: é o preço do dia do cadastro. "Hoje" (`modalCar.fipePriceOwned`) é
  literalmente falso a partir do mês seguinte.
- **"A montadora não publica em formato aberto"**: falso pelo menos para a Toyota (Yaris), segundo o
  próprio `_meta` da tabela. A frase honesta é "ainda não temos a ficha deste motor".
- **"Até 4 MB"** na foto: o limite é 6 MB.
- **A previsão "você chega lá em…"** com um aporte só é extrapolação de um ponto.
- **Fixture "frota real" do `check-spec-sheet.mjs:1080`**: `"HR-V EXL 1.5 Flex TB 16V 5p Aut."` **não
  existe na FIPE**. Na amostra há `HR-V EXL 1.5 Flex Sensing` (aspirado) e o turbo é só `Advance`/`Touring`.
  O teste conta "177 cv" para um EXL, que na vida real é aspirado. É exatamente o carro impossível que o
  teste existe para pegar, só que dentro do próprio teste. O "17/27 (63%)" do relatório inclui esse acerto
  falso. Os outros resultados da sondagem bateram com o que conheço dos motores (T270 185/180, 200 TSI
  128/116, Polo Track 84/77, City 1.5 126, Corolla 2.0 177/169).

---

## 3. Ficha técnica — o que está entregue e onde falha (medido)

- Parser: no recorte contemporâneo (n=2.561), extrai cilindrada em 96,1%, combustível em 100% e câmbio
  em 54,9%. Ficam 312 abstenções de aspiração, e **0** versões com aspirado inferido em grupo que também
  tem turbo (`check-fipe-parser.mjs`).
- Potência de fábrica sobre as 4.864 versões do catálogo, com ano-modelo 2023: **valor 15,9% · retido
  12,5% · ausente 71,6%**. 0-100 com valor em **1,7%**. A maior causa é `no_engine_row` (54,0%). A tabela
  de motores tem **45 linhas**, versão `0.4.0-parcial`, compilada em 19/08/2026.
- Carros de volume sem potência na sondagem: Onix Hatch 1.0 aspirado 2022 (retido: aspiração), Onix Plus
  1.0 turbo 2022 (fora da janela, porque a tabela só tem a Chevrolet MY24–26), HB20 Sense 1.0 2022 (retido),
  Gol 1.0 12V, Cronos 1.0/1.3, Uno Attractive, Kicks 1.6 (`no_row_for_this_model`), Kwid Zen 2022 (fora da
  janela), Yaris 1.3 (`no_engine_row`).
- **Hit rate na base real: não medido.** Para medir sem mexer em nada: um `select data->>'brand',
  data->>'model', data->>'year', data->'fipe' from cars` exportado e passado pelo `getFactorySpecs`
  (o mesmo harness do `check-spec-sheet.mjs`). Também diria quantos carros já têm `fipe` preenchido. Pela
  regra do `normalizeCar` (`db.js:419-443`), todos os carros anteriores ao campo não têm.
- O que está certo e deve ficar: nenhum zero e nenhum traço no lugar de dado ausente, retido separado de
  ausente com o motivo escrito, ficha declarada só em carro próprio e sempre etiquetada, ficha pública sem
  `ownership`.

---

## 4. Top 10 — impacto ÷ esforço (P = horas, M = 1–2 dias, G = mais que isso)

### Antes de lançar

| # | O quê | Esforço |
|---|---|---|
| 1 | Parse de decimal único em `services/` (aceitar "38,5" e "38.5"; ponto só como milhar quando houver vírgula ou 3 dígitos depois) + faixas de plausibilidade para litros, valor e odômetro, avisando antes de salvar. | P |
| 2 | FIPE no cadastro: zerar `targetValue` e `fipeCode` a cada troca na cascata; mostrar erro com "tentar de novo" nas quatro chamadas; bloquear o salvamento de meta com alvo 0. | P |
| 3 | `today()` em data local (um helper só, usado nos três lugares). | P |
| 4 | Confirmação (ou desfazer por 5 s) ao apagar aporte e gasto, com `catch` e mensagem de erro. | P |
| 5 | `useHistoryDismiss` no `SpecSheetModal` e alvo de 44×44 no X. | P |
| 6 | Textos: renomear o title do simulador para "Custo estimado/mês"; rótulo "previsão" na data do card; `fipePriceOwned` sem "hoje" (ou com a data); "4 MB" → "6 MB"; mensagem de exclusão por tipo de carro, dizendo o que se perde; `no_engine_row` → "Ainda não temos a ficha deste motor". Os três idiomas. | P |
| 7 | Consumo: marcar como "aproximado" e explicar a condição na própria tela até existirem os campos; ignorar o trecho seguinte a um abastecimento sem litros em vez de somá-lo. | P |
| 8 | Seletor de versão com busca (combobox filtrando a lista que já veio da FIPE), deixando visível o resto da string (motor, câmbio). O ano primeiro exigiria outra rota de dados: avaliar com a Jesse no protótipo, porque é mudança de tela e passa pelo pipeline dela. | M |

### Depois de lançar

| # | O quê | Esforço |
|---|---|---|
| 9 | Meta editável ("o preço que eu achei") + reconsulta da FIPE pelos códigos já gravados em `car.fipe`, mostrando a data do preço. Carro antigo sem `fipe` cai no casamento por nome. | M |
| 10 | Gastos: campos "tanque cheio" e combustível (etanol/gasolina/GNV) no abastecimento; amortização de despesa anual na média; edição de lançamento; "ver mais" no histórico e aviso antes do teto de 300. | M |

Fora do top 10, mas registrado: escrita do documento inteiro com cache velho (e1). Precisa de escrita
parcial no servidor (RPC que faz `jsonb` append) ou de controle por `updated_at`, por isso G. Mensagens de
`db.js` no i18n (M). Medir o hit rate da ficha na base real (P, depende de acesso de leitura). Cobertura
de Onix/HB20/Gol/Kwid/Cronos na tabela de motores: é caça do Han, e os caminhos já estão no `_meta`
(manual do proprietário GM, VW e Toyota).

---

## 5. Estado

- **Implementado e correto**: cadastro pela FIPE com os três códigos persistidos; tipos meta/próprio;
  aportes com histórico e previsão que se cala sem dados; gastos com média só depois de 30 dias e consumo
  só com 2 abastecimentos; ficha em camadas com abstenção explícita; i18n completo nos três idiomas para
  a Garagem.
- **Bloqueado no Han**: potência dos carros de volume (tabela de 45 motores).
- **Esperando a Jesse**: seletor de versão com busca/ano primeiro, rotulagem visual dos dois "por mês"
  do card, campos novos do abastecimento.
- **Deixado em branco de propósito, e deve continuar assim**: potência do Onix/HB20 1.0 sem marcador
  de turbo, número de motor "do vizinho" (Gol, Cronos, Kicks) e ficha de outro ano-modelo.
