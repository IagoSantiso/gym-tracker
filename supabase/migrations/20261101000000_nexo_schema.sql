-- NEXO · esquema generado desde lib/db/schema.ts (no editar a mano: npm run db:sql)
-- Requiere Supabase (schema auth). Todas las tablas: PK (user_id, id), RLS user_id = auth.uid().

-- Cursor de sincronización + última-escritura-gana en el servidor: una actualización con
-- updated_at más antiguo que el guardado se ignora (no pisa datos más nuevos de otro dispositivo).
create or replace function public.nexo_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.server_updated_at := now();
  return new;
end $$;

-- Perfil (singleton id='me')
create table if not exists public.profiles (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  display_name text not null,
  app_name text not null,
  birth_date date,
  sex text,
  height_cm numeric,
  timezone text not null,
  locale text not null,
  experience text,
  injuries text,
  equipment jsonb not null,
  availability jsonb not null,
  run_ref jsonb,
  hr jsonb,
  bike jsonb,
  steps_goal integer,
  watch text,
  onboarding_completed_at timestamptz,
  draft boolean,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists profiles_sync_idx on public.profiles (user_id, server_updated_at);
create trigger profiles_touch before insert or update on public.profiles for each row execute function public.nexo_touch();
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy profiles_insert on public.profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy profiles_delete on public.profiles for delete to authenticated using (user_id = (select auth.uid()));

-- Objetivos (singleton)
create table if not exists public.goals (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary_goal text not null,
  weight_loss_rate_pct numeric not null,
  target_weight_kg numeric,
  strength_priority text not null,
  endurance_priority text not null,
  race_goal jsonb,
  calorie_mode text not null,
  manual_kcal numeric,
  manual_protein_g numeric,
  manual_carbs_g numeric,
  manual_fat_g numeric,
  manual_source text,
  notes text,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists goals_sync_idx on public.goals (user_id, server_updated_at);
create trigger goals_touch before insert or update on public.goals for each row execute function public.nexo_touch();
alter table public.goals enable row level security;
create policy goals_select on public.goals for select to authenticated using (user_id = (select auth.uid()));
create policy goals_insert on public.goals for insert to authenticated with check (user_id = (select auth.uid()));
create policy goals_update on public.goals for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy goals_delete on public.goals for delete to authenticated using (user_id = (select auth.uid()));

-- Preferencias (singleton)
create table if not exists public.preferences (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  theme text not null,
  meals_per_day integer not null,
  allergies jsonb not null,
  intolerances jsonb not null,
  excluded_foods jsonb not null,
  cooking_time_min integer not null,
  budget text not null,
  auto_apply_progression boolean not null,
  adaptation_mode boolean not null,
  deload_every_weeks integer,
  deload_active_week date,
  active_break_reminder_min integer,
  strength_days_per_week integer not null,
  active_template_id text,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists preferences_sync_idx on public.preferences (user_id, server_updated_at);
create trigger preferences_touch before insert or update on public.preferences for each row execute function public.nexo_touch();
alter table public.preferences enable row level security;
create policy preferences_select on public.preferences for select to authenticated using (user_id = (select auth.uid()));
create policy preferences_insert on public.preferences for insert to authenticated with check (user_id = (select auth.uid()));
create policy preferences_update on public.preferences for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy preferences_delete on public.preferences for delete to authenticated using (user_id = (select auth.uid()));

-- Consentimientos granulares (id = tipo)
create table if not exists public.consents (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  kind text not null,
  granted boolean not null,
  granted_at timestamptz,
  revoked_at timestamptz,
  version integer not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists consents_sync_idx on public.consents (user_id, server_updated_at);
create trigger consents_touch before insert or update on public.consents for each row execute function public.nexo_touch();
alter table public.consents enable row level security;
create policy consents_select on public.consents for select to authenticated using (user_id = (select auth.uid()));
create policy consents_insert on public.consents for insert to authenticated with check (user_id = (select auth.uid()));
create policy consents_update on public.consents for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy consents_delete on public.consents for delete to authenticated using (user_id = (select auth.uid()));

-- Configuración de diabetes (singleton). Rangos en mg/dL.
create table if not exists public.diabetes_settings (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  enabled boolean not null,
  diabetes_type text not null,
  cgm_device text,
  unit text not null,
  treatment_description text,
  target_low numeric not null,
  target_high numeric not null,
  very_low numeric not null,
  very_high numeric not null,
  targets_source text not null,
  targets_set_at timestamptz,
  hypo_unawareness text,
  protocol_text text,
  protocol_source text,
  protocol_updated_at timestamptz,
  emergency_contacts text,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists diabetes_settings_sync_idx on public.diabetes_settings (user_id, server_updated_at);
create trigger diabetes_settings_touch before insert or update on public.diabetes_settings for each row execute function public.nexo_touch();
alter table public.diabetes_settings enable row level security;
create policy diabetes_settings_select on public.diabetes_settings for select to authenticated using (user_id = (select auth.uid()));
create policy diabetes_settings_insert on public.diabetes_settings for insert to authenticated with check (user_id = (select auth.uid()));
create policy diabetes_settings_update on public.diabetes_settings for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy diabetes_settings_delete on public.diabetes_settings for delete to authenticated using (user_id = (select auth.uid()));

-- Peso corporal
create table if not exists public.weight_entries (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  date date not null,
  measured_at timestamptz not null,
  weight_kg numeric not null,
  source text not null,
  note text,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists weight_entries_sync_idx on public.weight_entries (user_id, server_updated_at);
create trigger weight_entries_touch before insert or update on public.weight_entries for each row execute function public.nexo_touch();
alter table public.weight_entries enable row level security;
create policy weight_entries_select on public.weight_entries for select to authenticated using (user_id = (select auth.uid()));
create policy weight_entries_insert on public.weight_entries for insert to authenticated with check (user_id = (select auth.uid()));
create policy weight_entries_update on public.weight_entries for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy weight_entries_delete on public.weight_entries for delete to authenticated using (user_id = (select auth.uid()));

-- Perímetros y composición
create table if not exists public.body_measurements (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  date date not null,
  kind text not null,
  value numeric not null,
  unit text not null,
  source text not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists body_measurements_sync_idx on public.body_measurements (user_id, server_updated_at);
create trigger body_measurements_touch before insert or update on public.body_measurements for each row execute function public.nexo_touch();
alter table public.body_measurements enable row level security;
create policy body_measurements_select on public.body_measurements for select to authenticated using (user_id = (select auth.uid()));
create policy body_measurements_insert on public.body_measurements for insert to authenticated with check (user_id = (select auth.uid()));
create policy body_measurements_update on public.body_measurements for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy body_measurements_delete on public.body_measurements for delete to authenticated using (user_id = (select auth.uid()));

-- Recuperación percibida (no readiness médica)
create table if not exists public.recovery_checkins (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  date date not null,
  sleep_hours numeric,
  sleep_quality integer,
  energy integer,
  fatigue integer,
  soreness integer,
  stress integer,
  hunger integer,
  pain text,
  notes text,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists recovery_checkins_sync_idx on public.recovery_checkins (user_id, server_updated_at);
create trigger recovery_checkins_touch before insert or update on public.recovery_checkins for each row execute function public.nexo_touch();
alter table public.recovery_checkins enable row level security;
create policy recovery_checkins_select on public.recovery_checkins for select to authenticated using (user_id = (select auth.uid()));
create policy recovery_checkins_insert on public.recovery_checkins for insert to authenticated with check (user_id = (select auth.uid()));
create policy recovery_checkins_update on public.recovery_checkins for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy recovery_checkins_delete on public.recovery_checkins for delete to authenticated using (user_id = (select auth.uid()));

-- Hábitos/experimentos
create table if not exists public.habit_entries (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  date date not null,
  habit text not null,
  done boolean not null,
  experiment_id text,
  note text,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists habit_entries_sync_idx on public.habit_entries (user_id, server_updated_at);
create trigger habit_entries_touch before insert or update on public.habit_entries for each row execute function public.nexo_touch();
alter table public.habit_entries enable row level security;
create policy habit_entries_select on public.habit_entries for select to authenticated using (user_id = (select auth.uid()));
create policy habit_entries_insert on public.habit_entries for insert to authenticated with check (user_id = (select auth.uid()));
create policy habit_entries_update on public.habit_entries for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy habit_entries_delete on public.habit_entries for delete to authenticated using (user_id = (select auth.uid()));

-- Notas de energía, hambre, estrés, dolor o fatiga
create table if not exists public.user_notes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  ts timestamptz not null,
  date date not null,
  kind text not null,
  level integer,
  body text not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists user_notes_sync_idx on public.user_notes (user_id, server_updated_at);
create trigger user_notes_touch before insert or update on public.user_notes for each row execute function public.nexo_touch();
alter table public.user_notes enable row level security;
create policy user_notes_select on public.user_notes for select to authenticated using (user_id = (select auth.uid()));
create policy user_notes_insert on public.user_notes for insert to authenticated with check (user_id = (select auth.uid()));
create policy user_notes_update on public.user_notes for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy user_notes_delete on public.user_notes for delete to authenticated using (user_id = (select auth.uid()));

-- Ejercicios personalizados (la biblioteca base está en código)
create table if not exists public.exercises (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  name text not null,
  muscle_group text not null,
  primary_muscles jsonb not null,
  secondary_muscles jsonb not null,
  equipment jsonb not null,
  category text not null,
  rest_sec integer not null,
  cues jsonb not null,
  notes text,
  source text not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists exercises_sync_idx on public.exercises (user_id, server_updated_at);
create trigger exercises_touch before insert or update on public.exercises for each row execute function public.nexo_touch();
alter table public.exercises enable row level security;
create policy exercises_select on public.exercises for select to authenticated using (user_id = (select auth.uid()));
create policy exercises_insert on public.exercises for insert to authenticated with check (user_id = (select auth.uid()));
create policy exercises_update on public.exercises for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy exercises_delete on public.exercises for delete to authenticated using (user_id = (select auth.uid()));

-- Rutinas (agregado días → ejercicios)
create table if not exists public.workout_templates (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  name text not null,
  kind text not null,
  days jsonb not null,
  source text not null,
  description text,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists workout_templates_sync_idx on public.workout_templates (user_id, server_updated_at);
create trigger workout_templates_touch before insert or update on public.workout_templates for each row execute function public.nexo_touch();
alter table public.workout_templates enable row level security;
create policy workout_templates_select on public.workout_templates for select to authenticated using (user_id = (select auth.uid()));
create policy workout_templates_insert on public.workout_templates for insert to authenticated with check (user_id = (select auth.uid()));
create policy workout_templates_update on public.workout_templates for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy workout_templates_delete on public.workout_templates for delete to authenticated using (user_id = (select auth.uid()));

-- Sesiones de fuerza
create table if not exists public.workout_sessions (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  date date not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  template_id text,
  day_index integer,
  title text not null,
  status text not null,
  planned_item_id text,
  rpe numeric,
  duration_min numeric,
  deload boolean not null,
  adaptation boolean not null,
  notes text,
  source text not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists workout_sessions_sync_idx on public.workout_sessions (user_id, server_updated_at);
create trigger workout_sessions_touch before insert or update on public.workout_sessions for each row execute function public.nexo_touch();
alter table public.workout_sessions enable row level security;
create policy workout_sessions_select on public.workout_sessions for select to authenticated using (user_id = (select auth.uid()));
create policy workout_sessions_insert on public.workout_sessions for insert to authenticated with check (user_id = (select auth.uid()));
create policy workout_sessions_update on public.workout_sessions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy workout_sessions_delete on public.workout_sessions for delete to authenticated using (user_id = (select auth.uid()));

-- Series registradas
create table if not exists public.exercise_sets (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  session_id text not null,
  exercise_id text not null,
  exercise_order integer not null,
  set_index integer not null,
  weight_kg numeric,
  reps integer,
  rir numeric,
  completed boolean not null,
  completed_at timestamptz,
  is_warmup boolean not null,
  target_reps_min integer,
  target_reps_max integer,
  notes text,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists exercise_sets_sync_idx on public.exercise_sets (user_id, server_updated_at);
create trigger exercise_sets_touch before insert or update on public.exercise_sets for each row execute function public.nexo_touch();
alter table public.exercise_sets enable row level security;
create policy exercise_sets_select on public.exercise_sets for select to authenticated using (user_id = (select auth.uid()));
create policy exercise_sets_insert on public.exercise_sets for insert to authenticated with check (user_id = (select auth.uid()));
create policy exercise_sets_update on public.exercise_sets for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy exercise_sets_delete on public.exercise_sets for delete to authenticated using (user_id = (select auth.uid()));

-- Calzado y kilometraje
create table if not exists public.shoes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  name text not null,
  start_km numeric not null,
  retired boolean not null,
  notes text,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists shoes_sync_idx on public.shoes (user_id, server_updated_at);
create trigger shoes_touch before insert or update on public.shoes for each row execute function public.nexo_touch();
alter table public.shoes enable row level security;
create policy shoes_select on public.shoes for select to authenticated using (user_id = (select auth.uid()));
create policy shoes_insert on public.shoes for insert to authenticated with check (user_id = (select auth.uid()));
create policy shoes_update on public.shoes for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy shoes_delete on public.shoes for delete to authenticated using (user_id = (select auth.uid()));

-- Carrera, bici, caminata, cinta, movilidad
create table if not exists public.endurance_sessions (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  sport text not null,
  date date not null,
  started_at timestamptz not null,
  duration_sec integer not null,
  distance_m numeric,
  elevation_gain_m numeric,
  avg_hr integer,
  max_hr integer,
  rpe numeric,
  avg_power_w numeric,
  indoor boolean,
  treadmill_speed_kmh numeric,
  treadmill_incline_pct numeric,
  steps integer,
  session_type text,
  while_working boolean,
  shoe_id text,
  planned_item_id text,
  title text,
  notes text,
  hr_zones_sec jsonb,
  source text not null,
  external_id text,
  import_id text,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists endurance_sessions_sync_idx on public.endurance_sessions (user_id, server_updated_at);
create unique index if not exists endurance_sessions_external_id_uq on public.endurance_sessions (user_id, external_id);
create trigger endurance_sessions_touch before insert or update on public.endurance_sessions for each row execute function public.nexo_touch();
alter table public.endurance_sessions enable row level security;
create policy endurance_sessions_select on public.endurance_sessions for select to authenticated using (user_id = (select auth.uid()));
create policy endurance_sessions_insert on public.endurance_sessions for insert to authenticated with check (user_id = (select auth.uid()));
create policy endurance_sessions_update on public.endurance_sessions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy endurance_sessions_delete on public.endurance_sessions for delete to authenticated using (user_id = (select auth.uid()));

-- Pasos y minutos activos
create table if not exists public.daily_activity (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  date date not null,
  steps integer,
  active_min integer,
  source text not null,
  external_id text,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists daily_activity_sync_idx on public.daily_activity (user_id, server_updated_at);
create trigger daily_activity_touch before insert or update on public.daily_activity for each row execute function public.nexo_touch();
alter table public.daily_activity enable row level security;
create policy daily_activity_select on public.daily_activity for select to authenticated using (user_id = (select auth.uid()));
create policy daily_activity_insert on public.daily_activity for insert to authenticated with check (user_id = (select auth.uid()));
create policy daily_activity_update on public.daily_activity for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy daily_activity_delete on public.daily_activity for delete to authenticated using (user_id = (select auth.uid()));

-- Sueño
create table if not exists public.sleep_records (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  date date not null,
  duration_min integer not null,
  quality integer,
  source text not null,
  external_id text,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists sleep_records_sync_idx on public.sleep_records (user_id, server_updated_at);
create trigger sleep_records_touch before insert or update on public.sleep_records for each row execute function public.nexo_touch();
alter table public.sleep_records enable row level security;
create policy sleep_records_select on public.sleep_records for select to authenticated using (user_id = (select auth.uid()));
create policy sleep_records_insert on public.sleep_records for insert to authenticated with check (user_id = (select auth.uid()));
create policy sleep_records_update on public.sleep_records for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy sleep_records_delete on public.sleep_records for delete to authenticated using (user_id = (select auth.uid()));

-- Plan ORIGINAL de cada semana (instantánea)
create table if not exists public.plan_weeks (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  week_start date not null,
  original jsonb not null,
  generator_version text not null,
  generated_at timestamptz not null,
  locked_days jsonb not null,
  notes text,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists plan_weeks_sync_idx on public.plan_weeks (user_id, server_updated_at);
create trigger plan_weeks_touch before insert or update on public.plan_weeks for each row execute function public.nexo_touch();
alter table public.plan_weeks enable row level security;
create policy plan_weeks_select on public.plan_weeks for select to authenticated using (user_id = (select auth.uid()));
create policy plan_weeks_insert on public.plan_weeks for insert to authenticated with check (user_id = (select auth.uid()));
create policy plan_weeks_update on public.plan_weeks for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy plan_weeks_delete on public.plan_weeks for delete to authenticated using (user_id = (select auth.uid()));

-- Plan VIGENTE (y enlace a la actividad real)
create table if not exists public.planned_items (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  date date not null,
  week_start date not null,
  kind text not null,
  title text not null,
  intensity text not null,
  duration_min integer not null,
  template_id text,
  day_index integer,
  run_spec jsonb,
  loads_legs boolean,
  sort_order integer not null,
  notes text,
  status text not null,
  locked boolean not null,
  original_date date,
  actual_ref jsonb,
  source text not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists planned_items_sync_idx on public.planned_items (user_id, server_updated_at);
create trigger planned_items_touch before insert or update on public.planned_items for each row execute function public.nexo_touch();
alter table public.planned_items enable row level security;
create policy planned_items_select on public.planned_items for select to authenticated using (user_id = (select auth.uid()));
create policy planned_items_insert on public.planned_items for insert to authenticated with check (user_id = (select auth.uid()));
create policy planned_items_update on public.planned_items for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy planned_items_delete on public.planned_items for delete to authenticated using (user_id = (select auth.uid()));

-- Cambios sugeridos (reglas o IA) con trazabilidad
create table if not exists public.proposals (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  domain text not null,
  kind text not null,
  title text not null,
  summary text not null,
  reasons jsonb not null,
  data_used jsonb not null,
  assumptions jsonb not null,
  warnings jsonb not null,
  confidence text not null,
  ops jsonb not null,
  inverse jsonb,
  status text not null,
  decision_reason text,
  decided_at timestamptz,
  origin text not null,
  requires_approval boolean not null,
  expires_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists proposals_sync_idx on public.proposals (user_id, server_updated_at);
create trigger proposals_touch before insert or update on public.proposals for each row execute function public.nexo_touch();
alter table public.proposals enable row level security;
create policy proposals_select on public.proposals for select to authenticated using (user_id = (select auth.uid()));
create policy proposals_insert on public.proposals for insert to authenticated with check (user_id = (select auth.uid()));
create policy proposals_update on public.proposals for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy proposals_delete on public.proposals for delete to authenticated using (user_id = (select auth.uid()));

-- Fuentes de datos nutricionales (licencia, versión)
create table if not exists public.food_sources (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  name text not null,
  license text not null,
  url text,
  version text,
  attribution text,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists food_sources_sync_idx on public.food_sources (user_id, server_updated_at);
create trigger food_sources_touch before insert or update on public.food_sources for each row execute function public.nexo_touch();
alter table public.food_sources enable row level security;
create policy food_sources_select on public.food_sources for select to authenticated using (user_id = (select auth.uid()));
create policy food_sources_insert on public.food_sources for insert to authenticated with check (user_id = (select auth.uid()));
create policy food_sources_update on public.food_sources for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy food_sources_delete on public.food_sources for delete to authenticated using (user_id = (select auth.uid()));

-- Alimentos propios o importados (los semilla están en código)
create table if not exists public.foods (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  name text not null,
  brand text,
  barcode text,
  state text not null,
  per100 jsonb not null,
  carb_basis text not null,
  source_id text not null,
  source_ref text,
  source_version text,
  retrieved_at timestamptz,
  section text not null,
  yield_factor numeric,
  raw_food_id text,
  unit_weights jsonb,
  tags jsonb not null,
  allergens jsonb not null,
  notes text,
  source text not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists foods_sync_idx on public.foods (user_id, server_updated_at);
create trigger foods_touch before insert or update on public.foods for each row execute function public.nexo_touch();
alter table public.foods enable row level security;
create policy foods_select on public.foods for select to authenticated using (user_id = (select auth.uid()));
create policy foods_insert on public.foods for insert to authenticated with check (user_id = (select auth.uid()));
create policy foods_update on public.foods for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy foods_delete on public.foods for delete to authenticated using (user_id = (select auth.uid()));

-- Recetas propias
create table if not exists public.recipes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  name text not null,
  slots jsonb not null,
  servings numeric not null,
  prep_min integer not null,
  cook_min integer not null,
  difficulty integer not null,
  steps jsonb not null,
  tags jsonb not null,
  batch_friendly boolean not null,
  cost_level integer,
  source text not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists recipes_sync_idx on public.recipes (user_id, server_updated_at);
create trigger recipes_touch before insert or update on public.recipes for each row execute function public.nexo_touch();
alter table public.recipes enable row level security;
create policy recipes_select on public.recipes for select to authenticated using (user_id = (select auth.uid()));
create policy recipes_insert on public.recipes for insert to authenticated with check (user_id = (select auth.uid()));
create policy recipes_update on public.recipes for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy recipes_delete on public.recipes for delete to authenticated using (user_id = (select auth.uid()));

-- Ingredientes de recetas propias
create table if not exists public.recipe_ingredients (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  recipe_id text not null,
  food_id text not null,
  grams numeric not null,
  note text,
  sort_order integer not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists recipe_ingredients_sync_idx on public.recipe_ingredients (user_id, server_updated_at);
create trigger recipe_ingredients_touch before insert or update on public.recipe_ingredients for each row execute function public.nexo_touch();
alter table public.recipe_ingredients enable row level security;
create policy recipe_ingredients_select on public.recipe_ingredients for select to authenticated using (user_id = (select auth.uid()));
create policy recipe_ingredients_insert on public.recipe_ingredients for insert to authenticated with check (user_id = (select auth.uid()));
create policy recipe_ingredients_update on public.recipe_ingredients for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy recipe_ingredients_delete on public.recipe_ingredients for delete to authenticated using (user_id = (select auth.uid()));

-- Favoritas, lista negra, último uso
create table if not exists public.recipe_prefs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  recipe_id text not null,
  favorite boolean not null,
  blacklisted boolean not null,
  last_used date,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists recipe_prefs_sync_idx on public.recipe_prefs (user_id, server_updated_at);
create trigger recipe_prefs_touch before insert or update on public.recipe_prefs for each row execute function public.nexo_touch();
alter table public.recipe_prefs enable row level security;
create policy recipe_prefs_select on public.recipe_prefs for select to authenticated using (user_id = (select auth.uid()));
create policy recipe_prefs_insert on public.recipe_prefs for insert to authenticated with check (user_id = (select auth.uid()));
create policy recipe_prefs_update on public.recipe_prefs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy recipe_prefs_delete on public.recipe_prefs for delete to authenticated using (user_id = (select auth.uid()));

-- Menús semanales
create table if not exists public.meal_plans (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  week_start date not null,
  generated_at timestamptz not null,
  settings jsonb not null,
  generator_version text not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists meal_plans_sync_idx on public.meal_plans (user_id, server_updated_at);
create trigger meal_plans_touch before insert or update on public.meal_plans for each row execute function public.nexo_touch();
alter table public.meal_plans enable row level security;
create policy meal_plans_select on public.meal_plans for select to authenticated using (user_id = (select auth.uid()));
create policy meal_plans_insert on public.meal_plans for insert to authenticated with check (user_id = (select auth.uid()));
create policy meal_plans_update on public.meal_plans for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy meal_plans_delete on public.meal_plans for delete to authenticated using (user_id = (select auth.uid()));

-- Comidas previstas
create table if not exists public.meal_entries (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  meal_plan_id text not null,
  date date not null,
  slot text not null,
  recipe_id text not null,
  servings numeric not null,
  locked boolean not null,
  status text not null,
  replaced_from text,
  notes text,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists meal_entries_sync_idx on public.meal_entries (user_id, server_updated_at);
create trigger meal_entries_touch before insert or update on public.meal_entries for each row execute function public.nexo_touch();
alter table public.meal_entries enable row level security;
create policy meal_entries_select on public.meal_entries for select to authenticated using (user_id = (select auth.uid()));
create policy meal_entries_insert on public.meal_entries for insert to authenticated with check (user_id = (select auth.uid()));
create policy meal_entries_update on public.meal_entries for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy meal_entries_delete on public.meal_entries for delete to authenticated using (user_id = (select auth.uid()));

-- Comidas realizadas (con instantánea nutricional)
create table if not exists public.food_logs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  date date not null,
  eaten_at timestamptz not null,
  slot text not null,
  meal_entry_id text,
  recipe_id text,
  servings numeric,
  items jsonb not null,
  title text not null,
  totals jsonb not null,
  source text not null,
  note text,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists food_logs_sync_idx on public.food_logs (user_id, server_updated_at);
create trigger food_logs_touch before insert or update on public.food_logs for each row execute function public.nexo_touch();
alter table public.food_logs enable row level security;
create policy food_logs_select on public.food_logs for select to authenticated using (user_id = (select auth.uid()));
create policy food_logs_insert on public.food_logs for insert to authenticated with check (user_id = (select auth.uid()));
create policy food_logs_update on public.food_logs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy food_logs_delete on public.food_logs for delete to authenticated using (user_id = (select auth.uid()));

-- Lista de la compra
create table if not exists public.shopping_lists (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  week_start date not null,
  meal_plan_id text,
  items jsonb not null,
  generated_at timestamptz not null,
  extra jsonb not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists shopping_lists_sync_idx on public.shopping_lists (user_id, server_updated_at);
create trigger shopping_lists_touch before insert or update on public.shopping_lists for each row execute function public.nexo_touch();
alter table public.shopping_lists enable row level security;
create policy shopping_lists_select on public.shopping_lists for select to authenticated using (user_id = (select auth.uid()));
create policy shopping_lists_insert on public.shopping_lists for insert to authenticated with check (user_id = (select auth.uid()));
create policy shopping_lists_update on public.shopping_lists for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy shopping_lists_delete on public.shopping_lists for delete to authenticated using (user_id = (select auth.uid()));

-- Despensa
create table if not exists public.pantry_items (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  food_id text not null,
  name text not null,
  grams numeric not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists pantry_items_sync_idx on public.pantry_items (user_id, server_updated_at);
create trigger pantry_items_touch before insert or update on public.pantry_items for each row execute function public.nexo_touch();
alter table public.pantry_items enable row level security;
create policy pantry_items_select on public.pantry_items for select to authenticated using (user_id = (select auth.uid()));
create policy pantry_items_insert on public.pantry_items for insert to authenticated with check (user_id = (select auth.uid()));
create policy pantry_items_update on public.pantry_items for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy pantry_items_delete on public.pantry_items for delete to authenticated using (user_id = (select auth.uid()));

-- Importaciones CGM (procedencia y calidad)
create table if not exists public.cgm_imports (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  file_name text not null,
  file_size integer not null,
  file_hash text not null,
  format text not null,
  parser_version text not null,
  imported_at timestamptz not null,
  period_start timestamptz,
  period_end timestamptz,
  readings_count integer not null,
  duplicates_skipped integer not null,
  rows_rejected integer not null,
  unit text not null,
  timezone text not null,
  warnings jsonb not null,
  raw_stored boolean not null,
  report_summary jsonb,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists cgm_imports_sync_idx on public.cgm_imports (user_id, server_updated_at);
create trigger cgm_imports_touch before insert or update on public.cgm_imports for each row execute function public.nexo_touch();
alter table public.cgm_imports enable row level security;
create policy cgm_imports_select on public.cgm_imports for select to authenticated using (user_id = (select auth.uid()));
create policy cgm_imports_insert on public.cgm_imports for insert to authenticated with check (user_id = (select auth.uid()));
create policy cgm_imports_update on public.cgm_imports for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy cgm_imports_delete on public.cgm_imports for delete to authenticated using (user_id = (select auth.uid()));

-- Lecturas CGM deduplicadas (mg/dL + original)
create table if not exists public.cgm_readings (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  import_id text not null,
  ts timestamptz not null,
  local_time text not null,
  value_mgdl numeric not null,
  original_value numeric not null,
  original_unit text not null,
  kind text not null,
  dedupe_key text not null,
  ambiguous_time boolean,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists cgm_readings_sync_idx on public.cgm_readings (user_id, server_updated_at);
create unique index if not exists cgm_readings_dedupe_key_uq on public.cgm_readings (user_id, dedupe_key);
create trigger cgm_readings_touch before insert or update on public.cgm_readings for each row execute function public.nexo_touch();
alter table public.cgm_readings enable row level security;
create policy cgm_readings_select on public.cgm_readings for select to authenticated using (user_id = (select auth.uid()));
create policy cgm_readings_insert on public.cgm_readings for insert to authenticated with check (user_id = (select auth.uid()));
create policy cgm_readings_update on public.cgm_readings for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy cgm_readings_delete on public.cgm_readings for delete to authenticated using (user_id = (select auth.uid()));

-- Eventos anotados (insulina solo como dato histórico)
create table if not exists public.glucose_events (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  ts timestamptz not null,
  kind text not null,
  value numeric,
  unit text,
  insulin_type text,
  note text,
  source text not null,
  import_id text,
  dedupe_key text,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists glucose_events_sync_idx on public.glucose_events (user_id, server_updated_at);
create trigger glucose_events_touch before insert or update on public.glucose_events for each row execute function public.nexo_touch();
alter table public.glucose_events enable row level security;
create policy glucose_events_select on public.glucose_events for select to authenticated using (user_id = (select auth.uid()));
create policy glucose_events_insert on public.glucose_events for insert to authenticated with check (user_id = (select auth.uid()));
create policy glucose_events_update on public.glucose_events for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy glucose_events_delete on public.glucose_events for delete to authenticated using (user_id = (select auth.uid()));

-- Instantáneas de métricas CGM
create table if not exists public.cgm_metric_periods (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  period_start timestamptz not null,
  period_end timestamptz not null,
  label text not null,
  metrics jsonb not null,
  computed_at timestamptz not null,
  version text not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists cgm_metric_periods_sync_idx on public.cgm_metric_periods (user_id, server_updated_at);
create trigger cgm_metric_periods_touch before insert or update on public.cgm_metric_periods for each row execute function public.nexo_touch();
alter table public.cgm_metric_periods enable row level security;
create policy cgm_metric_periods_select on public.cgm_metric_periods for select to authenticated using (user_id = (select auth.uid()));
create policy cgm_metric_periods_insert on public.cgm_metric_periods for insert to authenticated with check (user_id = (select auth.uid()));
create policy cgm_metric_periods_update on public.cgm_metric_periods for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy cgm_metric_periods_delete on public.cgm_metric_periods for delete to authenticated using (user_id = (select auth.uid()));

-- Estado de conectores (sin tokens)
create table if not exists public.integration_connections (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  provider text not null,
  status text not null,
  connected_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  scopes jsonb not null,
  notes text,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists integration_connections_sync_idx on public.integration_connections (user_id, server_updated_at);
create trigger integration_connections_touch before insert or update on public.integration_connections for each row execute function public.nexo_touch();
alter table public.integration_connections enable row level security;
create policy integration_connections_select on public.integration_connections for select to authenticated using (user_id = (select auth.uid()));
create policy integration_connections_insert on public.integration_connections for insert to authenticated with check (user_id = (select auth.uid()));
create policy integration_connections_update on public.integration_connections for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy integration_connections_delete on public.integration_connections for delete to authenticated using (user_id = (select auth.uid()));

-- Trazabilidad de importaciones
create table if not exists public.import_jobs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  kind text not null,
  file_name text,
  status text not null,
  created integer not null,
  skipped integer not null,
  errors jsonb not null,
  imported_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists import_jobs_sync_idx on public.import_jobs (user_id, server_updated_at);
create trigger import_jobs_touch before insert or update on public.import_jobs for each row execute function public.nexo_touch();
alter table public.import_jobs enable row level security;
create policy import_jobs_select on public.import_jobs for select to authenticated using (user_id = (select auth.uid()));
create policy import_jobs_insert on public.import_jobs for insert to authenticated with check (user_id = (select auth.uid()));
create policy import_jobs_update on public.import_jobs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy import_jobs_delete on public.import_jobs for delete to authenticated using (user_id = (select auth.uid()));

-- Conversaciones con el asistente
create table if not exists public.ai_conversations (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  title text not null,
  provider text not null,
  model text not null,
  items jsonb not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists ai_conversations_sync_idx on public.ai_conversations (user_id, server_updated_at);
create trigger ai_conversations_touch before insert or update on public.ai_conversations for each row execute function public.nexo_touch();
alter table public.ai_conversations enable row level security;
create policy ai_conversations_select on public.ai_conversations for select to authenticated using (user_id = (select auth.uid()));
create policy ai_conversations_insert on public.ai_conversations for insert to authenticated with check (user_id = (select auth.uid()));
create policy ai_conversations_update on public.ai_conversations for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy ai_conversations_delete on public.ai_conversations for delete to authenticated using (user_id = (select auth.uid()));

-- Uso de IA (tokens, coste estimado)
create table if not exists public.ai_usage (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  ts timestamptz not null,
  provider text not null,
  model text not null,
  input_tokens integer not null,
  output_tokens integer not null,
  cache_read_tokens integer not null,
  conversation_id text,
  cost_usd numeric,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists ai_usage_sync_idx on public.ai_usage (user_id, server_updated_at);
create trigger ai_usage_touch before insert or update on public.ai_usage for each row execute function public.nexo_touch();
alter table public.ai_usage enable row level security;
create policy ai_usage_select on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));
create policy ai_usage_insert on public.ai_usage for insert to authenticated with check (user_id = (select auth.uid()));
create policy ai_usage_update on public.ai_usage for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy ai_usage_delete on public.ai_usage for delete to authenticated using (user_id = (select auth.uid()));

-- Valoraciones de propuestas/respuestas
create table if not exists public.user_feedback (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  target_type text not null,
  target_id text not null,
  rating integer not null,
  comment text,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists user_feedback_sync_idx on public.user_feedback (user_id, server_updated_at);
create trigger user_feedback_touch before insert or update on public.user_feedback for each row execute function public.nexo_touch();
alter table public.user_feedback enable row level security;
create policy user_feedback_select on public.user_feedback for select to authenticated using (user_id = (select auth.uid()));
create policy user_feedback_insert on public.user_feedback for insert to authenticated with check (user_id = (select auth.uid()));
create policy user_feedback_update on public.user_feedback for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy user_feedback_delete on public.user_feedback for delete to authenticated using (user_id = (select auth.uid()));

-- Auditoría sin contenido sensible
create table if not exists public.audit_events (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  ts timestamptz not null,
  action text not null,
  detail jsonb not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists audit_events_sync_idx on public.audit_events (user_id, server_updated_at);
create trigger audit_events_touch before insert or update on public.audit_events for each row execute function public.nexo_touch();
alter table public.audit_events enable row level security;
create policy audit_events_select on public.audit_events for select to authenticated using (user_id = (select auth.uid()));
create policy audit_events_insert on public.audit_events for insert to authenticated with check (user_id = (select auth.uid()));
create policy audit_events_update on public.audit_events for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy audit_events_delete on public.audit_events for delete to authenticated using (user_id = (select auth.uid()));

-- Revisión semanal calculada
create table if not exists public.weekly_reviews (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  week_start date not null,
  generated_at timestamptz not null,
  version text not null,
  data jsonb not null,
  achievements jsonb not null,
  opportunities jsonb not null,
  notes text,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists weekly_reviews_sync_idx on public.weekly_reviews (user_id, server_updated_at);
create trigger weekly_reviews_touch before insert or update on public.weekly_reviews for each row execute function public.nexo_touch();
alter table public.weekly_reviews enable row level security;
create policy weekly_reviews_select on public.weekly_reviews for select to authenticated using (user_id = (select auth.uid()));
create policy weekly_reviews_insert on public.weekly_reviews for insert to authenticated with check (user_id = (select auth.uid()));
create policy weekly_reviews_update on public.weekly_reviews for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy weekly_reviews_delete on public.weekly_reviews for delete to authenticated using (user_id = (select auth.uid()));

-- Experimentos de hábitos (no clínicos)
create table if not exists public.experiments (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  week_start date not null,
  title text not null,
  description text not null,
  status text not null,
  reason text,
  result text,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists experiments_sync_idx on public.experiments (user_id, server_updated_at);
create trigger experiments_touch before insert or update on public.experiments for each row execute function public.nexo_touch();
alter table public.experiments enable row level security;
create policy experiments_select on public.experiments for select to authenticated using (user_id = (select auth.uid()));
create policy experiments_insert on public.experiments for insert to authenticated with check (user_id = (select auth.uid()));
create policy experiments_update on public.experiments for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy experiments_delete on public.experiments for delete to authenticated using (user_id = (select auth.uid()));

-- Claves foráneas compuestas (impiden relacionar datos de usuarios distintos)
alter table public.habit_entries add constraint habit_entries_experiment_id_fk foreign key (user_id, experiment_id) references public.experiments(user_id, id) on delete cascade deferrable initially deferred;
alter table public.exercise_sets add constraint exercise_sets_session_id_fk foreign key (user_id, session_id) references public.workout_sessions(user_id, id) on delete cascade deferrable initially deferred;
alter table public.endurance_sessions add constraint endurance_sessions_shoe_id_fk foreign key (user_id, shoe_id) references public.shoes(user_id, id) on delete cascade deferrable initially deferred;
alter table public.recipe_ingredients add constraint recipe_ingredients_recipe_id_fk foreign key (user_id, recipe_id) references public.recipes(user_id, id) on delete cascade deferrable initially deferred;
alter table public.meal_entries add constraint meal_entries_meal_plan_id_fk foreign key (user_id, meal_plan_id) references public.meal_plans(user_id, id) on delete cascade deferrable initially deferred;
alter table public.cgm_readings add constraint cgm_readings_import_id_fk foreign key (user_id, import_id) references public.cgm_imports(user_id, id) on delete cascade deferrable initially deferred;

-- Credenciales OAuth cifradas (AES-256-GCM con TOKEN_ENCRYPTION_KEY). Sin políticas para clientes:
-- solo accesible con service role desde route handlers.
create table if not exists public.oauth_credentials (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  ciphertext text not null,
  iv text not null,
  external_user_id text,
  scopes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.oauth_credentials enable row level security;
