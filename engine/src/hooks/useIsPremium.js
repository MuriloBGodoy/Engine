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
const GUEST_STATE = { isPremium: false, loading: false };

export function useIsPremium(userId) {
  const [state, setState] = useState({ isPremium: false, loading: true });

  useEffect(() => {
    if (!userId) return undefined;

    let active = true;
    const load = async () => {
      try {
        const row = must(
          await supabase.from("user_plans").select("plan").eq("user_id", userId).maybeSingle(),
        );
        const plan = row?.plan;
        if (active) setState({ isPremium: plan === "premium" || plan === "pro", loading: false });
      } catch {
        // Offline: assume gratuito e segue a vida.
        if (active) setState({ isPremium: false, loading: false });
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
