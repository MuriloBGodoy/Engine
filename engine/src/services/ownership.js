// Motor de "custo real de posse" (TCO) do Engine.
//
// Estima quanto custa POR MÊS comprar e manter um veículo e quanto de renda
// mensal o usuário precisa para isso, combinando:
//   - IPVA/licenciamento por UF (Brasil, tabela 2026) ou imposto de circulação
//     equivalente por país;
//   - seguro estimado por faixa etária do condutor (referência SUSEP: jovens de
//     18-25 pagam ~9,5% do valor do carro/ano; 56+ pagam ~4,4%), região,
//     garagem e tipo de cobertura;
//   - combustível (médias ANP jul/2026, ajustadas por UF) × consumo × km/mês;
//   - manutenção preventiva/corretiva por idade do carro e rodagem;
//   - financiamento (tabela Price) com entrada, prazo e juros médios de mercado;
//   - depreciação (custo "invisível", informativo);
//   - regra de comprometimento de renda (padrão: custo total ≤ 20% da renda).
//
// Todos os valores são ESTIMATIVAS de planejamento, não cotações.

// ---------------------------------------------------------------------------
// Brasil — dados por UF
// ---------------------------------------------------------------------------

// Alíquota de IPVA para automóveis de passeio (2026).
//
// Simplificação conhecida: a lei real é uma matriz UF × cilindrada ×
// combustível, e aqui só cabe um escalar por UF. Onde o estado escalona por
// cilindrada, fica a alíquota da faixa MAIOR — errar para cima é o lado que
// não coloca ninguém num financiamento que não paga.
//
// AM: 2,0% acima de 1.000 cc e 1,5% até 1.000 cc / elétrico e híbrido
// (LC estadual 280/2025, em vigor desde 2026; era 4% e 3%).
// PR: 1,9% (Lei 22.645/2025) — conferido na Fazenda estadual, está correto.
// MT: 3,0% para passeio acima de 1.000 cc (Portaria SEFAZ-MT 196/2025, art. 2º,
// VII, DOE Extra de 23/12/2025; 2% até 1.000 cc). Era 3,45% aqui, que é a
// alíquota de utilitários de GOIÁS — provável contaminação entre UFs vizinhas.
// GO: 3,75% para automóvel acima de 100 cv (Secretaria da Economia/GO) — certo.
// PE: 2,4% — Lei 10.849/92, art. 12-B, III, desde 01/01/2024; a SEFAZ-PE
// anunciou o IPVA 2026 com a alíquota mantida. Era 3% aqui, 25% a mais.
//
// SP: 4% para automóvel de passeio, INCLUSIVE FLEX E 100% ELÉTRICO. Conferido
// no texto consolidado da Lei 13.296/2008 em 14/08/2026, porque a hipótese
// contrária é convidativa e volta sempre. Art. 9º, III (redação da Lei
// 17.473/2021, efeitos desde 1º/01/2022): "4% para qualquer veículo automotor
// não incluído nos incisos I e II". A faixa de 3% para álcool/GNV/eletricidade
// foi REVOGADA pela Lei 17.293/2020 — e mesmo antes exigia motor
// "exclusivamente" a álcool, que flex nunca cumpriu. Só escapam locadora (1%,
// § 1º) e GNV adaptado em carro fabricado até 31/12/2008 (3%, § 3º).
//
// Híbrido flex em SP tem regime próprio, com prazo — ver SP_FLEX_HYBRID.
// O 100% elétrico NÃO entra nele: o dispositivo cobre hidrogênio exclusivo ou
// híbrido COM motor a combustão, e um BEV não é nenhum dos dois. É por isso que
// SP fica fora de IPVA_BR_ELECTRIC.
//
// MS, PI e BA — os três "suspeitos de erro para baixo" foram conferidos em
// 17/08/2026 e o escalar de cada um está CERTO para o caso modal (automóvel de
// passeio, flex ou gasolina, usado). O que a calculadora comercial estava
// enxergando não era uma alíquota maior escondida, era uma segunda dimensão da
// lei que um escalar não carrega — e as três dimensões o motor conhece:
//   MS 3,0% é a alíquota de USADO (5% nominal com redução de 40%, Decreto
//      16.693/2025, vigência 01/01/2026). Diesel de passeio é outra linha.
//   BA 2,5% vale para "outros combustíveis"; óleo diesel é 3,0%.
//   PI 2,5% vale até R$ 150.000 de valor venal; acima disso é 3,0%.
// Ver IPVA_BR_DIESEL, IPVA_BR_VALUE_BRACKET e IPVA_BR_ELECTRIC_EXEMPT_MAX.
const IPVA_BR = {
  AC: 0.02, AL: 0.0325, AP: 0.03, AM: 0.02, BA: 0.025, CE: 0.03, DF: 0.035,
  ES: 0.02, GO: 0.0375, MA: 0.025, MT: 0.03, MS: 0.03, MG: 0.04, PA: 0.025,
  PB: 0.025, PR: 0.019, PE: 0.024, PI: 0.025, RJ: 0.04, RN: 0.03, RS: 0.03,
  RO: 0.03, RR: 0.03, SC: 0.02, SP: 0.04, SE: 0.025, TO: 0.02,
};
const IPVA_BR_DEFAULT = 0.03;

// Idade a partir da qual não se paga IPVA.
//
// Piso NACIONAL: a EC 137/2025 acrescentou a alínea "e" ao art. 155, § 6º, III
// da Constituição e tornou IMUNE ao IPVA o "veículo terrestre de passageiros,
// caminhonete e misto com 20 (vinte) anos ou mais de fabricação". Promulgada em
// 09/12/2025, em vigor desde a publicação. É imunidade, não isenção: o estado
// perdeu competência, então não existe UF onde não valha.
//
// O mapa abaixo só tem UF que isenta ANTES dos 20 e foi confirmada em fonte
// primária. Ausência significa "não conferido", não "não isenta" — e cair no
// piso de 20 cobra imposto de quem talvez não deva, que é o lado do erro que
// este motor já escolheu em todo o resto.
//
// Fronteira em disputa: no exercício em que o carro completa exatamente 20
// anos, o fisco paulista cobrou alegando fato gerador em 1º de janeiro, e foi
// afastado em 1ª instância (proc. 1001145-07.2026.8.26.0053). Aqui vale o texto
// constitucional, que diz "20 anos OU MAIS".
//
// Ressalva estrutural: a norma fala em ano de FABRICAÇÃO e a FIPE só dá o
// ano-MODELO, que é igual ou um ano maior. O motor enxerga o carro até um ano
// mais novo e atrasa a isenção — de novo, errando para cima.
const IPVA_BR_EXEMPT_AGE_DEFAULT = 20;
//
// Regra de conversão, a mesma em todas as linhas: "N anos ou mais" vira N;
// "mais de N anos" vira N+1; e onde a lei só começa a contar no ano SEGUINTE ao
// da fabricação ou do registro, soma-se mais 1. Onde a prática publicada pela
// fazenda ("em 2026 ficam isentos os fabricados até X") dava um número diferente
// da leitura literal, ficou o MAIOR dos dois.
//
// Conferido em 06/10/2026, lei ou página oficial do governo em cada linha:
//   - UFs que NÃO isentam antes dos 20 e por isso ficam fora, de propósito: TO
//     (a própria SEFAZ-TO noticia "veículos com 15 ou mais anos de fabricação
//     devem pagar IPVA", o contrário do que as listas da imprensa dizem), PE
//     (SEFAZ-PE: isenção só a partir dos 20, pela EC 137) e MG (SEF-MG, idem).
//   - As listas de imprensa de 2026 erram várias linhas (GO "10 anos", TO "15")
//     e não servem de fonte.
const IPVA_BR_EXEMPT_AGE = {
  // "mais de 10 anos, contados do ano seguinte à data de sua fabricação" —
  // Decreto 258/2004, art. 4º, § 2º, I. É um decreto de 2004; a imprensa de
  // 2026 confirma a regra de 10 anos, mas a consolidação vigente não foi achada.
  AP: 12,
  // "mais de 15 anos de fabricação" — SEFAZ-AM: "a partir do décimo sexto ano"
  AM: 16,
  // "mais de 15 anos de fabricação" — Lei 6.348/91 (redação da Lei 9.837/2005),
  // lista de isenções da SEFAZ-BA reproduzida pelo DETRAN-BA
  BA: 16,
  // "veículos de uso rodoviário com mais de 15 anos de fabricação" — Lei
  // 12.023/92, art. 4º, VIII, na página de isenções da SEFAZ-CE. Há indicação
  // de 2026 na Assembleia para baixar a 10; não é lei.
  CE: 16,
  // "veículos com tempo de uso superior a 15 anos" — RIPVA-DF, Decreto
  // 34.024/2012, isenções, VIII (a Lei 7.431/85 delega ao governador)
  DF: 16,
  // "veículos automotores terrestres com mais de 15 anos de fabricação" — Lei
  // 6.999/2001, art. 6º, I, "e", consolidada da SEFAZ-ES
  ES: 16,
  GO: 15, // "15 anos ou mais de uso" — Lei 11.651/91; FAQ da Secretaria da Economia/GO
  // "a partir do 16º ano de fabricação" — Lei 7.799/2002, DETRAN-MA
  MA: 16,
  MT: 18, // Lei 10.252/2017, que altera a 7.301/2000 — portal da ALMT, falta o texto da lei
  // "veículos rodoviários com mais de 15 anos de fabricação" — SEFA-PA
  PA: 16,
  // "15 anos completos do ano de fabricação"; em 2026, fabricados até 2010 —
  // SEFAZ-PB e DETRAN-PB
  PB: 16,
  // "mais de 15 anos de fabricação", isenção automática — Governo do Piauí
  PI: 16,
  RJ: 16, // "mais de 15 anos" — Lei 2.877/97, art. 5º, VII; SEFAZ-RJ isenta 2010 e anteriores
  // "veículos rodoviários com mais de 10 anos de fabricação, contados a partir
  // do primeiro mês do exercício seguinte ao do registro" — Lei 6.967/96, art.
  // 8º, IV, na página da SEFAZ-RN. Não revogado pela Lei 12.026/2024, que
  // mexeu no mesmo art. 8º (incisos I e XI).
  RN: 12,
  // "15 anos ou mais de uso" — Lei 950/2000, art. de isenções, X (consolidada
  // da SEFIN-RO). A SEFIN isentou em 2024 os fabricados ANTES de 2009, ou seja,
  // 16 anos; fica a prática, que é a maior.
  RO: 16,
  // "mais de 10 anos de fabricação" — Lei 59/93, art. 97, § 3º; em 2024 a
  // SEFAZ-RR cobrou só dos fabricados de 2014 em diante. Lido em busca restrita
  // ao domínio da SEFAZ-RR; a página em si não abriu.
  RR: 11,
  // "mais de 15 anos de fabricação completos" — Governo de Sergipe
  SE: 16,
};

