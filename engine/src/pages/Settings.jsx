import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Bell,
  BellOff,
  Check,
  ChevronRight,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Palette,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import {
  EmailAuthProvider,
  FacebookAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  updatePassword,
  verifyBeforeUpdateEmail,
} from "firebase/auth";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { engineDB } from "../services/db";
import { auth } from "../services/firebase";
import { getMyClubs } from "../services/clubs";
import { languageOptions } from "../services/languages";
import { countries, getStates } from "../services/locations";
import { NOTIFICATION_PREFERENCES } from "../services/notifications";
import {
  ACCOUNT_DELETION_STEPS,
  AccountDeletionIncomplete,
  deleteAccountEverywhere,
} from "../services/accountDeletion";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/ToastProvider";
import { useRegion } from "../hooks/RegionProvider";
import { useHistoryDismiss } from "../hooks/useHistoryDismiss";
import { useIsPremium } from "../hooks/useIsPremium";

const inputClass =
  "w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 py-3 text-base text-[var(--engine-text)] placeholder-[var(--engine-text-subtle)] outline-none transition-colors focus:border-[var(--engine-accent)] sm:text-sm";
const selectClass =
  "max-w-[11rem] truncate rounded-lg border border-[var(--engine-border)] bg-[var(--engine-surface-2)] py-2 pl-3 pr-9 text-base font-semibold text-[var(--engine-text)] outline-none focus:border-[var(--engine-accent)] sm:max-w-[14rem] sm:text-sm";
const primaryButton =
  "flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50";
const secondaryButton =
  "flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--engine-border)] px-5 py-2.5 text-sm font-bold text-[var(--engine-text)] transition-colors hover:bg-[var(--engine-surface-2)] disabled:opacity-50";

const SECTIONS = ["account", "notifications", "privacy", "app"];

// Mensagem do Firebase vem em inglês e com o código no meio ("Firebase:
// Error (auth/wrong-password)"). Até 05/10/2026 ela ia crua para a tela.
const authErrorKey = (error) => {
  const code = error?.code || "";
  const known = {
    "auth/wrong-password": "wrongPassword",
    "auth/invalid-credential": "wrongPassword",
    "auth/invalid-login-credentials": "wrongPassword",
    "auth/too-many-requests": "tooManyRequests",
    "auth/weak-password": "weakPassword",
    "auth/email-already-in-use": "emailInUse",
    "auth/invalid-email": "invalidEmail",
    "auth/requires-recent-login": "recentLogin",
    "auth/popup-closed-by-user": "popupClosed",
    "auth/cancelled-popup-request": "popupClosed",
    "auth/popup-blocked": "popupBlocked",
    "auth/user-mismatch": "userMismatch",
    "auth/network-request-failed": "network",
  };
  return `settings.authErrors.${known[code] || "generic"}`;
};

const socialProviders = {
  "google.com": () => new GoogleAuthProvider(),
  "facebook.com": () => new FacebookAuthProvider(),
};

const providerLabels = {
  password: "E-mail",
  "google.com": "Google",
  "facebook.com": "Facebook",
};

// A LINHA inteira é o interruptor, como nos Ajustes do iOS: o desenho de
// 48×28 sozinho ficava abaixo dos 44–48 px de toque, e tocar no texto não
// fazia nada.
function SwitchRow({ icon: Icon, label, hint, checked, onChange }) {
  const hintId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={hint ? hintId : undefined}
      onClick={() => onChange(!checked)}
      className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--engine-surface-2)] active:bg-[var(--engine-surface-2)]"
    >
      {Icon && <Icon size={18} className="shrink-0 text-[var(--engine-text-muted)]" />}
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-semibold text-[var(--engine-text)]">
          {label}
        </span>
        {hint && (
          <span
            id={hintId}
            className="mt-0.5 block text-xs leading-relaxed text-[var(--engine-text-muted)]"
          >
            {hint}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          checked ? "bg-[var(--engine-accent)]" : "bg-[var(--engine-border-strong)]"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </span>
    </button>
  );
}

