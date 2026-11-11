import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Search as SearchIcon,
  X,
  Users,
  BriefcaseBusiness,
  Shield,
  CalendarDays,
  ChevronRight,
  MapPin,
} from "lucide-react";
import { engineDB } from "../services/db";
import { useProfileSearch } from "../hooks/useProfileSearch";
import { discoverClubs, clubImageUrl } from "../services/clubs";
import { engineEvents } from "../services/events";
import { profilePath } from "../services/people";
import { ListingPhoto } from "../components/services/ListingParts";
import {
  categoryIcons,
  getServiceCategoryLabel,
  serviceCategories,
} from "../services/serviceListingDisplay";

/**
 * Busca — a aba que entrou no lugar de Painel (11/11/2026).
 *
 * O motivo não é que faltava uma busca: Serviços e Comunidade já tinham a
 * sua. É que oito das 24 rotas do app não tinham porta de entrada no celular
 * — clubes, eventos, orçamentos, vitrine do carro, perfil de prestador,
 * produto, planos e anuncie só se alcançavam por link ou por dentro de outra
 * tela. Um campo que procura em tudo abre as oito de uma vez, e é o que toda
 * rede que a pessoa já usa põe na segunda aba.
 *
 * Sem termo a tela não fica em branco: mostra categoria de serviço, clube e
 * evento. Busca vazia é a melhor tela de descoberta que existe — quem não
 * sabe o nome do que procura precisa justamente de uma lista para tocar.
 *
 * Cada fonte tem o seu jeito: pessoa e clube consultam o servidor (com espera
 * de 300ms para não disparar a cada letra), serviço e evento já vêm inteiros
 * e são filtrados aqui mesmo, porque o volume de hoje cabe na memória.
 */

const semAcento = (texto) =>
  String(texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const ABAS = [
  { chave: "tudo", rotulo: "search.tabs.all" },
  { chave: "pessoas", rotulo: "search.tabs.people" },
  { chave: "servicos", rotulo: "search.tabs.services" },
  { chave: "clubes", rotulo: "search.tabs.clubs" },
  { chave: "eventos", rotulo: "search.tabs.events" },
];

/** Cabeçalho de seção com o "ver todos" à direita. */
function Secao({ icone, titulo, verTudo, children, vazio }) {
  const { t } = useTranslation();
  // Variável, e não prop renomeada no destructuring: o eslint do projeto não
  // conta uso em JSX quando o componente chega direto pelo parâmetro.
  const Icone = icone;
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Icone size={15} className="shrink-0 text-[var(--engine-accent)]" />
        <h2 className="min-w-0 flex-1 truncate text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-muted)]">
          {titulo}
        </h2>
        {verTudo && (
          <Link
            to={verTudo}
            className="flex shrink-0 items-center gap-0.5 text-[11px] font-extrabold text-[var(--engine-accent)]"
          >
            {t("search.seeAll")}
            <ChevronRight size={13} />
          </Link>
        )}
      </div>
      {vazio ? (
        <p className="text-[13px] font-medium text-[var(--engine-text-muted)]">{vazio}</p>
      ) : (
        <div className="space-y-1">{children}</div>
      )}
    </section>
  );
}

/** Linha de resultado: um toque inteiro, sem botão dentro. */
function Linha({ to, figura, titulo, linha2, direita }) {
  return (
    <Link
      to={to}
      className="-mx-2 flex min-h-[3.5rem] items-center gap-3 rounded-xl px-2 py-1.5 transition active:bg-[var(--engine-surface-2)] sm:hover:bg-[var(--engine-surface-2)]"
    >
      <span className="shrink-0">{figura}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-bold text-[var(--engine-text)]">
          {titulo}
        </span>
        {linha2 && (
          <span className="block truncate text-[12px] font-medium text-[var(--engine-text-muted)]">
            {linha2}
          </span>
        )}
      </span>
      {direita && <span className="shrink-0">{direita}</span>}
    </Link>
  );
}