// Alíquota reduzida para elétrico e híbrido, SÓ onde a redução foi confirmada
// em fonte primária. Ausência aqui não significa que o estado não reduza —
// significa que ainda não foi conferido, e o padrão fica na alíquota cheia.
const IPVA_BR_ELECTRIC = {
  AM: 0.015,
};

// Isenção de 100% elétrico condicionada ao valor do veículo (teto em BRL).
// Acima do teto o carro volta para a alíquota normal da UF.
//
// BA: "Os veículos 100% elétricos de até R$ 300.000,00" estão na lista de
// isenções da página oficial de IPVA da SEFAZ-BA (Lei 14.638/2023, efeitos
// desde 01/01/2024). Acima de R$ 300 mil a Lei 6.348/91 mantém 2,5%, que é
// justamente o IPVA_BR.BA — por isso não precisa de entrada em IPVA_BR_ELECTRIC.
// Conferido em 17/08/2026.
const IPVA_BR_ELECTRIC_EXEMPT_MAX = {
  BA: 300000,
};

// Alíquota de automóvel de passeio a ÓLEO DIESEL, onde a lei estadual separa o
// diesel dos demais combustíveis. Este é o lado do erro que o motor não pode
// ter: sem esta tabela, uma picape a diesel na Bahia ou em MS era cobrada pela
// alíquota do carro a gasolina, ou seja, PARA BAIXO.
//
// BA: 3,0% "para automóveis e utilitários movidos a óleo diesel", contra 2,5%
// para os demais — Lei 6.348/91, art. 6º, I, reproduzido na página de
// informações de IPVA da SEFAZ-BA (conferido em 17/08/2026).
// MS: 4,5% para automóvel de passeio a óleo diesel com capacidade até oito
// pessoas — alíquota nominal de 6% com redução de 25% para USADO, tabela de
// alíquotas da SEFAZ-MS para o exercício 2026 (Lei 1.810/97 e Decreto
// 16.693/2025). Fica a de usado pelo mesmo motivo que o 3,0% de passeio: é a
// que o carro paga em todo ano que não seja o da primeira tributação.
//
// Ausência aqui significa "não conferido", não "não separa diesel".
const IPVA_BR_DIESEL = {
  BA: 0.03,
  MS: 0.045,
};

// UFs que escalonam a alíquota por VALOR do veículo. `above` é a alíquota
// aplicada acima de `threshold` (em BRL); abaixo vale o escalar de IPVA_BR.
//
// PI: 2,5% até R$ 150.000 de valor venal e 3,0% acima — Lei 4.548/92, art. 14,
// IV "a" e VI "a", na redação da Lei 6.749/2015 (efeitos desde 01/01/2016).
// Texto conferido no PDF da lei sancionada, no SAPL da Assembleia Legislativa
// do Piauí, em 17/08/2026; a Lei 8.558/2024, que também altera o art. 14, mexeu
// só no inciso de aeronaves. O PDF consolidado que a SEFAZ-PI publica está
// congelado em 2011 e NÃO contém esta redação — não usar como fonte.
const IPVA_BR_VALUE_BRACKET = {
  PI: { threshold: 150000, above: 0.03 },
};

// SP — híbrido com motor a combustão que aceita etanol, de valor até o teto.
//
// Lei 13.296/2008, Disposições Transitórias art. 5º, acrescido pela Lei
// 18.065/2024 (texto conferido na ALESP em 06/10/2026): ISENTO em 2025 e 2026,
// depois 1% em 2027, 2% em 2028, 3% em 2029 e a alíquota cheia de 2030 em
// diante. O teto de R$ 250.000 é corrigido por IPCA todo ano; para 2026 a
// SEFAZ-SP publicou R$ 261.154,45. Para 2027 em diante o teto corrigido ainda
// não existe, e fica o de 2026 — menor que o futuro, então erra para cima.
//
// A Portaria SRE-94/24 exige motor elétrico de 40 kW ou mais e tensão de 150 V
// ou mais. Isso tira o híbrido leve (os "Hybrid"/"Bio-Hybrid" de 12 V e 48 V da
// Stellantis), e a exigência de etanol tira o híbrido só a gasolina (Camry,
// Prius, RAV4, BYD DM-i, Haval). A SEFAZ aplica a isenção sozinha, e os modelos
// que a imprensa relata recebendo são Corolla, Corolla Cross e Yaris Cross
// híbridos — todos Toyota flex fabricados em SP.
//
// Por isso a regra é uma LISTA, e não "o nome diz híbrido": o nome da FIPE não
// separa híbrido leve de pleno nem flex de gasolina (`YARIS Cross XRE 1.5 16V
// 5p Aut. (Híbrido)` não escreve Flex), e isentar pelo marcador daria IPVA zero
// a um Pulse Hybrid, que paga 4%. Modelo fora da lista paga a alíquota cheia,
// que é o lado do erro que este motor escolhe em todo o resto.
const SP_FLEX_HYBRID = {
  valueCap: 261154.45,
  // Exercício -> alíquota. Ausente = alíquota normal da UF.
  rateByYear: { 2025: 0, 2026: 0, 2027: 0.01, 2028: 0.02, 2029: 0.03 },
  // Nomes como a FIPE grava: `Corolla Altis 1.8 16V Aut. (Híbrido)`,
  // `Corolla Cross XRX 1.8 16V Aut. (Híbrido)`, `YARIS Cross XRE 1.5 ...`.
  models: /^\s*(COROLLA|YARIS\s+CROSS)\b/i,
  brand: /^\s*TOYOTA\b/i,
};
const HYBRID_NAME = /\(H[IÍ]BRIDO\)|\bH[IÍ]BRID[OA]\b|\bHYBRID\b|\bHEV\b/i;

const isSpFlexHybrid = (car) => {
  const model = String(car?.model || "");
  return (
    SP_FLEX_HYBRID.brand.test(String(car?.brand || "")) &&
    SP_FLEX_HYBRID.models.test(model) &&
    HYBRID_NAME.test(model)
  );
};

