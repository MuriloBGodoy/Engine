# Plano pré-lançamento — 25/10/2026

Consolidação das cinco auditorias de 25/10/2026 (detalhes, arquivo:linha e
fontes em cada uma):

- `auditoria-servicos-2026-10-25.md` (Han) — **corrigida** pela Jesse; falta
  aplicar a migration `20261025150000_service_listing_light_edits.sql` e subir.
- `auditoria-social-2026-10-25.md` (Han)
- `auditoria-simulador-2026-10-25.md` (Xuria)
- `auditoria-garagem-2026-10-25.md` (Brian)
- `auditoria-geral-2026-10-25.md` (Jesse)

## Onda 1 — segurança e privacidade (bloqueia o lançamento)

1. Notificações: qualquer conta escreve no sino de qualquer outra (texto livre).
2. Conquistas: qualquer conta grava qualquer conquista para qualquer pessoa.
3. `savedValue` vaza no post público (a Política diz que é oculto).
4. Bloqueio só no feed: bloqueado ainda manda mensagem/comenta/notifica.
5. Denúncias de post sem tela de moderação; admin não apaga post alheio;
   faltam denúncias de comentário/perfil/mensagem/clube/evento.
6. Login com Google pula 18+ e aceite dos termos; 18+ não fica gravado.
   → tela de primeiro uso (18+, termos, @usuário) para e-mail e Google.
7. Confirmação de e-mail desligada (dá para usar e-mail alheio) — depende do SMTP.

## Onda 2 — números errados (simulador e garagem)

1. Carro já próprio simulado como financiado (Onix quitado R$ 3.448 vs R$ 855).
2. Combustível sempre "gasolina" (diesel/elétrico errados, IPVA de elétrico isento).
3. Três números diferentes para a mesma simulação (modal x card x Painel).
4. Rótulo de elétrico com fonte falsa ("ANP", "km/l").
5. Texto de "Total de juros" (piso, sem IOF/tarifas) — corrigir a copy.
6. Consumo guardado por combustível; "renda necessária" do Painel rotulada ou fora;
   sem estado não somar IPVA/licenciamento.
7. Ponto decimal: "38.5" vira 385; limites de plausibilidade.
8. Erro da FIPE mudo no cadastro; preço não zera ao trocar a versão.
9. Datas em UTC (depois das 21h vira amanhã) — garagem e eventos.
10. Apagar aporte/gasto sem confirmação.

## Onda 3 — uso e primeira impressão

1. Idioma do navegador ignorado; visitante sem seletor de idioma.
2. ErrorBoundary (tela preta em qualquer erro).
3. Celular sem caminho para Configurações; sair sem confirmação.
4. Publicar post no celular (botão só ≥1280px); página do post com botões mortos.
5. `?next=` em todos os "Entrar".
6. Visitante vê "Comentário/Avaliação salva" sem gravar.
7. Bio do perfil nunca aparece (`bio` x `note`); feed reordena ao trocar tema.
8. Busca no seletor de versão do carro.
9. Cadastro mais curto (telefone opcional).
10. Textos: Privacidade promete "exportar dados" (não existe) e "avisamos no app";
    /anuncie "respondemos por e-mail" e números pequenos ao vivo; chave crua
    `imageCropper.error`.

## Do Murilo

- Ligar SMTP (depende do domínio) — destrava e-mail de senha, confirmação,
  aviso de aprovação e resposta do /anuncie.
- Não abrir a venda do Premium enquanto "sem anúncios" for o único benefício e
  não houver AdSense.
- Perguntas ao advogado: PostHog sem consentimento; ECA Digital art. 24.
- Trocar o moderador de muxdtuber@ para enginegarage.app@ (`is_service_admin`).

## Depois do lançamento

Home de visitante nova (protótipo), contraste do vermelho no escuro, meta FIPE
reconsultada e editável, campos de tanque/combustível, IOF/ANEEL/IPVA elétrico
(Han), rotina de janeiro das tabelas, push, ligação das seções sociais com
Serviços, deduplicação de métricas no servidor antes de cobrar o Pro.
