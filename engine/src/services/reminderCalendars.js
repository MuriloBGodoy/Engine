/**
 * Calendários de vencimento por UF e final de placa: IPVA e licenciamento.
 *
 * REGRA DESTE ARQUIVO: só entra data que alguém publicou. UF ou ano que não
 * está aqui NÃO é estimado a partir do ano anterior — a tela diz "calendário
 * não coberto / ainda não publicado" e oferece a data manual. Um lembrete que
 * chega DEPOIS do vencimento é pior do que nenhum lembrete.
 *
 * Consultado em 28/10/2026 (CALENDARS_CONSULTED). Nessa data nenhuma UF tinha
 * publicado o calendário de 2027 (SP costuma publicar em novembro; MG, RJ, PR,
 * BA, DF e GO entre novembro e dezembro). Quando sair, entra um bloco `2027`
 * por UF e sobe CALENDARS_VERSION — é ela que faz cada aparelho reenviar os
 * lembretes ao servidor (ver remindersSync.js).
 *
 * Cada bloco diz a fonte e o nível dela:
 *   - "official": página ou ato do próprio governo, lido por nós;
 *   - "press": imprensa reproduzindo o ato ou o release oficial (a tabela foi
 *     lida na matéria, não no Diário Oficial);
 *   - "thirdParty": blog/despachante, fontes divergentes. Fica marcado como
 *     "confira no site oficial" na tela. Onde as fontes divergem, ficou a
 *     data MAIS CEDO: lembrar antes não custa nada, lembrar depois custa multa.
 *
 * `roll: "nextBusinessDay"` só onde o calendário diz expressamente que
 * vencimento em fim de semana/feriado passa para o próximo dia útil (SP e GO,
 * IPVA). Sem essa frase na fonte, a data fica como publicada — de novo, a
 * mais cedo das leituras possíveis.
 *
 * Entrada de IPVA: { date, n, single }
 *   n       — número da parcela (null quando não é parcela)
 *   single  — "discount" (cota única com desconto), "full" (cota única sem
 *             desconto) ou null. Uma mesma data pode ser as duas coisas
 *             ("cota única ou 1ª parcela").
 */

export const CALENDARS_CONSULTED = "2026-10-28";
// Sobe quando qualquer data abaixo muda ou um ano novo entra.
export const CALENDARS_VERSION = 1;

const FINALS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const pad = (value) => String(value).padStart(2, "0");
const lastDay = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Uma tabela "final → datas" vira a lista de entradas com os rótulos da coluna. */
const table = (columns, rows) => {
  const out = {};
  for (const [finals, dates] of rows) {
    for (const final of finals.split("")) {
      out[final] = dates
        .map((date, index) => (date ? { date, ...columns[index] } : null))
        .filter(Boolean);
    }
  }
  return out;
};

/** Mesma data para todos os finais. */
const everyFinal = (entries) => Object.fromEntries(FINALS.map((final) => [final, entries]));

const IPVA_3 = [{ n: 1, single: "discount" }, { n: 2, single: null }, { n: 3, single: null }];
const IPVA_5 = [
  { n: 1, single: "discount" },
  { n: 2, single: null },
  { n: 3, single: null },
  { n: 4, single: null },
  { n: 5, single: null },
];

// ---------------------------------------------------------------------------
// SC: o mês do vencimento é o do final da placa (1 = janeiro … 0 = outubro).
// Parcelas no dia 10 desse mês e dos dois seguintes; cota única (sem desconto,
// SC não dá desconto) no último dia do mês; licenciamento no último dia do
// mês da 3ª parcela ("paga junto com a última parcela"; final 1 = 31/03).
// ---------------------------------------------------------------------------
const scMonth = (final) => (final === "0" ? 10 : Number(final));
const scIpva = (year) =>
  Object.fromEntries(
    FINALS.map((final) => {
      const m = scMonth(final);
      return [
        final,
        [
          { date: `${year}-${pad(m)}-10`, n: 1, single: null },
          { date: `${year}-${pad(m)}-${lastDay(year, m)}`, n: null, single: "full" },
          { date: `${year}-${pad(m + 1)}-10`, n: 2, single: null },
          { date: `${year}-${pad(m + 2)}-10`, n: 3, single: null },
        ],
      ];
    }),
  );
const scLicensing = (year) =>
  Object.fromEntries(
    FINALS.map((final) => {
      const m = scMonth(final) + 2;
      return [final, `${year}-${pad(m)}-${lastDay(year, m)}`];
    }),
  );