// Alíquota efetiva de IPVA de um automóvel de passeio, na ordem em que as
// regras se sobrepõem: isenção de elétrico, alíquota de elétrico, alíquota de
// diesel, faixa por valor, escalar da UF.
const ipvaRateBR = (state, fuelType, value) => {
  if (fuelType === "electric") {
    const exemptMax = IPVA_BR_ELECTRIC_EXEMPT_MAX[state];
    if (exemptMax !== undefined && value <= exemptMax) return 0;
    const reduced = IPVA_BR_ELECTRIC[state];
    if (reduced !== undefined) return reduced;
  }
  if (fuelType === "diesel") {
    const diesel = IPVA_BR_DIESEL[state];
    if (diesel !== undefined) return diesel;
  }
  const bracket = IPVA_BR_VALUE_BRACKET[state];
  if (bracket && value > bracket.threshold) return bracket.above;
  return IPVA_BR[state] ?? IPVA_BR_DEFAULT;
};

// Taxa anual de licenciamento (CRLV) aproximada por UF, em BRL.
//
// Cada UF indexa a uma unidade fiscal própria (SP à UFESP, RS à UPF/RS, RJ à
// UFIR-RJ) e republica portaria em janeiro — a tabela inteira apodrece em bloco
// todo começo de ano. Conferidos em fonte primária no exercício 2026:
//   SP 174,08 — carta de serviço do Governo de SP, base Lei 15.266/2013
//   RS 114,09 — Portaria DETRAN/RS 036/2026, código 7714
// O RJ segue em 231 por falta de fonte: a tabela de DUDAs do DETRAN-RJ publica
// transferência e 2ª via, mas não a linha do licenciamento anual.
const LICENSING_BR = {
  SP: 174, MG: 161, RJ: 231, RS: 114, PR: 107, SC: 138, ES: 127, BA: 132,
  PE: 122, CE: 127, DF: 145, GO: 128, MT: 150, MS: 140, PA: 120, MA: 110,
  PB: 115, PI: 110, RN: 118, AL: 115, SE: 112, AM: 130, AC: 120, AP: 115,
  RO: 125, RR: 115, TO: 118,
};
const LICENSING_BR_DEFAULT = 140;

// Fator de preço de combustível por UF sobre a média nacional.
//
// Medidos no CSV semanal da ANP em 14/08/2026 (coletas de 07 e 08/2026):
// 17.619 postos de gasolina e 14.989 de etanol, preço de bomba por município.
//
// Gasolina e etanol precisam de tabelas SEPARADAS, e essa é a correção que
// justifica o retrabalho: os dois têm formação de preço diferente — a gasolina
// segue frete e ICMS a partir da refinaria, o etanol segue distância da usina.
// Onde se planta cana o etanol é barato e a gasolina não é. Um fator só, como
// era antes, errava até 13,6 p.p.:
//
//   UF   fator gasolina   fator etanol
//   SP        0,97            0,86     ← maior produtor: etanol estruturalmente barato
//   RS        0,96            1,09
//   SC        0,99            1,07
//   RJ        1,01            1,12
//   MT        1,03            0,87
//
// Em SP o etanol saía 12% mais caro do que é — R$ 93/mês a mais na maior linha
// do orçamento de quem roda a álcool.
const FUEL_FACTOR_BR = {
  AC: 1.12, AL: 1.05, AM: 1.13, AP: 0.99, BA: 1.07, CE: 1.05, DF: 0.97,
  ES: 1.0, GO: 1.01, MA: 1.05, MG: 0.96, MS: 1.0, MT: 1.03, PA: 1.03,
  PB: 0.99, PE: 1.05, PI: 1.04, PR: 1.0, RJ: 1.01, RN: 1.04, RO: 1.11,
  RR: 1.15, RS: 0.96, SC: 0.99, SE: 1.07, SP: 0.97, TO: 1.07,
};

// O AP fica de fora: só 3 postos de etanol na amostra, que não sustenta média.
// Sem entrada aqui, cai em 1 — a média nacional, que é o chute honesto.
const FUEL_FACTOR_BR_ETHANOL = {
  AC: 1.2, AL: 1.2, AM: 1.17, BA: 1.11, CE: 1.21, DF: 0.96, ES: 1.1,
  GO: 0.97, MA: 1.24, MG: 0.94, MS: 0.94, MT: 0.87, PA: 1.16, PB: 1.13,
  PE: 1.19, PI: 1.14, PR: 0.97, RJ: 1.12, RN: 1.27, RO: 1.25, RR: 1.26,
  RS: 1.09, SC: 1.07, SE: 1.26, SP: 0.86, TO: 1.17,
};

// Fator regional de risco do seguro (roubo/furto/sinistralidade).
const INSURANCE_REGION_BR = {
  RJ: 1.3, SP: 1.15, PE: 1.12, RS: 1.1, BA: 1.08, DF: 1.05, AM: 1.05,
  CE: 1.05, PA: 1.05, GO: 1.02, MG: 1.0, PR: 1.0, ES: 1.0, SC: 0.92,
};

// Preços médios de combustível no Brasil, BRL por litro/kWh.
//
// Gasolina e etanol medidos no CSV da ANP em 14/08/2026, mesma amostra dos
// fatores acima. A gasolina estava certa (6,61 contra 6,594 medido); o etanol
// estava 4,8% alto.
//
// O diesel NÃO vem dessa medição: o CSV de "últimas 4 semanas" da ANP só traz
// gasolina, gasolina aditivada e etanol. O valor segue sendo o de jul/2026 e
// não foi reconferido — o mesmo vale para o kWh, que é tarifa residencial e
// nem sequer é publicada pela ANP.
const FUEL_PRICE_BR = {
  gasoline: 6.59,
  ethanol: 4.28,
  diesel: 6.3,
  electric: 0.85, // BRL por kWh (tarifa residencial média com impostos)
};

// ---------------------------------------------------------------------------
// Outros países — perfis genéricos (estimativas convertidas para BRL)
// ---------------------------------------------------------------------------
// taxPct: imposto anual de circulação/propriedade como % do valor do veículo.
// registrationFlat: taxa anual fixa de registro/vistoria (BRL).
// insuranceFactor: multiplicador sobre a curva etária brasileira.
// maintenanceFactor: custo de mão de obra/peças relativo ao Brasil.
// fuelPrice: BRL/L equivalente (gasolina); electric em BRL/kWh.
// monthlyRate: juros médios de financiamento ao mês.
const COUNTRY_PROFILES = {
  BR: { taxPct: null, registrationFlat: null, insuranceFactor: 1, maintenanceFactor: 1, fuelPrice: FUEL_PRICE_BR, monthlyRate: 0.0199 },
  PT: { taxPct: 0.006, registrationFlat: 250, insuranceFactor: 0.55, maintenanceFactor: 1.25, fuelPrice: { gasoline: 10.5, ethanol: 10.5, diesel: 9.6, electric: 1.4 }, monthlyRate: 0.006 },
  US: { taxPct: 0.01, registrationFlat: 400, insuranceFactor: 1.1, maintenanceFactor: 1.3, fuelPrice: { gasoline: 4.8, ethanol: 4.2, diesel: 5.2, electric: 0.9 }, monthlyRate: 0.0065 },
  ES: { taxPct: 0.005, registrationFlat: 300, insuranceFactor: 0.5, maintenanceFactor: 1.2, fuelPrice: { gasoline: 9.3, ethanol: 9.3, diesel: 8.7, electric: 1.5 }, monthlyRate: 0.0065 },
  AR: { taxPct: 0.035, registrationFlat: 200, insuranceFactor: 1.0, maintenanceFactor: 0.9, fuelPrice: { gasoline: 6.5, ethanol: 6.0, diesel: 6.8, electric: 0.6 }, monthlyRate: 0.04 },
  MX: { taxPct: 0.003, registrationFlat: 220, insuranceFactor: 0.7, maintenanceFactor: 0.9, fuelPrice: { gasoline: 6.7, ethanol: 6.7, diesel: 7.0, electric: 0.7 }, monthlyRate: 0.0115 },
  CL: { taxPct: 0.015, registrationFlat: 180, insuranceFactor: 0.7, maintenanceFactor: 1.0, fuelPrice: { gasoline: 7.5, ethanol: 7.5, diesel: 6.9, electric: 1.0 }, monthlyRate: 0.01 },
  CO: { taxPct: 0.015, registrationFlat: 160, insuranceFactor: 0.8, maintenanceFactor: 0.85, fuelPrice: { gasoline: 4.5, ethanol: 4.5, diesel: 4.2, electric: 0.6 }, monthlyRate: 0.015 },
  GB: { taxPct: 0.004, registrationFlat: 1300, insuranceFactor: 1.0, maintenanceFactor: 1.35, fuelPrice: { gasoline: 10.3, ethanol: 10.3, diesel: 10.7, electric: 1.8 }, monthlyRate: 0.0075 },
  FR: { taxPct: 0.001, registrationFlat: 250, insuranceFactor: 0.6, maintenanceFactor: 1.3, fuelPrice: { gasoline: 11.1, ethanol: 7.2, diesel: 10.6, electric: 1.4 }, monthlyRate: 0.005 },
  DE: { taxPct: 0.004, registrationFlat: 300, insuranceFactor: 0.7, maintenanceFactor: 1.35, fuelPrice: { gasoline: 10.5, ethanol: 9.0, diesel: 9.9, electric: 2.2 }, monthlyRate: 0.005 },
  IT: { taxPct: 0.006, registrationFlat: 280, insuranceFactor: 0.85, maintenanceFactor: 1.25, fuelPrice: { gasoline: 10.8, ethanol: 10.8, diesel: 10.3, electric: 1.7 }, monthlyRate: 0.006 },
};

