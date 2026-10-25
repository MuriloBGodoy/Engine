import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Flag, MessageSquare, Pencil, Star, Trash2 } from "lucide-react";
import { useToast } from "../ToastProvider";
import { useConfirm } from "../ConfirmProvider";
import {
  REVIEW_COMMENT_MAX,
  REVIEW_MIN_ACCOUNT_AGE_HOURS,
  REVIEW_REPLY_MAX,
  accountTooNewToReview,
  deleteMyServiceReview,
  getMyServiceReview,
  getServiceReviewDistribution,
  listServiceReviews,
  listingRating,
  replyToServiceReview,
  reportServiceReview,
  saveServiceReview,
} from "../../services/serviceReviews";

/**
 * Avaliações de um anúncio de serviço: resumo (média, contagem, barras por
 * estrela), formulário, lista paginada, resposta do dono e denúncia.
 *
 *   <ServiceReviews listing={listing} user={user} />
 *   <ServiceRatingBadge listing={listing} />   // selo pequeno para o card
 *
 * `listing` é o objeto de `engineDB` (precisa de `id` e `ownerId`; usa
 * `ratingCount`/`ratingAvg` enquanto o resumo do banco não chega). `user` é o
 * usuário do app, ou null para visitante.
 *
 * As regras (uma por pessoa, dono não avalia, conta nova, limite diário, só a
 * moderação oculta) estão no banco. A tela só antecipa o aviso.
 */

const BUTTON_BASE =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--engine-ring)] disabled:cursor-not-allowed disabled:opacity-50";
const BUTTON_PRIMARY = `${BUTTON_BASE} bg-[var(--engine-accent)] text-white hover:opacity-90`;
const BUTTON_GHOST = `${BUTTON_BASE} border border-[var(--engine-border)] bg-[var(--engine-surface)] text-[var(--engine-text)] hover:bg-[var(--engine-surface-2)]`;
const BUTTON_LINK =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-[var(--engine-text-muted)] transition hover:text-[var(--engine-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--engine-ring)]";

const formatAverage = (value, language) =>
  new Intl.NumberFormat(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);

const formatDate = (value, language) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(date);
};

