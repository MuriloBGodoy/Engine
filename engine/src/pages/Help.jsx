import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, Mail, Search, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { SUPPORT_MAILTO } from "../services/contact";
import "../services/i18n-about";

/**
 * /ajuda — a central de ajuda.
 *
 * O rodapé declarava "central de ajuda" desde 25/09/2026 apontando para nada,
 * e o item sumia. Até aqui, quem travava no app só tinha um e-mail: toda
 * dúvida boba virava mensagem, e a pessoa esperava resposta para descobrir
 * onde fica um botão.
 *
 * Duas decisões:
 *
 *  - **`<details>`/`<summary>` de verdade, não acordeão de JavaScript.** O
 *    navegador já sabe abrir, fechar, dar foco e anunciar o estado para o
 *    leitor de tela, e o Ctrl+F do próprio navegador encontra texto dentro de
 *    um `<details>` fechado nos navegadores atuais. Um acordeão escrito à mão
 *    teria que reimplementar tudo isso, pior.
 *  - **A busca filtra por pergunta E resposta.** Quem não sabe o nome da
 *    coisa procura pelo sintoma ("placa", "apagar", "cobrança"), que quase
 *    sempre está no corpo da resposta, não no título dela.
 *
 * Toda resposta aqui foi conferida contra o código. Onde a pergunta era sobre
 * privacidade, a regra foi lida na migration (quem lê a tabela `cars`, o que
 * a vitrine publica) antes da frase ser escrita — central de ajuda que promete
 * o que o app não faz é pior do que não ter central.
 */

// A ordem é a da pessoa que acabou de chegar: primeiro a conta, depois o
// carro, depois o medo (privacidade), e só então comunidade e oficina.
const GRUPOS = [
  { key: "account", perguntas: ["free", "password", "username", "deleteAccount"] },
  { key: "garage", perguntas: ["addCar", "specs", "fipe"] },
  { key: "privacy", perguntas: ["whoSees", "showcase", "plate", "wallet"] },
  { key: "community", perguntas: ["clubs", "report"] },
  { key: "services", perguntas: ["provider", "quote", "category"] },
];

/** Sem acento e em minúscula: quem procura "orcamento" acha "orçamento". */
const achatar = (texto) =>
  String(texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function Help() {
  const { t } = useTranslation();
  const [termo, setTermo] = useState("");

  useEffect(() => {
    const anterior = document.title;
    document.title = `${t("help.title")} · Engine`;
    return () => {
      document.title = anterior;
    };
  }, [t]);

  const grupos = useMemo(() => {
    const alvo = achatar(termo).trim();
    return GRUPOS.map((grupo) => ({
      ...grupo,
      // Monta pergunta e resposta uma vez só e filtra sobre as duas.
      itens: grupo.perguntas
        .map((key) => ({ key, q: t(`help.q.${key}.q`), a: t(`help.q.${key}.a`) }))
        .filter((item) => !alvo || achatar(`${item.q} ${item.a}`).includes(alvo)),
    })).filter((grupo) => grupo.itens.length);
  }, [termo, t]);

  const vazio = grupos.length === 0;
  const procurando = Boolean(termo.trim());

  return (
    <div className="mx-auto w-full max-w-3xl pb-6">
      <PageHeader eyebrow={t("help.eyebrow")} title={t("help.title")} subtitle={t("help.subtitle")} />

      <div className="relative">
        <Search
          size={17}
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--engine-text-muted)]"
        />
        <input
          type="search"
          value={termo}
          onChange={(evento) => setTermo(evento.target.value)}
          placeholder={t("help.searchPlaceholder")}
          aria-label={t("help.searchPlaceholder")}
          className="w-full min-h-12 rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] pl-11 pr-11 text-[15px] text-[var(--engine-text)] outline-none transition-colors placeholder:text-[var(--engine-text-muted)] focus:border-[var(--engine-accent)]"
        />
        {procurando && (
          <button
            type="button"
            onClick={() => setTermo("")}
            aria-label={t("common.close")}
            className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface)] hover:text-[var(--engine-accent)]"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {vazio ? (
        <div className="engine-card mt-4 p-6 text-center">
          <p className="text-sm font-bold text-[var(--engine-text)]">{t("help.empty", { term: termo.trim() })}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--engine-text-muted)]">{t("help.emptyHint")}</p>
        </div>
      ) : (
        grupos.map((grupo) => (
          <section key={grupo.key} aria-labelledby={`ajuda-${grupo.key}`} className="mt-6">
            <h2
              id={`ajuda-${grupo.key}`}
              className="mb-2.5 text-[11px] font-black uppercase tracking-widest text-[var(--engine-text-subtle)]"
            >
              {t(`help.groups.${grupo.key}`)}
            </h2>
            <div className="overflow-hidden rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)]">
              {grupo.itens.map((item, indice) => (
                <details
                  key={item.key}
                  /* Procurando, já abre: filtrou até sobrar três respostas e
                     ainda ter que tocar em cada uma é trabalho à toa. */
                  open={procurando}
                  className={`group ${indice > 0 ? "border-t border-[var(--engine-border)]" : ""}`}
                >
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-bold text-[var(--engine-text)] transition-colors hover:text-[var(--engine-accent)] [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">{item.q}</span>
                    <ChevronDown
                      size={17}
                      aria-hidden="true"
                      className="shrink-0 text-[var(--engine-text-muted)] transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <p className="px-4 pb-4 text-[13px] leading-relaxed text-[var(--engine-text-muted)]">{item.a}</p>
                </details>
              ))}
            </div>
          </section>
        ))
      )}

      {/* O e-mail fica no fim, não no topo: quem rolou até aqui tentou achar
          sozinho antes. Vai para o suporte, não para o contato geral. */}
      <section className="engine-card mt-6 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <Mail size={20} className="mt-0.5 shrink-0 text-[var(--engine-accent)]" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[var(--engine-text)]">{t("help.contact.title")}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--engine-text-muted)]">
              {t("help.contact.body")}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={SUPPORT_MAILTO}
                className="inline-flex min-h-11 items-center rounded-xl bg-[var(--engine-accent)] px-4 text-[13px] font-bold text-white transition hover:brightness-110"
              >
                {t("help.contact.button")}
              </a>
              <Link
                to="/sobre"
                className="inline-flex min-h-11 items-center rounded-xl border border-[var(--engine-border)] px-4 text-[13px] font-bold text-[var(--engine-text)] transition hover:border-[var(--engine-accent)] hover:text-[var(--engine-accent)]"
              >
                {t("help.contact.about")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Help;