// ---------------------------------------------------------------------------
// Curvas de risco/uso
// ---------------------------------------------------------------------------

// % do valor do carro por ano em seguro completo, por faixa etária (SUSEP).
const INSURANCE_AGE_RATES = {
  "18-25": 0.095,
  "26-35": 0.065,
  "36-55": 0.055,
  "56+": 0.045,
};

const USAGE_INSURANCE_FACTOR = { personal: 1, commute: 1.08, app: 1.35 };

// Consumo padrão por combustível (km por litro; elétrico em km por kWh), para
// quando `consumption.js` não acha o carro na tabela do INMETRO.
//
// Quem cai aqui é, quase sempre, carro que a tabela de VEÍCULO NOVO não tem:
// modelo fora de linha, motor que saiu do catálogo. Ou seja, carro mais velho
// e menos eficiente que a frota nova. Logo o padrão não pode ser MELHOR que a
// mediana da frota nova — se for, ele promete a um Ducato 2.8 de 2010 um
// consumo que nem o diesel novo entrega, e a conta sai barata demais.
//
// Mediana medida sobre as 228 chaves de versão do PBE Veicular 2026
// (18/08/2026): gasolina 11,1 · etanol 8,8 · diesel 10,0. O teto foi aplicado
// onde o padrão o furava:
//   gasolina  11,5 -> 11,1
//   diesel    12,5 -> 10,0   (era 25% otimista, no sentido perigoso)
//   etanol     8,0 mantido — já é mais conservador que os 8,8 medidos, e a
//              razão 8,0/11,1 = 0,72 é a do poder calorífico, que é física.
// Elétrico continua sem fonte: o PBE publica km por litro equivalente e não
// declara a equivalência em kWh. Fica marcado como padrão grosseiro.
export const DEFAULT_CONSUMPTION = {
  gasoline: 11.1,
  ethanol: 8,
  diesel: 10,
  electric: 6, // sem fonte; ver consumption.js
};

// Situação de vida do usuário: define quanto da renda é saudável comprometer
// com o carro. Quem mora com os pais (quase sem contas fixas) pode ir mais
// longe; quem banca a casa inteira precisa de folga maior no orçamento.
export const LIFE_SITUATIONS = {
  with_family: { suggestedShare: 35, comfortable: 0.35, warning: 0.45 },
  shared: { suggestedShare: 20, comfortable: 0.2, warning: 0.3 },
  independent: { suggestedShare: 15, comfortable: 0.15, warning: 0.25 },
};

export const FUEL_TYPES = ["gasoline", "ethanol", "diesel", "electric"];
export const AGE_BANDS = Object.keys(INSURANCE_AGE_RATES);
export const COVERAGE_TYPES = ["full", "thirdparty", "none"];
export const USAGE_TYPES = Object.keys(USAGE_INSURANCE_FACTOR);
export const LIFE_SITUATION_TYPES = Object.keys(LIFE_SITUATIONS);

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// Extrai o ano-modelo do texto da FIPE ("2018 Gasolina", "32000" = zero km).
//
// As bordas de palavra são essenciais: sem elas o rótulo de zero km da FIPE,
// "32000", casava o "2000" no meio e o carro novo virava um carro de 26 anos —
// com depreciação quatro vezes menor, que é justamente o número que mais pesa
// para quem compra zero km. Sem casamento, o ano é o corrente, que é o certo
// tanto para o zero km quanto para um rótulo que não reconhecemos.
const parseCarYear = (yearLabel) => {
  const current = new Date().getFullYear();
  const match = String(yearLabel || "").match(/\b(19|20)\d{2}\b/);
  if (!match) return current;
  const year = Number(match[0]);
  return year > current + 1 ? current : year;
};

export const defaultOwnershipInputs = () => ({
  kmPerMonth: 1000,
  fuelType: "gasoline",
  consumption: 0, // 0 = usar padrão do combustível
  userConsumption: 0, // 0 = não informado, usar automático ou default
  driverAgeBand: "18-25",
  hasGarage: true,
  coverage: "full",
  usage: "personal",
  purchaseMode: "finance",
  downPaymentValue: 0, // 0 = usar savedValue do carro
  financeMonths: 48,
  monthlyRatePct: 0, // 0 = usar taxa média do país
  lifeSituation: "shared",
  incomeSharePct: 20,
  monthlyIncome: 0,
  parkingMonthly: 0,
  tollsMonthly: 0,
});

export const normalizeOwnershipInputs = (raw = {}) => {
  const base = defaultOwnershipInputs();
  return {
    kmPerMonth: clamp(num(raw.kmPerMonth, base.kmPerMonth), 100, 20000),
    fuelType: FUEL_TYPES.includes(raw.fuelType) ? raw.fuelType : base.fuelType,
    consumption: clamp(num(raw.consumption, 0), 0, 50),
    userConsumption: clamp(num(raw.userConsumption, 0), 0, 50), // Consumo informado pelo user
    driverAgeBand: AGE_BANDS.includes(raw.driverAgeBand)
      ? raw.driverAgeBand
      : base.driverAgeBand,
    hasGarage: raw.hasGarage !== false,
    coverage: COVERAGE_TYPES.includes(raw.coverage) ? raw.coverage : base.coverage,
    usage: USAGE_TYPES.includes(raw.usage) ? raw.usage : base.usage,
    purchaseMode: raw.purchaseMode === "cash" ? "cash" : "finance",
    downPaymentValue: clamp(num(raw.downPaymentValue, 0), 0, 100000000),
    financeMonths: clamp(Math.round(num(raw.financeMonths, base.financeMonths)), 6, 72),
    monthlyRatePct: clamp(num(raw.monthlyRatePct, 0), 0, 15),
    lifeSituation: LIFE_SITUATION_TYPES.includes(raw.lifeSituation)
      ? raw.lifeSituation
      : base.lifeSituation,
    // Até 100: comprometer a renda inteira é péssima ideia, mas é uma escolha
    // que existe, e travar em 60 fazia o simulador mentir sobre a conta de quem
    // já vive assim. O aviso é papel do veredito, não do clamp.
    incomeSharePct: clamp(
      Math.round(num(raw.incomeSharePct, base.incomeSharePct)),
      1,
      100,
    ),
    monthlyIncome: clamp(num(raw.monthlyIncome, 0), 0, 100000000),
    parkingMonthly: clamp(num(raw.parkingMonthly, 0), 0, 1000000),
    tollsMonthly: clamp(num(raw.tollsMonthly, 0), 0, 1000000),
  };
};

const countryProfile = (country) => COUNTRY_PROFILES[country] || COUNTRY_PROFILES.BR;

// ---------------------------------------------------------------------------
// Blocos de cálculo
// ---------------------------------------------------------------------------

