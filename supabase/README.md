# Supabase — banco, login e fotos do Engine

Desde 17/10/2026 o Engine roda no Supabase. O Firebase saiu inteiro do app.

| | |
| --- | --- |
| Projeto | `Engine` · ref `evaankeqxykcktxvesbf` |
| Região | `sa-east-1` (São Paulo) |
| Plano | gratuito: 500 MB de banco, 1 GB de fotos, 50 mil usuários ativos/mês |
| Painel | https://supabase.com/dashboard/project/evaankeqxykcktxvesbf |

**Credenciais ficam fora do repo**, em `C:\engine-credentials\supabase.env`:
senha do banco, chave pública (publishable), `service_role` e as legadas.
A chave pública também está em `engine/.env.production`, de propósito: ela
vai para o navegador, e quem protege os dados é a RLS.

## Como as coleções viraram tabelas

Cada coleção do Firestore virou uma tabela. O que a segurança e as consultas
enxergam é coluna; o resto mora em `data jsonb`, e a camada de serviços
(`engine/src/services`) devolve às telas o mesmo objeto de antes.

| Firestore | Supabase |
| --- | --- |
| `users/{uid}` (plano) | `user_plans` — só o servidor escreve |
| `users/{uid}/cars` | `cars` |
| `users/{uid}/private/{settings,community,moderation}` | `user_private` |
| `users/{uid}/achievements` | `achievements` |
| `users/{uid}/notifications` | `notifications` |
| `users/{uid}/clubs` (espelho) | — some: é uma consulta em `club_members` |
| `usernames` | `usernames` (o @ sem arroba) |
| `publicProfiles` | `public_profiles` |
| `publicProfiles/*/followers` + `/following` | `follows` (uma linha responde as duas listas) |
| `communityGoals` | `community_goals` |
| `communityGoals/*/likes` | `post_likes` |
| `events` + `/participants` | `events` + `event_participants` |
| `clubs` + `/members` + `/requests` | `clubs` + `club_members` + `club_requests` |
| `clubTags` | — some: a sigla é `unique` em `clubs.tag` |
| `featured`, `reports`, `serviceListings` | `featured`, `reports`, `service_listings` |
| `conversations` + `/messages` | `conversations` + `messages` |
| Storage (nunca ligado) | bucket `photos`, leitura pública, cada um escreve em `users/<uid>/` |

## Segurança

O `firestore.rules` (700 linhas) virou políticas de RLS e funções no banco,
em `migrations/`. Três coisas ficaram mais fortes, não só traduzidas:

- **Contadores são do banco.** `likes_count` e `member_count` são mantidos por
  trigger a partir das linhas de curtida e de membro. O cliente não escreve
  contador nenhum, então não há o que forjar.
- **Cascata.** Apagar um post leva as curtidas; apagar evento leva a presença;
  apagar a conta leva tudo que é dela (`delete_my_account`, uma transação só).
- **Lotação de evento** é conferida dentro da escrita, com o evento travado.

Escrita que mexe em linha de outra pessoa (comentar, avaliar, criar clube,
mandar mensagem, excluir conta) passa por função `security definer`. Elas
ligam `engine.trusted` só dentro da transação, e os triggers de proteção só
liberam colunas sensíveis com essa bandeira (ou com a chave `service_role`).

**A trava é `npm run check:rls`** (em `engine/`): cria três contas
descartáveis no projeto real, tenta cada abuso que as regras antigas
barravam e apaga tudo no fim.

## Login

- Senhas do Firebase vieram junto: o hash scrypt entra no formato
  `$fbscrypt$` que o Supabase Auth confere, e no primeiro login ele troca
  sozinho por bcrypt. Ninguém precisa redefinir senha.
- Login com Google: **precisa de um cliente OAuth do Google Cloud** (ver
  `TODO.md`). Os botões sociais só aparecem para provedor ligado no painel —
  o app pergunta a `/auth/v1/settings`.
- Confirmação de e-mail desligada no cadastro, como era no Firebase.
- E-mail ("esqueci a senha", troca de e-mail) precisa de **SMTP próprio**:
  sem ele o Supabase só envia para quem é da equipe do projeto. O plano é o
  Gmail do Engine com senha de app; o bloco já está em `config.toml`,
  comentado, com o passo a passo.
- Os modelos de e-mail com a cara do Engine estão em `templates/`
  (redefinir senha, confirmar troca de e-mail, aviso de senha alterada). O
  plano grátis **recusa modelo personalizado sem SMTP próprio**, então eles
  sobem no mesmo `config push` que liga o carteiro.

## Comandos

Na raiz do repo (o CLI já está logado e vinculado ao projeto):

```sh
supabase migration new nome_da_mudanca   # cria o arquivo em migrations/
supabase db push -p "$SENHA_DO_BANCO"     # aplica no projeto
supabase config push                      # sobe o que mudou em config.toml (Auth)
```

Em `engine/`:

```sh
npm run check:rls                                   # segurança do banco
node scripts/supabase/export-firebase.mjs           # backup do Firebase (enquanto ele existir)
node scripts/supabase/import-to-supabase.mjs --reset   # recria tudo a partir do backup
node scripts/supabase/cleanup-test-users.mjs        # apaga contas @teste.dev / @engine-test.dev
```

Os e2e (`scripts/e2e-*.mjs`) rodam contra o projeto real com contas
`@teste.dev`: suba `npx vite --port 5190 --strictPort`, rode a suíte e
depois o `cleanup-test-users`.

## Cuidados do plano gratuito

- Projeto **pausa depois de 7 dias sem uso**. Com gente usando o site isso
  não acontece; num período parado, basta abrir o painel e reativar.
- A organização tem direito a 2 projetos ativos (hoje: Engine e DramaHub).
- Backup diário automático só nos planos pagos. O `export` do banco pelo CLI
  (`supabase db dump`) resolve enquanto isso.

## Backend Java

O `engine-api` continua no repo, mas ainda valida login e lê dados pelo
Firebase. O app não fala mais com ele (o caminho `apiEnabled()` saiu do
`db.js`). Antes de subir na VM da Oracle, ele precisa ser portado: validar o
JWT do Supabase e ler o Postgres.
