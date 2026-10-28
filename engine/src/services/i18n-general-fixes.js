import i18n from "./i18n";

/**
 * Textos das correções gerais pré-lançamento (auditoria geral de 25/10/2026):
 * tela de erro, primeiro uso, sair com confirmação, seletor de idioma,
 * exportar dados, páginas legais e os ajustes de Planos e Anuncie.
 *
 * Fora do i18n.js pelo mesmo motivo do i18n-billing.js: entram por
 * `addResourceBundle` com deep merge e sobrescrita. Por isso algumas chaves
 * daqui SUBSTITUEM textos de outros arquivos (ex.: o "Respondemos por e-mail"
 * de Anuncie, que prometia uma resposta que ninguém é avisado de dar).
 */

const ptBR = {
  nav: {
    main: "Navegação principal",
  },
  common: {
    share: "Compartilhar",
  },
  imageCropper: {
    error: "Não foi possível cortar a imagem. Tente de novo.",
  },
  errorBoundary: {
    title: "Algo deu errado nesta tela",
    body: "O erro já foi registrado. Recarregar a página costuma resolver — seus dados salvos não se perdem.",
    reload: "Recarregar",
    home: "Ir para o início",
  },
  logoutConfirm: {
    title: "Sair da conta?",
    message: "Você vai precisar entrar de novo para ver sua garagem e suas mensagens neste aparelho.",
    confirm: "Sair",
  },
  language: {
    label: "Idioma",
    auto: "Idioma do navegador",
  },
  legal: {
    back: "Voltar",
    updatedAt: "Atualizado em {{date}}",
  },
  auth: {
    optional: "opcional",
  },
  onboarding: {
    kicker: "Antes de começar",
    title: "Falta só um passo",
    titleTerms: "Os Termos mudaram",
    subtitle: "Isso aparece uma vez. Depois o Engine é todo seu.",
    subtitleTerms: "Atualizamos os Termos de Uso ou a Política de Privacidade. Leia e confirme para continuar.",
    nameLabel: "Seu nome",
    namePlaceholder: "Como você quer aparecer",
    usernameLabel: "Nome de usuário",
    usernameHint: "É o seu endereço na comunidade: engine/{{username}}. Letras, números, ponto e _.",
    usernameRequired: "Escolha um nome de usuário com pelo menos 3 caracteres.",
    usernameTaken: "Esse nome de usuário já é de alguém. Tente outro.",
    nameRequired: "Diga como você quer ser chamado.",
    consentBefore: "Tenho 18 anos ou mais e li os",
    terms: "Termos de Uso",
    and: "e a",
    privacy: "Política de Privacidade",
    consentRequired: "Para usar o Engine, confirme a idade e o aceite dos termos.",
    continue: "Continuar",
    saveError: "Não foi possível salvar agora. Confira a conexão e tente de novo.",
    signOut: "Sair desta conta",
    signedInAs: "Conectado como {{email}}",
    next: {
      kicker: "Sua garagem",
      title: "Comece pelo seu carro",
      subtitle: "Na Garagem cabem dois tipos de carro. Escolha o primeiro — dá para trocar o tipo no cadastro.",
      ownedTitle: "O carro que você tem",
      ownedBody: "Ficha técnica da versão, gastos lançados e quanto ele custa de verdade por mês.",
      goalTitle: "O carro que você quer",
      goalBody: "Vira uma meta: você registra quanto guardou e acompanha quanto falta e quando chega lá.",
      add: "Adicionar meu primeiro carro",
      later: "Agora não, quero explorar",
    },
  },
  settings: {
    app: {
      languageAuto: "Idioma do navegador",
    },
    account: {
      exportData: "Baixar uma cópia dos meus dados",
      exportDataHint: "Arquivo JSON com perfil, configurações, carros, publicações e anúncios.",
      exportDone: "Arquivo gerado. Confira seus downloads.",
      exportError: "Não foi possível gerar o arquivo agora. Tente de novo.",
    },
  },
  billing: {
    plans: {
      notOpenNoAds:
        "A venda dos planos ainda não abriu. Os benefícios pagos estão em construção; os preços abaixo são os previstos para quando abrir. Tudo o que existe hoje é grátis.",
      premium: {
        honestNoAds:
          "Os benefícios do Premium ainda não existem no app: estão marcados como “Em breve”. Por isso ele ainda não está à venda.",
      },
      pro: {
        honestNoAds:
          "Publicar serviço e ver as métricas básicas já é grátis. As ferramentas do Pro ainda não existem no app: estão marcadas como “Em breve”, e ele ainda não está à venda.",
      },
    },
    advertise: {
      form: {
        subtitle: "Conte o que você procura. Entraremos em contato.",
        sentBody: "Entraremos em contato pelo {{email}}. Obrigado pelo interesse no Engine.",
      },
    },
  },
};

