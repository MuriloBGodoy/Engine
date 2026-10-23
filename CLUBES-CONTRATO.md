# Clubes — contrato entre a camada de dados e a tela

Escrito em 22/09/2026, quando o Murilo aprovou o protótipo da Jesse
("ficou incrível, pode seguir") e a fase 1 do `CLUBES-MODELO.md` virou
código. **Este arquivo existe por um motivo só: Han e Jesse implementam em
paralelo, e sem um contrato escrito as duas metades não se encontram.**

- **Han** implementa tudo que está aqui (`services/clubs.js`, regras,
  índices, seed). Ele é o dono da forma do dado.
- **Jesse** consome, e não fala com o Firestore direto em componente nenhum.
- **Quem precisar mudar o contrato avisa o Claude, que atualiza aqui e conta
  para o outro.** Mudar em silêncio é o jeito garantido de um esperar um
  campo que o outro nunca mandou.

A verdade sobre o que cada campo significa continua no `CLUBES-MODELO.md`,
seção 2 e seção 7. Aqui é só a fronteira.

---

## 1. O formato do clube que chega na tela

Toda função que devolve clube devolve **este** formato, já normalizado —
componente nenhum lê `snapshot.data()`:

```js
{
  id: "abc123",
  name: "Civic Club Campinas",
  tag: "CVC",                    // 2–5 letras maiúsculas, única no app
  motto: "Nada de original, tudo de respeito",
  description: "",
  emblem: { shape: "plate", icon: "target" },   // shape: plate|shield|circle|hex
  colors: { primary: "azul-noite", secondary: "" },  // NOMES da paleta, nunca hex
  cover: "",                     // base64 comprimido ou ""
  country: "BR", state: "SP", city: "Campinas",
  foundedYear: 2011,
  meetupSchedule: "1º domingo do mês",
  focus: { brands: ["Honda"], models: ["Civic"], styles: ["jdm"] },
  rules: ["Respeito acima de tudo"],
  links: { instagram: "", whatsapp: "", facebook: "", website: "" },
  joinPolicy: "open",            // open | approval   (invite é fase 2)
  contentVisibility: "public",   // public | members
  founderId: "uid...",
  memberCount: 128,              // VITRINE — ver §6
  official: false,
  archived: false,
  createdAt: "2026-09-22T...",   // ISO string, nunca Timestamp do Firestore
  updatedAt: "2026-09-22T...",

  // derivados, preenchidos por quem consulta (não moram no documento):
  myRole: "captain" | "member" | null,   // null = não sou membro
  myRequestPending: false,
  nextMeetup: { id, title, eventDate, city } | null,
}
```

**Regras de forma, que valem para tudo:**

- Data sempre **string ISO**, convertida na camada de dados. `Timestamp` do
  Firestore não chega em componente.
- Cor sempre **nome da paleta** (`"azul-noite"`), nunca hex. Quem traduz nome
  → hex é a tela, com a paleta única de `services/clubStyles.js` (§7).
- Campo que falta vem como `""`, `[]` ou `null` — **nunca `undefined`**, para
  a tela não precisar de `?.` em toda linha.
- Erro é `throw new Error(mensagem já traduzível)`; a tela mostra com toast.

---

## 2. As funções que a tela chama

Tudo em `src/services/clubs.js`. **Mantém os nomes de hook que já existem**
(`useMyClubs`, `useDiscoverClubs`, `useClubDetail`, `useClubMembers`,
`useCreateClub`) para o diff ficar legível; o que muda é o miolo e o formato.

### Leitura

