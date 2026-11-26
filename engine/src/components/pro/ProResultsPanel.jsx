import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Loader2, Maximize2, MessageSquare, Pencil, Plus, Trash2, TrendingUp } from "lucide-react";
import {
  PERIOD_OPTIONS,
  addSale,
  deleteSale,
  fetchProviderResults,
  formatMoney,
  isoDay,
  listSales,
  parseMoney,
  periodStart,
  updateSale,
} from "../../services/providerSales";
import { useConfirm } from "../ConfirmProvider";
import { useToast } from "../ToastProvider";
import { FieldLabel, GhostButton, PrimaryButton, Sheet, TextAreaField, TextField } from "./ProUi";
import "../../services/i18n-pro-results";

/**
 * "Meus resultados" — o painel que responde "quanto eu vendi com o Engine?".
 *
 * A tela tem duas metades e elas NÃO se misturam, porque a honestidade aqui
 * é a feature:
 *
 *   1. O que o Engine mediu — aparição, abertura, contato, orçamento enviado
 *      e orçamento ganho. Vem do banco e não se edita.
 *   2. O que você registrou — o valor fechado de verdade, digitado por quem
 *      fechou. O Engine não processa o pagamento do serviço; somar orçamento
 *      e chamar de faturamento seria inventar número, e o dono descobriria
 *      na primeira conferência com o caixa dele.
 *
 * O caderno é privado: lê quem é dono ou admin do perfil. Nem a equipe
 * inteira, nem a moderação do Engine.
 */

const inputClass =
  "w-full min-h-[52px] rounded-[14px] border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-3.5 py-3 text-base font-semibold text-[var(--engine-text)] outline-none transition placeholder:font-medium placeholder:text-[var(--engine-text-muted)] focus:border-[var(--engine-accent)] focus:shadow-[0_0_0_3px_var(--engine-ring)]";

/** Número grande com rótulo pequeno — a peça que se repete no painel. */
function Numero({ icone: Icone = null, valor, rotulo, destaque = false }) {
  return (
    <div
      className={`rounded-2xl border p-3 ${
        destaque
          ? "border-[var(--engine-accent)]/40 bg-[var(--engine-accent)]/10"
          : "border-[var(--engine-border)] bg-[var(--engine-surface)]"
      }`}
    >
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--engine-text-muted)]">
        {Icone ? <Icone size={13} aria-hidden="true" /> : null}
        {rotulo}
      </p>
      <p
        className={`mt-1 font-display text-xl font-black tracking-tight ${
          destaque ? "text-[var(--engine-accent)]" : "text-[var(--engine-text)]"
        }`}
      >
        {valor}
      </p>
    </div>
  );
}

/**
 * Mês a mês, no mesmo idioma visual do "Seu mês" do anúncio: barra em SVG,
 * valor no `title`, sem biblioteca de gráfico. São doze números — um gráfico
 * de verdade aqui seria 60 kB para desenhar doze retângulos.
 */
function BarrasDeMes({ meses, locale, t }) {
  const maior = Math.max(1, ...meses.map((m) => Number(m.total) || 0));
  const altura = 72;
  const largura = Math.max(1, meses.length) * 16;

  if (!meses.length) {
    return (
      <p className="text-sm font-semibold text-[var(--engine-text-muted)]">{t("proResults.months.empty")}</p>
    );
  }

  const rotuloDoMes = (chave) => {
    const [ano, mes] = String(chave || "").split("-");
    if (!ano || !mes) return chave;
    return new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(Number(ano), Number(mes) - 1, 15)),
    );
  };

  return (
    <figure>
      <svg
        viewBox={`0 0 ${largura} ${altura}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={t("proResults.months.heading")}
        className="block h-20 w-full"
      >
        {meses.map((mes, indice) => {
          const valor = Number(mes.total) || 0;
          const alturaBarra = valor ? Math.max(4, (valor / maior) * (altura - 8)) : 2;
          return (
            <rect
              key={mes.month}
              x={indice * 16 + 2}
              y={altura - alturaBarra}
              width={12}
              height={alturaBarra}
              rx={2}
              className={valor ? "fill-[var(--engine-accent)]" : "fill-[var(--engine-border-strong)]"}
            >
              <title>{`${rotuloDoMes(mes.month)}: ${formatMoney(valor, locale)} · ${t(
                "proResults.months.contactsLabel",
              )} ${Number(mes.contacts) || 0}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="mt-1.5 flex justify-between text-[11px] font-semibold text-[var(--engine-text-muted)]">
        <span>{rotuloDoMes(meses[0].month)}</span>
        <span>{rotuloDoMes(meses[meses.length - 1].month)}</span>
      </figcaption>
    </figure>
  );
}

