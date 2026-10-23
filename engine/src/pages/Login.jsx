import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Lock, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { sendPasswordReset, signInWithEmail } from "../services/supabase";
import { AuthShell } from "../components/AuthShell";
import { SocialAuthButtons } from "../components/SocialAuthButtons";

export function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      await signInWithEmail(email.trim(), password);
      navigate("/");
    } catch {
      setError(t("auth.loginError"));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setError(t("auth.resetEmailRequired"));
      return;
    }

    setResetLoading(true);
    setError("");
    setMessage("");

    try {
      await sendPasswordReset(cleanEmail);
      setMessage(t("auth.resetEmailSent"));
    } catch {
      setError(t("auth.resetEmailError"));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <AuthShell
      kicker={t("auth.loginKicker")}
      title={t("auth.loginTitle")}
      subtitle={t("auth.loginSubtitle")}
    >
      <SocialAuthButtons />

      <form onSubmit={handleLogin} className="auth-form">
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
        <label className="auth-field">
          <span>{t("common.password")}</span>
          <input
            type="password"
            placeholder={t("auth.passwordPlaceholder")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        <button
          type="button"
          disabled={resetLoading}
          className="auth-text-button"
          onClick={handleForgotPassword}
        >
          {resetLoading ? <Loader2 className="animate-spin" size={16} /> : <Mail size={16} />}
          {t("auth.forgotPassword")}
        </button>

        {error && <p className="auth-feedback auth-feedback-error">{error}</p>}
        {message && <p className="auth-feedback auth-feedback-success">{message}</p>}

        <button type="submit" disabled={loading} className="auth-submit">
          {loading ? <Loader2 className="animate-spin" /> : <Lock size={18} />}
          {t("auth.loginButton")}
        </button>
      </form>

      <p className="auth-switch-copy">
        {t("auth.noAccount")}{" "}
        <Link to="/register">{t("auth.createAccount")}</Link>
      </p>

      {/* O Engine é aberto: quem só quer explorar entra sem criar conta. */}
      <button
        type="button"
        onClick={() => navigate("/")}
        className="auth-text-button mx-auto mt-1"
      >
        {t("guest.continueWithout")}
      </button>
    </AuthShell>
  );
}
