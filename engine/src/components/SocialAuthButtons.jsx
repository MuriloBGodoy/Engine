import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FcGoogle } from "react-icons/fc";
import { FaFacebookF } from "react-icons/fa6";
import { signInWithProvider } from "../services/supabase";
import { safeNextPath } from "../services/authRedirect";

/**
 * Botões de login social (Google, Facebook). Compartilhado por Login e
 * Register.
 *
 * No Supabase o login social é REDIRECIONAMENTO: a página sai para o Google e
 * volta logada. Não existe mais popup bloqueado nem popup fechado.
 *
 * Cada provedor precisa estar ligado no painel do Supabase (Authentication →
 * Providers), com o Client ID e o segredo do app no Google Cloud / Meta. Botão
 * de provedor desligado levaria a uma página de erro em JSON do servidor —
 * por isso a lista abaixo pergunta ao servidor quais estão ligados e só
 * mostra esses.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

let enabledProviders = null;
const loadEnabledProviders = async () => {
  if (enabledProviders) return enabledProviders;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_KEY },
    });
    const settings = await response.json();
    enabledProviders = settings?.external || {};
  } catch {
    enabledProviders = {};
  }
  return enabledProviders;
};

export function SocialAuthButtons({ redirectPath = "/" }) {
  const { t } = useTranslation();
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const [enabled, setEnabled] = useState(enabledProviders);

  useEffect(() => {
    let alive = true;
    loadEnabledProviders().then((providers) => {
      if (alive) setEnabled(providers);
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleSocial = async (key) => {
    setError("");
    setPending(key);
    try {
      // Volta logado para onde a pessoa ia (o `?next=` já validado pela
      // tela) ou para a home. Quem acabou de criar a conta pelo Google cai no
      // mesmo lugar que quem já tinha.
      await signInWithProvider(key, safeNextPath(redirectPath) || "/");
    } catch (err) {
      console.error("Social sign-in falhou:", err?.code, err?.message);
      setError(t("auth.social.error"));
      setPending("");
    }
  };

  const buttons = [
    {
      key: "google",
      label: t("auth.social.google"),
      icon: <FcGoogle size={20} />,
      className:
        "border border-[var(--engine-border)] bg-white text-[#1f1f1f] hover:brightness-95",
    },
    {
      key: "facebook",
      label: t("auth.social.facebook"),
      icon: <FaFacebookF size={17} />,
      className: "bg-[#1877F2] text-white hover:brightness-110",
    },
  ];

  const visible = buttons.filter((button) => enabled?.[button.key]);
  if (!visible.length) return null;

  // O divisor "ou" mora aqui: sem provedor ligado, some junto com os botões.
  return (
    <>
    <div className="flex flex-col gap-2.5">
      {visible.map((button) => (
        <button
          key={button.key}
          type="button"
          disabled={Boolean(pending)}
          onClick={() => handleSocial(button.key)}
          className={`flex h-11 items-center justify-center gap-2.5 rounded-xl text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${button.className}`}
        >
          <span className="flex h-5 w-5 items-center justify-center">{button.icon}</span>
          {button.label}
        </button>
      ))}
      {error && <p className="auth-feedback auth-feedback-error">{error}</p>}
    </div>

    <div className="my-4 flex items-center gap-3">
      <span className="h-px flex-1 bg-[var(--engine-border)]" />
      <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--engine-text-subtle)]">
        {t("auth.social.or")}
      </span>
      <span className="h-px flex-1 bg-[var(--engine-border)]" />
    </div>
    </>
  );
}