const iniciais = (nome) =>
  String(nome || "?")
    .split(" ")
    .map((parte) => parte[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

function Avatar({ src, nome, quadrado = false }) {
  const classe = `flex h-11 w-11 items-center justify-center overflow-hidden bg-[var(--engine-accent)] text-[11px] font-black text-white ${
    quadrado ? "rounded-xl" : "rounded-full"
  }`;
  if (src) {
    return (
      <span className={classe}>
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      </span>
    );
  }
  return <span className={classe}>{iniciais(nome)}</span>;
}

export function Buscar() {
  const { t, i18n } = useTranslation();
  const [termo, setTermo] = useState("");
  const [aba, setAba] = useState("tudo");

  const limpo = termo.trim();
  const buscando = limpo.length >= 2;
  const alvo = semAcento(limpo);

  const pessoas = useProfileSearch(limpo, { enabled: buscando, max: 8 });

  // Serviços e eventos vêm inteiros e são filtrados aqui: são poucos, e um
  // filtro no navegador responde a cada letra sem ir ao servidor.
  const [servicos, setServicos] = useState([]);
  useEffect(
    () =>
      engineDB.subscribeServiceListings((todos) =>
        setServicos(
          (todos || []).filter(
            (item) => item.kind !== "product" && item.moderationStatus === "approved",
          ),
        ),
      ),
    [],
  );

  const [eventos, setEventos] = useState([]);
  useEffect(() => {
    let vivo = true;
    engineEvents
      .getUpcomingEvents({ limit: 30 })
      .then((lista) => {
        if (vivo) setEventos(lista || []);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  // Clube é consulta no servidor (nome e sigla), com espera para não disparar
  // a cada tecla.
  const [clubes, setClubes] = useState([]);
  useEffect(() => {
    let vivo = true;
    const timer = window.setTimeout(async () => {
      try {
        const achado = await discoverClubs({ search: buscando ? limpo : "", limit: 8 });
        const lista = [
          ...(achado.all || []),
          ...(achado.trending || []),
          ...(achado.nearby || []),
          ...(achado.forYourCar || []),
        ];
        const unicos = [];
        const vistos = new Set();
        for (const club of lista) {
          if (club?.id && !vistos.has(club.id)) {
            vistos.add(club.id);
            unicos.push(club);
          }
        }
        if (vivo) setClubes(unicos.slice(0, 8));
      } catch {
        if (vivo) setClubes([]);
      }
    }, 300);
    return () => {
      vivo = false;
      window.clearTimeout(timer);
    };
  }, [limpo, buscando]);

  const servicosAchados = useMemo(() => {
    if (!buscando) return [];
    return servicos
      .filter((item) =>
        semAcento(
          [
            item.title,
            item.providerName,
            item.city,
            item.serviceArea,
            getServiceCategoryLabel(item.category, t),
            ...(item.tags || []),
          ].join(" "),
        ).includes(alvo),
      )
      .slice(0, 8);
  }, [servicos, buscando, alvo, t]);

  const eventosAchados = useMemo(() => {
    const base = buscando
      ? eventos.filter((evento) =>
          semAcento([evento.title, evento.city, evento.state, evento.location].join(" ")).includes(
            alvo,
          ),
        )
      : eventos;
    return base.slice(0, buscando ? 8 : 3);
  }, [eventos, buscando, alvo]);

  const dataCurta = useCallback(
    (iso) => {
      if (!iso) return "";
      const data = new Date(iso);
      if (Number.isNaN(data.getTime())) return "";
      return data.toLocaleDateString(i18n.language || "pt-BR", {
        day: "2-digit",
        month: "short",
      });
    },
    [i18n.language],
  );

  const mostra = (secao) => aba === "tudo" || aba === secao;
  const nadaAchado =
    buscando &&
    !pessoas.length &&
    !servicosAchados.length &&
    !clubes.length &&
    !eventosAchados.length;

  return (
    <section className="space-y-5 pb-28 sm:pb-10">
      <div className="space-y-3">
        <h1 className="font-display text-xl font-extrabold tracking-tight text-[var(--engine-text)] sm:text-2xl">
          {t("search.title")}
        </h1>

        <label className="flex h-12 items-center gap-3 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 transition-colors focus-within:border-[var(--engine-accent)]">
          <SearchIcon size={18} className="shrink-0 text-[var(--engine-text-subtle)]" />
          <input
            value={termo}
            onChange={(event) => setTermo(event.target.value)}
            placeholder={t("search.placeholder")}
            type="search"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--engine-text)] outline-none placeholder:text-[var(--engine-text-subtle)]"
          />
          {termo && (
            <button
              type="button"
              onClick={() => setTermo("")}
              aria-label={t("common.clear")}
              className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--engine-text-muted)]"
            >
              <X size={16} />
            </button>
          )}
        </label>

        {buscando && (
          <div className="engine-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {ABAS.map((item) => (
              <button
                key={item.chave}
                type="button"
                aria-pressed={aba === item.chave}
                onClick={() => setAba(item.chave)}
                className={`h-9 shrink-0 rounded-full border px-3.5 text-xs font-bold transition ${
                  aba === item.chave
                    ? "border-[var(--engine-accent)] bg-[var(--engine-accent-soft)] text-[var(--engine-accent)]"
                    : "border-[var(--engine-border)] bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)]"
                }`}
              >
                {t(item.rotulo)}
              </button>
            ))}
          </div>
        )}
      </div>

      {!buscando && (
        <div className="space-y-6">
          <Secao icone={BriefcaseBusiness} titulo={t("search.sections.categories")} verTudo="/services">
            <div className="grid grid-cols-4 gap-x-2 gap-y-4 pt-1">
              {serviceCategories.slice(0, 8).map((item) => {
                const Icone = categoryIcons[item.value] || BriefcaseBusiness;
                return (
                  <Link
                    key={item.value}
                    to={`/services?cat=${encodeURIComponent(item.value)}`}
                    className="flex flex-col items-center gap-1.5 text-[10.5px] font-bold leading-tight text-[var(--engine-text-muted)]"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] text-[var(--engine-accent)]">
                      <Icone size={20} />
                    </span>
                    <span className="w-full text-center">{t(item.labelKey)}</span>
                  </Link>
                );
              })}
            </div>
          </Secao>

          <Secao
            icone={CalendarDays}
            titulo={t("search.sections.events")}
            verTudo="/events"
            vazio={eventosAchados.length ? "" : t("search.noEvents")}
          >
            {eventosAchados.map((evento) => (
              <Linha
                key={evento.id}
                to={`/events/${evento.id}`}
                figura={<Avatar src={evento.coverUrl || evento.photo} nome={evento.title} quadrado />}
                titulo={evento.title}
                linha2={[dataCurta(evento.eventDate), evento.city || evento.state]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))}
          </Secao>

          <Secao
            icone={Shield}
            titulo={t("search.sections.clubs")}
            verTudo="/clubs"
            vazio={clubes.length ? "" : t("search.noClubs")}
          >
            {clubes.slice(0, 3).map((club) => (
              <Linha
                key={club.id}
                to={`/clubs/${club.id}`}
                figura={<Avatar src={club.logo ? clubImageUrl(club.logo) : ""} nome={club.name} quadrado />}
                titulo={club.name}
                linha2={[
                  club.tag && `[${club.tag}]`,
                  `${club.memberCount || 0} ${
                    club.memberCount === 1 ? t("search.member") : t("search.members")
                  }`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))}
          </Secao>
        </div>
      )}

      {buscando && nadaAchado && (
        <div className="rounded-2xl border border-dashed border-[var(--engine-border)] p-8 text-center">
          <SearchIcon size={28} className="mx-auto mb-3 text-[var(--engine-text-subtle)]" />
          <p className="text-sm font-bold text-[var(--engine-text)]">{t("search.emptyTitle")}</p>
          <p className="mt-1.5 text-[13px] font-medium text-[var(--engine-text-muted)]">
            {t("search.emptyHint")}
          </p>
        </div>
      )}

      {buscando && !nadaAchado && (
        <div className="space-y-6">
          {mostra("pessoas") && pessoas.length > 0 && (
            <Secao icone={Users} titulo={t("search.sections.people")}>
              {pessoas.map((pessoa) => (
                <Linha
                  key={pessoa.uid || pessoa.username}
                  to={profilePath(pessoa.username)}
                  figura={<Avatar src={pessoa.avatar} nome={pessoa.author} />}
                  titulo={pessoa.author || pessoa.username}
                  linha2={pessoa.username ? `@${pessoa.username}` : ""}
                />
              ))}
            </Secao>
          )}

          {mostra("servicos") && servicosAchados.length > 0 && (
            <Secao icone={BriefcaseBusiness} titulo={t("search.sections.services")} verTudo="/services">
              {servicosAchados.map((item) => (
                <Linha
                  key={item.id}
                  to={item.slug ? `/servicos/${item.slug}` : "/services"}
                  figura={
                    <span className="block h-11 w-11 overflow-hidden rounded-xl">
                      <ListingPhoto
                        src={(item.photos || [])[0]}
                        listing={item}
                        alt=""
                        className="h-full w-full object-cover"
                        placeholderSize="sm"
                      />
                    </span>
                  }
                  titulo={item.title}
                  linha2={[item.providerName, item.city].filter(Boolean).join(" · ")}
                  direita={
                    item.price ? (
                      <span className="text-[13px] font-black italic text-[var(--engine-accent)]">
                        {item.price}
                      </span>
                    ) : null
                  }
                />
              ))}
            </Secao>
          )}

          {mostra("clubes") && clubes.length > 0 && (
            <Secao icone={Shield} titulo={t("search.sections.clubs")} verTudo="/clubs">
              {clubes.map((club) => (
                <Linha
                  key={club.id}
                  to={`/clubs/${club.id}`}
                  figura={<Avatar src={club.logo ? clubImageUrl(club.logo) : ""} nome={club.name} quadrado />}
                  titulo={club.name}
                  linha2={[
                    club.tag && `[${club.tag}]`,
                    `${club.memberCount || 0} ${
                      club.memberCount === 1 ? t("search.member") : t("search.members")
                    }`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              ))}
            </Secao>
          )}

          {mostra("eventos") && eventosAchados.length > 0 && (
            <Secao icone={CalendarDays} titulo={t("search.sections.events")} verTudo="/events">
              {eventosAchados.map((evento) => (
                <Linha
                  key={evento.id}
                  to={`/events/${evento.id}`}
                  figura={<Avatar src={evento.coverUrl || evento.photo} nome={evento.title} quadrado />}
                  titulo={evento.title}
                  linha2={[dataCurta(evento.eventDate), evento.city || evento.state]
                    .filter(Boolean)
                    .join(" · ")}
                  direita={
                    evento.city ? (
                      <MapPin size={14} className="text-[var(--engine-text-subtle)]" />
                    ) : null
                  }
                />
              ))}
            </Secao>
          )}
        </div>
      )}
    </section>
  );
}
