import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Bell, CheckCheck, ChevronRight, X } from "lucide-react";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useHistoryDismiss } from "../hooks/useHistoryDismiss";
import {
  defaultNotificationStyle,
  formatNotificationTime,
  getNotificationCopy,
  getNotificationTarget,
  notificationStyles,
} from "../services/notifications";
import { achievementName } from "./achievements/icons";

/**
 * Central de notificações.
 *
 * Em vez do dropdown que cobria a tela no celular, segue o padrão de
 * "notification drawer": no desktop é um painel de ~380px ancorado à direita
 * (o conteúdo da página continua visível ao lado); abaixo de sm vira um
 * bottom sheet, com pegador, arrastar para baixo, toque no fundo e botão X
 * para fechar — as três saídas que as guidelines de mobile recomendam.
 */
export function NotificationsPanel({
  open,
  notifications = [],
  unreadCount = 0,
  onClose,
  onSelect,
  onMarkAllRead,
}) {
  const { t, i18n } = useTranslation();
  const isSheet = useMediaQuery("(max-width: 639px)");
  const [dragOffset, setDragOffset] = useState(0);
  const dragStart = useRef(null);

  // Quarta saída, a que o Android espera: o gesto de voltar fecha a folha.
  useHistoryDismiss(open, onClose);

  // Esc fecha e a página de trás para de rolar enquanto o painel está aberto.
  useEffect(() => {
    if (!open) return undefined;

    // Esc agora vem do useHistoryDismiss (um ouvinte só, fecha o topo).
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const handleTouchStart = (event) => {
    if (!isSheet) return;
    dragStart.current = event.touches[0].clientY;
  };

  const handleTouchMove = (event) => {
    if (dragStart.current === null) return;
    setDragOffset(Math.max(0, event.touches[0].clientY - dragStart.current));
  };

  const handleTouchEnd = () => {
    if (dragOffset > 90) onClose();
    dragStart.current = null;
    setDragOffset(0);
  };

  return createPortal(
    <>
      <div
        className="engine-drawer-scrim"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t("notifications.title")}
        className="engine-drawer"
        style={
          dragOffset
            ? { transform: `translateY(${dragOffset}px)`, transition: "none" }
            : undefined
        }
      >
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="shrink-0 border-b border-[var(--engine-border)]"
        >
          <div className="flex justify-center pt-2 sm:hidden">
            <span className="h-1 w-10 rounded-full bg-[var(--engine-border-strong)]" />
          </div>

          <div className="flex items-start justify-between gap-3 px-4 py-3.5 sm:px-5 sm:py-4">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--engine-accent)]">
                {t("notifications.title")}
              </p>
              <p className="mt-1 text-xs font-semibold text-[var(--engine-text-subtle)]">
                {unreadCount
                  ? t("notifications.unread", { count: unreadCount })
                  : t("notifications.allRead")}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  title={t("notifications.markAllRead")}
                  aria-label={t("notifications.markAllRead")}
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)]"
                >
                  <CheckCheck size={19} />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                title={t("notifications.close")}
                aria-label={t("notifications.close")}
                /* 44x44 nos dois botões do cabeçalho: mediam 40x40. */
                className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition-colors hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-text)]"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>

        <div className="engine-scroll engine-safe-bottom min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {notifications.length ? (
            notifications.slice(0, 30).map((notification) => {
              const style =
                notificationStyles[notification.type] || defaultNotificationStyle;
              const Icon = style.icon;
              const createdAt = formatNotificationTime(notification.createdAt);
              const copy = getNotificationCopy(notification, t, (id) =>
                achievementName(t, i18n.language, id),
              );
              const target = getNotificationTarget(notification);

              return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => onSelect(notification)}
                  className={`relative flex w-full gap-3 border-b border-[var(--engine-border)] px-4 py-3.5 text-left transition-colors last:border-0 hover:bg-[var(--engine-surface-2)] sm:px-5 ${
                    notification.read ? "" : "bg-[var(--engine-accent-soft)]"
                  }`}
                >
                  {!notification.read && (
                    <span className="absolute left-0 top-0 h-full w-0.5 bg-[var(--engine-accent)]" />
                  )}

                  <span className="mt-0.5 shrink-0">
                    <Icon className={style.iconClass} size={18} strokeWidth={2} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span
                        className={`min-w-0 truncate text-sm ${
                          notification.read
                            ? "font-semibold text-[var(--engine-text-muted)]"
                            : "font-extrabold text-[var(--engine-text)]"
                        }`}
                      >
                        {copy.title}
                      </span>
                      {createdAt && (
                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[var(--engine-text-subtle)]">
                          {createdAt}
                        </span>
                      )}
                    </span>

                    <span className="mt-1 block text-[13px] font-medium leading-5 text-[var(--engine-text-muted)]">
                      {copy.body}
                    </span>

                    {notification.goalTitle && !notification.moderationNote && (
                      <span className="mt-1 block truncate text-xs font-semibold text-[var(--engine-text-subtle)]">
                        {notification.goalTitle}
                      </span>
                    )}

                    {notification.moderationNote && (
                      <span className="mt-2 block border-l-2 border-[var(--engine-accent)]/50 bg-[var(--engine-accent-soft)] px-3 py-2">
                        <span className="block text-[9px] font-black uppercase tracking-[0.16em] text-[var(--engine-accent)]">
                          {t("notifications.adminNote")}
                        </span>
                        <span className="mt-1 block text-xs font-semibold leading-5 text-[var(--engine-text-muted)]">
                          {notification.moderationNote}
                        </span>
                      </span>
                    )}

                    {target && (
                      <span className="mt-2 flex items-center gap-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--engine-text-subtle)]">
                        {t("notifications.open")}
                        <ChevronRight size={12} />
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          ) : (
            <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--engine-border)] text-[var(--engine-text-subtle)]">
                <Bell size={20} />
              </div>
              <p className="mt-4 text-sm font-bold text-[var(--engine-text)]">
                {t("notifications.empty")}
              </p>
              <p className="mt-2 max-w-xs text-xs font-medium leading-5 text-[var(--engine-text-muted)]">
                {t("notifications.emptyHint")}
              </p>
            </div>
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}
