-- Generated from lib/db/schema.ts by scripts/generate-daily-core-migration.ts
alter table public.preferences add column if not exists favorite_exercise_ids jsonb;
alter table public.exercise_sets add column if not exists duration_sec integer;
alter table public.daily_activity add column if not exists nutrition_signature text;
alter table public.food_logs add column if not exists favorite boolean;
