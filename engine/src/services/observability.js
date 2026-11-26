/**
 * Erro e uso: Sentry para crash, PostHog para produto.
 *
 * Segue o mesmo contrato do AdSlot: enquanto as variáveis de ambiente
 * estiverem vazias, nada é carregado e nada é enviado. Assim o dev roda limpo
 * e a decisão de ligar é só preencher o `.env` — sem mexer em código.
 *
 * As duas bibliotecas entram por `import()` dinâmico justamente por causa
 * disso: import estático somava ~79 kB gzip ao bundle inicial mesmo com tudo
 * desligado. Como carregam depois, os eventos disparados enquanto isso vão
 * para uma fila e são drenados na chegada — senão o primeiro pageview, que é
 * o mais importante, se perderia.
 *
 * Nenhum dos dois sobe conteúdo do usuário: o PostHog vai com autocapture de
 * clique e navegação, sem o que é digitado, e o Sentry só envia pilha de erro.
 */
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || "";

/**
 * `npm run dev` mandava evento para o MESMO projeto do site, e a conta do
 * lancamento saiu inflada: em 13-22/11/2026, 336 dos 841 pageviews eram
 * localhost. Desenvolvimento nao e visita, entao em dev a chave fica vazia e
 * nada sobe - o mesmo contrato de "sem chave, sem evento" que o resto do
 * arquivo ja segue.
 *
 * Para conferir instrumentacao nova na mao, ligue VITE_POSTHOG_DEV=1 no .env
 * local. Lembre de desligar: enquanto estiver 1, cada recarga do dev server
 * suja o relatorio.
 *
 * O Sentry continua ligado em dev de proposito - ele marca `environment` em
 * cada evento, entao da para filtrar depois. O PostHog nao tem esse campo.
 */
const POSTHOG_KEY =
  import.meta.env.DEV && import.meta.env.VITE_POSTHOG_DEV !== "1"
    ? ""
    : import.meta.env.VITE_POSTHOG_KEY || "";
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";

let sentry = null;
let posthog = null;
const pending = [];

const flushPending = () => {
  while (pending.length) {
    const run = pending.shift();
    run();
  }
};

/** Enfileira enquanto o PostHog não chegou; descarta se ele nunca vier. */
const withPosthog = (run) => {
  if (posthog) run();
  else if (POSTHOG_KEY) pending.push(run);
};

export async function initObservability() {
  const loading = [];

  if (SENTRY_DSN && !sentry) {
    loading.push(
      import("@sentry/react").then((module) => {
        module.init({
          dsn: SENTRY_DSN,
          environment: import.meta.env.MODE,
          // 10% das navegações: dá pra ver lentidão sem estourar a cota.
          tracesSampleRate: 0.1,
          // Sem replay de sessão: grava a tela do usuário e é o item mais
          // sensível do pacote. Se um dia ligar, com consentimento explícito.
          replaysSessionSampleRate: 0,
          replaysOnErrorSampleRate: 0,
        });
        sentry = module;
      }),
    );
  }

  if (POSTHOG_KEY && !posthog) {
    loading.push(
      import("posthog-js").then((module) => {
        const client = module.default;
        client.init(POSTHOG_KEY, {
          api_host: POSTHOG_HOST,
          // Só cria perfil de pessoa pra quem fez login: visitante anônimo não
          // vira registro, o que segura a cota e guarda menos dado pessoal.
          person_profiles: "identified_only",
          capture_pageview: false, // disparado à mão: o Engine é SPA
          autocapture: {
            // Nunca capturar o que a pessoa digita.
            dom_event_allowlist: ["click", "submit"],
          },
          disable_session_recording: true,
        });
        posthog = client;
        flushPending();
      }),
    );
  }

  await Promise.allSettled(loading);
}

/** Liga o usuário logado aos eventos. Chamar depois do login. */
export function identifyUser(user) {
  if (!user?.uid) return;
  sentry?.setUser({ id: user.uid });
  // Sem e-mail nem nome: pro produto basta saber que é a mesma pessoa.
  withPosthog(() => posthog.identify(user.uid));
}

/** Desfaz o vínculo no logout, pra sessão seguinte não herdar a anterior. */
export function resetUser() {
  sentry?.setUser(null);
  withPosthog(() => posthog.reset());
}

/**
 * Uma tela vista. O Engine é SPA, então isso não sai de graça.
 *
 * Vai com domínio (`https://enginegarage.com.br/garagem`) e não só o
 * pathname: sem ele o relatório não consegue separar o site de verdade do
 * localhost e do deploy de preview — foi assim que os primeiros números
 * saíram errados.
 *
 * Mas a URL é montada à mão em vez de usar `location.href`, de propósito: o
 * href carrega `?` e `#`, e o retorno do login do Supabase chega com
 * `#access_token=…` ali. Token não vai para o analytics.
 */
export function trackPageView(path) {
  const url = `${window.location.origin}${path}`;
  withPosthog(() => posthog.capture("$pageview", { $current_url: url }));
}

/** Um evento de produto: `trackEvent("meta_criada", { marca })`. */
export function trackEvent(name, properties = {}) {
  withPosthog(() => posthog.capture(name, properties));
}

/**
 * Erro que o código já tratou mas que ainda queremos ver. Erro não tratado o
 * Sentry pega sozinho.
 */
export function captureError(error, context = {}) {
  if (sentry) sentry.captureException(error, { extra: context });
  else console.error(error, context);
}
