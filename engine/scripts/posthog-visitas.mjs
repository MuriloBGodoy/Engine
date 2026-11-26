/**
 * Quanta gente entrou no Engine, por onde chegou e o que fez lá dentro.
 *
 *   npm run analytics            # últimos 7 dias
 *   npm run analytics -- 30      # últimos 30 dias
 *
 * Lê o PostHog pela API de consulta (HogQL). Só leitura: nenhuma query aqui
 * escreve ou apaga evento.
 *
 * O `.env` do site tem a chave `phc_`, que só SOBE evento — não desce nada.
 * Para ler é preciso uma Personal API Key (`phx_`), que vive fora do repo:
 *
 *   C:\engine-credentials\observability.env
 *   POSTHOG_PERSONAL_KEY=phx_...
 *
 * Escopos necessários na chave: "Query: Read" e "Project: Read". Nada além —
 * uma chave de leitura que vaze não derruba o projeto, uma de escrita sim.
 *
 * Lembretes de leitura dos números:
 * - "visitas" = sessões distintas; "pessoas" conta o navegador, não o CPF.
 * - `person_profiles: "identified_only"`: visitante anônimo não vira perfil,
 *   mas ainda conta em sessão e pageview. Então visita anônima aparece aqui.
 * - rota sai sem domínio (`/garagem`) porque o App manda só o pathname.
 */
import { readFileSync, existsSync } from "node:fs";

const ENV_FILE = process.env.OBSERVABILITY_ENV_FILE || "C:/engine-credentials/observability.env";
const fileEnv = existsSync(ENV_FILE)
  ? Object.fromEntries(
      readFileSync(ENV_FILE, "utf8")
        .split(/\r?\n/)
        .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
        .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]),
    )
  : {};
const env = { ...fileEnv, ...process.env };

const KEY = env.POSTHOG_PERSONAL_KEY;
const PROJECT = env.POSTHOG_PROJECT_ID || "677582";
const API = (env.POSTHOG_API_HOST || "https://us.posthog.com").replace(/\/$/, "");

if (!KEY) {
  console.error(`Falta POSTHOG_PERSONAL_KEY (procurei em ${ENV_FILE} e no ambiente).`);
  console.error("Gere em: PostHog > Settings > Personal API keys, escopos Query:Read + Project:Read.");
  process.exit(2);
}
if (!/^phx_/.test(KEY)) {
  console.error("POSTHOG_PERSONAL_KEY não começa com 'phx_'. A chave 'phc_' do site não serve para ler.");
  process.exit(2);
}

const args = process.argv.slice(2);
const incluirDev = args.includes("--tudo");
const dias = Number(args.find((a) => !a.startsWith("--")) ?? 7);
if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
  console.error("Use um número inteiro de dias entre 1 e 365.");
  process.exit(2);
}

