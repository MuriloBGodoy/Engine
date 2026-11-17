import { useTranslation } from "react-i18next";
import { QrCode } from "../carteira/QrCode";
import { shareUrls } from "../../services/shareLinks";
import "../../services/i18n-car-handle";

/**
 * O ADESIVO DO CARRO — o desenho.
 *
 * 5 × 5 cm para colar no vidro: o apelido do carro e um QR que abre a página
 * pública dele. É a ponte do app para a rua: quem parou do lado no semáforo
 * não vai baixar app nenhum, mas aponta a câmera.
 *
 * O que ele NÃO tem, de propósito: código. Nada de "EG-5857", nada de placa,
 * nada de sequência de letras e números — o Murilo foi explícito ("não queria
 * nada com tipo letras e números parecendo código"), e ele está certo: um
 * adesivo com código parece etiqueta de patrimônio, não coisa de carro. O
 * único texto é o nome que o dono deu ao carro e o endereço de onde ele mora.
 *
 * Por isso o apelido é pré-requisito de verdade e não enfeite: adesivo sem
 * apelido seria um QR sozinho, que é exatamente a etiqueta de patrimônio.
 *
 * Tamanho: ver `.engine-adesivo` no index.css. Tudo em `em` a partir de um
 * `font-size` só, e `@media print` fixa 50 mm reais no papel.
 */
export function Adesivo({ slug, nickname, tema = "claro", forma = "quadrado" }) {
  const { t } = useTranslation();
  const url = shareUrls.car(slug);
  const nome = String(nickname || "").trim();

  return (
    <div
      className="engine-adesivo"
      data-tema={tema}
      data-forma={forma}
      data-nome={nome.length > 13 ? "longo" : "curto"}
    >
      <span className="engine-adesivo-marca">
        <i aria-hidden="true" />
        Engine
      </span>

      <div className="engine-adesivo-qr">
        <QrCode valor={url} margem={1} titulo={url} />
      </div>

      <div className="engine-adesivo-pe">
        {nome ? (
          <>
            <span className="engine-adesivo-nome">{nome}</span>
            <span className="engine-adesivo-site">enginegarage.com.br</span>
          </>
        ) : (
          /* Sem apelido o nome não é inventado: entra a chamada, que ao menos
             diz para que serve o quadradinho. */
          <span className="engine-adesivo-chamada">
            {t("adesivo.scanLead")}
            <br />
            {t("adesivo.scanSub")}
          </span>
        )}
      </div>
    </div>
  );
}
