// RECODIFICAR O VÍDEO NO APARELHO, ANTES DE SUBIR.
//
// POR QUE ISTO EXISTE. Até aqui o arquivo subia como saiu da câmera e o corte
// era só metadado: o player tocava o trecho escolhido, mas o arquivo guardado
// era o original inteiro. Isso custava em três lugares ao mesmo tempo:
//
//   - 60 s gravados em 1080p por um celular Android dão 100–130 MB. Subir
//     isso no 4G de um estacionamento falha no meio, e quem está mostrando o
//     carro não tenta de novo.
//   - a conta de armazenamento tem teto de tráfego. Um arquivo de 120 MB
//     aguenta umas 40 visualizações no mês e acaba a franquia do app inteiro.
//   - um vídeo de 3 minutos subia inteiro para tocar 15 s.
//
// O que esta recodificação faz: toca o TRECHO escolhido num `<video>`
// escondido, desenha quadro por quadro num canvas do tamanho de destino, e
// grava canvas + áudio com o MediaRecorder. Sai um arquivo novo, só com o
// trecho, em 720p, com a mesma trilha sonora — tipicamente 15 a 25 MB no
// lugar de 120.
//
// POR QUE NÃO WEBCODECS, QUE SERIA MAIS RÁPIDO. `VideoEncoder` codifica
// rápido, mas para DECODIFICAR o arquivo de origem ele precisa dos pacotes já
// separados do mp4 — ou seja, de um demuxer (mp4box.js e companhia, mais
// umas centenas de kB) — e o áudio precisaria do mesmo trabalho em dobro.
// Áudio não é opcional aqui: em vídeo de carro o som do motor é metade do
// conteúdo. O caminho do MediaRecorder não precisa de demuxer nenhum porque
// quem decodifica é o próprio `<video>`.
//
// O CUSTO, dito na cara: é TEMPO REAL. 40 s de trecho levam 40 s de espera,
// porque o áudio não pode ser acelerado. A tela avisa e mostra o progresso. A
// troca ainda compensa: 20 MB sobem em segundos no 4G, 120 MB não sobem.
//
// E se qualquer parte faltar no aparelho (iPhone antigo, navegador sem
// MediaRecorder), nada disso roda e o app volta ao caminho de antes — subir o
// original. Recodificação é melhoria, não requisito.

/** Lado curto de destino. 720 é o piso do que não parece ruim em celular. */
const LADO_CURTO = 720;
/** Lado longo de destino: 1280 — 720p de verdade, em pé ou deitado. */
const LADO_LONGO = 1280;
/** ~2,5 Mbps: 60 s dão por volta de 19 MB. */
const BITRATE_VIDEO = 2_500_000;
const BITRATE_AUDIO = 128_000;
const FPS = 30;

/**
 * Formatos tentados, na ordem. MP4/H.264 primeiro porque toca em tudo,
 * inclusive no iPhone; WebM só como plano B, onde o navegador não grava MP4.
 */
const FORMATOS = [
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  'video/mp4;codecs="avc1.42E01E"',
  "video/mp4",
  'video/webm;codecs="vp9,opus"',
  'video/webm;codecs="vp8,opus"',
  "video/webm",
];

const formatoDisponivel = () => {
  if (typeof window === "undefined" || !window.MediaRecorder) return "";
  return FORMATOS.find((tipo) => {
    try {
      return window.MediaRecorder.isTypeSupported(tipo);
    } catch {
      return false;
    }
  }) || "";
};

/** O aparelho sabe recodificar? */
export function podeRecodificar() {
  if (typeof document === "undefined") return false;
  if (!formatoDisponivel()) return false;
  const canvas = document.createElement("canvas");
  if (typeof canvas.captureStream !== "function") return false;
  // `requestVideoFrameCallback` é o que permite desenhar UM quadro por quadro
  // decodificado em vez de amostrar o canvas no escuro. Sem ele o vídeo sai
  // com quadros repetidos e tremido.
  if (!("requestVideoFrameCallback" in HTMLVideoElement.prototype)) return false;
  return true;
}

