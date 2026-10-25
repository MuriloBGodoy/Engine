# Auditoria pré-lançamento — o "resto" do Engine

Data: **25/10/2026**. Autora: Jesse (UI/UX). Pedida pelo Murilo. Somente leitura: nenhum arquivo de código
foi alterado. Formato copiado de `docs/auditoria-servicos-2026-10-25.md`.

**Escopo:** Home/landing para visitante, cadastro/login/esqueci a senha/Google, primeiro uso, Painel,
navegação (Sidebar, TopNav, barra mobile), Configurações, páginas legais, Planos/Apoie/Anuncie, PWA,
rodapé, erro/offline, idiomas (pt/en/es) e acessibilidade básica. Serviços ficou de fora porque já tem
auditoria própria.

**Código lido:** `engine/src/App.jsx`, `main.jsx`, `index.html`, `vite.config.js`; páginas `Home`,
`Login`, `Register`, `ResetPassword`, `DashboardPage`, `Settings` (as partes de conta, app e
privacidade), `Plans`, `Support`, `Advertise` (a lógica), `Terms`, `Privacy`, `Garagem` (a parte do
vazio); componentes `AuthShell`, `SocialAuthButtons`, `RequireAuth`, `GuestLoginHint`, `MobileNav`,
`Sidebar`, `TopNav`, `TopBar`, `Footer`, `LegalPage`, `AdSlot`, `ConsentBanner`, `InstallPrompt`,
`UpdateBanner`; serviços `supabase.js` (auth), `authRedirect.js`, `observability.js`, `consent.js`,
`passwordStrength.js`, `phone.js`, `languages.js`, `db.js` (configurações e nome de usuário),
`billing.js`; `supabase/config.toml`, `netlify.toml`, `TODO.md`.

**Como verifiquei:**
- **Chaves de i18n:** juntei o i18n inteiro com o rolldown (incluindo `i18n-billing`, `-reviews` e
  `-services-extra`) e comparei cada `t("chave")` estático do `src/` com pt-BR, en-US e es-ES.
- **Telas:** subi o servidor de dev na porta 5191 e tirei prints com Playwright e o Chrome do sistema,
  em 390×844 (como celular, com toque) e em 1280×900, sempre como **visitante**. Não entrei em nenhuma
  conta, porque o dev aponta para o Supabase de produção. O servidor foi parado no fim.
- **Contraste:** calculado pela fórmula WCAG a partir dos tokens do `index.css`.

Gravidade: **Alta** quebra o primeiro uso ou a confiança · **Média** atrito que custa conversão ·
**Baixa** acabamento.

---

## 0. Os 8 achados que mais pesam

1. **Quem não fala português nunca vê o app em inglês ou espanhol.**
   - O padrão das configurações é `language: "pt-BR"` (`db.js:35`).
   - Para o visitante, o `App.jsx:129-135` lê essas configurações locais (vazias, logo o padrão) e chama
     `i18n.changeLanguage("pt-BR")`. Isso atropela a detecção do navegador.
   - O cadastro grava o mesmo padrão (`Register.jsx:90-107`).
   - O visitante não tem seletor de idioma: Configurações fica atrás de login, e o `RegionPicker` não
     troca idioma.
   - **Verificado no print:** Chrome com locale `en-US` abre a Home inteira em português
     (`home-en-m.png`).
   - Na prática, as 2.140 chaves traduzidas para en/es só aparecem para quem entra em Configurações e
     troca o idioma à mão.
2. **"Esqueci a senha", troca de e-mail e reenvio de verificação não chegam a ninguém.**
   - O SMTP próprio ainda está comentado no `supabase/config.toml:249-256` (`TODO.md:67-71`). Sem ele,
     o Supabase só entrega e-mail para a equipe do projeto.
   - Mesmo assim, a tela afirma "Enviamos o link de redefinição para seu e-mail… confira o spam"
     (`auth.resetEmailSent`, usado em `Login.jsx:53`, `ResetPassword.jsx:45` e `Settings.jsx:854`).
   - Resultado: quem esqueceu a senha perde a conta e acha que o problema é dele.
   - Junto disso, `enable_confirmations = false` (`config.toml:232`): dá para criar conta com o e-mail
     de outra pessoa.
