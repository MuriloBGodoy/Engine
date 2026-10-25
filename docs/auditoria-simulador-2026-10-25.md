# Auditoria pré-lançamento — simulador de custo de posse e comparador do Painel

Data: **25/10/2026**. Autora: Xuria (simulador). Somente leitura — nenhum arquivo de código alterado.

Código lido: `engine/src/services/ownership.js` (1.259 linhas, inteiro), `engine/src/services/expenses.js`
(inteiro), `engine/src/services/consumption.js` (inteiro), `engine/src/components/OwnershipModal.jsx`
(729 linhas, inteiro), `engine/src/components/CarCard.jsx` (linhas 140-200), `engine/src/pages/DashboardPage.jsx`
(1-330), `engine/src/services/market-data.json`, `engine/scripts/update-market-data.mjs`,
`.github/workflows/market-data.yml`, `engine/src/services/i18n.js` (bloco `ownership` pt-BR, chaves em
en/es por amostra), `engine/src/index.css` (modal), `TODO.md` e `SIMULADOR-FONTES.md` (trechos).

**Como os números foram obtidos.** Todo valor em reais abaixo saiu de scripts em Node que **importam os
módulos reais** de `services/` (`estimateOwnership`, `consumptionFor`, `parseFipeVersion`) — nenhuma fórmula
reimplementada. Os nomes de carro usados nos cenários seguem o formato da FIPE mas foram **escritos por mim**
(não puxados da API); o casamento com o INMETRO foi conferido para cada um (Onix 1.0, Polo 1.0, Hilux 2.8
casam em nível de versão; Palio e Dolphin não casam). `npm run check:ipva` e `check:affordability`: verdes.

**O que NÃO foi feito.** Nenhum teste em aparelho ou navegador. A seção 2 (celular) é leitura de código;
o que depende de comportamento de teclado/navegador está marcado como **inferência**.

---

## 0. Os 6 achados que mais pesam

1. **Carro que a pessoa JÁ TEM é simulado como financiado.** O padrão do motor é `purchaseMode: "finance"`
   (`ownership.js:474`), com entrada = `savedValue` (`ownership.js:1041`), e nem o modal (`OwnershipModal.jsx:226-228`)
   nem o Painel (`DashboardPage.jsx:37`, `car.ownership || {}`) olham `car.type === "owned"`. Onix 2024 de
   R$ 80 mil, já na garagem, em SP: o Painel mostra **R$ 3.448/mês** (parcela de R$ 2.592 que não existe) e
   **"Renda necessária" R$ 17.238**; o correto, à vista, é **R$ 855/mês** e R$ 4.277. O modal, ao abrir, mostra
   ainda "Total de juros R$ 44.428" e "Custo final do carro R$ 124.428" para um carro quitado.
2. **O combustível nasce "gasolina" para todo carro, e ninguém lê o carro.** `defaultOwnershipInputs` fixa
   `fuelType: "gasoline"` (`ownership.js:467`); o `parseFipeVersion` já detecta diesel/elétrico/híbrido com
   confiança "explicit" pelo nome da FIPE (conferido), mas o simulador não usa. Consequências medidas:
   - **Hilux 2.8 diesel, R$ 250 mil, MS, 1.500 km/mês:** combustível **R$ 888** em vez de **R$ 1.141** (−22%) e
     IPVA **R$ 7.500/ano** em vez de **R$ 11.250** (a linha de diesel de MS, `ownership.js:192-195`, nunca é
     alcançada). Erro **para baixo**, o lado que põe alguém num contrato que não paga. A tela ainda escreve
     "3,0% do valor FIPE, pela lei de MS" — rótulo falso para um diesel.
   - **BYD Dolphin, R$ 150 mil, BA:** IPVA **R$ 3.750/ano cobrado de carro isento** (BA isenta elétrico até
     R$ 300 mil, `ownership.js:173-175`) e combustível R$ 610 em vez de R$ 142. Total R$ 937 contra R$ 157.
