import i18n from "./i18n";

/**
 * Textos de editar o que já está no ar (07/11/2026).
 *
 * "Nada que me faça ter que excluir e postar de novo". Fora do i18n.js pelo mesmo motivo dos outros módulos: aquele
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
  },
};

i18n.addResourceBundle("pt-BR", "translation", ptBR, true, true);
i18n.addResourceBundle("en-US", "translation", enUS, true, true);
i18n.addResourceBundle("es-ES", "translation", esES, true, true);

export default i18n;
