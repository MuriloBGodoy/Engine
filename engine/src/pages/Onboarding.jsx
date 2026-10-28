import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Car, Loader2, LogOut, Target } from "lucide-react";
import { useTranslation } from "react-i18next";
import { engineDB } from "../services/db";
import { acceptTerms } from "../services/onboarding";
import { captureError } from "../services/observability";
import { useSignOut } from "../hooks/useSignOut";
import { LogoMark } from "../components/Logo";

const inputClass =
  "h-12 w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 text-base text-[var(--engine-text)] placeholder-[var(--engine-text-subtle)] outline-none transition-colors focus:border-[var(--engine-accent)]";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[var(--engine-text)]";
const primaryClass =
  "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--engine-accent)] px-5 text-[15px] font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60";
const quietClass =
  "mx-auto flex min-h-11 items-center justify-center gap-2 px-3 text-sm font-semibold text-[var(--engine-text-muted)] transition-colors hover:text-[var(--engine-text)]";

const MIN_USERNAME = 3;

/** Moldura comum aos dois passos: fundo do app, marca e cartão central. */
function Frame({ children }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center bg-[var(--engine-bg)] px-4 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-[calc(1.5rem+env(safe-area-inset-top))] text-[var(--engine-text)] sm:justify-center sm:py-10">
      <div className="w-full max-w-lg">
        <div className="mb-5 flex items-center gap-2.5">
          <LogoMark size={32} />
          <span className="font-display text-lg font-extrabold italic uppercase tracking-tight">Engine</span>
        </div>
        <div className="engine-card p-5 sm:p-8">{children}</div>
      </div>
    </div>
  );
}

function Header({ kicker, title, subtitle }) {
  return (
    <header className="mb-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--engine-text-muted)]">{kicker}</p>
      <h1 className="mt-1.5 font-display text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--engine-text-muted)]">{subtitle}</p>
    </header>
  );
}

/**
 * Passo 1 — o que falta para a conta poder usar o app: nome de usuário (quem
 * entrou pelo Google nascia `@engine.xxxxxx`) e o aceite de 18+ e dos termos,
 * gravado pelo servidor com data. Só aparece o que falta de fato.
 */