```js
// Meus clubes — lê o espelho users/{uid}/clubs, depois hidrata os docs.
// Sem collectionGroup. Devolve [] para visitante.
useMyClubs() → { clubs, loading, error, fetch() }

// Descoberta. Ver §3 para o que cada seção significa.
useDiscoverClubs() → { sections, loading, error, fetch(filtros) }
//   filtros: { state, style, brand, search, limit }
//   sections: { forYourCar: [], trending: [], nearby: [], all: [] }

// Um clube. Traz myRole, myRequestPending e nextMeetup já resolvidos.
useClubDetail(clubId) → { club, loading, error, fetch() }

// Membros, ordenados fundador → capitães → resto por joinedAt.
useClubMembers(clubId) → { members, loading, error, fetch({ limit }) }
//   member: { uid, role, joinedAt, displayName, username, avatar }

// Mural: communityGoals com clubId. Reusa o que o feed já sabe ler.
useClubPosts(clubId) → { posts, loading, error, fetch({ limit }) }

// Encontros: events com clubId. Próximos primeiro; `past: true` traz os que já foram.
useClubEvents(clubId, { past }) → { events, loading, error, fetch() }

// Garagem automática (fase 1): metas publicadas dos membros, as que casam
// com o foco do clube primeiro. Ver §5.
useClubGarage(clubId) → { cars, loading, error, fetch({ limit }) }
//   car: { goalId, ownerId, ownerName, ownerTag, name, image, brand, model, year }
```

### Escrita

```js
useCreateClub() → { create(dadosDoFormulario), loading }
//   dadosDoFormulario = o formato do §1 sem: id, founderId, memberCount,
//   official, archived, createdAt, updatedAt, e sem os derivados.
//   Faz em UM batch: clubs/{id} + clubTags/{TAG} + members/{uid} (founder)
//   + users/{uid}/clubs/{id}. Devolve o clube criado no formato do §1.
//   Estoura se a sigla já existir — mensagem específica, ver §4.

useClubMembership(clubId) → {
  join(),      // joinPolicy open: entra. approval: cria requests/{uid}.
  leave(),     // fundador não pode sair (erro específico)
  loading,
  status,      // "member" | "captain" | "founder" | "pending" | "none"
}

useClubAdmin(clubId) → {
  updateClub(parcial),        // fundador: tudo. capitão: só description,
                              // rules, links, meetupSchedule, cover.
  listRequests(),             // [{ uid, displayName, username, avatar, message, createdAt }]
  approveRequest(uid),
  rejectRequest(uid),
  promote(uid), demote(uid),  // só fundador
  removeMember(uid),          // capitão e fundador
  archiveClub(),              // só fundador; não existe delete
  loading,
}

// Sigla livre? Chamada enquanto a pessoa digita, com debounce na tela.
checkTagAvailable(tag) → Promise<boolean>
```

### Integração com o que já existe

```js
// events: campos novos OPCIONAIS. Quem cria evento pela página do clube manda
// os três; evento fora de clube continua sem eles.
createEvent({ ..., clubId, clubTag, clubName })

// communityGoals: idem, dois campos.
publishGoal({ ..., clubId, clubTag })
```

O `EventCard` e o `GoalCard` mostram o chip `[TAG]` quando `clubTag` existe.
Essa é a única mudança que Jesse faz em componente de outra feature.

---

## 3. Descoberta — o que cada seção é

Ordem das seções na tela, e o que enche cada uma (modelo §5):

| seção | consulta | quando some |
|---|---|---|
| `forYourCar` | clubes cujo `focus.brands` ou `focus.models` casa com algum carro da garagem da pessoa | visitante, ou garagem vazia, ou zero resultado |
| `trending` | clubes com encontro nos próximos 30 dias, por `memberCount desc` | zero resultado |
| `nearby` | `state` da região ativa, por `memberCount desc` | zero resultado |
| `all` | resto, por `memberCount desc` | nunca — é o fundo do poço |

**Anti-tela-vazia** (mesma cascata da região, memória `engine-regiao-localidade`):
se depois de tudo a soma der menos de 3 clubes, a tela mostra o convite a
fundar. Seção vazia **não aparece** — não existe "Nenhum clube perto de você"
ocupando espaço.

Os 10 clubes oficiais do seed entram nas seções normalmente, com selo `★`, e
**ficam fora de qualquer ranking**.

---

