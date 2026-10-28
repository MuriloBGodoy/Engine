import { useEffect, useState } from "react";
import { useRegion } from "./RegionProvider";
import { currencyForCountry, fetchProfileCountry, isSellableCountry } from "../services/billing";

/**
 * Em que país (e moeda) a pessoa compraria — a mesma cascata da função
 * subscription-create, para a tela nunca mostrar um preço e o servidor cobrar
 * outro:
 *   1. país salvo no perfil (só para quem está logado);
 *   2. região de navegação (services/region.js: escolha salva, geo-IP,
 *      idioma do navegador);
 *   3. BR.
 *
 * Devolve { country, currency, sellable, loading }. `loading` fica true só
 * enquanto o perfil de quem está logado ainda não chegou.
 */
export function useBillingCountry(userId) {
  const { region } = useRegion();
  const [profile, setProfile] = useState({ userId: "", country: "" });

  useEffect(() => {
    if (!userId) return undefined;
    let alive = true;
    fetchProfileCountry(userId)
      .then((country) => {
        if (alive) setProfile({ userId, country });
      })
      .catch(() => {
        // Sem perfil legível, segue a região — o servidor faria igual.
        if (alive) setProfile({ userId, country: "" });
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const profileReady = !userId || profile.userId === userId;
  const profileCountry = userId && profileReady ? profile.country : "";
  const regionCountry = region?.country && region.country !== "all" ? region.country : "";
  const country = String(profileCountry || regionCountry || "BR").toUpperCase();

  return {
    country,
    currency: currencyForCountry(country),
    sellable: isSellableCountry(country),
    loading: !profileReady,
  };
}
