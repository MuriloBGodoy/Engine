import { useEffect, useState } from "react";
import { ArrowLeft, KeyRound, Loader2, Mail } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthShell } from "../components/AuthShell";
import {
  isPasswordRecovery,
  onAuthChange,
  sendPasswordReset,
  setNewPassword,
  signOut,
} from "../services/supabase";

export function ResetPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // O link do e-mail abre esta página já com uma sessão de recuperação (o
  // Supabase lê o token da URL). É ela que libera o formulário de senha nova.
  const [hasResetCode, setHasResetCode] = useState(
    () => isPasswordRecovery() || window.location.hash.includes("type=recovery"),
  );
  useEffect(
    () =>
      onAuthChange((_user, event) => {
        if (event === "PASSWORD_RECOVERY") setHasResetCode(true);
      }),
    [],
  );

  const handleSendEmail = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      await sendPasswordReset(email.trim());
      setMessage(t("auth.resetEmailSent"));
    } catch {
      setError(t("auth.resetEmailError"));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    if (password !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      setLoading(false);
      return;
    }

    try {
      await setNewPassword(password);
      // A sessão de recuperação serve só para trocar a senha: sai dela e
      // entra de novo com a senha nova, como era antes.
      await signOut().catch(() => {});
      setMessage(t("auth.passwordResetSuccess"));
      setPassword("");
      setConfirmPassword("");
      window.setTimeout(() => navigate("/login"), 1400);
    } catch {
      setError(t("auth.passwordResetError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      compact
      kicker={t("auth.resetKicker")}
      title={hasResetCode ? t("auth.resetPasswordTitle") : t("auth.forgotPasswordTitle")}
      subtitle={
        hasResetCode
          ? t("auth.resetPasswordSubtitle")
          : t("auth.forgotPasswordSubtitle")
      }
    >
      {hasResetCode ? (
        <form onSubmit={handleConfirmReset} className="auth-form">
          <label className="auth-field">
            <span>{t("common.newPassword")}</span>
            <input
              type="password"
              placeholder={t("auth.newPasswordPlaceholder")}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>
          <label className="auth-field">
            <span>{t("common.confirmPassword")}</span>
            <input
              type="password"
              placeholder={t("auth.confirmPasswordPlaceholder")}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>

          {error && <p className="auth-feedback auth-feedback-error">{error}</p>}
          {message && <p className="auth-feedback auth-feedback-success">{message}</p>}

          <button type="submit" disabled={loading} className="auth-submit">
            {loading ? <Loader2 className="animate-spin" /> : <KeyRound size={18} />}
            {t("auth.saveNewPassword")}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSendEmail} className="auth-form">
          <label className="auth-field">
            <span>{t("common.email")}</span>
            <input
              type="email"
              placeholder={t("auth.loginEmailPlaceholder")}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          {error && <p className="auth-feedback auth-feedback-error">{error}</p>}
          {message && <p className="auth-feedback auth-feedback-success">{message}</p>}

          <button type="submit" disabled={loading} className="auth-submit">
            {loading ? <Loader2 className="animate-spin" /> : <Mail size={18} />}
            {t("auth.sendResetEmail")}
          </button>
        </form>
      )}

      <p className="auth-switch-copy">
        <Link to="/login" className="auth-back-link">
          <ArrowLeft size={16} />
          {t("auth.backToLogin")}
        </Link>
      </p>
    </AuthShell>
  );
}
