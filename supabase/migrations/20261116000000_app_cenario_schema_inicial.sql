-- Dados do app Mobie Cenário. Cada corretor enxerga apenas as próprias linhas (RLS).
create table public.leads (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  dados jsonb not null check (pg_column_size(dados) < 200000),
  atualizado timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.propostas (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  dados jsonb not null check (pg_column_size(dados) < 200000),
  atualizado timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.perfil (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  marca jsonb not null default '{}'::jsonb check (pg_column_size(marca) < 900000),
  cfg jsonb not null default '{}'::jsonb check (pg_column_size(cfg) < 20000),
  multi jsonb not null default '[]'::jsonb check (pg_column_size(multi) < 200000),
  atualizado timestamptz not null default now()
);

-- Contador diário de uso da IA, mexido só pela função ia_consumir.
create table public.ia_uso (
  user_id uuid not null references auth.users(id) on delete cascade,
  dia date not null,
  qtd integer not null default 0,
  primary key (user_id, dia)
);

alter table public.leads enable row level security;
alter table public.propostas enable row level security;
alter table public.perfil enable row level security;
alter table public.ia_uso enable row level security;

create policy leads_dono on public.leads for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy propostas_dono on public.propostas for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy perfil_dono on public.perfil for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- ia_uso: sem política para clientes (acesso apenas via ia_consumir).

-- Consome 1 uso da IA do dia; devolve quantos usos restam, ou -1 se o limite foi atingido.
create or replace function public.ia_consumir(limite integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  usado integer;
begin
  if uid is null then
    raise exception 'não autenticado';
  end if;
  insert into public.ia_uso (user_id, dia, qtd)
  values (uid, (now() at time zone 'America/Sao_Paulo')::date, 1)
  on conflict (user_id, dia) do update set qtd = public.ia_uso.qtd + 1
  returning qtd into usado;
  if usado > limite then
    update public.ia_uso set qtd = limite
      where user_id = uid and dia = (now() at time zone 'America/Sao_Paulo')::date;
    return -1;
  end if;
  return limite - usado;
end;
$$;

revoke all on function public.ia_consumir(integer) from public, anon;
grant execute on function public.ia_consumir(integer) to authenticated;
