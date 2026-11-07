// Dataset de localização para a plataforma Engine (global).
// Países + estados/regiões + cidades principais. Brasil vem completo (27 UFs);
// outros países trazem as regiões e cidades mais relevantes. Cidades fora da
// lista continuam funcionando como texto livre (datalist / input).

// Sem bandeira: o emoji de bandeira entrava em todo seletor de país do app
// (região, telefone, cadastro, evento) e cada sistema desenha o dele — no
// Windows nem desenha, vira duas letras numa caixinha. O nome do país já diz
// o que a bandeira diria. (06/11/2026)
export const countries = [
  { code: "BR", name: "Brasil", dial: "+55" },
  { code: "PT", name: "Portugal", dial: "+351" },
  { code: "US", name: "Estados Unidos", dial: "+1" },
  { code: "ES", name: "Espanha", dial: "+34" },
  { code: "AR", name: "Argentina", dial: "+54" },
  { code: "MX", name: "México", dial: "+52" },
  { code: "CL", name: "Chile", dial: "+56" },
  { code: "CO", name: "Colômbia", dial: "+57" },
  { code: "GB", name: "Reino Unido", dial: "+44" },
  { code: "FR", name: "França", dial: "+33" },
  { code: "DE", name: "Alemanha", dial: "+49" },
  { code: "IT", name: "Itália", dial: "+39" },
];

