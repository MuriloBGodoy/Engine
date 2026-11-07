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

/** Backend próprio, quando existir. Sem variável, fala direto com a FIPE. */
const ENGINE_API_URL = import.meta.env.VITE_API_URL || "";
const engineApiUrl = (path) => `${ENGINE_API_URL}${path}`;

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
  getBrands: async () => {
    if (ENGINE_API_URL) {
      return (await axios.get(engineApiUrl("/fipe/brands"))).data;
    }
    return comQueda("/brands", listaDaV2, "/marcas", listaDaV1);
  },

  getModels: async (brandId) => {
    if (ENGINE_API_URL) {
      return (await axios.get(engineApiUrl(`/fipe/brands/${brandId}/models`))).data;
    }
    return comQueda(
      `/brands/${brandId}/models`,
      listaDaV2,
      `/marcas/${brandId}/modelos`,
      // Na v1 os modelos vêm embrulhados em `{ modelos, anos }`.
      (dados) => listaDaV1(dados?.modelos),
    );
  },

  getYears: async (brandId, modelId) => {
    if (ENGINE_API_URL) {
      return (await axios.get(engineApiUrl(`/fipe/brands/${brandId}/models/${modelId}/years`)))
        .data;
    }
    return comQueda(
      `/brands/${brandId}/models/${modelId}/years`,
      listaDaV2,
      `/marcas/${brandId}/modelos/${modelId}/anos`,
      listaDaV1,
    );
  },

  /**
   * O preço, e com ele o código FIPE — que só aparece nesta resposta e é a
   * chave canônica do veículo no Brasil. Devolve `{ Valor, CodigoFipe }`.
   */
  getVehicle: async (brandId, modelId, yearId) => {
    if (ENGINE_API_URL) {
      const { data } = await axios.get(
        engineApiUrl(`/fipe/brands/${brandId}/models/${modelId}/years/${yearId}/price`),
      );
      return { Valor: data?.Valor || data?.price || "", CodigoFipe: data?.CodigoFipe || data?.codeFipe || "" };
    }
    return comQueda(
      `/brands/${brandId}/models/${modelId}/years/${yearId}`,
      (dados) => {
        if (!dados?.price) throw new Error("fipe-v2-sem-preco");
        return { Valor: dados.price, CodigoFipe: dados.codeFipe || "" };
      },
      `/marcas/${brandId}/modelos/${modelId}/anos/${yearId}`,
      (dados) => ({ Valor: dados?.Valor || "", CodigoFipe: dados?.CodigoFipe || "" }),
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
