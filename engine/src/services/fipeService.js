import axios from "axios";

/**
 * A consulta FIPE — marca, modelo, ano e preço.
 *
 * 07/11/2026: a v1 do parallelum caiu. Toda rota devolve
 * `{"error":"failed to locate the information on fipe.org"}` com HTTP 500, e
 * demora de 10 a 30 segundos para dizer isso — então a tela de cadastrar
 * carro ficava girando meio minuto antes de mostrar "não conseguimos carregar
 * as marcas". A v2 do mesmo serviço responde tudo normalmente.
 *
 * Em vez de só trocar a URL: **tenta a v2 e cai na v1**. Quem publica uma API
 * grátis pode derrubar qualquer uma das duas numa terça-feira à tarde, e o
 * cadastro de carro é a porta de entrada do app — não pode depender de um
 * endereço só.
 *
 * As duas falam o mesmo catálogo da fipe.org e usam os MESMOS códigos
 * (marca 21 = Fiat nas duas, ano "1987-1" nas duas), então um carro
 * cadastrado por uma continua válido pela outra. O que muda é o nome dos
 * campos — `codigo/nome/Valor` na v1, `code/name/price` na v2 —, e é só isso
 * que este módulo esconde: para quem chama, a resposta é sempre no formato
 * da v1, que é o que as telas já sabem ler.
 *
 * A v2 aceita chamada sem token; o token existe para quem precisa de limite
 * maior. Se um dia o limite apertar, é aqui que ele entra.
 */

const V2 = "https://fipe.parallelum.com.br/api/v2/cars";
const V1 = "https://parallelum.com.br/fipe/api/v1/carros";

// A v1 leva até meio minuto para falhar. Sem teto, a pessoa olha um spinner
// sem saber que já era.
const TEMPO_V2 = 12000;
const TEMPO_V1 = 15000;

/**
 * Backend próprio, quando existir. Sem variável, fala direto com a FIPE.
 *
 * 09/11/2026: a consulta parou de funcionar para todo mundo, e não era a FIPE.
 * `VITE_API_URL=http://localhost:8080/api` vinha do `engine/.env`, que estava
 * versionado por engano — então a Netlify compilava o site com ele e o
 * navegador de cada pessoa tentava falar com a porta 8080 DELA MESMA. Pior:
 * como o desvio para o backend próprio vinha antes de tudo, a queda v2→v1
 * logo abaixo virava código morto. A tela girava e desistia.
 *
 * Duas travas, para não depender de ninguém lembrar de uma variável:
 *
 * 1. Endereço de `localhost` só vale se a página também estiver em localhost.
 *    Um `.env` de desenvolvimento que escape para um build de produção passa
 *    a ser ignorado, em vez de derrubar o cadastro de carro.
 * 2. O backend próprio é um atalho, nunca um beco sem saída: se ele falhar
 *    por qualquer motivo, a chamada continua para a FIPE pública. Antes, um
 *    backend fora do ar levava a consulta inteira junto.
 */
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i;

const engineApiBase = () => {
  const url = (import.meta.env.VITE_API_URL || "").trim();
  if (!url) return "";
  if (!LOCAL.test(url)) return url;
  // Só um navegador servido de localhost consegue alcançar outro localhost.
  const aqui = typeof window !== "undefined" ? window.location.hostname : "";
  const emCasa = aqui === "localhost" || aqui === "127.0.0.1" || aqui === "::1";
  if (emCasa) return url;
  if (typeof console !== "undefined") {
    console.warn(
      `[fipe] VITE_API_URL aponta para ${url}, mas a página está em ${aqui}. ` +
        "Ignorando e consultando a FIPE pública.",
    );
  }
  return "";
};

const ENGINE_API_URL = engineApiBase();
const engineApiUrl = (path) => `${ENGINE_API_URL}${path}`;

/**
 * Tenta o backend próprio e, se ele negar, entrega o que a FIPE pública
 * disser. É o que torna o atalho opcional de verdade.
 */
async function viaEngineApi(path, normaliza, publico) {
  if (!ENGINE_API_URL) return publico();
  try {
    const { data } = await axios.get(engineApiUrl(path), { timeout: TEMPO_V2 });
    const pronto = normaliza ? normaliza(data) : data;
    if (pronto && (!Array.isArray(pronto) || pronto.length)) return pronto;
    throw new Error("engine-api-vazia");
  } catch {
    return publico();
  }
}

