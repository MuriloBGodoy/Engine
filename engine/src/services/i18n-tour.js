import i18n from "./i18n";

/**
 * Textos do guia (tour.*).
 *
 * Regra de escrita: cada frase diz O QUE FAZER, não o que a tela é. "Cadastre
 * o carro e o Engine já traz a ficha técnica" ensina; "aqui fica sua garagem"
 * não ensina nada para quem está olhando para a garagem.
 *
 * As listas vêm numeradas (`b1`, `b2`...) em vez de array porque o quanto
 * cada seção tem está no catálogo (services/tour.js) e porque array no
 * i18next exige `returnObjects` em todo lugar que lê.
 */

const ptBR = {
  tour: {
    skip: "Pular",
    next: "Próximo",
    back: "Voltar",
    finish: "Entendi",
    close: "Fechar",
    step: "{{current}} de {{total}}",
    chapter: "Capítulo {{current}} de {{total}}",
    skipChapter: "Pular este capítulo",
    exit: "Sair do guia",
    welcome: {
      start: "Ver o guia",
      later: "Agora não",
      done: "Pronto! Quando precisar, o ponto de interrogação lá em cima refaz esta volta.",
    },
    help: {
      button: "Ajuda desta tela",
      title: "Como usar esta tela",
      here: "Você está em",
      whatToDo: "O que dá para fazer aqui",
      startTour: "Ver o tour desta tela",
      center: "Central de ajuda",
      contact: "Falar com a gente",
      noSteps: "Esta tela não tem tour passo a passo — o que dá para fazer está na lista acima.",
      fullGuide: "Ver o guia completo do Engine",
      restartGuide: "Começar o guia de novo",
      continueGuide: "Continuar o guia de onde parei",
    },
    /* Os capítulos do guia completo (services/tour.js). */
    chapters: {
      start: { title: "Boas-vindas" },
      garage: { title: "Garagem" },
      community: { title: "Comunidade" },
      services: { title: "Serviços" },
      events: { title: "Eventos" },
      search: { title: "Busca" },
      profile: { title: "Seu perfil" },
      finish: { title: "Pra fechar" },
    },
    sections: {
      home: {
        title: "Início",
        summary: "O resumo do seu Engine: seus carros, o que a comunidade postou e o que vem por aí.",
        b1: "Veja num lugar só o que mudou desde a última vez que você entrou.",
        b2: "Toque num carro para abrir a ficha, os gastos e as lembranças dele.",
        b3: "Role até os eventos para ver o que acontece perto de você.",
        b4: "O menu (lateral no computador, barra de baixo no celular) leva às quatro áreas.",
      },
      garage: {
        title: "Garagem",
        summary: "Seus carros: ficha técnica, gastos, lembretes e o custo real de ter cada um.",
        b1: "Cadastre o carro pela marca e modelo — a ficha técnica vem junto.",
        b2: "Lance abastecimento, manutenção e peça para ver quanto ele custa por mês.",
        b3: "Veja o custo real de posse: IPVA, seguro, depreciação e combustível no mesmo lugar.",
        b4: "Crie lembretes de revisão, troca de óleo e documento.",
        b5: "Decida o que é público: a vitrine mostra o carro, nunca a placa.",
      },
      community: {
        title: "Comunidade",
        summary: "O feed do Engine: rolê, projeto, manutenção e conquista — tudo sobre carro.",
        b1: "Publique foto, vídeo ou texto e marque o carro da sua garagem.",
        b2: "Curta, comente e siga quem tem carro parecido com o seu.",
        b3: "Entre numa crew (clube) por marca ou por região.",
        b4: "Toque no @ de alguém para ver a garagem e as conquistas da pessoa.",
      },
      services: {
        title: "Serviços",
        summary: "Quem resolve: oficina, loja de peça e profissional perto de você.",
        b1: "Busque por categoria e veja fotos, avaliações e se o profissional vai até você.",
        b2: "Peça orçamento uma vez e receba resposta de quem atende na sua cidade.",
        b3: "Em Lojas estão as peças e acessórios; em Empresas, quem tem conta profissional.",
        b4: "Tem oficina ou trabalha por conta? Publique de graça e apareça para quem procura.",
        b5: "Já é profissional? Em \"Meus resultados\" você vê o que o Engine trouxe e registra o que vendeu.",
      },
      events: {
        title: "Eventos",
        summary: "Encontros, track days e rolês — com quem vai e o que estão perguntando.",
        b1: "Filtre por tipo e estado para achar o que acontece perto.",
        b2: "Confirme presença e diga qual carro você vai levar.",
        b3: "Comente para perguntar sobre estacionamento, horário ou carona.",
        b4: "Organiza um encontro? Crie o evento e convide a equipe.",
      },
      search: {
        title: "Buscar",
        summary: "A porta para tudo: gente, carro, clube, evento, serviço e produto.",
        b1: "Digite o que você procura — a busca olha em todas as áreas ao mesmo tempo.",
        b2: "Use as sugestões para descobrir clube e evento que você nem sabia que existiam.",
        b3: "Toque numa hashtag para ver tudo que foi publicado com ela.",
      },
      dashboard: {
        title: "Painel",
        summary: "Os números da sua garagem: gastos, consumo e o que vence em breve.",
        b1: "Compare quanto cada carro custou no período.",
        b2: "Veja o consumo médio a partir dos abastecimentos lançados.",
        b3: "Confira o que vence: documento, revisão e lembretes.",
      },
      messages: {
        title: "Mensagens",
        summary: "Conversa direta com quem você segue e com quem respondeu seu orçamento.",
        b1: "Mande foto, vídeo e link de publicação dentro da conversa.",
        b2: "A conversa com prestador nasce do orçamento — nada de telefone exposto.",
        b3: "Bloqueou alguém? A conversa some dos dois lados.",
      },
      profile: {
        title: "Perfil",
        summary: "A página de alguém: publicações, garagem, conquistas e a Carteira.",
        b1: "Siga a pessoa para ver as publicações dela no seu feed.",
        b2: "A aba Garagem mostra os carros que ela deixou públicos.",
        b3: "Conquistas são o histórico de quem usa o Engine de verdade.",
        b4: "A Carteira de Garagem é o documento de brincadeira do Engine — dá para salvar e postar.",
      },
      settings: {
        title: "Configurações",
        summary: "Conta, privacidade, idioma, tema e o que o Engine pode mostrar de você.",
        b1: "Escolha o que fica público: carro, cidade, garagem e vitrine.",
        b2: "Troque idioma, tema e os avisos que você quer receber.",
        b3: "Baixe seus dados ou apague a conta — sai tudo junto.",
      },
      plans: {
        title: "Planos",
        summary: "O que é grátis para sempre e o que o plano pago acrescenta.",
        b1: "Tudo que você usa hoje continua de graça.",
        b2: "O plano pago é feito para quem vive de carro, não para quem tem um.",
        b3: "Dá para cancelar quando quiser, sem ligar para ninguém.",
      },
    },
    steps: {
      "j-hello": {
        title: "Bem-vindo ao Engine",
        body: "São uns três minutos para você saber onde fica cada coisa. O guia te leva de tela em tela — e nada aqui é obrigatório: dá para pular quando quiser.",
      },
      "j-menu": {
        title: "Por onde se anda",
        body: "No computador o menu é esta lateral; no celular, a barra de baixo. São quatro áreas: garagem, comunidade, serviços e eventos.",
      },
      "j-home": {
        title: "O Início",
        body: "Esta tela é o resumo: seus carros, o que a comunidade postou e os eventos que estão chegando. Em dúvida, volte para cá.",
      },
      "j-garage-guest": {
        title: "A garagem é o começo",
        body: "É aqui que seu carro entra: ficha técnica, gastos e lembretes. Para ter a sua, você precisa de uma conta — leva meio minuto e é de graça.",
      },
      "j-garage-add": {
        title: "Cadastre seu primeiro carro",
        body: "Marca, modelo e ano. A ficha técnica, o consumo e a tabela de preço vêm junto; você não digita nada disso.",
        cta: "Abrir o cadastro agora",
      },
      "j-garage-card": {
        title: "O carro tem página própria",
        body: "Toque no carro para abrir ficha, fotos, gastos, lembretes e as lembranças que você for guardando nele.",
      },
      "j-garage-costs": {
        title: "Quanto ele custa de verdade",
        body: "Lance abastecimento e manutenção: o Engine soma com IPVA, seguro e depreciação e mostra o custo real de ter o carro.",
      },
      "j-dashboard": {
        title: "O painel",
        body: "Os números da garagem num lugar só: gasto por carro, consumo médio e o que vence em breve.",
      },
      "j-community-feed": {
        title: "O feed é só de carro",
        body: "Rolê, projeto, manutenção e conquista. Curta, comente e siga quem tem carro parecido com o seu.",
      },
      "j-community-post": {
        title: "Sua primeira publicação",
        body: "Foto, vídeo ou texto. Marque o carro da garagem e ele vira um link na publicação. Dá para experimentar agora — ou deixar para depois.",
        cta: "Abrir o compositor",
      },
      "j-community-clubs": {
        title: "As crews",
        body: "Clube por marca, por modelo ou por cidade. Entrar é um toque, e o que você publica no mural da crew aparece com a sigla dela.",
      },
      "j-services": {
        title: "Serviços, Lojas e Empresas",
        body: "Passando rápido: Serviços é quem mexe no seu carro, Lojas é peça e acessório, Empresas são as oficinas e profissionais com conta no Engine.",
      },
      "j-services-quote": {
        title: "Orçamento: conte uma vez",
        body: "Você descreve o problema e quem atende na sua cidade responde com preço e prazo. Seu telefone não aparece para ninguém.",
      },
      "j-events": {
        title: "Eventos e encontros",
        body: "Track day, encontro de domingo, rolê da crew. Filtre por tipo e estado, abra um evento e você vê quem vai, diz qual carro leva e pergunta nos comentários.",
      },
      "j-search": {
        title: "A busca acha tudo",
        body: "Gente, carro, crew, evento, serviço e produto no mesmo campo. É o caminho mais curto quando você já sabe o que quer.",
      },
      "j-profile": {
        title: "Seu perfil",
        body: "É o que os outros veem: publicações, a garagem que você abriu, conquistas. O que fica público é você quem decide.",
      },
      "j-wallet": {
        title: "A Carteira de Garagem",
        body: "O documento de brincadeira do Engine, com o seu número de entrada. Dá para trocar o fundo, salvar como imagem e postar.",
      },
      "j-settings": {
        title: "Privacidade no seu ritmo",
        body: "Aqui você escolhe o que o Engine mostra de você: carro, cidade, garagem e vitrine. A placa não aparece em lugar nenhum, nunca.",
      },
      "j-account": {
        title: "Crie sua conta quando quiser",
        body: "Dá para passear pelo Engine inteiro sem conta. Com conta você ganha garagem, publicação, orçamento e presença em evento.",
      },
      "j-help": {
        title: "Travou em alguma tela?",
        body: "Toque aqui. O botão muda com a tela: explica onde você está, o que dá para fazer ali e refaz o passo a passo daquela parte.",
      },
      "j-done": {
        title: "Pronto, é seu",
        body: "Agora é com você: cadastre o carro e dê uma volta. Este guia fica guardado no ponto de interrogação lá em cima, sempre que você quiser de novo.",
      },
      "home-nav": {
        title: "O menu",
        body: "As quatro áreas do Engine moram aqui: garagem, comunidade, serviços e eventos.",
      },
      "home-garage": {
        title: "Comece pelo carro",
        body: "Sem carro cadastrado, metade do Engine fica sem graça. É um minuto: marca, modelo e ano.",
      },
      "home-community": {
        title: "Veja quem já está aqui",
        body: "O feed mostra o que a comunidade postou. Siga quem tem carro parecido com o seu.",
      },
      "home-help": {
        title: "A ajuda anda com você",
        body: "Este botão muda com a tela: ele sempre explica onde você está e o que dá para fazer ali.",
      },
      "garage-add": {
        title: "Adicionar carro",
        body: "Escolha marca, modelo e ano. A ficha técnica, o consumo e a tabela de preço vêm junto.",
      },
      "garage-card": {
        title: "O carro por dentro",
        body: "Toque no carro para ver ficha técnica, fotos, gastos, lembretes e quem já comentou nele.",
      },
      "garage-costs": {
        title: "Quanto ele custa de verdade",
        body: "Lance abastecimento e manutenção e o Engine soma com IPVA, seguro e depreciação. É o custo real de posse.",
      },
      "community-post": {
        title: "Publicar",
        body: "Foto, vídeo ou texto. Marque o carro da sua garagem e ele vira um link na publicação.",
      },
      "community-feed": {
        title: "O feed",
        body: "Curta, comente e siga. Toque duas vezes na foto para curtir, como você já faz em todo lugar.",
      },
      "services-tabs": {
        title: "Serviços, Lojas e Empresas",
        body: "Serviços é o que alguém faz no seu carro. Lojas é peça e acessório. Empresas são as oficinas e profissionais com conta no Engine.",
      },
      "services-quote": {
        title: "Pedir orçamento",
        body: "Conte o problema uma vez e quem atende na sua cidade responde com preço e prazo. Seu telefone não aparece para ninguém.",
      },
      "services-publish": {
        title: "Anunciar o que você faz",
        body: "Publicar é de graça. O anúncio passa por revisão e, depois no ar, você acompanha quantas pessoas viram e chamaram.",
      },
      "events-create": {
        title: "Criar evento",
        body: "Data, local, tipo e foto. Quem confirmar presença diz qual carro vai levar.",
      },
      "events-card": {
        title: "Entrar num encontro",
        body: "Abra o evento para ver quem vai, curtir e perguntar nos comentários antes de confirmar.",
      },
    },
  },
};

