-- Phase 2 (part 2): staff clock-in, photos on logs, parent pick-up PINs and the
-- SMS daily summary. Same rules as before: everything is per school and
-- row-level security decides who sees what.

-- School location, so clock-ins can be checked against the premises ------------

alter table public.schools
  add column latitude double precision check (latitude between -90 and 90),
  add column longitude double precision check (longitude between -180 and 180),
  -- How far from the school (metres) a phone may be when clocking in.
  add column geofence_m int not null default 200 check (geofence_m between 50 and 2000),
  -- Minutes after the planned start before a clock-in counts as late.
  add column late_after_min int not null default 10 check (late_after_min between 0 and 120);

-- Staff rota and clock-ins -----------------------------------------------------------

create table public.staff_rota (
  staff_id uuid not null references public.profiles (id) on delete cascade,
  school_id uuid not null references public.schools (id),
  weekday int not null check (weekday between 1 and 7),
  starts_at time not null,
  ends_at time not null,
  primary key (staff_id, weekday),
  check (ends_at > starts_at)
);

create table public.staff_shifts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  staff_id uuid not null references public.profiles (id) on delete cascade,
  date date not null default (now() at time zone 'Africa/Accra')::date,
  clock_in_at timestamptz not null default now(),
  clock_out_at timestamptz,
  -- Distance from the school when scanning, in metres (null when the school has no location set).
  in_distance_m int,
  out_distance_m int,
  -- Set when the office corrects a time by hand.
  corrected_by uuid references public.profiles (id),
  unique (staff_id, date),
  check (clock_out_at is null or clock_out_at >= clock_in_at)
);
create index on public.staff_shifts (school_id, date);

alter table public.staff_rota enable row level security;
alter table public.staff_shifts enable row level security;

create policy "admins manage rota" on public.staff_rota
  for all to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));
create policy "staff read own rota" on public.staff_rota
  for select to authenticated using (staff_id = auth.uid() and private.is_staff(school_id));

-- Clock-ins are written only by the server after it has checked the rotating QR
-- code and the phone's location, so staff get no insert rights here.
create policy "staff read own shifts" on public.staff_shifts
  for select to authenticated using (staff_id = auth.uid() and private.is_staff(school_id));
create policy "admins read shifts" on public.staff_shifts
  for select to authenticated using (private.is_admin(school_id));
create policy "admins correct shifts" on public.staff_shifts
  for update to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));
create policy "admins delete shifts" on public.staff_shifts
  for delete to authenticated using (private.is_admin(school_id));

-- Photos on activity logs ----------------------------------------------------------
-- Files live in a private storage bucket; the app hands out links that expire.

create table public.media (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  log_id uuid not null references public.activity_logs (id) on delete cascade,
  path text not null unique,
  thumb_path text not null unique,
  created_at timestamptz not null default now()
);
create index on public.media (log_id);

alter table public.media enable row level security;

-- Staff who can see the log see its photos. A parent sees a photo only if every
-- child tagged on it has photo consent, so one family's "no" is respected.
create function private.can_see_media(target_log uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.activity_logs l
    where l.id = target_log and (private.is_admin(l.school_id) or l.logged_by = auth.uid())
  ) or exists (
    select 1 from public.activity_children ac
    where ac.log_id = target_log and private.can_staff_child(ac.child_id)
  ) or (
    exists (
      select 1 from public.activity_children ac
      where ac.log_id = target_log and private.is_guardian_of(ac.child_id)
    )
    and not exists (
      select 1 from public.activity_children ac
      join public.children c on c.id = ac.child_id
      where ac.log_id = target_log and not c.photo_consent
    )
  )
$$;
grant execute on function private.can_see_media(uuid) to authenticated;

create policy "see permitted photos" on public.media
  for select to authenticated using (private.can_see_media(log_id));
create policy "log authors add photos" on public.media
  for insert to authenticated
  with check (
    private.is_staff(school_id)
    and exists (
      select 1 from public.activity_logs l
      where l.id = log_id and l.logged_by = auth.uid() and l.school_id = media.school_id
    )
  );
create policy "authors and admins delete photos" on public.media
  for delete to authenticated
  using (
    private.is_admin(school_id)
    or exists (select 1 from public.activity_logs l where l.id = log_id and l.logged_by = auth.uid())
  );

-- Parent pick-up PINs ----------------------------------------------------------------
-- Only the server reads these (hashed with scrypt); nobody gets API access.

create table public.pickup_pins (
  parent_id uuid primary key references public.profiles (id) on delete cascade,
  school_id uuid not null references public.schools (id),
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

create table public.pickup_pin_attempts (
  child_id uuid not null references public.children (id) on delete cascade,
  date date not null,
  failures int not null default 0,
  primary key (child_id, date)
);

alter table public.pickup_pins enable row level security;
alter table public.pickup_pin_attempts enable row level security;
revoke all on public.pickup_pins, public.pickup_pin_attempts from anon, authenticated;

-- Whether the logged-in parent has set a PIN (without revealing anything else).
create function public.has_pickup_pin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.pickup_pins where parent_id = auth.uid())
$$;
revoke execute on function public.has_pickup_pin() from anon, public;
grant execute on function public.has_pickup_pin() to authenticated;

-- SMS preferences and the send log ---------------------------------------------------

alter table public.profiles add column daily_sms boolean not null default true;

-- Parents switch their own daily summary on or off (they can't update profiles directly).
create function public.set_daily_sms(enabled boolean)
returns void
language sql security definer set search_path = ''
as $$
  update public.profiles set daily_sms = enabled where id = auth.uid() and active and role = 'parent'
$$;
revoke execute on function public.set_daily_sms(boolean) from anon, public;
grant execute on function public.set_daily_sms(boolean) to authenticated;

create table public.sms_log (
  id bigint generated always as identity primary key,
  school_id uuid not null references public.schools (id),
  kind text not null,
  recipient_id uuid references public.profiles (id) on delete set null,
  child_id uuid references public.children (id) on delete cascade,
  -- Makes sends idempotent, e.g. "summary:<child>:<date>".
  dedupe_key text not null unique,
  sent_at timestamptz not null default now(),
  ok boolean not null default true
);
create index on public.sms_log (school_id, sent_at desc);

alter table public.sms_log enable row level security;
create policy "admins read sms log" on public.sms_log
  for select to authenticated using (private.is_admin(school_id));

-- Same-school consistency ------------------------------------------------------------

create function private.check_same_school_daily_2()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name in ('staff_rota', 'staff_shifts') then
    if not exists (
      select 1 from public.profiles
      where id = new.staff_id and school_id = new.school_id and role in ('owner', 'admin', 'teacher')
    ) then
      raise exception 'only staff of this school can have shifts';
    end if;
  elsif tg_table_name = 'media' then
    if (select school_id from public.activity_logs where id = new.log_id) is distinct from new.school_id then
      raise exception 'log belongs to another school';
    end if;
  end if;
  return new;
end;
$$;

create trigger same_school before insert or update on public.staff_rota
  for each row execute function private.check_same_school_daily_2();
create trigger same_school before insert or update on public.staff_shifts
  for each row execute function private.check_same_school_daily_2();
create trigger same_school before insert or update on public.media
  for each row execute function private.check_same_school_daily_2();

create trigger audit after insert or update or delete on public.staff_shifts
  for each row execute function private.write_audit();

-- Private storage bucket for photos (only on Supabase, where the storage schema exists).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    execute $sql$
      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('media', 'media', false, 5242880, array['image/jpeg'])
      on conflict (id) do nothing
    $sql$;
  end if;
end $$;