3. **No celular, Configurações não tem porta de entrada.**
   - A barra de baixo tem Início, Painel, Garagem, Comunidade e Serviços (`MobileNav.jsx:84-90`).
   - O header tem região, sino, tema, mensagens, avatar (que leva ao **perfil**) e sair
     (`MobileNav.jsx:103-168`).
   - O único link para `/settings` em telas menores que `lg` está escondido dentro do "perfil vendedor"
     de Serviços (`Services.jsx:3275`).
   - Ficam inalcançáveis: excluir a conta (que a Privacidade promete), idioma, privacidade, plano e
     sair com segurança. Planos, Apoie e Anuncie só aparecem no rodapé.
4. **Entrar com Google pula a idade, os termos e o nome de usuário.**
   - O cadastro exige marcar "Tenho 18 anos ou mais e li os Termos…" (`Register.jsx:42-45`, `248-266`).
   - Só que o botão "Entrar com Google" fica **acima** do formulário (`Register.jsx:137`) e cria a conta
     direto, sem esse aceite. Não existe nenhuma tela de primeiro uso (procurei `onboarding`,
     `welcome`, `ageConfirmed`: nada).
   - Quem chega pelo Google aparece como `@engine.xxxxxx` (`db.js:589-590`) até descobrir sozinho onde
     se edita o perfil.
   - A Privacidade diz "O Engine é destinado a maiores de 18 anos" (`Privacy.jsx:184-193`) e esse
     caminho não confirma isso.
5. **Não há rede de segurança para erro de tela.**
   - Não existe `ErrorBoundary` nem tratamento de `vite:preloadError` em todo o `src/` (procurei).
   - Qualquer exceção ao desenhar, ou um pedaço do app que falhe ao baixar, desmonta o React inteiro e
     deixa **tela preta sem texto**.
   - A falha ao baixar acontece quando há deploy no meio da sessão de quem ainda não tem o service
     worker controlando a página, porque a Netlify não serve mais os arquivos antigos (**inferência**).
     Até a Home, a Garagem e o login dependem disso, porque as rotas são carregadas sob demanda
     (`App.jsx:35-59`).
   - O Sentry ver o erro não ajuda quem está olhando para a tela preta.
6. **O "Entrar" esquece para onde a pessoa ia.**
   - O `?next=` existe (`authRedirect.js`), mas só Serviços usa.
   - Estes pontos mandam para `/login` puro, e depois do login a pessoa cai na Home (`Login.jsx:31`):
     o convite das rotas protegidas (`RequireAuth.jsx:32`), "Entre para assinar" (`Plans.jsx:175`),
     Eventos (`EventDetails.jsx:77`, `447`), post (`PostPage.jsx:52`), avaliações
     (`ServiceReviews.jsx:489`) e os botões Entrar das três navegações (`MobileNav.jsx:115`,
     `Sidebar.jsx:219`, `TopNav.jsx:127`).
   - Exemplo: quem toca em "Começar" na Home vai para /garagem, entra e volta para a Home.
7. **A Home de visitante só fala da meta financeira, e os dois botões levam a uma parede.**
   - "Transforme sua meta financeira em realidade…" (`home.subtitle`).
   - "Começar" vai para `/garagem` e "Ver painel" para `/dashboard` (`Home.jsx:48-59`). As duas rotas
     estão atrás do `RequireAuth`.
   - Os três cards repetem Garagem, Painel e Comunidade (`Home.jsx:11-15`).
   - Não aparecem Serviços, Eventos, Clubes, o simulador de custo real nem a ficha técnica, que são o
     que o visitante pode usar **sem conta**.
   - A mesma tela aparece para quem já está logado: a Home não muda depois do login.
8. **Botão vermelho com texto branco reprova no contraste do tema padrão (escuro).**
   - Branco sobre `--engine-accent` escuro `#ff3b47` dá **3,52:1**. O mínimo para texto normal é 4,5:1.
   - Isso pega o Entrar, o Começar, o "Criar conta grátis" e o selo de contador. São textos de 13–14px,
     então nenhum se enquadra como texto grande.
   - No tema claro, o accent `#e11d2a` usado como **texto** sobre `--engine-bg` dá 3,99:1 (links
     "Termos de Uso", "Cadastre-se").
   - Em compensação, cinza sobre fundo passa folgado: 7,83 no escuro e 5,02 no claro.