/** O formulário de uma venda. Abre em cima do painel, não troca de tela. */
function FormularioDeVenda({ venda, onSalvar, onCancelar, busy, t }) {
  const [valor, setValor] = useState(venda?.amount ? String(venda.amount).replace(".", ",") : "");
  const [dia, setDia] = useState(venda?.soldOn || isoDay(new Date()));
  const [rotulo, setRotulo] = useState(venda?.label || "");
  const [nota, setNota] = useState(venda?.note || "");

  const enviar = (evento) => {
    evento.preventDefault();
    onSalvar({ amount: parseMoney(valor), soldOn: dia, label: rotulo, note: nota });
  };

  return (
    <form onSubmit={enviar} className="space-y-3 rounded-2xl border border-[var(--engine-accent)]/40 bg-[var(--engine-surface)] p-3.5">
      <p className="font-display text-base font-bold text-[var(--engine-text)]">
        {t(venda?.id ? "proResults.sales.editTitle" : "proResults.sales.addTitle")}
      </p>

      <FieldLabel htmlFor="venda-valor" label={t("proResults.sales.amount")} hint={t("proResults.sales.amountHint")}>
        <input
          id="venda-valor"
          value={valor}
          onChange={(evento) => setValor(evento.target.value)}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          className={inputClass}
        />
      </FieldLabel>

      <FieldLabel htmlFor="venda-dia" label={t("proResults.sales.soldOn")}>
        <input
          id="venda-dia"
          type="date"
          value={dia}
          onChange={(evento) => setDia(evento.target.value)}
          max={isoDay(new Date())}
          className={inputClass}
        />
      </FieldLabel>

      <TextField
        id="venda-rotulo"
        label={t("proResults.sales.label")}
        value={rotulo}
        onChange={setRotulo}
        placeholder={t("proResults.sales.labelPlaceholder")}
        optional
      />

      <TextAreaField
        id="venda-nota"
        label={t("proResults.sales.note")}
        value={nota}
        onChange={setNota}
        placeholder={t("proResults.sales.notePlaceholder")}
        rows={2}
        optional
      />

      <div className="flex gap-2">
        <GhostButton type="button" onClick={onCancelar} className="flex-1">
          {t("pro.back")}
        </GhostButton>
        <PrimaryButton type="submit" busy={busy} className="flex-1">
          {t("proResults.sales.save")}
        </PrimaryButton>
      </div>
    </form>
  );
}