/**
 * Vale a pena recodificar este arquivo?
 *
 * Só quando há o que ganhar: arquivo grande, ou resolução acima do destino,
 * ou trecho bem menor que o vídeo inteiro. Recodificar um clipe de 4 MB que
 * já está em 720p só perderia qualidade e tempo.
 */
export function precisaRecodificar(file, source, { trimStart = 0, trimEnd = 0 } = {}) {
  const bytes = Number(file?.size) || 0;
  const curto = Math.min(Number(source?.width) || 0, Number(source?.height) || 0);
  const trecho = Math.max(0, (Number(trimEnd) || 0) - (Number(trimStart) || 0));
  const total = Number(source?.duration) || 0;

  if (bytes > 24 * 1024 * 1024) return true;
  if (curto > LADO_CURTO + 48) return true;
  // Sobra mais de um terço do vídeo fora do trecho: cortar de verdade já paga.
  if (total > 0 && trecho > 0 && trecho < total * 0.66) return true;
  return false;
}

/** O tamanho de destino, em números pares (H.264 exige). */
export function tamanhoDestino(width, height) {
  const w = Math.max(2, Math.round(Number(width) || 0));
  const h = Math.max(2, Math.round(Number(height) || 0));
  const curto = Math.min(w, h);
  const longo = Math.max(w, h);
  const escala = Math.min(1, LADO_CURTO / curto, LADO_LONGO / longo);
  const par = (valor) => Math.max(2, Math.round((valor * escala) / 2) * 2);
  return { width: par(w), height: par(h) };
}

const esperar = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * A trilha de áudio, capturada pelo Web Audio.
 *
 * Por que não `video.captureStream()` direto: ali o áudio da captura é o
 * áudio que SAI no alto-falante, então ou a pessoa ouve o vídeo inteiro
 * tocando alto enquanto espera, ou a gente silencia o elemento e grava
 * silêncio. Pelo Web Audio a trilha é desviada: ela vai para a gravação e
 * NÃO vai para o alto-falante, porque o nó nunca é ligado em
 * `context.destination`.
 *
 * Devolve `null` quando não há áudio ou quando o navegador não deixa — e aí
 * o vídeo sai mudo em vez de não sair.
 */
function capturarAudio(video) {
  const Contexto = window.AudioContext || window.webkitAudioContext;
  if (!Contexto) return null;
  try {
    const contexto = new Contexto();
    const fonte = contexto.createMediaElementSource(video);
    const destino = contexto.createMediaStreamDestination();
    fonte.connect(destino);
    const faixa = destino.stream.getAudioTracks()[0] || null;
    if (!faixa) {
      contexto.close().catch(() => {});
      return null;
    }
    return { faixa, fechar: () => contexto.close().catch(() => {}) };
  } catch {
    return null;
  }
}

/**
 * Recodifica o TRECHO escolhido e devolve
 * `{ blob, type, width, height, duration }`, ou `null` quando não deu —
 * e "não deu" nunca é erro que sobe: quem chamou segue com o original.
 *
 * `onProgress` recebe 0..1.
 */