---

## 1. Auditoria por área

### (a) Home / landing do visitante

| # | O que acontece | Onde | Gravidade |
|---|---|---|---|
| a1 | Promessa estreita, e os CTAs vão para a parede de login (achado 0.7). | `Home.jsx:37-59` | **Alta** |
| a2 | Não há prova do produto: nenhum print da garagem, nenhum exemplo do simulador, nenhum anúncio ou evento real. | `Home.jsx` (96 linhas) | Média |
| a3 | `index.html` tem `<title>Engine</title>` e `meta description` só em pt, sem `og:image`/`og:title`. Link do app colado no WhatsApp sai sem cartão; só `/servicos/*` tem (`netlify.toml`). | `index.html:47-66` | Média |
| a4 | `document.title` é "Engine" em toda rota. Só as páginas legais trocam, e não desfazem ao sair (`LegalPage.jsx:14-16`): voltando de /termos, a aba continua dizendo "Termos de Uso · Engine". | | Baixa |
| a5 | Rota inexistente redireciona calada para `/` (`App.jsx:517`). Um link quebrado de Instagram cai na Home sem aviso de que o endereço não existe. **Verificado** com `/xpto-nao-existe`. | | Baixa |
| a6 | Estilos inline (`style={{ background… }}`, `fontSize: clamp`) contra a regra do projeto de usar tokens e Tailwind. | `Home.jsx:23-26`, `32` | Baixa |
| a7 | No desktop, o visitante vê "Mensagens" e "Configurações" no menu (`Sidebar.jsx:66-74`) e o sino de notificações (`App.jsx:615`); os três levam ao cadeado. | | Baixa |

### (b) Cadastro, login, esqueci a senha, Google

| # | O que acontece | Onde | Gravidade |
|---|---|---|---|
| b1 | E-mail de redefinição não chega, mas a tela diz que chegou (achado 0.2). | `config.toml:249`, `Login.jsx:53` | **Alta** |
| b2 | Google sem o aceite de 18+ e dos termos, e sem nome de usuário (achado 0.4). | `Register.jsx:137` | **Alta** |
| b3 | **8 campos + checkbox** no cadastro: nome, usuário, **telefone obrigatório** (`Register.jsx:46-49`), país, estado, e-mail, senha, confirmar. O telefone não é usado em nenhum fluxo de conta e mesmo assim barra o cadastro. A máscara `(00) 00000-0000` é brasileira para qualquer país (`169`). | `Register.jsx:139-266` | **Alta** |
| b4 | O placeholder do e-mail é `email@empresa.com` / `seuemail@empresa.com`: tom de B2B para dono de carro. | i18n `auth.registerEmailPlaceholder` | Baixa |
| b5 | Força de senha inconsistente: o cadastro exige nível 2 (`Register.jsx:50`), mas redefinir aceita 6 caracteres quaisquer (`ResetPassword.jsx:102`) e Configurações também (`Settings.jsx:312`). | | Média |
| b6 | Link de redefinição vencido abre o formulário "Recuperar acesso" sem dizer que o link expirou. O hash `error_code=otp_expired` é ignorado (`ResetPassword.jsx:26-28`). **Verificado no print** `reset-expired-m.png`. | | Média |
| b7 | Erro de login é sempre "Confira suas credenciais" (`Login.jsx:33`), inclusive sem internet ou com `too-many-requests`. Os códigos existem em `supabase.js:93-113` e a tela não usa. | | Média |
| b8 | Termos e Privacidade abrem em **nova aba** a partir do cadastro (`Register.jsx:257`, `261`), e o botão Voltar da página legal é `navigate(-1)` (`LegalPage.jsx:24`). Na aba nova não há histórico, então o botão não faz nada. Também tem `aria-label="Voltar"` fixo em pt. | | Média |
| b9 | O "Esqueci minha senha" do login dispara o envio ali mesmo e exige o e-mail já digitado (`Login.jsx:39-45`). A página `/reset-password` existe mas só é alcançável pelo link do e-mail; nenhum link leva até ela. | | Baixa |
| b10 | O GuestLoginHint lê `localStorage` sem `try` (`GuestLoginHint.jsx:89`). O `usePwaInstall` faz o mesmo **no carregamento do módulo** (`usePwaInstall.js:21-37`, chamado em `createInitialState`), que o `App.jsx` importa direto. Com o armazenamento bloqueado (Chrome em "bloquear todos os cookies"), isso pode derrubar o app inteiro antes de desenhar. **Inferência, não testado.** | | Baixa |

