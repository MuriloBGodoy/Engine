import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Heart, Loader2, MessageCircle, Send, Trash2, Users } from "lucide-react";
import { auth } from "../../services/supabase";
import { engineEvents } from "../../services/events";
import { authPath } from "../../services/authRedirect";
import { useToast } from "../ToastProvider";
import { useConfirm } from "../ConfirmProvider";
import { getInitials, isImageUrl, profilePath, withoutAt } from "../../services/people";
import { TimeAgo } from "../social/TimeAgo";
import { RichText } from "../social/RichText";

/**
 * A conversa em volta do evento: curtida, comentário e a lista de quem vai.
 *
 * Por que isto existe, se já havia "confirmar presença": confirmar é a
 * resposta mais cara que alguém dá — é dizer que vai gastar o sábado. A
 * página não tinha nenhum degrau antes disso. Quem não decidiu não tinha o
 * que fazer ali, e quem organizava não tinha como responder a uma pergunta
 * ("tem estacionamento?", "pode levar criança?") sem mandar a pessoa para o
 * WhatsApp. Curtir e comentar são esse degrau.
 *
 * Decisões:
 *
 *  - **Um botão de curtir, não um placar.** O número fica ao lado e some
 *    quando é zero: evento recém-criado com "0 curtidas" em letra garrafal
 *    parece evento fracassado, e o primeiro cartaz do rolê não merece isso.
 *  - **A lista de quem vai é para quem tem conta.** Mesma regra da tabela
 *    (20261025163000): quem chega sem login vê QUANTOS vão, não QUEM vai.
 *    Presença é endereço e dia — isso não é vitrine.
 *  - **Quem organiza apaga qualquer comentário.** Quem comentou apaga o
 *    dele. Quem decide isso é o banco; aqui só escondemos o botão.
 *  - **Nada fica preso esperando a rede.** Curtida acende na hora e volta
 *    atrás se o servidor recusar: o toque é o que a pessoa sente.
 */

const avatarDe = (pessoa) => pessoa?.avatar || pessoa?.avatarInitials || "";

function Retrato({ pessoa, nome, tamanho = "h-9 w-9" }) {
  const imagem = avatarDe(pessoa);
  return (
    <span
      className={`flex ${tamanho} shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--engine-accent)] text-xs font-black italic text-white`}
    >
      {isImageUrl(imagem) ? (
        <img src={imagem} alt={nome} className="h-full w-full object-cover" />
      ) : (
        getInitials(nome)
      )}
    </span>
  );
}

/**
 * A faixa de reações: curtir, ir para os comentários, quantos vão.
 *
 * Fica logo abaixo das fotos, onde a pessoa termina de olhar o evento — e
 * não no fim da página, que é onde ninguém chega.
 */
export function EventReactions({ event, eventId, comentarios, participantes, onIrParaComentarios }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const showToast = useToast();

  const [curtido, setCurtido] = useState(false);
  const [total, setTotal] = useState(Number(event?.likeCount) || 0);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    engineEvents
      .countLikes(eventId)
      .then((n) => vivo && setTotal(n))
      .catch(() => {});
    engineEvents
      .hasLiked(eventId)
      .then((v) => vivo && setCurtido(v))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [eventId]);

  const curtir = async () => {
    if (!auth.currentUser) {
      navigate(authPath("/login", `/events/${eventId}`));
      return;
    }
    if (ocupado) return;

    // Acende primeiro: o toque é o que a pessoa sente, e a rede é detalhe.
    const antes = curtido;
    setCurtido(!antes);
    setTotal((n) => Math.max(0, n + (antes ? -1 : 1)));
    setOcupado(true);
    try {
      await engineEvents.toggleLike(eventId, antes);
    } catch (erro) {
      setCurtido(antes);
      setTotal((n) => Math.max(0, n + (antes ? 1 : -1)));
      showToast(erro.message || t("events.social.likeError"), "error");
    } finally {
      setOcupado(false);
    }
  };

  const botao =
    "flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold transition";

  return (
    <div className="engine-card flex flex-wrap items-center gap-1 px-3 py-2">
      <button
        type="button"
        onClick={curtir}
        aria-pressed={curtido}
        aria-label={t(curtido ? "events.social.likedAction" : "events.social.likeAction")}
        className={`${botao} ${
          curtido
            ? "text-[var(--engine-accent)]"
            : "text-[var(--engine-text-muted)] hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
        }`}
      >
        <Heart size={20} fill={curtido ? "currentColor" : "none"} />
        {/* Zero não aparece: cartaz novo não precisa anunciar que ninguém
            curtiu ainda. */}
        {total > 0 ? <span>{total}</span> : null}
        <span className="sr-only">{t("events.social.likes", { count: total })}</span>
      </button>

      <button
        type="button"
        onClick={onIrParaComentarios}
        className={`${botao} text-[var(--engine-text-muted)] hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]`}
      >
        <MessageCircle size={20} />
        {comentarios > 0 ? <span>{comentarios}</span> : null}
        <span className="sr-only">{t("events.social.comments", { count: comentarios })}</span>
      </button>

      <span className="ml-auto flex items-center gap-2 px-2 text-sm font-semibold text-[var(--engine-text-muted)]">
        <Users size={18} />
        {t("events.confirmed", { count: participantes || 0 })}
      </span>
    </div>
  );
}