function AccountStep({ user, settings, onSettingsUpdate, needsConsent, consentOutdated, needsUsername, onDone }) {
  const { t } = useTranslation();
  const signOut = useSignOut();
  const [name, setName] = useState(() => settings?.profile?.displayName || user?.displayName || "");
  const [username, setUsername] = useState(() =>
    engineDB.normalizeUsername(String(user?.email || "").split("@")[0]),
  );
  const [adult, setAdult] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handle = username.replace(/^@/, "");
  const onlyTerms = needsConsent && !needsUsername;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (needsUsername) {
      if (!name.trim()) return setError(t("onboarding.nameRequired"));
      if (handle.length < MIN_USERNAME) return setError(t("onboarding.usernameRequired"));
    }
    if (needsConsent && !adult) return setError(t("onboarding.consentRequired"));

    setSaving(true);
    try {
      if (needsUsername) {
        if ((await engineDB.isUsernameAvailable(username)) === false) {
          setError(t("onboarding.usernameTaken"));
          return;
        }
        // Relê antes de gravar: o perfil inteiro vai junto no salvamento, e
        // uma cópia velha apagaria avatar, bio ou cidade.
        const fresh = (await engineDB.getSettings().catch(() => null)) || settings;
        const next = {
          ...fresh,
          profile: { ...fresh.profile, displayName: name.trim(), username },
        };
        const saved = await engineDB.saveSettings(next, user.uid);
        onSettingsUpdate(saved);
      }
      if (needsConsent) await acceptTerms(user.uid);
      onDone();
    } catch (err) {
      if (err?.code === "username-taken") {
        setError(t("onboarding.usernameTaken"));
      } else {
        captureError(err, { action: "onboarding" });
        setError(t("onboarding.saveError"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Frame>
      <Header
        kicker={t("onboarding.kicker")}
        title={t(consentOutdated && onlyTerms ? "onboarding.titleTerms" : "onboarding.title")}
        subtitle={t(consentOutdated && onlyTerms ? "onboarding.subtitleTerms" : "onboarding.subtitle")}
      />

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {needsUsername && (
          <>
            <div>
              <label htmlFor="onb-name" className={labelClass}>
                {t("onboarding.nameLabel")}
              </label>
              <input
                id="onb-name"
                type="text"
                className={inputClass}
                value={name}
                maxLength={80}
                autoComplete="name"
                placeholder={t("onboarding.namePlaceholder")}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="onb-username" className={labelClass}>
                {t("onboarding.usernameLabel")}
              </label>
              <input
                id="onb-username"
                type="text"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="username"
                className={inputClass}
                value={username}
                placeholder="@engine"
                aria-describedby="onb-username-hint"
                onChange={(event) => setUsername(engineDB.normalizeUsername(event.target.value))}
              />
              <p id="onb-username-hint" className="mt-1.5 text-xs leading-relaxed text-[var(--engine-text-muted)]">
                {t("onboarding.usernameHint", { username: username || "@voce" })}
              </p>
            </div>
          </>
        )}

        {needsConsent && (
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-3.5 text-sm leading-relaxed text-[var(--engine-text)]">
            <input
              type="checkbox"
              checked={adult}
              onChange={(event) => setAdult(event.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--engine-accent)]"
            />
            <span>
              {t("onboarding.consentBefore")}{" "}
              <Link to="/termos" target="_blank" className="font-semibold underline underline-offset-2">
                {t("onboarding.terms")}
              </Link>{" "}
              {t("onboarding.and")}{" "}
              <Link to="/privacidade" target="_blank" className="font-semibold underline underline-offset-2">
                {t("onboarding.privacy")}
              </Link>
              .
            </span>
          </label>
        )}

        {error && (
          <p role="alert" className="rounded-xl border border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] px-3.5 py-2.5 text-sm font-semibold text-[var(--engine-text)]">
            {error}
          </p>
        )}

        <button type="submit" disabled={saving} className={primaryClass}>
          {saving ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
          {t("onboarding.continue")}
        </button>
      </form>

      <div className="mt-5 border-t border-[var(--engine-border)] pt-4 text-center">
        {user?.email && (
          <p className="text-xs text-[var(--engine-text-muted)]">{t("onboarding.signedInAs", { email: user.email })}</p>
        )}
        <button type="button" onClick={signOut} className={quietClass}>
          <LogOut size={16} />
          {t("onboarding.signOut")}
        </button>
      </div>
    </Frame>
  );
}

/**
 * Passo 2 — só para conta sem carro: o que é a Garagem e os dois tipos de
 * carro, que o vazio da Garagem não explica. Um botão abre o cadastro.
 */
function GarageIntroStep({ onAddCar, onSkip }) {
  const { t } = useTranslation();
  const cards = [
    { key: "owned", icon: Car },
    { key: "goal", icon: Target },
  ];
  return (
    <Frame>
      <Header
        kicker={t("onboarding.next.kicker")}
        title={t("onboarding.next.title")}
        subtitle={t("onboarding.next.subtitle")}
      />
      <ul className="grid gap-3 sm:grid-cols-2">
        {cards.map(({ key, icon }) => {
          const Icon = icon;
          return (
          <li key={key} className="rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]">
              <Icon size={20} aria-hidden="true" />
            </span>
            <p className="mt-3 text-[15px] font-bold">{t(`onboarding.next.${key}Title`)}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--engine-text-muted)]">
              {t(`onboarding.next.${key}Body`)}
            </p>
          </li>
          );
        })}
      </ul>
      <div className="mt-6 space-y-2">
        <button type="button" onClick={onAddCar} className={primaryClass}>
          <Car size={18} />
          {t("onboarding.next.add")}
        </button>
        <button type="button" onClick={onSkip} className={quietClass}>
          {t("onboarding.next.later")}
        </button>
      </div>
    </Frame>
  );
}

/**
 * Primeiro uso, comum ao cadastro por e-mail e ao Google. O App mostra esta
 * tela no lugar de qualquer rota logada enquanto faltar algo do passo 1; o
 * passo 2 aparece uma vez, logo depois, para conta sem carro.
 */
export function Onboarding({
  user,
  settings,
  onSettingsUpdate,
  needsConsent,
  consentOutdated,
  needsUsername,
  onAccountDone,
  onAddCar,
  onSkipIntro,
}) {
  if (needsConsent || needsUsername) {
    return (
      <AccountStep
        user={user}
        settings={settings}
        onSettingsUpdate={onSettingsUpdate}
        needsConsent={needsConsent}
        consentOutdated={consentOutdated}
        needsUsername={needsUsername}
        onDone={onAccountDone}
      />
    );
  }
  return <GarageIntroStep onAddCar={onAddCar} onSkip={onSkipIntro} />;
}
