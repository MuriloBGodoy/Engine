-- Lembretes da garagem: IPVA, licenciamento, revisão e seguro.
--
-- Quem calcula as datas é o app (src/services/reminders.js, com os
-- calendários por UF de reminderCalendars.js): a regra de cada UF muda todo
-- ano e mora num arquivo com fonte por linha, não aqui. O app grava em
-- `garage_reminders` as datas FIRMES de cada carro (calendário publicado, data
-- digitada, revisão por meses, renovação do seguro) e o banco só faz a parte
-- que precisa acontecer com o app fechado: todo dia, avisar no sino a 30, 7 e
-- 1 dia do vencimento e no dia.
--
--   garage_reminders            — o dono lê e escreve as do próprio carro;
--   garage_reminder_deliveries  — o que já foi avisado (só o servidor vê);
--   run_garage_reminders()      — o job diário (pg_cron, 08:00 de Brasília).
--
-- Desligar: Configurações → Notificações → "Lembretes da garagem" grava
-- `notifications.garageReminders = false` em user_private 'settings', e o job
-- pula a conta inteira.
--
-- E-mail: ainda não há SMTP. Cada aviso enviado vira uma linha em
-- `garage_reminder_deliveries` com `email_sent_at` nulo — quando o e-mail
-- existir, o remetente lê dali (linhas com email_sent_at nulo e criadas há
-- menos de um dia) e marca. Nada aqui precisa mudar.

-- ---------------------------------------------------------------------------
-- Tipo novo no sino. A lista é a de 20261029120000 (Han, orçamentos) + o
-- 'garage_reminder'. Quem redefinir depois precisa manter os três blocos.
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'follow', 'like', 'comment', 'rating', 'achievement', 'message',
  'service_approved', 'service_changes_requested', 'service_rejected', 'service_suspended',
  'quote_request', 'quote_reply',
  'garage_reminder'
));

-- ---------------------------------------------------------------------------
-- As datas
-- ---------------------------------------------------------------------------

create table public.garage_reminders (
  user_id uuid not null,
  car_id text not null,
  kind text not null check (kind in ('ipva', 'licensing', 'revision', 'insurance')),
  due_date date not null check (due_date between date '2000-01-01' and date '2100-12-31'),
  -- Rótulo do aviso (parcela, cota única, UF, ano). Pequeno de propósito.
  detail jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 512),
  updated_at timestamptz not null default now(),
  primary key (user_id, car_id, kind, due_date),
  -- Carro apagado leva os lembretes junto.
  foreign key (user_id, car_id) references public.cars (user_id, id) on delete cascade
);
alter table public.garage_reminders enable row level security;
create policy "lembretes: so o dono" on public.garage_reminders
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index garage_reminders_due on public.garage_reminders (due_date);

-- Teto por carro: o app manda no máximo 24 (parcelas de dois anos de IPVA +
-- os outros três). Sem teto, um cliente adulterado enche a tabela que o job
-- varre todo dia.
create or replace function public.garage_reminders_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.garage_reminders
      where user_id = new.user_id and car_id = new.car_id) > 40 then
    raise exception 'too-many-reminders' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger garage_reminders_cap after insert on public.garage_reminders
  for each row execute function public.garage_reminders_cap();

-- ---------------------------------------------------------------------------
-- O que já foi avisado (de-duplicação + gancho do e-mail)
-- ---------------------------------------------------------------------------

-- Sem FK para garage_reminders de propósito: o app troca as linhas do carro a
-- cada sincronização (apaga e grava), e o histórico de "já avisei a 7 dias"
-- não pode sumir junto — senão o aviso sairia de novo.
create table public.garage_reminder_deliveries (
  user_id uuid not null,
  car_id text not null,
  kind text not null,
  due_date date not null,
  stage smallint not null check (stage in (30, 7, 1, 0)),
  sent_at timestamptz not null default now(),
  email_sent_at timestamptz,
  primary key (user_id, car_id, kind, due_date, stage),
  foreign key (user_id, car_id) references public.cars (user_id, id) on delete cascade
);
alter table public.garage_reminder_deliveries enable row level security;
-- Nenhuma política: nem o dono lê nem escreve. Só o job (security definer).

