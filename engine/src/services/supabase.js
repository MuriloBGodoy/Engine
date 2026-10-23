import { createClient } from "@supabase/supabase-js";

/**
 * Cliente do Supabase e a camada de autenticação do app.
 *
 * Até 16/10/2026 o Engine falava com o Firebase. As telas foram escritas
 * contra o formato de usuário dele (`user.uid`, `user.displayName`,
 * `user.photoURL`, `user.providerData`), e esse formato continua sendo o que
 * sai daqui: `toEngineUser` traduz o usuário do Supabase. Assim a troca de
 * backend não espalha `user.id` por sessenta componentes.
 *
 * Os erros também saem com o `code` no estilo antigo (`auth/wrong-password`,
 * `auth/email-already-in-use`...), porque é por ele que as telas escolhem a
 * mensagem certa.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // O link de redefinir senha e a volta do login com Google chegam com a
    // sessão na URL. Fluxo implícito de propósito: o PKCE guarda o
    // verificador no navegador que PEDIU o e-mail, e quem abre o link no
    // celular depois de pedir no computador ficaria preso.
    detectSessionInUrl: true,
    flowType: "implicit",
  },
});

const PROVIDER_IDS = { email: "password", google: "google.com", facebook: "facebook.com" };

const toEngineUser = (user) => {
  if (!user) return null;
  const meta = user.user_metadata || {};
  return {
    uid: user.id,
    email: user.email || "",
    displayName: meta.full_name || meta.name || "",
    photoURL: meta.avatar_url || meta.picture || "",
    emailVerified: Boolean(user.email_confirmed_at),
    providerData: (user.identities || []).map((identity) => ({
      providerId: PROVIDER_IDS[identity.provider] || identity.provider,
    })),
    metadata: { creationTime: user.created_at, lastSignInTime: user.last_sign_in_at },
    getIdToken: async () => (await supabase.auth.getSession()).data.session?.access_token || "",
  };
};

/**
 * `auth.currentUser` é síncrono, como era no Firebase: muitos serviços só
 * perguntam "tem alguém logado?" sem esperar nada. Ele é atualizado a cada
 * evento de sessão, e começa nulo até a sessão salva ser lida.
 */
export const auth = { currentUser: null };

// O link do e-mail de redefinir senha abre uma sessão de recuperação. A tela
// de redefinir pergunta por esta bandeira para saber se mostra o formulário
// de senha nova.
let recoveryPending = false;
export const isPasswordRecovery = () => recoveryPending;

const listeners = new Set();
let ready = false;

supabase.auth.onAuthStateChange((event, session) => {
  const previous = auth.currentUser;
  const next = toEngineUser(session?.user || null);
  auth.currentUser = next;
  if (event === "PASSWORD_RECOVERY") recoveryPending = true;
  // Renovar o token a cada hora não é troca de usuário: avisar as telas
  // recarregaria a garagem inteira sem motivo.
  if (ready && event === "TOKEN_REFRESHED" && previous?.uid === next?.uid) return;
  ready = true;
  // Fora do callback: chamar o Supabase de dentro dele trava a sessão.
  setTimeout(() => listeners.forEach((listener) => listener(next, event)), 0);
});

/** Mesmo papel do `onAuthStateChanged` do Firebase. Devolve o cancelamento. */
export const onAuthChange = (listener) => {
  listeners.add(listener);
  if (ready) setTimeout(() => listener(auth.currentUser, "INITIAL_SESSION"), 0);
  return () => listeners.delete(listener);
};

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

const AUTH_ERROR_CODES = {
  invalid_credentials: "auth/invalid-credential",
  user_already_exists: "auth/email-already-in-use",
  email_exists: "auth/email-already-in-use",
  weak_password: "auth/weak-password",
  email_address_invalid: "auth/invalid-email",
  validation_failed: "auth/invalid-email",
  over_email_send_rate_limit: "auth/too-many-requests",
  over_request_rate_limit: "auth/too-many-requests",
  same_password: "auth/same-password",
  user_not_found: "auth/user-not-found",
  email_not_confirmed: "auth/email-not-verified",
};

