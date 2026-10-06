# Simulador — de onde vêm (e de onde deveriam vir) os números

Levantamento de 11/08/2026, revisado em 14/08 e em 17/08/2026. Cada constante de `ownership.js` está aqui com a
fonte real que a substituiria, o que já foi verificado buscando de verdade e o
que é só menção encontrada.

O princípio que rege este documento: **nenhuma constante do simulador deveria
existir sem uma linha aqui.** Onde não há fonte, o código diz que é chute.

---

## Ranking por impacto

| # | Fonte | Constante | Erro medido | Esforço |
| --- | --- | --- | --- | --- |
| 1 | FIPE tabelas históricas | `annualDepreciationRate` | 2× a 100× superestimado | Médio |
| 2 | ANP série histórica | `FUEL_PRICE_BR`, `FUEL_FACTOR_BR` | até 9,3 p.p. por UF | Baixo |
| 3 | Legislação estadual | `IPVA_BR` | AM 2× errado | Alto, manual |
| 4 | SUSEP AUTOSEG | `INSURANCE_AGE_RATES` | desconhecido, provavelmente grande | Alto |
| 5 | BCB SGS 25471 | `monthlyRate` | ~0,02 p.p. hoje | Trivial |

---

## 1. Depreciação — o maior erro numérico

A API interna da FIPE expõe 336 tabelas mensais e responde sem autenticação:

```
POST https://veiculos.fipe.org.br/api/veiculos/ConsultarTabelaDeReferencia
POST https://veiculos.fipe.org.br/api/veiculos/ConsultarValorComTodosParametros
Header obrigatório: Referer: https://veiculos.fipe.org.br/
```

Comparando **o mesmo carro** em tabelas de anos diferentes (verificado):

| Modelo | idade | depreciação real/ano | nossa curva |
| --- | --- | --- | --- |
| Argo 1.0 2024 | 2 | −4,5% | 12% |
| Polo MPI 2024 | 2 | −0,1% | 12% |
| Argo 1.0 2020 | 6 | −3,0% | 6% |

Num carro de R$ 70 mil isso é ~R$ 350/mês de custo fantasma na maior linha do
orçamento.

### Recalibrada em 13/08/2026

Feito por corte transversal na API pública (`parallelum.com.br/fipe`, tabela de
agosto/2026): **90 pares de anos-modelo consecutivos, 21 modelos**, de Mobi e
Kwid a Hilux, Tucson, 320i e Classe C. Mede o que um ano a mais de idade custa
hoje, que é o número que interessa a quem está decidindo a compra.

| idade | mediana real | média | curva antiga | curva nova |
| --- | --- | --- | --- | --- |
| 1 | 9,7% | 8,8% | 16% | **10%** |
| 2 | 6,2% | 5,7% | 12% | **7%** |
| 3 | 7,4% | 6,9% | 10% | **7%** |
| 4–5 | 4,9% | 5,2% | 8% | **5,5%** |
| 6–8 | 3,9% | 4,7% | 6% | **5%** |
| 9+ | 3,9% | 5,2% | 4% | **5,5%** |

A curva antiga era o padrão americano: despencava no primeiro ano e achatava. O
mercado brasileiro é bem mais plano — a queda medida fica entre 4% e 10% do
começo ao fim da vida do carro.

Na ponta velha ficou na **média** e não na mediana, de propósito: as idades de
12 a 15 anos medem 6% a 9%, e subestimar depreciação faz o carro parecer mais
barato do que é.

**Ressalva que continua valendo:** é corte transversal de uma tabela só, não
série temporal. Não separa depreciação de efeito de safra, e FIPE é preço
nominal — com IPCA de 4–5% ao ano, a perda real de poder de compra é maior. Uma
série longitudinal (mesmo carro em tabelas de anos diferentes) ainda vale.

**Não é API oficial** — é o backend do site da FIPE, sem termos de uso nem SLA.
O mesmo vale para o `parallelum.com.br` que já está em produção. Se for usado,
que seja por job assíncrono com cache no Firestore, nunca no caminho da UI.

## 2. Combustível — melhor relação ganho/esforço

⚠️ `dadosabertos.anp.gov.br` **não resolve** (falha de DNS). É a URL mais citada
em tutoriais e está morta.

O que funciona (verificado, HTTP 200, 7,9 MB, 46.236 linhas):

```
https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/shpc/qus/ultimas-4-semanas-gasolina-etanol.csv
```

CSV `;`, granularidade de posto individual por município. Sem API REST.
Republicado semanalmente. Dado aberto federal, uso comercial permitido.

### Aplicado em 14/08/2026 — e o erro maior não era o que estava mapeado

Remedido sobre a coleta de 07-08/2026: **17.619 postos de gasolina e 14.989 de
etanol**. Preços nacionais: gasolina **R$ 6,594** (código dizia 6,61, erro de
0,2%) e etanol **R$ 4,283** (código dizia 4,49, **4,8% alto**). Os dois foram
para 6,59 e 4,28.

O achado que não estava no levantamento anterior: **gasolina e etanol precisam
de tabelas de fator separadas.** O código aplicava um fator único por UF aos
dois, e eles não têm nada a ver um com o outro — a gasolina segue frete e ICMS
a partir da refinaria, o etanol segue distância da usina. Onde se planta cana o
etanol é barato e a gasolina não é:

| UF | fator gasolina | fator etanol | diferença |
| --- | --- | --- | --- |
| SP | 0,97 | **0,86** | −10,6 p.p. |
| MT | 1,03 | **0,87** | −16,1 p.p. |
| RS | 0,96 | **1,09** | +13,6 p.p. |
| RJ | 1,01 | **1,12** | +10,9 p.p. |
| SC | 0,99 | **1,07** | +7,9 p.p. |

Em SP o simulador cobrava 12% a mais de etanol do que ele custa — R$ 93/mês na
maior linha do orçamento. Existem agora `FUEL_FACTOR_BR` (gasolina, e o diesel
cai nela por falta de dado) e `FUEL_FACTOR_BR_ETHANOL`. O AP ficou de fora da
tabela de etanol: 3 postos na amostra não sustentam média, e sem entrada cai
em 1.

Sai de graça do mesmo dado: em SP o etanol está a **57,8%** do preço da
gasolina, bem abaixo da paridade de 70%. Um flex em SP deveria rodar a etanol e
o simulador ainda não diz isso.

**O que este CSV não cobre:** diesel (é outro arquivo da ANP, não baixado — o
valor segue o de jul/2026, não reconferido) e energia elétrica. Candidata para
o kWh: ANEEL dados abertos, não verificada.

## 3. IPVA e licenciamento — não existe fonte consolidada

Não há API, dataset ou CKAN — reconfirmado em 14/08/2026 com teste, não só
busca: a BrasilAPI tem `/api/taxas/v1` (só Selic, CDI e IPCA) e devolve 404 em
`/api/ipva/v1`; nenhum repositório público mantém a tabela; as APIs comerciais
(Infosimples, Celcoin, APIBrasil) consultam débito por placa + RENAVAM, o que é
inútil aqui por construção — o simulador roda sobre um carro que a pessoa ainda
não tem. O que as SEFAZ publicam em formato estruturado é a tabela de valores
venais, que é base de cálculo, não alíquota.

Mas a estrutura do problema mudou: **não são mais 27 leis estaduais soltas.**

### EC 137/2025 — imunidade nacional acima de 20 anos (aplicada em 14/08/2026)

Promulgada em 09/12/2025, vigente desde a publicação, acrescenta a alínea "e" ao
art. 155, § 6º, III da Constituição:

> "veículos terrestres de passageiros, caminhonetes e mistos com 20 (vinte) anos
> ou mais de fabricação, excetuados os micro-ônibus, ônibus, reboques e
> semirreboques."

Texto conferido na base Legin da Câmara (reprodução da publicação original no
DOU). É **imunidade**, não isenção: o estado perdeu competência, então vale em
toda UF sem depender de lei estadual. Confirmada de forma independente pela
SEFAZ/PE, que não tinha regra de idade própria e publicou aviso aplicando-a ao
IPVA 2026.

Agora o mapa é **um teto constitucional único mais 27 regras que só podem ser
mais generosas**. Por isso `IPVA_BR_EXEMPT_AGE` só lista quem isenta ANTES dos
20, e a ausência cai no piso de 20 — que erra para cima, o lado seguro.

| UF | idade | fonte | camada |
| --- | --- | --- | --- |
| GO | 15 | Lei 11.651/91; FAQ da Secretaria da Economia | primária |
| RJ | 16 ("mais de 15") | Lei 2.877/97 art. 5º VII; SEFAZ-RJ isenta 2010 e anteriores | primária |
| MT | 18 | Lei 10.252/2017 (altera a 7.301/2000) | portal da ALMT, falta o texto da lei |
| SP, RS | 21 pela lei estadual, 20 pela EC | Lei 13.296/2008 art. 13 VIII | primária |

**Em aberto:** ~15 UFs sem confirmação primária (o "grupo dos 15 anos" segundo
agregador: AM, CE, ES, MA, PA, PB, PI, RO, SE, mais BA, RN e DF). AP e RR são as
mais generosas (10 anos) e as menos confiáveis: agregadores diferentes deram 10,
15 e 20 para RR na mesma semana, e o DETRAN/AP responde 403 a requisição
automatizada. Custo estimado: um dia de trabalho, mais recoleta anual.

**Ressalva que não some:** a norma fala em ano de FABRICAÇÃO e a FIPE só dá o
ano-MODELO, que é igual ou um ano maior. O motor enxerga o carro até um ano mais
novo e atrasa a isenção. Na fronteira exata (2006 no exercício 2026) há litígio:
o fisco paulista cobrou alegando fato gerador em 1º de janeiro e foi afastado em
1ª instância (proc. 1001145-07.2026.8.26.0053).

### SP conferido na lei — 4% inclusive para flex (14/08/2026)

