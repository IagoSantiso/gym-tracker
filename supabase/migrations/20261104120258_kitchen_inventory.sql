-- Nullable additions preserve existing data and current owner-scoped RLS policies.
alter table public.preferences add column if not exists food_context jsonb;
alter table public.recipe_prefs add column if not exists frequency text;
alter table public.food_logs add column if not exists stock_usage jsonb;
alter table public.pantry_items
  add column if not exists location text,
  add column if not exists quantity_known boolean,
  add column if not exists opened boolean,
  add column if not exists use_by date,
  add column if not exists recipe_id text,
  add column if not exists portions numeric;