const authError = (error) => {
  if (!error) return null;
  const code =
    AUTH_ERROR_CODES[error.code] ||
    (error.status === 429 ? "auth/too-many-requests" : null) ||
    (/network|fetch/i.test(error.message || "") ? "auth/network-request-failed" : "auth/unknown");
  return Object.assign(new Error(error.message || code), { code, cause: error });
};

const unwrap = ({ data, error }) => {
  if (error) throw authError(error);
  return data;
};

const appUrl = (path) => `${window.location.origin}${path}`;

// ---------------------------------------------------------------------------
// Ações de conta
// ---------------------------------------------------------------------------

export async function signInWithEmail(email, password) {
  const data = unwrap(await supabase.auth.signInWithPassword({ email, password }));
  return toEngineUser(data.user);
}

export async function signUpWithEmail(email, password, { displayName = "" } = {}) {
  const data = unwrap(
    await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: displayName, name: displayName } },
    }),
  );
  // Com e-mail já cadastrado e confirmação desligada, o Supabase devolve um
  // usuário sem identidade em vez de erro (para não confirmar quem existe).
  // A tela de cadastro precisa do aviso de sempre.
  if (data.user && !data.user.identities?.length) {
    throw Object.assign(new Error("Este e-mail já está cadastrado."), {
      code: "auth/email-already-in-use",
    });
  }
  return toEngineUser(data.user);
}

/**
 * Login social. No Supabase é REDIRECIONAMENTO, não janela: a página sai para
 * o Google e volta logada em `redirectPath`.
 */
export async function signInWithProvider(provider, redirectPath = window.location.pathname) {
  unwrap(
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: appUrl(redirectPath) },
    }),
  );
}

export async function sendPasswordReset(email) {
  unwrap(
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl("/reset-password") }),
  );
}

export async function setNewPassword(password) {
  unwrap(await supabase.auth.updateUser({ password }));
  recoveryPending = false;
}

/**
 * Confere a senha atual antes de uma ação sensível (trocar senha, excluir a
 * conta). O Supabase não tem "reautenticar"; entrar de novo com a mesma
 * senha prova a mesma coisa e renova a sessão.
 */
export async function verifyCurrentPassword(password) {
  const email = auth.currentUser?.email;
  if (!email) throw Object.assign(new Error("Sem e-mail."), { code: "auth/user-not-found" });
  unwrap(await supabase.auth.signInWithPassword({ email, password }));
}

export async function updateAuthProfile({ displayName, photoURL } = {}) {
  const data = {};
  if (displayName !== undefined) Object.assign(data, { full_name: displayName, name: displayName });
  // Foto em base64 não vai para o token: ela viajaria em toda requisição.
  if (photoURL !== undefined && !String(photoURL).startsWith("data:")) data.avatar_url = photoURL;
  if (!Object.keys(data).length) return;
  unwrap(await supabase.auth.updateUser({ data }));
}

export async function signOut() {
  unwrap(await supabase.auth.signOut());
}

// ---------------------------------------------------------------------------
// Ajudantes de dados, usados por todos os serviços
// ---------------------------------------------------------------------------

/**
 * `{ data, error }` do PostgREST → dado ou exceção. A exceção leva o `code`
 * do Postgres e a mensagem que as funções do banco levantam (`tag-taken`,
 * `username-taken`, `event-full`...) — é por ela que as telas reagem.
 */
export const must = ({ data, error }) => {
  if (error) {
    throw Object.assign(new Error(error.message || "Falha ao falar com o servidor."), {
      code: error.message && /^[a-z-]+$/.test(error.message) ? error.message : error.code,
      details: error.details,
      cause: error,
    });
  }
  return data;
};

/** Agora em ISO — é o formato de data que as telas recebem. */
export const nowIso = () => new Date().toISOString();

/**
 * Escuta mudanças numa tabela e chama `reload` (com uma pausa curta, para
 * uma rajada de mudanças virar uma releitura só). Devolve o cancelamento.
 *
 * O Realtime respeita a RLS: cada um só é avisado do que pode ler.
 */
export const watchTable = (channelName, { table, filter }, reload) => {
  let timer = null;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(reload, 150);
  };
  const channel = supabase
    .channel(`${channelName}:${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, schedule)
    .subscribe();
  return () => {
    window.clearTimeout(timer);
    supabase.removeChannel(channel);
  };
};
