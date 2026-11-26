/* eslint-disable react-refresh/only-export-components --
   Harness de banco de prova: é o entry de uma página própria, não um módulo
   que alguém importa, então fast refresh por export não se aplica. */
/**
 * Banco de prova do seletor de GIF.
 *
 * O painel de GIF e o menu de anexo moram no chat, e o chat mora atrás do
 * login — não dá para olhar para eles sem uma conta, que é justamente o que
 * ninguém tem na hora de ajustar um pixel. Este harness monta o componente
 * DE PRODUÇÃO (`components/GiphyPicker.jsx`) em cima de um compositor de
 * mentira, com a mesma ancoragem do chat: um container `relative` com o
 * botão embaixo e o painel subindo dele.
 *
 * Não entra no build: o Vite só empacota o index.html. Vive no `npm run dev`,
 * em /gif-preview.html.
 *
 *   ?dark=1   tema escuro
 */
import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { Plus, Send, Smile } from "lucide-react";
import { GiphyPicker } from "./components/GiphyPicker";
import "./index.css";
import "./services/i18n";

const QUERY = new URLSearchParams(window.location.search);
if (QUERY.get("dark") === "1") document.documentElement.classList.add("dark");

function Bancada() {
  const [aberto, setAberto] = useState(true);
  const [escolhido, setEscolhido] = useState("");

  return (
    <div className="flex h-[100dvh] flex-col bg-[var(--engine-bg)] text-[var(--engine-text)]">
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-sm font-bold">Banco de prova — seletor de GIF</p>
        <p className="mt-1 text-[13px] text-[var(--engine-text-muted)]">
          O painel abre ancorado no botão de baixo, como no chat.
        </p>
        {escolhido && (
          <img
            src={escolhido}
            alt=""
            className="mt-4 max-w-[220px] rounded-2xl border border-[var(--engine-border)]"
          />
        )}
      </div>

      {/* O compositor de mentira: mesma estrutura do chat de verdade. */}
      <form
        onSubmit={(evento) => evento.preventDefault()}
        className="flex shrink-0 items-end gap-2 border-t border-[var(--engine-border)] p-3"
      >
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setAberto((atual) => !atual)}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] text-[var(--engine-text)]"
          >
            <Plus size={19} />
          </button>
          {aberto && (
            <GiphyPicker
              onSelect={(gif) => {
                setEscolhido(gif.gifUrl);
                setAberto(false);
              }}
              onClose={() => setAberto(false)}
            />
          )}
        </div>
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--engine-text-muted)]"
        >
          <Smile size={18} />
        </button>
        <div className="min-h-11 flex-1 rounded-2xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--engine-text-subtle)]">
          Mensagem...
        </div>
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--engine-accent)] text-white"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Bancada />
  </React.StrictMode>,
);