// Aproximações conhecidas, nenhuma modelável com o que o simulador sabe hoje.
// A 2 e a 3 erram para cima; a 1 foi medida e erra para os dois lados, pouco:
//
// 1. A base de cálculo não é a FIPE. Em SP (Lei 13.296/2008, art. 7º, §§ 1º-2º)
//    é tabela própria da SEFAZ, publicada por resolução e congelada nos preços
//    médios de SETEMBRO do ano anterior — 4 a 15 meses de defasagem contra a
//    FIPE do mês corrente, que é o `car.targetValue` que entra aqui. Em mercado
//    de usado em alta a base tende a ser menor que a FIPE, então o imposto
//    sairia superestimado. MEDIDO em 06/10/2026 (scripts/measure-sp-ipva-base.py,
//    Anexo I da SFP-40/25 inteiro contra a FIPE de outubro/2026, 295 pontos em
//    145 versões casadas por regra rígida): a base fica 4,3% ABAIXO da FIPE na
//    mediana, mas o sinal depende da idade — ano-modelo 2023-2025 +2,1% (a
//    base acima: aqui SUBestimamos), 2019-2022 −2,7%, 2015-2018 −5,4%,
//    2012-2014 −7,1%. É depreciação de um lado e usado velho valorizando no
//    nominal do outro. Na tela isso é ~R$ 7/mês num carro de R$ 100 mil novo e
//    ~R$ 8/mês no sentido contrário num de R$ 40 mil velho — pouco demais para
//    virar fator, e o fator apodreceria: o tamanho depende de quantos meses se
//    passaram desde setembro. Fica medido e anotado, não modelado.
// 2. Zero km paga PROPORCIONAL aos meses restantes do ano (art. 11). Aqui sai
//    sempre o ano cheio, porque o simulador não sabe o mês da compra — quem
//    compra em outubro paga 3/12 e a tela mostra 12/12.
// 3. Onde o estado tem alíquota de PRIMEIRA TRIBUTAÇÃO maior que a de usado, o
//    motor usa a de usado. Em MS é 5% no zero km (sobre a nota fiscal) contra
//    3% de usado. A de usado é a que o carro paga em todos os anos seguintes, e
//    é a única que dá para casar com o custo mensal recorrente que esta tela
//    mostra; cobrar 5% de ano cheio somaria dois erros para cima, porque a
//    aproximação 2 já ignora a proporcionalidade que quase sempre acompanha o
//    zero km. O 5% é custo de ENTRADA, e a tela ainda não tem essa linha.
//
// Devolve { annual, basis }, pelo mesmo motivo do seguro: um IPVA zero precisa
// dizer por que é zero, senão parece defeito.
//   "rate"              alíquota da UF
//   "age_exempt"        imune ou isento pela idade (`exemptAge` acompanha)
//   "sp_hybrid"         híbrido flex em SP, isento ou na escada até 2030
const annualVehicleTax = (car, value, country, state, fuelType, carAge, year) => {
  if (country === "BR") {
    // Imunidade por idade antes de qualquer alíquota: acima do limite não há
    // imposto a calcular. Ver IPVA_BR_EXEMPT_AGE.
    const exemptAge = IPVA_BR_EXEMPT_AGE[state] ?? IPVA_BR_EXEMPT_AGE_DEFAULT;
    if (carAge >= exemptAge) return { annual: 0, basis: "age_exempt", exemptAge };

    const hybridRate = SP_FLEX_HYBRID.rateByYear[year];
    if (
      state === "SP" &&
      hybridRate !== undefined &&
      value <= SP_FLEX_HYBRID.valueCap &&
      isSpFlexHybrid(car)
    ) {
      return { annual: value * hybridRate, basis: "sp_hybrid", rate: hybridRate };
    }

    return { annual: value * ipvaRateBR(state, fuelType, value), basis: "rate" };
  }
  const profile = countryProfile(country);
  return { annual: value * (profile.taxPct || 0), basis: "rate" };
};

const annualLicensing = (country, state) => {
  if (country === "BR") return LICENSING_BR[state] || LICENSING_BR_DEFAULT;
  return countryProfile(country).registrationFlat || 0;
};

// Cobertura só contra terceiros: pouco sensível ao valor do carro, mas muito
// sensível a quem dirige — responsabilidade civil é risco do condutor, não do
// veículo. Ignorar a idade fazia um motorista de 19 anos e um de 60 pagarem
// exatamente o mesmo.
//
// O fator sai da própria curva etária, normalizada pela faixa do meio, e é
// achatado pela raiz porque o prêmio de terceiros varia menos que o de casco.
// É um default grosseiro assumido: não conheço fonte que publique curva etária
// de RCF isolada.
//
// O piso de R$ 700/ano e o teto de R$ 2.200 continuam SEM FONTE, e foram
// procurados em 17/08/2026 por decomposição — o total não é publicado por
// ninguém, mas as partes poderiam ser. Só uma fechou, e fechou em zero: custo
// de emissão de apólice não é parcela a somar, porque cobrá-lo em separado do
// prêmio está vedado desde 01/01/2013, com vedação expressa em norma vigente
// para bilhete (Res. CNSP 413/2021, art. 6º). Sobra RCF + assistência 24h, e
// as duas frentes que poderiam precificá-las responderam não: o AUTOSEG da
// SUSEP voltou ao ar, mas as três tabelas da base são `arq_casco*` e não têm
// uma única linha de responsabilidade civil; o Open Insurance criou o campo
// `premiumRates` na v2 da API pública e todas as seguradoras que o servem
// preenchem com zero. Mapa completo em SIMULADOR-FONTES.md, seção 4.
//
// Como uma das parcelas que se supunha embutidas aqui era zero, o material
// levantado não sustenta subir o piso. Subir por precaução seria repetir o
// IPVA cobrado de carro imune: erra para cima, e errar para cima também tira
// da pessoa um carro que caberia no bolso dela.
const thirdPartyPremium = (value, inputs, countryFactor) => {
  const ageRatio = INSURANCE_AGE_RATES[inputs.driverAgeBand] / INSURANCE_AGE_RATES["36-55"];
  const ageFactor = clamp(Math.sqrt(ageRatio), 0.85, 1.35);
  return clamp(value * 0.015, 700, 2200) * ageFactor * countryFactor;
};

// Idade acima da qual a seguradora tradicional não vende mais CASCO no Brasil.
//
// Não é calibragem de preço, é disponibilidade de produto: acima do corte não
// existe apólice de cobertura completa para cotar, então responder um prêmio
// confiante é responder a pergunta errada. O que sobra de verdade é RCF/
// terceiros, proteção veicular associativa (que não é seguro e não é regulada
// pela SUSEP) ou nada.
//
// O critério do 20: a faixa de aceitação observada no mercado brasileiro é de
// 15 a 20 anos, com seguradoras parando em pontos diferentes dela. Cortar em 15
// apagaria a linha de carros que boa parte do mercado ainda aceita; cortar no
// TOPO da faixa faz o silêncio significar "nenhuma seguradora tradicional vende
// isto", que é uma afirmação que se sustenta. Entre 15 e 20 anos o número
// continua saindo e fica cada vez mais incerto — é o preço de não apagar
// informação que existe.
//
// Só vale para o Brasil: o teto de aceitação de outros mercados não foi
// conferido, e assumir que é o mesmo seria inventar regra.
const INSURANCE_FULL_COVERAGE_MAX_AGE = 20;

// Devolve { annual, basis }. `basis` é o que o número REALMENTE é, que nem
// sempre é o que a pessoa pediu — a tela precisa disso para rotular.
//   "none"              sem seguro
//   "thirdparty"        terceiros, porque foi o que se pediu
//   "full"              completo
//   "thirdparty_forced" pediram completo e não existe completo para esta idade
const annualInsurance = (value, carAge, inputs, country, state) => {
  if (inputs.coverage === "none") return { annual: 0, basis: "none" };

  const countryFactor = countryProfile(country).insuranceFactor;
  const thirdParty = thirdPartyPremium(value, inputs, countryFactor);

  if (inputs.coverage === "thirdparty") {
    return { annual: thirdParty, basis: "thirdparty" };
  }

  if (country === "BR" && carAge > INSURANCE_FULL_COVERAGE_MAX_AGE) {
    return { annual: thirdParty, basis: "thirdparty_forced" };
  }

  const ageRate = INSURANCE_AGE_RATES[inputs.driverAgeBand];
  const regionFactor =
    country === "BR" ? INSURANCE_REGION_BR[state] || 1 : 1;
  const garageFactor = inputs.hasGarage ? 0.88 : 1.12;
  const usageFactor = USAGE_INSURANCE_FACTOR[inputs.usage];
  const carAgeFactor = carAge > 10 ? 0.85 : 1;

  const annual =
    value * ageRate * regionFactor * garageFactor * usageFactor * carAgeFactor *
    countryFactor;
  // Os limites são de mercado brasileiro e precisam acompanhar o fator do
  // país: aplicados crus, o piso de 2,5% reintroduzia em Portugal e Espanha um
  // seguro 15–26% mais caro do que o próprio modelo acabara de dizer que era.
  const bounded = clamp(annual, value * 0.025 * countryFactor, value * 0.16 * countryFactor);

  // Completo nunca pode custar menos que só terceiros — completo CONTÉM
  // terceiros. Sem este piso, o piso relativo de 2,5% ia a zero junto com o
  // valor do carro e o modelo cruzava: abaixo de ~R$ 11 mil de FIPE ele dizia
  // que a cobertura completa saía mais barata que a de terceiros. Não era
  // calibragem ruim, era contradição interna — e bem na faixa de preço que o
  // público do Engine compra.
  //
  // Isto NÃO é o piso absoluto que o prêmio real tem: RCF e assistência 24h são
  // preço de serviço e não vão a zero junto com o FIPE. As outras duas parcelas
  // que este comentário listava saíram da conta em 17/08/2026, e nas duas o
  // motivo é documental, não calibragem. Emissão de apólice não existe como
  // cobrança separada do prêmio (vedada desde 01/01/2013; Res. CNSP 413/2021,
  // art. 6º, para bilhete). E o IOF não é piso, é multiplicador: 7,38% sobre o
  // prêmio pago (Decreto 6.306/2007, art. 22, § 1º, IV, redação do Decreto
  // 6.339/2008), conferido no texto consolidado em 17/08/2026 — as alterações
  // de IOF de 2025 pegaram crédito, câmbio e VGBL, e não "demais seguros".
  //
  // Consequência prática: o número que sai daqui fica DEFINIDO como prêmio
  // total, o que a pessoa paga, com o IOF dentro. É assim que a cotação chega
  // até ela e é contra isso que ela vai comparar. Isso é convenção declarada,
  // não medição: a curva continua sem fonte. O que a convenção evita é a
  // próxima calibragem entrar torta — estatística de seguradora costuma
  // reportar prêmio líquido, e prêmio líquido só entra aqui multiplicado por
  // 1,0738, senão a tela passa a mostrar 7,38% menos do que se paga.
  return { annual: Math.max(bounded, thirdParty), basis: "full" };
};