### (c) Primeiro uso

| # | O que acontece | Onde | Gravidade |
|---|---|---|---|
| c1 | Não existe onboarding. Conta nova (por e-mail) cai na Garagem (`Register.jsx:113`). | | **Alta** |
| c2 | O vazio da Garagem diz só "A garagem está vazia." mais o e-mail da conta (`Garagem.jsx:115-140`). Não tem botão dentro do vazio (o "Adicionar" fica no cabeçalho, `Garagem.jsx:55-59`), não explica a diferença entre **meta** e **carro que já tenho**, e não diz o que se ganha (simulador, ficha). O comentário do `Register.jsx:110-112` supõe que esse vazio "convida a cadastrar"; não convida. | | **Alta** |
| c3 | Quem entra pelo Google cai em `/` (`SocialAuthButtons.jsx:64`), não na Garagem como quem se cadastra por e-mail. São dois primeiros usos diferentes para a mesma conta nova. | | Média |

### (d) Painel

| # | O que acontece | Onde | Gravidade |
|---|---|---|---|
| d1 | O vazio ("dashboard.empty") é só texto, sem link para a Garagem. | `DashboardPage.jsx:146-151` | Média |
| d2 | Linhas da tabela clicáveis com `<tr onClick>`, sem foco nem tecla: no desktop, quem usa teclado não abre o simulador. | `DashboardPage.jsx:309-314` | Média |
| d3 | O gráfico anima 2 s em loop linear com `realtimeSort` e ignora `prefers-reduced-motion`. As cores estão cravadas no código (`#f4f6fa`, `#22c55e`, `#ff3b47`). | `78-80`, `129`, `135-138` | Baixa |
| d4 | `key={item.name}`: duas metas com o mesmo nome (dois "Honda Civic") geram chave repetida e a lista do celular se embaralha. | `156` | Baixa |
| d5 | Moeda fixa em BRL (`57`): coerente com o simulador só-Brasil, mas vale lembrar que o Engine se apresenta em 12 países. | | Baixa |

### (e) Navegação

| # | O que acontece | Onde | Gravidade |
|---|---|---|---|
| e1 | Configurações inalcançável no celular (achado 0.3). | `MobileNav.jsx:84-168` | **Alta** |
| e2 | "Sair" com um toque, sem confirmação, colado no avatar no header do celular (`MobileNav.jsx:159-167`). No TopNav também (`TopNav.jsx:172`). | | Média |
| e3 | Sidebar recolhida esconde o botão de sair (`Sidebar.jsx:259`). O estado recolhido não é salvo (`App.jsx:93`). O botão sair não tem `aria-label` (`262-267`), assim como o sair do TopNav. | | Baixa |
| e4 | A barra de baixo não tem `aria-label` no `<nav>` (`MobileNav.jsx:173`). A Sidebar não marca `aria-current` (`Sidebar.jsx:116`); a barra mobile marca. | | Baixa |
| e5 | No celular, o seletor de região do visitante é um ícone + ponto + seta (`home-m.png`). Sem ler "Brasil", ninguém entende o que é. | `RegionPicker compact` | Baixa |

### (f) Configurações

| # | O que acontece | Onde | Gravidade |
|---|---|---|---|
| f1 | Trocar e-mail, "esqueci a senha" e reenviar verificação dependem do SMTP (achado 0.2): os três dizem que enviaram. | `Settings.jsx:392-395`, `845`, `854` | **Alta** |
| f2 | O eyebrow "Engine Control" está em inglês fixo, fora do i18n. | `Settings.jsx:877` | Baixa |
| f3 | Oferece **15 idiomas** (`languages.js`), mas de/fr/it/ja/zh/ko/hi/ar só têm traduzidos `common`, `nav` e o título de Serviços (`i18n.js:6213-6252`); o resto cai no inglês. O árabe não ganha `dir="rtl"`. O `<html lang>` fica `pt-BR` para sempre (`index.html:8`; nenhum código atualiza), então o leitor de tela lê inglês com voz portuguesa. | | Média |

