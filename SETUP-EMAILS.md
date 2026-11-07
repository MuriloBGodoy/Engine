# E-mail do Engine — como montar

Escrito em 07/11/2026, quando a zona DNS do `enginegarage.com.br` ainda estava
**vazia** (domínio registrado, nameservers do registro.br, nenhum registro A,
MX ou TXT). Então aqui não é só "configurar e-mail": é montar a zona inteira,
e o site entra junto.

O **porquê** de cada escolha está no fim. Os passos são do Murilo — só ele tem
as senhas do registro.br e das contas.

---

## O desenho, em uma frase

**Receber** é a Cloudflare (grátis, ilimitado, joga tudo no Gmail do Engine).
**Enviar** são dois: o app manda pelo Resend, e você responde pelo Gmail como
`contato@`, usando o SMTP do Resend. O Gmail `enginegarage.app@gmail.com`
continua sendo a caixa única — você não ganha mais um lugar para abrir todo dia.

```
  quem escreve  ──►  MX da Cloudflare  ──►  enginegarage.app@gmail.com
  contato@ suporte@ privacidade@ anuncie@ redes@ (+ qualquer coisa@)

  você responde ──►  Gmail "enviar como"  ──►  SMTP do Resend  ──►  sai como contato@
  o app avisa   ──►  Supabase  ──►  SMTP do Resend  ──►  sai como nao-responda@
```

---

## Os endereços

| Endereço | Para quê | Onde aparece |
|---|---|---|
| `contato@` | contato geral, comercial, imprensa | rodapé, Termos, /anuncie, chave Pix |
| `suporte@` | cobrança, conta, arrependimento | Configurações › Sobre |
| `privacidade@` | titular de dados (LGPD) | Política de privacidade |
| `anuncie@` | pacotes de anúncio e patrocínio | /anuncie |
| `redes@` | **identidade das contas de rede social** | nenhum lugar público |
| `nao-responda@` | remetente do app (confirmação, senha) | e-mails automáticos |
| `dmarc@` | relatório diário de quem tentou falsificar o domínio | registro DMARC |
| qualquer outra | catch-all, para nada digitado errado se perder | — |

Todos caem no mesmo Gmail. Separados na origem porque depois dá para filtrar
por destinatário sem pedir a ninguém que reescreva o assunto.

**`redes@` é a resposta ao "criar um novo igual o Gmail, só que @enginegarage".**
Ele se comporta como conta de verdade: recebe o código de verificação do
Instagram e você responde como ele. A diferença é que a caixa dele é o Gmail,
e não um segundo aplicativo. Ao cadastrar cada rede, ponha o Gmail como
**e-mail de recuperação** dentro da própria plataforma — assim, se o
encaminhamento ficar fora do ar numa hora ruim, você ainda entra.

---

## Passo 1 — Levar o DNS para a Cloudflare

Hoje o DNS é do registro.br, cujo editor não aceita `@` e vai receber uns oito
registros. Antes de colar qualquer coisa, mude a casa.

1. Crie a conta na Cloudflare **com o `enginegarage.app@gmail.com`**, ligue a
   verificação em duas etapas, e adicione o domínio `enginegarage.com.br` no
   plano Free. Ela vai mostrar dois nameservers (`algo.ns.cloudflare.com`).
2. **No registro.br, DESLIGUE o DNSSEC antes de trocar os nameservers.** O
   registro.br liga DNSSEC sozinho; se os nameservers mudarem com ele ligado,
   a assinatura deixa de bater e o domínio **some da internet** por horas, para
   todo mundo. Desligue, espere alguns minutos, e só então troque.
3. No registro.br, em DNS, escolha "usar outros servidores DNS" e ponha os dois
   da Cloudflare.
4. Espere a Cloudflare dizer "Active" (costuma levar de minutos a algumas horas).

## Passo 2 — O site, antes do e-mail

Ainda na Cloudflare, em DNS › Records:

| Tipo | Nome | Conteúdo | Proxy |
|---|---|---|---|
| A | `enginegarage.com.br` | `75.2.60.5` | **DNS only** (nuvem cinza) |
| CNAME | `www` | `enginegarage.netlify.app` | **DNS only** (nuvem cinza) |

A nuvem **cinza** importa: com o proxy laranja ligado, a Netlify não consegue
emitir o certificado e o site abre com aviso de segurança. Depois, na Netlify,
em Domain management, adicione `enginegarage.com.br` e espere o certificado.

## Passo 3 — Receber (Cloudflare Email Routing)

1. Na Cloudflare, aba **Email** › Email Routing › *Get started*.
2. Ela pede o destino: `enginegarage.app@gmail.com`. Vai chegar um e-mail de
   confirmação nesse Gmail — confirme.
3. Clique no botão que **adiciona os registros MX e o SPF automaticamente**.
   Não digite MX na mão e **não crie um segundo registro SPF**: só pode existir
   um por domínio, e dois fazem os dois pararem de valer.
4. Crie os endereços da tabela lá em cima, todos apontando para o mesmo Gmail.
5. Ligue o **catch-all** para o mesmo destino.
6. Teste: mande um e-mail de outro lugar para `contato@enginegarage.com.br` e
   veja chegar no Gmail. **Enquanto este teste não passar, não siga.**

## Passo 4 — Enviar pelo app (Resend)

