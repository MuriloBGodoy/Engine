import i18n from "./i18n";

/**
 * Textos de editar o que já está no ar (07/11/2026).
 *
 * "Nada que me faça ter que excluir e postar de novo": a publicação, o
 * evento. Fora do i18n.js pelo mesmo motivo dos outros módulos: aquele
 * arquivo é mexido por várias frentes e colide.
 */

const ptBR = {
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
};

const enUS = {
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
};

const esES = {
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
};

i18n.addResourceBundle("pt-BR", "translation", ptBR, true, true);
i18n.addResourceBundle("en-US", "translation", enUS, true, true);
i18n.addResourceBundle("es-ES", "translation", esES, true, true);

export default i18n;