const monthlyFuel = (inputs, country, state) => {
  const prices = countryProfile(country).fuelPrice;
  const basePrice = prices[inputs.fuelType] || prices.gasoline;
  // O fator por UF é de frete e ICMS de combustível líquido; energia elétrica
  // tem outra formação de preço. Aplicá-lo ao elétrico cobrava 18% a mais de
  // um carro no Acre por um motivo que não existe na conta de luz.
  let stateFactor = 1;
  if (country === "BR" && inputs.fuelType !== "electric") {
    stateFactor =
      (inputs.fuelType === "ethanol"
        ? FUEL_FACTOR_BR_ETHANOL[state]
        : FUEL_FACTOR_BR[state]) || 1;
  }

  // Hierarquia: user informado > consumption > default
  let consumption = DEFAULT_CONSUMPTION[inputs.fuelType];
  if (inputs.consumption > 0) {
    consumption = inputs.consumption;
  }
  if (inputs.userConsumption > 0) {
    consumption = inputs.userConsumption; // User sempre sobrescreve
  }

  return (inputs.kmPerMonth / consumption) * basePrice * stateFactor;
};

const annualMaintenance = (value, carAge, inputs, country) => {
  // Cobre revisões, óleo, pneus, freios e uma margem para corretivas.
  // Alinhado com AAA 2025: carros novos (0-3 anos) custam menos, aumenta gradualmente.
  const agePct = carAge <= 3 ? 0.015 : carAge <= 8 ? 0.025 : 0.04;
  const kmFactor = clamp(0.7 + 0.3 * (inputs.kmPerMonth / 1000), 0.7, 2.2);
  const base = Math.max(value * agePct, 1200);
  return base * kmFactor * countryProfile(country).maintenanceFactor;
};

// Calibrada em 13/08/2026 contra a própria FIPE: 90 pares de anos-modelo
// consecutivos, 21 modelos, do Mobi ao Classe C, tabela de agosto/2026.
//
// A curva anterior (16/12/10/8/6/4) era o padrão americano — despencava no
// primeiro ano e achatava. O mercado brasileiro é muito mais plano: carro
// usado aqui segura valor, e a queda medida fica entre 4% e 10% do começo ao
// fim. O erro chegava a 6 p.p. por ano na ponta jovem.
//
//   idade   mediana real   código antigo
//   1        9,7%           16%
//   2        6,2%           12%
//   3        7,4%           10%
//   4-5      4,9%            8%
//   6-8      3,9%            6%
//   9+       3,9% (média 5,2%)  4%
//
// Depois do 1º ano fica no piso de 5%: a mediana de 9+ anos é 3,9%, mas a
// média é 5,2% e as idades de 12 a 15 anos medem 6% a 9% — carro muito velho
// volta a cair rápido. Subestimar depreciação faz o carro parecer mais barato
// do que é, que é o erro que este simulador não pode cometer.
//
// Ressalva: é corte transversal de uma tabela só, não série temporal. Mede o
// que um ano a mais de idade custa HOJE, que é o certo para planejamento, mas
// não separa depreciação de efeito de safra.
const annualDepreciationRate = (carAge) => {
  if (carAge <= 1) return 0.10;
  if (carAge <= 3) return 0.07;
  if (carAge <= 5) return 0.055;
  if (carAge <= 8) return 0.05;
  return 0.055;
};

// Parcela pela tabela Price.
const priceInstallment = (principal, monthlyRate, months) => {
  if (principal <= 0 || months <= 0) return 0;
  if (monthlyRate <= 0) return principal / months;
  const factor = Math.pow(1 + monthlyRate, -months);
  return (principal * monthlyRate) / (1 - factor);
};

// ---------------------------------------------------------------------------
// Estimativa completa
// ---------------------------------------------------------------------------

/**
 * Campos que o modo Padrão não pergunta, e o que cada um pode plausivelmente
 * ser. É daqui que sai a largura da faixa: em vez de fingir que o valor
 * assumido é o certo, o motor roda todos os cenários possíveis e mostra o
 * intervalo em que a resposta cai.
 *
 * `usage: "app"` fica de fora de propósito. Quem roda de aplicativo sabe que
 * roda, e incluir o cenário alargaria a faixa de todo mundo por causa de uma
 * minoria — a faixa perde utilidade quando é larga demais para decidir.
 */
const UNKNOWN_VARIATIONS = {
  driverAgeBand: AGE_BANDS,
  hasGarage: [true, false],
  usage: ["personal", "commute"],
  coverage: ["full", "thirdparty"],
  // Quem não escolheu uma faixa de rodagem não tem o padrão de 1.000 km tomado
  // como verdade: km/mês é o que mais move o custo de quem já tem o carro.
  kmPerMonth: [600, 1200, 2500],
  monthlyRatePct: null, // tratado à parte: percentual sobre a taxa do país
  userConsumption: null, // tratado à parte: percentual sobre o consumo base
};

const RATE_SPREAD = [0.75, 1, 1.35];
// ±20% não é palpite desde 18/08/2026: é o que a metodologia do PBE Veicular
// declara ao explicar os fatores de ajuste que o INMETRO adotou da EPA — "90%
// dos usuários conseguem resultados dentro de mais ou menos 20% dos consumos
// declarados". A banda já era essa; agora ela tem fonte.
const CONSUMPTION_SPREAD = [0.8, 1, 1.2];

const variationsFor = (field, inputs, country) => {
  if (UNKNOWN_VARIATIONS[field]) return UNKNOWN_VARIATIONS[field];

  if (field === "monthlyRatePct") {
    const base = countryProfile(country).monthlyRate * 100;
    return RATE_SPREAD.map((factor) => base * factor);
  }
  if (field === "userConsumption") {
    const base =
      inputs.userConsumption ||
      inputs.consumption ||
      DEFAULT_CONSUMPTION[inputs.fuelType] ||
      DEFAULT_CONSUMPTION.gasoline;
    return CONSUMPTION_SPREAD.map((factor) => base * factor);
  }
  return [];
};

/**
 * Custo mensal como FAIXA, não como número.
 *
 * O modo Padrão pergunta pouco, então boa parte do resultado é suposição. Um
 * número único esconde isso; a faixa mostra. E ela estreita conforme a pessoa
 * informa mais, o que é o incentivo honesto para preencher o modo Avançado.
 *
 * O `high` é o que deve ir para a conta de renda: subestimar coloca alguém num
 * contrato que não paga, superestimar só custa um carro que caberia.
 */
export function estimateOwnershipRange(car, rawInputs = {}, location = {}, unknown = []) {
  const inputs = normalizeOwnershipInputs(rawInputs);
  const country = String(location.country || "BR").toUpperCase();
  const fields = unknown.filter((field) => field in UNKNOWN_VARIATIONS);

  const base = estimateOwnership(car, inputs, location);
  if (!fields.length) {
    return { low: base.totals.monthlyTotal, high: base.totals.monthlyTotal, base, spread: 0 };
  }

  // Produto cartesiano dos cenários. O teto de combinações existe porque a
  // conta é barata mas não é de graça, e ela roda a cada tecla digitada.
  let scenarios = [inputs];
  for (const field of fields) {
    const values = variationsFor(field, inputs, country);
    if (!values.length) continue;
    const next = [];
    for (const scenario of scenarios) {
      for (const value of values) {
        next.push({ ...scenario, [field]: value });
        if (next.length >= 512) break;
      }
    }
    scenarios = next;
  }

  let low = Infinity;
  let high = -Infinity;
  for (const scenario of scenarios) {
    const total = estimateOwnership(car, scenario, location).totals.monthlyTotal;
    if (total < low) low = total;
    if (total > high) high = total;
  }

  return {
    low,
    high,
    base,
    spread: base.totals.monthlyTotal > 0 ? (high - low) / base.totals.monthlyTotal : 0,
  };
}

