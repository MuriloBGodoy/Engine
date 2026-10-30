/**
 * A costura entre a tela de Clubes e `services/clubs.js`: um lugar só onde a
 * tela declara o que precisa da camada de dados, e onde o `error.code` do
 * `CLUBES-CONTRATO.md` §4 vira frase.
 *
 * Nasceu como ponte de cronograma — a tela foi construída enquanto o Han
 * escrevia a camada, e um `import { useClubGarage }` de um módulo que ainda
 * não exportava isso entregava `undefined` e estourava na primeira
 * renderização. Naquele momento cada função ausente caía num substituto que
 * devolvia lista vazia.
 *
 * **Os substitutos saíram em 24/09/2026**, quando a camada ficou pronta com
 * as onze funções. Eles serviam para a tela existir antes do dado; mantê-los
 * depois disso inverteria o propósito — uma função que sumisse num refactor
 * viraria estado vazio silencioso em vez de erro. Com importação nomeada, o
 * bundler quebra o build na hora, que é o comportamento que se quer.
 */
export {
  useMyClubs,
  useDiscoverClubs,
  useClubDetail,
  useClubMembers,
  useClubPosts,
  useClubEvents,
  useClubGarage,
  useCreateClub,
  useClubMembership,
  useClubAdmin,
  checkTagAvailable,
  clubImageUrl,
  CAMPOS_DO_CAPITAO,
} from "../../services/clubs";

/**
 * Os `error.code` do contrato §4 viram frase do i18n aqui, num lugar só:
 * a tela reage diferente a cada um, mas quem escreve a frase é sempre esta
 * função. Código desconhecido cai na mensagem genérica em vez de vazar
 * texto de erro técnico para a pessoa.
 */
export function clubErrorMessage(error, t) {
  const code = error?.code;
  const known = {
    "tag-taken": "clubs.errors.tagTaken",
    "tag-invalid": "clubs.errors.tagInvalid",
    "not-member": "clubs.errors.notMember",
    "not-allowed": "clubs.errors.notAllowed",
    "founder-cannot-leave": "clubs.errors.founderCannotLeave",
    "already-requested": "clubs.errors.alreadyRequested",
    // Os dois de campo do formulário de fundação: sem eles a pessoa via
    // "não deu para completar" sem saber qual campo consertar.
    "name-invalid": "clubs.errors.nameInvalid",
    "focus-empty": "clubs.errors.focusRequired",
    // Personalização (29/10/2026): imagem, cor e símbolo.
    "account-suspended": "clubs.custom.errors.suspended",
    "upload-failed": "clubs.custom.errors.uploadFailed",
    "invalid-image": "clubs.custom.errors.invalidImage",
    "image-too-big": "clubs.custom.errors.tooBig",
    "invalid-colors": "clubs.custom.errors.generic",
    "invalid-emblem": "clubs.custom.errors.generic",
    "invalid-link": "clubs.custom.errors.invalidLink",
  };
  if (code && known[code]) return t(known[code]);
  return error?.message || t("clubs.errors.generic");
}