-- ---------------------------------------------------------------------------
-- O job
-- ---------------------------------------------------------------------------

-- Estágio do dia: o menor marco que ainda cabe. Manda se nenhum estágio igual
-- ou menor já saiu — o mesmo `shouldSend` de reminders.js, testado lá.
create or replace function public.garage_reminder_stage(p_days integer)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_days is null or p_days < 0 or p_days > 30 then null
    when p_days = 0 then 0
    when p_days <= 1 then 1
    when p_days <= 7 then 7
    else 30
  end::smallint;
$$;

create or replace function public.run_garage_reminders(p_today date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := coalesce(p_today, (now() at time zone 'America/Sao_Paulo')::date);
  v_sent integer := 0;
  r record;
begin
  for r in
    select g.user_id, g.car_id, g.kind, g.due_date, g.detail,
           (g.due_date - v_today) as days_left,
           public.garage_reminder_stage(g.due_date - v_today) as stage,
           left(btrim(coalesce(c.data ->> 'brand', '') || ' ' || coalesce(c.data ->> 'model', '')), 80) as car_name
      from public.garage_reminders g
      join public.cars c on c.user_id = g.user_id and c.id = g.car_id
     where g.due_date between v_today and v_today + 30
       -- Carro que voltou a ser meta não tem IPVA a lembrar.
       and coalesce(c.data ->> 'type', 'goal') = 'owned'
       -- Quem desligou "Lembretes da garagem" em Configurações não recebe.
       -- A chave mora no mesmo documento das outras preferências do sino
       -- (user_private 'settings' → notifications.garageReminders); só o
       -- `false` explícito desliga, ausente = ligado (o padrão do app).
       -- Não grava entrega para quem está desligado: religar volta a avisar
       -- a partir do próximo marco, sem disparar o atrasado.
       and not exists (
         select 1 from public.user_private p
          where p.user_id = g.user_id and p.doc_id = 'settings'
            and p.data -> 'notifications' -> 'garageReminders' = 'false'::jsonb
       )
  loop
    continue when r.stage is null;
    continue when exists (
      select 1 from public.garage_reminder_deliveries d
       where d.user_id = r.user_id and d.car_id = r.car_id and d.kind = r.kind
         and d.due_date = r.due_date and d.stage <= r.stage
    );

    insert into public.garage_reminder_deliveries (user_id, car_id, kind, due_date, stage)
    values (r.user_id, r.car_id, r.kind, r.due_date, r.stage)
    on conflict do nothing;
    if not found then
      continue;
    end if;

    perform public.notify(r.user_id, null, 'garage_reminder', jsonb_build_object(
      'kind', r.kind,
      'carId', r.car_id,
      'carName', r.car_name,
      'dueDate', to_char(r.due_date, 'YYYY-MM-DD'),
      'stage', r.stage,
      'daysLeft', r.days_left,
      'detail', r.detail,
      'targetPath', '/garagem'
    ));
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;
revoke execute on function public.run_garage_reminders(date) from public, anon, authenticated;
revoke execute on function public.garage_reminders_cap() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Agenda: pg_cron, se o banco tiver. No Supabase hospedado tem (extensão da
-- lista oficial); no PGlite dos testes não, e a migração segue sem agenda.
-- 11:00 UTC = 08:00 em Brasília (sem horário de verão desde 2019).
-- ---------------------------------------------------------------------------

do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
    execute $job$select cron.schedule('garage-reminders-daily', '0 11 * * *', 'select public.run_garage_reminders()')$job$;
  else
    raise notice 'pg_cron indisponível: run_garage_reminders() fica sem agenda';
  end if;
end;
$cron$;
