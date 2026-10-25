import { useEffect, useState } from "react";
import { engineDB } from "../services/db";

/**
 * "Esta pessoa é moderação de Serviços?" — quem responde é o banco
 * (public.is_service_admin), a única fonte. Antes o app tinha a própria lista
 * de e-mails (VITE_SERVICE_ADMIN_EMAILS) e o SQL outra; trocar o moderador
 * exigia mudar as duas e elas podiam divergir.
 *
 * Devolve `{ isAdmin, checked }`: `checked` é falso enquanto a pergunta não
 * voltou, para a tela de aprovações não piscar "acesso restrito".
 */
export function useServiceAdmin(user) {
  const uid = user?.uid || null;
  const [answer, setAnswer] = useState({ uid: null, isAdmin: false });

  useEffect(() => {
    if (!uid) return undefined;
    let alive = true;
    engineDB.isServiceAdmin().then((isAdmin) => {
      if (alive) setAnswer({ uid, isAdmin });
    });
    return () => {
      alive = false;
    };
  }, [uid]);

  if (!uid) return { isAdmin: false, checked: true };
  return { isAdmin: answer.uid === uid && answer.isAdmin, checked: answer.uid === uid };
}