## 4. Erros que a tela precisa distinguir

Cada um com `error.code` próprio, porque a tela reage diferente:

| code | quando | o que a tela faz |
|---|---|---|
| `tag-taken` | sigla já existe | marca o campo em vermelho, não perde o formulário |
| `tag-invalid` | fora de `^[A-Z0-9]{2,5}$` | idem |
| `not-member` | ação que exige ser membro | manda entrar no clube |
| `not-allowed` | ação que exige cargo | esconde o botão (não deveria ter aparecido) |
| `founder-cannot-leave` | fundador tentando sair | explica que precisa transferir ou arquivar |
| `already-requested` | pedido já pendente | mostra "pedido enviado" |

Mensagens legíveis vêm do i18n da Jesse; o `code` é do Han.

---

## 5. Garagem automática — como funciona na fase 1

Não existe `clubs/{id}/garage` na fase 1 (isso é fase 2). A garagem do clube
**é derivada**:

1. lê os uids de `clubs/{id}/members` (até 50 na fase 1);
2. consulta `communityGoals` com `kind == "post"` e `ownerId in [...]`
   (o `in` do Firestore aceita 30 por consulta → lotes de 30);
3. ordena: primeiro as que casam com `focus.brands`/`focus.models`, depois o
   resto por data;
4. devolve no formato do §1.

Limite honesto, que a tela deve dizer quando bater: mostra os carros de até
50 membros. Não é "todos os carros do clube" — é a vitrine.

---

## 6. Contadores — qual número usar onde

| lugar | número | por quê |
|---|---|---|
| card na grade | `club.memberCount` (vitrine) | é grade; contar por clube seria N agregações |
| cabeçalho da página do clube | `getCountFromServer(members)` | é uma tela só, e o número em destaque tem que ser verdade |
| ranking (fase 2) | agregação | vitrine é forjável ±1 por escrita |
| carros na garagem | tamanho da lista devolvida | com o aviso do §5 |
| encontros realizados | count em `events` | |

`postCount` **morre**: não tem quem o mantenha honesto.

---

## 7. O que é da tela, não do dado

Mora em `src/services/clubStyles.js`, criado pela Jesse, e o Han **não
depende dele**:

- os 17 estilos: `{ id, labelKey }` — o id vai para `focus.styles`, o rótulo
  vem do i18n;
- a paleta: `{ nome, hexClaro, hexEscuro, textoSobre }` — 16 cores, cada uma
  aprovada em contraste nos dois temas;
- as 4 formas de emblema e os 12 símbolos: `{ id, labelKey }`;
- o gerador de emblema em SVG (`<ClubEmblem club={club} size={n} />`).

O documento do clube guarda **ids e nomes**, nunca hex nem SVG. É o que
permite trocar a paleta inteira depois sem tocar em dado nenhum.

---

## 8. Ordem de trabalho e onde cada um escreve

**Han escreve, e só ele:**
`src/services/clubs.js`, as políticas de clube em `supabase/migrations/`,
os casos de clube em `engine/scripts/check-rls.mjs`,
e os campos novos em `src/services/events.js` / `db.js` (só o que o §2 pede).

**Jesse escreve, e só ela:**
`src/components/clubs/*`, `src/components/community/ClubsTab.jsx`,
`src/pages/ClubsPage.jsx`, `src/pages/ClubDetailPage.jsx`,
`src/services/clubStyles.js`, o bloco `clubs` do `src/services/i18n.js`,
e o chip `[TAG]` em `EventCard.jsx` / no `GoalCard` da Comunidade.

**Ninguém** mexe em `SubTabsHeader.jsx` (é compartilhado com Eventos),
`OwnershipModal.jsx`, nem nos arquivos do Aifon/Mia.

Han entrega primeiro a forma (`clubs.js` com as funções do §2 funcionando
contra o Firestore real) para a Jesse poder ligar a tela. Até lá ela
desenvolve contra o banco de prova `clubs-preview.jsx`, que já existe.