// ---------------------------------------------------------------------------
// GO: parcelas no dia 15 (próximo dia útil se cair em fim de semana/feriado,
// diz a Economia-GO), 9 parcelas para finais 1 e 2 (jan–set) e 10 para os
// demais (jan–out). Cota única com desconto em 15/01; sem desconto até 15/09
// (finais 1 e 2) ou 15/10 (3 a 0). Fevereiro/2026 foi para 19/02 (carnaval e
// quarta de cinzas), dito na própria página oficial.
// ---------------------------------------------------------------------------
const goIpva2026 = Object.fromEntries(
  FINALS.map((final) => {
    const months = final === "1" || final === "2" ? 9 : 10;
    const entries = [];
    for (let m = 1; m <= months; m += 1) {
      entries.push({
        date: m === 2 ? "2026-02-19" : `2026-${pad(m)}-15`,
        n: m,
        single: m === 1 ? "discount" : m === months ? "full" : null,
      });
    }
    return [final, entries];
  }),
);

export const CALENDARS = {
  SP: {
    2026: {
      ipva: {
        level: "press",
        roll: "nextBusinessDay",
        source:
          "Sefaz-SP, calendário IPVA 2026 (publicado em 14/11/2025), reproduzido por Olhar Digital e COAD (coad.com.br/home/noticias-detalhe/135959). Janeiro: 3% de desconto na cota única; fevereiro: cota única sem desconto; até 5 parcelas jan–mai.",
        // Janeiro já é a escala em dias úteis; fev–mai são o mesmo dia do mês
        // e a Sefaz manda pagar no próximo dia útil.
        byFinal: table(
          [
            { n: 1, single: "discount" },
            { n: 2, single: "full" },
            { n: 3, single: null },
            { n: 4, single: null },
            { n: 5, single: null },
          ],
          [
            ["1", ["2026-01-12", "2026-02-12", "2026-03-12", "2026-04-12", "2026-05-12"]],
            ["2", ["2026-01-13", "2026-02-13", "2026-03-13", "2026-04-13", "2026-05-13"]],
            ["3", ["2026-01-14", "2026-02-14", "2026-03-14", "2026-04-14", "2026-05-14"]],
            ["4", ["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15", "2026-05-15"]],
            ["5", ["2026-01-16", "2026-02-16", "2026-03-16", "2026-04-16", "2026-05-16"]],
            ["6", ["2026-01-19", "2026-02-19", "2026-03-19", "2026-04-19", "2026-05-19"]],
            ["7", ["2026-01-20", "2026-02-20", "2026-03-20", "2026-04-20", "2026-05-20"]],
            ["8", ["2026-01-21", "2026-02-21", "2026-03-21", "2026-04-21", "2026-05-21"]],
            ["9", ["2026-01-22", "2026-02-22", "2026-03-22", "2026-04-22", "2026-05-22"]],
            ["0", ["2026-01-23", "2026-02-23", "2026-03-23", "2026-04-23", "2026-05-23"]],
          ],
        ),
      },
      licensing: {
        level: "press",
        source:
          "Detran-SP, calendário de licenciamento 2026 (passeio), reproduzido por Vrum e Tribuna de Jundiaí: finais 1-2 jul, 3-4 ago, 5-6 set, 7-8 out, 9 nov, 0 dez, último dia do mês.",
        byFinal: {
          1: "2026-07-31", 2: "2026-07-31", 3: "2026-08-31", 4: "2026-08-31", 5: "2026-09-30",
          6: "2026-09-30", 7: "2026-10-31", 8: "2026-10-31", 9: "2026-11-30", 0: "2026-12-31",
        },
      },
    },
  },
  MG: {
    2026: {
      ipva: {
        level: "press",
        source:
          "SEF-MG, escala do IPVA 2026 (release da Agência Minas), reproduzida pela Rádio Itatiaia em 09/02/2026: cota única com 3% de desconto ou 3 parcelas.",
        byFinal: table(IPVA_3, [
          ["12", ["2026-02-09", "2026-03-09", "2026-04-09"]],
          ["34", ["2026-02-10", "2026-03-10", "2026-04-10"]],
          ["56", ["2026-02-11", "2026-03-11", "2026-04-13"]],
          ["78", ["2026-02-12", "2026-03-12", "2026-04-14"]],
          ["90", ["2026-02-13", "2026-03-13", "2026-04-15"]],
        ]),
      },
      licensing: {
        level: "official",
        source: "SEF-MG / Agência Minas: TRLAV 2026 vence em 31/03 para todas as placas (mesma fonte da taxa em ownership.js).",
        byFinal: everyFinal("2026-03-31"),
      },
    },
  },
  RJ: {
    2026: {
      ipva: {
        level: "press",
        source:
          "Resolução SEFAZ-RJ nº 837, de 25/11/2025, Anexo Único, reproduzido pela COAD (coad.com.br/home/noticias-detalhe/134894): cota única (3% de desconto) ou 3 cotas.",
        byFinal: table(IPVA_3, [
          ["0", ["2026-01-21", "2026-02-20", "2026-03-23"]],
          ["1", ["2026-01-22", "2026-02-23", "2026-03-26"]],
          ["2", ["2026-01-23", "2026-02-24", "2026-03-27"]],
          ["3", ["2026-01-26", "2026-02-25", "2026-03-30"]],
          ["4", ["2026-01-27", "2026-02-26", "2026-03-31"]],
          ["5", ["2026-01-28", "2026-02-27", "2026-04-01"]],
          ["6", ["2026-01-29", "2026-03-02", "2026-04-06"]],
          ["7", ["2026-01-30", "2026-03-03", "2026-04-07"]],
          ["8", ["2026-02-02", "2026-03-04", "2026-04-08"]],
          ["9", ["2026-02-03", "2026-03-06", "2026-04-09"]],
        ]),
      },
      licensing: {
        level: "press",
        source:
          "Detran-RJ, prazos de licenciamento 2026 prorrogados no Diário Oficial (Vrum, 05/2026; Diário do Rio): finais 0-2 até 31/07, 3-5 até 31/08, 6-9 até 30/09.",
        byFinal: {
          0: "2026-07-31", 1: "2026-07-31", 2: "2026-07-31", 3: "2026-08-31", 4: "2026-08-31",
          5: "2026-08-31", 6: "2026-09-30", 7: "2026-09-30", 8: "2026-09-30", 9: "2026-09-30",
        },
      },
    },
  },
  PR: {
    2026: {
      ipva: {
        level: "press",
        source:
          "Sefa-PR, calendário IPVA 2026 (09/12/2025), reproduzido pela COAD (coad.com.br/home/noticias-detalhe/135086): cota única com 6% de desconto ou 5 parcelas.",
        byFinal: table(IPVA_5, [
          ["12", ["2026-01-09", "2026-02-09", "2026-03-09", "2026-04-09", "2026-05-11"]],
          ["34", ["2026-01-12", "2026-02-10", "2026-03-10", "2026-04-10", "2026-05-12"]],
          ["56", ["2026-01-13", "2026-02-11", "2026-03-11", "2026-04-13", "2026-05-13"]],
          ["78", ["2026-01-14", "2026-02-12", "2026-03-12", "2026-04-14", "2026-05-14"]],
          ["90", ["2026-01-15", "2026-02-13", "2026-03-13", "2026-04-15", "2026-05-15"]],
        ]),
      },
      licensing: {
        level: "thirdParty",
        source:
          "Detran-PR, licenciamento 2026 por final, segundo despachantes (despachantedok, gringo). Outra tabela circulando traz tudo 1-2 dias depois; ficou a mais cedo.",
        byFinal: {
          1: "2026-08-14", 2: "2026-08-28", 3: "2026-09-09", 4: "2026-09-18", 5: "2026-09-28",
          6: "2026-10-09", 7: "2026-10-20", 8: "2026-10-30", 9: "2026-11-13", 0: "2026-11-27",
        },
      },
    },
  },
  SC: {
    2026: {
      ipva: {
        level: "thirdParty",
        source:
          "SEF-SC, calendário IPVA 2026 (16/12/2025), segundo NSC Total (06/01/2026) e despachantes: mês do final da placa, parcelas no dia 10, cota única no último dia do mês. Página oficial não encontrada; há fonte com 08/01 para o final 1.",
        byFinal: scIpva(2026),
      },
      licensing: {
        level: "thirdParty",
        source:
          "Licenciamento junto com a última parcela do IPVA, até o fim do mês dela (NSC Total: final 1 em 31/03).",
        byFinal: scLicensing(2026),
      },
    },
  },
  RS: {
    2026: {
      ipva: {
        level: "official",
        source:
          "Governo do RS (estado.rs.gov.br, 'Prazo final para pagamento por placas do IPVA 2026 é 30 de abril'): vencimento unificado para todos os finais.",
        byFinal: everyFinal([{ date: "2026-04-30", n: null, single: "full" }]),
      },
    },
  },
  BA: {
    2026: {
      ipva: {
        level: "press",
        source:
          "Portaria SEFAZ-BA nº 163, de 05/12/2025 (DOE 06/12), reproduzida pela COAD (coad.com.br/home/noticias-detalhe/135004): 15% de desconto até 10/02 para todos; 8% na data da 1ª cota; 5 cotas; a 5ª é também o prazo da cota única sem desconto.",
        byFinal: (() => {
          const rows = table(
            [
              { n: 1, single: "discount" },
              { n: 2, single: null },
              { n: 3, single: null },
              { n: 4, single: null },
              { n: 5, single: "full" },
            ],
            [
              ["1", ["2026-03-30", "2026-04-29", "2026-05-28", "2026-06-29", "2026-07-30"]],
              ["2", ["2026-03-31", "2026-04-30", "2026-05-29", "2026-06-30", "2026-07-31"]],
              ["3", ["2026-04-29", "2026-05-28", "2026-06-29", "2026-07-30", "2026-08-28"]],
              ["4", ["2026-04-30", "2026-05-29", "2026-06-30", "2026-07-31", "2026-08-31"]],
              ["5", ["2026-05-28", "2026-06-29", "2026-07-30", "2026-08-28", "2026-09-29"]],
              ["6", ["2026-05-29", "2026-06-30", "2026-07-31", "2026-08-31", "2026-09-30"]],
              ["7", ["2026-06-29", "2026-07-30", "2026-08-28", "2026-09-29", "2026-10-29"]],
              ["8", ["2026-06-30", "2026-07-31", "2026-08-31", "2026-09-30", "2026-10-30"]],
              ["9", ["2026-07-30", "2026-08-28", "2026-09-29", "2026-10-29", "2026-11-27"]],
              ["0", ["2026-07-31", "2026-08-31", "2026-09-30", "2026-10-30", "2026-11-30"]],
            ],
          );
          for (const final of FINALS) {
            rows[final].unshift({ date: "2026-02-10", n: null, single: "discount" });
          }
          return rows;
        })(),
      },
    },
  },
  GO: {
    2026: {
      ipva: {
        level: "official",
        roll: "nextBusinessDay",
        source:
          "Governo de Goiás (goias.gov.br, 16/02/2026): parcelas no dia 15 ou no próximo dia útil; 9 parcelas (finais 1-2) ou 10 (3-0); cota única sem desconto até 15/09 ou 15/10. Cota única com desconto em 15/01 segundo AutoPapo.",
        byFinal: goIpva2026,
      },
    },
  },
  DF: {
    2026: {
      ipva: {
        level: "press",
        source:
          "Portaria SEEC-DF nº 923, de 17/11/2025 (DODF 19/11), reproduzida pela COAD (coad.com.br/home/noticias-detalhe/134725): cota única (10% de desconto) na data da 1ª parcela ou 6 parcelas.",
        byFinal: table(
          [...IPVA_5, { n: 6, single: null }],
          [
            ["12", ["2026-02-23", "2026-03-23", "2026-04-22", "2026-05-25", "2026-06-22", "2026-07-20"]],
            ["34", ["2026-02-24", "2026-03-24", "2026-04-23", "2026-05-26", "2026-06-23", "2026-07-21"]],
            ["56", ["2026-02-25", "2026-03-25", "2026-04-24", "2026-05-27", "2026-06-24", "2026-07-22"]],
            ["78", ["2026-02-26", "2026-03-26", "2026-04-27", "2026-05-28", "2026-06-25", "2026-07-23"]],
            ["90", ["2026-02-27", "2026-03-27", "2026-04-28", "2026-05-29", "2026-06-26", "2026-07-24"]],
          ],
        ),
      },
      licensing: {
        level: "press",
        source:
          "Instrução Detran-DF nº 291, de 27/08/2026 (DODF 28/08), segundo Sou Brasília/Metrópoles: finais 1-2 até 30/09, 3-5 até 31/10, 6-8 até 30/11, 9-0 até 31/12.",
        byFinal: {
          1: "2026-09-30", 2: "2026-09-30", 3: "2026-10-31", 4: "2026-10-31", 5: "2026-10-31",
          6: "2026-11-30", 7: "2026-11-30", 8: "2026-11-30", 9: "2026-12-31", 0: "2026-12-31",
        },
      },
    },
  },
};

/** UFs com pelo menos um calendário. As outras: data manual. */
export const COVERED_UFS = Object.keys(CALENDARS);

/**
 * Feriados nacionais que movem um vencimento com `roll: "nextBusinessDay"`.
 * Carnaval (segunda e terça) entra porque banco não abre. Corpus Christi e
 * quarta de cinzas NÃO entram: contar dia útil a menos empurraria a data para
 * depois, que é o lado perigoso — quando uma UF diz que pulou um deles (GO,
 * fev/2026), a data vem escrita no calendário dela.
 */
const easter = (year) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day);
};

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

export const nationalHolidays = (year) => {
  const e = easter(year);
  return new Set([
    `${year}-01-01`,
    iso(e - 48 * DAY), // segunda de carnaval
    iso(e - 47 * DAY), // terça de carnaval
    iso(e - 2 * DAY), // sexta-feira santa
    `${year}-04-21`,
    `${year}-05-01`,
    `${year}-09-07`,
    `${year}-10-12`,
    `${year}-11-02`,
    `${year}-11-15`,
    `${year}-11-20`, // Lei 14.759/2023
    `${year}-12-25`,
  ]);
};
