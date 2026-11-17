import i18n from "./i18n";

/**
 * Textos de editar o que já está no ar (07/11/2026).
 *
 * "Nada que me faça ter que excluir e postar de novo": a publicação, o
 * evento. Fora do i18n.js pelo mesmo motivo dos outros módulos: aquele
 * arquivo é mexido por várias frentes e colide.
 */

const ptBR = {
  emoji: { title: "Emojis", recent: "Recentes" },
  pullToRefresh: {
    pull: "Puxe para atualizar",
    release: "Solte para atualizar",
    loading: "Atualizando",
  },
  mediaPicker: {
    title: "Adicionar",
    takeNow: "Tirar foto agora",
    recordNow: "Gravar agora",
    fromGallery: "Escolher da galeria",
  },
  editing: {
    postTitle: "Editar publicação",
    postMenu: "Editar publicação",
    postSaved: "Publicação atualizada.",
    postError: "Não deu para salvar a edição.",
    save: "Salvar",
    // O arquivo do vídeo está no servidor, não aqui: recortar de novo
    // pediria o original. Tirar e mandar outro continua valendo.
    videoUploaded: "Vídeo publicado",
    videoNoRetrim: "Para cortar de outro jeito, tire este e envie de novo.",
    eventPhotos: "Fotos",
    eventWhen: "Quando",
    eventWhere: "Onde",
    eventType: "Tipo",
    // Mexer na data ou no lugar de um evento que já tem gente confirmada é
    // diferente de corrigir um texto — quem marcou no calendário não é
    // avisado sozinho.
    eventMovedWarning:
      "{{count}} pessoa já confirmou presença. Mudar data ou lugar não avisa ninguém — conte no mural do evento.",
    eventMovedWarning_other:
      "{{count}} pessoas já confirmaram presença. Mudar data ou lugar não avisa ninguém — conte no mural do evento.",
  },
  plateHider: {
    tab: "Esconder placa",
    cropTab: "Cortar",
    hint: "Arraste o dedo por cima da placa — ou de qualquer coisa que você não quer mostrar.",
    hintTap: "Arraste para esconder mais. Toque em cima de um bloco para tirar.",
    undo: "Desfazer",
    // A tarja é aplicada no arquivo, não na exibição. Vale dizer: é o que
    // separa esconder de fingir que escondeu.
    done: "A placa sai apagada do arquivo que sobe — não dá para recuperar depois.",
    reCrop: "Você mexeu no corte, então os blocos saíram de lugar e foram apagados. Esconda de novo.",
    download: "Baixar esta foto",
    downloaded: "Foto salva.",
    downloadError: "Não deu para baixar a foto.",
  },
};

const enUS = {
  emoji: { title: "Emojis", recent: "Recent" },
  pullToRefresh: {
    pull: "Pull to refresh",
    release: "Release to refresh",
    loading: "Refreshing",
  },
  mediaPicker: {
    title: "Add",
    takeNow: "Take a photo now",
    recordNow: "Record now",
    fromGallery: "Choose from the gallery",
  },
  editing: {
    postTitle: "Edit post",
    postMenu: "Edit post",
    postSaved: "Post updated.",
    postError: "Could not save the edit.",
    save: "Save",
    videoUploaded: "Published video",
    videoNoRetrim: "To trim it differently, remove this one and upload again.",
    eventPhotos: "Photos",
    eventWhen: "When",
    eventWhere: "Where",
    eventType: "Type",
    eventMovedWarning:
      "{{count}} person already said they are coming. Changing the date or the place notifies no one — say so on the event wall.",
    eventMovedWarning_other:
      "{{count}} people already said they are coming. Changing the date or the place notifies no one — say so on the event wall.",
  },
  plateHider: {
    tab: "Hide plate",
    cropTab: "Crop",
    hint: "Drag your finger over the plate — or anything else you would rather not show.",
    hintTap: "Drag to hide more. Tap a block to remove it.",
    undo: "Undo",
    done: "The plate is erased from the file that gets uploaded — it cannot be recovered later.",
    reCrop: "You changed the crop, so the blocks no longer lined up and were cleared. Hide it again.",
    download: "Download this photo",
    downloaded: "Photo saved.",
    downloadError: "Could not download the photo.",
  },
};

const esES = {
  emoji: { title: "Emojis", recent: "Recientes" },
  pullToRefresh: {
    pull: "Desliza para actualizar",
    release: "Suelta para actualizar",
    loading: "Actualizando",
  },
  mediaPicker: {
    title: "Añadir",
    takeNow: "Hacer una foto ahora",
    recordNow: "Grabar ahora",
    fromGallery: "Elegir de la galería",
  },
  editing: {
    postTitle: "Editar publicación",
    postMenu: "Editar publicación",
    postSaved: "Publicación actualizada.",
    postError: "No se pudo guardar la edición.",
    save: "Guardar",
    videoUploaded: "Vídeo publicado",
    videoNoRetrim: "Para recortarlo de otra forma, quita este y sube otro.",
    eventPhotos: "Fotos",
    eventWhen: "Cuándo",
    eventWhere: "Dónde",
    eventType: "Tipo",
    eventMovedWarning:
      "{{count}} persona ya confirmó. Cambiar la fecha o el lugar no avisa a nadie — cuéntalo en el muro del evento.",
    eventMovedWarning_other:
      "{{count}} personas ya confirmaron. Cambiar la fecha o el lugar no avisa a nadie — cuéntalo en el muro del evento.",
  },
  plateHider: {
    tab: "Ocultar matrícula",
    cropTab: "Recortar",
    hint: "Arrastra el dedo sobre la matrícula — o sobre cualquier cosa que no quieras mostrar.",
    hintTap: "Arrastra para ocultar más. Toca un bloque para quitarlo.",
    undo: "Deshacer",
    done: "La matrícula sale borrada del archivo que se sube — no se puede recuperar después.",
    reCrop: "Cambiaste el recorte, así que los bloques se desalinearon y se borraron. Ocúltala de nuevo.",
    download: "Descargar esta foto",
    downloaded: "Foto guardada.",
    downloadError: "No se pudo descargar la foto.",
  },
};

i18n.addResourceBundle("pt-BR", "translation", ptBR, true, true);
i18n.addResourceBundle("en-US", "translation", enUS, true, true);
i18n.addResourceBundle("es-ES", "translation", esES, true, true);

export default i18n;
