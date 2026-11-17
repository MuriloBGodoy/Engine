import i18n from "./i18n";

/**
 * Textos de /sobre e /ajuda (17/11/2026).
 *
 * As duas páginas estavam declaradas no rodapé desde 25/09/2026 e apontavam
 * para lugar nenhum: `about` e `help.center` eram SEM_DESTINO, então o item
 * sumia da coluna. Antes de lançar, as duas passam a existir — quem chega do
 * Instagram quer saber quem está por trás, e quem trava no app precisa de um
 * lugar que não seja só um e-mail.
 *
 * O texto do /sobre sai do manifesto da marca ("Todo sonho precisa de um
 * motor", POST-1-LANCAMENTO.txt), e não de uma versão nova inventada aqui:
 * quem ler o Instagram e clicar no link tem que encontrar a mesma voz.
 *
 * Toda resposta do /ajuda foi conferida contra o código, não contra o que a
 * gente gostaria que o app fizesse. Onde a resposta dependia de uma regra do
 * banco (quem enxerga os gastos, o que vai para a vitrine), a regra foi lida
 * na migration antes de a frase ser escrita.
 */

const ptBR = {
  about: {
    eyebrow: "Sobre",
    title: "Todo sonho precisa de um motor.",
    subtitle:
      "O Engine é a rede de quem vive carro: a garagem, a comunidade e a conta do projeto no mesmo lugar.",
    why: {
      title: "Por que o Engine existe",
      lead:
        "Quem vive carro de verdade sabe que não é só ir de um ponto a outro. É a noite na oficina, a procura pela peça certa, o acerto do motor e a amizade que nasce em cada encontro. Só que até hoje todo entusiasta esbarrava nas mesmas quatro coisas:",
      lost: {
        title: "A foto do projeto se perde",
        body: "Três anos de obra espalhados na galeria do celular, sem ordem e sem história.",
      },
      noise: {
        title: "Rede comum não tem contexto",
        body: "O carro aparece no meio de tudo, para quem não sabe o que está olhando.",
      },
      word: {
        title: "Oficina boa só por indicação",
        body: "Quem acabou de chegar na cidade não tem a quem perguntar.",
      },
      cost: {
        title: "Ninguém soma a conta",
        body: "Peça, manutenção, IPVA, seguro e combustível entram soltos e o custo real nunca fecha.",
      },
    },
    pillars: {
      title: "O que tem aqui",
      lead:
        "Quatro frentes do mesmo peso. Nenhuma é o aplicativo principal com as outras penduradas.",
      garage: {
        title: "Garagem digital",
        body: "Ficha técnica, modificações, histórico, gastos, lembretes e quilometragem de cada carro seu.",
      },
      community: {
        title: "Comunidade, clubes e eventos",
        body: "Publicações com contexto, clubes por marca ou região e os encontros que acontecem perto de você.",
      },
      services: {
        title: "Serviços e oficinas",
        body: "Oficinas, preparadores e lojas por categoria e por cidade, com avaliação de quem já foi.",
      },
      cost: {
        title: "Custo real de posse",
        body: "O simulador soma depreciação, IPVA, seguro, combustível e manutenção antes de você decidir.",
      },
    },
    money: {
      title: "Como o Engine se paga",
      body:
        "Para quem tem carro, o Engine é de graça — e a ideia é continuar assim. Cadastrar carro, publicar, entrar em clube, ir a evento e usar o simulador não custa nada e não tem limite escondido.",
      body2:
        "Quem paga é quem vende: a oficina, o preparador e a loja que anunciam para a comunidade. Quem quiser apoiar também pode, por vontade, sem ganhar nada que os outros não tenham.",
      plans: "Ver os planos",
      support: "Apoiar o Engine",
    },
    who: {
      title: "Quem faz",
      body:
        "O Engine é um projeto independente, feito no Brasil e operado por Murilo Godoy. Não tem investidor, não tem escritório e não vende seus dados para ninguém.",
      body2:
        "Está no ar desde 2026 e cresce pelo que a comunidade pede. Se faltar alguma coisa aqui, o caminho mais curto é mandar um e-mail — ele chega direto em quem escreve o código.",
      contact: "Falar com a gente",
    },
    cta: {
      title: "O motor já está ligado.",
      body: "Cadastre seu primeiro carro de graça e veja como fica.",
      primary: "Criar minha conta",
      secondary: "Ver a comunidade",
    },
  },

  help: {
    eyebrow: "Ajuda",
    title: "Central de ajuda",
    subtitle: "As dúvidas que mais aparecem, respondidas direto. Se a sua não estiver aqui, escreve pra gente.",
    searchPlaceholder: "Procurar na ajuda",
    empty: 'Nenhuma resposta combina com "{{term}}".',
    emptyHint: "Tente outra palavra, ou mande sua dúvida por e-mail.",
    groups: {
      account: "Conta",
      garage: "Garagem",
      privacy: "Privacidade",
      community: "Comunidade",
      services: "Serviços e oficinas",
    },
    q: {
      free: {
        q: "O Engine é grátis?",
        a: "É. Criar conta, cadastrar seus carros, publicar, entrar em clubes, ver eventos e usar o simulador de custo não custa nada. Os planos pagos são para quem anuncia serviço para a comunidade, e existe uma assinatura opcional para quem quiser apoiar o projeto.",
      },
      password: {
        q: "Esqueci minha senha.",
        a: 'Na tela de entrar, toque em "Esqueci minha senha" e informe o e-mail da conta. Chega uma mensagem com um link para criar uma nova. Se não aparecer em alguns minutos, olhe o spam: o remetente é o domínio do Engine.',
      },
      username: {
        q: "Como mudo meu @, meu nome ou minha foto?",
        a: "Em Configurações › Perfil. O @ é único no Engine e é por ele que seu perfil é encontrado, então trocar muda o endereço do seu perfil.",
      },
      deleteAccount: {
        q: "Como apago minha conta?",
        a: "Em Configurações › Conta › Excluir conta. A exclusão é em cascata: carros, publicações, comentários, conversas e listas vão junto, e não dá para desfazer. Se você só quer uma cópia de tudo antes, Configurações › Seus dados monta o arquivo na hora.",
      },
      addCar: {
        q: "Como cadastro meu carro?",
        a: "Na Garagem, toque em adicionar e escolha marca, modelo e ano. A lista vem da tabela FIPE, então o que você escolhe ali já traz o preço de referência junto. Depois dá para pôr apelido, fotos, modificações e o resto da ficha.",
      },
      specs: {
        q: "A ficha técnica do meu carro está errada.",
        a: "A ficha descreve a VERSÃO do modelo, não o seu carro depois das modificações — por isso ela pode não bater com o que está na sua garagem. Todo campo é editável: abra a ficha e corrija o que estiver diferente.",
      },
      fipe: {
        q: "De onde vem o preço do meu carro?",
        a: "Da tabela FIPE, que muda uma vez por mês. Quando o valor do seu carro se mexe, o app avisa e mostra de quanto para quanto — mas nunca troca sozinho. O preço que você guardou continua valendo até você decidir atualizar.",
      },
      whoSees: {
        q: "Quem vê meus gastos, lembretes e quilometragem?",
        a: "Só você. Sua garagem é privada: no banco, cada carro é lido apenas pelo dono, e gasto, lembrete e quilometragem ficam dentro do carro. Nem outro usuário nem quem não tem conta alcança isso.",
      },
      showcase: {
        q: "E se eu quiser mostrar meu carro?",
        a: "Aí você publica ele na vitrine, e só esse carro fica visível. Vai o que é do carro — ficha, fotos, modificações — e não a sua conta: gastos, lembretes e quilometragem continuam de fora. Dá para tirar da vitrine quando quiser.",
      },
      plate: {
        q: "A placa do meu carro aparece nas fotos?",
        a: "Só se você quiser. Ao publicar uma foto, o app oferece cobrir a placa antes de ela ir para o ar, e o borrão é aplicado na imagem, não é um adesivo por cima que alguém remove depois.",
      },
      wallet: {
        q: "O que é a carteira e quem enxerga a minha?",
        a: "É o seu cartão de membro: número de inscrição pela ordem de criação da conta, seu @, sua região e o que você já construiu aqui. Por padrão ela fica visível para quem abre seu perfil, e você desliga na própria carteira ou em Configurações › Privacidade.",
      },
      clubs: {
        q: "Como entro num clube ou crio um evento?",
        a: "Clubes ficam na aba Clubes: dá para entrar nos que existem ou criar o seu. Eventos ficam na aba Eventos, mostram o que acontece perto de você e qualquer pessoa com conta pode publicar um — quem vai confirma presença ali mesmo.",
      },
      report: {
        q: "Alguém me incomodou no app.",
        a: "Em qualquer publicação, comentário ou perfil você pode denunciar e bloquear. Bloqueio some com a pessoa para você dos dois lados, e a denúncia vai para a moderação com o conteúdo junto. Em caso grave, escreva para a gente por e-mail.",
      },
      provider: {
        q: "Tenho uma oficina. Como apareço no Engine?",
        a: "Crie sua conta normalmente e publique seu serviço na aba Serviços, escolhendo a categoria e a cidade. Ele entra no mesmo instante e aparece para quem procura aquela categoria na sua região; o perfil profissional vira também um endereço público seu, para pôr no link da bio.",
      },
      quote: {
        q: "Como peço um orçamento?",
        a: "Na página do serviço existe o pedido de orçamento: você descreve o que precisa, diz qual carro é e o prestador responde na conversa do Engine, sem você passar telefone para estranho.",
      },
      category: {
        q: "Minha categoria de serviço não está na lista.",
        a: "São 38 categorias, de radiador a funilaria, injeção e blindagem. Se a sua faltar mesmo assim, mande o nome por e-mail: incluir é rápido e vale para todo mundo da mesma área.",
      },
    },
    contact: {
      title: "Não achou o que precisava?",
      body: "Escreva para a gente. O e-mail chega direto em quem escreve o código do Engine, e toda mensagem é lida.",
      button: "Mandar um e-mail",
      about: "Conhecer o Engine",
    },
  },
};