/** Uma consulta HogQL. Devolve as linhas já com nome de coluna. */
async function hogql(query) {
  const res = await fetch(`${API}/api/projects/${PROJECT}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  const texto = await res.text();
  if (!res.ok) {
    // Nunca ecoar o corpo inteiro: a mensagem de erro do PostHog às vezes
    // devolve a query, e a query não tem segredo — mas o header tinha.
    throw new Error(`HTTP ${res.status}: ${texto.slice(0, 400)}`);
  }
  const data = JSON.parse(texto);
  return (data.results || []).map((linha) =>
    Object.fromEntries((data.columns || []).map((coluna, i) => [coluna, linha[i]])),
  );
}

/**
 * Fora o localhost. Em 13-22/11/2026, 336 dos 841 pageviews do projeto eram
 * `npm run dev` da máquina do Murilo, e a conta do lançamento saiu quase o
 * dobro do real. O site hoje barra isso na origem (ver VITE_POSTHOG_DEV em
 * observability.js), mas o que já entrou continua no banco.
 *
 * `--tudo` mostra o bruto, sem filtro, para quando a pergunta for justamente
 * "o rastreio está chegando?".
 */
const soProd = incluirDev ? "" : " AND properties.$host NOT LIKE 'localhost%'";
const desde = `timestamp >= now() - INTERVAL ${dias} DAY${soProd}`;
const PV = `event = '$pageview' AND ${desde}`;

/** Tabelinha de largura fixa, para ler no terminal sem rolar na horizontal. */
function tabela(linhas, { vazio = "  (nada no período)" } = {}) {
  if (!linhas.length) return console.log(vazio);
  const cols = Object.keys(linhas[0]);
  const larg = cols.map((c) =>
    Math.max(c.length, ...linhas.map((l) => String(l[c] ?? "").slice(0, 52).length)),
  );
  const linha = (vals) => "  " + vals.map((v, i) => String(v).padEnd(larg[i])).join("  ");
  console.log(linha(cols));
  console.log("  " + larg.map((n) => "-".repeat(n)).join("  "));
  for (const l of linhas) console.log(linha(cols.map((c) => String(l[c] ?? "").slice(0, 52))));
}

const titulo = (t) => console.log(`\n${t}\n${"=".repeat(t.length)}`);

try {
  const [total, porDia, rotas, fontes, dispositivos, eventos, hosts, utm, novos] =
    await Promise.all([
    hogql(`SELECT count() AS pageviews,
                  count(DISTINCT properties.$session_id) AS visitas,
                  count(DISTINCT person_id) AS pessoas
           FROM events WHERE ${PV}`),
    hogql(`SELECT toDate(timestamp) AS dia,
                  count(DISTINCT properties.$session_id) AS visitas,
                  count(DISTINCT person_id) AS pessoas,
                  count() AS pageviews
           FROM events WHERE ${PV}
           GROUP BY dia ORDER BY dia DESC`),
    hogql(`SELECT properties.$current_url AS rota,
                  count() AS vistas,
                  count(DISTINCT person_id) AS pessoas
           FROM events WHERE ${PV}
           GROUP BY rota ORDER BY vistas DESC LIMIT 15`),
    hogql(`SELECT coalesce(nullIf(properties.$referring_domain, ''), '(direto)') AS fonte,
                  count(DISTINCT properties.$session_id) AS visitas
           FROM events WHERE ${PV}
           GROUP BY fonte ORDER BY visitas DESC LIMIT 10`),
    hogql(`SELECT coalesce(nullIf(properties.$device_type, ''), '(?)') AS dispositivo,
                  count(DISTINCT properties.$session_id) AS visitas
           FROM events WHERE ${PV}
           GROUP BY dispositivo ORDER BY visitas DESC`),
    hogql(`SELECT event AS evento,
                  count() AS vezes,
                  count(DISTINCT person_id) AS pessoas
           FROM events
           WHERE event NOT LIKE '$%' AND ${desde}
           GROUP BY evento ORDER BY vezes DESC LIMIT 20`),
    hogql(`SELECT coalesce(nullIf(properties.$host, ''), '(vazio)') AS host,
                  count(DISTINCT properties.$session_id) AS visitas,
                  count(DISTINCT person_id) AS pessoas
           FROM events WHERE ${PV}
           GROUP BY host ORDER BY visitas DESC LIMIT 10`),
    hogql(`SELECT coalesce(nullIf(properties.$initial_utm_source, ''),
                           nullIf(properties.$utm_source, ''), '(sem utm)') AS campanha,
                  count(DISTINCT properties.$session_id) AS visitas
           FROM events WHERE ${PV}
           GROUP BY campanha ORDER BY visitas DESC LIMIT 10`),
    hogql(`SELECT countIf(sessoes = 1) AS so_uma_sessao,
                  countIf(sessoes > 1) AS voltaram
           FROM (SELECT person_id, count(DISTINCT properties.$session_id) AS sessoes
                 FROM events WHERE ${PV} GROUP BY person_id)`),
  ]);

  const t = total[0] || {};
  titulo(`Engine — últimos ${dias} dia(s)`);
  console.log(incluirDev ? "  (bruto: inclui localhost)" : "  (só o site no ar; localhost fora)");
  console.log(`  visitas (sessões): ${t.visitas ?? 0}`);
  console.log(`  pessoas (navegadores distintos): ${t.pessoas ?? 0}`);
  console.log(`  telas vistas: ${t.pageviews ?? 0}`);
  if (novos[0]) {
    console.log(`  voltaram (2+ sessões): ${novos[0].voltaram ?? 0}`);
    console.log(`  entraram uma vez só: ${novos[0].so_uma_sessao ?? 0}`);
  }
  if (!t.visitas) {
    console.log("\n  Zero. Ou ninguém entrou, ou o rastreio não está chegando lá.");
    console.log("  Confira em: https://us.posthog.com/project/" + PROJECT + "/activity/explore");
  }

  titulo("Dia a dia");
  tabela(porDia);
  titulo("Telas mais vistas");
  tabela(rotas);
  titulo("De onde vieram");
  tabela(fontes);
  titulo("Campanha (utm_source do link divulgado)");
  tabela(utm, { vazio: "  (nenhum link com utm_source ainda)" });
  titulo("Onde rodou");
  tabela(hosts);
  titulo("Dispositivo");
  tabela(dispositivos);
  titulo("O que fizeram (eventos de produto)");
  tabela(eventos, { vazio: "  (nenhum evento de produto — só navegação)" });
  console.log("");
} catch (erro) {
  console.error(`\nFalhou: ${erro.message}`);
  if (/401|403/.test(erro.message)) {
    console.error("Parece chave sem permissão: confira os escopos Query:Read e Project:Read.");
  }
  process.exit(1);
}