### (g) Páginas legais

| # | O que acontece | Onde | Gravidade |
|---|---|---|---|
| g1 | A Privacidade promete "**exportar os dados**" em Configurações (`Privacy.jsx:172-175`). Não existe exportação no app; procurei `export`/`backup`/`exportar` em `src/`. É o direito de portabilidade da LGPD art. 18, V. Também diz que editar o perfil fica em Configurações, quando fica no perfil. | | **Alta** |
| g2 | A Privacidade promete "avisamos no app antes de a mudança valer" (`Privacy.jsx:195-200`). Não existe mecanismo de aviso de versão da política. | | Média |
| g3 | O PostHog liga sem pergunta (`observability.js:56-75`); o aviso de cookies só existe para AdSense (`consent.js:17-22`). A política descreve o PostHog (`Privacy.jsx:116`) e diz que o armazenamento "não depende de consentimento" (`144-147`). Se cookie/armazenamento de **análise** pode ficar sem consentimento é enquadramento jurídico (**inferência; perguntar ao advogado**). | | Média |
| g4 | Termos e Privacidade só em pt-BR, com textos fixos no JSX ("Atualizado em", "Voltar"). Para os 12 países, é limitação a declarar. | `LegalPage.jsx:24-35` | Média |
| g5 | O contato é o Gmail pessoal `muxdtuber@gmail.com` (Termos, Privacidade, `Footer.jsx:34`, `billing.js:19`). O CNPJ "antes da primeira cobrança" está pendente (`Terms.jsx:196-200`). Já está no `TODO.md:33-48`. | | Média |

### (h) Planos / Apoie / Anuncie

| # | O que acontece | Onde | Gravidade |
|---|---|---|---|
| h1 | Os textos são honestos ("Hoje o Premium tira os anúncios. Os outros itens… Em breve"). Só que **produção não tem anúncio**: o `AdSlot` não desenha nada sem AdSense (`AdSlot.jsx:109`), que não está configurado (`TODO.md`). No dia em que a chave do Stripe entrar, o Premium cobra R$ 79,90/ano para tirar anúncios que não existem. **Não abrir a venda do Premium antes do AdSense**, ou trocar o texto. | `Plans.jsx:34-44` | **Alta** (quando o Stripe ligar) |
| h2 | O "O Engine hoje" de /anuncie mostra **7 perfis públicos · 2 serviços publicados** (contados ao vivo em 25/10, `anuncie-top-m`). Para um anunciante, é prova contra. O código esconde só o que dá zero (`Advertise.jsx:62-66`). | | Média |
| h3 | A proposta de patrocínio vai para a tabela `sponsor_leads` e ninguém é avisado: não há trigger nem e-mail (`migrations/20261024130000_sponsor_leads.sql`; nenhuma function lê). A tela diz "Respondemos por e-mail". | `billing.js:62-76` | Média |
| h4 | "Entre para assinar" sem `?next=` (achado 0.6): depois do login a pessoa não volta para /planos. | `Plans.jsx:175` | Média |

### (i) PWA, offline e erro

| # | O que acontece | Onde | Gravidade |
|---|---|---|---|
| i1 | Sem `ErrorBoundary` (achado 0.5). | `main.jsx` | **Alta** |
| i2 | Sem aviso de offline (nenhum `navigator.onLine` nem evento `offline` em `src/`). O memo do Supabase registra que ele falha **na hora** sem rede; cada tela mostra o seu próprio erro, ou nenhum. | | Média |
| i3 | `isIOS` não pega iPad com iPadOS 13+, que se apresenta como Mac. No navegador interno do Instagram (de onde vem o prestador), o convite ensina "toque em Compartilhar → Adicionar à Tela de Início", e esse caminho não existe lá (**inferência**). | `usePwaInstall.js:18-19` | Baixa |
| i4 | `ImageCropper` mostra a chave crua `imageCropper.error` ao falhar: a chave não existe em nenhum idioma, e `t()` devolve a string da chave, que é "verdadeira", então o texto de reserva nunca entra. | `ImageCropper.jsx:93`, `125` | Baixa |
| i5 | `common.share` não existe; o `defaultValue` "Compartilhar" aparece em pt para en/es. | `ClubHeader.jsx:165` | Baixa |

