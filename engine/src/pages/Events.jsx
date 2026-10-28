import { useCallback, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Loader2, CalendarCheck } from "lucide-react";
import { SubTabsHeader } from "../components/community/SubTabsHeader";
import { engineEvents } from "../services/events";
import { EventCard } from "../components/EventCard";
import { CreateEventForm } from "../components/CreateEventForm";
import { useToast } from "../components/ToastProvider";
import { getStates } from "../services/locations";
import { eventTypeOptions } from "../services/eventTypes";
import { getClub } from "../services/clubs";
import { authPath } from "../services/authRedirect";

const inputClass =
  "w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 py-3 text-[var(--engine-text)] placeholder-[var(--engine-text-subtle)] outline-none transition-colors focus:border-[var(--engine-accent)]";

const labelClass =
  "text-[10px] font-bold uppercase tracking-widest text-[var(--engine-text-muted)]";



/**
 * `embedded` — a mesma tela servida como aba de Comunidade (?tab=eventos). Lá a
 * barra de abas já diz onde a pessoa está, então o título e o subtítulo daqui
 * seriam eco. A rota /events segue usando a forma completa.
 *
 * O cabeçalho segue o padrão da aba Clubes (pedido do Murilo em 19/09/2026):
 * sub-abas "Meus eventos · Descobrir" numa linha com o botão compacto de
 * criar à direita. Antes era um botão largo "Criar Evento" seguido de um
 * cartão inteiro de filtros, e as duas abas vizinhas falavam línguas
 * diferentes. Os filtros continuam existindo, mas como uma linha dentro de
 * Descobrir, que é onde eles fazem sentido.
 *
 * Visitante sem login não tem "Meus eventos": a sub-aba some e Descobrir vira
 * a única, igual ao que ele consegue fazer.
 */
export function Events({ embedded = false, user = null }) {
  const { t } = useTranslation();
  const showToast = useToast();

  const signedIn = Boolean(user?.uid);
  const [subTab, setSubTab] = useState(signedIn ? "mine" : "discover");
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [filters, setFilters] = useState({
    type: "all",
    state: "all",
  });

  const activeTab = signedIn ? subTab : "discover";
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Clube que marcou o encontro (`/events?create=1&club=<id>`, vindo da
  // página do clube). Buscado pelo id: a sigla não pode vir da URL.
  const [createClub, setCreateClub] = useState(null);

  // Visitante: criar evento leva ao login e volta para cá (antes ele
  // preenchia tudo e só no envio recebia "Usuário não autenticado").
  const openCreate = useCallback(() => {
    if (!signedIn) {
      navigate(authPath("/login", "/events?create=1"));
      return;
    }
    setShowCreateForm(true);
  }, [navigate, signedIn]);

  const wantsCreate = searchParams.get("create") === "1";
  const createClubId = wantsCreate ? searchParams.get("club") || "" : "";
  useEffect(() => {
    if (!wantsCreate) return undefined;
    let alive = true;
    (async () => {
      let club = null;
      if (createClubId && signedIn) {
        try {
          const found = await getClub(createClubId);
          if (found && ["founder", "captain"].includes(found.myRole)) {
            club = { id: found.id, tag: found.tag, name: found.name };
          }
        } catch {
          club = null;
        }
      }
      if (!alive) return;
      const params = new URLSearchParams(searchParams);
      params.delete("create");
      params.delete("club");
      setSearchParams(params, { replace: true });
      setCreateClub(club);
      openCreate();
    })();
    return () => {
      alive = false;
    };
  }, [wantsCreate, createClubId, signedIn, searchParams, setSearchParams, openCreate]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === "mine") {
        setEvents(await engineEvents.getMyEvents({ limit: 50 }));
        return;
      }
      const filterParams = {
        type: filters.type === "all" ? null : filters.type,
        state: filters.state === "all" ? null : filters.state,
        limit: 50,
      };

      const result = await engineEvents.getUpcomingEvents(filterParams);
      setEvents(result);
    } catch (error) {
      showToast(error.message || t("events.toast.loadError"), "error");
    } finally {
      setLoading(false);
    }
  }, [activeTab, filters, showToast, t]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // O toast de "criado" já sai do formulário: aqui saía o segundo.
  const handleCreateSuccess = () => {
    setShowCreateForm(false);
    setCreateClub(null);
    loadEvents();
  };

  return (
    <div className={embedded ? "space-y-5" : "space-y-8"}>
      {!embedded && (
        <div>
          <h1 className="text-3xl font-bold text-[var(--engine-text)] sm:text-4xl">
            {t("events.title")}
          </h1>
          <p className="text-[var(--engine-text-muted)] mt-2">
            {t("events.subtitle")}
          </p>
        </div>
      )}

      <SubTabsHeader
        tabs={[
          signedIn && { id: "mine", label: t("events.tabs.mine") },
          { id: "discover", label: t("events.tabs.discover") },
        ].filter(Boolean)}
        active={activeTab}
        onChange={setSubTab}
        createLabel={t("events.create")}
        createShortLabel={t("events.createShort")}
        onCreate={openCreate}
      />

      {/* Filtros: só em Descobrir, e como linha, não como cartão. */}
      {activeTab === "discover" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={labelClass}>{t("events.filters.type")}</label>
            <select
              value={filters.type}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  type: e.target.value,
                }))
              }
              className={inputClass}
            >
              {eventTypeOptions(t, { withAll: true }).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>{t("events.filters.state")}</label>
            <select
              value={filters.state}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  state: e.target.value,
                }))
              }
              className={inputClass}
            >
              <option value="all">{t("events.filters.all")}</option>
              {getStates("BR").map((state) => (
                <option key={state.code} value={state.code}>
                  {state.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Eventos */}
      {loading ? (
        <div className="text-center py-20">
          <Loader2 size={48} className="mx-auto text-[var(--engine-accent)] animate-spin mb-4" />
          <p className="text-[var(--engine-text-muted)]">{t("events.loading")}</p>
        </div>
      ) : events.length === 0 && activeTab === "mine" ? (
        <div className="text-center py-8 rounded-xl bg-[var(--engine-surface)] border border-[var(--engine-border)]">
          <CalendarCheck size={40} className="mx-auto text-[var(--engine-text-muted)] mb-3" />
          <p className="text-sm font-semibold text-[var(--engine-text)] mb-2">
            {t("events.mineEmptyTitle")}
          </p>
          <p className="text-xs text-[var(--engine-text-muted)] mb-4">
            {t("events.mineEmptyCopy")}
          </p>
          <button
            type="button"
            onClick={() => setSubTab("discover")}
            className="inline-flex min-h-11 items-center gap-2 px-4 py-2 bg-[var(--engine-accent)] text-white rounded-lg font-semibold hover:opacity-90 transition text-sm"
          >
            {t("events.mineDiscover")}
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-20 engine-card p-8">
          <p className="text-lg font-semibold text-[var(--engine-text)] mb-2">
            {t("events.emptyTitle")}
          </p>
          <p className="text-[var(--engine-text-muted)] mb-6">
            {t("events.emptyCopy")}
          </p>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--engine-accent)] text-white rounded-xl font-semibold hover:opacity-90 transition"
          >
            <Plus size={20} />
            {t("events.create")}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {showCreateForm && (
        <CreateEventForm
          club={createClub}
          onSuccess={handleCreateSuccess}
          onCancel={() => {
            setShowCreateForm(false);
            setCreateClub(null);
          }}
        />
      )}
    </div>
  );
}