Hipótese testada e **refutada**: a Lei 13.296/2008 escalona a alíquota, e havia
faixa reduzida para álcool/GNV/eletricidade, o que faria `SP: 0.04` estar errado
para quase toda a frota. Não está.

- Art. 9º, III (redação da Lei 17.473/2021): **4% para "qualquer veículo
  automotor não incluído nos incisos I e II"** — automóvel de passeio cai aqui.
- A faixa de 3% foi **revogada pela Lei 17.293/2020**.
- Mesmo sob a redação antiga, flex nunca entraria: exigia motor para funcionar
  **"exclusivamente"** a álcool, GNV ou eletricidade.
- Só escapam locadora (1%, § 1º) e GNV adaptado em carro fabricado até
  31/12/2008 (3%, § 3º).

A página "Como é calculado o IPVA" do portal da Fazenda-SP responde 200 com
94 KB de chrome de SharePoint e **uma frase** de conteúdo, mandando consultar o
sistema pelo RENAVAM. Quem responde é o texto consolidado em
`legislacao.fazenda.sp.gov.br`.

**O que existe em SP é isenção de HÍBRIDO, e tem prazo.** Disposições
Transitórias art. 5º (acrescido pela Lei 18.065/2024, Portaria SRE-94/24):
híbrido de motor elétrico + combustão a etanol, até R$ 250.000 corrigidos por
IPCA, **isento em 2025 e 2026**; depois 1% em 2027, 2% em 2028, 3% em 2029, 4%
de 2030. O 100% elétrico **não** entra — o dispositivo cobre hidrogênio
exclusivo ou híbrido com motor a combustão, e um BEV não é nenhum dos dois, o
que confirma manter SP fora de `IPVA_BR_ELECTRIC`. O gap do híbrido está
documentado no código e vale R$ 600/mês num carro de R$ 180 mil.

### Duas aproximações estruturais que a leitura da lei expôs

1. **A base de cálculo não é a FIPE.** Em SP é tabela própria da SEFAZ (art. 7º,
   §§ 1º-2º), publicada por resolução e congelada nos preços médios de
   **setembro do ano anterior** — 4 a 15 meses de defasagem contra a FIPE do mês
   corrente, que é o que o motor usa. Em usado com preço nominal em alta a base
   tende a ser menor, então superestimamos. **Não medido** — mediria fácil com a
   tabela da Resolução SFP-40/25 cruzada contra a FIPE.
2. **Zero km paga proporcional** aos meses restantes do ano (art. 11). O motor
   cobra o ano cheio porque não sabe o mês da compra.

### Uma exceção à afirmação de que não há dado estruturado

A **Resolução SFP-40/25** (DOE de 12/12/2025) divulga os valores de mercado de
veículos usados de SP para o exercício 2026 — tabela marca × modelo × ano em
reais, por ato oficial.

**Formato do anexo verificado em 17/08/2026: é PDF, e mesmo assim serve.**

```
https://legislacao.fazenda.sp.gov.br/Paginas/Resolução-SFP-40-de-2025.aspx
  ANEXO I  - Tabela de Valores Venais IPVA 2026   → .pdf, 8,3 MB, 286 páginas
  ANEXO II - IPVA 2026 LEGENDA                     → .pdf
```

A pergunta certa não era "planilha ou PDF", era **"tem camada de texto?"**. Tem,
e com coordenadas: cada token volta com `(x, y)` pelo `visitor_text` do pypdf, os
números são alinhados por coluna de ano e a descrição fica toda em `x < 200`.
Um parser por coordenada lê a tabela; não é OCR, não é adivinhação. Estimativa:
meio dia, e a única complicação real é que o anexo reparte os anos em grupos de
páginas, então o mesmo modelo aparece mais de uma vez com colunas diferentes.

Dois presentes que o PDF dá de graça:

1. **Ele declara a própria data.** O cabeçalho de toda página diz `MÊS BASE:
   SETEMBRO/2025 (EM REAIS)`. O congelamento em setembro do ano anterior deixa
   de ser inferência da leitura do art. 7º e passa a ser afirmação do documento.
2. **A direção do viés que estava suposta aqui não se sustentou.** Estava
   escrito, no código e neste arquivo, que a base tende a ser MENOR que a FIPE e
   que portanto superestimávamos o IPVA de SP. Num spot check de 4 versões
   ano-modelo 2024, base SFP-40/25 contra FIPE de agosto/2026:

   | versão | base IPVA 2026 | FIPE ago/2026 | base − FIPE |
   | --- | --- | --- | --- |
   | FIAT/ARGO 1.0 | 67.395 | 66.063 | **+2,0%** |
   | FIAT/ARGO DRIVE 1.0 | 68.762 | 68.652 | +0,2% |
   | FIAT/MOBI LIKE | 57.191 | 56.138 | **+1,9%** |
   | FIAT/MOBI TREKKING 1.0 MT | 59.828 | 61.174 | **−2,2%** |

   Faz sentido depois de escrito: um carro de 2024 **envelheceu um ano** entre
   setembro de 2025 e agosto de 2026, então a base congelada compara com uma
   FIPE já mais baixa. Se isso se confirmar na tabela inteira, o motor
   **subestima** o IPVA de SP no usado — a direção perigosa, não a segura.

   **Quatro pontos não medem viés**, todos de duas famílias e de um ano-modelo
   só. O que muda é que a suposição antiga perdeu o benefício da dúvida: até a
   medição existir, o comentário no código não pode afirmar direção nenhuma, e
   agora não afirma. A medição completa é o próximo item desta linha.

**Medição completa feita em 06/10/2026** — `engine/scripts/measure-sp-ipva-base.py`
(lê o Anexo I por coordenada, casa com a FIPE por regra rígida e resume). O
anexo tem 13.571 linhas; das 3.316 das 12 marcas grandes, 145 casaram com uma
versão FIPE única (a SEFAZ abrevia muito: `CRETA1TA`, `10TAT`). 295 pontos
versão × ano contra a FIPE de **outubro/2026**. Positivo = base ACIMA da FIPE:

| recorte | n | mediana | p25 | p75 | base > FIPE |
| --- | --- | --- | --- | --- | --- |
| todos | 295 | **−4,3%** | −7,4% | −1,0% | 19% |
| estrito (SEFAZ escreve a cilindrada) | 133 | −3,0% | −5,9% | −0,3% | 23% |
| relaxado | 162 | −5,4% | −8,8% | −2,0% | 16% |
| ano-modelo 2023-2025 | 34 | **+2,1%** | −0,1% | +4,0% | 74% |
| ano-modelo 2019-2022 | 91 | −2,7% | −5,4% | −0,8% | 18% |
| ano-modelo 2015-2018 | 91 | −5,4% | −8,3% | −2,7% | 12% |
| ano-modelo 2012-2014 | 79 | −7,1% | −9,6% | −4,2% | 5% |

Os dois grupos de casamento concordam na direção. **O sinal depende da idade:**
carro novo deprecia depois de setembro e a base congelada fica acima da FIPE
(o motor subestima ~2%); usado velho valoriza no nominal e a base fica abaixo
(o motor superestima 5-7%). O spot check de agosto tinha caído justo na faixa
nova — por isso apontava o lado errado da média.

**Decisão: medido, não modelado.** Em reais é ~R$ 7/mês num carro novo de
R$ 100 mil e ~R$ 8/mês no sentido contrário num velho de R$ 40 mil. E um fator
apodreceria: o tamanho depende de quantos meses se passaram desde setembro.
Rodar o script de novo quando sair a resolução de dezembro.

### Suspeitos de erro para baixo — MS, PI e BA: fechados em 17/08/2026

Levantados por diff contra uma calculadora comercial (camada 5, oráculo de
teste), que declara usar a **média** entre faixas quando a UF escalona. Nas 27
UFs, 20 batem. Das 7 divergências, quatro têm explicação (AM: a calculadora está
desatualizada e nós temos primária; DF, PE e AL: média abaixo da nossa faixa
máxima, direção segura). **MS, PI e BA eram as únicas em que a média dela supera
a nossa faixa máxima**, o que só é possível se a faixa real for maior.

**Os três escalares estavam certos.** O que a calculadora enxergava não era uma
alíquota maior escondida: era uma **segunda dimensão da lei** que um escalar por
UF não carrega. E é uma dimensão que o motor conhece, então virou precisão em
vez de ressalva. O oráculo comercial fez exatamente o trabalho que se espera
dele — apontou onde olhar e errou o diagnóstico.

| UF | escalar | veredito | dimensão que faltava | fonte |
| --- | --- | --- | --- | --- |
| MS | 3,0% | **certo** para usado | 5% no zero km; **4,5% diesel** | SEFAZ-MS, tabela de alíquotas 2026 |
| BA | 2,5% | **certo** para flex/gasolina | **3,0% óleo diesel** | SEFAZ-BA, página de informações do IPVA |
| PI | 2,5% | **certo** até R$ 150 mil | **3,0% acima de R$ 150 mil** | Lei 6.749/2015, PDF da lei sancionada no SAPL/ALEPI |

Detalhe de cada um:

- **MS** — a alíquota nominal de "automóvel (carro de passeio), camioneta,
  camioneta de uso misto e utilitário" é **5%**, com **redução de 40% para
  veículo usado**, o que dá 3,00%. Vigência da redução: **01/01/2026** (Decreto
  16.693/2025); até 2025 a redução era menor e o efetivo era 3,5%, que é o que
  ainda aparece no manual antigo em `arq.sefaz.ms.gov.br/ipvaHom/manual.html`
  (página de 2017, oficial e podre — bom lembrete de que domínio `.gov.br` não
  é sinônimo de atual). Automóvel de passeio a **óleo diesel** com capacidade
  até oito pessoas é linha própria: **6% novo, 4,5% usado** (redução de 25%).
- **BA** — Lei 6.348/91, art. 6º, I: 3,0% para automóveis e utilitários a óleo
  diesel, 2,5% para os movidos a outros combustíveis, 2,5% para 100% elétrico
  acima de R$ 300.000. E **100% elétrico até R$ 300.000 é ISENTO** (Lei
  14.638/2023, efeitos desde 01/01/2024) — a isenção está na lista de isenções
  da própria SEFAZ-BA, e nós cobrávamos 2,5% dele.
