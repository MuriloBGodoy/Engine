import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { MENTION_LIMIT, searchMentionTargets } from "../../services/mentions";
import { MentionKindIcon } from "./MentionKindIcon";

/**
 * Textarea com @menção. Digitar `@` abre a busca de pessoas, clubes, páginas
 * e eventos; escolher troca o `@termo` por `@Rótulo` e guarda a menção
 * (`{kind, id, label}`) — quem converte em marcador com id é o
 * `serializeBio`, na hora de salvar.
 *
 * Teclado: ↑/↓ escolhe, Enter/Tab confirma, Esc fecha.
 */
const TRIGGER = /(^|\s)@([^\s@[\]]{0,30})$/;

export function MentionTextarea({ id, value, mentions, onChange, maxLength, placeholder, className = "" }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const [query, setQuery] = useState(null); // { term, start }
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  // Só conta a menção cujo `@Rótulo` ainda está no texto.
  const live = mentions.filter((m) => value.includes(`@${m.label}`));
  const full = live.length >= MENTION_LIMIT;

  useEffect(() => {
    if (!query || full) {
      setResults([]);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    const timer = setTimeout(() => {
      searchMentionTargets(query.term)
        .then((list) => {
          if (!alive) return;
          const taken = new Set(live.map((m) => `${m.kind}:${m.id}`));
          setResults(list.filter((item) => !taken.has(`${item.kind}:${item.id}`)).slice(0, 8));
          setActive(0);
        })
        .catch(() => alive && setResults([]))
        .finally(() => alive && setLoading(false));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // `live` muda junto com `value`/`mentions`; a busca só refaz pelo termo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, full]);

  const detect = (text, caret) => {
    const match = TRIGGER.exec(text.slice(0, caret));
    setQuery(match ? { term: match[2], start: caret - match[2].length - 1 } : null);
  };

  const handleChange = (event) => {
    const text = event.target.value;
    if (maxLength && text.length > maxLength) return;
    onChange(text, mentions);
    detect(text, event.target.selectionStart ?? text.length);
  };

  const pick = (item) => {
    if (!query) return;
    const label = String(item.label || item.name || "").replace(/^@/, "").replace(/[[\]]/g, "").trim();
    if (!label) return;
    const caret = ref.current?.selectionStart ?? value.length;
    const before = value.slice(0, query.start);
    const after = value.slice(caret);
    const insert = `@${label} `;
    const next = `${before}${insert}${after}`;
    if (maxLength && next.length > maxLength) return;
    onChange(next, [...live, { kind: item.kind, id: item.id, label }]);
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = before.length + insert.length;
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  };

  const handleKeyDown = (event) => {
    if (!query || !results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      pick(results[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setQuery(null);
    }
  };

  const open = Boolean(query) && (loading || results.length > 0 || full);
  const listId = `${id}-mentions`;

  return (
    <div className="relative">
      <textarea
        id={id}
        ref={ref}
        value={value}
        placeholder={placeholder}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={(e) => detect(value, e.currentTarget.selectionStart ?? value.length)}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        className={className}
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-[var(--engine-border)] bg-[var(--engine-elevated)] p-1 shadow-lg"
        >
          {full ? (
            <li className="px-3 py-2 text-[12.5px] text-[var(--engine-text-muted)]">
              {t("mentions.limit", { count: MENTION_LIMIT })}
            </li>
          ) : loading && !results.length ? (
            <li className="flex justify-center py-3 text-[var(--engine-text-muted)]">
              <Loader2 size={16} className="animate-spin" />
            </li>
          ) : (
            results.map((item, index) => (
              <li key={`${item.kind}:${item.id}`} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(item)}
                  className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left ${
                    index === active ? "bg-[var(--engine-surface-2)]" : ""
                  }`}
                >
                  <MentionKindIcon kind={item.kind} avatar={item.avatar} logo={item.logo} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-[var(--engine-text)]">{item.name || item.label}</span>
                    <span className="block truncate text-[11.5px] text-[var(--engine-text-muted)]">
                      {t(`mentions.kinds.${item.kind}`)}
                      {item.sub ? ` · ${item.sub}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