3. **Três números diferentes para a mesma simulação salva.** Onix, SP, financiado 48x, 1.200 km/mês:
   manchete do modal **R$ 3.163/mês + R$ 3.374/ano**; `CarCard` "Custo/mês" e Painel **R$ 3.562**. Duas causas:
   (a) o modal injeta o consumo do INMETRO em `effectiveInputs` (`OwnershipModal.jsx:244-250`) mas salva só
   `inputs` (`:300`), então card e Painel (`CarCard.jsx:188-191`, `DashboardPage.jsx:37`) caem no padrão de
   11,1 km/l — combustível R$ 689 contra R$ 571 do modal (13,4 km/l INMETRO); (b) o modal tira IPVA e
   licenciamento da manchete (`:341-342`) e o card os dilui em 12. A diferença muda de sinal por carro
   (Hilux: card R$ 36 **abaixo** do modal), então não é "margem de segurança", é contradição.
4. **Elétrico: preço e consumo sem fonte, com rótulo de fonte.** R$ 0,85/kWh (`ownership.js:349`) e
   6 km/kWh (`:426`) não têm origem — o próprio código diz isso — mas a tela escreve **"Preço médio da ANP em
   {estado}"** (`i18n.js:875`, usado em `OwnershipModal.jsx:430` para qualquer combustível) e **"Padrão: 6,0 km/l"**
   (`i18n.js:990`). A ANP não publica energia, e a unidade está errada. É exatamente o erro de proveniência do
   antigo "Consumo real INMETRO".
5. **"Total de juros" diz mais do que sabe.** A conta é parcela × prazo − financiado pela taxa média de juros
   do BC (`ownership.js:1058-1059`), sem IOF de crédito, tarifa de cadastro, registro de contrato nem seguro
   prestamista — tudo o que entra no CET. O texto afirma "É o que você paga a mais por não pagar à vista"
   (`i18n.js:860`). O número é piso, e a frase o vende como total. Erra **para baixo**.
6. **Consumo digitado (ou medido) atravessa a troca de combustível.** `userConsumption` é um número só, sem
   combustível (`ownership.js:729-731`; o medido entra por `OwnershipModal.jsx:266-269`, e `expenses.js` não
   guarda qual combustível foi abastecido). Quem informa 13 km/l na gasolina e troca o seletor para etanol
   para comparar vê etanol a **R$ 298/mês** em vez de **R$ 408** (Onix, SP, 1.000 km): −27%, e o flex parece
   mais vantajoso no etanol do que é.

---

## 1. Bugs e números indefensáveis

### 1.1 Casos de borda

| # | Caso | O que acontece (medido) | Onde | Lado do erro | Gravidade |
|---|---|---|---|---|---|
| b1 | **Carro próprio** | Achado 0.1. | `ownership.js:474`, `OwnershipModal.jsx:226`, `DashboardPage.jsx:37` | Para cima, R$ 2.592/mês inventados | **Alta** |
| b2 | **Diesel** | Achado 0.2 (Hilux MS −R$ 253/mês combustível, −R$ 3.750/ano IPVA). | `ownership.js:467` | **Para baixo** | **Alta** |
| b3 | **Elétrico** | Achado 0.2 (IPVA de isento) e 0.4 (rótulo). IPVA reduzido/isento só conferido em AM e BA (`ownership.js:161-175`); nas outras 25 UFs cai na alíquota cheia — documentado como "não conferido", erra para cima, e é o caso que mais pede o Han. | `ownership.js:161-175, 345-350, 422-427` | Os dois | **Alta** |
| b4 | **Zero km** (`"32000"`) | Ano lido corretamente (idade 0). IPVA de ano cheio (Polo R$ 95 mil, SP: R$ 3.800) sem proporcionalidade, e sem linha de custo de entrada (emplacamento, 1ª tributação) — ambos já documentados (`ownership.js:549-558`, TODO). O que NÃO está documentado: a depreciação, maior custo do zero km (10% a.a. pelo próprio motor, `:770`), **não aparece em tela nenhuma** desde o redesenho enxuto (busquei `depreciation` em `.jsx`: zero ocorrências). | `ownership.js:1082` | Para baixo no "custo real" | Média |
| b5 | **Carro muito velho** | Palio 2006 em SP: imune (20 anos), R$ 0 com rótulo certo. Palio 2007 em SP e MG: paga, corretamente (nenhuma das duas isenta antes dos 20). Seguro fica fora (só valor informado). Consumo cai no padrão de 11,1 km/l, rotulado "Padrão". **Sem problema encontrado.** | `ownership.js:565-571` | — | — |
| b6 | **Moto** | Não existe: o cadastro só consulta `/carros` da FIPE (`fipeService.js:3`). Sem risco hoje; se moto entrar, IPVA, licenciamento e consumo padrão estão todos errados para ela. | — | — | — |
| b7 | **Sem estado escolhido** | Total soma IPVA de **3%** (`IPVA_BR_DEFAULT`, `ownership.js:71`) e licenciamento de **R$ 140** (`:311`), os dois sem fonte. A linha do IPVA diz "escolha o estado" mas mostra o valor; a do licenciamento diz só "taxa anual de registro" (`i18n` `licensingSourceGeneric`). Onix à vista: R$ 2.400 + R$ 140 por ano de número inventado na conta. | `ownership.js:71, 311`; `OwnershipModal.jsx:320-322, 484` | Os dois | Média |
| b8 | **Entrada zero / taxa zero** | `0` significa "usar o padrão" nos dois campos (`ownership.js:1041, 1047`; `MoneyInput` apaga o 0, `OwnershipModal.jsx:72`). Quem guardou R$ 30 mil e quer simular "e se eu financiar tudo" não consegue; quem tem oferta de taxa zero de concessionária vê 1,97% a.m. | `OwnershipModal.jsx:72, 566-567` | Para cima (taxa) / impossível (entrada) | Baixa |
| b9 | **Entrada ≥ valor do carro** | Bloco de financiamento aparece com parcela R$ 0, juros R$ 0 e "custo final" igual ao FIPE. Inofensivo, mas é ruído. | `OwnershipModal.jsx:414, 495` | — | Baixa |
| b10 | **Km apagado** | Campo vazio → 0 → o motor prende em 100 km (`ownership.js:492`) e cobra R$ 57 de combustível, enquanto a linha diz "Rodando 0 km por mês" (`OwnershipModal.jsx:338`). | `:338, 630` | — | Baixa |
| b11 | **FIPE R$ 0** (carro sem valor) | Linha de IPVA escreve "0,0% do valor FIPE, pela lei de {UF}" (`OwnershipModal.jsx:310`). Raro (o Painel filtra, o modal não). | `:310, 321` | — | Baixa |

