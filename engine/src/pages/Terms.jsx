import { LegalPage, LegalSection } from "../components/LegalPage";

/**
 * Termos de uso.
 *
 * Dois pontos aqui não são formalidade e existem para proteger o Engine de
 * verdade: deixar claro que a plataforma é vitrine e não parte na contratação
 * do serviço, e descrever cobrança, cancelamento e arrependimento antes de
 * existir o primeiro assinante.
 */
export function Terms() {
  return (
    <LegalPage title="Termos de Uso" updatedAt="24 de outubro de 2026">
      <p>
        Ao usar o Engine você concorda com estes termos. Se não concordar, não
        use a plataforma.
      </p>

      <LegalSection title="O que é o Engine">
        <p>
          O Engine é uma plataforma onde você organiza metas de compra de
          veículo, acompanha o quanto já guardou, participa de uma comunidade e
          encontra prestadores de serviços automotivos.
        </p>
      </LegalSection>

      <LegalSection title="Sua conta">
        <p>
          Você precisa ter pelo menos 18 anos e fornecer informações
          verdadeiras. Você é responsável pelo que acontece na sua conta e por
          manter a senha em segurança.
        </p>
      </LegalSection>

      <LegalSection title="O que você publica">
        <p>
          O conteúdo que você publica continua sendo seu. Ao publicar, você nos
          dá permissão para exibi-lo dentro do Engine — inclusive publicamente,
          quando for uma meta compartilhada, um perfil ou um anúncio de serviço.
        </p>
        <p>Não é permitido publicar:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>conteúdo ilegal, ofensivo, discriminatório ou que ameace alguém;</li>
          <li>conteúdo sexual, violento ou que exponha terceiros sem consentimento;</li>
          <li>conteúdo que não é seu, sem permissão de quem é;</li>
          <li>golpe, propaganda enganosa ou serviço que você não presta;</li>
          <li>dados pessoais de outras pessoas.</li>
        </ul>
        <p>
          Você pode denunciar publicações e bloquear pessoas dentro do app.
          Conteúdo que viole estas regras pode ser removido, e a conta
          responsável pode ser suspensa ou encerrada.
        </p>
      </LegalSection>

      <LegalSection title="Serviços anunciados: o Engine não é parte">
        <p>
          Os serviços anunciados são oferecidos por terceiros, não pelo Engine.{" "}
          <strong className="text-[var(--engine-text)]">
            A contratação, o pagamento, a execução e a garantia do serviço são
            entre você e o prestador.
          </strong>{" "}
          O Engine é a vitrine onde vocês se encontram e não se responsabiliza
          pela qualidade, prazo, preço ou resultado do serviço contratado.
        </p>
        <p>
          Anúncios passam por uma triagem antes de serem publicados, mas isso não
          é atestado de qualidade nem recomendação. Confira quem você contrata.
        </p>
      </LegalSection>

      <LegalSection title="Avaliações">
        <p>
          Quem tem conta pode avaliar um serviço anunciado com uma nota de 1 a
          5 e um comentário. São opiniões de clientes:{" "}
          <strong className="text-[var(--engine-text)]">
            o Engine não verifica se o serviço foi de fato prestado
          </strong>{" "}
          e não recomenda nem garante o prestador por causa da nota.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>uma avaliação por pessoa em cada anúncio, que você pode editar ou apagar;</li>
          <li>só avalie serviço que você contratou; o prestador não avalia o próprio anúncio;</li>
          <li>contas criadas há menos de 24 horas ainda não avaliam, e há um limite diário de avaliações;</li>
          <li>valem as mesmas regras de conteúdo acima — sem ofensa, golpe, informação falsa ou dado pessoal de terceiros.</li>
        </ul>
        <p>
          O prestador pode responder publicamente, uma vez por avaliação, mas
          não pode apagá-la, e o Engine não remove nem esconde avaliação a
          pedido ou mediante pagamento do prestador. Nota baixa, sozinha, não é
          motivo de remoção. Qualquer pessoa pode denunciar uma avaliação; a
          moderação analisa e oculta a que violar estas regras. A média
          exibida considera apenas as avaliações publicadas.
        </p>
      </LegalSection>

      <LegalSection title="O que é grátis">
        <p>
          Tudo o que existe hoje no Engine é grátis e continua grátis, inclusive
          publicar serviço. Os planos pagos só acrescentam recursos; nunca
          trancam o que já era livre.
        </p>
      </LegalSection>

      <LegalSection title="Planos Pro e Premium">
        <p>
          <strong className="text-[var(--engine-text)]">Premium</strong> é para
          o dono do carro: assinatura anual, ou passe de 1 ou 3 meses.{" "}
          <strong className="text-[var(--engine-text)]">Pro</strong> é para quem
          presta serviço, inclui tudo do Premium e é mensal. Os preços e o que
          cada plano inclui estão na página Planos, e o resumo aparece de novo
          antes de você pagar.
        </p>
        <p>
          <strong className="text-[var(--engine-text)]">Renovação.</strong> As
          assinaturas se renovam automaticamente ao fim de cada período até você
          cancelar. O passe é pagamento único e não renova.
        </p>
        <p>
          <strong className="text-[var(--engine-text)]">Teste grátis.</strong>{" "}
          O Pro começa com um teste grátis, uma vez por pessoa. A data da
          primeira cobrança aparece antes de você confirmar e em Configurações ›
          Seu plano, e enviamos um aviso por e-mail antes dela. Cancelando antes
          dessa data, nada é cobrado.
        </p>
        <p>
          <strong className="text-[var(--engine-text)]">Cancelamento.</strong>{" "}
          Em Configurações › Seu plano › Gerenciar ou cancelar, a qualquer
          momento, sem multa e sem fidelidade. O plano continua valendo até o fim
          do período já pago.
        </p>
        <p>
          <strong className="text-[var(--engine-text)]">Arrependimento e
          reembolso.</strong> Você pode desistir em até 7 dias da contratação e
          receber de volta todo o valor pago, como prevê o artigo 49 do Código
          de Defesa do Consumidor — inclusive no passe. Como o teste grátis do
          Pro dura mais que 7 dias, também devolvemos integralmente a primeira
          cobrança depois do teste se você pedir em até 7 dias dela. Peça pelo
          e-mail de contato abaixo; o reembolso volta pelo mesmo meio de
          pagamento.
        </p>
        <p>
          <strong className="text-[var(--engine-text)]">Pagamento.</strong>{" "}
          Processado pelo Stripe (ou Mercado Pago, em alguns países da América
          Latina). Preços podem mudar, com aviso antecipado, e nunca valem para
          um período já pago. O preço de fundador é mantido enquanto a
          assinatura continuar ativa.
        </p>
      </LegalSection>

      <LegalSection title="Anúncios e patrocínios">
        <p>
          Todo anúncio, destaque pago ou patrocínio dentro do Engine aparece com
          o rótulo <strong className="text-[var(--engine-text)]">Anúncio</strong>{" "}
          ou <strong className="text-[var(--engine-text)]">Patrocinado</strong>.
          Patrocínio nunca muda a ordem da busca de serviços: o destaque pago
          fica numa faixa separada.
        </p>
      </LegalSection>

      <LegalSection title="Estimativas e valores">
        <p>
          O simulador de custo de posse e as previsões de quando você atinge a
          meta são <strong className="text-[var(--engine-text)]">estimativas
          baseadas em médias públicas e no que você informa</strong>. Servem para
          planejamento, não são consultoria financeira, não são oferta de crédito
          e não substituem cotação real de seguro, financiamento ou manutenção.
        </p>
      </LegalSection>

      <LegalSection title="Disponibilidade">
        <p>
          Fazemos o possível para manter o Engine no ar, mas ele é oferecido como
          está, sem garantia de funcionamento ininterrupto. Funcionalidades podem
          mudar ou ser descontinuadas.
        </p>
      </LegalSection>

      <LegalSection title="Encerramento">
        <p>
          Você pode apagar sua conta quando quiser, nas configurações. Podemos
          suspender ou encerrar contas que violem estes termos, e nesse caso
          avisamos o motivo sempre que for possível.
        </p>
      </LegalSection>

      <LegalSection title="Lei aplicável">
        <p>
          Estes termos seguem a lei brasileira. Eventuais disputas serão
          resolvidas no foro do domicílio do consumidor, como prevê o Código de
          Defesa do Consumidor.
        </p>
      </LegalSection>

      <LegalSection title="Quem oferece o Engine">
        <p>
          O Engine é operado por Murilo Godoy. Antes da primeira cobrança, o
          CNPJ e o endereço da empresa responsável serão publicados aqui, como
          exige o Decreto 7.962/2013. Respondemos pedidos de atendimento em até
          5 dias.
        </p>
      </LegalSection>

      <LegalSection title="Contato">
        <p>
          Dúvidas sobre estes termos:{" "}
          <a className="text-[var(--engine-accent)]" href="mailto:muxdtuber@gmail.com">
            muxdtuber@gmail.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
