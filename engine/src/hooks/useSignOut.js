import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { signOut } from "../services/supabase";
import { useConfirm } from "../components/ConfirmProvider";

/**
 * "Sair" com confirmação. Até 25/10/2026 era um toque só, num ícone colado
 * no avatar do header do celular: quem ia abrir o perfil saía da conta.
 * Devolve a função que pergunta, sai e leva para o login.
 */
export function useSignOut() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const navigate = useNavigate();

  return useCallback(async () => {
    const ok = await confirm({
      title: t("logoutConfirm.title"),
      message: t("logoutConfirm.message"),
      confirmLabel: t("logoutConfirm.confirm"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return false;
    try {
      await signOut();
      navigate("/login");
      return true;
    } catch (error) {
      console.error("Erro ao sair:", error);
      return false;
    }
  }, [confirm, navigate, t]);
}