/**
 * Quem confirmou presença, com o carro que disse que vai levar — a resposta
 * da pergunta que todo mundo faz antes de ir ("quem mais vai estar lá?").
 * A lista existia no banco desde o começo e nunca tinha aparecido na tela.
 */
export function EventGoing({ eventId, total }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [gente, setGente] = useState([]);
  const [carregando, setCarregando] = useState(Boolean(auth.currentUser));

  useEffect(() => {
    if (!auth.currentUser) return undefined;
    let vivo = true;
    engineEvents
      .getEventParticipants(eventId)
      .then((lista) => vivo && setGente(lista))
      .catch(() => vivo && setGente([]))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [eventId]);

  if (!auth.currentUser) {
    return (
      <div className="engine-card space-y-3 p-6">
        <h2 className="font-bold text-[var(--engine-text)]">{t("events.social.goingHeading")}</h2>
        <p className="text-sm font-semibold text-[var(--engine-text-muted)]">
          {t("events.confirmed", { count: total || 0 })}
        </p>
        <button
          type="button"
          onClick={() => navigate(authPath("/login", `/events/${eventId}`))}
          className="text-sm font-bold text-[var(--engine-accent)] hover:underline"
        >
          {t("events.social.goingSignIn")}
        </button>
      </div>
    );
  }

  return (
    <div className="engine-card space-y-3 p-6">
      <h2 className="font-bold text-[var(--engine-text)]">{t("events.social.goingHeading")}</h2>

      {carregando ? (
        <Loader2 size={20} className="animate-spin text-[var(--engine-text-muted)]" />
      ) : !gente.length ? (
        <p className="text-sm font-semibold text-[var(--engine-text-muted)]">
          {t("events.social.goingEmpty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {gente.map((pessoa) => {
            const nome = pessoa.displayName || t("events.social.noCar");
            const usuario = withoutAt(pessoa.username || "");
            const carro = [pessoa.carDetails?.brand, pessoa.carDetails?.model, pessoa.carDetails?.year]
              .filter(Boolean)
              .join(" ");
            return (
              <li key={pessoa.uid} className="flex items-center gap-3">
                <Retrato pessoa={pessoa} nome={nome} />
                <div className="min-w-0">
                  {usuario ? (
                    <button
                      type="button"
                      onClick={() => navigate(profilePath(usuario))}
                      className="block truncate text-sm font-bold text-[var(--engine-text)] hover:text-[var(--engine-accent)]"
                    >
                      {nome}
                    </button>
                  ) : (
                    <p className="truncate text-sm font-bold text-[var(--engine-text)]">{nome}</p>
                  )}
                  <p className="truncate text-xs font-semibold text-[var(--engine-text-muted)]">
                    {carro || t("events.social.noCar")}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Comentários do evento. Lista + caixa de escrever, nessa ordem: aqui o que
 * importa é LER o que já perguntaram antes de perguntar de novo.
 */
export function EventComments({ eventId, event, comentarios, onMudou, ancora }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const showToast = useToast();
  const confirmar = useConfirm();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const caixa = useRef(null);

  const uid = auth.currentUser?.uid || "";
  const souOrganizador = Boolean(uid) && uid === event?.createdBy;

  const enviar = useCallback(
    async (evento) => {
      evento.preventDefault();
      if (!auth.currentUser) {
        navigate(authPath("/login", `/events/${eventId}`));
        return;
      }
      const limpo = texto.trim();
      if (!limpo || enviando) return;

      setEnviando(true);
      try {
        await engineEvents.addComment(eventId, limpo);
        setTexto("");
        await onMudou?.();
      } catch (erro) {
        showToast(erro.message || t("events.social.commentError"), "error");
      } finally {
        setEnviando(false);
      }
    },
    [eventId, enviando, navigate, onMudou, showToast, t, texto],
  );

  const apagar = async (comentario) => {
    const ok = await confirmar({
      title: t("events.social.deleteComment"),
      message: t("events.social.deleteCommentConfirm"),
      confirmLabel: t("events.social.deleteComment"),
    });
    if (!ok) return;
    try {
      await engineEvents.deleteComment(eventId, comentario.id);
      showToast(t("events.social.commentDeleted"), "success");
      await onMudou?.();
    } catch (erro) {
      showToast(erro.message || t("events.social.commentError"), "error");
    }
  };

  return (
    <div ref={ancora} className="engine-card space-y-4 p-6 scroll-mt-24">
      <div className="flex items-center gap-2">
        <MessageCircle size={20} className="text-[var(--engine-accent)]" />
        <h2 className="font-bold text-[var(--engine-text)]">
          {t("events.social.commentsHeading")}
        </h2>
        {comentarios.length ? (
          <span className="text-sm font-semibold text-[var(--engine-text-muted)]">
            {t("events.social.comments", { count: comentarios.length })}
          </span>
        ) : null}
      </div>

      {comentarios.length ? (
        <ul className="space-y-4">
          {comentarios.map((comentario) => {
            const nome = comentario.author || "Engine";
            const usuario = withoutAt(comentario.username || "");
            const posso = souOrganizador || comentario.userId === uid;
            return (
              <li key={comentario.id} className="flex gap-3">
                <Retrato pessoa={comentario} nome={nome} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {usuario ? (
                      <button
                        type="button"
                        onClick={() => navigate(profilePath(usuario))}
                        className="truncate text-sm font-bold text-[var(--engine-text)] hover:text-[var(--engine-accent)]"
                      >
                        {nome}
                      </button>
                    ) : (
                      <span className="truncate text-sm font-bold text-[var(--engine-text)]">
                        {nome}
                      </span>
                    )}
                    <TimeAgo
                      value={comentario.createdAt}
                      short
                      className="shrink-0 text-xs font-semibold text-[var(--engine-text-subtle)]"
                    />
                    {posso ? (
                      <button
                        type="button"
                        onClick={() => apagar(comentario)}
                        aria-label={t("events.social.deleteComment")}
                        title={t("events.social.deleteComment")}
                        className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--engine-text-subtle)] transition hover:bg-[var(--engine-surface-2)] hover:text-red-500"
                      >
                        <Trash2 size={16} />
                      </button>
                    ) : null}
                  </div>
                  <RichText
                    text={comentario.text || ""}
                    className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--engine-text-muted)]"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm font-semibold text-[var(--engine-text-muted)]">
          {t("events.social.empty")}
        </p>
      )}

      {auth.currentUser ? (
        <form onSubmit={enviar} className="flex items-end gap-2 border-t border-[var(--engine-border)] pt-4">
          <textarea
            ref={caixa}
            value={texto}
            onChange={(evento) => setTexto(evento.target.value.slice(0, 300))}
            placeholder={t("events.social.commentPlaceholder")}
            rows={2}
            className="min-h-11 w-full resize-none rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 py-3 text-[var(--engine-text)] placeholder-[var(--engine-text-subtle)] outline-none transition-colors focus:border-[var(--engine-accent)]"
          />
          <button
            type="submit"
            disabled={enviando || !texto.trim()}
            aria-label={t("events.social.send")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent)] text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {enviando ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => navigate(authPath("/login", `/events/${eventId}`))}
          className="w-full rounded-xl border border-[var(--engine-border)] px-4 py-3 text-sm font-bold text-[var(--engine-text)] transition hover:bg-[var(--engine-surface-2)]"
        >
          {t("events.social.loginToComment")}
        </button>
      )}
    </div>
  );
}
