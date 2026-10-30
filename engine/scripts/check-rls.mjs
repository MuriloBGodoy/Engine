/**
 * Trava de segurança do banco: as políticas (RLS) e funções do Supabase
 * fazem o que as 700 linhas do `firestore.rules` faziam?
 *
 *   npm run check:rls
 *
 * Roda contra o projeto DE VERDADE (não há Docker para o Supabase local).
 * Cria três contas descartáveis (`rls-*@engine-test.dev`), tenta cada abuso
 * que as regras antigas barravam — e o que deve passar —, e apaga tudo no fim,
 * inclusive se der erro no meio. Nenhum dado real é lido ou tocado: toda
 * escrita é em linha criada aqui.
 *
 * Credenciais: C:\engine-credentials\supabase.env (fora do repo), ou as envs
 * SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e SUPABASE_SERVICE_ROLE_KEY.
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ENV_FILE = process.env.SUPABASE_ENV_FILE || "C:/engine-credentials/supabase.env";
const fileEnv = existsSync(ENV_FILE)
  ? Object.fromEntries(
      readFileSync(ENV_FILE, "utf8")
        .split(/\r?\n/)
        .filter((line) => line.includes("="))
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
    )
  : {};
const env = { ...fileEnv, ...process.env };
const URL_ = env.SUPABASE_URL;
const ANON = env.SUPABASE_PUBLISHABLE_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) {
  console.error("Faltam SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY ou SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, SERVICE, opts);
const anon = createClient(URL_, ANON, opts);

let failures = 0;
const check = (nome, ok, detalhe = "") => {
  if (ok) {
    console.log(`  ok   ${nome}`);
  } else {
    failures += 1;
    console.log(`  FALHA ${nome}${detalhe ? `\n         ${detalhe}` : ""}`);
  }
};
/** A operação tem que ser RECUSADA (erro, ou nenhuma linha afetada). */
const denied = (res) => Boolean(res.error) || (Array.isArray(res.data) && res.data.length === 0);
const passed = (res) => !res.error;
const why = (res) => res.error?.message || JSON.stringify(res.data)?.slice(0, 120);

const run = `${Date.now().toString(36)}`;
const users = {};
const created = [];

