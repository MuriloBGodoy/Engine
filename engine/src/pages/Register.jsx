import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { signUpWithEmail, supabase } from "../services/supabase";
import { engineDB } from "../services/db";
import { AuthShell } from "../components/AuthShell";
import { SocialAuthButtons } from "../components/SocialAuthButtons";
import { PhoneField } from "../components/PhoneField";
import { PasswordStrength } from "../components/PasswordStrength";
import { passwordLevel } from "../services/passwordStrength";
import { countries, getStates, DEFAULT_COUNTRY } from "../services/locations";
import { isPhoneValueValid } from "../services/phone";

export function Register() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [state, setState] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const stateOptions = getStates(country);

  const handleRegister = async (event) => {
    event.preventDefault();
    setError("");

    // Validações antes de criar a conta.
    if (!isPhoneValueValid(phone)) {
      setError(t("auth.invalidPhone"));
      return;
    }
    if (passwordLevel(password) < 2) {
      setError(t("auth.passwordTooWeak"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }

    setLoading(true);

    let createdUser = null;
    try {
      const normalizedUsername = engineDB.normalizeUsername(username);

      // Nome repetido é pego AQUI, antes de existir conta. `null` = não deu
      // pra saber; segue, e a reserva abaixo decide.
      if ((await engineDB.isUsernameAvailable(normalizedUsername)) === false) {
        setError(t("auth.usernameInUse"));
        return;
      }
      await engineDB.reserveUsername(normalizedUsername, "pending");

      // O nome vai junto na criação: não precisa de um segundo passo para
      // gravar o nome de exibição na conta.
      createdUser = await signUpWithEmail(email.trim(), password, { displayName: name.trim() });

      engineDB.setCurrentUser(createdUser.uid);
      try {
        await engineDB.reserveUsername(normalizedUsername, createdUser.uid);
      } catch (reserveError) {
        // Perdeu a corrida pelo nome (alguém reservou no mesmo instante).
        // Desfaz a conta: uma conta sem nome prende o e-mail — a próxima
        // tentativa diria "e-mail já cadastrado" e a pessoa não entraria mais.
        await supabase.rpc("delete_my_account").catch(() => {});
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
        createdUser = null;
        engineDB.setCurrentUser(null);
        throw reserveError;
      }
      const settings = engineDB.getDefaultSettings();
      // Conta e nome já existem neste ponto. Se as configurações não
      // chegarem ao servidor, a pessoa entra mesmo assim (ficam neste
      // aparelho e sobem no próximo salvamento) — travar aqui recriaria a
      // conta órfã que o cadastro acabou de deixar de criar.
      await engineDB.saveSettings(
        {
          ...settings,
          profile: {
            ...settings.profile,
            displayName: name.trim(),
            username: normalizedUsername,
            phone: engineDB.normalizePhone(phone),
            country,
            state,
          },
        },
        createdUser.uid,
      ).catch((error) => console.warn("[register] configurações só locais", error));

      // Conta nova vai para a Garagem, cujo estado vazio convida a cadastrar
      // o primeiro carro — o primeiro passo de tudo no app. A home genérica,
      // que era o destino, não conduzia a nada.
      navigate("/garagem");
    } catch (err) {
      await engineDB.releasePendingUsername(username);
      if (err.code === "auth/email-already-in-use") {
        setError(t("auth.emailInUse"));
      } else if (err.code === "auth/weak-password") {
        setError(t("auth.weakPassword"));
      } else if (err.code === "username-taken") {
        setError(t("auth.usernameInUse"));
      } else {
        setError(t("auth.genericRegisterError"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      wide
      kicker={t("auth.registerKicker")}
      title={t("auth.registerTitle")}
      subtitle={t("auth.registerSubtitle")}
    >
      <SocialAuthButtons />

      <form onSubmit={handleRegister} className="auth-form auth-register-form">
        <label className="auth-field auth-span-two">
          <span>{t("auth.fullName")}</span>
          <input
            type="text"
            placeholder={t("auth.fullNamePlaceholder")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            required
          />
        </label>
        <label className="auth-field">
          <span>{t("auth.username")}</span>
          <input
            type="text"
            placeholder="@engine"
            value={username}
            onChange={(event) =>
              setUsername(engineDB.normalizeUsername(event.target.value))
            }
            autoComplete="username"
            required
          />
        </label>
        <label className="auth-field">
          <span>{t("auth.phone")}</span>
          <PhoneField
            value={phone}
            onChange={setPhone}
            placeholder="(00) 00000-0000"
          />
        </label>
        <label className="auth-field">
          <span>{t("auth.country")}</span>
          <select
            value={country}
            onChange={(event) => {
              setCountry(event.target.value);
              setState("");
            }}
            required
          >
            {countries.map((item) => (
              <option key={item.code} value={item.code}>
                {item.flag} {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="auth-field">
          <span>{t("auth.state")}</span>
          <select
            value={state}
            onChange={(event) => setState(event.target.value)}
            disabled={!stateOptions.length}
            required={stateOptions.length > 0}
          >
            <option value="">
              {stateOptions.length
                ? t("auth.selectState")
                : t("auth.stateUnavailable")}
            </option>
            {stateOptions.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="auth-field auth-span-two">
          <span>{t("common.email")}</span>
          <input
            type="email"
            placeholder={t("auth.registerEmailPlaceholder")}
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
            placeholder={t("auth.createPassword")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
          <PasswordStrength password={password} />
        </label>

        <label className="auth-field">
          <span>{t("auth.confirmPassword")}</span>
          <input
            type="password"
            placeholder={t("auth.confirmPasswordPlaceholder")}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
          {confirmPassword && password !== confirmPassword && (
            <span className="auth-field-hint">{t("auth.passwordMismatch")}</span>
          )}
        </label>

        {error && <p className="auth-feedback auth-feedback-error auth-span-two">{error}</p>}

        <button type="submit" disabled={loading} className="auth-submit auth-span-two">
          {loading ? <Loader2 className="animate-spin" /> : <UserPlus size={18} />}
          {t("auth.registerButton")}
        </button>
      </form>

      <p className="auth-switch-copy">
        {t("auth.hasAccount")}{" "}
        <Link to="/login">{t("auth.signIn")}</Link>
      </p>
    </AuthShell>
  );
}
