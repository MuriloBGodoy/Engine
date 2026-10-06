/**
 * Banco de prova das Conquistas.
 *
 * A aba vive atrás do login e depende de números que ninguém tem ainda —
 * produção inteira soma 11 curtidas. Este entry monta os componentes DE
 * PRODUÇÃO com os três momentos que a régua atravessa, para dar pra olhar o
 * estado de hoje e o de daqui a muito tempo sem criar conta nem forjar dado.
 *
 * Não entra no build: o Vite só empacota o index.html. Vive no `npm run dev`,
 * em /achievements-preview.html.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { AchievementsTab } from "./components/achievements/AchievementsTab";
import { AchievementCelebration } from "./components/achievements/AchievementCelebration";
import { likeTierId } from "./services/achievements";
import "./index.css";
import "./services/i18n";

const QUERY = new URLSearchParams(window.location.search);
if (QUERY.get("dark") === "1") document.documentElement.classList.add("dark");

/* Os três momentos, com o catálogo de 06/10/2026. "hoje" é o dado real medido
   em produção (11 curtidas, 3 seguidores) com o que essas contas já ganham no
   catálogo novo: primeira meta e o degrau de 10 curtidas. */
const CENARIOS = {
  hoje: {
    rotulo: "Hoje (dado real)",
    unlocked: new Set(["first_goal", likeTierId(10)]),
    likesReceived: 11,
    followersCount: 3,
  },
  quase: {
    rotulo: "Conta ativa",
    unlocked: new Set([
      "first_goal", "first_contribution", "halfway", "streak_3",
      "owned_car", "first_expense", "expenses_10",
      "first_post", "first_comment", likeTierId(10), likeTierId(50), "followers_10",
      "club_joined", "event_rsvp",
    ]),
    likesReceived: 74,
    followersCount: 38,
  },
  cheio: {
    rotulo: "Veterano",
    unlocked: new Set([
      "first_goal", "first_conquest", "owned_car", "first_contribution", "halfway",
      "streak_3", "streak_6", "streak_12",
      "first_expense", "expenses_10", "expenses_50", "measured_consumption",
      "first_post", "first_comment",
      ...[10, 50, 100, 500, 1000, 10000].map(likeTierId),
      "followers_10", "followers_100",
      "club_joined", "club_founder", "club_first_post", "club_members_10",
      "event_rsvp", "event_organizer", "event_attendees_10",
      "first_simulation",
    ]),
    likesReceived: 12400,
    followersCount: 612,
  },
};

// Exportado só para o fast refresh do Vite não reclamar num arquivo que
// define componente e monta a raiz no mesmo lugar.
export function Bench() {
  const [qual, setQual] = React.useState(QUERY.get("estado") || "hoje");
  const [festa, setFesta] = React.useState(false);
  const cenario = CENARIOS[qual] || CENARIOS.hoje;

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-4 py-6">
      <div className="flex flex-wrap gap-2">
        {Object.entries(CENARIOS).map(([chave, c]) => (
          <button
            key={chave}
            type="button"
            onClick={() => setQual(chave)}
            className={`min-h-11 rounded-xl border px-3 text-[13px] font-bold transition ${
              qual === chave
                ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
                : "border-[var(--engine-border)] text-[var(--engine-text-muted)]"
            }`}
          >
            {c.rotulo}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setFesta(true)}
          className="min-h-11 rounded-xl border border-[var(--engine-border)] px-3 text-[13px] font-bold text-[var(--engine-text-muted)]"
        >
          Ver celebração
        </button>
      </div>

      <p className="text-[13px] text-[var(--engine-text-muted)]">
        {cenario.likesReceived} curtidas recebidas · {cenario.followersCount} seguidores
      </p>

      <AchievementsTab
        unlocked={cenario.unlocked}
        likesReceived={cenario.likesReceived}
        followersCount={cenario.followersCount}
      />

      <AchievementCelebration
        open={festa}
        achievementId="club_founder"
        onClose={() => setFesta(false)}
        onShare={() => setFesta(false)}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Bench />
  </React.StrictMode>,
);