// Lista agrupada, o desenho de Ajustes do iOS e do Instagram: um título
// pequeno, linhas separadas por fio, nota de rodapé explicando o grupo.
function Group({ title, footer, children }) {
  return (
    <section className="space-y-2">
      {title && (
        <h3 className="px-1 text-xs font-bold uppercase tracking-wider text-[var(--engine-text-muted)]">
          {title}
        </h3>
      )}
      <div className="engine-card divide-y divide-[var(--engine-border)] overflow-hidden p-0">
        {children}
      </div>
      {footer && (
        <p className="px-1 text-xs leading-relaxed text-[var(--engine-text-muted)]">
          {footer}
        </p>
      )}
    </section>
  );
}

function Row({ icon: Icon, label, hint, children, onClick, tone = "default", chevron = false }) {
  const content = (
    <>
      {Icon && (
        <Icon
          size={18}
          className={`shrink-0 ${
            tone === "danger" ? "text-[var(--engine-accent)]" : "text-[var(--engine-text-muted)]"
          }`}
        />
      )}
      <span className="min-w-0 flex-1">
        <span
          className={`block break-words text-sm font-semibold ${
            tone === "danger" ? "text-[var(--engine-accent)]" : "text-[var(--engine-text)]"
          }`}
        >
          {label}
        </span>
        {hint && (
          <span className="mt-0.5 block text-xs leading-relaxed text-[var(--engine-text-muted)]">
            {hint}
          </span>
        )}
      </span>
      {children}
      {chevron && (
        <ChevronRight size={18} className="shrink-0 text-[var(--engine-text-subtle)]" />
      )}
    </>
  );

  const rowClass = "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left";
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${rowClass} transition-colors hover:bg-[var(--engine-surface-2)] active:bg-[var(--engine-surface-2)]`}
      >
        {content}
      </button>
    );
  }
  return <div className={rowClass}>{content}</div>;
}

function Segmented({ value, options, onChange, label }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex shrink-0 rounded-lg border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`min-h-11 rounded-md px-3 text-xs font-bold transition-colors sm:min-h-0 sm:px-2.5 sm:py-1.5 ${
            value === option.value
              ? "bg-[var(--engine-accent)] text-white"
              : "text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// Sem esta lista, bloquear seria via de mão única: o menu do post esconde a
// pessoa e não sobra lugar nenhum pra voltar atrás.
function BlockedUsers({ t, userId }) {
  const [blocked, setBlocked] = useState(null);
  const [profiles, setProfiles] = useState({});
  const [busyId, setBusyId] = useState("");
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    engineDB
      .getBlockedUsers(userId)
      .then(async (ids) => {
        if (!alive) return;
        setBlocked(ids);
        // Só os perfis de quem está bloqueado, para mostrar nome e foto.
        const found = await engineDB.getPublicProfilesByIds(ids);
        if (alive) setProfiles(found);
      })
      .catch((error) => {
        console.error(error);
        if (alive) setBlocked([]);
      });

    return () => {
      alive = false;
    };
  }, [userId]);

  const unblock = async (blockedId) => {
    setBusyId(blockedId);
    try {
      await engineDB.setUserBlocked(blockedId, false, userId);
      setBlocked((current) => current.filter((item) => item !== blockedId));
    } catch (error) {
      console.error(error);
      toast(t("settings.status.saveError"), "error");
    } finally {
      setBusyId("");
    }
  };

  return (
    <Group title={t("settings.privacy.blockedTitle")} footer={t("settings.privacy.blockedHint")}>
      {blocked === null ? (
        <Row label={<Loader2 size={16} className="animate-spin" />} />
      ) : blocked.length ? (
        blocked.map((blockedId) => {
          const person = profiles[blockedId] || {};
          const username = (person.username || "").replace(/^@/, "");
          return (
            <Row
              key={blockedId}
              label={person.author || t("settings.privacy.blockedUnknown")}
              hint={username ? `@${username}` : undefined}
            >
              <button
                type="button"
                onClick={() => unblock(blockedId)}
                disabled={busyId === blockedId}
                className="min-h-11 shrink-0 rounded-lg border border-[var(--engine-border)] px-3 text-xs font-bold text-[var(--engine-text)] transition-colors hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] disabled:opacity-50"
              >
                {t("settings.privacy.unblock")}
              </button>
            </Row>
          );
        })
      ) : (
        <Row label={t("settings.privacy.blockedEmpty")} />
      )}
    </Group>
  );
}