- **PI** — Lei 4.548/92, art. 14, na redação da Lei 6.749/2015: incisos IV "a" e
  V fixam 2,5% até R$ 150.000 de valor venal, e o inciso VI, acrescentado pela
  mesma lei, fixa **3,0% acima de R$ 150.000**. Conferido depois contra a Lei
  8.558/2024, que também altera o art. 14 e mexeu **só** no inciso de aeronaves.

**Beco sem saída a registrar, e é do tipo pior que 404:** o PDF consolidado da
Lei 4.548/92 que a SEFAZ-PI publica
(`www.sefaz.pi.gov.br/arquivos/legislacao/leis/Lei4548.pdf`, HTTP 200) traz na
primeira linha "ATUALIZADA ATÉ A LEI Nº 6.142, DE 14 DE DEZEMBRO DE 2011" e
mostra o art. 14 **sem** a faixa de R$ 150 mil. É fonte primária, oficial,
acessível — e 14 anos desatualizada. Quem confiasse nela concluiria que o
escalar de 2,5% cobre tudo. O portal de legislação da SEFAZ-PI
(`portaldalegislacao.sefaz.pi.gov.br`) não substitui: é SPA Angular sobre um
backend ZK que devolve tela de login a requisição automatizada.

**O que resolveu foi o SAPL da Assembleia Legislativa.** `sapl.al.pi.leg.br` tem
API REST pública, sem chave, que entrega o PDF da lei sancionada:

```
GET https://sapl.al.pi.leg.br/api/norma/normajuridica/?numero=6749&ano=2015
→ { "texto_integral": ".../3866_texto_integral.pdf", ... }
```

Vale como **método reaproveitável para as outras UFs**: o SAPL é software do
Interlegis e roda em boa parte das assembleias estaduais, com o mesmo caminho de
API. É camada 1 (o Legislativo publicando a própria lei), responde a script, e
resolve o problema que as SEFAZ criam ao publicar consolidado velho ou portal
SPA. Onde houver SAPL, tentar ele **antes** da SEFAZ.

O mesmo diff corroborou o MT em 3,0% por terceira via: um agregador comercial
concordando com a portaria contra os 3,45% que circulam é sinal razoável de que
aquele número nunca teve origem legal.

### O que entrou no código em 17/08/2026

Nenhum escalar de `IPVA_BR` mudou. Entraram três tabelas novas, todas com o
mesmo contrato de `IPVA_BR_ELECTRIC`: **ausência significa "não conferido"**.

| constante | conteúdo | efeito |
| --- | --- | --- |
| `IPVA_BR_DIESEL` | BA 3,0% · MS 4,5% | corrige erro **para baixo** em diesel |
| `IPVA_BR_VALUE_BRACKET` | PI acima de R$ 150 mil → 3,0% | corrige erro **para baixo** em carro caro |
| `IPVA_BR_ELECTRIC_EXEMPT_MAX` | BA R$ 300 mil | tira cobrança que a lei não autoriza |

Efeito medido em cenário concreto, na linha de IPVA por mês:

| cenário | antes | depois |
| --- | --- | --- |
| picape diesel R$ 220 mil, 3 anos, MS | R$ 550,00 | **R$ 825,00** |
| picape diesel R$ 220 mil, 3 anos, BA | R$ 458,33 | **R$ 550,00** |
| sedan R$ 200 mil, 3 anos, PI | R$ 416,67 | **R$ 500,00** |
| elétrico R$ 180 mil, 2 anos, BA | R$ 375,00 | **R$ 0,00** |
| elétrico R$ 400 mil, 2 anos, BA | R$ 833,33 | R$ 833,33 (acima do teto, correto) |
| hatch R$ 80 mil, 3 anos, PI | R$ 166,67 | R$ 166,67 (abaixo da faixa, correto) |

**O que ficou de fora de propósito: a alíquota de PRIMEIRA TRIBUTAÇÃO.** MS cobra
5% do zero km sobre a nota fiscal contra 3% de usado. O motor segue na de usado,
porque é a que o carro paga em todos os anos seguintes e é a única que casa com
o custo mensal recorrente que a tela mostra. Cobrar 5% de ano cheio somaria dois
erros para cima, já que o motor também ignora a proporcionalidade por mês de
compra que quase sempre acompanha o zero km. O 5% é **custo de entrada**, e a
tela ainda não tem essa linha — junto com transferência e emplacamento.

### MT corrigido de 3,45% para 3,0% (14/08/2026)

**Portaria SEFAZ-MT 196/2025**, art. 2º, VII (DOE Edição Extra de 23/12/2025):
3% para veículo de passeio acima de 1.000 cc, 2% até 1.000 cc. Pela regra da
faixa maior, `MT: 0.03`.

Hipótese sobre a origem do erro, não comprovada: 3,45% é exatamente a alíquota
de **utilitários em Goiás**, confirmada na FAQ da Secretaria da Economia/GO na
mesma pesquisa. Cheira a contaminação entre UFs vizinhas na montagem da tabela.

A mesma portaria **não tem inciso de elétrico ou híbrido** — a redução de 1,5%
que os agregadores atribuem ao MT não está na norma vigente.

### Licenciamento — conferido, e é ruído

| UF | código | verificado 2026 | fonte |
| --- | --- | --- | --- |
| SP | 167 → **174** | 174,08 | carta de serviço do Governo de SP, base Lei 15.266/2013 |
| RS | 98 → **114** | 114,09 (código 7714) | Portaria DETRAN/RS 036/2026 |
| RJ | 231 | não confirmado | a tabela de DUDAs do DETRAN-RJ publica transferência e 2ª via, não o licenciamento anual |

Vale R$ 0,59/mês em SP e R$ 1,34/mês no RS. Corrigido porque é barato, mas não
priorize acima de seguro ou depreciação.

Padrão de manutenção: SP indexa à UFESP, RS à UPF/RS, RJ à UFIR-RJ, e todos
republicam portaria em janeiro. **Os 27 números apodrecem em bloco todo começo
de ano.** Se forem para o Firestore, guarde `{valor, unidadeFiscal, exercicio,
sourceUrl, updatedAt}` e trate janeiro como janela de recoleta.

**Método que vale reaproveitar:** várias SEFAZ mantêm bases Lotus Notes de
legislação tributária em subdomínios `app1.*` / `www5.*`. Foi uma delas que
entregou a alíquota do MT. Valem mais que o portal bonito da SEFAZ, que costuma
ser SPA e redirecionar para a home.

### Conferência de 13/08/2026 — corrigido

| UF | era | virou | fonte |
| --- | --- | --- | --- |
| AM | 3,0% | **2,0%** (1,5% elétrico) | LC estadual 280/2025; SEFAZ/AM, Agência Amazonas, LegisWeb |
| CE | 3,1% | **3,0%** | Diário do Nordeste e agregadores; secundária |
| PR | 1,9% | 1,9%, **sem mudança** | Fazenda/PR e DETRAN/PR: Lei 22.645/2025 |

O Amazonas escalona: 1,5% até 1.000 cc e para elétrico/híbrido, 2,0% acima
(antes 3% e 4%). Como o simulador não conhece cilindrada, ficou na faixa maior
— errar para cima é o lado que não empurra ninguém para uma parcela impagável.

A suspeita sobre o PR estava errada: 1,9% é a alíquota vigente, confirmada em
fonte primária, e o código já estava certo.

**Ainda em aberto — `MT: 0.0345`.** Uma matéria da SEFAZ/AM que ranqueia os
estados lista MT em 2%; a legislação do MT (Lei 7.301/2000, Decreto 1.977/2000)
dá a faixa de 1% a 4% sem que a alíquota de passeio apareça em fonte primária
acessível. Não mexer sem confirmar: 3,45% é um número específico demais para ter
sido inventado, e pode ser média ponderada de faixas.

**Erro estrutural que continua:** `IPVA_BR` é um escalar por UF, e a realidade é
uma matriz UF × cilindrada × combustível. Existe agora um `IPVA_BR_ELECTRIC`,
mas só com AM — a regra é que uma UF só entra ali depois de confirmada, e
ausência significa "não conferido", não "não reduz". MT e CE aparecem em fontes
secundárias com redução para elétrico (1,5% e metade da alíquota,
respectivamente) e ficam de fora até conferir.

Recomendação: aceitar que é manual, mover para o Firestore com `updatedAt` e
`sourceUrl`, e mostrar a data na tela.

## 4. Seguro — beco sem saída parcial

**A curva atual não tem fonte.** O comentário credita SUSEP, mas a SUSEP publica
frequência e severidade de sinistro, não prêmio como % do valor FIPE por faixa
etária. Os números 9,5% / 6,5% / 5,5% / 4,5% são chute vestido de fonte.

### Contradição interna, fechada em 14/08/2026

Terceiros tinha piso absoluto (`clamp(value * 0.015, 700, 2200)`); completo
tinha piso **relativo** (`value * 0.025`), que vai a zero junto com o valor do
carro. Resultado medido no próprio motor: abaixo de ~R$ 11.250 de FIPE o modelo
dizia que **cobertura completa custava menos que só terceiros**. Completo contém
terceiros — não era calibragem ruim, era impossibilidade lógica, e bem na faixa
de preço que o público do Engine compra. Agora o prêmio de terceiros é o piso do
completo.

**Isso não resolve o piso de verdade.** Prêmio real tem componente que não
escala com o FIPE: RCF (limites em R$ fixos, precificados pelo risco do
condutor) e assistência 24h com carro reserva (custo fixo de serviço). Como
% → 0 quando o valor → 0, a fórmula continua errada no limite. A ordem de
grandeza de R$ 1.200 a R$ 1.800/ano é **estimativa, não fonte**, e não entrou no
código por isso.

