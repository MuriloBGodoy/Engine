import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Crop, ImagePlus, Loader2, Maximize, Minimize, Target, Trash2 } from "lucide-react";
import { BottomSheet } from "../BottomSheet";
import { CarteiraGaragem } from "./CarteiraGaragem";
import { Carteira3D } from "./Carteira3D";
import { SaveImageButton } from "../ui/SaveImageButton";
import { useToast } from "../ToastProvider";
import { CARTEIRA, reduzirImagem } from "../../services/imagens";
import { removeStoredPhoto, storeDataUri } from "../../services/photos";
import { caber, centralizar, enquadramentoPadrao, preencher, prender } from "../../services/enquadrar";
import "../../services/i18n-carteira";

/**
 * A folha que mostra a Carteira de Garagem.
 *
 * Decisões:
 *
 *  - **Folha, e não página.** A carteira é uma coisa para olhar, girar, rir
 *    e mandar no grupo — não um lugar onde se fica.
 *  - **Ela é da PESSOA.** Até 15/11/2026 havia um seletor de carro aqui em
 *    cima, porque metade do cartão falava de um carro só. O cartão virou
 *    identidade (garagem, posts, seguidores, conquistas) e o seletor saiu
 *    junto: não há mais o que escolher.
 *  - **Girar e ajeitar a foto são o mesmo gesto**, então não podem conviver.
 *    Em "ver", arrastar gira o cartão em 3D; tocando em "Ajustar", o 3D
 *    congela de frente e o arrasto passa a mover a foto de fundo. Sem esse
 *    botão, cada arrasto faria as duas coisas pela metade.
 *  - **Claro ou escuro é escolha de quem usa.** O claro parece documento; o
 *    escuro combina com o app e fica melhor no print de quem posta à noite.
 *
 * Salvar sai em PNG de 3x pela folha de compartilhamento do sistema. O que é
 * fotografado é o CARTÃO, não o palco: o giro e o brilho são da tela, e a
 * imagem salva tem de sair reta.
 */

const MODO_VER = "ver";
const MODO_AJUSTAR = "ajustar";