// regionData[countryCode].states = [{ code, name, cities: [...] }]
export const regionData = {
  BR: {
    states: [
      { code: "AC", name: "Acre", cities: ["Rio Branco", "Cruzeiro do Sul", "Sena Madureira"] },
      { code: "AL", name: "Alagoas", cities: ["Maceió", "Arapiraca", "Palmeira dos Índios"] },
      { code: "AP", name: "Amapá", cities: ["Macapá", "Santana", "Laranjal do Jari"] },
      { code: "AM", name: "Amazonas", cities: ["Manaus", "Parintins", "Itacoatiara", "Manacapuru"] },
      { code: "BA", name: "Bahia", cities: ["Salvador", "Feira de Santana", "Vitória da Conquista", "Camaçari", "Ilhéus", "Juazeiro"] },
      { code: "CE", name: "Ceará", cities: ["Fortaleza", "Caucaia", "Juazeiro do Norte", "Sobral", "Maracanaú"] },
      { code: "DF", name: "Distrito Federal", cities: ["Brasília", "Taguatinga", "Ceilândia", "Gama"] },
      { code: "ES", name: "Espírito Santo", cities: ["Vitória", "Vila Velha", "Serra", "Cariacica", "Cachoeiro de Itapemirim"] },
      { code: "GO", name: "Goiás", cities: ["Goiânia", "Aparecida de Goiânia", "Anápolis", "Rio Verde", "Luziânia"] },
      { code: "MA", name: "Maranhão", cities: ["São Luís", "Imperatriz", "Timon", "Caxias", "Codó"] },
      { code: "MT", name: "Mato Grosso", cities: ["Cuiabá", "Várzea Grande", "Rondonópolis", "Sinop", "Tangará da Serra"] },
      { code: "MS", name: "Mato Grosso do Sul", cities: ["Campo Grande", "Dourados", "Três Lagoas", "Corumbá"] },
      { code: "MG", name: "Minas Gerais", cities: ["Belo Horizonte", "Uberlândia", "Contagem", "Juiz de Fora", "Betim", "Montes Claros", "Uberaba"] },
      { code: "PA", name: "Pará", cities: ["Belém", "Ananindeua", "Santarém", "Marabá", "Castanhal"] },
      { code: "PB", name: "Paraíba", cities: ["João Pessoa", "Campina Grande", "Patos", "Bayeux"] },
      { code: "PR", name: "Paraná", cities: ["Curitiba", "Londrina", "Maringá", "Ponta Grossa", "Cascavel", "Foz do Iguaçu"] },
      { code: "PE", name: "Pernambuco", cities: ["Recife", "Jaboatão dos Guararapes", "Olinda", "Caruaru", "Petrolina"] },
      { code: "PI", name: "Piauí", cities: ["Teresina", "Parnaíba", "Picos", "Floriano"] },
      { code: "RJ", name: "Rio de Janeiro", cities: ["Rio de Janeiro", "São Gonçalo", "Duque de Caxias", "Nova Iguaçu", "Niterói", "Campos dos Goytacazes", "Petrópolis"] },
      { code: "RN", name: "Rio Grande do Norte", cities: ["Natal", "Mossoró", "Parnamirim", "São Gonçalo do Amarante"] },
      { code: "RS", name: "Rio Grande do Sul", cities: ["Porto Alegre", "Caxias do Sul", "Pelotas", "Canoas", "Santa Maria", "Gravataí", "Novo Hamburgo"] },
      { code: "RO", name: "Rondônia", cities: ["Porto Velho", "Ji-Paraná", "Ariquemes", "Vilhena"] },
      { code: "RR", name: "Roraima", cities: ["Boa Vista", "Rorainópolis", "Caracaraí"] },
      { code: "SC", name: "Santa Catarina", cities: ["Florianópolis", "Joinville", "Blumenau", "Chapecó", "Criciúma", "Itajaí"] },
      { code: "SP", name: "São Paulo", cities: ["São Paulo", "Guarulhos", "Campinas", "São Bernardo do Campo", "Santo André", "Osasco", "Ribeirão Preto", "Sorocaba", "Santos", "São José dos Campos", "Araraquara", "São Carlos", "Bauru", "Piracicaba", "Jundiaí", "Franca", "Presidente Prudente", "Marília", "Limeira", "Americana", "Rio Claro", "Taubaté", "Mogi das Cruzes"] },
      { code: "SE", name: "Sergipe", cities: ["Aracaju", "Nossa Senhora do Socorro", "Lagarto", "Itabaiana"] },
      { code: "TO", name: "Tocantins", cities: ["Palmas", "Araguaína", "Gurupi", "Porto Nacional"] },
    ],
  },
  PT: {
    states: [
      { code: "LIS", name: "Lisboa", cities: ["Lisboa", "Sintra", "Cascais", "Amadora", "Loures"] },
      { code: "POR", name: "Porto", cities: ["Porto", "Vila Nova de Gaia", "Matosinhos", "Gondomar", "Maia"] },
      { code: "BRA", name: "Braga", cities: ["Braga", "Guimarães", "Barcelos", "Famalicão"] },
      { code: "COI", name: "Coimbra", cities: ["Coimbra", "Figueira da Foz", "Cantanhede"] },
      { code: "FAR", name: "Faro (Algarve)", cities: ["Faro", "Portimão", "Loulé", "Albufeira", "Lagos"] },
      { code: "AVE", name: "Aveiro", cities: ["Aveiro", "Águeda", "Ílhavo"] },
      { code: "SET", name: "Setúbal", cities: ["Setúbal", "Almada", "Barreiro", "Seixal"] },
    ],
  },
  US: {
    states: [
      { code: "CA", name: "California", cities: ["Los Angeles", "San Francisco", "San Diego", "San Jose", "Sacramento"] },
      { code: "TX", name: "Texas", cities: ["Houston", "Dallas", "Austin", "San Antonio", "Fort Worth"] },
      { code: "NY", name: "New York", cities: ["New York City", "Buffalo", "Rochester", "Albany"] },
      { code: "FL", name: "Florida", cities: ["Miami", "Orlando", "Tampa", "Jacksonville"] },
      { code: "IL", name: "Illinois", cities: ["Chicago", "Aurora", "Naperville"] },
      { code: "NV", name: "Nevada", cities: ["Las Vegas", "Reno", "Henderson"] },
      { code: "WA", name: "Washington", cities: ["Seattle", "Spokane", "Tacoma"] },
      { code: "MA", name: "Massachusetts", cities: ["Boston", "Worcester", "Cambridge"] },
      { code: "GA", name: "Georgia", cities: ["Atlanta", "Augusta", "Savannah"] },
      { code: "NJ", name: "New Jersey", cities: ["Newark", "Jersey City", "Paterson"] },
    ],
  },
  ES: {
    states: [
      { code: "MD", name: "Madrid", cities: ["Madrid", "Móstoles", "Alcalá de Henares", "Getafe"] },
      { code: "CT", name: "Cataluña", cities: ["Barcelona", "Badalona", "Sabadell", "Tarragona", "Girona"] },
      { code: "AN", name: "Andalucía", cities: ["Sevilla", "Málaga", "Córdoba", "Granada", "Cádiz"] },
      { code: "VC", name: "Valencia", cities: ["Valencia", "Alicante", "Elche", "Castellón"] },
      { code: "PV", name: "País Vasco", cities: ["Bilbao", "Vitoria-Gasteiz", "San Sebastián"] },
      { code: "GA", name: "Galicia", cities: ["A Coruña", "Vigo", "Santiago de Compostela"] },
    ],
  },
  AR: {
    states: [
      { code: "CABA", name: "Buenos Aires (CABA)", cities: ["Buenos Aires"] },
      { code: "BA", name: "Provincia de Buenos Aires", cities: ["La Plata", "Mar del Plata", "Bahía Blanca", "Quilmes"] },
      { code: "CB", name: "Córdoba", cities: ["Córdoba", "Villa María", "Río Cuarto"] },
      { code: "SF", name: "Santa Fe", cities: ["Rosario", "Santa Fe", "Rafaela"] },
      { code: "MZ", name: "Mendoza", cities: ["Mendoza", "San Rafael", "Godoy Cruz"] },
    ],
  },
  MX: {
    states: [
      { code: "CMX", name: "Ciudad de México", cities: ["Ciudad de México"] },
      { code: "JAL", name: "Jalisco", cities: ["Guadalajara", "Zapopan", "Tlaquepaque"] },
      { code: "NLE", name: "Nuevo León", cities: ["Monterrey", "San Nicolás de los Garza", "Guadalupe"] },
      { code: "PUE", name: "Puebla", cities: ["Puebla", "Tehuacán"] },
      { code: "BCN", name: "Baja California", cities: ["Tijuana", "Mexicali", "Ensenada"] },
    ],
  },
  CL: {
    states: [
      { code: "RM", name: "Región Metropolitana", cities: ["Santiago", "Puente Alto", "Maipú"] },
      { code: "VS", name: "Valparaíso", cities: ["Valparaíso", "Viña del Mar", "Quilpué"] },
      { code: "BI", name: "Biobío", cities: ["Concepción", "Talcahuano", "Los Ángeles"] },
    ],
  },
  CO: {
    states: [
      { code: "DC", name: "Bogotá D.C.", cities: ["Bogotá"] },
      { code: "ANT", name: "Antioquia", cities: ["Medellín", "Envigado", "Bello", "Itagüí"] },
      { code: "VAC", name: "Valle del Cauca", cities: ["Cali", "Palmira", "Buenaventura"] },
      { code: "ATL", name: "Atlántico", cities: ["Barranquilla", "Soledad"] },
    ],
  },
  GB: {
    states: [
      { code: "ENG", name: "England", cities: ["London", "Manchester", "Birmingham", "Liverpool", "Leeds"] },
      { code: "SCT", name: "Scotland", cities: ["Edinburgh", "Glasgow", "Aberdeen"] },
      { code: "WLS", name: "Wales", cities: ["Cardiff", "Swansea", "Newport"] },
    ],
  },
  FR: {
    states: [
      { code: "IDF", name: "Île-de-France", cities: ["Paris", "Boulogne-Billancourt", "Versailles"] },
      { code: "PAC", name: "Provence-Alpes-Côte d'Azur", cities: ["Marseille", "Nice", "Toulon"] },
      { code: "ARA", name: "Auvergne-Rhône-Alpes", cities: ["Lyon", "Grenoble", "Saint-Étienne"] },
    ],
  },
  DE: {
    states: [
      { code: "BE", name: "Berlin", cities: ["Berlin"] },
      { code: "BY", name: "Bayern", cities: ["München", "Nürnberg", "Augsburg"] },
      { code: "NW", name: "Nordrhein-Westfalen", cities: ["Köln", "Düsseldorf", "Dortmund", "Essen"] },
      { code: "HH", name: "Hamburg", cities: ["Hamburg"] },
    ],
  },
  IT: {
    states: [
      { code: "LAZ", name: "Lazio", cities: ["Roma", "Latina"] },
      { code: "LOM", name: "Lombardia", cities: ["Milano", "Bergamo", "Brescia"] },
      { code: "CAM", name: "Campania", cities: ["Napoli", "Salerno"] },
      { code: "TOS", name: "Toscana", cities: ["Firenze", "Pisa", "Livorno"] },
    ],
  },
};