/** `[{code, name}]` da v2 → `[{codigo, nome}]`, que é o que as telas leem. */
const listaDaV2 = (dados) =>
  (Array.isArray(dados) ? dados : []).map((item) => ({
    codigo: String(item.code ?? ""),
    nome: String(item.name ?? ""),
  }));

const listaDaV1 = (dados) => (Array.isArray(dados) ? dados : []);

/**
 * Tenta a v2; se ela falhar por qualquer motivo, tenta a v1. Só desiste
 * quando as duas negam — aí o erro que sobe é o da v1, porque é o último.
 */
async function comQueda(caminhoV2, normalizaV2, caminhoV1, normalizaV1) {
  try {
    const resposta = await axios.get(`${V2}${caminhoV2}`, { timeout: TEMPO_V2 });
    const pronto = normalizaV2(resposta.data);
    // A v2 às vezes responde 200 com `{error: ...}`: lista vazia não serve.
    if (pronto && (!Array.isArray(pronto) || pronto.length)) return pronto;
    throw new Error("fipe-v2-vazia");
  } catch {
    const resposta = await axios.get(`${V1}${caminhoV1}`, { timeout: TEMPO_V1 });
    return normalizaV1(resposta.data);
  }
}

export const fipeService = {
  getBrands: async () =>
    viaEngineApi("/fipe/brands", null, () =>
      comQueda("/brands", listaDaV2, "/marcas", listaDaV1),
    ),

  getModels: async (brandId) =>
    viaEngineApi(`/fipe/brands/${brandId}/models`, null, () =>
      comQueda(
        `/brands/${brandId}/models`,
        listaDaV2,
        `/marcas/${brandId}/modelos`,
        // Na v1 os modelos vêm embrulhados em `{ modelos, anos }`.
        (dados) => listaDaV1(dados?.modelos),
      ),
    ),

  getYears: async (brandId, modelId) =>
    viaEngineApi(`/fipe/brands/${brandId}/models/${modelId}/years`, null, () =>
      comQueda(
        `/brands/${brandId}/models/${modelId}/years`,
        listaDaV2,
        `/marcas/${brandId}/modelos/${modelId}/anos`,
        listaDaV1,
      ),
    ),

  /**
   * O preço, e com ele o código FIPE — que só aparece nesta resposta e é a
   * chave canônica do veículo no Brasil. Devolve `{ Valor, CodigoFipe }`.
   */
  getVehicle: async (brandId, modelId, yearId) => {
    const daEngineApi = (data) => {
      const valor = data?.Valor || data?.price || "";
      // Sem preço não há código FIPE, e é o código que o resto do app usa.
      if (!valor) throw new Error("engine-api-sem-preco");
      return { Valor: valor, CodigoFipe: data?.CodigoFipe || data?.codeFipe || "" };
    };
    return viaEngineApi(
      `/fipe/brands/${brandId}/models/${modelId}/years/${yearId}/price`,
      daEngineApi,
      () =>
        comQueda(
          `/brands/${brandId}/models/${modelId}/years/${yearId}`,
          (dados) => {
            if (!dados?.price) throw new Error("fipe-v2-sem-preco");
            return { Valor: dados.price, CodigoFipe: dados.codeFipe || "" };
          },
          `/marcas/${brandId}/modelos/${modelId}/anos/${yearId}`,
          (dados) => ({
            Valor: dados?.Valor || "",
            CodigoFipe: dados?.CodigoFipe || "",
          }),
        ),
    );
  },

  /** Compatibilidade: havia quem quisesse só o texto do preço. */
  getPrice: async (brandId, modelId, yearId) =>
    (await fipeService.getVehicle(brandId, modelId, yearId)).Valor,

  getConsumption: async (modelName) => {
    // Consumo real (km/l) só existe com backend próprio.
    if (!ENGINE_API_URL) return null;
    try {
      const response = await axios.get(
        engineApiUrl(`/fipe/consumption/${encodeURIComponent(modelName)}`),
      );
      return response.data; // { gasoline: 13.5, ethanol: 9.8, diesel: 14.0 }
    } catch (error) {
      console.error("Erro ao carregar consumo real:", error);
      return null;
    }
  },
};
