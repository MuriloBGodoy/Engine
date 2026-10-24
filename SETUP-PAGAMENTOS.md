# Setup de pagamentos — checklist para quando for cobrar

**Estado (24/10/2026):** o código da cobrança está pronto; falta abrir as
contas e colar as chaves. Enquanto as chaves não existirem, o app funciona
normalmente — só não é possível assinar.

---

## O que o Engine vende

Decidido em 24/10/2026. **Tudo o que já existe no app é grátis para sempre,
inclusive publicar serviço.** Os planos só acrescentam.

| Oferta (`lib/plans.js`) | Para quem | Preço | Como cobra |
| --- | --- | --- | --- |
| `pro_monthly` | Prestador de serviço (inclui tudo do Premium) | R$ 25/mês · fundador R$ 15/mês | Assinatura, 30 dias de teste |
| `premium_yearly` | Dono do carro | R$ 79,90/ano | Assinatura anual |
| `premium_pass_1m` | Dono do carro | R$ 14,90 | Pagamento único, não renova |
| `premium_pass_3m` | Dono do carro | R$ 34,90 | Pagamento único, não renova |

- **Preço de fundador:** os primeiros 30 que assinarem o Pro (`FOUNDER_SLOTS`)
  pagam R$ 15/mês para sempre, depois do teste.
- **Teste grátis:** uma vez por pessoa. Sem cartão válido no fim do teste, a
  assinatura cancela sozinha.
- **Passe:** comprar dois seguidos soma os meses. Não rebaixa quem já tem
  assinatura.

Os preços vivem no código (`price_data`), não no painel do Stripe: não há
produto nem `price_` para criar à mão.

---

## Como está montado

Nenhuma chave secreta vai para o navegador. Quem fala com o gateway são as
Netlify Functions.

| Peça | Faz o quê |
| --- | --- |
| `subscription-create` | abre a compra de uma oferta; no Stripe devolve o `clientSecret` do checkout **embutido no app** |
| `subscription-webhook-stripe` | ativa, renova, cancela o plano e ativa passes |
| `subscription-portal` | abre o portal do Stripe: cancelar, trocar cartão, faturas |
| `subscription-webhook-mercadopago` | o mesmo, para a LatAm de língua espanhola |
| `user_plans` (Supabase) | fonte da verdade; só o servidor escreve |
| `useIsPremium` | lê o plano (passe vencido conta como grátis) |
| Configurações › Seu plano | mostra plano, data do teste/renovação e o botão de cancelar |

**Provedor por país** (`lib/providers.js`): **Stripe para o Brasil** e para
EUA/Europa; Mercado Pago para AR, MX, CL e CO.

---

## Checklist

### 1. Abrir o MEI primeiro

O Stripe Brasil aceita conta só com CPF, mas **o tipo da conta não muda depois
de verificada**: abrir com CPF e passar para MEI depois significa criar outra
conta e migrar os assinantes. Por isso: MEI antes, Stripe depois.

- [ ] Abrir o MEI no gov.br (gratuito). Confirmar com um contador que a
      atividade está na lista do MEI e qual CNAE usar.
- [ ] Ver como emitir NFS-e (o relatório do Han em
      `docs/pesquisa-direitos-e-patrocinio-2026-10-24.md` cobre isso).

### 2. Stripe (Brasil e exterior)

- [ ] Criar a conta **como empresa (CNPJ do MEI)** e completar a verificação
- [ ] Copiar a chave secreta → `STRIPE_SECRET_KEY`
- [ ] Copiar a chave publicável → `VITE_STRIPE_PUBLISHABLE_KEY` (essa pode ir
      para o navegador)
- [ ] Developers › Webhooks › adicionar endpoint
      `https://SEU-SITE/.netlify/functions/subscription-webhook-stripe` com os
      eventos:
      - `checkout.session.completed`
      - `checkout.session.async_payment_succeeded`
      - `customer.subscription.created`
      - `customer.subscription.updated`
      - `customer.subscription.deleted`
- [ ] Copiar o **signing secret** → `STRIPE_WEBHOOK_SECRET`
- [ ] Settings › Billing › **Customer portal**: ligar "cancelar assinatura"
      (no fim do período), "atualizar forma de pagamento" e "histórico de
      faturas"
- [ ] Settings › Billing › **Subscriptions and emails**: ligar o e-mail de
      **aviso de fim do teste** (7 dias antes) e o de **renovação próxima**.
      O app promete esse aviso.
- [ ] Settings › Payment methods: pedir o **Pix** (é por convite, só para
      pagamento único — serve ao anual e aos passes). Se não liberarem, o Pix
      do Mercado Pago entra como complemento.
- [ ] Settings › Branding: cor e logo do Engine (é o que o checkout embutido
      usa)

### 3. Netlify — colar as variáveis

- [ ] `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- [ ] `VITE_STRIPE_PUBLISHABLE_KEY`
- [ ] `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (as funções gravam o plano)
- [ ] (opcional) `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`

`SITE_URL` só é preciso no `netlify dev` e em Deploy Preview; em produção o
endereço de retorno sai de `URL`, que a Netlify entrega sozinha.

### 4. Testar antes de abrir

- [ ] Stripe em modo de teste + `stripe listen --forward-to` para o webhook
- [ ] Assinar o Pro e conferir: `user_plans.plan = "pro"`, `trialEnd`
      preenchido, Configurações mostra a data da primeira cobrança
- [ ] Comprar um passe e conferir a data de fim
- [ ] Cancelar pelo portal e conferir que continua valendo até o fim do
      período e depois volta para `free`

---

## Falta no app

- A tela **Planos** com o checkout embutido (passa pelo processo da Jesse:
  referências, protótipo, aprovação).
- As funções do Pro e do Premium em si (ver o mapa do Premium).