### (j) Rodapé

Está correto desde 25/09: links sem destino não aparecem (`Footer.jsx:22-28`). Sobram dois pontos:
"Fale conosco" é `mailto:` do Gmail pessoal com `target="_blank"` (`Footer.jsx:83`, que em celular pode
abrir uma aba vazia, **inferência**), e em Ajuda só resta esse item.

### (k) Idiomas — resultado da checagem automática

- pt-BR, en-US e es-ES têm **2.140 chaves cada**, sem buracos entre eles.
- **3** chaves usadas no código não existem em nenhum idioma (i4, i5).
- Textos iguais ao pt-BR: 0 em en (acima de 25 caracteres) e 4 em es. Os 4 são falsos positivos, porque
  a frase coincide nos dois idiomas.
- O problema real de idioma não está nas traduções, e sim no achado 0.1 (o app força pt-BR) e no f3.

---

## 2. Textos que prometem o que não existe / links que levam a lugar nenhum

| Texto / link | Onde | O que é verdade hoje |
|---|---|---|
| "Enviamos o link de redefinição…" | `auth.resetEmailSent` | Sem SMTP, não sai e-mail (0.2). |
| "Enviamos um link de confirmação para {email}" | `Settings.jsx:395` | Idem. |
| "exportar os dados" em Configurações | `Privacy.jsx:173` | Não existe (g1). |
| "avisamos no app antes de a mudança valer" | `Privacy.jsx:197` | Não há mecanismo (g2). |
| Premium: "Sem anúncios" | `Plans.jsx:36` | Produção não tem anúncio (h1). |
| "Respondemos por e-mail" (Anuncie) | `billing.advertise.form.subtitle` | Ninguém é avisado do lead (h3). |
| "Começar" / "Ver painel" na Home | `Home.jsx:48-59` | Para visitante, leva a um cadeado (0.7). |
| Voltar das páginas legais | `LegalPage.jsx:24` | Sem efeito quando aberto em aba nova (b8). |
| Configurações no celular | — | Sem link (0.3). |
| Idioma do navegador | `App.jsx:133` | Ignorado (0.1). |

**Telas vazias sem saída:** Garagem vazia (c2), Painel vazio (d1), rota inexistente (a5) e tela preta
em erro (0.5).

---

## 3. Recomendação — top 10 por impacto/esforço

Esforço: **P** ≤ 1 dia · **M** 2–4 dias · **G** semana+.

### Antes de lançar

| # | Mudança | Esforço | Por quê |
|---|---|---|---|
| 1 | **Ligar o SMTP** (bloco pronto em `config.toml`; Gmail do Engine criado em 25/10) e subir `email_sent` para 30. Enquanto não ligar, trocar o texto de "Enviamos" por "Se não chegar, escreva para…". | P (é do Murilo) | 0.2, b1, f1. Sem isso, quem esquece a senha perde a conta. |
| 2 | **Respeitar o idioma do navegador:** não gravar `language` no padrão (deixar vazio = "seguir o navegador"), só chamar `changeLanguage` quando houver escolha salva, e pôr seletor de idioma no rodapé para visitante. Atualizar `document.documentElement.lang` a cada troca. | P | 0.1, f3. Hoje en/es é trabalho feito que ninguém vê. |
| 3 | **ErrorBoundary global** com "Algo deu errado — Recarregar" + `window.addEventListener("vite:preloadError", () => location.reload())`. | P | 0.5, i1. Troca tela preta por uma saída. |
| 4 | **Configurações no celular:** engrenagem no header (no lugar do "sair", que vai para dentro de Configurações) e Planos dentro de Configurações › Conta. | P | 0.3, e1, e2. Também tira o sair acidental. |
| 5 | **Primeiro uso mínimo, comum ao e-mail e ao Google:** uma tela "Antes de começar" que só aparece se faltar o aceite de 18+ ou o nome de usuário (grava `acceptedTermsAt` pelo servidor); depois, Garagem com vazio útil ("Adicione o carro que você **tem** / o carro que você **quer**", dois botões, uma linha do que cada um destrava). | M | 0.4, c1–c3. É o requisito de idade da própria política e a primeira impressão. |
| 6 | **`?next=` em todo "Entrar"**: `RequireAuth`, Plans, Eventos, Post, Avaliações e as três navegações. O destino do Google passa a ser a Garagem quando não há `next`. | P | 0.6, h4, c3. |
| 7 | **Cadastro mais curto:** telefone opcional (ou fora do cadastro), país/estado preenchidos pela região já detectada, placeholder sem "empresa", mesma regra de senha nas três telas, "link expirado" no reset, erro de login por código. | P | b3–b7. |
| 8 | **Corrigir a Privacidade:** tirar "exportar" (ou fazer exportar em JSON, M), tirar "avisamos no app" ou criar o aviso; perguntar ao advogado sobre o PostHog sem consentimento. **Não abrir a venda do Premium antes de existir anúncio**, ou reescrever a oferta. | P | g1–g3, h1. É o que um fiscal ou um usuário irritado lê primeiro. |