/**
 * "Sobra ou não sobra" — a pergunta que a regra de % nunca respondeu direito.
 *
 * A regra de comprometimento de renda é um proxy: testada contra perfis reais,
 * ela reprova quem tem renda modesta e contas baixas, que é justamente quem
 * consegue pagar. Com a despesa real informada dá para responder pelo que
 * sobra de fato.
 *
 * A regra não é jogada fora: ela vira teto do otimismo e detector de orçamento
 * incompleto. Quando a folga aprova mas o carro come mais da renda do que é
 * saudável para a situação de vida, o veredito não sobe a "com folga"; quando
 * come muito mais, a tela pergunta em vez de reprovar — normalmente é despesa
 * que a pessoa esqueceu de contar.
 *
 * ESTA É A ÚNICA FUNÇÃO DO MOTOR QUE VIRA NÚMERO EM VEREDITO. Até 19/08/2026
 * havia uma segunda, o `comfortLevel` do `estimateOwnership`, que julgava a
 * mesma situação só pelo percentual da renda e discordava desta em faixas
 * inteiras — com renda R$ 11.000 e contas R$ 3.500, "cabe apertado" aqui e
 * "crítico" lá. Duas réguas discordando não é redundância, é o produto falando
 * duas coisas sobre a mesma decisão financeira. A tela nova mostra o veredito
 * em 46px ao lado da régua de três zonas, então a contradição ia para o rosto
 * de quem está decidindo. Se um dia voltar a existir uma segunda régua, é aqui
 * que ela tem de nascer, como mais um caso deste `level`.
 *
 * Contrato com a tela: `level` é sempre um de três valores discretos —
 * "comfortable", "tight", "no_fit" — e nada entre eles. É o que a régua de
 * zonas do `OwnershipModal` desenha. Verificado em scripts/check-affordability.mjs.
 */
export function assessAffordability({
  monthlyCost = 0,
  monthlyIncome = 0,
  monthlyExpenses = 0,
  currentCarCost = 0,
  replacingCurrentCar = false,
  lifeSituation = "shared",
} = {}) {
  if (!(monthlyIncome > 0) || !(monthlyExpenses > 0)) return null;

  // A despesa declarada já contém o carro que a pessoa tem hoje. Somar o carro
  // novo por cima contaria carro duas vezes — e o erro é grande o bastante
  // para virar o veredito.
  const freedByReplacing = replacingCurrentCar ? Math.min(currentCarCost, monthlyExpenses) : 0;
  const ongoingExpenses = monthlyExpenses - freedByReplacing;

  const disposable = monthlyIncome - ongoingExpenses;
  const leftover = disposable - monthlyCost;
  const committedPct = monthlyCost / monthlyIncome;

  const situation = LIFE_SITUATIONS[lifeSituation] || LIFE_SITUATIONS.shared;

  // Duas perguntas, uma resposta só, e cada régua manda no que sabe responder.
  //
  // A FOLGA (renda − contas − carro) decide se CABE. É a medida informada: sai
  // da despesa que a pessoa declarou, não de um percentual típico, e é ela que
  // aprova quem tem renda modesta e contas baixas — o falso "não cabe" que a
  // regra de percentual produzia.
  //
  // A FATIA DA RENDA decide se dá para chamar de FOLGA. Ela não enxerga as
  // contas, então não tem autoridade para reprovar: reprovar por proxy tira da
  // pessoa um carro que caberia, que é o erro que este motor não comete em
  // lugar nenhum. Mas ela enxerga uma coisa que a folga não enxerga — que o
  // carro come uma fatia da renda acima do sustentável para a situação de vida
  // — e por isso pode TIRAR o "com folga" e deixar em "aperta". Nunca o
  // contrário.
  //
  // O teto é `warning`, não `comfortable`: é o ponto em que a régua de
  // percentual já dizia "acima do recomendado", e usar o corte de baixo
  // rebaixaria justamente quem mora com a família e tem conta fixa quase zero.
  // Medido em 19/08/2026 (scripts/check-affordability.mjs): sem este teto,
  // renda R$ 11.000, contas R$ 500 e um carro de R$ 6.425/mês saíam como "cabe
  // com folga" em 46px, com a legenda da régua logo abaixo, na mesma tela,
  // dizendo "este carro ocuparia 58% da sua renda; o típico é 20%". As duas
  // frases eram do mesmo motor.
  // A ZONA MORTA, e por que ela existe.
  //
  // O corte no ponto exato dava à régua de percentual uma precisão que ela não
  // tem. Os tetos (25%, 30%, 45%) são números redondos de heurística de
  // orçamento, não medição: são bons até uns cinco pontos, nunca até um décimo.
  // Aplicá-los na casa decimal transforma arredondamento em veredito.
  //
  // O caso que criou a constante, medido na grade em 21/08/2026: renda
  // R$ 25.500, contas R$ 1.275, sobra de R$ 17.789 POR MÊS — e o veredito
  // deixava de ser "cabe com folga" porque a fatia deu 25,2% contra um teto de
  // 25%. Dois décimos de ponto derrubando dezessete mil reais de folga.
  //
  // 10% do próprio teto, e é relativo de propósito: os três tetos vão de 25% a
  // 45%, e uma banda fixa em pontos seria proporcionalmente quase o dobro no
  // mais baixo. A banda acompanha a grossura da régua que ela corrige.
  //
  // O que ela NÃO afrouxa: o caso que criou o teto continua rebaixado. Renda
  // R$ 11.000, contas R$ 500 e um carro de R$ 6.425/mês dão 58% da renda contra
  // 33% de teto com a banda — longe da zona morta, e "aperta" continua sendo a
  // resposta. A banda perdoa o empate, não o excesso.
  const HEALTHY_SHARE_DEAD_ZONE = 1.1;

  // A BANDA SOZINHA NÃO RESOLVE, e a medição é que disse isso.
  //
  // Qualquer corte duro numa régua grossa produz um caso logo depois dele: com
  // a banda, o pior rebaixado passou de "sobra R$ 17.789 com 25,2%" para "sobra
  // R$ 15.414 com 28,0%". O penhasco mudou de lugar, não sumiu.
  //
  // O que resolve é tirar autoridade do proxy quando a régua informada é
  // enfática. A fatia da renda existe para desconfiar de quem parece ter folga;
  // ela não tem o que desconfiar de quem termina o mês com mais da METADE da
  // renda livre depois do carro e das contas. Aí a folga não é aparência, é o
  // número medido, e ele vem da despesa que a pessoa declarou.
  //
  // Meia renda é o corte porque é o que a frase quer dizer: sobra mais do que
  // se gasta. Abaixo disso o proxy segue mandando.
  const EMPHATIC_SLACK_RATIO = 0.5;

  const fits = leftover > 0;
  const hasSlack = leftover >= monthlyIncome * 0.2;
  const emphaticSlack = leftover >= monthlyIncome * EMPHATIC_SLACK_RATIO;
  const aboveHealthyShare =
    committedPct > situation.warning * HEALTHY_SHARE_DEAD_ZONE && !emphaticSlack;
  const level = !fits ? "no_fit" : hasSlack && !aboveHealthyShare ? "comfortable" : "tight";
  // Para a tela poder dizer POR QUE aperta um orçamento em que sobra dinheiro.
  const cappedByIncomeShare = fits && hasSlack && aboveHealthyShare;

  // Só desconfia quando a folga aprovou: se já não coube, não há o que checar.
  // O corte aqui é mais alto que o do teto acima de propósito: passar do
  // saudável rebaixa o veredito, passar de meia vez isso é forte o bastante
  // para a tela perguntar se faltou uma conta na lista.
  const suspectIncompleteBudget =
    level !== "no_fit" && committedPct > situation.warning * 1.5;

  return {
    disposable,
    leftover,
    committedPct,
    level,
    cappedByIncomeShare,
    ongoingExpenses,
    freedByReplacing,
    suspectIncompleteBudget,
    typicalSharePct: situation.suggestedShare,
  };
}