### 1.2 Dado vencido ou que vai vencer

| # | Dado | Estado em 25/10/2026 | Onde |
|---|---|---|---|
| d1 | Combustível ANP | Coleta até **09/10/2026** (média das 4 semanas de 14/09 a 09/10), commit do robô em 19/10. A tela mostra a data — staleness visível, como deve. O pipeline depende da Netlify republicar no push; pela memória do projeto ela foi religada em 25/10. **Conferir que o deploy de 26/10 (próxima segunda) sai com dado novo.** | `market-data.json`, workflow |
| d2 | Juros BC (SGS 25471) | Mês **2026-08**. Defasagem de ~2 meses é da própria série; a tela diz o mês. É **média de mercado**: não reflete o perfil do público do Engine (jovem, sem histórico). Não reconferi o significado da série nesta auditoria. | `market-data.json`, `ownership.js:381` |
| d3 | kWh R$ 0,85 | Sem fonte, sem data, nunca atualizado. `SIMULADOR-FONTES.md:125` aponta ANEEL como candidata não verificada. | `ownership.js:349` |
| d4 | IPVA e licenciamento "2026" | **Vencem em janeiro de 2027** — as UFs republicam taxas todo janeiro, e três (MS, SE, PB) mudam todo mês. A linha de licenciamento diz "taxa de 2026", então vai aparecer datada; a de IPVA não carrega ano. Não há lembrete automático. | `ownership.js:24-70, 270-317` |
| d5 | Textos de pagamento de SP | "à vista em janeiro com 3% de desconto, ou em até 5 parcelas" e "vence de julho a dezembro pelo final da placa" (`i18n.js:866, 868`, idem en/es) são regra de calendário **sem data no texto nem no comentário**. Não reconferi para 2027. | `i18n.js:866-868` |
| d6 | `TODO.md:130` | Ainda diz "A base de consumo não é do INMETRO" — desatualizado desde 18/08 (`consumption.js:1-15`). Inventário contradizendo o código. | `TODO.md:130` |

### 1.3 UF sem cobertura (já rotulado, registrado para inventário)

- **Licenciamento aproximado em 6 UFs** — RJ, AL, RN, PE, PI, AP (`ownership.js:303-309`). A tela diz
  "valor aproximado" (`LICENSING_BR_VERIFIED`). Correto como está.