const enUS = {
  tour: {
    skip: "Skip",
    next: "Next",
    back: "Back",
    finish: "Got it",
    close: "Close",
    step: "{{current}} of {{total}}",
    chapter: "Chapter {{current}} of {{total}}",
    skipChapter: "Skip this chapter",
    exit: "Leave the guide",
    welcome: {
      start: "Take the tour",
      later: "Not now",
      done: "Done! Whenever you need it, the question mark up top runs this again.",
    },
    help: {
      button: "Help with this screen",
      title: "How to use this screen",
      here: "You are in",
      whatToDo: "What you can do here",
      startTour: "Tour this screen",
      center: "Help center",
      contact: "Talk to us",
      noSteps: "This screen has no step-by-step tour — what you can do is in the list above.",
      fullGuide: "Take the full Engine guide",
      restartGuide: "Start the guide over",
      continueGuide: "Pick the guide up where I left off",
    },
    /* Os capítulos do guia completo (services/tour.js). */
    chapters: {
      start: { title: "Welcome" },
      garage: { title: "Garage" },
      community: { title: "Community" },
      services: { title: "Services" },
      events: { title: "Events" },
      search: { title: "Search" },
      profile: { title: "Your profile" },
      finish: { title: "Wrapping up" },
    },
    sections: {
      home: {
        title: "Home",
        summary: "Your Engine at a glance: your cars, what the community posted and what is coming up.",
        b1: "See in one place what changed since you were last here.",
        b2: "Tap a car to open its spec sheet, costs and reminders.",
        b3: "Scroll to the events to see what is happening near you.",
        b4: "The menu (side on desktop, bottom bar on the phone) opens the four areas.",
      },
      garage: {
        title: "Garage",
        summary: "Your cars: spec sheet, costs, reminders and what each one really costs to own.",
        b1: "Add a car by make and model — the spec sheet comes with it.",
        b2: "Log fuel, service and parts to see what it costs per month.",
        b3: "See the real cost of ownership: tax, insurance, depreciation and fuel together.",
        b4: "Create reminders for service, oil changes and paperwork.",
        b5: "Decide what is public: the showcase shows the car, never the plate.",
      },
      community: {
        title: "Community",
        summary: "The Engine feed: drives, projects, maintenance and wins — all about cars.",
        b1: "Post a photo, video or text and tag a car from your garage.",
        b2: "Like, comment and follow people with a car like yours.",
        b3: "Join a crew by make or by region.",
        b4: "Tap someone's @ to see their garage and achievements.",
      },
      services: {
        title: "Services",
        summary: "Who fixes it: garages, parts shops and professionals near you.",
        b1: "Search by category and see photos, reviews and whether they come to you.",
        b2: "Ask for a quote once and hear back from whoever serves your city.",
        b3: "Shops holds parts and accessories; Businesses lists everyone with a professional account.",
        b4: "Run a garage or work for yourself? Publish for free and show up for whoever is looking.",
        b5: "Already a pro? \"My results\" shows what Engine brought and lets you log what you sold.",
      },
      events: {
        title: "Events",
        summary: "Meets, track days and drives — with who is going and what they are asking.",
        b1: "Filter by type and state to find what is happening nearby.",
        b2: "Confirm you are going and say which car you are bringing.",
        b3: "Comment to ask about parking, timing or a ride.",
        b4: "Organising a meet? Create the event and invite your team.",
      },
      search: {
        title: "Search",
        summary: "The door to everything: people, cars, crews, events, services and products.",
        b1: "Type what you are after — search looks across every area at once.",
        b2: "Use the suggestions to find crews and events you did not know existed.",
        b3: "Tap a hashtag to see everything posted with it.",
      },
      dashboard: {
        title: "Dashboard",
        summary: "Your garage in numbers: spending, fuel economy and what is due soon.",
        b1: "Compare what each car cost over the period.",
        b2: "See average consumption from the fuel you logged.",
        b3: "Check what is due: paperwork, service and reminders.",
      },
      messages: {
        title: "Messages",
        summary: "Direct chat with people you follow and with whoever answered your quote.",
        b1: "Send photos, video and post links inside the chat.",
        b2: "A chat with a provider starts from the quote — no phone number on display.",
        b3: "Blocked someone? The chat disappears for both sides.",
      },
      profile: {
        title: "Profile",
        summary: "Someone's page: posts, garage, achievements and the Garage Card.",
        b1: "Follow them to see their posts in your feed.",
        b2: "The Garage tab shows the cars they made public.",
        b3: "Achievements are the track record of someone who really uses Engine.",
        b4: "The Garage Card is Engine's playful licence — you can save it and post it.",
      },
      settings: {
        title: "Settings",
        summary: "Account, privacy, language, theme and what Engine may show about you.",
        b1: "Choose what stays public: car, city, garage and showcase.",
        b2: "Change language, theme and the notices you want.",
        b3: "Download your data or delete the account — it all goes together.",
      },
      plans: {
        title: "Plans",
        summary: "What is free forever and what the paid plan adds.",
        b1: "Everything you use today stays free.",
        b2: "The paid plan is built for people who make a living from cars, not for people who own one.",
        b3: "Cancel whenever you want, without calling anyone.",
      },
    },
    steps: {
      "j-hello": {
        title: "Welcome to Engine",
        body: "About three minutes and you will know where everything lives. The guide walks you screen by screen — and nothing here is required: skip whenever you like.",
      },
      "j-menu": {
        title: "Getting around",
        body: "On a computer the menu is this sidebar; on a phone, the bottom bar. Four areas: garage, community, services and events.",
      },
      "j-home": {
        title: "Home",
        body: "This screen is the summary: your cars, what the community posted and the events coming up. When in doubt, come back here.",
      },
      "j-garage-guest": {
        title: "The garage is where it starts",
        body: "This is where your car lives: specs, costs and reminders. You need an account for one of your own — half a minute, and free.",
      },
      "j-garage-add": {
        title: "Add your first car",
        body: "Make, model and year. The specs, the fuel figures and the price table come with it; you type none of that.",
        cta: "Open the form now",
      },
      "j-garage-card": {
        title: "Every car has its own page",
        body: "Tap the car to open specs, photos, costs, reminders and the memories you keep on it.",
      },
      "j-garage-costs": {
        title: "What it really costs",
        body: "Log fuel and maintenance: Engine adds tax, insurance and depreciation and shows the real cost of owning it.",
      },
      "j-dashboard": {
        title: "The dashboard",
        body: "Your garage in numbers: spend per car, average consumption and what is due soon.",
      },
      "j-community-feed": {
        title: "A feed that is only cars",
        body: "Drives, builds, repairs and milestones. Like, comment and follow people with a car like yours.",
      },
      "j-community-post": {
        title: "Your first post",
        body: "Photo, video or text. Tag a car from your garage and it becomes a link in the post. Try it now — or leave it for later.",
        cta: "Open the composer",
      },
      "j-community-clubs": {
        title: "Crews",
        body: "Clubs by make, by model or by city. Joining is one tap, and what you post on a crew wall carries its tag.",
      },
      "j-services": {
        title: "Services, Shops and Companies",
        body: "A quick pass: Services is someone working on your car, Shops is parts and accessories, Companies are the garages and pros with an Engine account.",
      },
      "j-services-quote": {
        title: "Quotes: explain it once",
        body: "You describe the problem and whoever works in your city answers with a price and a deadline. Your phone number stays hidden.",
      },
      "j-events": {
        title: "Events and meets",
        body: "Track days, Sunday meets, crew drives. Filter by type and state, open an event and you can see who is going, say which car you are bringing and ask in the comments.",
      },
      "j-search": {
        title: "Search finds everything",
        body: "People, cars, crews, events, services and products in one field. The shortest path when you already know what you want.",
      },
      "j-profile": {
        title: "Your profile",
        body: "It is what other people see: posts, the garage you opened up, achievements. You decide what stays public.",
      },
      "j-wallet": {
        title: "The Garage Card",
        body: "The for-fun Engine ID, with your sign-up number on it. Change the background, save it as an image and post it.",
      },
      "j-settings": {
        title: "Privacy at your pace",
        body: "Here you choose what Engine shows about you: car, city, garage and showcase. The licence plate never shows up anywhere.",
      },
      "j-account": {
        title: "Create an account whenever",
        body: "You can look around all of Engine without one. With an account you get a garage, posts, quotes and event RSVPs.",
      },
      "j-help": {
        title: "Stuck on a screen?",
        body: "Tap here. The button changes with the screen: it explains where you are, what you can do there and replays that screen walkthrough.",
      },
      "j-done": {
        title: "That is it, it is yours",
        body: "Over to you: add the car and have a look around. This guide stays under the question mark up top, whenever you want it again.",
      },
      "home-nav": {
        title: "The menu",
        body: "Engine's four areas live here: garage, community, services and events.",
      },
      "home-garage": {
        title: "Start with the car",
        body: "Without a car, half of Engine falls flat. It takes a minute: make, model and year.",
      },
      "home-community": {
        title: "See who is already here",
        body: "The feed shows what the community posted. Follow people with a car like yours.",
      },
      "home-help": {
        title: "Help follows you",
        body: "This button changes with the screen: it always explains where you are and what you can do there.",
      },
      "garage-add": {
        title: "Add a car",
        body: "Pick make, model and year. Spec sheet, fuel figures and price guide come with it.",
      },
      "garage-card": {
        title: "Inside the car",
        body: "Tap the car for its spec sheet, photos, costs, reminders and the comments people left.",
      },
      "garage-costs": {
        title: "What it really costs",
        body: "Log fuel and service and Engine adds tax, insurance and depreciation. That is the real cost of ownership.",
      },
      "community-post": {
        title: "Post",
        body: "Photo, video or text. Tag a car from your garage and it becomes a link in the post.",
      },
      "community-feed": {
        title: "The feed",
        body: "Like, comment, follow. Double tap a photo to like it, the way you already do everywhere else.",
      },
      "services-tabs": {
        title: "Services, Shops and Businesses",
        body: "Services is work done on your car. Shops is parts and accessories. Businesses lists garages and pros with an Engine account.",
      },
      "services-quote": {
        title: "Ask for a quote",
        body: "Describe the problem once and whoever serves your city answers with price and timing. Your phone number stays hidden.",
      },
      "services-publish": {
        title: "Advertise what you do",
        body: "Publishing is free. The listing goes through review and, once live, you follow how many people saw it and got in touch.",
      },
      "events-create": {
        title: "Create an event",
        body: "Date, place, type and a photo. Whoever confirms says which car they are bringing.",
      },
      "events-card": {
        title: "Join a meet",
        body: "Open the event to see who is going, like it and ask in the comments before you confirm.",
      },
    },
  },
};

