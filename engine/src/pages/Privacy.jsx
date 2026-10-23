import { LegalPage, LegalSection } from "../components/LegalPage";

/**
 * Política de privacidade.
 *
 * Escrita a partir do que o Engine realmente coleta hoje, não de um modelo
 * genérico. Se o produto passar a coletar outra coisa, esta página precisa
 * mudar junto — política que não descreve o sistema é pior que nenhuma.
 */
export function Privacy() {
  return (
    <LegalPage title="Política de Privacidade" updatedAt="17 de outubro de 2026">
      <p>
        Esta página explica quais dados o Engine coleta, por que coleta e o que
        você pode fazer a respeito. A linguagem é direta de propósito.
      </p>

      <LegalSection title="Quem é responsável">
        <p>
          O Engine é operado por Murilo Godoy. Para qualquer assunto sobre seus
          dados, incluindo os pedidos descritos abaixo, escreva para{" "}
          <a className="text-[var(--engine-accent)]" href="mailto:muxdtuber@gmail.com">
            muxdtuber@gmail.com
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="O que coletamos">
        <p>
          <strong className="text-[var(--engine-text)]">Conta.</strong> E-mail e
          senha. A senha é guardada pelo Supabase Auth só como hash (uma cifra de
          mão única) e nunca fica visível para nós.
        </p>
        <p>
          <strong className="text-[var(--engine-text)]">Perfil.</strong> Nome de
          exibição, nome de usuário, biografia, foto, telefone e localização
          (país, estado e cidade) — o que você preencher.
        </p>
        <p>
          <strong className="text-[var(--engine-text)]">Suas metas.</strong>{" "}
          Marca, modelo, ano, fotos, valor da meta, quanto você já guardou e o
          histórico de aportes.
        </p>
        <p>
          <strong className="text-[var(--engine-text)]">Comunidade.</strong>{" "}
          Publicações, legendas, comentários, curtidas, avaliações, quem você
          segue e quem segue você.
        </p>
        <p>
          <strong className="text-[var(--engine-text)]">Mensagens.</strong> O
          conteúdo das conversas diretas entre usuários.
        </p>
        <p>
          <strong className="text-[var(--engine-text)]">Serviços.</strong> Se
          você anuncia um serviço: dados do anúncio, WhatsApp, e-mail, endereço
          ou área de atendimento, fotos e links de redes sociais.
        </p>
        <p>
          <strong className="text-[var(--engine-text)]">Moderação.</strong>{" "}
          Denúncias que você abre e a lista de pessoas que você bloqueou.
        </p>
        <p>
          <strong className="text-[var(--engine-text)]">Uso e falhas.</strong>{" "}
          Registros de erro e de navegação, para corrigir problemas e entender
          quais partes do app são usadas. Não gravamos a sua tela nem o que você
          digita.
        </p>
        <p>
          <strong className="text-[var(--engine-text)]">Localização
          aproximada.</strong> Deduzida do seu endereço de IP, apenas para
          sugerir a região inicial. Você pode trocar a região quando quiser, e a
          sua escolha sempre prevalece.
        </p>
      </LegalSection>

      <LegalSection title="O que é público">
        <p>
          Esta parte é importante. <strong className="text-[var(--engine-text)]">
          Seu perfil público, as metas que você publica na comunidade e os
          anúncios de serviço aprovados podem ser vistos por qualquer pessoa,
          inclusive sem conta no Engine.</strong> É assim de propósito: é o que
          permite compartilhar um perfil ou um anúncio por link.
        </p>
        <p>
          O que <em>não</em> é público: seus dados de conta, as metas que você
          não publicou, valores de metas não publicadas, mensagens diretas, sua
          lista de bloqueados e as denúncias que você abre.
        </p>
        <p>
          Metas publicadas aparecem sem os valores em dinheiro para outras
          pessoas — só o progresso em porcentagem.
        </p>
      </LegalSection>

      <LegalSection title="Com quem compartilhamos">
        <p>
          Não vendemos seus dados. Usamos serviços de terceiros que processam
          dados para o Engine funcionar:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-[var(--engine-text)]">Supabase</strong> —
            autenticação, banco de dados e armazenamento de imagens, em servidores
            em São Paulo (Brasil).
          </li>
          <li>
            <strong className="text-[var(--engine-text)]">Google</strong> — só
            para quem escolhe entrar com a conta Google.
          </li>
          <li>
            <strong className="text-[var(--engine-text)]">Sentry</strong> —
            relatórios de erro.
          </li>
          <li>
            <strong className="text-[var(--engine-text)]">PostHog</strong> —
            estatísticas de uso.
          </li>
          <li>
            <strong className="text-[var(--engine-text)]">Netlify</strong> —
            hospedagem.
          </li>
          <li>
            <strong className="text-[var(--engine-text)]">Mercado Pago e
            Stripe</strong> — pagamento da assinatura. O pagamento acontece no
            ambiente deles: <strong className="text-[var(--engine-text)]">o
            Engine nunca recebe nem armazena dados do seu cartão</strong>.
          </li>
          <li>
            <strong className="text-[var(--engine-text)]">Google AdSense</strong> —
            anúncios, quando estiverem ativos. Assinantes do plano Premium não
            veem anúncios.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Seus direitos">
        <p>
          Você pode pedir acesso, correção, portabilidade ou exclusão dos seus
          dados, e revogar consentimentos. A maior parte disso está no próprio
          app, em Configurações: editar o perfil, exportar os dados e{" "}
          <strong className="text-[var(--engine-text)]">apagar a conta
          permanentemente</strong>.
        </p>
        <p>
          Apagar a conta remove seu perfil, suas metas e suas publicações.
          Mensagens já enviadas podem permanecer na caixa de quem recebeu, e
          registros que a lei exige guardar são mantidos pelo prazo legal.
        </p>
      </LegalSection>

      <LegalSection title="Idade mínima">
        <p>
          O Engine não é destinado a menores de 13 anos. Se soubermos que uma
          conta pertence a alguém abaixo dessa idade, ela será removida.
        </p>
      </LegalSection>

      <LegalSection title="Mudanças nesta política">
        <p>
          Quando esta política mudar de forma relevante, avisamos no app antes
          de a mudança valer. A data no topo indica a última atualização.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