const enUS = {
  nav: {
    main: "Main navigation",
  },
  common: {
    share: "Share",
  },
  imageCropper: {
    error: "Could not crop the image. Please try again.",
  },
  errorBoundary: {
    title: "Something went wrong on this screen",
    body: "The error has been logged. Reloading the page usually fixes it — your saved data is not lost.",
    reload: "Reload",
    home: "Go to home",
  },
  logoutConfirm: {
    title: "Sign out?",
    message: "You will need to sign in again to see your garage and messages on this device.",
    confirm: "Sign out",
  },
  language: {
    label: "Language",
    auto: "Browser language",
  },
  legal: {
    back: "Back",
    updatedAt: "Updated on {{date}}",
  },
  auth: {
    optional: "optional",
  },
  onboarding: {
    kicker: "Before you start",
    title: "Just one more step",
    titleTerms: "The Terms have changed",
    subtitle: "You will only see this once. Then Engine is all yours.",
    subtitleTerms: "We updated the Terms of Use or the Privacy Policy. Read and confirm to continue.",
    nameLabel: "Your name",
    namePlaceholder: "How you want to appear",
    usernameLabel: "Username",
    usernameHint: "It is your address in the community: engine/{{username}}. Letters, numbers, dot and _.",
    usernameRequired: "Choose a username with at least 3 characters.",
    usernameTaken: "That username is already taken. Try another one.",
    nameRequired: "Tell us what to call you.",
    consentBefore: "I am 18 or older and I have read the",
    terms: "Terms of Use",
    and: "and the",
    privacy: "Privacy Policy",
    consentRequired: "To use Engine, confirm your age and accept the terms.",
    continue: "Continue",
    saveError: "Could not save right now. Check your connection and try again.",
    signOut: "Sign out of this account",
    signedInAs: "Signed in as {{email}}",
    next: {
      kicker: "Your garage",
      title: "Start with your car",
      subtitle: "The Garage holds two kinds of car. Pick the first one — you can switch the type while adding it.",
      ownedTitle: "The car you own",
      ownedBody: "The spec sheet of your trim, logged expenses and what it really costs per month.",
      goalTitle: "The car you want",
      goalBody: "It becomes a goal: log what you have saved and track how much is left and when you get there.",
      add: "Add my first car",
      later: "Not now, I want to explore",
    },
  },
  settings: {
    app: {
      languageAuto: "Browser language",
    },
    account: {
      exportData: "Download a copy of my data",
      exportDataHint: "JSON file with profile, settings, cars, posts and listings.",
      exportDone: "File created. Check your downloads.",
      exportError: "Could not create the file right now. Please try again.",
    },
  },
  billing: {
    plans: {
      notOpenNoAds:
        "Plans are not on sale yet. The paid benefits are still being built; the prices below are the planned ones. Everything that exists today is free.",
      premium: {
        honestNoAds:
          "Premium benefits do not exist in the app yet: they are marked “Coming soon”. That is why it is not on sale yet.",
      },
      pro: {
        honestNoAds:
          "Publishing a service and seeing basic metrics is already free. Pro tools do not exist in the app yet: they are marked “Coming soon”, and it is not on sale yet.",
      },
    },
    advertise: {
      form: {
        subtitle: "Tell us what you are looking for. We will get in touch.",
        sentBody: "We will get in touch at {{email}}. Thanks for your interest in Engine.",
      },
    },
  },
};