const enUS = {
  about: {
    eyebrow: "About",
    title: "Every dream needs an engine.",
    subtitle:
      "Engine is the network for people who live cars: the garage, the community and the real cost of the build, all in one place.",
    why: {
      title: "Why Engine exists",
      lead:
        "Anyone who truly lives cars knows it is not about getting from A to B. It is the night in the shop, the hunt for the right part, the tune and the friendships made at every meet. And yet every enthusiast kept running into the same four things:",
      lost: {
        title: "Build photos get lost",
        body: "Three years of work scattered across a phone gallery, with no order and no story.",
      },
      noise: {
        title: "Regular feeds have no context",
        body: "The car shows up among everything else, to people who have no idea what they are looking at.",
      },
      word: {
        title: "Good shops only by word of mouth",
        body: "Someone who just moved to town has nobody to ask.",
      },
      cost: {
        title: "Nobody adds up the bill",
        body: "Parts, service, tax, insurance and fuel come in loose, and the real cost never adds up.",
      },
    },
    pillars: {
      title: "What you get",
      lead: "Four fronts of equal weight. None of them is the main app with the others bolted on.",
      garage: {
        title: "Digital garage",
        body: "Spec sheet, modifications, history, expenses, reminders and mileage for each of your cars.",
      },
      community: {
        title: "Community, clubs and events",
        body: "Posts with context, clubs by brand or region, and the meets happening near you.",
      },
      services: {
        title: "Shops and services",
        body: "Shops, tuners and stores by category and city, rated by people who have been there.",
      },
      cost: {
        title: "True cost of ownership",
        body: "The simulator adds depreciation, taxes, insurance, fuel and maintenance before you decide.",
      },
    },
    money: {
      title: "How Engine pays for itself",
      body:
        "If you own a car, Engine is free — and the plan is to keep it that way. Adding cars, posting, joining clubs, going to meets and running the simulator costs nothing, with no hidden ceiling.",
      body2:
        "The ones who pay are the ones who sell: the shops, tuners and stores advertising to the community. Anyone who wants to support the project can, by choice, without getting anything others do not have.",
      plans: "See the plans",
      support: "Support Engine",
    },
    who: {
      title: "Who builds it",
      body:
        "Engine is an independent project, built in Brazil and operated by Murilo Godoy. No investors, no office, and your data is not for sale.",
      body2:
        "It has been live since 2026 and grows with what the community asks for. If something is missing, the shortest path is an email — it lands straight with the person who writes the code.",
      contact: "Get in touch",
    },
    cta: {
      title: "The engine is already running.",
      body: "Add your first car for free and see how it looks.",
      primary: "Create my account",
      secondary: "See the community",
    },
  },

  help: {
    eyebrow: "Help",
    title: "Help center",
    subtitle: "The questions that come up most, answered straight. If yours is not here, write to us.",
    searchPlaceholder: "Search help",
    empty: 'No answer matches "{{term}}".',
    emptyHint: "Try another word, or send your question by email.",
    groups: {
      account: "Account",
      garage: "Garage",
      privacy: "Privacy",
      community: "Community",
      services: "Shops and services",
    },
    q: {
      free: {
        q: "Is Engine free?",
        a: "It is. Creating an account, adding your cars, posting, joining clubs, browsing events and using the cost simulator costs nothing. The paid plans are for businesses advertising to the community, and there is an optional subscription for anyone who wants to support the project.",
      },
      password: {
        q: "I forgot my password.",
        a: 'On the sign-in screen, tap "Forgot my password" and enter your account email. You get a message with a link to set a new one. If it does not show up in a few minutes, check spam: the sender is the Engine domain.',
      },
      username: {
        q: "How do I change my @, my name or my photo?",
        a: "In Settings › Profile. Your @ is unique on Engine and it is how your profile is found, so changing it changes your profile address.",
      },
      deleteAccount: {
        q: "How do I delete my account?",
        a: "Settings › Account › Delete account. The deletion cascades: cars, posts, comments, conversations and lists go with it, and it cannot be undone. If you only want a copy of everything first, Settings › Your data builds the file on the spot.",
      },
      addCar: {
        q: "How do I add my car?",
        a: "In the Garage, tap add and pick make, model and year. The list comes from the Brazilian FIPE table, so what you pick already brings the reference price with it. After that you can add a nickname, photos, modifications and the rest of the spec sheet.",
      },
      specs: {
        q: "My car's spec sheet is wrong.",
        a: "The sheet describes the VERSION of the model, not your car after the modifications — which is why it may not match what sits in your garage. Every field is editable: open the sheet and fix whatever is different.",
      },
      fipe: {
        q: "Where does my car's price come from?",
        a: "From the FIPE table, which changes once a month. When your car's value moves, the app tells you and shows from how much to how much — but it never swaps it on its own. The price you saved stands until you decide to update it.",
      },
      whoSees: {
        q: "Who sees my expenses, reminders and mileage?",
        a: "Only you. Your garage is private: in the database each car is readable by its owner alone, and expenses, reminders and mileage live inside the car. No other user and no visitor can reach them.",
      },
      showcase: {
        q: "What if I do want to show my car?",
        a: "Then you publish it to the showcase, and only that car becomes visible. What goes out belongs to the car — spec sheet, photos, modifications — not to your books: expenses, reminders and mileage stay out. You can pull it from the showcase whenever you like.",
      },
      plate: {
        q: "Does my licence plate show up in photos?",
        a: "Only if you want it to. When you post a photo, the app offers to cover the plate before it goes up, and the blur is baked into the image — not a sticker on top that someone can peel off later.",
      },
      wallet: {
        q: "What is the member card, and who sees mine?",
        a: "It is your membership card: a number given by the order your account was created, your @, your region and what you have built here. By default it is visible to anyone who opens your profile, and you can switch it off on the card itself or in Settings › Privacy.",
      },
      clubs: {
        q: "How do I join a club or create an event?",
        a: "Clubs live in the Clubs tab: join one that exists or start your own. Events live in the Events tab, show what is happening near you, and anyone with an account can post one — people confirm they are coming right there.",
      },
      report: {
        q: "Someone is bothering me on the app.",
        a: "On any post, comment or profile you can report and block. Blocking hides the person from you both ways, and a report reaches moderation with the content attached. For anything serious, email us.",
      },
      provider: {
        q: "I run a shop. How do I show up on Engine?",
        a: "Create your account as usual and publish your service in the Services tab, choosing the category and the city. It goes live right away and shows up for people searching that category in your region; your business profile also becomes a public address of your own, for the link in your bio.",
      },
      quote: {
        q: "How do I ask for a quote?",
        a: "On the service page there is a quote request: you describe what you need, say which car it is, and the shop answers in the Engine chat — no handing your phone number to a stranger.",
      },
      category: {
        q: "My service category is not on the list.",
        a: "There are 38 categories, from radiators to bodywork, injection and armouring. If yours is still missing, send the name by email: adding one is quick and it serves everyone in that trade.",
      },
    },
    contact: {
      title: "Did not find what you needed?",
      body: "Write to us. The email lands straight with the person who writes Engine's code, and every message gets read.",
      button: "Send an email",
      about: "Get to know Engine",
    },
  },
};