export function CarteiraSheet({
  open,
  onClose,
  perfil,
  carros = [],
  criadoEm = "",
  url = "",
  posts = 0,
  seguidores = 0,
  conquistas = 0,
  numero = 0,
  fundo = null,
  onFundo = null,
  firma = "nome",
  onFirma = null,
  tema = "claro",
  onTema = null,
  userId = "",
  publica = true,
  onPublica = null,
  somenteVer = false,
}) {
  const { t } = useTranslation();
  const showToast = useToast();
  // O tema é ESCOLHA DO DONO e fica gravada: quem visita vê o cartão como ele
  // o deixou. Era estado solto que renascia em "claro" a cada abertura — o
  // fundo e a assinatura eram salvos, e o tema não, o que fazia a carteira
  // voltar ao claro sozinha depois de a pessoa escolher o escuro.
  const [temaLocal, setTemaLocal] = useState(tema);
  const temaAtual = onTema ? tema : temaLocal;
  const trocarTema = (valor) => {
    setTemaLocal(valor);
    onTema?.(valor);
  };
  const [modo, setModo] = useState(MODO_VER);
  const [carregando, setCarregando] = useState(false);
  const alvo = useRef(null);
  const entrada = useRef(null);
  const arrasto = useRef(null);
  // Dimensões da foto escolhida, para "Caber" e para prender o arrasto.
  const [medida, setMedida] = useState(null);

  const enquadramento = fundo?.enquadramento || enquadramentoPadrao();
  const moldura = { larguraMoldura: 85.6, alturaMoldura: 54 };

  // Sem foto não há o que ajustar: sair do modo evita a folha abrir travada
  // depois de a pessoa remover o fundo.
  useEffect(() => {
    if (!fundo?.url) setModo(MODO_VER);
  }, [fundo?.url]);

  useEffect(() => {
    if (!fundo?.url) {
      setMedida(null);
      return;
    }
    const img = new Image();
    img.onload = () => setMedida({ larguraImagem: img.naturalWidth, alturaImagem: img.naturalHeight });
    img.src = fundo.url;
  }, [fundo?.url]);

  const trocarEnquadramento = (proximo) => {
    if (!onFundo || !fundo?.url) return;
    const preso = medida ? prender(proximo, { ...medida, ...moldura }) : proximo;
    onFundo({ ...fundo, enquadramento: preso });
  };

  const escolherArquivo = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onFundo) return;
    setCarregando(true);
    const anterior = fundo?.url || "";
    try {
      // Reduzida primeiro (ver `CARTEIRA` em services/imagens) e SUBIDA
      // depois: o que fica guardado no perfil é o endereço da imagem, não a
      // imagem. O perfil público é lido em lote para montar feed e listas —
      // uma foto em base64 ali dentro é paga por todo mundo que aparece na
      // tela, toda vez. Sem rede, `storeDataUri` devolve o próprio base64 e
      // a carteira funciona neste aparelho.
      const dataUri = await reduzirImagem(file, CARTEIRA);
      const url = userId ? await storeDataUri(dataUri, { userId, folder: "carteira" }) : dataUri;
      onFundo({ url, enquadramento: enquadramentoPadrao() });
      setModo(MODO_AJUSTAR);
      // A foto trocada não fica ocupando o bucket público para sempre.
      if (anterior && anterior !== url) removeStoredPhoto(anterior);
    } catch (erro) {
      console.warn("[carteira] não deu para usar essa foto.", erro);
      showToast(t("carteira.fundoErro"), "error");
    } finally {
      setCarregando(false);
    }
  };

  const removerFundo = () => {
    const anterior = fundo?.url || "";
    onFundo(null);
    if (anterior) removeStoredPhoto(anterior);
  };

  /* --------------------------------------------- arrastar a foto ------- */

  const pegar = (evento) => {
    if (modo !== MODO_AJUSTAR || !fundo?.url) return;
    evento.currentTarget.setPointerCapture?.(evento.pointerId);
    arrasto.current = {
      x: evento.clientX,
      y: evento.clientY,
      base: enquadramento,
      caixa: evento.currentTarget.getBoundingClientRect(),
    };
  };

  const puxar = (evento) => {
    const inicio = arrasto.current;
    if (!inicio?.caixa?.width) return;
    trocarEnquadramento({
      ...inicio.base,
      x: inicio.base.x + (evento.clientX - inicio.x) / inicio.caixa.width,
      y: inicio.base.y + (evento.clientY - inicio.y) / inicio.caixa.height,
    });
  };

  const soltar = () => {
    arrasto.current = null;
  };

  const cartao = (
    <div
      ref={alvo}
      className="inline-flex"
      onPointerDown={pegar}
      onPointerMove={puxar}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      style={modo === MODO_AJUSTAR ? { cursor: "grab", touchAction: "none" } : undefined}
    >
      <CarteiraGaragem
        perfil={perfil}
        carros={carros}
        criadoEm={criadoEm}
        tema={temaAtual}
        url={url}
        posts={posts}
        seguidores={seguidores}
        conquistas={conquistas}
        numero={numero}
        firma={firma}
        fundo={fundo}
      />
    </div>
  );

  const botaoDeAjuste = (chave, Icone, rotulo, aoTocar) => (
    <button
      key={chave}
      type="button"
      onClick={aoTocar}
      className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-2 text-[12.5px] font-bold text-[var(--engine-text)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
    >
      <Icone size={15} aria-hidden="true" />
      {rotulo}
    </button>
  );

  const seletor = (titulo, opcoes, atual, aoEscolher) => (
    <div>
      <p className="mb-1.5 text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
        {titulo}
      </p>
      <div className="flex gap-2">
        {opcoes.map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            onClick={() => aoEscolher(id)}
            aria-pressed={atual === id}
            className={`min-h-11 flex-1 rounded-xl border px-3 text-[13px] font-bold transition ${
              atual === id
                ? "border-[var(--engine-accent)] bg-[var(--engine-accent)] text-white"
                : "border-[var(--engine-border)] bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <BottomSheet open={open} onClose={onClose} title={t("carteira.title")} className="sm:max-w-2xl">
      <div className="grid gap-4">
        <div className="flex justify-center py-1">
          <Carteira3D ativo={modo === MODO_VER}>{cartao}</Carteira3D>
        </div>

        <p className="text-center text-xs font-semibold text-[var(--engine-text-muted)]">
          {t(modo === MODO_AJUSTAR ? "carteira.hintAjustar" : "carteira.hintGirar")}
        </p>

        <SaveImageButton
          alvo={alvo}
          nome={["carteira-engine", perfil?.username || ""]}
          fundo={temaAtual === "escuro" ? "#11141a" : "#f3f1ec"}
          titulo={t("carteira.title")}
          textos={{
            label: t("carteira.download"),
            busy: t("carteira.downloading"),
            saved: t("carteira.savedImage"),
            shared: t("carteira.sharedImage"),
            error: t("carteira.imageError"),
          }}
        />

        {/* Quem está visitando vê o cartão e salva a imagem, e para por aí:
            fundo, assinatura e visibilidade são do dono. */}
        {somenteVer ? null : (
          <>
        {/* ------------------------------------------------- o fundo --- */}
        {onFundo && (
          <div>
            <p className="mb-1.5 text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]">
              {t("carteira.fundo")}
            </p>

            <input
              ref={entrada}
              id="carteira-fundo"
              type="file"
              accept="image/*"
              onChange={escolherArquivo}
              className="sr-only"
            />

            {!fundo?.url ? (
              <button
                type="button"
                onClick={() => entrada.current?.click()}
                disabled={carregando}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--engine-border-strong)] px-4 text-[13px] font-bold text-[var(--engine-text)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)] disabled:opacity-60"
              >
                {carregando ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                ) : (
                  <ImagePlus size={16} aria-hidden="true" />
                )}
                {t("carteira.fundoAdd")}
              </button>
            ) : (
              <div className="grid gap-2">
                {/* Os atalhos de enquadramento: quem não quer arrastar toca
                    num destes e a foto se ajeita sozinha. Mesma conta que o
                    arrasto usa — ver services/enquadrar.js. */}
                <div className="flex gap-2">
                  {botaoDeAjuste("preencher", Maximize, t("carteira.fundoFill"), () =>
                    trocarEnquadramento(preencher()),
                  )}
                  {botaoDeAjuste("caber", Minimize, t("carteira.fundoFit"), () =>
                    trocarEnquadramento(medida ? caber({ ...medida, ...moldura }) : enquadramentoPadrao()),
                  )}
                  {botaoDeAjuste("centro", Target, t("carteira.fundoCenter"), () =>
                    trocarEnquadramento(centralizar(enquadramento)),
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setModo(modo === MODO_AJUSTAR ? MODO_VER : MODO_AJUSTAR)}
                    aria-pressed={modo === MODO_AJUSTAR}
                    className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-[12.5px] font-bold transition ${
                      modo === MODO_AJUSTAR
                        ? "border-[var(--engine-accent)] bg-[var(--engine-accent)] text-white"
                        : "border-[var(--engine-border)] bg-[var(--engine-surface-2)] text-[var(--engine-text)]"
                    }`}
                  >
                    <Crop size={15} aria-hidden="true" />
                    {t(modo === MODO_AJUSTAR ? "carteira.fundoPronto" : "carteira.fundoAjustar")}
                  </button>
                  <button
                    type="button"
                    onClick={() => entrada.current?.click()}
                    className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3 text-[12.5px] font-bold text-[var(--engine-text)] transition hover:border-[var(--engine-accent)]"
                  >
                    <ImagePlus size={15} aria-hidden="true" />
                    {t("carteira.fundoTrocar")}
                  </button>
                  <button
                    type="button"
                    onClick={removerFundo}
                    aria-label={t("carteira.fundoRemover")}
                    className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---------------------------------------------- assinatura --- */}
        {onFirma &&
          seletor(
            t("carteira.firma"),
            [
              ["nome", t("carteira.firmaNome")],
              ["handle", t("carteira.firmaHandle")],
            ],
            firma,
            onFirma,
          )}

        {/* O interruptor mora AQUI e também em Configurações › Privacidade,
            lendo a mesma chave. Duas portas, um lugar só — é o padrão que o
            app já usa para salvos e arquivadas. A pergunta "quem vê isso?"
            nasce justamente olhando o cartão, e mandar a pessoa procurar em
            Configurações nesse instante é perder a resposta. */}
        {onPublica && (
          <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-[var(--engine-text)]">
                {t("carteira.publicaTitulo")}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-[var(--engine-text-muted)]">
                {t(publica ? "carteira.publicaSim" : "carteira.publicaNao")}
              </span>
            </span>
            <input
              type="checkbox"
              checked={publica}
              onChange={(event) => onPublica(event.target.checked)}
              className="h-5 w-5 shrink-0 accent-[var(--engine-accent)]"
            />
          </label>
        )}
        {/* O tema é parte do que o dono escolheu, então fica no bloco dele.
            Quem visita vê o cartão do jeito que ele ficou — trocar na mão de
            quem olha desfaria a escolha de quem fez. */}
        {seletor(
          t("carteira.theme"),
          [
            ["claro", t("carteira.themeLight")],
            ["escuro", t("carteira.themeDark")],
          ],
          temaAtual,
          trocarTema,
        )}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