- **Fator de etanol ausente no AP** (3 postos): cai na média nacional, documentado.
- **Isenção por idade antes dos 20** não conferida em AC, AL, MS, PR, RS, SC (fora do mapa, `:109-156`):
  ficam nos 20 da EC 137 — erra para cima, documentado.
- **Fator regional de seguro** (`INSURANCE_REGION_BR`, `:337-340`) não tem fonte, mas **não entra em conta
  nenhuma** desde 06/10 (seguro só por valor informado). Código morto com número sem fonte.

### 1.4 Arredondamento

- Manchete × soma das linhas exibidas: diferença máxima de **R$ 1** numa varredura de 1.025 cenários
  (FIPE R$ 20 mil a R$ 300 mil × 5 faixas de km × 5 UFs). Aceitável.
- Percentual da renda arredonda para inteiro (`OwnershipModal.jsx:345`). Aceitável.

### 1.5 Código morto que ainda carrega risco

- `estimateOwnershipRange`, `assessAffordability`, `affordabilityLevers` (`ownership.js:846-1254`) não têm
  consumidor em tela nenhuma. O teto de 512 cenários (`:866`) só sai do laço interno, o que trunca de forma
  desigual; testei com os 7 campos e o resultado não mudou (os 4 primeiros campos não movem mais a conta),
  então **não é bug visível hoje**. Se a faixa voltar, revisar.
- A tela enxuta trocou a faixa por "fora da soma" para seguro e manutenção. É honesto, mas o total exibido é
  um **piso** e não há nada na manchete que diga "sem seguro e sem manutenção" — só as linhas "fora" abaixo.

---

## 2. Fricções de uso no celular (leitura de código — não testado em aparelho)

| # | Fricção | Onde |
|---|---|---|
| m1 | **Resultado em cima, controles embaixo.** No celular (folha de tela cheia, `index.css:914-923`) o slab de resultado ocupa a primeira tela inteira; o seletor de combustível, que decide o diesel/elétrico do achado 0.2, está na terceira seção. Quem não rola não descobre que a conta está em gasolina. | `OwnershipModal.jsx:393-517, 634-647` |
| m2 | **Estado e renda são a ÚLTIMA seção**, e o estado decide IPVA e licenciamento. Sem estado no perfil, o número da primeira tela usa os padrões sem fonte de b7. | `:683-704` |
| m3 | **Campo decimal com vírgula.** Taxa (`step 0.01`) e consumo (`step 0.1`) são `type="number"`. Em teclado pt-BR a pessoa digita "1,5"; parte dos navegadores móveis devolve valor vazio para isso, e o `|| 0` transforma em "usar o padrão" sem aviso. **Inferência**: comportamento conhecido de `type=number` com localidade de vírgula, não reproduzido aqui. | `:560-569, 648-659` |
| m4 | **Fechar perde tudo.** Renda e ajustes só gravam no "Salvar"; o X e o botão voltar (`useHistoryDismiss`) fecham sem perguntar. | `:238, 289-303` |
| m5 | **Faixas de km quase iguais**: "Rodo um pouco" 1.000 e "Normal" 1.200 (`:54-60`); cinco botões em grade de 2 colunas deixam um órfão na última linha. | `:606` |
| m6 | **Linha de combustível com três frases** (km, consumo com fonte, preço com data) em 12,5 px sob o valor — a explicação mais longa da tela fica na linha que mais pesa. | `:427-433` |
| m7 | **Rodapé fixo diz "R$ X por mês + R$ Y por ano"** e o card da garagem diz um terceiro número (achado 0.3). Quem fecha o modal e olha o card vê o valor "mudar". | `:707-714`, `CarCard.jsx:160-166` |
| m8 | **Painel: "Renda necessária"** = custo ÷ 20% fixo (`ownership.js:1108`; `incomeSharePct` não é mais editável na tela enxuta). É veredito por proxy, que o próprio motor declara não emitir (`ownership.js:1112-1122`). E o troféu "Mais acessível" compara linha simulada (com seguro informado) com linha "estimativa padrão" (sem seguro, 1.000 km, financiada) — não é comparação entre iguais. | `DashboardPage.jsx:25-49`, `i18n.js:1342-1351` |

---

## 3. Top 10 — impacto × esforço

Esforço: **P** = horas, sem dado novo · **M** = um dia ou mais / mexe em contrato de dados · **G** = depende de
pesquisa externa (Han) ou de linha nova na tela.