const esES = {
  about: {
    eyebrow: "Acerca de",
    title: "Todo sueño necesita un motor.",
    subtitle:
      "Engine es la red de quien vive el auto: el garaje, la comunidad y la cuenta real del proyecto en un solo lugar.",
    why: {
      title: "Por qué existe Engine",
      lead:
        "Quien vive el auto de verdad sabe que no se trata de ir de un punto a otro. Es la noche en el taller, la búsqueda de la pieza correcta, la puesta a punto y la amistad que nace en cada encuentro. Y aun así, todo entusiasta chocaba con las mismas cuatro cosas:",
      lost: {
        title: "Las fotos del proyecto se pierden",
        body: "Tres años de trabajo repartidos por la galería del celular, sin orden y sin historia.",
      },
      noise: {
        title: "Las redes comunes no tienen contexto",
        body: "El auto aparece entre todo lo demás, para quien no sabe lo que está mirando.",
      },
      word: {
        title: "Al buen taller solo se llega por recomendación",
        body: "Quien acaba de llegar a la ciudad no tiene a quién preguntar.",
      },
      cost: {
        title: "Nadie suma la cuenta",
        body: "Piezas, mantenimiento, impuestos, seguro y combustible entran sueltos y el costo real nunca cierra.",
      },
    },
    pillars: {
      title: "Qué hay aquí",
      lead: "Cuatro frentes del mismo peso. Ninguna es la app principal con las otras colgadas.",
      garage: {
        title: "Garaje digital",
        body: "Ficha técnica, modificaciones, historial, gastos, recordatorios y kilometraje de cada auto tuyo.",
      },
      community: {
        title: "Comunidad, clubes y eventos",
        body: "Publicaciones con contexto, clubes por marca o región y los encuentros que pasan cerca de ti.",
      },
      services: {
        title: "Talleres y servicios",
        body: "Talleres, preparadores y tiendas por categoría y ciudad, con la opinión de quien ya fue.",
      },
      cost: {
        title: "Costo real de tener el auto",
        body: "El simulador suma depreciación, impuestos, seguro, combustible y mantenimiento antes de que decidas.",
      },
    },
    money: {
      title: "Cómo se sostiene Engine",
      body:
        "Para quien tiene auto, Engine es gratis — y la idea es que siga así. Registrar autos, publicar, entrar en clubes, ir a encuentros y usar el simulador no cuesta nada y no tiene límite escondido.",
      body2:
        "Quien paga es quien vende: el taller, el preparador y la tienda que anuncian a la comunidad. Quien quiera apoyar también puede, por voluntad, sin recibir nada que los demás no tengan.",
      plans: "Ver los planes",
      support: "Apoyar Engine",
    },
    who: {
      title: "Quién lo hace",
      body:
        "Engine es un proyecto independiente, hecho en Brasil y operado por Murilo Godoy. Sin inversores, sin oficina, y tus datos no se venden a nadie.",
      body2:
        "Está en línea desde 2026 y crece con lo que la comunidad pide. Si falta algo, el camino más corto es un correo — llega directo a quien escribe el código.",
      contact: "Hablar con nosotros",
    },
    cta: {
      title: "El motor ya está encendido.",
      body: "Registra tu primer auto gratis y mira cómo queda.",
      primary: "Crear mi cuenta",
      secondary: "Ver la comunidad",
    },
  },

  help: {
    eyebrow: "Ayuda",
    title: "Centro de ayuda",
    subtitle: "Las dudas que más aparecen, respondidas directo. Si la tuya no está aquí, escríbenos.",
    searchPlaceholder: "Buscar en la ayuda",
    empty: 'Ninguna respuesta coincide con "{{term}}".',
    emptyHint: "Prueba con otra palabra, o manda tu duda por correo.",
    groups: {
      account: "Cuenta",
      garage: "Garaje",
      privacy: "Privacidad",
      community: "Comunidad",
      services: "Talleres y servicios",
    },
    q: {
      free: {
        q: "¿Engine es gratis?",
        a: "Sí. Crear la cuenta, registrar tus autos, publicar, entrar en clubes, ver eventos y usar el simulador de costos no cuesta nada. Los planes de pago son para quien anuncia servicios a la comunidad, y hay una suscripción opcional para quien quiera apoyar el proyecto.",
      },
      password: {
        q: "Olvidé mi contraseña.",
        a: 'En la pantalla de entrar, toca "Olvidé mi contraseña" e indica el correo de la cuenta. Llega un mensaje con un enlace para crear una nueva. Si no aparece en unos minutos, revisa el spam: el remitente es el dominio de Engine.',
      },
      username: {
        q: "¿Cómo cambio mi @, mi nombre o mi foto?",
        a: "En Ajustes › Perfil. Tu @ es único en Engine y es por donde se encuentra tu perfil, así que cambiarlo cambia la dirección de tu perfil.",
      },
      deleteAccount: {
        q: "¿Cómo borro mi cuenta?",
        a: "En Ajustes › Cuenta › Eliminar cuenta. El borrado es en cascada: autos, publicaciones, comentarios, conversaciones y listas se van con ella, y no se puede deshacer. Si solo quieres una copia de todo antes, Ajustes › Tus datos arma el archivo al momento.",
      },
      addCar: {
        q: "¿Cómo registro mi auto?",
        a: "En el Garaje, toca agregar y elige marca, modelo y año. La lista viene de la tabla FIPE brasileña, así que lo que eliges ya trae el precio de referencia. Después puedes poner apodo, fotos, modificaciones y el resto de la ficha.",
      },
      specs: {
        q: "La ficha técnica de mi auto está mal.",
        a: "La ficha describe la VERSIÓN del modelo, no tu auto después de las modificaciones — por eso puede no coincidir con lo que está en tu garaje. Todo campo es editable: abre la ficha y corrige lo que esté distinto.",
      },
      fipe: {
        q: "¿De dónde sale el precio de mi auto?",
        a: "De la tabla FIPE, que cambia una vez al mes. Cuando el valor de tu auto se mueve, la app avisa y muestra de cuánto a cuánto — pero nunca lo cambia sola. El precio que guardaste vale hasta que decidas actualizarlo.",
      },
      whoSees: {
        q: "¿Quién ve mis gastos, recordatorios y kilometraje?",
        a: "Solo tú. Tu garaje es privado: en la base de datos cada auto lo lee únicamente su dueño, y gasto, recordatorio y kilometraje viven dentro del auto. Ni otro usuario ni un visitante llegan ahí.",
      },
      showcase: {
        q: "¿Y si sí quiero mostrar mi auto?",
        a: "Entonces lo publicas en la vitrina, y solo ese auto queda visible. Sale lo que es del auto — ficha, fotos, modificaciones — y no tus cuentas: gastos, recordatorios y kilometraje se quedan fuera. Puedes sacarlo de la vitrina cuando quieras.",
      },
      plate: {
        q: "¿La patente de mi auto aparece en las fotos?",
        a: "Solo si tú quieres. Al publicar una foto, la app ofrece tapar la patente antes de que salga, y el difuminado queda dentro de la imagen — no es una calcomanía encima que alguien pueda quitar después.",
      },
      wallet: {
        q: "¿Qué es la credencial y quién ve la mía?",
        a: "Es tu tarjeta de miembro: un número dado por el orden en que se creó la cuenta, tu @, tu región y lo que ya construiste aquí. Por defecto es visible para quien abre tu perfil, y la apagas en la propia credencial o en Ajustes › Privacidad.",
      },
      clubs: {
        q: "¿Cómo entro en un club o creo un evento?",
        a: "Los clubes están en la pestaña Clubes: puedes entrar en los que existen o crear el tuyo. Los eventos están en la pestaña Eventos, muestran lo que pasa cerca de ti y cualquiera con cuenta puede publicar uno — quien va confirma ahí mismo.",
      },
      report: {
        q: "Alguien me está molestando en la app.",
        a: "En cualquier publicación, comentario o perfil puedes denunciar y bloquear. El bloqueo oculta a la persona de ambos lados, y la denuncia llega a moderación con el contenido adjunto. Si es algo grave, escríbenos por correo.",
      },
      provider: {
        q: "Tengo un taller. ¿Cómo aparezco en Engine?",
        a: "Crea tu cuenta normalmente y publica tu servicio en la pestaña Servicios, eligiendo la categoría y la ciudad. Entra al instante y aparece para quien busca esa categoría en tu región; tu perfil profesional también se vuelve una dirección pública tuya, para el enlace de la bio.",
      },
      quote: {
        q: "¿Cómo pido un presupuesto?",
        a: "En la página del servicio está el pedido de presupuesto: describes lo que necesitas, dices qué auto es y el taller responde en el chat de Engine, sin que tengas que dar tu teléfono a un desconocido.",
      },
      category: {
        q: "Mi categoría de servicio no está en la lista.",
        a: "Son 38 categorías, desde radiadores hasta chapa y pintura, inyección y blindaje. Si aun así falta la tuya, manda el nombre por correo: agregarla es rápido y sirve para todos los del rubro.",
      },
    },
    contact: {
      title: "¿No encontraste lo que buscabas?",
      body: "Escríbenos. El correo llega directo a quien escribe el código de Engine, y todo mensaje se lee.",
      button: "Mandar un correo",
      about: "Conocer Engine",
    },
  },
};

i18n.addResourceBundle("pt-BR", "translation", ptBR, true, true);
i18n.addResourceBundle("en-US", "translation", enUS, true, true);
i18n.addResourceBundle("es-ES", "translation", esES, true, true);

export default i18n;