export function estimateOwnership(car, rawInputs = {}, location = {}) {
  const inputs = normalizeOwnershipInputs(rawInputs);
  const country = String(location.country || "BR").toUpperCase();
  const state = String(location.state || "").toUpperCase();
  const value = Math.max(num(car?.targetValue, 0), 0);
  const savedValue = Math.max(num(car?.savedValue, 0), 0);
  const carAge = Math.max(new Date().getFullYear() - parseCarYear(car?.year), 0);

  // --- Compra / financiamento -------------------------------------------
  const recommendedDownPayment = value * 0.25; // 20–30% é a faixa saudável
  let financing = null;
  if (inputs.purchaseMode === "finance" && value > 0) {
    const downPayment = clamp(
      inputs.downPaymentValue > 0 ? inputs.downPaymentValue : savedValue,
      0,
      value,
    );
    const principal = value - downPayment;
    const monthlyRate =
      inputs.monthlyRatePct > 0
        ? inputs.monthlyRatePct / 100
        : countryProfile(country).monthlyRate;
    const installment = priceInstallment(principal, monthlyRate, inputs.financeMonths);
    financing = {
      downPayment,
      downPaymentPct: value > 0 ? downPayment / value : 0,
      principal,
      months: inputs.financeMonths,
      monthlyRate,
      installment,
      totalPaid: downPayment + installment * inputs.financeMonths,
      totalInterest: installment * inputs.financeMonths - principal,
    };
  }

  // --- Custos mensais de manutenção da posse ----------------------------
  const taxResult = annualVehicleTax(
    car, value, country, state, inputs.fuelType, carAge, new Date().getFullYear(),
  );
  const tax = taxResult.annual;
  const licensing = annualLicensing(country, state);
  const insuranceResult = annualInsurance(value, carAge, inputs, country, state);
  const insurance = insuranceResult.annual;
  const fuel = monthlyFuel(inputs, country, state);
  const maintenance = annualMaintenance(value, carAge, inputs, country);
  const depreciation = (value * annualDepreciationRate(carAge)) / 12;

  const monthly = {
    financing: financing ? financing.installment : 0,
    tax: tax / 12,
    licensing: licensing / 12,
    insurance: insurance / 12,
    fuel,
    maintenance: maintenance / 12,
    parking: inputs.parkingMonthly,
    tolls: inputs.tollsMonthly,
    depreciation,
  };

  const monthlyMaintain =
    monthly.tax +
    monthly.licensing +
    monthly.insurance +
    monthly.fuel +
    monthly.maintenance +
    monthly.parking +
    monthly.tolls;
  const monthlyTotal = monthlyMaintain + monthly.financing;

  // --- Recomendações ----------------------------------------------------
  const share = inputs.incomeSharePct / 100;
  const requiredIncomeTotal = monthlyTotal / share;
  const requiredIncomeMaintain = monthlyMaintain / share;
  const emergencyFund = Math.max(monthlyMaintain * 3, value * 0.02);

  // Aqui NÃO se emite veredito. Esta função sabe o custo e a renda, mas não
  // sabe as contas da pessoa, e julgar "cabe ou não cabe" sem elas é julgar por
  // proxy — era o que o `comfortLevel` fazia até 19/08/2026, discordando do
  // `assessAffordability` em faixas inteiras de renda. Quem responde "cabe?" é
  // o `assessAffordability`, que recebe a despesa declarada; sem despesa a
  // resposta é ausente de propósito, e a tela convida a informá-la em vez de
  // mostrar um veredito mais fraco.
  //
  // Consequência: `inputs.monthlyIncome` continua sendo normalizado e
  // persistido (a tela guarda a renda em `settings.budget`), mas não muda mais
  // nenhum número que sai daqui.
  const situation = LIFE_SITUATIONS[inputs.lifeSituation];

  return {
    inputs,
    country,
    state,
    value,
    carAge,
    monthly,
    // O que a linha de seguro É, para a tela poder rotular quando ela não for o
    // que a pessoa pediu. Ver annualInsurance.
    insurance: {
      basis: insuranceResult.basis,
      fullCoverageMaxAge: INSURANCE_FULL_COVERAGE_MAX_AGE,
    },
    // Idem para o IPVA. Ver annualVehicleTax.
    tax: {
      basis: taxResult.basis,
      exemptAge: taxResult.exemptAge,
      rate: taxResult.rate,
    },
    totals: {
      monthlyMaintain,
      monthlyTotal,
      annualMaintain: monthlyMaintain * 12,
      annualTotal: monthlyTotal * 12,
    },
    financing,
    recommendations: {
      requiredIncomeTotal,
      requiredIncomeMaintain,
      recommendedDownPayment,
      recommendedDownPaymentPct: 0.25,
      emergencyFund,
      incomeSharePct: inputs.incomeSharePct,
      suggestedSharePct: situation.suggestedShare,
      downPaymentGap: Math.max(recommendedDownPayment - savedValue, 0),
    },
  };
}

/**
 * Alavancas: o que faria caber, e quanto cada mudança tira da conta do mês.
 *
 * Substitui o percentual do breakdown ("seguro é 13% do custo"), que descreve
 * o modelo e não decide nada. O delta em reais decide: "só terceiros → −R$ 586
 * por mês" é uma escolha que a pessoa pode fazer hoje.
 *
 * O delta sai do cenário CENTRAL, não do teto da faixa. O teto responde "cabe?"
 * — ele é o pior caso e é com ele que o veredito é feito. A alavanca responde
 * "quanto isso muda?", e para comparar duas mudanças entre si o central é a
 * régua estável: o teto se move quando a alavanca mexe num campo que também é
 * fonte de incerteza, e a comparação deixaria de ser entre iguais.
 *
 * Devolve `patch` junto porque a tela aplica a alavanca de verdade — botão que
 * anuncia um número e não faz nada é promessa quebrada.
 */
export function affordabilityLevers(car, rawInputs = {}, location = {}) {
  const inputs = normalizeOwnershipInputs(rawInputs);
  const base = estimateOwnership(car, inputs, location);
  const baseTotal = base.totals.monthlyTotal;
  const value = base.value;
  const savedValue = Math.max(num(car?.savedValue, 0), 0);
  const isFinance = inputs.purchaseMode === "finance" && value > 0;

  const levers = [];
  const consider = (key, patch, params = {}, tradeoff = false) => {
    const alt = estimateOwnership(car, { ...inputs, ...patch }, location);
    const delta = baseTotal - alt.totals.monthlyTotal;
    // Menos de um real por mês não é alavanca, é ruído — e listar ruído junto
    // do que importa é como o breakdown de percentuais escondia o que decide.
    if (!(delta >= 1)) return;
    levers.push({ key, delta, patch, tradeoff, params });
  };

  if (isFinance) {
    consider("cash", { purchaseMode: "cash" }, { value });
  }

  if (inputs.coverage === "full") {
    consider("thirdparty", { coverage: "thirdparty" });
  }

  if (isFinance) {
    const currentDown = inputs.downPaymentValue > 0 ? inputs.downPaymentValue : savedValue;
    // Duas réguas, e vale a maior: a entrada ideal de 25% (a que o produto já
    // recomenda) e a próxima marca de R$ 10 mil acima do que a pessoa tem.
    // Quem ainda não juntou nada precisa mirar nos 25%; quem já passou deles
    // precisa de um passo concreto, não de uma meta que já cumpriu. O teto de
    // metade do carro existe para a alavanca não virar "compre à vista", que
    // já é a primeira da lista.
    const target = Math.min(
      Math.max(base.recommendations.recommendedDownPayment, currentDown + 10000),
      value * 0.5,
    );
    if (target > currentDown + 500) {
      consider(
        "down",
        { downPaymentValue: target },
        { target, have: currentDown, gap: target - currentDown },
      );
    }
  }

  if (isFinance && inputs.financeMonths < 72) {
    const months = inputs.financeMonths < 60 ? 60 : 72;
    const alt = estimateOwnership(car, { ...inputs, financeMonths: months }, location);
    const delta = baseTotal - alt.totals.monthlyTotal;
    if (delta >= 1) {
      levers.push({
        key: "months",
        delta,
        patch: { financeMonths: months },
        // Alivia o mês e encarece o total: é troca, não economia. A tela
        // precisa saber a diferença para não vender as duas como iguais.
        tradeoff: true,
        params: {
          months,
          from: inputs.financeMonths,
          extraInterest: Math.max(
            (alt.financing?.totalInterest || 0) - (base.financing?.totalInterest || 0),
            0,
          ),
        },
      });
    }
  }

  return levers.sort((a, b) => b.delta - a.delta);
}
