-- Anúncios antigos gravaram a categoria pelo nome em português ("Mecânica").
-- A tela já traduzia isso (normalizeServiceCategory), mas o pedido de
-- orçamento compara o id no banco, então esses anúncios nunca recebiam pedido.
-- Mesmo mapa de serviceListingDisplay.js; nome desconhecido vira "other".

select public.trust_this_transaction();

update public.service_listings
set data = jsonb_set(data, '{category}', to_jsonb(case data ->> 'category'
    when 'Estética automotiva' then 'automotive-aesthetics'
    when 'Limpeza de carros' then 'car-cleaning'
    when 'Mecânica' then 'mechanics'
    when 'Funilaria e pintura' then 'body-paint'
    when 'Elétrica' then 'electrical'
    when 'Pneus e rodas' then 'tires-wheels'
    when 'Guincho' then 'tow'
    when 'Som e acessórios' then 'sound-accessories'
    when 'Vistoria' then 'inspection'
    when 'Consultoria' then 'consulting'
    else 'other'
  end))
where data ? 'category'
  and data ->> 'category' !~ '^[a-z0-9-]{1,60}$';