// Normaliza nome de cidade p/ comparação (sem acento, minúsculo, sem espaços extras).
const normalizeCityKey = (city = "") =>
  String(city)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

// Índice reverso: cidade -> lista de { country, state } onde ela existe no dataset.
const cityIndex = (() => {
  const map = new Map();
  Object.entries(regionData).forEach(([country, region]) => {
    region.states.forEach((state) => {
      state.cities.forEach((city) => {
        const key = normalizeCityKey(city);
        const entry = map.get(key) || [];
        entry.push({ country, state: state.code });
        map.set(key, entry);
      });
    });
  });
  return map;
})();

// Infere país/estado a partir do nome da cidade. Só resolve quando o match é
// ÚNICO no dataset (evita ambiguidade tipo "Córdoba" em ES e AR). Senão, null.
export const inferLocation = (city) => {
  const matches = cityIndex.get(normalizeCityKey(city));
  return matches && matches.length === 1 ? matches[0] : null;
};

// Verifica se a cidade pertence ao país informado. Só REPROVA quando a cidade
// é conhecida no dataset e não existe no país selecionado (ex.: país = BR,
// cidade = "Lisboa"). Cidade desconhecida (texto livre) ou país "all" passam —
// não dá para exigir que toda cidade do mundo esteja no dataset.
export const isCityInCountry = (countryCode, city) => {
  const key = normalizeCityKey(city);
  if (!key) return true;
  if (!countryCode || countryCode === "all") return true;
  const matches = cityIndex.get(key);
  if (!matches || !matches.length) return true;
  return matches.some((entry) => entry.country === countryCode);
};

export const getCountry = (code) =>
  countries.find((country) => country.code === code) || null;

export const getStates = (countryCode) =>
  regionData[countryCode]?.states || [];

export const getState = (countryCode, stateCode) =>
  getStates(countryCode).find((state) => state.code === stateCode) || null;

export const getCities = (countryCode, stateCode) =>
  getState(countryCode, stateCode)?.cities || [];

export const getCountryName = (code) => getCountry(code)?.name || "";

export const getStateName = (countryCode, stateCode) =>
  getState(countryCode, stateCode)?.name || "";

export const DEFAULT_COUNTRY = "BR";