Duas parcelas que esta seção listava aqui **saíram da conta em 17/08/2026**, e
as duas por motivo documental — ver "Piso, decomposto" abaixo. Emissão de
apólice não é parcela a somar, e o IOF de 7,38% existe mas é multiplicador, não
piso.

### Casco em carro velho não existe — fechado em 17/08/2026

O teto prático de aceitação das seguradoras tradicionais é 15 a 20 anos, e
várias param em 15 (a MAPFRE tem FAQ própria sobre isso). Acima disso sobram
Suhai (só roubo/furto), proteção veicular associativa — que **não é seguro** e
não é regulada pela SUSEP — ou nada.

O motor tratava carro velho como desconto (`carAgeFactor = 0.85` acima de 10
anos) e nunca como produto indisponível. Para um carro de 22 anos ele cuspia um
prêmio de completo confiante para uma apólice que não está à venda. Não era
subestimar um número, era responder a pergunta errada.

**Não dependia de fonte nenhuma — é decisão de modelagem, e foi tomada.** Acima
de `INSURANCE_FULL_COVERAGE_MAX_AGE = 20` anos, e **só no Brasil**, pedir
cobertura completa devolve o prêmio de terceiros com `basis:
"thirdparty_forced"`, e a tela imprime abaixo do número: *"Seguradora
tradicional não vende cobertura completa para carro com mais de 20 anos. O valor
acima é só de terceiros (RCF)."*

**O critério do 20, escrito porque um corte sem critério é um chute:** a faixa de
aceitação observada é 15 a 20, com seguradoras parando em pontos diferentes
dela. Cortar em 15 apagaria a linha de carros que boa parte do mercado ainda
aceita. Cortar no **topo** da faixa faz o silêncio significar "nenhuma
seguradora tradicional vende isto", que é uma afirmação que se sustenta. Entre
15 e 20 o número continua saindo e fica cada vez mais incerto — é o preço de não
apagar informação que existe. Fica limitado ao Brasil porque o teto de aceitação
de outros mercados não foi conferido.

**Devolver `null` foi considerado e descartado.** `monthly.insurance` entra em
`monthlyMaintain`, que entra em `monthlyTotal`, que entra na conta de renda: um
`null` ali vira `NaN` na tela inteira, que é pior que o número errado que se
queria consertar. Terceiros **é** a resposta honesta para esse carro — o produto
existe, é o que a pessoa vai conseguir comprar —, então o certo é dar o número
certo com o rótulo certo, não dar buraco. Medido em Node, carro de 22 anos e
R$ 20 mil em SP com condutor 18-25: seguro de **R$ 136,20 → R$ 76,67/mês** e
total de **R$ 689,38 → R$ 629,85/mês**. A faixa do modo Padrão também estreitou
(teto de R$ 1.736 para R$ 1.626), porque as duas variações de cobertura passam a
dar o mesmo número, que é exatamente a realidade que ela deveria refletir.

### Piso absoluto — a pergunta estava mal endereçada

Procurado em 17/08/2026, **fonte não encontrada** (ver abaixo). Mas a conta em
três cenários mostrou que o item estava apontando para o lugar errado:

| carro (SP, com garagem, 36-55) | completo hoje | terceiros hoje |
| --- | --- | --- |
| R$ 30 mil, 12 anos | R$ 1.419/ano | **R$ 700/ano** |
| R$ 60 mil, 7 anos | R$ 3.340/ano | **R$ 900/ano** |
| R$ 150 mil, 3 anos | R$ 8.349/ano | R$ 2.200/ano |

Um piso de R$ 1.200 a R$ 1.800/ano **quase nunca toca o completo**: em 6 das 6
células de completo testadas (18-25 e 36-55 × três valores) ele só morde uma, o
carro de R$ 30 mil com condutor maduro. O completo já sai acima disso sozinho,
porque é percentual de um valor que não é pequeno.

Onde o piso morde é **terceiros**, e ali ele **já existe**: o `clamp(value *
0.015, 700, 2200)` de `thirdPartyPremium` tem piso absoluto de **R$ 700/ano**,
que também não tem fonte. Então a decisão real não é "criar um piso", é
**"R$ 700/ano é pouco para RCF + assistência 24h + emissão + IOF?"**. Efeito de
mudar: com piso de R$ 1.200 o carro de R$ 30 mil sobe R$ 41,67/mês e o de
R$ 60 mil sobe R$ 25,00/mês; com R$ 1.800, R$ 91,67 e R$ 75,00. É a faixa de
preço que o público do Engine compra, então não é decoração.

**O Murilo decidiu procurar fonte antes de mexer, e a caçada foi feita em
17/08/2026 — resultado abaixo. O piso ficou em R$ 700.** Não por inércia: das
quatro parcelas que a pergunta supunha, uma vale zero por norma (emissão) e
outra é multiplicador e não piso (IOF). Só as duas sem fonte é que decidiriam o
valor, e as duas frentes que poderiam precificá-las responderam não. Mexer no
número agora seria trocar um valor sem fonte por outro valor sem fonte, com a
agravante de que o material levantado aponta para baixo, não para cima.

### Piso, decomposto — caçada de 17/08/2026

"Prêmio mínimo de seguro" não é publicado por ninguém, mas o número é soma de
partes e algumas partes têm fonte primária. Atacado por decomposição. **Duas das
quatro parcelas fecharam; as duas que sobraram são justamente as que decidiriam
o valor, e nenhuma respondeu.**

| parcela | situação | fonte |
| --- | --- | --- |
| Seguro obrigatório (SPVAT) | **R$ 0** — não existe | LC 211/2024 |
| Emissão de apólice | **R$ 0** — não é cobrança separada | Res. CNSP 413/2021, art. 6º |
| IOF | **7,38% do prêmio** — multiplicador, não piso | Decreto 6.306/2007, art. 22, § 1º, IV |
| RCF + assistência 24h | **sem fonte** | — |

**IOF: 7,38%, conferido no texto consolidado, não de memória.** Decreto
6.306/2007, art. 22, § 1º, inciso IV: "nas demais operações de seguro: sete
inteiros e trinta e oito centésimos por cento", redação do Decreto 6.339/2008.
Seguro de automóvel cai em "demais operações" — os incisos nomeados são vida,
acidentes pessoais e saúde. Base de cálculo é "o valor dos prêmios pagos"
(art. 21); contribuinte é o segurado (art. 19) e a seguradora é responsável pela
cobrança e pelo recolhimento (art. 20).

Importava conferir porque **houve mexida recente em IOF e ela não pegou aqui**:
os Decretos 12.466/2025 e 12.499/2025, o Decreto Legislativo 176/2025 que os
sustou e a cautelar do STF na ADC 96 alteraram alínea "e" do inciso I e os
incisos V e VI — todos sobre **VGBL** (vida com cobertura por sobrevivência) —
além de crédito e câmbio. O inciso IV não foi tocado por nenhum deles.

**Isso muda o modelo, e o achado é estrutural:** IOF é percentual sobre o
prêmio, então nunca poderia justificar subir um piso absoluto. O motor não
aplica IOF em lugar nenhum, e a conclusão **não** foi somá-lo: a curva de seguro
não tem fonte, então não existe base para afirmar que o número de hoje é prêmio
líquido. Multiplicar por 1,0738 mudaria toda a linha de seguro em +7,38% sem
nenhuma evidência de que ela estivesse baixa — e afastaria a tela da cotação
real, que chega para a pessoa como prêmio **total**. O que entrou no código foi
a **convenção declarada**: o número devolvido é prêmio total, com IOF dentro, e
quem for calibrar contra estatística de seguradora (que costuma reportar prêmio
líquido) tem de multiplicar por 1,0738 antes.