export function ProResultsPanel({ profile, onClose }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || "pt-BR";
  const toast = useToast();
  const confirm = useConfirm();

  const [periodo, setPeriodo] = useState("30d");
  const [dados, setDados] = useState(null);
  const [vendas, setVendas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [editando, setEditando] = useState(null); // venda, {} = nova
  const [salvando, setSalvando] = useState(false);

  const inicio = useMemo(() => periodStart(periodo), [periodo]);

  const carregar = useCallback(async () => {
    setErro(false);
    try {
      const [resultado, caderno] = await Promise.all([
        fetchProviderResults(profile.id, { from: inicio }),
        listSales(profile.id, { from: inicio }),
      ]);
      setDados(resultado);
      setVendas(caderno);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [profile.id, inicio]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const medido = dados?.measured || {};
  const resumo = dados?.sales || {};
  const meses = Array.isArray(dados?.months) ? dados.months : [];
  const pendentes = Array.isArray(dados?.wonPending) ? dados.wonPending : [];

  const conversao =
    Number(medido.replied) > 0
      ? Math.round((Number(medido.won) / Number(medido.replied)) * 100)
      : null;

  const salvar = async (valores) => {
    if (valores.amount == null) {
      toast(t("proResults.sales.invalidAmount"), "error");
      return;
    }
    setSalvando(true);
    try {
      if (editando?.id) {
        await updateSale(editando.id, { ...editando, ...valores });
        toast(t("proResults.sales.updated"));
      } else {
        await addSale(profile.id, { ...editando, ...valores });
        toast(t("proResults.sales.saved"));
      }
      setEditando(null);
      await carregar();
    } catch (error) {
      console.error(error);
      toast(t("proResults.sales.error"), "error");
    } finally {
      setSalvando(false);
    }
  };

  const apagar = async (venda) => {
    const ok = await confirm({
      title: t("proResults.sales.delete"),
      message: t("proResults.sales.deleteConfirm"),
      confirmLabel: t("proResults.sales.delete"),
    });
    if (!ok) return;
    try {
      await deleteSale(venda.id);
      toast(t("proResults.sales.deleted"));
      await carregar();
    } catch (error) {
      console.error(error);
      toast(t("proResults.sales.error"), "error");
    }
  };

  const dinheiro = (valor) => formatMoney(valor, locale);

  return (
    <Sheet
      onClose={onClose}
      eyebrow={t("proResults.eyebrow")}
      title={t("proResults.title")}
      wide
    >
      <p className="text-sm font-medium text-[var(--engine-text-muted)]">
        {t("proResults.subtitle", { name: profile.name || "" })}
      </p>

      {/* Período */}
      <div className="flex flex-wrap gap-2">
        {PERIOD_OPTIONS.map((opcao) => (
          <button
            key={opcao}
            type="button"
            onClick={() => setPeriodo(opcao)}
            aria-pressed={periodo === opcao}
            className={`min-h-10 rounded-full border px-3.5 text-[13px] font-bold transition ${
              periodo === opcao
                ? "border-[var(--engine-accent)] bg-[var(--engine-accent)] text-white"
                : "border-[var(--engine-border)] bg-[var(--engine-surface-2)] text-[var(--engine-text-muted)] hover:text-[var(--engine-text)]"
            }`}
          >
            {t(`proResults.period.${opcao}`)}
          </button>
        ))}
      </div>

      {carregando ? (
        <div className="flex justify-center py-10">
          <Loader2 size={28} className="animate-spin text-[var(--engine-text-muted)]" />
        </div>
      ) : erro ? (
        <p className="rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-4 text-sm font-semibold text-[var(--engine-text-muted)]">
          {t("proResults.loadError")}
        </p>
      ) : (
        <>
          {/* ---------------------------------------- o que o Engine mediu */}
          <section className="space-y-3">
            <div>
              <h3 className="font-display text-base font-bold text-[var(--engine-text)]">
                {t("proResults.measured.heading")}
              </h3>
              <p className="text-xs font-medium text-[var(--engine-text-muted)]">
                {t("proResults.measured.hint")}
              </p>
            </div>

            {Number(medido.listings) ? null : (
              <p className="rounded-xl border border-dashed border-[var(--engine-border-strong)] p-3 text-xs font-semibold text-[var(--engine-text-muted)]">
                {t("proResults.measured.noListings")}
              </p>
            )}

            <div className="grid grid-cols-3 gap-2">
              <Numero icone={Eye} rotulo={t("proResults.measured.views")} valor={Number(medido.views) || 0} />
              <Numero icone={Maximize2} rotulo={t("proResults.measured.details")} valor={Number(medido.details) || 0} />
              <Numero
                icone={MessageSquare}
                rotulo={t("proResults.measured.contacts")}
                valor={Number(medido.contacts) || 0}
                destaque
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Numero rotulo={t("proResults.measured.replied")} valor={Number(medido.replied) || 0} />
              <Numero rotulo={t("proResults.measured.won")} valor={Number(medido.won) || 0} destaque />
              <Numero rotulo={t("proResults.measured.open")} valor={Number(medido.open) || 0} />
            </div>

            {conversao != null && (
              <p className="flex items-center gap-1.5 text-xs font-bold text-[var(--engine-text-muted)]">
                <TrendingUp size={14} aria-hidden="true" />
                {t("proResults.measured.conversion", { rate: conversao })}
              </p>
            )}

            {Number(medido.wonMax) > 0 && (
              <div className="rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--engine-text-muted)]">
                  {t("proResults.measured.wonValue")}
                </p>
                <p className="mt-1 font-display text-xl font-black tracking-tight text-[var(--engine-text)]">
                  {Number(medido.wonMin) === Number(medido.wonMax)
                    ? dinheiro(medido.wonMin)
                    : `${dinheiro(medido.wonMin)} – ${dinheiro(medido.wonMax)}`}
                </p>
                <p className="mt-1 text-xs font-medium leading-4 text-[var(--engine-text-muted)]">
                  {t("proResults.measured.wonValueHint")}
                </p>
              </div>
            )}

            <p className="text-[11px] font-medium text-[var(--engine-text-subtle)]">
              {t("proResults.measured.sinceTracking")}
            </p>
          </section>

          {/* ------------------------------------ o que você registrou */}
          <section className="space-y-3 border-t border-[var(--engine-border)] pt-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-display text-base font-bold text-[var(--engine-text)]">
                  {t("proResults.sales.heading")}
                </h3>
                <p className="text-xs font-medium text-[var(--engine-text-muted)]">
                  {t("proResults.sales.hint")}
                </p>
              </div>
              {!editando && (
                <PrimaryButton className="min-h-11 shrink-0 text-xs" onClick={() => setEditando({})}>
                  <Plus size={15} aria-hidden="true" />
                  {t("proResults.sales.add")}
                </PrimaryButton>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Numero rotulo={t("proResults.sales.total")} valor={dinheiro(resumo.total)} destaque />
              <Numero rotulo={t("proResults.sales.count")} valor={Number(resumo.count) || 0} />
              <Numero rotulo={t("proResults.sales.average")} valor={dinheiro(resumo.average)} />
            </div>

            {editando && (
              <FormularioDeVenda
                venda={editando}
                busy={salvando}
                onSalvar={salvar}
                onCancelar={() => setEditando(null)}
                t={t}
              />
            )}

            {/* Orçamentos ganhos esperando virar linha no caderno. */}
            {pendentes.length > 0 && (
              <div className="space-y-2 rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-3">
                <p className="text-[13px] font-bold text-[var(--engine-text)]">
                  {t("proResults.pending.heading")}
                </p>
                <p className="text-xs font-medium text-[var(--engine-text-muted)]">
                  {t("proResults.pending.hint")}
                </p>
                <ul className="space-y-2">
                  {pendentes.map((ganho) => (
                    <li key={ganho.requestId} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-bold text-[var(--engine-text)]">
                          {ganho.carLabel || ganho.category}
                        </p>
                        <p className="truncate text-xs font-semibold text-[var(--engine-text-muted)]">
                          {t("proResults.pending.quoted", {
                            value: formatMoney(ganho.priceMin, locale, ganho.currency),
                          })}
                        </p>
                      </div>
                      <GhostButton
                        type="button"
                        className="min-h-10 shrink-0 text-xs"
                        onClick={() =>
                          setEditando({
                            amount: Number(ganho.priceMin) || 0,
                            label: ganho.carLabel || ganho.category,
                            listingId: ganho.listingId || "",
                            quoteRequestId: ganho.requestId,
                            soldOn: isoDay(ganho.closedAt || new Date()),
                          })
                        }
                      >
                        {t("proResults.pending.register")}
                      </GhostButton>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {vendas.length ? (
              <ul className="space-y-2">
                {vendas.map((venda) => (
                  <li
                    key={venda.id}
                    className="flex items-center gap-2 rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface)] p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--engine-text)]">
                        {formatMoney(venda.amount, locale, venda.currency)}
                      </p>
                      <p className="truncate text-xs font-semibold text-[var(--engine-text-muted)]">
                        {new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", timeZone: "UTC" }).format(
                          new Date(`${venda.soldOn}T12:00:00Z`),
                        )}
                        {venda.label ? ` · ${venda.label}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditando(venda)}
                      aria-label={t("pro.edit")}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-[var(--engine-accent)]"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => apagar(venda)}
                      aria-label={t("proResults.sales.delete")}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)] hover:text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--engine-border-strong)] p-4">
                <p className="text-sm font-bold text-[var(--engine-text)]">{t("proResults.sales.empty")}</p>
                <p className="mt-1 text-xs font-medium text-[var(--engine-text-muted)]">
                  {t("proResults.sales.emptyHint")}
                </p>
              </div>
            )}
          </section>

          {/* ------------------------------------------------- mês a mês */}
          <section className="space-y-2 border-t border-[var(--engine-border)] pt-4">
            <h3 className="font-display text-base font-bold text-[var(--engine-text)]">
              {t("proResults.months.heading")}
            </h3>
            <BarrasDeMes meses={meses} locale={locale} t={t} />
          </section>
        </>
      )}
    </Sheet>
  );
}
