import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listAchievements, subscribeAchievementUnlocked } from "../../services/achievements";
import { ACHIEVEMENT_CATALOG, categoryOf } from "../../services/achievementTiers";
import { useToast } from "../ToastProvider";
import { AchievementCelebration } from "./AchievementCelebration";
import { achievementIcon, achievementName } from "./icons";

const CATEGORIES = ACHIEVEMENT_CATALOG.map((c) => c.key);
const contarPorCategoria = (ids) =>
  Object.fromEntries(
    CATEGORIES.map((key) => [key, [...ids].filter((id) => categoryOf(id) === key).length]),
  );

/**
 * O aviso de conquista, montado uma vez no App.
 *
 * A conquista é concedida no fundo, em lugares que não sabem desenhar nada
 * (curtir, seguir, abrir a garagem, entrar num clube, confirmar presença...). Este componente escuta o anúncio e decide
 * COMO avisar — decisão 3 de 22/08/2026: tela cheia só na primeira conquista de
 * cada categoria, todas as seguintes no toast compacto. A festa que acontece
 * toda vez deixa de ser festa.
 *
 * "Primeira da categoria" se resolve com a contagem carregada na montagem, não
 * com uma bandeira local: a bandeira reiniciaria a cada sessão e a pessoa
 * ganharia a tela cheia de novo pela mesma conquista.
 */
export function AchievementAnnouncer({ userId }) {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const [fila, setFila] = useState([]);
  // null enquanto não sabemos o que a pessoa já tem. Nesse intervalo tudo cai
  // no toast: errar para menos é um aviso discreto, errar para mais é uma tela
  // cheia indevida.
  const jaTinha = useRef(null);

  // Seis categorias desde 06/10/2026 (Garagem, Diário, Comunidade, Clubes,
  // Eventos, Simulador). A tela cheia continua sendo só a primeira de cada uma.
  const categoria = (id) => categoryOf(id) || "garage";

  const nomeDe = useCallback((id) => achievementName(t, i18n.language, id), [t, i18n.language]);

  useEffect(() => {
    let vivo = true;
    jaTinha.current = null;
    if (!userId) return () => { vivo = false; };
    listAchievements(userId).then((ids) => {
      if (!vivo) return;
      jaTinha.current = contarPorCategoria(ids);
    });
    return () => {
      vivo = false;
    };
  }, [userId]);

  useEffect(
    () =>
      subscribeAchievementUnlocked((id) => {
        const tipo = categoria(id);
        const contagem = jaTinha.current;
        const primeiraDaCategoria = contagem ? contagem[tipo] === 0 : false;
        if (contagem) contagem[tipo] += 1;

        if (primeiraDaCategoria) {
          setFila((atual) => [...atual, id]);
          return;
        }
        showToast(`${t("achievements.toast.unlocked")} — ${nomeDe(id)}`, {
          tone: "achievement",
          icon: achievementIcon(id),
        });
      }),
    [showToast, t, nomeDe],
  );

  const atual = fila[0];
  if (!atual) return null;

  // Compartilhar só onde o sistema tem para onde mandar. No desktop sem a API,
  // o botão some em vez de virar um clique que não faz nada.
  const compartilhar = navigator.share
    ? () => {
        navigator
          .share({
            title: nomeDe(atual),
            text: `${t("achievements.toast.unlocked")} — ${nomeDe(atual)}`,
            url: window.location.origin,
          })
          .catch(() => {});
      }
    : undefined;

  return (
    <AchievementCelebration
      open
      achievementId={atual}
      onClose={() => setFila((lista) => lista.slice(1))}
      onShare={compartilhar}
    />
  );
}