export async function recodificarTrecho(
  file,
  { trimStart = 0, trimEnd = 0, muted = false, onProgress } = {},
) {
  const tipo = formatoDisponivel();
  if (!tipo || !podeRecodificar()) return null;

  const inicio = Math.max(0, Number(trimStart) || 0);
  const fim = Math.max(inicio + 0.2, Number(trimEnd) || 0);
  const duracao = fim - inicio;

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.preload = "auto";
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  // Sem áudio na gravação, o elemento fica mudo de verdade: nada de som
  // vazando pelo alto-falante de quem só queria postar.
  if (muted) video.muted = true;

  let audio = null;
  let gravador = null;
  const limpar = () => {
    try {
      video.pause();
    } catch {
      /* já parado */
    }
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
    audio?.fechar?.();
  };

  try {
    await new Promise((resolve, reject) => {
      const tempo = window.setTimeout(() => reject(new Error("metadata")), 15000);
      video.onloadedmetadata = () => {
        window.clearTimeout(tempo);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(tempo);
        reject(new Error("unreadable"));
      };
    });

    const { width, height } = tamanhoDestino(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return null;

    // `captureStream(0)` = nenhum quadro automático. Cada quadro entra por
    // `requestFrame()`, logo depois de desenhado — é o que mantém o
    // movimento igual ao do original em vez de amostrar o canvas no ritmo do
    // relógio, que duplica e perde quadros.
    const streamCanvas = canvas.captureStream(0);
    const faixaVideo = streamCanvas.getVideoTracks()[0];
    const faixas = [faixaVideo];

    if (!muted) {
      audio = capturarAudio(video);
      if (audio) faixas.push(audio.faixa);
    }

    const stream = new MediaStream(faixas);
    const pedacos = [];
    gravador = new MediaRecorder(stream, {
      mimeType: tipo,
      videoBitsPerSecond: BITRATE_VIDEO,
      audioBitsPerSecond: BITRATE_AUDIO,
    });
    gravador.ondataavailable = (evento) => {
      if (evento.data && evento.data.size) pedacos.push(evento.data);
    };
    const fechou = new Promise((resolve) => {
      gravador.onstop = resolve;
    });

    // Posiciona ANTES de começar a gravar: o seek do começo não pode entrar
    // no arquivo como quadro congelado.
    video.currentTime = inicio;
    await new Promise((resolve) => {
      const pronto = () => {
        video.removeEventListener("seeked", pronto);
        resolve();
      };
      video.addEventListener("seeked", pronto);
      window.setTimeout(resolve, 4000);
    });

    gravador.start(1000);
    // `catch` em vez de `await` solto: autoplay negado derruba só o play, e
    // aí o loop abaixo termina sozinho no tempo-limite.
    await video.play().catch(() => {});

    let vivo = true;
    let ultimo = 0;
    await new Promise((resolve) => {
      // Teto de tempo: trecho + folga. Vídeo que trava no meio não deixa a
      // pessoa esperando para sempre.
      const teto = window.setTimeout(() => {
        vivo = false;
        resolve();
      }, (duracao + 12) * 1000);

      const quadro = (_, info) => {
        if (!vivo) return;
        const agora = Number(info?.mediaTime ?? video.currentTime);
        if (agora >= fim - 0.02 || video.ended) {
          vivo = false;
          window.clearTimeout(teto);
          resolve();
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        faixaVideo.requestFrame?.();
        if (agora - ultimo > 0.2) {
          ultimo = agora;
          onProgress?.(Math.min(0.98, (agora - inicio) / duracao));
        }
        video.requestVideoFrameCallback(quadro);
      };
      video.requestVideoFrameCallback(quadro);
    });

    video.pause();
    // Um instante para o último pedaço do áudio entrar no arquivo: parar o
    // gravador no mesmo tique corta o fim do som.
    await esperar(120);
    gravador.stop();
    await fechou;
    onProgress?.(1);

    if (!pedacos.length) return null;
    const blob = new Blob(pedacos, { type: tipo.split(";")[0] });
    // Saiu MAIOR que o original (acontece com vídeo que já veio comprimido):
    // o trabalho é jogado fora e o original sobe. O objetivo era economizar.
    if (blob.size >= file.size && duracao >= (Number(video.duration) || 0) - 0.5) return null;
    if (blob.size < 1024) return null;

    return {
      blob,
      type: blob.type || tipo.split(";")[0],
      width,
      height,
      duration: Math.round(duracao * 100) / 100,
    };
  } catch {
    return null;
  } finally {
    try {
      if (gravador && gravador.state !== "inactive") gravador.stop();
    } catch {
      /* já paramos */
    }
    limpar();
  }
}