/** Estrelas só de leitura. A nota vai no rótulo; o desenho é decorativo. */
function StarRow({ value = 0, size = 16, label }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => {
        const full = rounded >= star;
        const half = !full && rounded >= star - 0.5;
        return (
          <span key={star} className="relative inline-flex" aria-hidden="true">
            <Star size={size} className="text-[var(--engine-border-strong)]" />
            {(full || half) && (
              <span className={`absolute inset-0 overflow-hidden ${half ? "w-1/2" : "w-full"}`}>
                <Star size={size} className="fill-amber-400 text-amber-400" />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** Selo pequeno de média para o card do serviço. Sem avaliação, não aparece. */
export function ServiceRatingBadge({ listing, className = "" }) {
  const { t, i18n } = useTranslation();
  const { count, average } = listingRating(listing);
  if (!count || average == null) return null;
  const value = formatAverage(average, i18n.language);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-[var(--engine-surface-2)] px-2 py-0.5 text-xs font-bold text-[var(--engine-text)] ${className}`}
      title={t("serviceReviews.badge", { value, count })}
    >
      <Star size={12} aria-hidden="true" className="fill-amber-400 text-amber-400" />
      <span aria-hidden="true">{value}</span>
      <span aria-hidden="true" className="font-semibold text-[var(--engine-text-subtle)]">
        ({count})
      </span>
      <span className="sr-only">{t("serviceReviews.badge", { value, count })}</span>
    </span>
  );
}

/**
 * Escolha de nota acessível: rádios nativos (setas do teclado de graça), cada
 * estrela com 44px de alvo.
 */
function StarInput({ value, onChange, disabled }) {
  const { t } = useTranslation();
  const name = useId();
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-1 text-sm font-bold text-[var(--engine-text)]">
        {t("serviceReviews.form.ratingLegend")}
      </legend>
      <div className="flex items-center" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((star) => (
          <label
            key={star}
            className="relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg"
            onMouseEnter={() => setHover(star)}
          >
            <input
              type="radio"
              name={name}
              value={star}
              checked={value === star}
              onChange={() => onChange(star)}
              className="peer sr-only"
            />
            <span className="sr-only">{t("serviceReviews.starsLabel", { count: star })}</span>
            <Star
              size={28}
              aria-hidden="true"
              className={`rounded transition peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--engine-ring)] ${
                shown >= star ? "fill-amber-400 text-amber-400" : "text-[var(--engine-border-strong)]"
              }`}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ReviewForm({ initial, onSubmit, onCancel, saving }) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(initial?.rating || 0);
  const [comment, setComment] = useState(initial?.comment || "");
  const [touched, setTouched] = useState(false);
  const commentId = useId();
  const hintId = useId();
  const isEdit = Boolean(initial?.id);

  return (
    <form
      className="space-y-3 rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!rating) return;
        onSubmit({ rating, comment });
      }}
    >
      <h3 className="text-base font-black text-[var(--engine-text)]">
        {isEdit ? t("serviceReviews.form.editTitle") : t("serviceReviews.form.title")}
      </h3>
      <StarInput value={rating} onChange={setRating} disabled={saving} />
      {touched && !rating && (
        <p role="alert" className="text-xs font-semibold text-[var(--engine-accent)]">
          {t("serviceReviews.form.pickRating")}
        </p>
      )}
      <div>
        <label htmlFor={commentId} className="mb-1 block text-sm font-bold text-[var(--engine-text)]">
          {t("serviceReviews.form.commentLabel")}
        </label>
        <textarea
          id={commentId}
          aria-describedby={hintId}
          value={comment}
          maxLength={REVIEW_COMMENT_MAX}
          rows={4}
          disabled={saving}
          onChange={(event) => setComment(event.target.value)}
          placeholder={t("serviceReviews.form.commentPlaceholder")}
          className="w-full resize-y rounded-xl border border-[var(--engine-border)] bg-[var(--engine-bg)] p-3 text-sm text-[var(--engine-text)] placeholder:text-[var(--engine-text-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--engine-ring)]"
        />
        <div id={hintId} className="mt-1 flex justify-between gap-2 text-xs text-[var(--engine-text-subtle)]">
          <span>{t("serviceReviews.form.honesty")}</span>
          <span>{t("serviceReviews.form.chars", { count: comment.length, max: REVIEW_COMMENT_MAX })}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={BUTTON_PRIMARY} disabled={saving}>
          {saving
            ? t("serviceReviews.form.saving")
            : isEdit
              ? t("serviceReviews.form.save")
              : t("serviceReviews.form.submit")}
        </button>
        {onCancel && (
          <button type="button" className={BUTTON_GHOST} onClick={onCancel} disabled={saving}>
            {t("serviceReviews.form.cancel")}
          </button>
        )}
      </div>
    </form>
  );
}

function ReplyForm({ initial, onSubmit, onCancel, saving }) {
  const { t } = useTranslation();
  const [text, setText] = useState(initial || "");
  const fieldId = useId();
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(text);
      }}
    >
      <label htmlFor={fieldId} className="sr-only">
        {t("serviceReviews.item.reply")}
      </label>
      <textarea
        id={fieldId}
        value={text}
        maxLength={REVIEW_REPLY_MAX}
        rows={3}
        disabled={saving}
        onChange={(event) => setText(event.target.value)}
        placeholder={t("serviceReviews.item.replyPlaceholder")}
        className="w-full resize-y rounded-xl border border-[var(--engine-border)] bg-[var(--engine-bg)] p-3 text-sm text-[var(--engine-text)] placeholder:text-[var(--engine-text-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--engine-ring)]"
      />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={BUTTON_PRIMARY} disabled={saving || !text.trim()}>
          {saving ? t("serviceReviews.form.saving") : t("serviceReviews.item.sendReply")}
        </button>
        <button type="button" className={BUTTON_GHOST} onClick={onCancel} disabled={saving}>
          {t("serviceReviews.form.cancel")}
        </button>
      </div>
    </form>
  );
}

function ReviewItem({ review, isOwner, isMine, canReport, onReply, onReport, busy }) {
  const { t, i18n } = useTranslation();
  const [replying, setReplying] = useState(false);
  const profile = review.authorProfile;
  const name = isMine
    ? t("serviceReviews.item.you")
    : profile?.author || (profile?.username ? `@${String(profile.username).replace(/^@/, "")}` : "") ||
      t("serviceReviews.item.anonymous");

  return (
    <li className="border-b border-[var(--engine-border)] py-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[var(--engine-text)]">{name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--engine-text-subtle)]">
            <StarRow value={review.rating} size={14} label={t("serviceReviews.starsLabel", { count: review.rating })} />
            <time dateTime={review.createdAt}>{formatDate(review.createdAt, i18n.language)}</time>
            {review.edited && <span>· {t("serviceReviews.item.edited")}</span>}
          </div>
        </div>
        {canReport && (
          <button type="button" className={BUTTON_LINK} onClick={() => onReport(review)} disabled={busy}>
            <Flag size={14} aria-hidden="true" />
            {t("serviceReviews.item.report")}
          </button>
        )}
      </div>

      {review.comment && (
        <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-[var(--engine-text)]">
          {review.comment}
        </p>
      )}

      {review.ownerReply && !replying && (
        <div className="mt-3 rounded-xl border-l-2 border-[var(--engine-accent)] bg-[var(--engine-surface-2)] p-3">
          <p className="text-xs font-bold text-[var(--engine-text-muted)]">
            {t("serviceReviews.item.ownerReply")}
            {review.ownerReplyAt && (
              <span className="font-medium text-[var(--engine-text-subtle)]">
                {" · "}
                {formatDate(review.ownerReplyAt, i18n.language)}
              </span>
            )}
          </p>
          <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-[var(--engine-text)]">
            {review.ownerReply}
          </p>
        </div>
      )}

      {isOwner && !replying && (
        <div className="mt-1 flex flex-wrap gap-1">
          <button type="button" className={BUTTON_LINK} onClick={() => setReplying(true)} disabled={busy}>
            <MessageSquare size={14} aria-hidden="true" />
            {review.ownerReply ? t("serviceReviews.item.editReply") : t("serviceReviews.item.reply")}
          </button>
          {review.ownerReply && (
            <button type="button" className={BUTTON_LINK} onClick={() => onReply(review, "")} disabled={busy}>
              <Trash2 size={14} aria-hidden="true" />
              {t("serviceReviews.item.deleteReply")}
            </button>
          )}
        </div>
      )}
      {isOwner && replying && (
        <ReplyForm
          initial={review.ownerReply}
          saving={busy}
          onCancel={() => setReplying(false)}
          onSubmit={async (text) => {
            const ok = await onReply(review, text);
            if (ok) setReplying(false);
          }}
        />
      )}
    </li>
  );
}

export function ServiceReviews({ listing, user }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const listingId = listing?.id ? String(listing.id) : "";
  const uid = user?.uid || "";
  const isOwner = Boolean(uid && listing?.ownerId && uid === listing.ownerId);
  const tooNew = Boolean(uid && !isOwner && accountTooNewToReview(user));

  const [distribution, setDistribution] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [loadingMore, setLoadingMore] = useState(false);
  const [myReview, setMyReview] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");

  const errorText = useCallback(
    (error) => t(`serviceReviews.errors.${error?.code || "unknown"}`, t("serviceReviews.errors.unknown")),
    [t],
  );

  const load = useCallback(async () => {
    if (!listingId) return;
    setStatus("loading");
    try {
      const [dist, firstPage, mine] = await Promise.all([
        getServiceReviewDistribution(listingId),
        listServiceReviews(listingId, { page: 0 }),
        uid ? getMyServiceReview(listingId) : Promise.resolve(null),
      ]);
      setDistribution(dist);
      setReviews(firstPage.reviews);
      setHasMore(firstPage.hasMore);
      setPage(0);
      setMyReview(mine);
      setStatus("ready");
    } catch (error) {
      console.error("ServiceReviews load:", error);
      setStatus("error");
    }
  }, [listingId, uid]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const next = await listServiceReviews(listingId, { page: page + 1 });
      setReviews((current) => {
        const seen = new Set(current.map((review) => review.id));
        return [...current, ...next.reviews.filter((review) => !seen.has(review.id))];
      });
      setHasMore(next.hasMore);
      setPage(page + 1);
    } catch (error) {
      toast(errorText(error), "error");
    } finally {
      setLoadingMore(false);
    }
  };

  // Média e contagem: do resumo do banco quando chegou; antes, do anúncio.
  const summary = useMemo(() => {
    if (distribution) {
      const count = Object.values(distribution).reduce((sum, n) => sum + n, 0);
      const total = Object.entries(distribution).reduce((sum, [stars, n]) => sum + Number(stars) * n, 0);
      return { count, average: count ? total / count : null };
    }
    return listingRating(listing);
  }, [distribution, listing]);

  const submitReview = async ({ rating, comment }) => {
    setSaving(true);
    try {
      await saveServiceReview(listingId, { rating, comment, reviewId: myReview?.id || "" });
      toast(myReview ? t("serviceReviews.toast.updated") : t("serviceReviews.toast.saved"));
      setEditing(false);
      await load();
    } catch (error) {
      toast(errorText(error), "error");
      if (error?.code === "already-reviewed") await load();
    } finally {
      setSaving(false);
    }
  };

  const removeMine = async () => {
    if (!myReview) return;
    const ok = await confirm({
      title: t("serviceReviews.mine.confirmDeleteTitle"),
      message: t("serviceReviews.mine.confirmDeleteMessage"),
      confirmLabel: t("serviceReviews.mine.confirmDelete"),
      tone: "danger",
    });
    if (!ok) return;
    setSaving(true);
    try {
      await deleteMyServiceReview(myReview.id);
      toast(t("serviceReviews.toast.deleted"));
      setEditing(false);
      await load();
    } catch (error) {
      toast(errorText(error), "error");
    } finally {
      setSaving(false);
    }
  };

  const reply = async (review, text) => {
    setBusyId(review.id);
    try {
      const updated = await replyToServiceReview(review.id, text);
      setReviews((current) =>
        current.map((item) =>
          item.id === review.id
            ? { ...item, ownerReply: updated.ownerReply, ownerReplyAt: updated.ownerReplyAt }
            : item,
        ),
      );
      toast(text.trim() ? t("serviceReviews.toast.replied") : t("serviceReviews.toast.replyRemoved"));
      return true;
    } catch (error) {
      toast(errorText(error), "error");
      return false;
    } finally {
      setBusyId("");
    }
  };

  const report = async (review) => {
    const ok = await confirm({
      title: t("serviceReviews.item.reportTitle"),
      message: t("serviceReviews.item.reportMessage"),
      confirmLabel: t("serviceReviews.item.reportConfirm"),
      tone: "danger",
    });
    if (!ok) return;
    setBusyId(review.id);
    try {
      await reportServiceReview(review, isOwner ? "service_review:owner" : "service_review");
      toast(t("serviceReviews.toast.reported"));
    } catch (error) {
      toast(errorText(error), "error");
    } finally {
      setBusyId("");
    }
  };

  if (!listingId) return null;

  const countLabel = t("serviceReviews.count", { count: summary.count });
  const averageText = summary.average != null ? formatAverage(summary.average, i18n.language) : "";

  // O que aparece no lugar do formulário.
  let composer = null;
  if (!uid) {
    composer = (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--engine-border)] p-4">
        <p className="text-sm text-[var(--engine-text-muted)]">{t("serviceReviews.guest")}</p>
        <Link to="/login" className={BUTTON_PRIMARY}>
          {t("serviceReviews.guestCta")}
        </Link>
      </div>
    );
  } else if (isOwner) {
    composer = <p className="text-sm text-[var(--engine-text-muted)]">{t("serviceReviews.ownListing")}</p>;
  } else if (status === "ready" && myReview && !editing) {
    composer = (
      <div className="rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-black text-[var(--engine-text)]">{t("serviceReviews.mine.title")}</p>
            <StarRow value={myReview.rating} size={16} label={t("serviceReviews.starsLabel", { count: myReview.rating })} />
          </div>
          <div className="flex flex-wrap gap-1">
            <button type="button" className={BUTTON_LINK} onClick={() => setEditing(true)} disabled={saving}>
              <Pencil size={14} aria-hidden="true" />
              {t("serviceReviews.mine.edit")}
            </button>
            <button type="button" className={BUTTON_LINK} onClick={removeMine} disabled={saving}>
              <Trash2 size={14} aria-hidden="true" />
              {t("serviceReviews.mine.delete")}
            </button>
          </div>
        </div>
        {myReview.comment && (
          <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-[var(--engine-text)]">
            {myReview.comment}
          </p>
        )}
        {myReview.status === "hidden" && (
          <p className="mt-2 text-xs font-semibold text-[var(--engine-accent)]">{t("serviceReviews.mine.hidden")}</p>
        )}
      </div>
    );
  } else if (status === "ready" && (editing || !myReview)) {
    composer =
      tooNew && !myReview ? (
        <p className="text-sm text-[var(--engine-text-muted)]">
          {t("serviceReviews.tooNew", { hours: REVIEW_MIN_ACCOUNT_AGE_HOURS })}
        </p>
      ) : (
        <ReviewForm
          key={myReview?.id || "new"}
          initial={myReview}
          saving={saving}
          onSubmit={submitReview}
          onCancel={editing ? () => setEditing(false) : null}
        />
      );
  }

  return (
    <section aria-labelledby={`reviews-${listingId}`} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id={`reviews-${listingId}`} className="text-lg font-black text-[var(--engine-text)]">
          {t("serviceReviews.title")}
        </h2>
      </div>

      <div className="grid gap-4 rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-4 sm:grid-cols-[auto,1fr] sm:items-center">
        <div className="flex flex-col items-start gap-1 sm:items-center sm:pr-4">
          {summary.count > 0 ? (
            <>
              <p className="text-4xl font-black leading-none text-[var(--engine-text)]" aria-hidden="true">
                {averageText}
              </p>
              <StarRow value={summary.average} size={18} label={t("serviceReviews.average", { value: averageText })} />
              <p className="text-xs font-semibold text-[var(--engine-text-subtle)]">{countLabel}</p>
            </>
          ) : (
            <p className="text-sm font-bold text-[var(--engine-text-muted)]">{t("serviceReviews.noRating")}</p>
          )}
        </div>
        {distribution && summary.count > 0 && (
          <ul className="space-y-1">
            {[5, 4, 3, 2, 1].map((stars) => {
              const n = distribution[stars] || 0;
              const pct = summary.count ? Math.round((n / summary.count) * 100) : 0;
              return (
                <li key={stars} className="flex items-center gap-2 text-xs text-[var(--engine-text-muted)]">
                  <span className="sr-only">{`${t("serviceReviews.starsLabel", { count: stars })}: ${n}`}</span>
                  <span className="w-3 text-right font-bold" aria-hidden="true">
                    {stars}
                  </span>
                  <Star size={12} aria-hidden="true" className="fill-amber-400 text-amber-400" />
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--engine-surface-2)]" aria-hidden="true">
                    <span className="block h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="w-8 text-right tabular-nums" aria-hidden="true">
                    {n}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs leading-5 text-[var(--engine-text-subtle)]">
        {t("serviceReviews.disclaimer")}{" "}
        <Link to="/termos" className="font-semibold underline underline-offset-2 hover:text-[var(--engine-text)]">
          {t("serviceReviews.rulesLink")}
        </Link>
      </p>

      {composer}

      {status === "loading" && (
        <p className="text-sm text-[var(--engine-text-muted)]" role="status">
          {t("serviceReviews.loading")}
        </p>
      )}

      {status === "error" && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--engine-border)] p-4" role="alert">
          <p className="text-sm text-[var(--engine-text-muted)]">{t("serviceReviews.loadError")}</p>
          <button type="button" className={BUTTON_GHOST} onClick={load}>
            {t("serviceReviews.retry")}
          </button>
        </div>
      )}

      {status === "ready" && reviews.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--engine-border)] p-6 text-center">
          <p className="text-sm font-bold text-[var(--engine-text)]">{t("serviceReviews.empty")}</p>
          {!isOwner && <p className="mt-1 text-xs text-[var(--engine-text-muted)]">{t("serviceReviews.emptyCta")}</p>}
        </div>
      )}

      {status === "ready" && reviews.length > 0 && (
        <>
          <ul className="rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] px-4">
            {reviews.map((review) => (
              <ReviewItem
                key={review.id}
                review={review}
                isOwner={isOwner}
                isMine={review.authorId === uid}
                canReport={Boolean(uid) && review.authorId !== uid}
                onReply={reply}
                onReport={report}
                busy={busyId === review.id}
              />
            ))}
          </ul>
          {hasMore && (
            <button type="button" className={`${BUTTON_GHOST} w-full`} onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? t("serviceReviews.loading") : t("serviceReviews.loadMore")}
            </button>
          )}
        </>
      )}
    </section>
  );
}

export default ServiceReviews;
