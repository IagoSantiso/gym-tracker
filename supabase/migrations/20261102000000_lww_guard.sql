-- Incremental para proyectos ya creados con 20261101000000: última-escritura-gana en el servidor.
create or replace function public.nexo_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.server_updated_at := now();
  return new;
end $$;
