import { lazy, Suspense } from "react";
import { VisitorHome } from "../components/home/VisitorHome";

// A Home de quem entrou vem sob demanda: o visitante (a primeira impressão,
// no 4G) não baixa o código dela.
const MemberHome = lazy(() =>
  import("../components/home/MemberHome").then((module) => ({ default: module.MemberHome })),
);

/**
 * "/" mostra duas telas: a vitrine para quem não entrou (VisitorHome) e o
 * painel pessoal de quem tem conta (MemberHome: vencimentos, garagem,
 * serviços e comunidade). O hero antigo de "meta financeira" saiu em
 * 29/10/2026 — era propaganda para quem já tinha conta.
 */
export function Home({ user, cars, settings }) {
  if (!user) return <VisitorHome />;
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <MemberHome user={user} cars={cars} settings={settings} />
    </Suspense>
  );
}