const esES = {
  nav: {
    main: "Navegación principal",
  },
  common: {
    share: "Compartir",
  },
  imageCropper: {
    error: "No se pudo recortar la imagen. Inténtalo de nuevo.",
  },
  errorBoundary: {
    title: "Algo salió mal en esta pantalla",
    body: "El error ya quedó registrado. Recargar la página suele resolverlo — tus datos guardados no se pierden.",
    reload: "Recargar",
    home: "Ir al inicio",
  },
  logoutConfirm: {
    title: "¿Cerrar sesión?",
    message: "Tendrás que entrar de nuevo para ver tu garaje y tus mensajes en este dispositivo.",
    confirm: "Cerrar sesión",
  },
  language: {
    label: "Idioma",
    auto: "Idioma del navegador",
  },
  legal: {
    back: "Volver",
    updatedAt: "Actualizado el {{date}}",
  },
  auth: {
    optional: "opcional",
  },
  onboarding: {
    kicker: "Antes de empezar",
    title: "Solo falta un paso",
    titleTerms: "Los Términos cambiaron",
    subtitle: "Esto aparece una sola vez. Después Engine es todo tuyo.",
    subtitleTerms: "Actualizamos los Términos de uso o la Política de privacidad. Léelos y confirma para continuar.",
    nameLabel: "Tu nombre",
    namePlaceholder: "Cómo quieres aparecer",
    usernameLabel: "Nombre de usuario",
    usernameHint: "Es tu dirección en la comunidad: engine/{{username}}. Letras, números, punto y _.",
    usernameRequired: "Elige un nombre de usuario de al menos 3 caracteres.",
    usernameTaken: "Ese nombre de usuario ya es de alguien. Prueba otro.",
    nameRequired: "Dinos cómo quieres que te llamemos.",
    consentBefore: "Tengo 18 años o más y leí los",
    terms: "Términos de uso",
    and: "y la",
    privacy: "Política de privacidad",
    consentRequired: "Para usar Engine, confirma tu edad y acepta los términos.",
    continue: "Continuar",
    saveError: "No se pudo guardar ahora. Revisa la conexión e inténtalo de nuevo.",
    signOut: "Salir de esta cuenta",
    signedInAs: "Conectado como {{email}}",
    next: {
      kicker: "Tu garaje",
      title: "Empieza por tu coche",
      subtitle: "En el Garaje caben dos tipos de coche. Elige el primero — puedes cambiar el tipo al registrarlo.",
      ownedTitle: "El coche que tienes",
      ownedBody: "Ficha técnica de la versión, gastos registrados y cuánto cuesta de verdad al mes.",
      goalTitle: "El coche que quieres",
      goalBody: "Se convierte en una meta: registras cuánto ahorraste y sigues cuánto falta y cuándo llegas.",
      add: "Añadir mi primer coche",
      later: "Ahora no, quiero explorar",
    },
  },
  settings: {
    app: {
      languageAuto: "Idioma del navegador",
    },
    account: {
      exportData: "Descargar una copia de mis datos",
      exportDataHint: "Archivo JSON con perfil, ajustes, coches, publicaciones y anuncios.",
      exportDone: "Archivo generado. Revisa tus descargas.",
      exportError: "No se pudo generar el archivo ahora. Inténtalo de nuevo.",
    },
  },
  billing: {
    plans: {
      notOpenNoAds:
        "La venta de los planes aún no abrió. Los beneficios de pago están en construcción; los precios de abajo son los previstos. Todo lo que existe hoy es gratis.",
      premium: {
        honestNoAds:
          "Los beneficios de Premium aún no existen en la app: están marcados como “Próximamente”. Por eso todavía no está a la venta.",
      },
      pro: {
        honestNoAds:
          "Publicar un servicio y ver las métricas básicas ya es gratis. Las herramientas de Pro aún no existen en la app: están marcadas como “Próximamente”, y todavía no está a la venta.",
      },
    },
    advertise: {
      form: {
        subtitle: "Cuéntanos qué buscas. Nos pondremos en contacto.",
        sentBody: "Nos pondremos en contacto en {{email}}. Gracias por tu interés en Engine.",
      },
    },
  },
};

i18n.addResourceBundle("pt-BR", "translation", ptBR, true, true);
i18n.addResourceBundle("en-US", "translation", enUS, true, true);
i18n.addResourceBundle("es-ES", "translation", esES, true, true);

export default i18n;
