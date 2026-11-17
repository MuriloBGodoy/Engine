import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

/**
 * O meu número de membro: a ordem em que entrei no Engine.
 *
 * Uma leitura por sessão, guardada no aparelho: o número não muda nunca (ver
 * a migration 20261115120000), então perguntar de novo a cada abertura da
 * carteira seria ida ao servidor para receber a mesma resposta.
 *
 * Devolve 0 enquanto não sabe — e quem desenha a carteira cai no número
 * antigo nesse caso, em vez de mostrar um espaço vazio onde estava o número.
 */
const CHAVE = "engine:membro";

/**
 * O número e a data de entrada de OUTRA pessoa, para a carteira dela na
 * página pública.
 *
 * Vem de `member_numbers`, que é lido por todo mundo de propósito (o número
 * é impresso num cartão feito para ser mostrado). O `created_at` da linha é a
 * data em que a conta nasceu — foi assim que o retroativo a gravou, e as
 * linhas novas nascem junto com o perfil. É daí que sai o "Desde" de quem
 * visita: do próprio dono só o navegador dele sabe (vem do `auth`), e sem
 * isto a carteira de todo mundo mostraria um traço ali.
 */
export function useMemberCard(userId) {
  // A chave guarda de QUEM é este cartão: trocar de perfil sem isso mostraria
  // o número da pessoa anterior até a leitura nova chegar.
  const [cartao, setCartao] = useState({ de: "", numero: 0, criadoEm: "" });

  useEffect(() => {
    // Sem dono não há o que ler. Zerar aqui seria setState síncrono dentro do
    // efeito; quem desenha já trata `numero: 0` como "ainda não sei".
    if (!userId) return undefined;
    let vivo = true;
    supabase
      .from("member_numbers")
      .select("number, created_at")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vivo || error || !data) return;
        setCartao({ de: userId, numero: Number(data.number) || 0, criadoEm: data.created_at || "" });
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [userId]);

  // Só vale o cartão de quem está sendo olhado agora.
  return cartao.de === userId ? cartao : { de: "", numero: 0, criadoEm: "" };
}

export function useMemberNumber(userId) {
  const [numero, setNumero] = useState(() => {
    try {
      return Number(window.localStorage.getItem(`${CHAVE}:${userId}`)) || 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    if (!userId || numero > 0) return undefined;
    let vivo = true;
    supabase
      .rpc("my_member_number")
      .then(({ data, error }) => {
        if (!vivo || error || !data) return;
        setNumero(Number(data));
        try {
          window.localStorage.setItem(`${CHAVE}:${userId}`, String(data));
        } catch {
          // Sem armazenamento, pergunta de novo na próxima sessão. Tudo bem.
        }
      })
      // A migration pode não estar aplicada ainda: a carteira continua com o
      // número antigo em vez de quebrar.
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [userId, numero]);

  return numero;
}