**Custo de apólice: R$ 0, e é regulado.** O teto era R$ 60 (Circular SUSEP
176/2001), subiu para R$ 100 com a Circular 401/2010, que a Circular 432/2012
suspendeu — voltando aos R$ 60 — e a cobrança em separado do prêmio foi extinta
a partir de 01/01/2013. Em norma vigente a vedação expressa está na **Resolução
CNSP 413/2021, art. 6º** ("É vedada a cobrança de custo de emissão na
contratação de seguros por meio de bilhete"), verificada no PDF da própria
SUSEP. A **Circular SUSEP 621/2021, art. 32, § 1º** proíbe cobrar qualquer
valor adicional a título de custo administrativo de fracionamento do prêmio.
Nenhuma das duas circulares do grupo automóvel (621/2021 e 639/2021) menciona
IOF — não há definição regulatória de líquido vs. total, é prática contábil.

Esta parcela **derruba** o argumento de subir o piso, em vez de sustentá-lo: uma
das quatro coisas que se supunha embutidas nos R$ 700 vale zero.

- **CNseg**: continua publicando prêmio médio agregado só em matéria de
  imprensa. Não revisitado nesta rodada.
- **`dados.gov.br`**: segue exigindo chave (401 em
  `/api/3/action/package_search?q=autoseg`, reconfirmado em 17/08/2026). O
  cadastro **não é auto-serviço anônimo**: a chave sai por conta gov.br, que
  exige CPF e nível de identidade. **É decisão do Murilo**, não minha — e
  destravaria dois itens de uma vez (este e o PBEV estruturado da seção 6).

### AUTOSEG e SES — VOLTARAM AO AR (verificado em 17/08/2026, ~17h40 BRT)

**Este registro mudou duas vezes em quatro dias. A data vale mais que o
estado.** Em 14/08 constava "inalcançável (falha de conexão)", supondo rede. Em
17/08 pela manhã o host respondia mas a aplicação devolvia HTTP 500 (erro de
deploy do ASP.NET, "Could not load file or assembly System.Runtime.Serialization",
que derrubava SES e AUTOSEG juntos porque moram na mesma aplicação). **Na tarde
de 17/08 as duas voltaram:**

```
GET https://www2.susep.gov.br/menuestatistica/SES/principal.aspx      → 200
GET https://www2.susep.gov.br/menuestatistica/Autoseg/principal.aspx  → 200 (v5.3)
GET https://www2.susep.gov.br/menuestatistica/Autoseg/menu1.aspx      → 200 (formulário completo)
```

O servidor oscila. Quem reencontrar isto fora do ar não descobriu nada novo —
tente de novo depois, e ponha a data.

**O caminho de download registrado antes estava errado.** Não é
`/download/menuestatistica/autoseg/*.zip` (404, e handshake que não completa).
O link real da página é um redirect:

```
GET https://www2.susep.gov.br/redarq.asp?arq=Autoseg2021A%2ezip
→ 302 Location: https://www2.susep.gov.br/download/estatisticas/Autoseg2021A.zip
```

**AUTOSEG continua congelado em 2020, agora confirmado dos dois lados.** Os
downloads param no `Autoseg2021A` (2º semestre de 2020, 535 MB), e o formulário
de consulta on-line oferece 30 semestres cujo último período é `31/12/2020`. Não
é limitação do arquivo: é o fim da base.

**AUTOSEG é CASCO e só casco — e isto encerra o item do piso.** O dicionário de
dados (`DEFINICOES_AUTOSEG.pdf`, baixado e lido em 17/08/2026) lista três
tabelas principais: `arq_casco_comp`, `arq_casco3_comp` e `arq_casco4_comp`. A
própria página diz "Esta versão 5.3 contém valores para a cobertura de CASCO".
No PDF inteiro não há nenhuma ocorrência de RCF, RCD, terceiros, civil ou APP.
Os campos são `EXPOSICAO1`, `PREMIO1`, `IS_MEDIA`, `FREQ_SIN1..4/9` e
`INDENIZ1..4/9`, e o único prêmio é o de casco.

Ou seja: **o AUTOSEG nunca ia responder qual é o piso de terceiros.** Não é
fonte indisponível, é fonte que não contém o dado — encerramento por conteúdo,
que é mais forte e mais durável que encerramento por indisponibilidade.

O que o AUTOSEG **serve** é outra coisa, e agora está destravado: publica prêmio
médio e importância segurada média, ponderados por exposição, cruzados por
categoria tarifária, região, modelo, ano, sexo e faixa etária. Prêmio médio ÷ IS
média **é** prêmio como % do valor do carro, que é a forma exata de
`INSURANCE_AGE_RATES` (hoje 9,5 / 6,5 / 5,5 / 4,5, sem fonte) e de
`INSURANCE_REGION_BR`. Duas ressalvas para quem for fazer: as faixas etárias do
AUTOSEG são 18-25 / 26-35 / 36-45 / 46-55 / >55 e o motor usa 36-55 como faixa
única, então há uma agregação ponderada a fazer; e o nível é de 2020 — rotular
como "base SUSEP 2020" e ancorar o nível num parâmetro calibrável, porque os
**fatores relativos** envelhecem devagar mas o nível não.

A notícia da SUSEP de jun/2024 sobre reabertura permanente da base de automóvel
no PDA 2024-2026 segue **não confirmada**: `dados.susep.gov.br` e
`gov.br/susep/pt-br/central-de-conteudos/dados-abertos` continuam 404 em
17/08/2026.

### Open Insurance Brasil — o campo de prêmio existe, e vem vazio

Reauditado a fundo em 17/08/2026. A passagem anterior tinha olhado só a **v1** de
um participante e concluído "não publica prêmio"; a conclusão muda de forma,
porque **a v1 realmente não tem o campo, mas a v2/v3 têm**.

O spec oficial (repositório `br-openinsurance/areadesenvolvedor`, arquivo
`documentation/source/files/swagger/auto-insurance.yaml`, hoje na versão 3.0.0)
define `premiumRates` como `range_1..range_4`, cada faixa com `minimum`,
`maximum` e `median`. A descrição do próprio campo diz que é "Taxa de Prêmio ...
apenas para referência sobre o valor praticado no mercado para determinado
produto e faixas de risco" e que "considera somente veículos leves, exceto motos
e caminhões". Era exatamente faixa de prêmio publicada pela seguradora, em API
pública sem autenticação.

**Varrido o diretório inteiro de participantes**
(`data.directory.opinbrasil.com.br/participants`: 38 organizações, 30 endpoints
de `auto-insurance` ativos), com códigos FIPE reais e CEP 01310100:

| seguradora | versão | produtos | `premiumRates` |
| --- | --- | --- | --- |
| Porto (Porto / Itaú / Azul) | v1.5 | 9 | campo **não existe** |
| Porto (Porto / Itaú / Azul) | v1.6 | 24 | presente, **tudo `0.00`** |
| Novo Seguros | v1.6 | 1 | presente, **tudo `0.00`** |
| Safra (Alfa) | v1.6 e v2.0 | 2 | presente, **`1.00 / 2.00 / 3.00 / 4.00`** |
| Bradesco, Allianz, Santander, Tokio, HDI | v1.6 e v2.0 | 0 | sem produto para os parâmetros |
| Mapfre, Yelum, Indiana | v1.6 e v2.0 | — | 404 |
| Zurich | v1.6 e v2.0 | — | 500 |

O `1.00 / 2.00 / 3.00 / 4.00` da Safra é o **número da faixa**, não o prêmio. O
payload da Novo Seguros é de teste: devolve sempre o mesmo Prisma 2019 seja qual
for o código FIPE consultado, marca `targetAudiences: PESSOA_JURIDICA` e traz o
símbolo de moeda como `د.إ` com descrição `BRL`.

**Dead end, mas de um tipo diferente do anterior.** Não é "o dado não é
publicado" — é "a obrigação existe, o campo existe, e o mercado inteiro preenche
com zero". Não se resolve com engenharia; só muda se a SUSEP cobrar
preenchimento. Vale revisitar em alguns meses olhando **só este campo**, que é
uma varredura de dois minutos.

Detalhes operacionais para quem voltar: a Porto exige o header `cache-control`
(sem ele devolve 400 com a mensagem dizendo isso), e a Novo Seguros está com
**certificado TLS expirado** — o payload dela só foi lido com verificação
desativada, o que é aceitável para leitura de dado público mas precisa constar.

**O que o Open Insurance DÁ**, e que o simulador ignora hoje: franquia
(`deductiblePercentage`), pacote de assistência (`ATE_10_SERVICOS`,
`ATE_20_SERVICOS`, `ACIMA_20_SERVICOS`) e os limites de RCF efetivamente
vendidos. Da Porto, em 17/08/2026:

```
Porto Seguro Auto Tradicional   RCFV  LMI de R$ 5.000 a R$ 1.000.000
Azul Auto Tradicional           RCFV  LMI de R$ 50.000 a R$ 500.000
Azul Auto Roubo                 RCFV  LMI de R$ 50.000 a R$ 75.000
```

Isso é um recado para o modelo: **"seguro de terceiros" não é um produto só.** O
LMI vendido varia 200x e o simulador não pergunta o LMI — então o piso de
R$ 700, qualquer que fosse o valor certo, embute uma escolha de LMI que ninguém
declarou. Isso pesa mais que o piso em si.

Cotação real exige mTLS ICP-Brasil e registro de corretora na SUSEP. Não é
problema de engenharia, é decisão de parceria comercial.

## 5. Juros — integrar, é trivial

Única API oficial, JSON, gratuita, sem chave, licença ODbL:

```
GET https://api.bcb.gov.br/dados/serie/bcdata.sgs.25471/dados/ultimos/3?formato=json
→ [{"data":"01/06/2026","valor":"1.97"}, ...]
```

Série 25471 = taxa média mensal de aquisição de veículos, PF. Hoje 1,97% contra
os 1,99% do código — ganho imediato nulo. O valor é não apodrecer: a mesma série
marcava 1,63% em 2019.

## 6. Consumo — dead end no Brasil, e uma base rotulada errado

INMETRO/PBE Veicular só publica **PDF**. Nenhum CSV, nenhuma API. 794 modelos no
ciclo 2026. Licença CC Atribuição-**SemDerivações**, o que é uma questão
jurídica real se formos redistribuir tabela derivada.

### `fipe-consumption-db.json` NÃO é do INMETRO (auditado em 14/08/2026)

A base embutida no bundle era anunciada na tela como "Consumo real INMETRO" e no
cabeçalho do `consumption.js` como "do INMETRO". O próprio arquivo desmente:

- **91 modelos compartilham só 24 tuplas distintas.** Corolla, Focus, T-Cross,
  C4 Cactus, 408, Captur, Yuan, H2 e um Mercedes C180 têm exatamente o mesmo
  consumo. São faixas por categoria, não medições.
- **Todo modelo tem valor de diesel**, inclusive Gol, Uno, Palio, Kwid, Onix,
  Mobi e Prius — que não existem em versão diesel no Brasil.
- O JSON **não declara fonte nenhuma**: só `compiledAt`, `version` e
  `coverage: "100.0%"`.

Consistente com o parágrafo acima: se o INMETRO só publica PDF, esta base não
veio de lá.

Isso importa muito mais que o erro numérico, porque o consumo decide ~2/3 da
conta na tela. A base continua em uso — estimativa por categoria ainda separa um
Hilux de um Mobi, o que a média única não faz —, mas a tela e o código agora
chamam pelo nome. **Substituir por medição real segue em aberto**, e é
provavelmente caso para o `expenses.js`, igual à manutenção.

(Um argumento que NÃO serve como prova: a razão etanol/gasolina ficar em ~0,72
em todos os modelos. Isso é física — o etanol tem ~30% menos energia por litro —
e apareceria igual numa base real.)

Para os EUA existe a API pública do EPA (`fueleconomy.gov/ws/rest/...`, domínio
público, verificada), mas os modelos não coincidem com o mercado brasileiro.

Prioridade baixa: são 4 constantes que a pessoa já pode sobrescrever.

**Estado em 17/08/2026 (detalhe no apêndice de ficha técnica, no fim deste
arquivo):** as quatro APIs comerciais auditadas foram descartadas — nenhuma tem
consumo de carro brasileiro, e as que têm consumo têm EPA (mpg) ou ciclo europeu
(l/100 km), que **não são intercambiáveis com INMETRO/PBEV**. Trocar um pelo
outro repetiria em silêncio o erro de rótulo que acabou de ser corrigido. O PBEV
2026 existe com 895 versões, 277 delas flex, e continua **só em PDF** com o
download programático bloqueado por Cloudflare. O único fio não esgotado é a
chave grátis do `dados.gov.br` (401 hoje), que responderia se há PBEV
estruturado publicado lá. **O item é "bloqueado numa chave de API", não
"morto".**

## 7. Manutenção — não existe fonte pública brasileira

Nenhuma. AAA e Edmunds são americanos, com copyright: a metodologia é copiável,
os números não são redistribuíveis. Cesvi e Sindipeças são comerciais.

A fórmula atual usa **% do valor do carro**, o que é conceitualmente frágil —
manutenção escala com complexidade mecânica e preço de peça, não linearmente
com valor FIPE. A metodologia AAA (custo por km, por categoria, com curva de
idade) é mais defensável.

**A saída boa:** o `expenses.js` coleta gasto real de manutenção dos usuários.
Com volume, isso vira o único dataset brasileiro que existe sobre o assunto.
É vantagem competitiva, não plano B.

---

## Sequenciamento sugerido

**Agora:** ANP semanal e BCB mensal para o Firestore; corrigir o IPVA do AM.

**Depois:** job mensal de amostragem FIPE para calibrar a depreciação, com
amostra ampla o bastante para não confundir efeito de período com curva.

**Projeto próprio:** baixar o AUTOSEG 2020 e extrair os fatores relativos de
seguro.

**Não fazer:** pipeline de PDF do INMETRO; pipeline por país para seguro
internacional (11 publicações anuais para calibrar 11 escalares — calibra uma
vez à mão); procurar API de cotação de seguro, que está bloqueada por regulação.

---

# Apêndice — APIs de ficha técnica (auditoria de 17/08/2026)

Motivo: vai nascer uma seção "Ficha técnica" (dono: Brian), aberta na Garagem,
na criação de veículo e no post da Comunidade. Quatro APIs foram levantadas
para preencher o buraco que a FIPE não cobre: potência, torque, câmbio, tração,
dimensões, peso, porta-malas, consumo, tanque, 0-100.

Interesse do simulador: o `consumption.js` foi desmascarado (24 tuplas para 91
modelos, diesel em Gol e Kwid). Se alguma dessas APIs tivesse consumo por
versão para carro brasileiro, consertaria ~2/3 da conta de combustível.
**Nenhuma tem.** Detalhe abaixo.

## A chave de consulta: temos código FIPE e jogamos fora

`ModalNewCar.jsx` (linhas ~144, ~161, ~177) é uma cascata de três selects sobre
`parallelum.com.br/fipe/api/v1/carros`. Não é texto livre: é vocabulário
controlado da FIPE. O que é persistido em `db.js:316` (`normalizeCar`) são só os
**nomes**:

- `brand` = `"GM - Chevrolet"` (nome da marca FIPE, não "Chevrolet")
- `model` = `"ONIX HATCH 1.0 12V TB Flex 5p Aut."`
- `year`  = `"2022 Flex"`

Os códigos (`selectedBrand=23`, `selectedModel=8889`, `selectedYear=2022-5`) e o
`CodigoFipe` (`004511-0`) existem no submit e são descartados. Persistir os
quatro é mudança de três linhas e deve ser feita independentemente do resto
desta auditoria — é a chave canônica brasileira do veículo, de graça.

**Nenhuma das quatro APIs aceita ou mapeia código FIPE.** Verificado por
ausência total do termo "FIPE" na documentação das quatro (grep sobre o HTML
servido de `carapi.app/docs`, `api-ninjas.com/api/cars`, `car2db.com/` e
`vehicledatabases.com/api/vehicle-specifications`: zero ocorrências, junto com
zero ocorrências de "Brazil"/"Brasil"/"South America"). Consequência: qualquer
uma delas exigiria casar `"ONIX HATCH 1.0 12V TB Flex 5p Aut."` com nomenclatura
em inglês, por string. Custo de parsing estimado adiante.

## Resultado da cobertura da frota brasileira

Testado contra o catálogo real de cada base, não contra a página de marketing.

| Modelo testado        | CarAPI | API Ninjas | Vehicle DB | Car2DB |
|-----------------------|--------|------------|-----------|--------|
| Chevrolet Onix 2022   | não    | não decl.  | não decl. | não decl. |
| Fiat Strada 2023      | não    | não decl.  | não decl. | não decl. |
| VW Gol 2018           | não    | não decl.  | não decl. | não decl. |
| Hyundai HB20 2021     | não    | não decl.  | não decl. | não decl. |
| Fiat Toro 2022        | não    | não decl.  | não decl. | não decl. |
| Toyota Corolla 2020 * | SIM    | provável   | provável  | provável |

(*) controle que existe nos EUA. "não decl." = a própria empresa declara uma
cobertura geográfica que exclui a América do Sul; ver cada seção.

**CarAPI foi medida diretamente, sem chave**, e é 0/5 nos brasileiros:

- `GET /api/models/v2?make=Chevrolet&limit=200` → 31 modelos, sem Onix:
  Blazer, Bolt EV, Camaro, Caprice, Captiva Sport, City Express, Colorado,
  Corvette, Cruze, Cruze Limited, Equinox, Express 2500/3500, Impala,
  Impala Limited, Malibu, Malibu Limited, Silverado 1500/1500 Legacy/2500 HD/
  3500 HD, Sonic, Spark, Spark EV, SS, Suburban, Suburban 3500 HD, Tahoe,
  Traverse, Trax, Volt.
- `make=Fiat` → 4 modelos: 124 Spider, 500, 500L, 500X. Sem Strada, Toro,
  Argo, Mobi, Pulse, Cronos.
- `make=Volkswagen` → 17 modelos, sem Gol, Polo, Virtus, T-Cross, Nivus.
- `make=Hyundai` → 20 modelos, sem HB20 e sem Creta.
- `GET /api/makes?year=2020` → 44 marcas, sem Renault, Peugeot, Citroën, Chery
  e BYD. O catálogo inteiro de marcas já exclui parte relevante da frota BR.

CarAPI declara isso na própria documentação: *"The API returns vehicle data for
cars sold in the United States since 1900."*

## Tolerância de string: zero (e o briefing estava invertido)

Como o input é vocabulário FIPE e não digitação, o teste certo é se a API
aguenta a string longa da FIPE. CarAPI, medida:

- `?model=ONIX HATCH 1.0 12V TB Flex 5p Aut.` → `total: 0`
- `?model=Coroll` (prefixo de um modelo que ela TEM) → `total: 0`
- `?make=VW` → `total: 0`; `?make=fiat` → 4 (só a caixa é tolerada)
- `?search=Onix` → devolve os 727 modelos, ou seja, o parâmetro é ignorado

É **igualdade exata, case-insensitive, sem fuzzy e sem busca parcial**. Então o
casamento teria de ser feito por nós: quebrar `"ONIX HATCH 1.0 12V TB Flex 5p
Aut."` em modelo + versão + motor + câmbio, traduzir, e ainda normalizar
`"GM - Chevrolet"` → `"Chevrolet"` e `"2022 Flex"` → `2022`. Isso é uma tabela
de-para mantida à mão, por marca e por modelo, para uma base que não tem os
carros do outro lado. Trabalho garantido, resultado não.

## Por API

### 1. CarAPI — https://carapi.app

- **Camada:** 4 (agregador comercial de dados de mercado americano).
- **Chave:** year/make/model/trim exatos, ou VIN. Não aceita FIPE.
- **Cobertura BR:** 0/5 medido. Corolla 2020 devolve 13 versões.
- **Campos:** bons, e o tier grátis dá mais do que a página de preços sugere.
  `GET /api/engines/v2?make=Toyota&model=Corolla&year=2020` respondeu sem auth:
  `engine_type`, `fuel_type`, `cylinders`, `size`, `horsepower_hp`,
  `horsepower_rpm`, `torque_ft_lbs`, `torque_rpm`, `valves`, `valve_timing`,
  `cam_type`, `drive_type`, `transmission`. E `/api/mileages/v2`:
  `fuel_tank_capacity`, `combined_mpg`, `epa_city_mpg`, `epa_highway_mpg`,
  `range_city`, `range_highway`. Os endpoints v1 equivalentes retornam 403
  `DeprecatedException` exigindo plano pago; os v2 estão abertos hoje.
- **Consumo:** é **EPA (ciclo americano)**, em mpg. Não é INMETRO, não é
  intercambiável, e não existe para carro brasileiro de todo jeito.
- **Preço:** US$199/ano (1.500 req/dia), US$249/ano (3.000/dia), US$299/ano
  (6.000/dia); excedente US$0,001/chamada. Sem tier grátis anunciado, embora
  vários endpoints respondam sem chave hoje.
- **Cache:** **permitido e recomendado** — *"Yes, absolutely. We advise you to
  cache data as you request it from CarAPI."* É a melhor condição comercial das
  quatro, e é a única coisa boa dela para nós.
- **Veredito: não serve** — a frota é a errada, e nenhum preço conserta isso.

### 2. API Ninjas Cars — https://api-ninjas.com/api/cars

- **Camada:** 4 (revenda de dataset de terceiros).
- **Chave:** `make` + `model` + `trim` em texto. Não aceita FIPE.
- **Cobertura BR:** **não medida** — nenhum acesso anônimo. `GET
  https://api.api-ninjas.com/v1/cars?model=corolla` → HTTP 400
  `{"error": "Missing API Key."}`; idem `/v1/carmakes`. Não há endpoint de demo
  público (varri o bundle da página: só os cinco `api.api-ninjas.com/v1/*`).
  Obter chave exige cadastro por e-mail, que não foi feito. **Item não
  confirmado**, e registrado como tal.
- **O que é documentado:** o `/v1/cars` legado devolve `city_mpg`,
  `highway_mpg`, `combination_mpg`, `class` — formato do dataset do EPA
  (fueleconomy.gov), portanto EUA. O `/v1/cardetails` novo tem outra origem:
  o exemplo da doc é `{"make":"Audi","model":"A4","trim":"1.6 AT (101 hp)",
  "start_production_year":1994,"specifications":{"Engine power":"101 hp",
  "Curb weight":"1255 kg","Number of seater":"5"}}` — métrico, formato de
  versão europeu.
- **Inferência, marcada como tal:** esse formato de trim (`"1.6 AT (101 hp)"`)
  é praticamente idêntico ao do Car2DB (`"1.5 CVT (110 h.p.)"`), o que sugere
  que ambos derivam da mesma linhagem de base europeia/russa de fichas. Se
  estiver certo, a cobertura BR do `/v1/cardetails` é tão ruim quanto a do
  Car2DB. **É palpite, não medição.**
- **Preço:** grátis 3.000 chamadas/mês; Developer US$39/mês (100k); Business
  US$99/mês (1M); Professional US$199/mês (10M). Sem cartão no grátis.
- **Cache: proibido abaixo de US$99/mês.** A tabela de planos lista
  *"Data caching/storing allowed"* apenas em Business, Professional e
  Enterprise. Além disso os endpoints novos (`carmakes`/`carmodels`/`cartrims`/
  `cardetails`) exigem Business, Professional ou assinatura anual. Ou seja: o
  tier que dá ficha técnica e o tier que permite cache são o mesmo, e custa
  US$99/mês.
- **Veredito: não serve** — cobertura BR não comprovada e provavelmente ausente,
  e o direito de cache custa US$99/mês, o que inverte a economia da feature.

### 3. Vehicle Databases — https://vehicledatabases.com

- **Camada:** 4 (agregador comercial americano).
- **Chave:** VIN, placa, **ou** year/make/model/trim. O YMM existe, o que a
  salva do primeiro filtro. Não aceita FIPE.
- **Cobertura BR:** **declarada como ausente pela própria empresa** — a página
  do produto de especificações diz cobertura *"North America and European
  Union"*, 1981–2026, "over 75 makes, 1,831 models, 80,000+ trims". Os 80 mil
  versões do print são NA+UE. Confirmando pelo mapa de produtos (sitemap):
  existem `vin-decoder/canada` e `vin-decoder/europe`, e **nenhum** produto para
  América do Sul. Onix, Strada, HB20 e Toro nunca foram vendidos em NA nem na
  UE; o Gol tampouco. Nenhum dos cinco pode estar lá.
- **Medição direta:** impossível sem chave. `GET
  https://api.vehicledatabases.com/ymm-specs/options/v2/2020` → HTTP 401
  `{"statusCode":401,"message":"Access denied due to missing subscription
  key..."}`. Idem `/vehicle-market-value/v2/{vin}`.
- **Preço:** **não publicado.** `vehicledatabases.com/pricing` → 404. A página
  do produto diz *"Pricing details are available once you sign up"*. Preço só
  por cadastro é, por si, um sinal ruim para uma feature de consumo alto.
- **Cache:** **não confirmado.** `vehicledatabases.com/terms-of-service` → 404;
  nada sobre cache na página do produto. Item em aberto — mas irrelevante,
  porque a cobertura já a elimina.
- **Veredito: não serve** — a própria empresa declara NA+UE, e nossos cinco
  carros de teste não existem em nenhum dos dois.

### 4. Car2DB — https://car2db.com

- **Camada:** 4 (base comercial). **É o `basebuy.ru` rebrandado** — a home do
  `auto.car2db.com` linka `auto.basebuy.ru/download/ru/auto_rus_demo.zip` e
  `api.basebuy.ru`, e `api.car2db.com` serve uma página em russo
  (`application-name: api.basebuy.hm`). Base de origem russa.
- **Chave:** ids internos (`id_car_make`/`id_car_model`/`id_car_trim`), com um
  `/search/vehicles` na v3. Não aceita FIPE.
- **Cobertura BR:** **declarada como ausente** — a página da API diz
  *"North America, Europe, and Asia"*, 110.000+ trims, 80+ especificações.
  América do Sul não é citada.
- **Amostra grátis baixada e inspecionada** (`car2db.com/download/en/car2db_en_cut.zip`,
  1,15 MB, HTTP 200, sem cadastro): 12 CSVs mais um dump
  SQL. Contém só Honda e Infiniti, e o recorte de modelos é JDM
  (Airwave, Ascot, Avancier, Capa, Concerto, Crossroad). **O ano de produção
  máximo em `car_trim.csv` é 2016**, e os `date_update` são de 2016–2018. A
  amostra pública está 10 anos defasada.
- **Campos: são os melhores dos quatro, e são exatamente os que Brian quer.**
  `car_specification.csv` traz 58 especificações, entre elas: Body type,
  Number of seater, Length/Width/Height, Wheelbase, Ground clearance,
  Engine type, Capacity, Engine power, Max power at RPM, Maximum torque,
  Turnover of maximum torque, Injection type, Number of cylinders,
  Valves per cylinder, Fuel, Gearbox type, Number of gear, Drive wheels,
  Front/Rear brakes, Front/Back suspension, Max speed,
  **Acceleration (0-100 km/h)**, Curb weight, Full weight, Payload,
  **Fuel tank capacity**, **City/Highway/Mixed driving fuel consumption per
  100 km**, Cruising range, Min/Max trunk capacity, Emission standards.
- **Registro real extraído da amostra** (Honda Accord `2.0 MT (133 h.p.)`,
  1987–1989), para mostrar o que de fato vem preenchido:
  `Body type: Sedan · Number of seater: 5 · Length: 4685 · Width: 1695 ·
  Height: 1390 · Wheelbase: 2720 · Ground clearance: 160 · Engine type:
  Gasoline · Capacity: 1996 · Engine power: 133 · Max power at RPM: to 5 300 ·
  Maximum torque: 179 · Injection type: Multi-point fuel injection ·
  Number of cylinders: 4 · Valves per cylinder: 4 · Fuel: 95 RON ·
  Gearbox type: Manual · Drive wheels: Front wheel drive ·
  City fuel consumption: 10 · Highway: 6 · Mixed: 8 · Fuel tank capacity: 60 ·
  Max speed: 200 · Acceleration (0-100 km/h): 9 · Curb weight: 1240 ·
  Full weight: 1760 · Min/Max trunk capacity: 448`
- **Consumo:** l/100 km, ciclo europeu (NEDC/WLTP conforme a época), **nem EPA
  nem INMETRO**. E o campo `Fuel` é do tipo `"95 RON"`: **a base não tem
  conceito de flex**. Carro brasileiro tem dois consumos (etanol e gasolina) e
  essa modelagem não comporta isso. Mesmo que a cobertura BR existisse, o
  consumo dela não substituiria o `consumption.js`.
- **Preço:** trial grátis US$0 (1.000 req/mês, base de demonstração); API
  US$49/mês (base completa, atualização mensal); dump MySQL **US$95 uma vez**;
  export Excel US$190 uma vez. Trial sem cartão.
- **Cache:** o dump de US$95 torna a pergunta discutível — dado que você baixa é
  dado que você guarda. Os termos (`car2db.com/agreement/`) não foram lidos
  linha a linha; **item em aberto**, mas a modalidade de dump é a única das
  quatro cuja economia não é por chamada.
- **Veredito: não serve** — o modelo comercial é o melhor dos quatro (US$95 de
  uma vez, dado local, cache não é problema) e o schema é o certo, mas é uma
  base russa que declara NA/Europa/Ásia, a amostra pública para em 2016, e não
  representa flex. Se algum dia ela anunciar catálogo sul-americano, vale
  reabrir — é a única das quatro que valeria.

## A alternativa brasileira

### FIPE — já está em produção, e o que falta nela

`fipeService.js` cai direto na `parallelum` quando `VITE_API_URL` está vazio,
que é o caso em prod. Então não é opção nova; é a base instalada.

**v1 vs v2: a v2 não traz um único campo a mais.** Medido no mesmo veículo
(Chevrolet 23 / modelo 8889 / ano 2022-5):

- v1 `.../carros/marcas/23/modelos/8889/anos/2022-5` →
  `{"TipoVeiculo":1,"Valor":"R$ 67.091,00","Marca":"GM - Chevrolet",
  "Modelo":"ONIX HATCH 1.0 12V TB Flex 5p Aut.","AnoModelo":2022,
  "Combustivel":"Flex","CodigoFipe":"004511-0","MesReferencia":"agosto de
  2026","SiglaCombustivel":"F"}`
- v2 `.../cars/brands/23/models/8889/years/2022-5` →
  `{"vehicleType":1,"price":"R$ 67.091,00","brand":"GM - Chevrolet",
  "model":"ONIX HATCH 1.0 12V TB Flex 5p Aut.","modelYear":2022,"fuel":"Flex",
  "codeFipe":"004511-0","referenceMonth":"agosto de 2026","fuelAcronym":"F"}`

São os mesmos nove campos com as chaves renomeadas de pt para en. **Migrar para
a v2 não ganha nada** e custaria renomear o parsing. A v2 ainda cobra pelo que a
v1 não tem: `?reference=300` devolve HTTP 402 *"apenas assinantes pagos podem
acessar o histórico de preços estendido"*. Recomendação: **ficar na v1**.

O que a FIPE não tem e nunca terá: potência, torque, câmbio, tração, dimensões,
peso, porta-malas, consumo, tanque, 0-100. Ela é uma tabela de **preço**. O
buraco de ficha técnica é real e nenhuma das quatro APIs o preenche para o
Brasil.

Achado operacional (camada 1, medido nos headers): a parallelum devolve
`x-ratelimit-limit: 500` por dia. Como em prod a chamada sai do browser do
usuário, o limite é por IP do usuário final, não da aplicação — hoje não é
gargalo, mas qualquer movimento para chamar a FIPE do servidor transformaria
500/dia num teto único para o app inteiro. Registrar antes de alguém "otimizar"
isso para o backend.

### FIPE oficial — funciona, sem chave, e ninguém está usando

`veiculos.fipe.org.br/api/veiculos/*` responde a POST JSON com header
`Referer: https://veiculos.fipe.org.br/`, sem autenticação. Verificado:

- `POST /ConsultarTabelaDeReferencia` `{}` →
  `[{"Codigo":336,"Mes":"agosto/2026 "}, ...]`
- `POST /ConsultarMarcas` `{"codigoTabelaReferencia":336,"codigoTipoVeiculo":1}`
  → `[{"Label":"Acura","Value":"1"}, ...]`
- `POST /ConsultarValorComTodosParametros` com
  `{"codigoTabelaReferencia":336,"codigoTipoVeiculo":1,"codigoMarca":23,
  "codigoModelo":8889,"ano":"2022-5","anoModelo":2022,
  "codigoTipoCombustivel":5,"tipoVeiculo":"carro","tipoConsulta":"tradicional"}`
  → `{"Valor":"R$ 67.091,00","Marca":"GM - Chevrolet","Modelo":"ONIX HATCH 1.0
  12V TB Flex 5p Aut.","AnoModelo":2022,"Combustivel":"Flex","CodigoFipe":
  "004511-0","MesReferencia":"agosto de 2026 ","Autenticacao":"4pyzxmd23plf",
  "TipoVeiculo":1,"SiglaCombustivel":"F","DataConsulta":"segunda-feira, 17 de
  agosto de 2026 09:11"}`

**É camada 1** (a própria FIPE) contra a camada 4 da parallelum, não tem teto de
500/dia, e traz dois campos que a parallelum não expõe: `Autenticacao` (código
de verificação da consulta) e `DataConsulta`. Também não tem ficha técnica.
Vale como fallback quando a parallelum estourar o limite ou sair do ar; não vale
uma migração agora, porque não é documentada como API pública e pode mudar sem
aviso.

### PBEV/INMETRO — continua sendo só PDF (dead end reconfirmado)

A tabela 2026 tem 41 marcas e 895 modelos/versões, com 277 flex — exatamente o
recorte que consertaria o `consumption.js`, e no ciclo brasileiro certo.

**Só que não há versão estruturada.** Varri a página oficial de tabelas
(`gov.br/inmetro/.../veiculos-automotivos-pbe-veicular`) e o portal antigo
(`inmetro.gov.br/consumidor/tabelas_pbe_veicular.asp`, que só responde em HTTP —
o 443 dá `ECONNREFUSED 200.20.212.34:443`). Ambos listam **exclusivamente PDFs**:
`pbe-veicular-2022.pdf`, `-2023.pdf`, `-2024-1.pdf`, `mascara-pbev-2025-mar-11.pdf`,
`mascara-pbev-2026_19_jan-rev01.pdf`. Zero `.xls`, `.xlsx`, `.csv`, `.ods`.

Dois becos sem saída a registrar, com o modo de falha:

1. **Download programático dos PDFs está bloqueado.** As URLs devolvem HTTP 200
   com `content-type: text/html` e o corpo é a home do INMETRO — Cloudflare
   servindo a homepage para cliente não-browser. Não é 404: o arquivo existe, o
   acesso automatizado é que não passa. Não cheguei a checar se o PDF tem camada
   de texto tabular, o que mudaria o custo de um parser. **Item em aberto.**
2. **`dados.gov.br` exige chave.** `GET /api/publico/conjuntos-dados?nomeConjuntoDados=veicular`
   e `GET /api/3/action/package_search?q=PBE+veicular`
   → **HTTP 401** nos dois. Se existe PBEV estruturado publicado lá, não dá para
   saber sem credencial. **Item em aberto, e é o de maior valor da lista** —
   uma chave de dados.gov.br é grátis e resolveria a pergunta.

A decisão de **não fazer pipeline de PDF do INMETRO continua valendo**, agora
com a evidência de que nem o download automatizado passa.

### APIs FIPE brasileiras alternativas — todas só preço

`fipe.api.br` (mesmo operador da parallelum; é para lá que o 402 da v2 aponta),
`apifipe.com.br`, `fipeapi.com.br`. Verificado: `fipe.api.br/api/v1/carros/marcas`
devolve exatamente a mesma lista da parallelum. **Nenhuma tem ficha
técnica** — são todas a mesma tabela de preço com embalagens diferentes.

`apiplacas.com.br` responde HTTP 403 a cliente não-browser (Cloudflare) e é
**chaveada por placa**, o que a elimina de saída: metade da Garagem é carro que
a pessoa ainda quer comprar e não tem placa. `api.invertexto.com/v1/fipe/*`
exige token (HTTP 401 `{"message":"Unauthenticated."}`) e também é só preço.

## Conclusão para o Brian e para a Xuria

**Para o Brian:** nenhuma das quatro serve. A seção "Ficha técnica" não tem
fonte de dados viável hoje via API paga internacional. As opções reais são
(a) adiar a seção, (b) montar base própria a partir do vocabulário FIPE que já
temos, começando pelos ~50 modelos mais frequentes na Garagem, ou (c) exibir só
o que a FIPE já dá (marca, versão, ano, combustível, valor) e chamar de "Dados
do veículo" em vez de "Ficha técnica", sem prometer o que não há.

A string da FIPE já carrega mais do que parece: `"ONIX HATCH 1.0 12V TB Flex 5p
Aut."` contém motor (1.0), válvulas (12V), aspiração (TB), combustível (Flex),
carroceria (5p) e câmbio (Aut.). Um parser dessa nomenclatura extrai 6 campos de
ficha técnica **sem nenhuma API externa**, e é a coisa de melhor custo-benefício
nesta investigação inteira. Falta o que não está na string: torque, dimensões,
peso, porta-malas, 0-100.

**Para a Xuria:** nada aqui muda uma constante. Nenhuma das quatro APIs tem
consumo de carro brasileiro; as que têm consumo têm EPA (CarAPI, mpg) ou ciclo
europeu (Car2DB, l/100 km), e o Car2DB nem modela flex. **O `consumption.js`
continua sem substituto**, e o caminho segue sendo o PBEV — bloqueado em PDF,
com a chave do `dados.gov.br` como única pista não esgotada.

**Não fazer:** assinar qualquer uma das quatro; migrar a FIPE da v1 para a v2;
trocar consumo INMETRO por EPA ou por ciclo europeu "porque é o que tem".

**Fazer agora, barato:** persistir `codigoFipe`, `codigoMarca`, `codigoModelo` e
`codigoAno` no submit do `ModalNewCar.jsx`. Sem isso, qualquer fonte de ficha
técnica futura vai depender de casar string, e com isso vira `join` por chave.

## Licenciamento por UF — levantado em 06/10/2026

Pesquisa estado por estado (três rodadas do Han em paralelo), só fonte oficial.
A tabela anterior era aproximação sem fonte e errava feio: **MG 161 → 35,62**,
**GO 128 → 274,60**, **PA 120 → 300,93**, **RO 125 → 230,25**, **TO 118 → 79,63**.
Os valores e a fonte de cada um estão comentados linha a linha em
`LICENSING_BR` (`engine/src/services/ownership.js`).

**Conferidos (21):** AC, AM, BA, CE, DF, ES, GO, MA, MG, MS, MT, PA, PB, PR,
RO, RR, RS, SC, SE, SP, TO. Ressalvas:

- AC, MA, MT e TO: página oficial atual, mas sem o ano escrito. TO está igual
  desde 2022; MA igual a 2025; AC bate com reajuste pelo IGP-M.
- ES é conta, não valor publicado: 48 VRTE (Lei 7.001/2001) × VRTE 2026. Um
  boleto real confirmaria. Os R$ 168,40 que circulam são de antes de 2024.
- MS (UFERMS), SE (UFP-SE) e PB (UFR-PB) cobram em unidade fiscal **mensal**: o
  número guardado é o de out/2026. Em PB, as 0,45 UFR de bombeiros estão na
  tabela do DETRAN-PB, mas não achei confirmação de 2026.
- AM: valor a partir de 01/04/2026; quem pagou antes pagou um valor anterior.
- GO: a taxa é **parcelada junto com o IPVA** (Portaria DETRAN/GO 907/2025). Por
  isso a frase genérica da tela não diz mais "paga uma vez por ano".
- RR: o `pdftotext -layout` desloca a coluna e devolve 68,92; o certo, por
  coordenada e imagem, é 172,30.

**Sem fonte oficial de 2026 (6), marcados como aproximados na tela:**

- RJ 293,71 — só imprensa (209,78 + 83,93 do CRLV-e). A tabela de DUDAs do
  DETRAN-RJ não tem a linha; o portal da SEFAZ-RJ bloqueia por IP.
- AL 223,38 — tabela oficial de **2025**. A UPFAL 2026 não foi achada; o widget
  da SEFAZ-AL está parado em 2023.
- RN 90 — página do DETRAN-RN fora do ar (503) na consulta; imprensa diz "desde
  2018".
- PE — a lei fixa em UFIR (extinta); nenhum ato de 2026 em reais. Os agregadores
  (119,42 / 120 / 138,98 / 158) não batem entre si.
- PI — `taxas.detran.pi.gov.br` recusa conexão; 40 UFR-PI pela Lei 6.441/2013,
  UFR de 2026 não achada.
- AP — a lei de taxas do DETRAN-AP não foi achada; o portal carrega por JS.

**Becos sem saída:** agregadores (ecarts, consultadeplaca, garagem360) erraram
PA, AM, SE, PE, AL, ES, RJ e GO nesta rodada — servem só como lista de suspeitos.
A tabela "oficial" do DETRAN-PB está em reais de 2018/19 (só a quantidade de UFR
serve). DETRAN-MT e DETRAN-SE derrubam cliente sem user-agent de navegador.
