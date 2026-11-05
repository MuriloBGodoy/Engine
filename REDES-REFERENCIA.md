# Engenharia reversa de redes sociais — regras, não funcionalidades

Começado em 04/11/2026.

Este documento existe porque a gente já fazia isto sem dizer: print do
Instagram → medir o que eles fazem → consertar o Engine. Funcionou todas as
vezes. O que faltava era escrever a **regra** que saiu de cada conserto, para
ela valer em tela que ainda nem existe.

## A regra das regras

**Copiar a gramática, não a funcionalidade.**

Gramática é onde o polegar vai, o que um toque num nome faz, o que é folha e o
que é página, quantos toques até a coisa que a pessoa veio buscar. Isso é
universal: a pessoa chega no Engine com a memória muscular do Instagram no
dedo, e brigar com ela só custa.

Funcionalidade é outra coisa. Stories, notas, close friends, canal de
transmissão — existem para resolver problema **do Instagram** (inventário de
anúncio, reter DAU, segurar criador). Trazer para cá importa problema que o
Engine não tem.

## A armadilha da densidade

O Engine tem punhados de perfis e publicações. As mecânicas do Instagram de
2026 são afinadas para bilhões de usuários, e várias **pioram** com pouca
gente: ranking com 6 carros, trending com 3 posts, feed algorítmico sem nada
para ordenar.

Copiar o Instagram de hoje dá um estádio com cinco pessoas dentro. O que o
Engine precisa agora é o contrário — mecânica que faz cinco pessoas parecerem
um lugar. Nisso o Instagram de 2011, um fórum ou um Discord ensinam mais que
o Instagram de 2026.

## As referências, e por que cada uma

| Rede | Para quê |
|---|---|
| **Strava** | A mais parecida com o Engine e quase ninguém percebe: rede social cujo objeto é uma atividade **com dados**, como aqui o objeto é um carro com ficha e custo. Como número vira conteúdo social é exatamente o nosso problema. |
| **Instagram** | Só a gramática de interação. Nada de conjunto de funcionalidades. |
| **Webmotors / OLX** | O lado marketplace, e o vocabulário que o brasileiro já tem na cabeça quando procura carro. |
| **iFood** | Padrão de celular brasileiro: como pedem permissão, como tratam região, como não assustam. |

## Regras já extraídas

Cada uma saiu de um conserto de verdade, com a data.

### Gramática de toque

- **R1.** Nome de pessoa, @ e retrato **sempre** abrem o perfil dela, em
  qualquer tela. Se não há @ para abrir (conta apagada), vira texto comum —
  nunca um link quebrado. *(04/11/2026, `PersonLink`)*
- **R2.** O @ **é** o nome. Não adianta só o nome de exibição responder ao
  toque. *(04/11/2026)*
- **R3.** Nada que o dedo alcança abaixo de 44px. Quando o desenho pede menor,
  o alvo cresce por fora com margem negativa e o desenho fica do tamanho que o
  layout pede. *(`check:android`)*
- **R4.** Ícone claro sobre foto precisa de disco escuro atrás. Sombra só não
  resolve em foto clara. *(04/11/2026, marcador da aba Carros)*

### Folha, página e modal

- **R5.** **Conversa é folha, conteúdo é página.** Comentário sobe por cima e
  o conteúdo fica atrás, à vista; fechar devolve a pessoa exatamente onde
  estava. Sair da página para ler comentário é o que faz a pessoa perder o
  lugar. *(04/11/2026, comentários dos vídeos)*
- **R6.** Modal tem o tamanho do **conteúdo de referência**, não da tela. O
  lightbox foi a 1463px num monitor grande e deixou de parecer um post aberto.
  Teto de 700×720 na mídia → painel em ~1100px. *(04/11/2026)*
- **R7.** Folha montada dentro de ancestral com `transform`/`backdrop-filter`
  vai para o `document.body` por portal, senão o `position: fixed` gruda no
  ancestral. *(armadilha recorrente desde 21/08/2026)*
- **R8.** O voltar do aparelho fecha a folha, não sai da página
  (`useHistoryDismiss`).

### Escrever

