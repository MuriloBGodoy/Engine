import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { signUpWithEmail } from "../services/supabase";
import { engineDB } from "../services/db";
import { AuthShell } from "../components/AuthShell";
import { SocialAuthButtons } from "../components/SocialAuthButtons";
import { authPath, readNextPath } from "../services/authRedirect";
import { PasswordStrength } from "../components/PasswordStrength";
import { passwordLevel } from "../services/passwordStrength";
import { acceptTerms } from "../services/onboarding";

/**
 * Criar conta — e só isso.
 *
 * Até 14/11/2026 esta tela pedia OITO campos antes de existir conta: nome, @,
 * e-mail, senha, confirmar senha, país, estado e telefone. Três coisas
 * estavam erradas nisso.
 *
 * A primeira é que o nome e o @ já são perguntados depois, na tela de
 * primeiro uso (`pages/Onboarding.jsx`), porque quem entra pelo Google chega
 * sem @ e precisa escolher um de qualquer jeito. O cadastro por e-mail
 * perguntava a mesma coisa mais cedo — e as duas perguntas conviviam no
 * mesmo app.
 *
 * A segunda é que pedir o @ antes da conta existir obrigava a uma dança de
 * reserva: reservar o @ como "pending", criar a conta, reservar de novo para
 * o uid e, se outra pessoa tivesse fisgado o mesmo @ no meio, APAGAR a conta
 * recém-criada para não prender o e-mail. Era o trecho mais perigoso do
 * arquivo, e existia só por causa da ordem das perguntas. Agora o @ é
 * escolhido com a conta já de pé: colisão é só uma mensagem na tela.
 *
 * A terceira é que país, estado e telefone não são dados de conta, são de
 * perfil — e nenhuma das contas criadas pelo Google tem país ou estado
 * preenchido. Exigir dos dois de e-mail o que não se exige dos quatro do
 * Google é incoerência que só espanta cadastro. Quem quiser preencher,
 * preenche em Configurações.
 *
 * Sobrou: e-mail, senha e o aceite de 18+ — que é obrigação dos Termos e tem
 * de ser dado por quem cria a conta, não depois. "Confirmar senha" saiu junto:
 * o olho que mostra o que foi digitado resolve o mesmo erro sem um campo, e
 * existe recuperação de senha se ainda assim passar errado.
 */
export function Register() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Engine é 18+ (Termos e Privacidade, 24/10/2026): a idade e o aceite são
  // confirmados aqui, antes de existir conta.
  const [adult, setAdult] = useState(false);
  const navigate = useNavigate();
  // Veio de um ponto que pede conta (ex.: publicar serviço): volta para lá.
  const next = readNextPath(useLocation().search);

  const handleRegister = async (event) => {
    event.preventDefault();
    setError("");

    if (!adult) {
      setError(t("auth.adultRequired"));
      return;
    }
    if (passwordLevel(password) < 2) {
      setError(t("auth.passwordTooWeak"));
      return;
    }

    setLoading(true);
    try {
      const createdUser = await signUpWithEmail(email.trim(), password);
      engineDB.setCurrentUser(createdUser.uid);

      // O aceite vai para o servidor com a data do banco. Se falhar, a tela
      // de primeiro uso pergunta de novo — nunca trava um cadastro que já
      // deu certo.
      await acceptTerms(createdUser.uid).catch((err) =>
        console.warn("[register] aceite fica para o primeiro uso", err),
      );

      // Daqui a pessoa cai na tela de primeiro uso, que pede o nome e o @
      // (o App barra quem não tem @ — ver `needsUsername`). Depois dela, a
      // Garagem: o estado vazio convida a cadastrar o primeiro carro.
      navigate(next || "/garagem", { replace: Boolean(next) });
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setError(t("auth.emailInUse"));
      } else if (err.code === "auth/weak-password") {
        setError(t("auth.weakPassword"));
      } else {
        setError(t("auth.genericRegisterError"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      kicker={t("auth.registerKicker")}
      title={t("auth.registerTitle")}
      subtitle={t("auth.registerSubtitle")}
    >
      {/* Conta nova pelo Google cai no mesmo lugar que a do e-mail. Fica em
          cima porque é por onde todas as contas de verdade entraram. */}
      <SocialAuthButtons redirectPath={next || "/garagem"} />

      <form onSubmit={handleRegister} className="auth-form">
        <label className="auth-field">
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
          {/* O olho fica DENTRO do campo, e o campo guarda 44px de folga à
              direita para o texto nunca passar por baixo dele. */}
          <span className="auth-field-with-action">
            <input
              type={showPassword ? "text" : "password"}
              placeholder={t("auth.createPassword")}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((on) => !on)}
              aria-label={t(showPassword ? "auth.hidePassword" : "auth.showPassword")}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
            </button>
          </span>
          <PasswordStrength password={password} />
        </label>

        <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-[13px] leading-relaxed text-[var(--engine-text-muted)]">
          <input
            type="checkbox"
            checked={adult}
            onChange={(event) => setAdult(event.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-[var(--engine-accent)]"
          />
          <span>
            {t("auth.adultConsent")}{" "}
            <Link to="/termos" target="_blank" className="font-semibold text-[var(--engine-accent)]">
              {t("auth.terms")}
            </Link>{" "}
            {t("auth.and")}{" "}
            <Link to="/privacidade" target="_blank" className="font-semibold text-[var(--engine-accent)]">
              {t("auth.privacy")}
            </Link>
            .
          </span>
        </label>

        {error && <p className="auth-feedback auth-feedback-error">{error}</p>}

        <button type="submit" disabled={loading} className="auth-submit">
          {loading ? <Loader2 className="animate-spin" /> : <UserPlus size={18} />}
          {t("auth.registerButton")}
        </button>

        {/* Dito antes de enviar, não depois: quem lê "criar conta" e vê dois
            campos precisa saber que o @ ainda vem — senão a tela de primeiro
            uso parece um formulário que apareceu do nada. */}
        <p className="text-center text-[12.5px] leading-relaxed text-[var(--engine-text-muted)]">
          {t("auth.registerNextStep")}
        </p>
      </form>

      <p className="auth-switch-copy">
        {t("auth.hasAccount")}{" "}
        <Link to={authPath("/login", next)}>{t("auth.signIn")}</Link>
      </p>
    </AuthShell>
  );
}