const makeUser = async (key) => {
  const email = `rls-${key}-${run}@engine-test.dev`;
  const password = `Rls-${run}-${key}!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  const client = createClient(URL_, ANON, opts);
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  users[key] = { id: data.user.id, email, client };
};

const tag = (prefixo) => `${prefixo}${run.slice(-3)}`.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);

try {
  await makeUser("a");
  await makeUser("b");
  await makeUser("c");
  const { a, b, c } = users;

  console.log("\nconta e garagem");
  check("dono grava o próprio carro", passed(await a.client.from("cars").insert({ user_id: a.id, id: "car1", data: { brand: "VW" } })));
  check("outro não lê o carro alheio", (await b.client.from("cars").select("*").eq("user_id", a.id)).data?.length === 0);
  check("outro não grava carro no nome alheio", denied(await b.client.from("cars").insert({ user_id: a.id, id: "x", data: {} })));
  await a.client.from("user_private").insert({ user_id: a.id, doc_id: "settings", data: { profile: { phone: "1" } } });
  check("configurações são privadas", (await b.client.from("user_private").select("*").eq("user_id", a.id)).data?.length === 0);
  check("ninguém se dá plano premium", denied(await a.client.from("user_plans").insert({ user_id: a.id, plan: "premium" })));
  check("visitante não lê garagem", (await anon.from("cars").select("*")).data?.length === 0);

  console.log("\nlembretes da garagem");
  // Desde 20261029130000: as datas de IPVA/licenciamento/revisão/seguro são
  // do dono do carro; o que já foi avisado (de-duplicação) só o servidor vê.
  const lembrete = { user_id: a.id, car_id: "car1", kind: "ipva", due_date: "2099-01-10", detail: { n: 1 } };
  check("dono grava lembrete do próprio carro", passed(await a.client.from("garage_reminders").insert(lembrete)));
  check("dono lê os próprios lembretes", (await a.client.from("garage_reminders").select("*").eq("user_id", a.id)).data?.length === 1);
  check("outro não lê lembrete alheio", (await b.client.from("garage_reminders").select("*").eq("user_id", a.id)).data?.length === 0);
  check("visitante não lê lembretes", (await anon.from("garage_reminders").select("*")).data?.length === 0);
  check("outro não grava lembrete no carro alheio",
    denied(await b.client.from("garage_reminders").insert({ ...lembrete, user_id: a.id, due_date: "2099-02-10" })));
  check("ninguém grava lembrete para carro que não é dele (chave do carro)",
    denied(await b.client.from("garage_reminders").insert({ ...lembrete, user_id: b.id, due_date: "2099-02-10" })));
  check("outro não altera lembrete alheio",
    denied(await b.client.from("garage_reminders").update({ due_date: "2099-03-01" }).eq("user_id", a.id).select()));
  check("outro não apaga lembrete alheio",
    denied(await b.client.from("garage_reminders").delete().eq("user_id", a.id).select()));
  check("tipo de lembrete fora da lista é recusado",
    denied(await a.client.from("garage_reminders").insert({ ...lembrete, kind: "multa", due_date: "2099-04-10" })));
  check("dono não lê o registro de avisos enviados",
    (await a.client.from("garage_reminder_deliveries").select("*")).data?.length === 0);
  check("dono não forja aviso enviado",
    denied(await a.client.from("garage_reminder_deliveries").insert({ user_id: a.id, car_id: "car1", kind: "ipva", due_date: "2099-01-10", stage: 30 })));
  check("cliente não roda o job do sino", denied(await a.client.rpc("run_garage_reminders")));

  console.log("\nconquistas");
  // Desde 20261025162000: marco social é do banco; o cliente só grava marco
  // da garagem, e só para si.
  check("ninguém concede conquista a terceiros", denied(await a.client.from("achievements").insert({ user_id: b.id, achievement_id: "first_goal" })));
  check("ninguém se dá marco social", denied(await b.client.from("achievements").insert({ user_id: b.id, achievement_id: "likes_1000000" })));
  check("dono grava marco da garagem para si", passed(await b.client.from("achievements").insert({ user_id: b.id, achievement_id: "first_goal" })));
  check("marco repetido é recusado (dedup)", denied(await b.client.from("achievements").insert({ user_id: b.id, achievement_id: "first_goal" })));
  check("id fora da lista é recusado", denied(await b.client.from("achievements").insert({ user_id: b.id, achievement_id: "selo_inventado" })));
  await b.client.from("achievements").insert({ user_id: b.id, achievement_id: "owned_car", unlocked_at: "2099-01-01T00:00:00Z" });
  const data2099 = (await admin.from("achievements").select("unlocked_at").eq("user_id", b.id).eq("achievement_id", "owned_car").single()).data;
  check("a data da conquista é do banco, não de quem concede", data2099 && !data2099.unlocked_at.startsWith("2099"));
  check("outro não revoga conquista alheia", denied(await a.client.from("achievements").delete().eq("user_id", b.id).select()));
  check("conquista é vitrine pública", (await anon.from("achievements").select("*").eq("user_id", b.id)).data?.length === 2);

  console.log("\navisos");
  // Desde 20261025161000 o sino só é escrito pelo banco.
  check("cliente não escreve no sino alheio", denied(await a.client.from("notifications").insert({ user_id: b.id, actor_id: a.id, type: "follow", data: { text: "oi" } })));
  check("aviso falso de anúncio é recusado", denied(await a.client.from("notifications").insert({ user_id: b.id, actor_id: a.id, type: "service_rejected", data: { notificationTitle: "golpe" } })));
  check("cliente não chama notify", Boolean((await a.client.rpc("notify", { p_user: b.id, p_actor: a.id, p_type: "follow", p_data: {}, p_dedupe: false })).error));

  console.log("\n@ e perfil");
  const nome = `rls${run}`;
  check("reservar @ livre passa", passed(await a.client.rpc("reserve_username", { p_username: nome })));
  const roubo = await b.client.rpc("reserve_username", { p_username: nome });
  check("@ de outra pessoa dá username-taken", roubo.error?.message === "username-taken", why(roubo));
  check("dono reserva o mesmo @ de novo", passed(await a.client.rpc("reserve_username", { p_username: nome })));
  check("ninguém insere @ direto na tabela", denied(await b.client.from("usernames").insert({ username: `${nome}x`, user_id: b.id })));
  await a.client.from("public_profiles").insert({ user_id: a.id, username: `@${nome}`, author: "A" });
  check("perfil é público", (await anon.from("public_profiles").select("*").eq("user_id", a.id)).data?.length === 1);
  check("outro não edita perfil alheio", denied(await b.client.from("public_profiles").update({ author: "hack" }).eq("user_id", a.id).select()));

  console.log("\nseguidores");
  check("seguir por si passa", passed(await a.client.from("follows").insert({ follower_id: a.id, target_id: b.id })));
  const avisoSeguir = (await b.client.from("notifications").select("type, data").eq("type", "follow")).data;
  check("seguir vira aviso escrito pelo banco", avisoSeguir?.length === 1);
  await b.client.from("notifications").update({ read: true, data: { text: "editado" } }).eq("user_id", b.id);
  const aviso = (await admin.from("notifications").select("read, data").eq("user_id", b.id).eq("type", "follow").single()).data;
  check("dono marca lido mas não reescreve o aviso", aviso?.read === true && aviso?.data?.text !== "editado");
  check("ninguém lê o sino alheio", (await a.client.from("notifications").select("*").eq("user_id", b.id)).data?.length === 0);
  check("visitante vê o número de seguidores", (await anon.rpc("follow_counts", { p_user: b.id })).data?.followers === 1);
  check("seguir em nome de outro é recusado", denied(await a.client.from("follows").insert({ follower_id: c.id, target_id: b.id })));
  check("visitante não lista seguidores", (await anon.from("follows").select("*")).data?.length === 0);
  check("outro não desfaz seguir alheio", denied(await c.client.from("follows").delete().eq("follower_id", a.id).select()));

  console.log("\ncomunidade");
  const post = `post-${a.id}-${run}`;
  check("dono publica", passed(await a.client.from("community_goals").insert({ id: post, owner_id: a.id, data: { title: "Golf", savedValue: 30000, targetValue: 120000 } })));
  const publico = (await anon.from("community_goals").select("data").eq("id", post).single()).data;
  check("visitante não lê valor em dinheiro, só a porcentagem",
    publico && !("savedValue" in publico.data) && !("targetValue" in publico.data) && publico.data.progress === 25,
    JSON.stringify(publico?.data));
  check("publicar em nome de outro é recusado", denied(await b.client.from("community_goals").insert({ id: `x-${run}`, owner_id: a.id })));
  check("outro não edita a publicação", denied(await b.client.from("community_goals").update({ data: { title: "hack" } }).eq("id", post).select()));
  check("visitante lê o feed", (await anon.from("community_goals").select("id").eq("id", post)).data?.length === 1);
  check("curtir por si passa", passed(await b.client.from("post_likes").insert({ post_id: post, liker_id: b.id, post_owner_id: c.id })));
  check("curtir em nome de outro é recusado", denied(await b.client.from("post_likes").insert({ post_id: post, liker_id: c.id })));
  const like = (await anon.from("post_likes").select("post_owner_id").eq("post_id", post).single()).data;
  check("dono do post na curtida é carimbado pelo banco", like?.post_owner_id === a.id, JSON.stringify(like));
  let linha = (await anon.from("community_goals").select("likes_count").eq("id", post).single()).data;
  check("contador de curtidas é mantido pelo banco", linha?.likes_count === 1);
  await a.client.from("community_goals").update({ likes_count: 9999, comments: [{ text: "falso" }], data: { title: "Golf GTI" } }).eq("id", post);
  linha = (await anon.from("community_goals").select("likes_count, comments, data").eq("id", post).single()).data;
  check("dono edita o conteúdo mas não o contador nem os comentários", linha?.likes_count === 1 && linha?.comments?.length === 0 && linha?.data?.title === "Golf GTI");
  const comentario = (await b.client.rpc("add_comment", { p_post_id: post, p_comment: { text: "massa", userId: c.id } })).data;
  check("comentário sai assinado por quem comentou", comentario?.userId === b.id, JSON.stringify(comentario));
  await c.client.rpc("delete_comment", { p_post_id: post, p_comment_id: comentario?.id });
  linha = (await anon.from("community_goals").select("comments").eq("id", post).single()).data;
  check("terceiro não apaga comentário alheio", linha?.comments?.length === 1);
  await c.client.rpc("rate_goal", { p_post_id: post, p_rating: 50 });
  linha = (await anon.from("community_goals").select("ratings_by").eq("id", post).single()).data;
  check("avaliação fica entre 1 e 5 e só na própria chave", linha?.ratings_by?.[c.id] === 5 && Object.keys(linha.ratings_by).length === 1);
  await a.client.rpc("delete_comment", { p_post_id: post, p_comment_id: comentario?.id });
  linha = (await anon.from("community_goals").select("comments").eq("id", post).single()).data;
  check("dono do post apaga comentário alheio", linha?.comments?.length === 0);
  await b.client.from("post_likes").delete().eq("post_id", post).eq("liker_id", b.id);
  linha = (await anon.from("community_goals").select("likes_count").eq("id", post).single()).data;
  check("descurtir desconta", linha?.likes_count === 0);

  console.log("\nclubes");
  const tagA = tag("A");
  const criado = await a.client.rpc("create_club", {
    p_club: { name: "Clube RLS", tag: tagA, focus: { brands: ["Volkswagen"], styles: [] }, official: true, memberCount: 999 },
    p_member: { displayName: "A" },
  });
  check("fundar clube passa", passed(criado), why(criado));
  const clubId = criado.data;
  let clube = (await anon.from("clubs").select("*").eq("id", clubId).single()).data;
  check("selo oficial e contador não vêm do formulário", clube?.official === false && clube?.member_count === 1 && clube?.founder_id === a.id);
  const repetida = await b.client.rpc("create_club", { p_club: { name: "Outro", tag: tagA }, p_member: {} });
  check("sigla repetida dá tag-taken", repetida.error?.message === "tag-taken", why(repetida));
  check("ninguém cria clube direto na tabela", denied(await b.client.from("clubs").insert({ tag: tag("Z"), founder_id: b.id })));
  check("entrar em clube aberto passa", passed(await b.client.from("club_members").insert({ club_id: clubId, uid: b.id, role: "member" })));
  check("entrar já como capitão é recusado", denied(await c.client.from("club_members").insert({ club_id: clubId, uid: c.id, role: "captain" })));
  check("pôr outra pessoa no clube é recusado", denied(await b.client.from("club_members").insert({ club_id: clubId, uid: c.id, role: "member" })));
  clube = (await anon.from("clubs").select("member_count").eq("id", clubId).single()).data;
  check("contador de membros é mantido pelo banco", clube?.member_count === 2);
  check("membro não edita o clube direto", denied(await b.client.from("clubs").update({ archived: true }).eq("id", clubId).select()));
  const edicaoMembro = await b.client.rpc("update_club", { p_club_id: clubId, p_patch: { description: "x" } });
  check("membro comum não edita pelo update_club", edicaoMembro.error?.message === "not-allowed", why(edicaoMembro));
  check("membro não se promove", denied(await b.client.from("club_members").update({ role: "captain" }).eq("club_id", clubId).eq("uid", b.id).select()));
  check("fundador promove a capitão", passed(await a.client.from("club_members").update({ role: "captain" }).eq("club_id", clubId).eq("uid", b.id)));
  check("capitão edita o recheio", passed(await b.client.rpc("update_club", { p_club_id: clubId, p_patch: { description: "Encontro todo sábado" } })));
  const capitaoNome = await b.client.rpc("update_club", { p_club_id: clubId, p_patch: { name: "Tomado" } });
  check("capitão não mexe na identidade", capitaoNome.error?.message === "not-allowed", why(capitaoNome));
  const fundadorSigla = await a.client.rpc("update_club", { p_club_id: clubId, p_patch: { name: "Clube RLS 2", tag: "HACK" } });
  clube = (await anon.from("clubs").select("tag, name_lower").eq("id", clubId).single()).data;
  check("fundador renomeia, mas a sigla não muda", passed(fundadorSigla) && clube?.tag === tagA && clube?.name_lower === "clube rls 2");

  // Personalização (migration 20261029150000): pasta `clubs/<id>/` só da
  // direção, e logo/capa só com caminho de objeto que existe nessa pasta.
  const pngClube = new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });
  const logoClube = `clubs/${clubId}/logo-rls-${run}.png`;
  check("capitão sobe foto na pasta do clube",
    passed(await b.client.storage.from("photos").upload(logoClube, pngClube, { contentType: "image/png" })));
  check("quem não é da direção não sobe na pasta do clube",
    Boolean((await c.client.storage.from("photos").upload(`clubs/${clubId}/c-${run}.png`, pngClube, { contentType: "image/png" })).error));
  const comLogo = await b.client.rpc("update_club", { p_club_id: clubId, p_patch: { logo: logoClube, colors: { primary: "vinho", secondary: "grafite" } } });
  clube = (await anon.from("clubs").select("data").eq("id", clubId).single()).data;
  check("capitão grava logo e cor (o valor muda de fato)",
    passed(comLogo) && clube?.data?.logo === logoClube && clube?.data?.colors?.primary === "vinho", why(comLogo));
  const logoExterna = await a.client.rpc("update_club", { p_club_id: clubId, p_patch: { cover: "https://example.com/x.jpg" } });
  check("capa com link externo é recusada", logoExterna.error?.message === "invalid-image", why(logoExterna));
  const logoFantasma = await a.client.rpc("update_club", { p_club_id: clubId, p_patch: { cover: `clubs/${clubId}/nao-existe-${run}.jpg` } });
  check("capa de arquivo que não existe é recusada", logoFantasma.error?.message === "invalid-image", why(logoFantasma));
  const corHex = await a.client.rpc("update_club", { p_club_id: clubId, p_patch: { colors: { primary: "#ff0000" } } });
  check("cor fora do vocabulário é recusada", corHex.error?.message === "invalid-colors", why(corHex));
  const criadoComCapa = await c.client.rpc("create_club", {
    p_club: { name: "Capa RLS", tag: tag("K"), cover: "https://example.com/x.jpg", logo: "https://example.com/l.jpg" }, p_member: {},
  });
  const capaNaCriacao = (await admin.from("clubs").select("data").eq("id", criadoComCapa.data).single()).data;
  check("create_club ignora logo e capa do formulário", capaNaCriacao?.data?.cover === "" && capaNaCriacao?.data?.logo === "", why(criadoComCapa));
  check("fundador não sai do clube", denied(await a.client.from("club_members").delete().eq("club_id", clubId).eq("uid", a.id).select()));
  check("post no mural de clube alheio é recusado", denied(await c.client.from("community_goals").insert({ id: `c-${run}`, owner_id: c.id, club_id: clubId })));
  check("membro posta no mural", passed(await b.client.from("community_goals").insert({ id: `b-${run}`, owner_id: b.id, club_id: clubId })));

  const fechado = (await a.client.rpc("create_club", {
    p_club: { name: "Fechado RLS", tag: tag("F"), joinPolicy: "approval", contentVisibility: "members" },
    p_member: {},
  })).data;
  check("clube de aprovação recusa entrada direta", denied(await c.client.from("club_members").insert({ club_id: fechado, uid: c.id, role: "member" })));
  check("pedir para entrar passa", passed(await c.client.from("club_requests").insert({ club_id: fechado, uid: c.id })));
  check("pedido é só entre quem pediu e a direção", (await b.client.from("club_requests").select("*").eq("club_id", fechado)).data?.length === 0);
  check("visitante não vê membros de clube fechado", (await anon.from("club_members").select("*").eq("club_id", fechado)).data?.length === 0);
  check("fundador aprova o pedido", passed(await a.client.from("club_members").insert({ club_id: fechado, uid: c.id, role: "member" })));
  check("aprovar consome o pedido", (await admin.from("club_requests").select("*").eq("club_id", fechado)).data?.length === 0);
  check("aprovar sem pedido é recusado", denied(await a.client.from("club_members").insert({ club_id: fechado, uid: b.id, role: "member" })));

  console.log("\neventos");
  const evento = await a.client.from("events").insert({ created_by: a.id, event_date: "2099-01-01", data: { title: "RLS", maxParticipants: 1 } }).select("id").single();
  check("criar evento passa", passed(evento), why(evento));
  check("evento de clube sem cargo é recusado", denied(await c.client.from("events").insert({ created_by: c.id, club_id: clubId })));
  check("evento em nome de outro é recusado", denied(await b.client.from("events").insert({ created_by: a.id })));
  check("confirmar presença passa", passed(await b.client.from("event_participants").insert({ event_id: evento.data.id, uid: b.id })));
  const lotado = await c.client.from("event_participants").insert({ event_id: evento.data.id, uid: c.id });
  check("lotação é conferida pelo banco", lotado.error?.message === "event-full", why(lotado));
  check("confirmar em nome de outro é recusado", denied(await b.client.from("event_participants").insert({ event_id: evento.data.id, uid: c.id })));
  check("outro não edita o evento", denied(await b.client.from("events").update({ data: { title: "hack" } }).eq("id", evento.data.id).select()));
  check("visitante não lê a lista de presença", (await anon.from("event_participants").select("*").eq("event_id", evento.data.id)).data?.length === 0);
  const totalPublico = (await anon.rpc("event_participant_counts", { p_event_ids: [evento.data.id] })).data;
  check("visitante lê só o total", Number(totalPublico?.[0]?.total) === 1, JSON.stringify(totalPublico));

  console.log("\nmensagens");
  const conversa = await a.client.rpc("start_conversation", { p_other: b.id, p_my_card: { author: "A" }, p_other_card: { author: "B" } });
  check("abrir conversa passa", passed(conversa), why(conversa));
  check("terceiro não lê a conversa", (await c.client.from("conversations").select("*").eq("id", conversa.data)).data?.length === 0);
  check("mandar mensagem passa", passed(await a.client.rpc("send_message", { p_conversation: conversa.data, p_text: "oi", p_type: "text", p_data: {} })));
  const intruso = await c.client.rpc("send_message", { p_conversation: conversa.data, p_text: "oi", p_type: "text", p_data: {} });
  check("terceiro não manda mensagem na conversa", Boolean(intruso.error));
  check("ninguém insere mensagem direto", denied(await a.client.from("messages").insert({ conversation_id: conversa.data, sender_id: a.id, text: "x" })));
  let conv = (await b.client.from("conversations").select("unread").eq("id", conversa.data).single()).data;
  check("não lidas sobem para quem recebe", conv?.unread?.[b.id] === 1);
  const sinoB = (await b.client.from("notifications").select("type").eq("type", "message")).data;
  check("primeira mensagem vira aviso no sino", sinoB?.length === 1);
  await b.client.rpc("mark_conversation_read", { p_conversation: conversa.data });
  conv = (await b.client.from("conversations").select("unread").eq("id", conversa.data).single()).data;
  const vista = (await b.client.from("messages").select("status").eq("conversation_id", conversa.data)).data;
  check("marcar lida zera o contador e marca como vista", conv?.unread?.[b.id] === 0 && vista?.[0]?.status === "seen");
  check("terceiro não lê as mensagens", (await c.client.from("messages").select("*").eq("conversation_id", conversa.data)).data?.length === 0);

  console.log("\nserviços");
  check("anúncio nasce pendente", passed(await a.client.from("service_listings").insert({ id: `s-${run}`, owner_id: a.id, data: { title: "Funilaria" } })));
  // Desde 20261025150000 a RLS aceita 'approved' do dono (edição leve fica no
  // ar) e o gatilho decide o status: o que importa é o que fica gravado.
  const status = async (id) => (await admin.from("service_listings").select("moderation_status").eq("id", id).maybeSingle()).data?.moderation_status;
  await a.client.from("service_listings").insert({ id: `s2-${run}`, owner_id: a.id, moderation_status: "approved" });
  check("anúncio já aprovado nasce pendente", [undefined, "pending"].includes(await status(`s2-${run}`)));
  await a.client.from("service_listings").update({ moderation_status: "approved" }).eq("id", `s-${run}`);
  check("dono não se aprova", (await status(`s-${run}`)) === "pending");
  check("pendente não é público", (await anon.from("service_listings").select("*").eq("id", `s-${run}`)).data?.length === 0);
  await anon.rpc("track_listing_metric", { p_listing_id: `s-${run}`, p_metric: "view" });
  await a.client.from("service_listings").update({ view_count: 500, data: { title: "Funilaria 2" } }).eq("id", `s-${run}`);
  const anuncio = (await admin.from("service_listings").select("view_count, data").eq("id", `s-${run}`).single()).data;
  check("métrica não sobe em pendente nem pelo dono", anuncio?.view_count === 0 && anuncio?.data?.title === "Funilaria 2");
  await admin.from("service_listings").update({ moderation_status: "approved" }).eq("id", `s-${run}`);
  await anon.rpc("track_listing_metric", { p_listing_id: `s-${run}`, p_metric: "view" });
  check("visitante conta visita em aprovado (de um em um)", (await admin.from("service_listings").select("view_count").eq("id", `s-${run}`).single()).data?.view_count === 1);

  console.log("\navaliações de serviço");
  const sid = `s-${run}`;
  const nota = async () => (await admin.from("service_listings").select("rating_count, rating_avg").eq("id", sid).single()).data;
  check("visitante não avalia", denied(await anon.from("service_reviews").insert({ listing_id: sid, rating: 5 })));
  const propria = await a.client.from("service_reviews").insert({ listing_id: sid, rating: 5 });
  check("dono não avalia o próprio anúncio", propria.error?.message === "own-listing", why(propria));
  const fantasma = await b.client.from("service_reviews").insert({ listing_id: `nada-${run}`, rating: 5 });
  check("anúncio inexistente ou não aprovado dá listing-unavailable", fantasma.error?.message === "listing-unavailable", why(fantasma));
  const novata = await b.client.from("service_reviews").insert({ listing_id: sid, rating: 5 });
  check("conta com menos de 24 h não avalia", novata.error?.message === "account-too-new", why(novata));
  // As contas do teste nasceram agora; a avaliação de B entra como escrita de
  // servidor (service_role), e daqui para frente é B quem mexe nela.
  const plantada = await admin.from("service_reviews").insert({ listing_id: sid, author_id: b.id, rating: 4, comment: "bom" }).select("id").single();
  check("servidor planta avaliação", passed(plantada), why(plantada));
  const reviewId = plantada.data?.id;
  const repetida2 = await admin.from("service_reviews").insert({ listing_id: sid, author_id: b.id, rating: 1 });
  check("uma avaliação por pessoa por anúncio", repetida2.error?.code === "23505", why(repetida2));
  check("visitante lê avaliação publicada", (await anon.from("service_reviews").select("id").eq("id", reviewId)).data?.length === 1);
  let media = await nota();
  check("média e contagem mantidas pelo banco", media?.rating_count === 1 && Number(media?.rating_avg) === 4, JSON.stringify(media));
  const dist = (await anon.rpc("service_review_distribution", { p_listing_id: sid })).data;
  check("visitante lê a distribuição", dist?.["4"] === 1 && dist?.["5"] === 0, JSON.stringify(dist));
  await b.client.from("service_reviews")
    .update({ rating: 2, comment: "mudei", status: "hidden", owner_reply: "eu mesmo", listing_id: `nada-${run}` })
    .eq("id", reviewId);
  let rev = (await admin.from("service_reviews").select("*").eq("id", reviewId).single()).data;
  check("autor edita nota e texto, mas não status, resposta nem anúncio",
    rev?.rating === 2 && rev?.comment === "mudei" && rev?.status === "published" && rev?.owner_reply === null && rev?.listing_id === sid,
    JSON.stringify(rev));
  media = await nota();
  check("média recontada depois da edição", Number(media?.rating_avg) === 2, JSON.stringify(media));
  await a.client.from("service_reviews").update({ owner_reply: "Obrigado", rating: 5, comment: "ótimo" }).eq("id", reviewId);
  rev = (await admin.from("service_reviews").select("*").eq("id", reviewId).single()).data;
  check("dono do anúncio responde, mas não mexe na nota nem no texto",
    rev?.owner_reply === "Obrigado" && Boolean(rev?.owner_reply_at) && rev?.rating === 2 && rev?.comment === "mudei",
    JSON.stringify(rev));
  check("terceiro não responde no lugar do dono", denied(await c.client.from("service_reviews").update({ owner_reply: "hack" }).eq("id", reviewId).select()));
  check("dono do anúncio não apaga avaliação", denied(await a.client.from("service_reviews").delete().eq("id", reviewId).select()));
  await a.client.from("service_reviews").update({ status: "hidden" }).eq("id", reviewId);
  check("dono do anúncio não oculta avaliação", (await admin.from("service_reviews").select("status").eq("id", reviewId).single()).data?.status === "published");
  check("logado denuncia avaliação", passed(await c.client.from("reports").insert({ reporter_id: c.id, target_type: "service_review", target_id: reviewId, reported_user_id: b.id })));
  await admin.from("service_reviews").update({ status: "hidden" }).eq("id", reviewId);
  check("oculta some para o público", (await anon.from("service_reviews").select("id").eq("id", reviewId)).data?.length === 0);
  check("autor ainda vê a própria oculta", (await b.client.from("service_reviews").select("id").eq("id", reviewId)).data?.length === 1);
  check("oculta sai da média", (await nota())?.rating_count === 0);
  await admin.from("service_reviews").update({ status: "published" }).eq("id", reviewId);
  await a.client.from("service_listings").update({ rating_count: 99, rating_sum: 999, moderation_status: "pending" }).eq("id", sid);
  check("dono não escreve a nota do anúncio", (await nota())?.rating_count === 1);
  await admin.from("service_listings").update({ moderation_status: "approved" }).eq("id", sid);
  check("autor apaga a própria", passed(await b.client.from("service_reviews").delete().eq("id", reviewId)));
  check("apagar desconta da média", (await nota())?.rating_count === 0);

  console.log("\nbloqueio");
  check("bloquear passa", passed(await a.client.from("blocks").insert({ blocker_id: a.id, blocked_id: b.id })));
  check("bloqueado não vê quem o bloqueou", (await b.client.from("blocks").select("*")).data?.length === 0);
  const comentarioBloqueado = await b.client.rpc("add_comment", { p_post_id: post, p_comment: { text: "oi" } });
  check("bloqueado não comenta", comentarioBloqueado.error?.message === "blocked", why(comentarioBloqueado));
  const conversaBloqueada = await b.client.rpc("start_conversation", { p_other: a.id, p_my_card: {}, p_other_card: {} });
  check("bloqueado não abre conversa", conversaBloqueada.error?.message === "blocked", why(conversaBloqueada));
  check("bloqueado não curte", denied(await b.client.from("post_likes").insert({ post_id: post, liker_id: b.id })));
  check("desbloquear passa", passed(await a.client.from("blocks").delete().eq("blocker_id", a.id).eq("blocked_id", b.id)));

  // Pedido de orçamento (migration 20261029120000). A é o prestador (anúncio
  // aprovado de mecânica em Araraquara), B pede, C é terceiro.
  console.log("\npedido de orçamento");
  const qListing = `q-${run}`;
  await admin.from("service_listings").insert({
    id: qListing, owner_id: a.id, moderation_status: "approved",
    data: { title: "Oficina RLS", category: "mechanics", city: "Araraquara", state: "SP", country: "BR", serviceMode: "place" },
  });
  const pedido = { category: "mechanics", carLabel: "Gol 2014", description: "Barulho na suspensão dianteira (teste RLS)", city: "Araraquara", state: "SP", country: "BR" };
  check("visitante não pede orçamento", Boolean((await anon.rpc("create_quote_request", { p_request: pedido })).error));
  check("ninguém insere pedido direto na tabela",
    denied(await b.client.from("quote_requests").insert({ customer_id: b.id, category: "mechanics", description: "x".repeat(30), state: "SP", city: "Araraquara", expires_at: "2099-01-01" }).select()));
  const fotoAlheia = await b.client.rpc("create_quote_request", { p_request: { ...pedido, photos: [`${URL_}/storage/v1/object/public/photos/users/${a.id}/x.jpg`] } });
  check("foto da pasta alheia é recusada", fotoAlheia.error?.message === "invalid-photo", why(fotoAlheia));
  const novoPedido = await b.client.rpc("create_quote_request", { p_request: pedido });
  check("logado pede orçamento", passed(novoPedido), why(novoPedido));
  const qid = novoPedido.data;
  const avisoPedido = (await admin.from("notifications").select("actor_id, data").eq("user_id", a.id).eq("type", "quote_request")).data || [];
  check("prestador da cidade recebe aviso sem o nome do cliente",
    avisoPedido.length === 1 && avisoPedido[0].actor_id === null && !avisoPedido[0].data?.actorUsername, JSON.stringify(avisoPedido));
  let caixa = (await a.client.rpc("quote_inbox")).data || [];
  const naCaixa = caixa.find((item) => item.id === qid);
  check("pedido aparece na caixa do prestador, sem o cliente", Boolean(naCaixa) && naCaixa.customer_id === null, JSON.stringify(naCaixa));
  check("terceiro sem anúncio não vê o pedido", !((await c.client.rpc("quote_inbox")).data || []).some((item) => item.id === qid));
  check("prestador não lê a tabela de pedidos", (await a.client.from("quote_requests").select("id").eq("id", qid)).data?.length === 0);
  let resposta = await c.client.rpc("reply_quote_request", { p_request: qid, p_reply: { priceMin: 100, message: "oi" } });
  check("quem não está no alcance não responde", resposta.error?.message === "not-found", why(resposta));
  resposta = await a.client.rpc("reply_quote_request", { p_request: qid, p_reply: { priceMin: 250, priceMax: 400, estimatedTime: "1 dia", message: "Pode trazer" } });
  check("prestador responde", passed(resposta), why(resposta));
  const replyId = resposta.data;
  resposta = await a.client.rpc("reply_quote_request", { p_request: qid, p_reply: { priceMin: 200, message: "de novo" } });
  check("uma resposta por prestador", resposta.error?.message === "already-replied", why(resposta));
  check("cliente recebe quote_reply",
    (await admin.from("notifications").select("id").eq("user_id", b.id).eq("type", "quote_reply")).data?.length === 1);
  caixa = (await a.client.rpc("quote_inbox")).data || [];
  check("depois de responder o prestador vê quem pediu", caixa.find((item) => item.id === qid)?.customer_id === b.id);
  const meus = (await b.client.rpc("my_quote_requests")).data || [];
  check("cliente vê a resposta", meus.find((item) => item.id === qid)?.replies?.length === 1);
  check("terceiro não lê respostas alheias", (await c.client.from("quote_replies").select("id")).data?.length === 0);
  check("terceiro não fecha pedido alheio",
    (await c.client.rpc("close_quote_request", { p_request: qid, p_outcome: "gave_up" })).error?.message === "not-found");
  check("terceiro não denuncia resposta que não vê",
    denied(await c.client.from("reports").insert({ reporter_id: c.id, target_type: "quote_reply", target_id: replyId })));
  check("cliente denuncia a resposta",
    passed(await b.client.from("reports").insert({ reporter_id: b.id, target_type: "quote_reply", target_id: replyId, reason: "spam" })));
  check("cliente escolhe a resposta",
    passed(await b.client.rpc("close_quote_request", { p_request: qid, p_outcome: "chosen", p_reply: replyId })));
  await a.client.from("blocks").insert({ blocker_id: a.id, blocked_id: b.id });
  const bloqueadoPede = await b.client.rpc("create_quote_request", { p_request: { ...pedido, description: "Segundo pedido com bloqueio (teste RLS)" } });
  check("pedido com bloqueio não avisa quem bloqueou",
    (await admin.from("notifications").select("id").eq("user_id", a.id).eq("type", "quote_request")).data?.length === 1, why(bloqueadoPede));
  check("pedido de quem bloqueei não aparece na caixa",
    !((await a.client.rpc("quote_inbox")).data || []).some((item) => item.id === bloqueadoPede.data));
  await a.client.from("blocks").delete().eq("blocker_id", a.id).eq("blocked_id", b.id);
  await admin.from("reports").delete().eq("target_type", "quote_reply").eq("target_id", replyId);
  await admin.from("service_listings").delete().eq("id", qListing);

  console.log("\ndenúncias");
  check("logado denuncia", passed(await a.client.from("reports").insert({ reporter_id: a.id, target_id: post, reason: "teste" })));
  check("tipo inventado é recusado", denied(await a.client.from("reports").insert({ reporter_id: a.id, target_type: "nada", target_id: post })));
  check("moderação comum (não-admin) não remove", Boolean((await a.client.rpc("moderation_remove", { p_report_id: "00000000-0000-0000-0000-000000000000" })).error));
  check("denúncia em nome de outro é recusada", denied(await a.client.from("reports").insert({ reporter_id: b.id, target_id: post })));
  check("quem denunciou não relê", (await a.client.from("reports").select("*")).data?.length === 0);

  console.log("\nfotos");
  const png = new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });
  check("subir na própria pasta passa", passed(await a.client.storage.from("photos").upload(`users/${a.id}/rls/${run}.png`, png, { contentType: "image/png" })));
  check("subir na pasta alheia é recusado", Boolean((await a.client.storage.from("photos").upload(`users/${b.id}/rls/${run}.png`, png, { contentType: "image/png" })).error));
  await admin.storage.from("photos").remove([`users/${a.id}/rls/${run}.png`]);

  // Suspensão (migration 20261028120000). A moderação real é o e-mail do
  // admin; aqui não há sessão dele, então a suspensão entra pelo service role
  // (o mesmo efeito de moderation_suspend) e o resto é testado como B, a
  // suspensa, e como A e C, os outros.
  console.log("\nsuspensão de conta");
  check("não-admin não suspende",
    (await a.client.rpc("moderation_suspend", { p_user: b.id, p_reason: "minor" })).error?.message === "not-allowed");
  check("ninguém escreve direto na tabela de suspensões",
    denied(await a.client.from("account_suspensions").insert({ user_id: b.id, reason: "minor" }).select()));
  await b.client.from("public_profiles").upsert({ user_id: b.id, username: `@rlsb${run}`, author: "RLS B" });
  const postB = `post-${b.id}-${run}`;
  await b.client.from("community_goals").insert({ id: postB, owner_id: b.id, data: { title: "post de B" } });
  check("antes: visitante vê o post de B", (await anon.from("community_goals").select("id").eq("id", postB)).data?.length === 1);
  const suspendeu = await admin.from("account_suspensions").insert({ user_id: b.id, reason: "minor", note: "rls" });
  check("suspender pelo service role passa", passed(suspendeu), why(suspendeu));
  const minha = (await b.client.rpc("my_suspension")).data;
  check("a suspensa lê motivo e data, sem a anotação", minha?.reason === "minor" && !("note" in (minha || {})), JSON.stringify(minha));
  check("a suspensa não lê a tabela", (await b.client.from("account_suspensions").select("*")).data?.length === 0);
  check("outra conta não está suspensa", (await a.client.rpc("i_am_suspended")).data === false);
  const suspensa = (res) => res.error?.message === "account-suspended";
  const naoAchou = (res) => res.error?.message === "not-found";
  let res = await b.client.from("community_goals").insert({ id: `${postB}-2`, owner_id: b.id, data: {} });
  check("suspensa não publica", suspensa(res), why(res));
  res = await b.client.rpc("add_comment", { p_post_id: post, p_comment: { text: "oi" } });
  check("suspensa não comenta", suspensa(res), why(res));
  res = await b.client.from("post_likes").insert({ post_id: post, liker_id: b.id });
  check("suspensa não curte", suspensa(res), why(res));
  res = await b.client.from("follows").insert({ follower_id: b.id, target_id: c.id });
  check("suspensa não segue", suspensa(res), why(res));
  res = await b.client.rpc("start_conversation", { p_other: c.id, p_my_card: {}, p_other_card: {} });
  check("suspensa não abre conversa", suspensa(res), why(res));
  res = await b.client.from("events").insert({ created_by: b.id, event_date: "2099-01-01", data: { title: "x" } });
  check("suspensa não cria evento", suspensa(res), why(res));
  res = await b.client.rpc("create_club", { p_club: { name: "Clube B", tag: tag("B") }, p_member: {} });
  check("suspensa não cria clube", suspensa(res), why(res));
  res = await b.client.from("service_listings").insert({ owner_id: b.id, data: { title: "x" } });
  check("suspensa não anuncia", suspensa(res), why(res));
  res = await b.client.from("service_reviews").insert({ listing_id: sid, author_id: b.id, rating: 5 });
  check("suspensa não avalia serviço", Boolean(res.error), why(res));
  const pngB = new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });
  check("suspensa não sobe foto",
    Boolean((await b.client.storage.from("photos").upload(`users/${b.id}/rls/${run}.png`, pngB, { contentType: "image/png" })).error));
  check("capitã suspensa não sobe foto do clube",
    Boolean((await b.client.storage.from("photos").upload(`clubs/${clubId}/susp-${run}.png`, pngB, { contentType: "image/png" })).error));
  res = await b.client.rpc("update_club", { p_club_id: clubId, p_patch: { colors: { primary: "prata" } } });
  check("capitã suspensa não muda a cor do clube", suspensa(res), why(res));
  res = await c.client.from("follows").insert({ follower_id: c.id, target_id: b.id });
  check("ninguém segue a suspensa", naoAchou(res), why(res));
  res = await c.client.rpc("start_conversation", { p_other: b.id, p_my_card: {}, p_other_card: {} });
  check("ninguém abre conversa com a suspensa", naoAchou(res), why(res));
  check("post da suspensa some para visitante", (await anon.from("community_goals").select("id").eq("id", postB)).data?.length === 0);
  check("post da suspensa some para logado", (await c.client.from("community_goals").select("id").eq("id", postB)).data?.length === 0);
  check("perfil da suspensa some", (await anon.from("public_profiles").select("user_id").eq("user_id", b.id)).data?.length === 0);
  check("a suspensa ainda lê os próprios dados", (await b.client.from("community_goals").select("id").eq("id", postB)).data?.length === 1);
  check("desfazer seguir continua liberado", passed(await b.client.from("follows").delete().eq("follower_id", b.id)));
  await admin.from("account_suspensions").update({ lifted_at: new Date().toISOString() }).eq("user_id", b.id).is("lifted_at", null);
  check("levantada, o post volta", (await anon.from("community_goals").select("id").eq("id", postB)).data?.length === 1);
  check("levantada, volta a curtir", passed(await b.client.from("post_likes").insert({ post_id: postB, liker_id: b.id })));

  console.log("\nexcluir a conta");
  await c.client.rpc("add_comment", { p_post_id: post, p_comment: { text: "tchau" } });
  await c.client.rpc("rate_goal", { p_post_id: post, p_rating: 4 });
  const fundadoPorC = (await c.client.rpc("create_club", { p_club: { name: "Clube do C", tag: tag("C") }, p_member: {} })).data;
  const conversaC = (await c.client.rpc("start_conversation", { p_other: a.id, p_my_card: { author: "C" }, p_other_card: { author: "A" } })).data;
  await admin.from("service_reviews").insert({ listing_id: `s-${run}`, author_id: c.id, rating: 1 });
  const excluiu = await c.client.rpc("delete_my_account");
  check("excluir a própria conta passa", passed(excluiu), why(excluiu));
  created.splice(created.indexOf(c.id), 1);
  linha = (await admin.from("community_goals").select("comments, ratings_by").eq("id", post).single()).data;
  check("comentário e avaliação nos posts alheios saem", linha?.comments?.length === 0 && !(c.id in (linha?.ratings_by || {})));
  check("clube fundado é arquivado", (await admin.from("clubs").select("archived").eq("id", fundadoPorC).single()).data?.archived === true);
  const cartao = (await admin.from("conversations").select("members").eq("id", conversaC).single()).data;
  check("na conversa vira 'Conta excluída'", cartao?.members?.[c.id]?.author === "Conta excluída");
  const notaDepois = (await admin.from("service_listings").select("rating_count").eq("id", `s-${run}`).single()).data;
  check("avaliação de serviço sai e a média é recontada",
    (await admin.from("service_reviews").select("id").eq("author_id", c.id)).data?.length === 0 && notaDepois?.rating_count === 0);
  check("presença, filiação e @ saem em cascata",
    (await admin.from("club_members").select("*").eq("uid", c.id)).data?.length === 0 &&
    (await admin.from("achievements").select("*").eq("user_id", c.id)).data?.length === 0);
} catch (error) {
  failures += 1;
  console.log(`\n  FALHA erro inesperado: ${error?.message || error}`);
} finally {
  // Limpeza: apagar as contas leva tudo que é delas em cascata. Clubes e
  // conversas criados aqui saem à mão.
  const pastasDeClube = (await admin.from("clubs").select("id").in("founder_id", created)).data || [];
  for (const { id } of pastasDeClube) {
    const arquivos = (await admin.storage.from("photos").list(`clubs/${id}`)).data || [];
    if (arquivos.length) await admin.storage.from("photos").remove(arquivos.map((f) => `clubs/${id}/${f.name}`));
  }
  await admin.from("clubs").delete().in("founder_id", created);
  await admin.from("conversations").delete().like("id", `%${users.a?.id || "nada"}%`);
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => {});
  await admin.from("clubs").delete().is("founder_id", null).like("name_lower", "%rls%");
  await admin.from("clubs").delete().is("founder_id", null).eq("name_lower", "clube do c");
}

console.log(failures ? `\n${failures} falha(s)\n` : "\ntudo verde\n");
process.exit(failures ? 1 : 0);
