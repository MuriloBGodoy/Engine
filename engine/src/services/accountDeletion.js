import { del } from "idb-keyval";
import {
  arrayRemove,
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
} from "firebase/firestore";
import { deleteUser } from "firebase/auth";
import { firestore } from "./firebase";
import { engineDB } from "./db";
import { archiveClub, leaveClub } from "./clubs";

/**
 * Excluir a conta de verdade.
 *
 * Até 05/10/2026 o botão apagava carros, posts e configurações e depois
 * chamava `deleteUser`. Ficavam para trás o perfil público (a pessoa seguia
 * aparecendo na busca), o @ reservado para sempre, anúncios de serviço,
 * eventos, curtidas, comentários e clubes. E a ordem era a errada: se o
 * Firebase pedisse login recente, os carros já tinham sumido e a conta
 * continuava viva.
 *
 * Agora: a tela reautentica ANTES (senha ou popup do Google), depois este
 * módulo apaga tudo o que as regras deixam o próprio usuário apagar, e só no
 * fim a conta do Auth sai. Se alguma etapa ESSENCIAL falhar, a conta fica e a
 * pessoa tenta de novo — toda etapa é idempotente, repetir não estraga nada.
 *
 * Fica, de propósito (mesmo comportamento do WhatsApp e do Instagram):
 * mensagens enviadas em conversas, que pertencem aos dois lados — mas o
 * cartão da pessoa na conversa vira "Conta excluída". Fica por limite das
 * regras, sem Cloud Function no plano Spark: o espelho `following` de quem
 * SEGUIA a pessoa, notificações já entregues a outros, denúncias, a sigla de
 * clube fundado e o `users/{uid}` do plano (só o webhook escreve). Isso pede
 * um script de admin; ficam órfãos e sem link.
 */

const PAGE_SIZE = 200;

// O que a pessoa deixa onde não pode apagar (clube arquivado, conversa) fica
// sem nome, foto nem @: o @ foi liberado e apontaria para o próximo dono.
const DELETED_NAME = "Conta excluída";

const docsOf = async (ref) => (await getDocs(ref)).docs;

const deleteAll = async (docs) => {
  await Promise.all(docs.map((item) => deleteDoc(item.ref)));
};

// Posts de outras pessoas guardam comentário e avaliação DENTRO do documento
// (array e mapa) — não dá para consultar "onde comentei". A varredura é cara,
// mas acontece uma vez na vida de cada conta.
const scrubInteractionsOnOthersPosts = async (uid) => {
  let cursor = null;
  for (;;) {
    const page = await getDocs(
      query(
        collection(firestore, "communityGoals"),
        orderBy("__name__"),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(PAGE_SIZE),
      ),
    );

    await Promise.all(
      page.docs.map(async (item) => {
        const data = item.data();
        if (data.ownerId === uid) return; // sai inteiro na etapa dos posts
        const comments = Array.isArray(data.comments) ? data.comments : [];
        const commented = comments.some((comment) => comment?.userId === uid);
        const rated = Boolean(data.ratingsBy && uid in data.ratingsBy);
        const likedLegacy = Boolean(data.likesBy && uid in data.likesBy);
        if (!commented && !rated && !likedLegacy) return;

        const patch = { updatedAt: serverTimestamp() };
        // `arrayRemove` e não o array filtrado: regravar o array inteiro
        // apagaria o comentário que outra pessoa fizesse entre a leitura e a
        // escrita.
        const mine = comments.filter((comment) => comment?.userId === uid);
        if (mine.length) patch.comments = arrayRemove(...mine);
        if (rated) patch[`ratingsBy.${uid}`] = deleteField();
        if (likedLegacy) patch[`likesBy.${uid}`] = deleteField();
        await updateDoc(item.ref, patch);
      }),
    );

    if (page.size < PAGE_SIZE) return;
    cursor = page.docs[page.docs.length - 1];
  }
};

const removeLikesGiven = async (uid) => {
  const likes = await docsOf(
    query(collectionGroup(firestore, "likes"), where("likerId", "==", uid)),
  );
  await Promise.all(
    likes.map(async (like) => {
      const postRef = like.ref.parent.parent;
      await deleteDoc(like.ref);
      if (!postRef) return;
      const post = await getDoc(postRef);
      if (!post.exists() || post.data().ownerId === uid) return;
      await updateDoc(postRef, { likesCount: increment(-1), updatedAt: serverTimestamp() });
    }),
  );
};

const unfollowEveryone = async (uid) => {
  const following = await engineDB.getUserFollowing(uid);
  await Promise.all(following.map((targetId) => engineDB.setFollow(targetId, false, uid)));
  // `getUserFollowing` engole erro; o que sobrar no espelho sai aqui.
  await deleteAll(
    await docsOf(collection(firestore, "publicProfiles", uid, "following")),
  );
};

// Fundador não pode sair do clube (regra do Strava) e transferir a fundação
// ainda não existe. Clube órfão de fundador fica sem ninguém que edite a
// identidade, então o clube fundado é ARQUIVADO — a tela avisa antes — e o
// doc de fundador, que a regra não deixa apagar, perde nome, foto e @.
const leaveAllClubs = async (uid) => {
  const mirror = await docsOf(collection(firestore, "users", uid, "clubs"));
  for (const item of mirror) {
    const memberRef = doc(firestore, "clubs", item.id, "members", uid);
    const member = await getDoc(memberRef);
    if (!member.exists()) {
      await deleteDoc(item.ref);
      continue;
    }
    if (member.data().role === "founder") {
      const club = await getDoc(doc(firestore, "clubs", item.id));
      if (club.exists() && !club.data().archived) await archiveClub(item.id);
      await updateDoc(memberRef, { displayName: DELETED_NAME, username: "", avatar: "" });
      await deleteDoc(item.ref);
    } else {
      await leaveClub(item.id);
    }
  }

  // Pedido de entrada pendente não tem espelho: só olhando clube por clube.
  // Leitura antes de apagar para não gastar uma escrita por clube.
  const clubs = await docsOf(collection(firestore, "clubs"));
  await Promise.all(
    clubs.map(async (club) => {
      const request = doc(firestore, "clubs", club.id, "requests", uid);
      const found = await getDoc(request).catch(() => null);
      if (found?.exists()) await deleteDoc(request);
    }),
  );
};

