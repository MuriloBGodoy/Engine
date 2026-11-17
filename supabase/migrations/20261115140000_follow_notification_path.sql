-- "Fulano começou a seguir você" passa a levar ao perfil do fulano.
--
-- O aviso nascia com `targetPath = '/community?user=<uuid>'`, que não é o
-- endereço de um perfil: é a COMUNIDADE com um parâmetro. Abrindo por ali o
-- app carrega o feed inteiro, um efeito troca o id pelo @ e só então navega.
-- Quem toca no aviso vê a comunidade piscar no meio do caminho.
--
-- A rota de perfil é pelo @, e quem grava o aviso tinha o id em mãos — foi
-- essa a origem. Mas o @ também está à mão: a `public.notify` já escreve
-- `actorUsername` em TODA notificação, de todo tipo. Era só usar.
--
-- A tela já foi corrigida e troca o caminho antigo pelo direto quando o @
-- está no aviso, então o app não depende desta migration para acertar o
-- destino. Ela existe por causa do que NÃO passa pela tela: a notificação
-- push usa o `targetPath` gravado para saber onde abrir o app. Com o caminho
-- errado no banco, tocar na notificação do sistema continuaria caindo no
-- feed.

create or replace function public.follows_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handle text;
begin
  -- O @ de quem seguiu. O cartão gravado na própria linha de `follows` vem
  -- primeiro: ele é do instante do clique e não custa uma leitura.
  v_handle := ltrim(coalesce(new.data ->> 'username', ''), '@');

  if v_handle = '' then
    select ltrim(coalesce(username, ''), '@') into v_handle
    from public.public_profiles where user_id = new.follower_id;
  end if;

  perform public.notify(new.target_id, new.follower_id, 'follow', jsonb_build_object(
    -- Sem @ não há perfil para abrir: cai no caminho antigo, que ao menos
    -- resolve o id depois de carregar. Melhor um desvio que um link morto.
    'targetPath', case
      when coalesce(v_handle, '') <> '' then '/community/@' || v_handle
      else '/community?user=' || new.follower_id::text
    end
  ), true);
  return new;
end;
$$;

-- Os avisos que já estão na caixa de alguém. São poucos e o @ está gravado em
-- cada um deles, então a correção é direta.
update public.notifications
set data = data || jsonb_build_object(
  'targetPath', '/community/@' || ltrim(data ->> 'actorUsername', '@')
)
where type = 'follow'
  and coalesce(data ->> 'actorUsername', '') <> ''
  and coalesce(data ->> 'targetPath', '') like '/community?user=%';
