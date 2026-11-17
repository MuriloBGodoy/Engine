-- O respaldo da migration anterior (20261115140000) não pegou: ele rodou,
-- casou com as linhas certas e foi descartado em silêncio.
--
-- O culpado é o gatilho `notifications_stamp`, e ele está certo em existir. No
-- UPDATE ele faz `new.data := old.data` para que o DONO de um aviso não possa
-- reescrever o conteúdo dele — é o que fecha o golpe do aviso falso ("Anúncio
-- recusado, clique aqui") que a migration 20261025161000 descreve. O dono só
-- muda `read`.
--
-- O que estava inconsistente é que o ramo de INSERT do mesmo gatilho já
-- pergunta `is_trusted_write()` antes de mandar, e o de UPDATE não perguntava
-- nada: travava igual para o usuário e para o servidor. A migration
-- 20261017120000 existe justamente para isto — "faltava os triggers de
-- proteção também reconhecerem que quem escreve é de confiança" —, e este
-- ramo ficou de fora.
--
-- Depois desta migration, a trava continua valendo para todo mundo que usa o
-- app: `is_trusted_write()` só é verdadeiro para a chave service_role, que
-- nunca sai do servidor, ou dentro de uma transação que chamou
-- `trust_this_transaction()`, o que só uma função security definer consegue
-- fazer. Um JWT de usuário comum não liga nem um nem outro.

create or replace function public.notifications_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_trusted_write() then
      new.created_at := now();
    end if;
    return new;
  end if;

  -- O dono só muda `read`. O resto do aviso é de quem mandou — a não ser que
  -- quem está escrevendo seja o servidor.
  if public.is_trusted_write() then
    return new;
  end if;

  new.id := old.id;
  new.user_id := old.user_id;
  new.actor_id := old.actor_id;
  new.type := old.type;
  new.data := old.data;
  new.created_at := old.created_at;
  return new;
end;
$$;

-- Agora sim o respaldo. `trust_this_transaction` vale só para esta transação.
select public.trust_this_transaction();

update public.notifications
set data = data || jsonb_build_object(
  'targetPath', '/community/@' || ltrim(data ->> 'actorUsername', '@')
)
where type = 'follow'
  and coalesce(data ->> 'actorUsername', '') <> ''
  and coalesce(data ->> 'targetPath', '') like '/community?user=%';