### Antes de lançar

| # | O quê | Por quê | Esforço |
|---|---|---|---|
| 1 | Carro `owned` abre e entra no Painel **à vista** por padrão | Remove R$ 2.592/mês inventados e "renda necessária" de R$ 17 mil num carro quitado (0.1) | **P** |
| 2 | `fuelType` inicial vem de `parseFipeVersion(car).fuel` (diesel → diesel, elétrico → elétrico, flex/híbrido → gasolina) | Fecha o maior erro para baixo encontrado (Hilux MS −R$ 253/mês e −R$ 3.750/ano) e o IPVA cobrado de elétrico isento (0.2). O parser já existe e acerta os quatro casos testados | **P** |
| 3 | Uma função em `services/` monta os inputs efetivos (consumo INMETRO incluído) e é usada por modal, card e Painel; card mostra o mesmo recorte da manchete ou diz que inclui IPVA | Um carro, um número (0.3) | **M** |
| 4 | Elétrico: rótulo "padrão sem fonte" e unidade km/kWh; nunca "ANP" | Proveniência falsa na tela (0.4). Alternativa honesta: esconder "Elétrico" do seletor até haver fonte | **P** |
| 5 | Reescrever "Total de juros"/"Custo final" como **juros pela taxa de X% a.m.**, com a frase "o CET do banco inclui IOF e tarifas e é maior — peça o CET" | O número é piso e o texto diz que é total (0.5). Modelar o CET fica para depois (item 9) | **P** |
| 6 | `userConsumption` por combustível (ou zerar ao trocar o seletor) | Etanol −27% quando o consumo da gasolina atravessa (0.6) | **P** |
| 7 | Painel: tirar "Renda necessária" ou rotular "renda para o carro caber em 20%"; marcar linhas não simuladas como não comparáveis no troféu | Veredito por proxy contra a doutrina do motor (m8) | **P** |
| 8 | Sem estado: não somar IPVA/licenciamento de padrão — mostrar "escolha o estado" no lugar do valor, ou subir a pergunta de estado para o topo no celular | Número sem fonte no total (b7, m1, m2) | **P** |

### Depois de lançar

| # | O quê | Por quê | Esforço |
|---|---|---|---|
| 9 | **Han:** IOF de crédito PF vigente, tarifas típicas e uma fonte de CET médio para veículo; kWh residencial por UF (ANEEL); isenção/redução de IPVA de elétrico nas 25 UFs não conferidas | Fecha 0.5 de verdade, d3 e b3. Só então o elétrico volta com número | **G** |
| 10 | Rotina de janeiro: lembrete (workflow agendado ou item datado no TODO) para revalidar IPVA, licenciamento e os textos de pagamento de SP; carimbar o ano na linha do IPVA. Junto, devolver a **depreciação** à tela como linha informativa fora da soma e abrir a linha de **custo de entrada** do zero km | d4, d5, b4 | **M** |

Fora do top 10, baixo impacto: entrada/taxa zero digitáveis (b8), km vazio (b10), FIPE zero (b11), bloco de
financiamento com entrada ≥ valor (b9), `TODO.md:130` desatualizado (d6), faixas de km e órfão na grade (m5),
confirmação ao fechar (m4), teste real de vírgula em Android/iOS (m3), remover `INSURANCE_REGION_BR` e as
funções sem consumidor ou marcá-las como dormentes.

---

## 4. Verificado × assumido

**Verificado (Node, módulos reais, 25/10/2026):** todos os valores em reais deste documento; a detecção de
combustível do `parseFipeVersion` nos quatro nomes testados; que nenhum `.jsx` usa `depreciation`,
`estimateOwnershipRange`, `assessAffordability` ou `affordabilityLevers`; datas do `market-data.json`;
`check:ipva` e `check:affordability` verdes; diferença máxima de arredondamento de R$ 1.

**Assumido / não conferido:** comportamento de `type=number` com vírgula no celular (m3); que os nomes de
carro escritos à mão são idênticos aos da FIPE real (o formato segue o padrão; o casamento INMETRO foi
conferido); a vigência em 2027 dos textos de pagamento de SP (d5); a composição exata do CET e a alíquota de
IOF de crédito vigente (item 9 — não citei número de propósito); que o deploy da Netlify religada está
publicando os commits semanais do robô (d1).
