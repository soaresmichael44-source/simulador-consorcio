-- Contador diário separado para transcrição de áudio (não divide o limite dos pedidos de texto do Mob).
alter table public.ia_uso add column if not exists qtd_audio integer not null default 0;

create or replace function public.audio_consumir(limite integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  usado integer;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if uid is null then
    raise exception 'não autenticado';
  end if;
  insert into public.ia_uso (user_id, dia, qtd, qtd_audio)
  values (uid, hoje, 0, 1)
  on conflict (user_id, dia) do update set qtd_audio = public.ia_uso.qtd_audio + 1
  returning qtd_audio into usado;
  if usado > limite then
    update public.ia_uso set qtd_audio = limite where user_id = uid and dia = hoje;
    return -1;
  end if;
  return limite - usado;
end;
$$;

revoke all on function public.audio_consumir(integer) from public, anon;
grant execute on function public.audio_consumir(integer) to authenticated;