- **R9.** Campo de escrita que aceita `@` **tem que** ter lista de sugestão.
  Sem ela, só quem decora o @ acerta, e o erro é silencioso: sem link, sem
  aviso, texto cinza. *(04/11/2026)*
- **R10.** Lista de sugestão colada no pé da tela abre **para cima**.
- **R11.** Campo de uma linha cresce com o texto até um teto. Caixa de uma
  linha que rola por dentro é pior que não ter caixa.
- **R12.** Enter envia, Shift+Enter quebra linha — e enquanto a lista de
  sugestão está aberta o Enter é dela.

### Guardar e desfazer

- **R13.** **Tirar do ar nunca pode ter só o caminho destrutivo.** Arquivar
  antes de excluir. Quem só queria sumir com uma coisa não deveria pagar com
  as curtidas e a conversa dos outros. *(04/11/2026)*
- **R14.** Quando algo "some", quem esconde é o **banco**, não cada consulta.
  Uma porta, não uma dúzia de filtros que precisam todos estar certos — basta
  um `select` esquecido para o arquivado reaparecer. *(04/11/2026)*
- **R15.** **Curtir é recado para o dono; salvar é bilhete para mim.** São
  botões diferentes com propósitos diferentes e nenhum substitui o outro.
  *(04/11/2026)*
- **R16.** Salvar vale para **qualquer coisa que a pessoa queira reencontrar**,
  não só post. Aqui o que se guarda é carro.
- **R17.** Salvos e arquivadas moram no perfil, mas a cabeça da pessoa manda
  ela para **Configurações**. Ter as duas portas é barato; ter só uma custa a
  funcionalidade inteira.

### Relação entre pessoas

- **R18.** Entre seguir e bloquear tem que existir **silenciar**. Sem ele a
  pessoa escolhe entre um ato social (deixar de seguir, que o outro vê) e uma
  ruptura. *(04/11/2026)*
- **R19.** **Silêncio é preferência; bloqueio é segurança.** Bloqueio o banco
  garante, porque alguém depende dele para não ser alcançado. Silêncio é
  arrumação da minha tela e quem aplica é o feed. Confundir acaba em
  "silenciei e ela não recebe mais minha mensagem".
- **R20.** Silenciar para no feed. Comentário e perfil continuam inteiros —
  senão vira um bloqueio que não avisa que é um.
- **R21.** No menu, a saída leve vem **antes** da pesada, e sem vermelho.
- **R22.** Responder tem que ter **um nível só**. Árvore de profundidade livre
  num celular vira coluna de 20px. *(04/11/2026)*
- **R23.** Quem é respondido **é avisado**. Antes só o dono do post sabia que
  havia conversa. *(04/11/2026)*

### Dados de pessoa

- **R24.** Nome, @ e retrato guardados junto de um post, comentário ou conversa
  são **cópia do dia em que aquilo foi escrito**. Quem troca de @ deixa cópias
  velhas espalhadas. Toda navegação para perfil resolve pelo **uid**, que não
  envelhece; a cópia guardada é só a rede de segurança. *(05/11/2026, bug real
  relatado do chat)*
- **R25.** A cópia guardada não é lixo: é o que aparece antes do perfil chegar
  e o que sobra quando a conta é apagada. Perfil entra por **sobreposição**,
  não por troca, e campo vazio não apaga o que a cópia tinha.

### Vazio

- **R26.** O estado vazio é a tela mais vista de uma rede nova. Ele tem que
  dizer o que fazer, não só que não há nada.

## Ainda não resolvido

- **Conta privada.** O banco já tem `account_visible()`; a decisão de produto
  está aberta. Inclui a seção "No Engine", que o Murilo quer poder esconder.
- **Baixar meus dados.** Toda rede tem, e a LGPD (art. 18, portabilidade) pede.
  O Engine tem exclusão de conta em cascata, mas não exportação.
- **Coleções dentro de Salvos.** Só vale quando houver volume para justificar.
- **Salvar anúncio de serviço.** Mesma forma de `saved_cars`, quando a aba de
  Serviços pedir.
- **Primeira sessão.** O que a pessoa vê nos primeiros 30 segundos — é onde a
  densidade baixa mais machuca, e é o que menos foi olhado até agora.