1. Conta no Resend com o `enginegarage.app@gmail.com`, 2FA ligada.
2. Domains › Add Domain › `enginegarage.com.br`, região mais próxima.
3. Ele mostra os registros para colar na Cloudflare. **Olhe o nome de cada um
   antes de colar:**
   - se o MX que ele pedir for num subdomínio (`send.enginegarage.com.br`),
     pode colar tudo — esse MX não disputa com o da Cloudflare, porque MX só
     vale para o nome exato em que está;
   - **se ele pedir um MX na raiz** (`enginegarage.com.br`), PARE. Esse
     registro derruba o recebimento do passo 3. Volte, apague o domínio no
     Resend e cadastre `avisos.enginegarage.com.br` no lugar; o remetente passa
     a ser `nao-responda@avisos.enginegarage.com.br`, que é feio e funciona.
   - o DKIM (`resend._domainkey`) e o SPF do subdomínio podem colar sempre.
4. Espere ficar "Verified".
5. API Keys › crie uma com permissão de envio e **guarde**: ela aparece uma vez.

## Passo 5 — Ligar o Resend no Supabase

No `supabase/config.toml` (eu faço, quando você me passar que a chave existe):

```toml
[auth.email.smtp]
enabled = true
host = "smtp.resend.com"
port = 587
user = "resend"
pass = "env(ENGINE_SMTP_PASS)"
admin_email = "nao-responda@enginegarage.com.br"
sender_name = "Engine"
```

E subir `email_sent` no `[auth.rate_limit]`, que hoje está em **2 por hora** —
é o teto do remetente de teste do Supabase, e não sobrevive a um dia de
lançamento. Com o Resend o teto que vale é o dele: **100 por dia, 3 mil por
mês** no plano grátis. Dá para começar; quando passar disso, é plano pago.

A chave vai como variável de ambiente `ENGINE_SMTP_PASS`, nunca no arquivo.

## Passo 6 — Responder como `contato@` pelo Gmail

No Gmail do Engine: Configurações › Contas › *Enviar e-mail como* › Adicionar.

- Nome: `Engine`
- E-mail: `contato@enginegarage.com.br`
- Servidor SMTP: `smtp.resend.com`, porta `587`, TLS
- Usuário: `resend` · Senha: a chave do Resend

O Gmail manda um código para `contato@`, que chega pelo passo 3. Repita para
`suporte@`, `anuncie@` e `redes@`.

## Passo 7 — DMARC (a parte de segurança)

Sem isto, qualquer um manda e-mail **dizendo ser** `contato@enginegarage.com.br`,
e é assim que golpe com nome de marca começa. Na Cloudflare, um TXT:

| Tipo | Nome | Conteúdo |
|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@enginegarage.com.br; fo=1; adkim=r; aspf=r` |

`p=none` de propósito: por duas semanas ele só **observa** e manda relatório,
sem derrubar nada. Isso evita o acidente clássico — apertar `p=reject` antes de
conferir e passar a jogar no lixo os próprios e-mails do app. Depois de duas
semanas de relatório limpo, troque para `p=quarantine`, e um mês depois para
`p=reject`.

## Passo 8 — O que vira no app

Quando o passo 3 passar no teste, me avise. São duas linhas:

- `engine/src/services/contact.js`: `DOMINIO_NO_AR = false` → `true`. Isso
  troca os **seis** lugares públicos de uma vez (rodapé, Termos, Privacidade,
  Configurações, /anuncie e o `billing.js`), que até hoje tinham o Gmail
  pessoal do Murilo escrito à mão em cada um.
- `supabase/config.toml`: `site_url` para `https://enginegarage.com.br` e
  `supabase config push`.

E a chave Pix de /apoie passa a ser `contato@enginegarage.com.br`
(`VITE_SUPPORT_PIX_KEY` na Netlify).

---

## Por que assim, e não de outro jeito

**Por que a Cloudflare e não o registro.br.** São uns oito registros para colar
(site, MX, SPF, DKIM, DMARC), o editor do registro.br é ruim e não aceita `@`,
e o Email Routing da Cloudflare é grátis com endereços ilimitados. O preço é a
troca de nameserver, que se faz uma vez.

**Por que não Zoho nem Google Workspace.** Zoho grátis dá caixa de verdade,
mas é mais um aplicativo para abrir todo dia e não tem IMAP no plano grátis.
Workspace é o melhor de usar e custa ~R$35 por usuário por mês — dinheiro
recorrente antes do primeiro assinante. Encaminhar para o Gmail que já existe
entrega o mesmo resultado prático com uma caixa só.

**Por que receber e enviar são serviços diferentes.** Encaminhador não manda
e-mail, e serviço de envio não guarda caixa. Quem tenta fazer os dois com um
só acaba com o MX de um sobrescrevendo o do outro — que é exatamente a
armadilha do passo 4.

**Por que o Gmail continua sendo o dono das contas.** Stripe, Supabase,
Netlify, Cloudflare, Resend e as redes sociais ficam no
`enginegarage.app@gmail.com`, que tem 2FA e recuperação de verdade. Endereço
do domínio é para o público falar com o Engine; conta é identidade, e
identidade não deve depender de um encaminhador grátis continuar de pé.

---

## Ordem, de novo, bem curta

1. DNSSEC **off** no registro.br → nameservers da Cloudflare.
2. A + CNAME (nuvem cinza) → domínio na Netlify.
3. Email Routing → endereços → catch-all → **testar o recebimento**.
4. Resend → conferir se o MX é de subdomínio → verificar → chave.
5. SMTP no Supabase + `site_url`.
6. "Enviar como" no Gmail.
7. DMARC em `p=none`.
8. Me avisar, para virar o `DOMINIO_NO_AR`.
