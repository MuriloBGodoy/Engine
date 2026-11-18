import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { QrCode } from "./QrCode";
import { montarCarteira } from "../../services/carteira";
import { estiloDoEnquadramento } from "../../services/enquadrar";
import "../../services/i18n-carteira";

/**
 * A Carteira de Garagem — o cartão.
 *
 * Desenhada em HTML, não em imagem: os dados são os da pessoa, mudam com a
 * ficha do carro e ficam nítidos em qualquer tela. Toda medida está em `em` e
 * o tamanho inteiro sai de UM `font-size` (ver `.engine-carteira` no
 * index.css) — é assim que o cartão encolhe inteiro, com as proporções de
 * uma carteira de verdade (85,6 × 54 mm), em vez de quebrar em pedaços.
 *
 * A fonte da assinatura (Caveat) é carregada AQUI, quando a carteira aparece,
 * e não no index.html: ela serve a um único componente que quase ninguém abre
 * duas vezes por semana, e não tem por que pesar no primeiro carregamento de
 * todo mundo.
 */

const FONTE_FIRMA =
  "https://fonts.googleapis.com/css2?family=Caveat:wght@600&display=swap";

function useFonteDaFirma() {
  useEffect(() => {
    if (document.querySelector('link[data-engine-firma="1"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONTE_FIRMA;
    link.dataset.engineFirma = "1";
    document.head.appendChild(link);
    // Não removemos no cleanup: a folha é minúscula e tirá-la faria a
    // assinatura piscar para quem abre a carteira duas vezes seguidas.
  }, []);
}

export function CarteiraGaragem({
  perfil,
  carros = [],
  criadoEm = "",
  tema = "claro",
  url = "",
  posts = 0,
  seguidores = 0,
  conquistas = 0,
  numero = 0,
  firma = "nome",
  fundo = null,
}) {
  const { t, i18n } = useTranslation();
  useFonteDaFirma();

  const dados = useMemo(
    () =>
      montarCarteira({
        perfil,
        carros,
        criadoEm,
        posts,
        seguidores,
        conquistas,
        numero,
        firma,
        t,
        idioma: i18n.language,
      }),
    [perfil, carros, criadoEm, posts, seguidores, conquistas, numero, firma, t, i18n.language],
  );

  // Código de barras: enfeite, como nas carteiras originais — ele não
  // codifica nada. As larguras saem do número da carteira para serem sempre
  // as mesmas da mesma pessoa, em vez de mudarem a cada render.
  const barras = useMemo(() => {
    const semente = dados.numero;
    return Array.from({ length: 34 }, (_, i) => {
      const c = semente.charCodeAt(i % semente.length) + i * 7;
      return 0.35 + ((c % 5) * 0.22);
    });
  }, [dados.numero]);

  return (
    <div className="engine-carteira" data-tema={tema}>
      <div className="engine-carteira-fundo" aria-hidden="true">
        {/* A foto da pessoa vai ATRÁS do guilhoché e do ponteiro: por cima,
            ela viraria um story com texto em cima; por baixo, continua
            parecendo um documento impresso sobre um fundo. */}
        {fundo?.url ? (
          <>
            <img
              src={fundo.url}
              alt=""
              className="engine-carteira-foto"
              style={estiloDoEnquadramento(fundo.enquadramento)}
            />
            <div className="engine-carteira-veu" />
          </>
        ) : null}
        <div className="engine-carteira-guilhoche" />
        {/* Toda carteira tem o símbolo do lugar atravessando o cartão por
            baixo do texto: o arco-íris no Havaí, o urso na Califórnia. O do
            Engine é um ponteiro de conta-giros com a faixa vermelha no fim. */}
        <svg className="engine-carteira-giro" viewBox="0 0 342 216" preserveAspectRatio="none">
          <g fill="none" strokeLinecap="round">
            <path d="M-14 206 A 186 186 0 0 1 356 186" stroke="var(--carteira-linha)" strokeWidth="22" opacity="0.5" />
            <path d="M-14 206 A 186 186 0 0 1 258 48" stroke="var(--carteira-cinza)" strokeWidth="2.4" opacity="0.5" />
            <path d="M262 50 A 186 186 0 0 1 356 186" stroke="var(--engine-accent)" strokeWidth="6" opacity="0.55" />
          </g>
          {/* A escala do conta-giros: tracejado em cima de um arco
              concêntrico, para os tracinhos acompanharem a curva sozinhos. */}
          <path
            d="M2 198 A 168 168 0 0 1 344 180"
            fill="none"
            stroke="var(--carteira-cinza)"
            strokeWidth="7"
            opacity="0.3"
            strokeDasharray="1.5 15"
          />
        </svg>
      </div>

      <div className="engine-carteira-conteudo">
        <div className="engine-carteira-esquerda">
          <div className="engine-carteira-retrato">
            {dados.avatar ? (
              <img src={dados.avatar} alt="" />
            ) : (
              <svg viewBox="0 0 60 80" aria-hidden="true">
                <circle cx="30" cy="29" r="13" fill="rgba(255,255,255,0.22)" />
                <path d="M6 80c0-14 11-23 24-23s24 9 24 23z" fill="rgba(255,255,255,0.22)" />
              </svg>
            )}
          </div>

          <div className="engine-carteira-barras" aria-hidden="true">
            {barras.map((largura, i) => (
              <i key={i} style={{ width: `${largura}em` }} />
            ))}
          </div>

          <div>
            <div className="engine-carteira-nome">{dados.nome}</div>
            <div className="engine-carteira-end">
              {dados.handle}
              {dados.cidade ? (
                <>
                  <br />
                  {dados.cidade}
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="engine-carteira-direita">
          <div className="engine-carteira-cabeca">
            <span className="engine-carteira-uf">Engine</span>
            <span className="engine-carteira-tipo">
              <b>{t("carteira.type")}</b>
              <span>{t("carteira.subtitle")}</span>
            </span>
          </div>

          <div className="engine-carteira-linha-num">
            <span className="engine-carteira-rot">{t("carteira.number")}</span>
            <span className="engine-carteira-num">{dados.numero}</span>
          </div>

          <div className="engine-carteira-datas">
            <span className="engine-carteira-dado">
              <span className="engine-carteira-rot">{t("carteira.since")}</span>
              <span className="engine-carteira-val">{dados.desde}</span>
            </span>
            <span className="engine-carteira-dado">
              <span className="engine-carteira-rot">{t("carteira.validity")}</span>
              <span className="engine-carteira-val engine-carteira-val-vermelho">
                {t("carteira.forever")}
              </span>
            </span>
          </div>

          <div className="engine-carteira-grade">
            {[
              ["garage", dados.gar],
              ["posts", dados.posts],
              ["followers", dados.seguidores],
              ["badges", dados.conquistas],
              ["state", dados.uf],
              ["class", dados.classe],
            ].map(([chave, valor]) => (
              <span key={chave} className="engine-carteira-cel">
                <span className="engine-carteira-rot">{t(`carteira.${chave}`)}</span>
                <span className="engine-carteira-v">{valor}</span>
              </span>
            ))}
          </div>

          <div className="engine-carteira-grade2">
            <span className="engine-carteira-cel">
              <span className="engine-carteira-rot">{t("carteira.issued")}</span>
              <span className="engine-carteira-v">{dados.emissao}</span>
            </span>
            <span className="engine-carteira-cel">
              <span className="engine-carteira-rot">{t("carteira.restrictions")}</span>
              <span className="engine-carteira-v">{dados.restricoes}</span>
            </span>
          </div>

          <div className="engine-carteira-rodape">
            <span className="engine-carteira-firma">{dados.firma}</span>
            {url ? <QrCode valor={url} className="engine-carteira-qr" titulo={url} /> : null}
          </div>
        </div>
      </div>

      {/* Microimpressão: a fiada de letras minúsculas na borda, como num
          documento de verdade. Repetida o bastante para atravessar o cartão
          em qualquer largura. */}
      <div className="engine-carteira-micro" aria-hidden="true">
        {t("carteira.micro").repeat(6)}
      </div>
    </div>
  );
}
