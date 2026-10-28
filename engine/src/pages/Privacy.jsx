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
    <LegalPage title="Política de Privacidade" updatedAt="24 de outubro de 2026">
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
            <strong className="text-[var(--engine-text)]">Stripe</strong> (e
            Mercado Pago, em alguns países da América Latina) — pagamento dos
            planos. Mesmo quando o pagamento aparece dentro do app, os campos do
            cartão são do Stripe:{" "}
            <strong className="text-[var(--engine-text)]">o Engine nunca recebe
            nem armazena dados do seu cartão</strong>. Guardamos só o plano, as
            datas e o identificador da assinatura.
          </li>
          <li>
            <strong className="text-[var(--engine-text)]">Google AdSense</strong> —
            anúncios, quando estiverem ativos, e{" "}
            <strong className="text-[var(--engine-text)]">só depois que você
            escolher</strong> no aviso de cookies. Assinantes do Premium e do Pro
            não veem anúncios.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Cookies e anúncios">
        <p>
          O Engine usa armazenamento do navegador para funcionar: manter você
          conectado, lembrar idioma, tema e região. Isso não depende de
          consentimento.
        </p>
        <p>
          Os anúncios do Google AdSense usam cookies próprios. Por isso, na
          primeira visita, perguntamos:{" "}
          <strong className="text-[var(--engine-text)]">Aceitar</strong> libera
          anúncios que podem ser personalizados pelo Google;{" "}
          <strong className="text-[var(--engine-text)]">Rejeitar</strong> faz o
          Engine não carregar anúncios do Google, e nenhum cookie de publicidade
          é gravado. Enquanto você não escolhe, também não carregamos. O app
          funciona igual nos dois casos, e você muda a escolha quando quiser em
          Configurações › Privacidade.
        </p>
      </LegalSection>

      <LegalSection title="Métricas dos anúncios de serviço">
        <p>
          Quando você vê um anúncio de serviço na busca, abre o anúncio ou toca
          no WhatsApp dele, contamos isso por dia e por origem (busca, perfil,
          link). O prestador vê só os números somados, nunca quem foi.
        </p>
      </LegalSection>

      <LegalSection title="Seus direitos">
        <p>
          Você pode pedir acesso, correção, portabilidade ou exclusão dos seus
          dados, e revogar consentimentos. A maior parte disso está no próprio
          app: o perfil se edita na sua página de perfil, e em Configurações ›
          Conta você baixa uma cópia dos seus dados (arquivo JSON) e pode{" "}
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
          O Engine é destinado a maiores de 18 anos. O app trata de compra,
          financiamento e custo de carro, e o Estatuto Digital da Criança e do
          Adolescente (Lei 15.211/2025) exige regras próprias para contas de
          menores, inclusive a proibição de anúncio personalizado. Se soubermos
          que uma conta pertence a alguém com menos de 18 anos, ela será
          removida.
        </p>
      </LegalSection>

      <LegalSection title="Mudanças nesta política">
        <p>
          Quando esta política mudar de forma relevante, o app pede que você
          leia e aceite a nova versão antes de continuar usando a conta. A data
          no topo indica a última atualização.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