const removeEvents = async (uid) => {
  const created = await docsOf(
    query(collection(firestore, "events"), where("createdBy", "==", uid)),
  );
  await deleteAll(created);

  // Presença confirmada: sem consulta de grupo em `participants` (as regras
  // não têm o match recursivo), só dá pra achar olhando evento por evento —
  // inclusive os passados, porque a lista de quem foi é pública e guarda nome
  // e carro.
  const events = await docsOf(collection(firestore, "events"));
  await Promise.all(
    events.map(async (event) => {
      const mine = doc(firestore, "events", event.id, "participants", uid);
      if ((await getDoc(mine)).exists()) await deleteDoc(mine);
    }),
  );
};

const anonymizeConversations = async (uid) => {
  const conversations = await docsOf(
    query(collection(firestore, "conversations"), where("memberIds", "array-contains", uid)),
  );
  await Promise.all(
    conversations.map((item) =>
      updateDoc(item.ref, {
        [`members.${uid}`]: {
          author: DELETED_NAME,
          username: "",
          avatar: "",
          avatarInitials: "",
          deletedAt: serverTimestamp(),
        },
      }),
    ),
  );
};

const removeServiceListings = async (uid) => {
  await deleteAll(
    await docsOf(
      query(collection(firestore, "serviceListings"), where("ownerId", "==", uid)),
    ),
  );
};

const removeOwnPosts = async (uid) => {
  await deleteAll(
    await docsOf(
      query(collection(firestore, "communityGoals"), where("ownerId", "==", uid)),
    ),
  );
};

const removePrivateSpace = async (uid) => {
  const subcollections = ["cars", "private", "notifications", "achievements", "clubs"];
  for (const name of subcollections) {
    await deleteAll(await docsOf(collection(firestore, "users", uid, name)));
  }
};

const releaseUsernames = async (uid) => {
  await deleteAll(
    await docsOf(query(collection(firestore, "usernames"), where("userId", "==", uid))),
  );
};

const removePublicProfile = async (uid) => {
  await deleteDoc(doc(firestore, "publicProfiles", uid));
};

const clearThisDevice = async (uid) => {
  await Promise.all(
    ["cars", "settings", "community"].map((name) => del(`engine_users:${uid}:${name}`)),
  );
};

/**
 * A ordem importa: interações em conteúdo alheio saem primeiro (enquanto o
 * perfil ainda existe, as regras que conferem dono continuam batendo), o
 * espaço privado e o perfil por último, e o Auth só depois de tudo.
 * `essential` = dado pessoal; se falhar, a conta NÃO é excluída.
 */
export const ACCOUNT_DELETION_STEPS = [
  { id: "interactions", run: scrubInteractionsOnOthersPosts, essential: false },
  { id: "likes", run: removeLikesGiven, essential: false },
  { id: "follows", run: unfollowEveryone, essential: false },
  { id: "clubs", run: leaveAllClubs, essential: false },
  { id: "messages", run: anonymizeConversations, essential: false },
  { id: "events", run: removeEvents, essential: true },
  { id: "services", run: removeServiceListings, essential: true },
  { id: "posts", run: removeOwnPosts, essential: true },
  { id: "private", run: removePrivateSpace, essential: true },
  { id: "username", run: releaseUsernames, essential: false },
  { id: "profile", run: removePublicProfile, essential: true },
];

export class AccountDeletionIncomplete extends Error {
  constructor(failedSteps) {
    super("account-deletion-incomplete");
    this.failedSteps = failedSteps;
  }
}

/**
 * Chame só depois de reautenticar: `deleteUser` exige login recente e é a
 * última coisa que acontece.
 *
 * `onStep(id, state)` recebe "running" | "done" | "failed" para a tela
 * mostrar o progresso. `reauthenticate`, quando dá para repetir sem a pessoa
 * (senha já digitada), roda de novo logo antes do `deleteUser`: a varredura
 * pode passar dos 5 minutos de "login recente" numa base grande.
 */
export async function deleteAccountEverywhere(
  user,
  { onStep = () => {}, reauthenticate = null } = {},
) {
  const uid = user?.uid;
  if (!uid) throw new Error("Usuário não identificado.");

  const failed = [];
  for (const step of ACCOUNT_DELETION_STEPS) {
    onStep(step.id, "running");
    try {
      await step.run(uid);
      onStep(step.id, "done");
    } catch (error) {
      console.warn(`[conta] etapa ${step.id} falhou`, error);
      onStep(step.id, "failed");
      failed.push({ id: step.id, essential: step.essential, error });
    }
  }

  if (failed.some((step) => step.essential)) {
    throw new AccountDeletionIncomplete(failed);
  }

  await clearThisDevice(uid).catch(() => {});
  if (reauthenticate) await reauthenticate();
  await deleteUser(user);
  return { skipped: failed.map((step) => step.id) };
}
