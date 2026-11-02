-- Incremental: % máximo de compensación con actividad suave (preferencias).
alter table public.preferences add column if not exists compensation_max_pct integer;
