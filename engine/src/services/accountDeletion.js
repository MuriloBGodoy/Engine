import { del } from "idb-keyval";
import { must, supabase } from "./supabase";

/**
 * Excluir a conta de verdade.
 *
 * No Firebase isto era uma varredura de onze etapas feita pelo navegador,
 * documento por documento, porque as regras não faziam cascata e o plano
 * Spark não tinha Cloud Function — e mesmo assim ficavam órfãos (o espelho
 * de quem seguia a pessoa, curtidas de conta já apagada).
 *
 * No Supabase é UMA chamada (`delete_my_account`, em `supabase/migrations`),
 * dentro de uma transação: ou sai tudo, ou nada sai. Tudo que é só da pessoa
 * vai em cascata com a conta — garagem, configurações, conquistas, avisos, @,
 * perfil, seguidores e quem ela seguia, posts (com as curtidas deles),
 * eventos criados, presenças, curtidas dadas, anúncios, filiação a clube e
 * pedidos. Antes disso a função cuida do que fica em conteúdo ALHEIO:
 * comentários e avaliações nos posts dos outros saem, o cartão dela nas
 * conversas vira "Conta excluída" (a mensagem é dos dois lados, como no
 * WhatsApp) e o clube que ela fundou é arquivado.
 *
 * Fica, de propósito: as mensagens enviadas e as denúncias que ela abriu (sem
 * o vínculo com a conta).
 */

// As etapas continuam existindo para a tela mostrar o que está sendo apagado,
// mas acontecem juntas: a lista é o que a pessoa lê, não a ordem de execução.
export const ACCOUNT_DELETION_STEPS = [
  { id: "interactions" },
  { id: "messages" },
  { id: "clubs" },
  { id: "posts" },
  { id: "private" },
  { id: "profile" },
];

export class AccountDeletionIncomplete extends Error {
  constructor(failedSteps) {
    super("account-deletion-incomplete");
    this.failedSteps = failedSteps;
  }
}

const clearThisDevice = async (uid) => {
  await Promise.all(
    ["cars", "settings", "community"].map((name) => del(`engine_users:${uid}:${name}`)),
  );
};

/**
 * Chame depois de a tela confirmar quem é (senha ou e-mail digitado).
 *
 * `onStep(id, state)` recebe "running" | "done" | "failed" para a tela
 * mostrar o progresso. Como a exclusão é atômica, falhar é falhar inteiro:
 * nada foi apagado, e tentar de novo é seguro.
 */
export async function deleteAccountEverywhere(user, { onStep = () => {} } = {}) {
  const uid = user?.uid;
  if (!uid) throw new Error("Usuário não identificado.");

  ACCOUNT_DELETION_STEPS.forEach((step) => onStep(step.id, "running"));
  try {
    must(await supabase.rpc("delete_my_account"));
  } catch (error) {
    console.warn("[conta] exclusão falhou", error);
    ACCOUNT_DELETION_STEPS.forEach((step) => onStep(step.id, "failed"));
    throw new AccountDeletionIncomplete(ACCOUNT_DELETION_STEPS.map((step) => ({ ...step, error })));
  }
  ACCOUNT_DELETION_STEPS.forEach((step) => onStep(step.id, "done"));

  await clearThisDevice(uid).catch(() => {});
  // A conta não existe mais no servidor; só falta esquecer a sessão aqui.
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  return { skipped: [] };
}
