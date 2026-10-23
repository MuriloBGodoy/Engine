/**
 * Trava de escala: nenhuma tela lê a base inteira de usuários.
 *
 *   npm run check:escala
 *
 * Nasceu da auditoria de 24–25/09/2026. `subscribePublicProfiles` escutava a
 * coleção INTEIRA de perfis em cinco telas; medido em produção, 6 usuários já
 * davam 172 KB por abertura da Comunidade (avatar em base64 dentro do
 * perfil), e ~200 usuários esgotariam a cota diária do plano Spark — o app
 * parava para todos. Também era a causa do perfil por link direto
 * redirecionar para a Comunidade (a 1ª resposta da escuta vem do cache).
 *
 * Leitura de perfil agora é sempre pontual: por ids, por @nome, ou busca com
 * limite (`getPublicProfilesByIds`, `getPublicProfileByUsername`,
 * `searchPublicProfiles`). Esta trava impede a escuta de voltar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FALHA ${name}${detail ? `\n         ${detail}` : ""}`);
  }
};

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel, out);
    else if (/\.jsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
};

console.log("\ncontrato de escala\n");

// Código, não comentário: remove os comentários antes de procurar, senão a
// própria explicação de por que a escuta saiu faria a trava falhar.
const semComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const arquivos = walk("src");
const comEscuta = arquivos.filter((f) => /subscribePublicProfiles\s*\(/.test(semComentarios(read(f))));
check("ninguém chama nem define subscribePublicProfiles", comEscuta.length === 0, comEscuta.join(", "));

const db = semComentarios(read("src/services/db.js"));
check(
  "nenhum onSnapshot na coleção de perfis inteira",
  !/onSnapshot\(\s*publicProfilesCollection\(\)/.test(db),
);
check(
  "nenhum getDocs na coleção de perfis sem filtro",
  !/getDocs\(\s*publicProfilesCollection\(\)\s*\)/.test(db),
);

// A busca tem limite em todos os caminhos.
const busca = db.slice(db.indexOf("async searchPublicProfiles"), db.indexOf("async searchPublicProfiles") + 2500);
check("searchPublicProfiles sempre com limit()", (busca.match(/limit\(/g) || []).length >= 2);

// O perfil decide "não existe" com resposta do servidor, não do cache. No
// Firestore isso exigia `getDocsFromServer`; no Supabase toda consulta vai ao
// servidor, e o que a trava confere é que a resposta vem DA consulta pelo @ e
// não de `publicProfileCache` (o cache só é escrito depois dela).
const porNome = db.slice(db.indexOf("async getPublicProfileByUsername"), db.indexOf("async getPublicProfileByUsername") + 800);
check(
  "perfil por @nome lê do servidor, não do cache",
  /from\("public_profiles"\)[\s\S]*\.eq\("username", normalized\)/.test(porNome) &&
    !/publicProfileCache\.get\(/.test(porNome),
);

const perfil = semComentarios(read("src/pages/UserProfile.jsx"));
check(
  "UserProfile não redireciona quando o perfil não existe",
  !/if\s*\(\s*!userProfile\s*\)\s*\{\s*navigate\(/.test(perfil),
);

console.log(failures ? `\n${failures} falha(s)\n` : "\ntudo verde\n");
process.exit(failures ? 1 : 0);