function ChangePasswordForm({ t, user, onDone }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmNext, setConfirmNext] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (next.length < 6) return setError(t("settings.authErrors.weakPassword"));
    if (next !== confirmNext) return setError(t("settings.account.passwordMismatch"));
    setBusy(true);
    try {
      await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(user.email, current),
      );
      await updatePassword(user, next);
      toast(t("settings.account.passwordChanged"));
      onDone();
    } catch (err) {
      setError(t(authErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 px-4 pb-4">
      <input type="email" autoComplete="username" value={user.email || ""} readOnly hidden />
      <input
        type="password"
        autoComplete="current-password"
        className={inputClass}
        placeholder={t("settings.account.currentPassword")}
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        required
      />
      <input
        type="password"
        autoComplete="new-password"
        className={inputClass}
        placeholder={t("settings.account.newPassword")}
        value={next}
        onChange={(e) => setNext(e.target.value)}
        required
      />
      <input
        type="password"
        autoComplete="new-password"
        className={inputClass}
        placeholder={t("settings.account.confirmPassword")}
        value={confirmNext}
        onChange={(e) => setConfirmNext(e.target.value)}
        required
      />
      {error && <p className="text-sm font-semibold text-[var(--engine-accent)]">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy && <Loader2 size={16} className="animate-spin" />}
          {t("settings.account.savePassword")}
        </button>
        <button type="button" onClick={onDone} className={secondaryButton}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

// `updateEmail` é recusado em projeto com proteção contra enumeração de
// e-mail (o padrão do Firebase desde 2023): o caminho é mandar o link para o
// endereço NOVO e a troca só acontece quando a pessoa confirma lá.
function ChangeEmailForm({ t, user, onDone }) {
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    const email = newEmail.trim();
    if (email.toLowerCase() === (user.email || "").toLowerCase()) {
      return setError(t("settings.account.sameEmail"));
    }
    setBusy(true);
    try {
      await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(user.email, password),
      );
      await verifyBeforeUpdateEmail(user, email);
      toast(t("settings.account.emailLinkSent", { email }), { tone: "info", duration: 7000 });
      onDone();
    } catch (err) {
      setError(t(authErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 px-4 pb-4">
      <input
        type="email"
        autoComplete="email"
        className={inputClass}
        placeholder={t("settings.account.newEmail")}
        value={newEmail}
        onChange={(e) => setNewEmail(e.target.value)}
        required
      />
      <input
        type="password"
        autoComplete="current-password"
        className={inputClass}
        placeholder={t("settings.account.currentPassword")}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <p className="text-xs text-[var(--engine-text-muted)]">
        {t("settings.account.emailChangeHint")}
      </p>
      {error && <p className="text-sm font-semibold text-[var(--engine-accent)]">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy && <Loader2 size={16} className="animate-spin" />}
          {t("settings.account.sendLink")}
        </button>
        <button type="button" onClick={onDone} className={secondaryButton}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

// Popup de login dentro do app instalado (PWA no iOS, TWA no Android) é o
// ponto frágil do Firebase Auth: quando falha ali, o caminho é o navegador.
const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

const POPUP_FAILURES = [
  "auth/popup-blocked",
  "auth/popup-closed-by-user",
  "auth/network-request-failed",
];

const noop = () => {};

function DeleteAccountDialog({ t, user, open, onClose }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { isPremium } = useIsPremium(user?.uid);
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState("confirm"); // confirm | running | failed
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [steps, setSteps] = useState({});
  const [foundedClubs, setFoundedClubs] = useState([]);
  const providerIds = (user?.providerData || []).map((item) => item.providerId);
  const usesPassword = providerIds.includes("password");
  const socialId = providerIds.find((id) => socialProviders[id]);

  // Enquanto apaga, voltar NÃO fecha: a entrada de histórico continua nossa
  // e o gesto é engolido — senão o Android saía da tela (ou do app, no TWA)
  // no meio das etapas.
  const running = phase === "running";
  useHistoryDismiss(open, running ? noop : onClose);

  useEffect(() => {
    if (!running) return undefined;
    const hold = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", hold);
    return () => window.removeEventListener("beforeunload", hold);
  }, [running]);

  // Clube fundado é arquivado — a pessoa precisa saber QUAIS antes.
  useEffect(() => {
    if (!open || !user?.uid) return undefined;
    let alive = true;
    getMyClubs()
      .then((clubs) => {
        if (alive) setFoundedClubs(clubs.filter((club) => club.myRole === "founder"));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, user?.uid]);

  if (!open) return null;

  const reauthWithPassword = () =>
    reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));

  const reauthenticate = () =>
    usesPassword
      ? reauthWithPassword()
      : reauthenticateWithPopup(user, socialProviders[socialId]());

  const start = async (event) => {
    event?.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await reauthenticate();
    } catch (err) {
      setError(
        !usesPassword && POPUP_FAILURES.includes(err?.code) && isStandalone()
          ? t("settings.deletion.openInBrowser")
          : t(authErrorKey(err)),
      );
      setBusy(false);
      return;
    }

    setPhase("running");
    setSteps({});
    try {
      await deleteAccountEverywhere(user, {
        onStep: (id, state) => setSteps((current) => ({ ...current, [id]: state })),
        // Com senha dá para renovar o "login recente" sem a pessoa; com
        // Google, se expirar, o erro abaixo pede um novo toque — e as etapas
        // já feitas passam rápido da segunda vez.
        reauthenticate: usesPassword ? reauthWithPassword : null,
      });
      toast(t("settings.deletion.done"), { tone: "info", duration: 6000 });
      navigate("/", { replace: true });
    } catch (err) {
      setPhase("failed");
      setError(
        err instanceof AccountDeletionIncomplete
          ? t("settings.deletion.incomplete")
          : t(authErrorKey(err)),
      );
    } finally {
      setBusy(false);
    }
  };

  const deleted = ["garage", "posts", "services", "events", "profile", "clubs"];
  const showForm = phase === "confirm" || phase === "failed";
  const sidePadding =
    "pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))]";

  // Portal: overlay fixo dentro do conteúdo herda o contexto de empilhamento
  // (e o `backdrop-filter`) dos pais e pode ficar atrás da barra do celular.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--engine-border)] bg-[var(--engine-elevated)] shadow-[var(--engine-shadow-lg)] sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--engine-border)] py-2 pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]">
          <h2
            id="delete-account-title"
            className="text-base font-extrabold text-[var(--engine-text)]"
          >
            {t("settings.deletion.title")}
          </h2>
          {!running && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.close")}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--engine-text-muted)] hover:bg-[var(--engine-surface-2)]"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div
          className={`min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain py-4 ${sidePadding}`}
        >
          {showForm ? (
            <>
              <p className="text-sm text-[var(--engine-text-muted)]">
                {t("settings.deletion.intro")}
              </p>
              <ul className="space-y-1.5">
                {deleted.map((key) => (
                  <li key={key} className="flex gap-2 text-sm text-[var(--engine-text)]">
                    <Trash2 size={15} className="mt-0.5 shrink-0 text-[var(--engine-accent)]" />
                    {t(`settings.deletion.items.${key}`)}
                  </li>
                ))}
              </ul>
              <p className="rounded-xl bg-[var(--engine-surface-2)] px-3 py-2 text-xs text-[var(--engine-text-muted)]">
                {t("settings.deletion.kept")}
              </p>

              {foundedClubs.length > 0 && (
                <p className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-[var(--engine-text)]">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" />
                  {t("settings.deletion.foundedClubs", {
                    clubs: foundedClubs.map((club) => club.name).join(", "),
                  })}
                </p>
              )}

              {isPremium && (
                <p className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-[var(--engine-text)]">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" />
                  {t("settings.deletion.premium")}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--engine-text-muted)]">
                {t("settings.deletion.running")}
              </p>
              <ul className="space-y-2">
                {ACCOUNT_DELETION_STEPS.map((step) => {
                  const state = steps[step.id];
                  return (
                    <li key={step.id} className="flex items-center gap-2 text-sm">
                      {state === "done" ? (
                        <Check size={16} className="text-emerald-500" />
                      ) : state === "failed" ? (
                        <AlertTriangle size={16} className="text-amber-500" />
                      ) : state === "running" ? (
                        <Loader2 size={16} className="animate-spin text-[var(--engine-accent)]" />
                      ) : (
                        <span className="h-4 w-4 rounded-full border border-[var(--engine-border-strong)]" />
                      )}
                      <span
                        className={
                          state ? "text-[var(--engine-text)]" : "text-[var(--engine-text-subtle)]"
                        }
                      >
                        {t(`settings.deletion.steps.${step.id}`)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {/* Senha e botão num rodapé fixo, fora da rolagem: com o teclado
            aberto a folha encolhe e o botão continua à vista. */}
        {showForm && (
          <form
            onSubmit={start}
            className={`shrink-0 space-y-3 border-t border-[var(--engine-border)] pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] ${sidePadding}`}
          >
            {usesPassword ? (
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-[var(--engine-text-muted)]">
                  {t("settings.deletion.passwordLabel")}
                </span>
                <input type="email" autoComplete="username" value={user?.email || ""} readOnly hidden />
                <input
                  type="password"
                  autoComplete="current-password"
                  className={inputClass}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
            ) : (
              <p className="text-xs text-[var(--engine-text-muted)]">
                {t("settings.deletion.socialLabel", {
                  provider: providerLabels[socialId] || "Google",
                })}
              </p>
            )}

            {error && (
              <p role="alert" className="text-sm font-semibold text-[var(--engine-accent)]">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              {phase === "failed" ? t("settings.deletion.retry") : t("settings.deletion.confirm")}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function Settings({ user, settings, onSettingsUpdate }) {
  const { i18n, t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { region, setRegion } = useRegion();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("section");
  const activeSection = SECTIONS.includes(requested) ? requested : "account";
  const [openForm, setOpenForm] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const saveQueue = useRef(Promise.resolve());
  const latest = useRef(settings);
  useEffect(() => {
    latest.current = settings;
  }, [settings]);

  const providerIds = (user?.providerData || []).map((item) => item.providerId);
  const usesPassword = providerIds.includes("password");

  const sections = [
    { id: "account", label: t("settings.sections.account"), icon: UserRound },
    { id: "notifications", label: t("settings.sections.notifications"), icon: Bell },
    { id: "privacy", label: t("settings.sections.privacy"), icon: EyeOff },
    { id: "app", label: t("settings.sections.app"), icon: Palette },
  ];

  const selectSection = (id) => {
    setOpenForm("");
    setSearchParams(id === "account" ? {} : { section: id }, { replace: true });
  };

  // Como nos apps grandes, cada chave grava sozinha — não existe botão
  // "Salvar" para esquecer de apertar. A tela muda na hora; se o servidor
  // recusar, volta ao que era e avisa. A fila evita que dois toques rápidos
  // cheguem fora de ordem e o mais velho vença.
  const updateSetting = (group, key, value) => {
    const previous = latest.current;
    const next = { ...previous, [group]: { ...previous[group], [key]: value } };
    latest.current = next;
    onSettingsUpdate(next);
    if (group === "preferences" && key === "language") i18n.changeLanguage(value);

    saveQueue.current = saveQueue.current
      .then(() => engineDB.saveSettings(next, user.uid))
      .catch((error) => {
        if (latest.current === next) {
          latest.current = previous;
          onSettingsUpdate(previous);
          if (group === "preferences" && key === "language") {
            i18n.changeLanguage(previous.preferences.language);
          }
        }
        toast(error?.message || t("settings.status.saveError"), "error");
      });
  };

  const handleSendVerification = async () => {
    try {
      await sendEmailVerification(user);
      toast(t("settings.account.verificationSent"));
    } catch (error) {
      toast(t(authErrorKey(error)), "error");
    }
  };

  const handlePasswordReset = async () => {
    try {
      await sendPasswordResetEmail(auth, user.email);
      toast(t("settings.account.resetSent", { email: user.email }));
    } catch (error) {
      toast(t(authErrorKey(error)), "error");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      toast(t(authErrorKey(error)), "error");
    }
  };

  const prefs = settings?.preferences || {};
  const notif = settings?.notifications || {};
  const privacy = settings?.privacy || {};
  const states = region.country !== "all" ? getStates(region.country) : [];

  return (
    <section className="space-y-6 sm:space-y-8">
      <div className="border-b border-[var(--engine-border)] pb-4 sm:pb-2">
        <PageHeader eyebrow="Engine Control" title={t("settings.title")} subtitle={t("settings.subtitle")} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[230px_1fr] lg:gap-8">
        <nav className="engine-rail -mx-4 gap-2 px-4 lg:mx-0 lg:sticky lg:top-8 lg:block lg:space-y-1 lg:self-start lg:overflow-visible lg:px-0">
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => selectSection(section.id)}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors lg:w-full lg:gap-3 lg:px-4 lg:py-3 ${
                  isActive
                    ? "bg-[var(--engine-accent)] text-white"
                    : "border border-[var(--engine-border)] text-[var(--engine-text-muted)] hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)] lg:border-0"
                }`}
              >
                <Icon size={17} className="shrink-0" />
                {section.label}
              </button>
            );
          })}
        </nav>

        <div className="max-w-2xl space-y-6">
          {activeSection === "account" && (
            <>
              <Group title={t("settings.account.title")}>
                <Row
                  icon={Mail}
                  label={user?.email}
                  hint={
                    user?.emailVerified
                      ? t("settings.account.verified")
                      : t("settings.account.notVerified")
                  }
                >
                  {!user?.emailVerified && usesPassword && (
                    <button
                      type="button"
                      onClick={handleSendVerification}
                      className="min-h-11 shrink-0 px-2 text-xs font-bold text-[var(--engine-accent)]"
                    >
                      {t("settings.account.resendVerification")}
                    </button>
                  )}
                </Row>
                <Row
                  icon={KeyRound}
                  label={t("settings.account.signInWith")}
                  hint={providerIds.map((id) => providerLabels[id] || id).join(" · ")}
                />
              </Group>

              {usesPassword ? (
                <Group title={t("settings.account.securityTitle")}>
                  <Row
                    label={t("settings.account.changePassword")}
                    chevron={openForm !== "password"}
                    onClick={() => setOpenForm(openForm === "password" ? "" : "password")}
                  />
                  {openForm === "password" && (
                    <ChangePasswordForm t={t} user={user} onDone={() => setOpenForm("")} />
                  )}
                  <Row
                    label={t("settings.account.changeEmail")}
                    chevron={openForm !== "email"}
                    onClick={() => setOpenForm(openForm === "email" ? "" : "email")}
                  />
                  {openForm === "email" && (
                    <ChangeEmailForm t={t} user={user} onDone={() => setOpenForm("")} />
                  )}
                  <Row
                    label={t("settings.account.forgotPassword")}
                    hint={t("settings.account.forgotPasswordHint")}
                    onClick={handlePasswordReset}
                  />
                </Group>
              ) : (
                <Group
                  title={t("settings.account.securityTitle")}
                  footer={t("settings.account.socialOnly", {
                    provider: providerIds.map((id) => providerLabels[id] || id).join(", "),
                  })}
                >
                  <Row label={t("settings.account.managedByProvider")} />
                </Group>
              )}

              <Group>
                <Row icon={LogOut} label={t("settings.account.logout")} onClick={handleLogout} />
                <Row
                  icon={Trash2}
                  tone="danger"
                  label={t("settings.account.deleteAccount")}
                  hint={t("settings.account.deleteAccountHint")}
                  chevron
                  onClick={() => setDeleteOpen(true)}
                />
              </Group>
            </>
          )}

          {activeSection === "notifications" && (
            <>
              <Group footer={t("settings.notifications.pauseHint")}>
                <SwitchRow
                  icon={BellOff}
                  label={t("settings.notifications.pauseAll")}
                  checked={Boolean(notif.pauseAll)}
                  onChange={(value) => updateSetting("notifications", "pauseAll", value)}
                />
              </Group>
              <Group
                title={t("settings.notifications.title")}
                footer={t("settings.notifications.footer")}
              >
                {NOTIFICATION_PREFERENCES.map((key) => (
                  <SwitchRow
                    key={key}
                    label={t(`settings.notifications.types.${key}`)}
                    hint={t(`settings.notifications.hints.${key}`)}
                    checked={notif[key] !== false}
                    onChange={(value) => updateSetting("notifications", key, value)}
                  />
                ))}
              </Group>
            </>
          )}

          {activeSection === "privacy" && (
            <>
              <Group title={t("settings.privacy.title")}>
                <SwitchRow
                  label={t("settings.privacy.hideValues")}
                  hint={t("settings.privacy.hideValuesHint")}
                  checked={Boolean(privacy.lockSensitiveValues)}
                  onChange={(value) => updateSetting("privacy", "lockSensitiveValues", value)}
                />
                <SwitchRow
                  label={t("settings.privacy.showEmail")}
                  hint={t("settings.privacy.showEmailHint")}
                  checked={privacy.showEmailInSidebar !== false}
                  onChange={(value) => updateSetting("privacy", "showEmailInSidebar", value)}
                />
              </Group>
              <BlockedUsers t={t} userId={user?.uid} />
            </>
          )}

          {activeSection === "app" && (
            <>
              <Group title={t("settings.app.appearance")}>
                <Row label={t("settings.fields.theme")}>
                  <Segmented
                    label={t("settings.fields.theme")}
                    value={prefs.theme || "dark"}
                    onChange={(value) => updateSetting("preferences", "theme", value)}
                    options={[
                      { value: "dark", label: t("settings.options.dark") },
                      { value: "light", label: t("settings.options.light") },
                      { value: "system", label: t("settings.options.system") },
                    ]}
                  />
                </Row>
                <Row label={t("settings.fields.navLayout")} hint={t("settings.app.navHint")}>
                  <select
                    className={selectClass}
                    aria-label={t("settings.fields.navLayout")}
                    value={prefs.navLayout || "sidebar"}
                    onChange={(e) => updateSetting("preferences", "navLayout", e.target.value)}
                  >
                    <option value="sidebar">{t("settings.options.navSidebar")}</option>
                    <option value="topnav">{t("settings.options.navTopnav")}</option>
                  </select>
                </Row>
              </Group>

              <Group title={t("settings.app.languageRegion")} footer={t("settings.app.regionHint")}>
                <Row label={t("settings.fields.language")}>
                  <select
                    className={selectClass}
                    aria-label={t("settings.fields.language")}
                    value={prefs.language || "pt-BR"}
                    onChange={(e) => updateSetting("preferences", "language", e.target.value)}
                  >
                    {languageOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label={t("region.country")}>
                  <select
                    className={selectClass}
                    aria-label={t("region.country")}
                    value={region.country}
                    onChange={(e) => setRegion({ country: e.target.value, state: "all" })}
                  >
                    <option value="all">{t("region.all")}</option>
                    {countries.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.flag} {item.name}
                      </option>
                    ))}
                  </select>
                </Row>
                {states.length > 0 && (
                  <Row label={t("region.state")}>
                    <select
                      className={selectClass}
                      aria-label={t("region.state")}
                      value={region.state}
                      onChange={(e) => setRegion({ country: region.country, state: e.target.value })}
                    >
                      <option value="all">{t("region.allStates")}</option>
                      {states.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Row>
                )}
              </Group>

              <Group title={t("settings.app.garage")}>
                <Row label={t("settings.fields.garageOrder")}>
                  <select
                    className={selectClass}
                    aria-label={t("settings.fields.garageOrder")}
                    value={prefs.defaultGarageSort || "progress-desc"}
                    onChange={(e) =>
                      updateSetting("preferences", "defaultGarageSort", e.target.value)
                    }
                  >
                    <option value="progress-desc">{t("settings.options.highestProgress")}</option>
                    <option value="progress-asc">{t("settings.options.lowestProgress")}</option>
                    <option value="target-desc">{t("settings.options.highestValue")}</option>
                    <option value="name-asc">{t("settings.options.nameAZ")}</option>
                  </select>
                </Row>
              </Group>
            </>
          )}
        </div>
      </div>

      <DeleteAccountDialog
        t={t}
        user={user}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
      />
    </section>
  );
}
