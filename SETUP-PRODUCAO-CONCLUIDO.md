# Engine Garage — Relatório Completo de Infraestrutura e Produção

> **Data de Conclusão:** 09 de novembro de 2026  
> **Domínio Oficial:** [https://enginegarage.com.br](https://enginegarage.com.br)  
> **Status Geral:** 100% Ativo, Seguro e em Produção  
> **Diretório de Credenciais:** `C:\engine-credentials\` (nunca versionado no Git)

---

## 1. Visão Geral da Arquitetura

O Engine Garage opera em uma arquitetura moderna, escalável e de alta disponibilidade, distribuída entre os melhores provedores da indústria:

```
[ Usuário / Navegador ]
          │
          ▼
   [ Cloudflare DNS ] (DNS blindado, SSL/TLS, Email Routing)
          │
    ┌─────┴───────────────────────────────────┐
    ▼                                         ▼
[ Netlify CDN & Edge ]             [ Cloudflare Email Routing ]
  • Frontend React (Vite)            • contato@, suporte@, apoie@...
  • Netlify Functions (Node/ESM)     • Catch-all (*@enginegarage.com.br)
  • Redirecionamento 301 forçado               │
          │                                   ▼
    ┌─────┴─────────────────────┐      [ Gmail Oficial ]
    ▼                           ▼      enginegarage.app@gmail.com
[ Supabase ]             [ Stripe Live ]
  • Banco de Dados         • Assinaturas Pro / Anual
  • Autenticação & RLS     • Passes avulsos
  • Resend SMTP            • Webhooks & Portal do Cliente
```

---

## 2. Domínio Próprio & DNS (`enginegarage.com.br`)

### Registro & Nameservers
- **Registrador:** Registro.br (domínio registrado até 03/11/2027).
- **Servidores de Nome (Nameservers):** Migrados com sucesso para a Cloudflare:
  - `leif.ns.cloudflare.com`
  - `teresa.ns.cloudflare.com`
- **DNSSEC:** Transição de chave concluída sem falhas de resolução.

### Registros DNS Configurados na Cloudflare (Zona `77c141a1e76aad01ae34b191acf72e2c`)
- **`A` (Raiz):** `75.2.60.5` apontado para o Netlify (Proxy: *DNS Only / Nuvem Cinza*).
- **`CNAME www`:** `enginegarage.netlify.app` (Proxy: *DNS Only / Nuvem Cinza*).
- **`TXT _dmarc`:** `v=DMARC1; p=none; sp=none; rua=mailto:dmarc@enginegarage.com.br!10m; aspf=r; adkim=r`.
- **E-mail / Resend:** Subdomínios `rsend` e `send` com CNAMEs apontando para a infraestrutura Forge MTA da AWS São Paulo (`sa-east-1`), além da chave DKIM `resend._domainkey`.
- **Email Routing (MX & SPF):** Registros MX automáticos da Cloudflare (`route1.mx.cloudflare.net`, `route2`, `route3`) e SPF `v=spf1 include:_spf.mx.cloudflare.net ~all`.

---

## 3. Netlify & Hospedagem

- **Site:** `enginegarage`
- **Domínio Primário:** `https://enginegarage.com.br`
- **Domínio Redirecionado:** `https://www.enginegarage.com.br`
- **Certificado SSL:** Let's Encrypt ativo, TLS 1.3, com renovação automática pelo Netlify.
- **Redirecionamento Forçado 301 (`301!`):**
  - Configurado em `engine/public/_redirects` e `netlify.toml`.
  - Qualquer acesso feito pelo endereço legado `enginegarage.netlify.app` é redirecionado instantaneamente com status HTTP 301 para `https://enginegarage.com.br`, preservando parâmetros e rotas internas (`:splat`) e garantindo autoridade máxima de SEO.

---

## 4. E-mails Oficiais & Disparos Transacionais

### Recebimento (Cloudflare Email Routing)
Todas as mensagens enviadas para os endereços do domínio são encaminhadas de forma transparente para a caixa central **`enginegarage.app@gmail.com`**:
1. `contato@enginegarage.com.br` — Contato geral e parcerias.
2. `suporte@enginegarage.com.br` — Suporte a usuários e dúvidas técnicas.
3. `privacidade@enginegarage.com.br` — Atendimento LGPD e privacidade.
4. `anuncie@enginegarage.com.br` — Canal comercial e patrocinadores.
5. `apoie@enginegarage.com.br` — Chave Pix e avisos de contribuições.
6. `redes@enginegarage.com.br` — Redes sociais e imprensa.
7. `dmarc@enginegarage.com.br` — Relatórios técnicos de entregabilidade DMARC.
8. **Catch-All Ativo:** Qualquer outro e-mail `*@enginegarage.com.br` também cai na caixa postal do Engine.

### Envio Transacional do Sistema (Resend SMTP)
- **Região:** South America (São Paulo — `sa-east-1`) para mínima latência.
- **Remetente Oficial:** `no-reply@enginegarage.com.br` (nome de exibição: `Engine`).
- **Status do Domínio:** **Verified** (SPF, DKIM e DMARC 100% alinhados).
- **Credenciais:** Chave `engine-smtp` salva em `C:\engine-credentials\resend.env`.

### Envio Manual pelo Gmail
- Configurado "Enviar e-mail como" em `enginegarage.app@gmail.com` para o endereço **`Engine <contato@enginegarage.com.br>`** via SMTP autenticado da Resend (`smtp.resend.com:587`, TLS).

---

## 5. Supabase (Backend & Banco de Dados)

- **Instância:** `evaankeqxykcktxvesbf`
- **Site URL:** Atualizado para `https://enginegarage.com.br`.
- **Redirect URLs:** Liberados `https://enginegarage.com.br/**` e `https://www.enginegarage.com.br/**`.
- **Autenticação:**
  - Taxa de envio ajustada para 30/hora.
  - Remetente configurado para `no-reply@enginegarage.com.br`.
  - SMTP externo conectado diretamente à Resend (`smtp.resend.com`).
- **Config Push:** `supabase config push --yes` executado e sincronizado com sucesso.

---

## 6. Google Cloud Platform (OAuth / Login com Google)

- **Projeto:** `engine-512201`
- **Domínio Autorizado:** `enginegarage.com.br` cadastrado na tela de consentimento OAuth.
- **Branding:** URLs oficiais de Início (`https://enginegarage.com.br`), Termos (`/termos`) e Privacidade (`/privacidade`) configuradas.
- **Cliente OAuth ("Engine Supabase"):** Origens JavaScript autorizadas atualizadas para:
  - `https://enginegarage.com.br`
  - `https://www.enginegarage.com.br`

---

## 7. Stripe (Pagamentos, Assinaturas e Passes)

### Conta & Modo de Operação
- **Modo:** **Live / Produção** ativo.
- **Conta:** `Engine Garage` (`acct_1UUIbqLHr7sX6mX7`) vinculada a `enginegarage.app@gmail.com`.
- **Antifraude:** Radar Lite ativo (proteção por machine learning sem sobretaxa por transação).

### Chaves de API
- Salvas em `C:\engine-credentials\stripe.env` e cadastradas no Netlify:
  - `STRIPE_SECRET_KEY`: Chave secreta de produção (`sk_live_...`).
  - `VITE_STRIPE_PUBLISHABLE_KEY`: Chave publicável de produção (`pk_live_...`).

### Webhook de Produção
- **Endpoint:** `https://enginegarage.com.br/.netlify/functions/subscription-webhook-stripe`
- **ID de Destino:** `we_1UZyqHLHr7sX6mX72O0hrxx7`
- **Versão da API:** `2026-09-30.endive` (Payload Instantâneo)
- **5 Eventos Monitorados:**
  1. `checkout.session.completed`
  2. `checkout.session.async_payment_succeeded`
  3. `customer.subscription.created`
  4. `customer.subscription.updated`
  5. `customer.subscription.deleted`
- **Segredo de Assinatura:** `STRIPE_WEBHOOK_SECRET` configurado no Netlify (`whsec_...`).

### Portal do Cliente (Customer Portal)
- Habilitado em `/settings/billing/portal` para permitir que o usuário:
  - Cancele sua assinatura no término do ciclo de cobrança;
  - Atualize dados do cartão de crédito;
  - Consulte e baixe faturas e recibos em PDF.

### Comunicações Automáticas de Cobrança
- Ativado aviso prévio por e-mail **7 dias antes** do término do período de testes gratuito (trial).
- Ativado aviso prévio por e-mail sobre futuras renovações de assinatura.

---

## 8. Chave Pix Oficial de Apoio (`apoie@enginegarage.com.br`)

- **Chave Pix:** `apoie@enginegarage.com.br` registrada no Banco Central através do app bancário do titular.
- **Integração no App:** Variável de ambiente `VITE_SUPPORT_PIX_KEY=apoie@enginegarage.com.br` cadastrada no Netlify.
- **Página Pública:** [https://enginegarage.com.br/apoie](https://enginegarage.com.br/apoie) renderiza automaticamente o cartão com a chave Pix, botão de cópia de um clique e orientações seguras.

---

## 9. Privacidade do Perfil ("No Engine")

- **Decisão de Produto:** Padrão aberto adotado para novos usuários para incentivar a interação, o networking entre entusiastas e a visibilidade de clubes e eventos.
- **Proteções Existentes:**
  - Clubes fechados/privados só são visíveis para outros membros do próprio clube.
  - Qualquer usuário pode, a qualquer momento, acessar **Configurações › Privacidade** e ativar a opção **"Esconder o bloco No Engine do perfil"** (`hideEngineBlock = true`), ocultando a aba completamente para visitantes externos enquanto mantém um selo discreto "Só você vê" na sua visualização pessoal.

---

## 10. Variáveis de Ambiente em Produção (Netlify)

Todas as variáveis sensíveis e públicas necessárias foram cadastradas e verificadas no Netlify:

| Variável | Contexto | Finalidade |
|---|---|---|
| `STRIPE_SECRET_KEY` | Production | Chave secreta de cobrança da Stripe Live |
| `STRIPE_WEBHOOK_SECRET` | Production | Validação de assinatura dos eventos da Stripe |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Production | Inicialização do checkout embutido no frontend |
| `SUPABASE_URL` | All contexts | Endpoint oficial do banco Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Production | Permissão de backend para as Netlify Functions |
| `VITE_SUPPORT_PIX_KEY` | All contexts | Chave Pix oficial exibida em `/apoie` |

---

## 11. Mapa dos Arquivos de Credenciais Locais (`C:\engine-credentials\`)

Nenhuma chave secreta vive no código-fonte. Todas estão centralizadas na pasta protegida da máquina:

- `C:\engine-credentials\stripe.env` — Chaves de teste, produção e webhook da Stripe.
- `C:\engine-credentials\resend.env` — Chave de API e senha SMTP da Resend.
- `C:\engine-credentials\supabase.env` — Senhas de banco, chaves anon e service_role do Supabase.
- `C:\engine-credentials\google-oauth.env` — Client ID e Client Secret do Google OAuth.

---

## 12. Próximos Passos Sugeridos (Sem Urgência)

1. **Testes do Aplicativo:** Navegar logado no domínio oficial testando o feed da comunidade, editor de fotos (com limpeza automática de GPS/EXIF) e gestão de garagem.
2. **Texto da Seção de Apoio:** Redigir com calma o texto definitivo que você mais gostar para a página `/apoie`.
3. **Verificação de Marca Google:** Submeter a tela de consentimento do Google Cloud para validação oficial de marca (para exibir "Engine" no lugar de `supabase.co` na tela de login).
4. **AdSense & Contabilidade:** Configurar conta de anúncios e formalização de MEI/ME quando atingir volume relevante de cobranças.

---
*Relatório gerado e documentado automaticamente pelo assistente de engenharia do Engine.*
