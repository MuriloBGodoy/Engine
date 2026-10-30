import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Search, X, Loader } from "lucide-react";

const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY || "";

export function GiphyPicker({ onSelect, onClose }) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const searchTimeoutRef = useRef(null);

  const searchGifs = async (searchTerm) => {
    if (!GIPHY_API_KEY) {
      setError("GIPHY API key não configurada. Adiciona VITE_GIPHY_API_KEY no .env");
      return;
    }

    if (!searchTerm.trim()) {
      setGifs([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(
          searchTerm
        )}&limit=20&offset=0&rating=G&lang=pt`
      );

      if (!response.ok) throw new Error("Erro ao buscar GIFs");

      const data = await response.json();
      setGifs(data.data || []);
    } catch (err) {
      console.error("GIPHY error:", err);
      setError("Erro ao buscar GIFs");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value) => {
    setQuery(value);
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      searchGifs(value);
    }, 500);
  };

  const handleSelectGif = (gif) => {
    onSelect({
      gifUrl: gif.images.original.url,
      gifId: gif.id,
    });
  };

  // Portal no body: dentro de Mensagens há um ancestral com backdrop-filter, e
  // `fixed` passa a ser relativo a ele (o modal abria no canto, sobre a sidebar).
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-h-[80vh] bg-[var(--engine-surface)] rounded-t-2xl sm:rounded-2xl sm:max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--engine-border)] p-4">
          <h3 className="text-sm font-bold text-[var(--engine-text)]">Buscar GIF</h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--engine-text-muted)] transition hover:bg-[var(--engine-surface-2)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search Input */}
        <div className="border-b border-[var(--engine-border)] p-3">
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--engine-text-subtle)]"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Pesquisar GIF..."
              className="h-10 w-full rounded-xl border border-[var(--engine-border)] bg-[var(--engine-surface-2)] pl-9 pr-3 text-sm text-[var(--engine-text)] outline-none transition focus:border-[var(--engine-accent)]"
            />
          </div>
        </div>

        {/* GIFs Grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {error && (
            <div className="rounded-lg bg-red-500/20 p-3 text-center text-xs font-semibold text-red-400">
              {error}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader size={20} className="animate-spin text-[var(--engine-accent)]" />
            </div>
          )}

          {!loading && gifs.length === 0 && query && !error && (
            <div className="flex h-32 items-center justify-center text-center">
              <p className="text-xs font-medium text-[var(--engine-text-muted)]">
                Nenhum GIF encontrado
              </p>
            </div>
          )}

          {!loading && gifs.length === 0 && !query && (
            <div className="flex h-32 items-center justify-center text-center">
              <p className="text-xs font-medium text-[var(--engine-text-muted)]">
                Digite algo pra buscar GIFs
              </p>
            </div>
          )}

          {gifs.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {gifs.map((gif) => (
                <button
                  key={gif.id}
                  onClick={() => handleSelectGif(gif)}
                  className="group relative overflow-hidden rounded-lg transition hover:opacity-80"
                >
                  <img
                    src={gif.images.fixed_height_small.url}
                    alt={gif.title}
                    className="h-24 w-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/30">
                    <span className="text-xs font-bold text-white opacity-0 transition group-hover:opacity-100">
                      Selecionar
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