const esES = {
  tour: {
    skip: "Saltar",
    next: "Siguiente",
    back: "Atrás",
    finish: "Entendido",
    close: "Cerrar",
    step: "{{current}} de {{total}}",
    chapter: "Capítulo {{current}} de {{total}}",
    skipChapter: "Saltar este capítulo",
    exit: "Salir de la guía",
    welcome: {
      start: "Ver la guía",
      later: "Ahora no",
      done: "¡Listo! Cuando lo necesites, el signo de interrogación de arriba repite esta vuelta.",
    },
    help: {
      button: "Ayuda de esta pantalla",
      title: "Cómo usar esta pantalla",
      here: "Estás en",
      whatToDo: "Qué puedes hacer aquí",
      startTour: "Ver el tour de esta pantalla",
      center: "Centro de ayuda",
      contact: "Hablar con nosotros",
      noSteps: "Esta pantalla no tiene tour paso a paso: lo que puedes hacer está en la lista de arriba.",
      fullGuide: "Ver la guía completa de Engine",
      restartGuide: "Empezar la guía de nuevo",
      continueGuide: "Seguir la guía donde la dejé",
    },
    /* Os capítulos do guia completo (services/tour.js). */
    chapters: {
      start: { title: "Bienvenida" },
      garage: { title: "Garaje" },
      community: { title: "Comunidad" },
      services: { title: "Servicios" },
      events: { title: "Eventos" },
      search: { title: "Búsqueda" },
      profile: { title: "Tu perfil" },
      finish: { title: "Para cerrar" },
    },
    sections: {
      home: {
        title: "Inicio",
        summary: "Tu Engine de un vistazo: tus coches, lo que publicó la comunidad y lo que viene.",
        b1: "Mira en un solo sitio qué cambió desde la última vez.",
        b2: "Toca un coche para abrir su ficha, sus gastos y sus recordatorios.",
        b3: "Baja hasta los eventos para ver qué pasa cerca de ti.",
        b4: "El menú (lateral en el ordenador, barra de abajo en el móvil) abre las cuatro áreas.",
      },
      garage: {
        title: "Garaje",
        summary: "Tus coches: ficha técnica, gastos, recordatorios y lo que cuesta tener cada uno.",
        b1: "Añade el coche por marca y modelo: la ficha técnica viene con él.",
        b2: "Apunta combustible, mantenimiento y piezas para ver cuánto cuesta al mes.",
        b3: "Mira el coste real: impuesto, seguro, depreciación y combustible juntos.",
        b4: "Crea recordatorios de revisión, cambio de aceite y papeles.",
        b5: "Decide qué es público: el escaparate muestra el coche, nunca la matrícula.",
      },
      community: {
        title: "Comunidad",
        summary: "El feed de Engine: rutas, proyectos, mantenimiento y logros, todo de coches.",
        b1: "Publica foto, vídeo o texto y etiqueta un coche de tu garaje.",
        b2: "Dale me gusta, comenta y sigue a quien tiene un coche como el tuyo.",
        b3: "Entra en una crew por marca o por región.",
        b4: "Toca el @ de alguien para ver su garaje y sus logros.",
      },
      services: {
        title: "Servicios",
        summary: "Quién lo resuelve: talleres, tiendas de piezas y profesionales cerca de ti.",
        b1: "Busca por categoría y mira fotos, reseñas y si van hasta donde estás.",
        b2: "Pide presupuesto una vez y te responde quien atiende en tu ciudad.",
        b3: "En Tiendas están las piezas; en Empresas, quien tiene cuenta profesional.",
        b4: "¿Tienes taller o trabajas por tu cuenta? Publica gratis y aparece para quien busca.",
        b5: "¿Ya eres profesional? En \"Mis resultados\" ves lo que trajo Engine y registras lo que vendiste.",
      },
      events: {
        title: "Eventos",
        summary: "Quedadas, track days y rutas, con quién va y qué están preguntando.",
        b1: "Filtra por tipo y provincia para encontrar lo que pasa cerca.",
        b2: "Confirma que vas y di qué coche vas a llevar.",
        b3: "Comenta para preguntar por aparcamiento, horario o viaje compartido.",
        b4: "¿Organizas una quedada? Crea el evento e invita a tu equipo.",
      },
      search: {
        title: "Buscar",
        summary: "La puerta a todo: gente, coches, crews, eventos, servicios y productos.",
        b1: "Escribe lo que buscas: la búsqueda mira en todas las áreas a la vez.",
        b2: "Usa las sugerencias para descubrir crews y eventos que no sabías que existían.",
        b3: "Toca una etiqueta para ver todo lo publicado con ella.",
      },
      dashboard: {
        title: "Panel",
        summary: "Los números de tu garaje: gastos, consumo y lo que vence pronto.",
        b1: "Compara cuánto costó cada coche en el periodo.",
        b2: "Mira el consumo medio a partir de lo que apuntaste.",
        b3: "Comprueba lo que vence: papeles, revisión y recordatorios.",
      },
      messages: {
        title: "Mensajes",
        summary: "Conversación directa con quien sigues y con quien respondió tu presupuesto.",
        b1: "Manda fotos, vídeo y enlaces de publicaciones dentro del chat.",
        b2: "El chat con un profesional nace del presupuesto: ningún teléfono a la vista.",
        b3: "¿Bloqueaste a alguien? El chat desaparece para los dos.",
      },
      profile: {
        title: "Perfil",
        summary: "La página de alguien: publicaciones, garaje, logros y el Carné de Garaje.",
        b1: "Sigue a la persona para ver sus publicaciones en tu feed.",
        b2: "La pestaña Garaje muestra los coches que dejó públicos.",
        b3: "Los logros son el historial de quien usa Engine de verdad.",
        b4: "El Carné de Garaje es el documento de broma de Engine: se guarda y se publica.",
      },
      settings: {
        title: "Ajustes",
        summary: "Cuenta, privacidad, idioma, tema y lo que Engine puede mostrar de ti.",
        b1: "Elige qué queda público: coche, ciudad, garaje y escaparate.",
        b2: "Cambia idioma, tema y los avisos que quieres recibir.",
        b3: "Descarga tus datos o borra la cuenta: se va todo junto.",
      },
      plans: {
        title: "Planes",
        summary: "Qué es gratis para siempre y qué añade el plan de pago.",
        b1: "Todo lo que usas hoy sigue siendo gratis.",
        b2: "El plan de pago es para quien vive de los coches, no para quien tiene uno.",
        b3: "Cancela cuando quieras, sin llamar a nadie.",
      },
    },
    steps: {
      "j-hello": {
        title: "Bienvenido a Engine",
        body: "Son unos tres minutos para saber dónde está cada cosa. La guía te lleva de pantalla en pantalla, y nada es obligatorio: puedes saltarla cuando quieras.",
      },
      "j-menu": {
        title: "Cómo moverse",
        body: "En el ordenador el menú es esta barra lateral; en el móvil, la de abajo. Cuatro áreas: garaje, comunidad, servicios y eventos.",
      },
      "j-home": {
        title: "El Inicio",
        body: "Esta pantalla es el resumen: tus coches, lo que publicó la comunidad y los eventos que vienen. Si dudas, vuelve aquí.",
      },
      "j-garage-guest": {
        title: "El garaje es el principio",
        body: "Aquí entra tu coche: ficha técnica, gastos y recordatorios. Para tener el tuyo necesitas una cuenta: medio minuto y es gratis.",
      },
      "j-garage-add": {
        title: "Añade tu primer coche",
        body: "Marca, modelo y año. La ficha técnica, el consumo y la tabla de precios vienen con él; tú no escribes nada de eso.",
        cta: "Abrir el formulario",
      },
      "j-garage-card": {
        title: "Cada coche tiene su página",
        body: "Toca el coche para abrir ficha, fotos, gastos, recordatorios y los recuerdos que vayas guardando en él.",
      },
      "j-garage-costs": {
        title: "Cuánto cuesta de verdad",
        body: "Apunta combustible y mantenimiento: Engine suma impuesto, seguro y depreciación y muestra el coste real de tenerlo.",
      },
      "j-dashboard": {
        title: "El panel",
        body: "Los números del garaje en un solo sitio: gasto por coche, consumo medio y lo que vence pronto.",
      },
      "j-community-feed": {
        title: "Un feed solo de coches",
        body: "Quedadas, proyectos, mantenimiento y logros. Da me gusta, comenta y sigue a quien tiene un coche parecido al tuyo.",
      },
      "j-community-post": {
        title: "Tu primera publicación",
        body: "Foto, vídeo o texto. Etiqueta un coche de tu garaje y se vuelve un enlace en la publicación. Puedes probar ahora o dejarlo para después.",
        cta: "Abrir el editor",
      },
      "j-community-clubs": {
        title: "Las crews",
        body: "Clubes por marca, por modelo o por ciudad. Entrar es un toque, y lo que publicas en el muro de la crew lleva su sigla.",
      },
      "j-services": {
        title: "Servicios, Tiendas y Empresas",
        body: "De paso rápido: Servicios es quien trabaja en tu coche, Tiendas son piezas y accesorios, Empresas son los talleres y profesionales con cuenta en Engine.",
      },
      "j-services-quote": {
        title: "Presupuesto: cuéntalo una vez",
        body: "Describes el problema y quien atiende en tu ciudad responde con precio y plazo. Tu teléfono no se muestra a nadie.",
      },
      "j-events": {
        title: "Eventos y quedadas",
        body: "Track day, quedada del domingo, ruta de la crew. Filtra por tipo y estado, abre un evento y ves quién va, dices qué coche llevas y preguntas en los comentarios.",
      },
      "j-search": {
        title: "La búsqueda encuentra todo",
        body: "Gente, coches, crews, eventos, servicios y productos en el mismo campo. El camino más corto cuando ya sabes qué quieres.",
      },
      "j-profile": {
        title: "Tu perfil",
        body: "Es lo que ven los demás: publicaciones, el garaje que abriste, logros. Qué queda público lo decides tú.",
      },
      "j-wallet": {
        title: "El Carné de Garaje",
        body: "El documento de broma de Engine, con tu número de entrada. Puedes cambiar el fondo, guardarlo como imagen y publicarlo.",
      },
      "j-settings": {
        title: "Privacidad a tu ritmo",
        body: "Aquí eliges qué muestra Engine de ti: coche, ciudad, garaje y vitrina. La matrícula no aparece en ningún sitio, nunca.",
      },
      "j-account": {
        title: "Crea tu cuenta cuando quieras",
        body: "Puedes recorrer todo Engine sin cuenta. Con cuenta ganas garaje, publicaciones, presupuestos y asistencia a eventos.",
      },
      "j-help": {
        title: "Te trabaste en alguna pantalla?",
        body: "Toca aquí. El botón cambia con la pantalla: explica dónde estás, qué puedes hacer ahí y repite el paso a paso de esa parte.",
      },
      "j-done": {
        title: "Listo, es tuyo",
        body: "Ahora te toca: añade el coche y date una vuelta. Esta guía queda en el signo de interrogación de arriba, siempre que la quieras de nuevo.",
      },
      "home-nav": {
        title: "El menú",
        body: "Las cuatro áreas de Engine viven aquí: garaje, comunidad, servicios y eventos.",
      },
      "home-garage": {
        title: "Empieza por el coche",
        body: "Sin coche añadido, media app pierde la gracia. Es un minuto: marca, modelo y año.",
      },
      "home-community": {
        title: "Mira quién ya está aquí",
        body: "El feed muestra lo que publicó la comunidad. Sigue a quien tiene un coche como el tuyo.",
      },
      "home-help": {
        title: "La ayuda te acompaña",
        body: "Este botón cambia con la pantalla: siempre explica dónde estás y qué puedes hacer ahí.",
      },
      "garage-add": {
        title: "Añadir coche",
        body: "Elige marca, modelo y año. La ficha técnica, el consumo y la tabla de precios vienen con él.",
      },
      "garage-card": {
        title: "El coche por dentro",
        body: "Toca el coche para ver ficha técnica, fotos, gastos, recordatorios y los comentarios.",
      },
      "garage-costs": {
        title: "Cuánto cuesta de verdad",
        body: "Apunta combustible y mantenimiento y Engine suma impuesto, seguro y depreciación. Ese es el coste real.",
      },
      "community-post": {
        title: "Publicar",
        body: "Foto, vídeo o texto. Etiqueta un coche de tu garaje y se convierte en un enlace en la publicación.",
      },
      "community-feed": {
        title: "El feed",
        body: "Me gusta, comentar y seguir. Toca dos veces la foto para dar me gusta, como ya haces en todas partes.",
      },
      "services-tabs": {
        title: "Servicios, Tiendas y Empresas",
        body: "Servicios es lo que alguien hace en tu coche. Tiendas son piezas y accesorios. Empresas son los talleres y profesionales con cuenta.",
      },
      "services-quote": {
        title: "Pedir presupuesto",
        body: "Cuenta el problema una vez y quien atiende en tu ciudad responde con precio y plazo. Tu teléfono no aparece.",
      },
      "services-publish": {
        title: "Anunciar lo que haces",
        body: "Publicar es gratis. El anuncio pasa por revisión y, ya publicado, ves cuánta gente lo vio y te escribió.",
      },
      "events-create": {
        title: "Crear evento",
        body: "Fecha, lugar, tipo y foto. Quien confirme dice qué coche va a llevar.",
      },
      "events-card": {
        title: "Entrar en una quedada",
        body: "Abre el evento para ver quién va, darle me gusta y preguntar en los comentarios antes de confirmar.",
      },
    },
  },
};

i18n.addResourceBundle("pt-BR", "translation", ptBR, true, true);
i18n.addResourceBundle("en-US", "translation", enUS, true, true);
i18n.addResourceBundle("es-ES", "translation", esES, true, true);

export default i18n;
