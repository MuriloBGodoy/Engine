import { useEffect, useState } from "react";
import { must, supabase, watchTable } from "../services/supabase";

/**
 * Estado de assinatura do usuário. A fonte da verdade é `user_plans.plan` —
 * escrito SOMENTE pelo servidor (webhook de pagamento), nunca pelo cliente: o
 * banco não tem política de escrita nessa tabela. Enquanto não houver esse campo, o usuário é tratado como
 * gratuito. Visitante (sem uid) também é gratuito.
 *
 * `loading` fica true até a primeira resposta do servidor, para o <AdSlot />
 * não piscar um anúncio antes de saber que o usuário é premium. O caso
 * visitante é derivado no return (não via setState no efeito) para não
 * disparar renders em cascata.
 */
const GUEST_STATE = { isPremium: false, isPro: false, plan: "free", subscription: null, loading: false };

/**
 * O plano gravado, já com o passe vencido tratado como gratuito. Assinatura
 * quem corta é o webhook do Stripe; passe avulso não tem evento de fim, então
 * a data é conferida aqui.
 */
export function effectivePlan(row) {
  const plan = row?.plan || "free";
  const sub = row?.subscription || null;
  if (plan !== "free" && sub?.kind === "pass" && sub.currentPeriodEnd) {
    if (new Date(sub.currentPeriodEnd) <= new Date()) return { plan: "free", subscription: sub };
  }
  return { plan, subscription: sub };
}

export function useIsPremium(userId) {
  const [state, setState] = useState({ ...GUEST_STATE, loading: true });

  useEffect(() => {
    if (!userId) return undefined;

    let active = true;
    const load = async () => {
      try {
        const row = must(
          await supabase
            .from("user_plans")
            .select("plan, subscription")
            .eq("user_id", userId)
            .maybeSingle(),
        );
        const { plan, subscription } = effectivePlan(row);
        if (active) {
          setState({
            // Pro inclui tudo do Premium.
            isPremium: plan === "premium" || plan === "pro",
            isPro: plan === "pro",
            plan,
            subscription,
            loading: false,
          });
        }
      } catch {
        // Offline: assume gratuito e segue a vida.
        if (active) setState(GUEST_STATE);
      }
    };

    load();
    // O pagamento confirmado chega pelo webhook enquanto a pessoa está na
    // tela; o tempo real liga o premium sem recarregar.
    const stop = watchTable("plan", { table: "user_plans", filter: `user_id=eq.${userId}` }, load);
    return () => {
      active = false;
      stop();
    };
  }, [userId]);

  return userId ? state : GUEST_STATE;
}