### Logo depois (primeiras semanas)

| # | Mudança | Esforço | Por quê |
|---|---|---|---|
| 9 | **Home de visitante que vende o que é aberto:** buscar serviço na cidade, próximos eventos, "quanto custa ter um X" (simulador) e só então "crie sua conta para guardar". Home de logado vira atalho para a garagem. OG tags no `index.html`. Proposta para prototipar antes (o fluxo da Jesse: referências → protótipo → aprovação). | M | 0.7, a1–a3. |
| 10 | **Contraste do accent:** escurecer o `--engine-accent` do tema escuro para botões com texto branco (ou texto escuro no botão) até ≥ 4,5:1, e o accent do claro como texto até ≥ 4,5:1. Afeta todos os botões primários. | P | 0.8. |

**Depois (fora do lançamento):** aviso global de offline (i2); 404 de verdade (a5); `document.title`
por página (a4); `<tr>` com teclado e `prefers-reduced-motion` no Painel (d2, d3); RTL e tradução real
dos 8 idiomas extras, ou tirá-los da lista até existirem (f3); termos em en/es (g4); aviso de lead de
patrocínio por e-mail (h3); esconder os números de /anuncie até haver escala (h2); e-mail
`contato@`/domínio (g5, já no `TODO.md`).

---

## 4. Verificado × inferido × beco sem saída

**Verificado no código:** todos os itens com `arquivo:linha`, incluindo:
- a ausência de ErrorBoundary, offline, onboarding e exportação (busca no `src/` inteiro);
- os links de Configurações (busca por `/settings`);
- o SMTP comentado (`config.toml`).

**Verificado na tela (prints em 390×844 e 1280×900, visitante, tema escuro):**
- locale en-US abre a Home em pt-BR;
- a barra mobile sem Configurações;
- os cadastros com 8 campos;
- o reset com link vencido sem aviso;
- a rota inexistente indo para `/`;
- /anuncie com 7 perfis e 2 serviços.

Prints em
`C:\Users\Windows\AppData\Local\Temp\claude\C--Users-Windows-Downloads-engine-main\91126bd1-823d-4c96-95a2-5aed78fd2f38\scratchpad\shots\`
(não ficam no repo).

**Verificado por cálculo:** contraste (fórmula WCAG sobre os tokens do `index.css`). Chaves de i18n
(bundle do rolldown + varredura dos `t("…")`).

**Não verificado (sem login, para não escrever no Supabase de produção):** telas logadas
(Configurações, Painel com dados, header mobile logado). Os achados delas vêm só da leitura do código.
Também não testei tema claro na tela.

**Inferido (marcado no texto):**
- tela preta por chunk velho depois de deploy;
- quebra com armazenamento bloqueado;
- convite de instalação dentro do navegador do Instagram;
- `mailto` com `_blank` no celular;
- o enquadramento LGPD do PostHog.

**Fora de escopo:** Serviços (auditoria própria do Han), Comunidade, Clubes, Eventos, simulador, ficha.
