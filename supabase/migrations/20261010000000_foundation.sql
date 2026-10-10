-- Phase 1 foundation: school, people, classes, curriculum, children, invites, audit log.
-- Every table carries school_id and has row-level security enabled. Access rules:
--   owner/admin  -> everything in their school
--   teacher      -> children (and their guardians/pick-ups) in classes they are assigned to
--   parent       -> only their own children
-- Deactivated profiles get no access at all.

create extension if not exists pgcrypto;

create schema if not exists private;

create type public.app_role as enum ('owner', 'admin', 'teacher', 'parent');
create type public.child_status as enum ('active', 'left');

-- Tables ---------------------------------------------------------------------

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  currency text not null default 'GHS',
  timezone text not null default 'Africa/Accra',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  school_id uuid not null references public.schools (id),
  role public.app_role not null,
  full_name text not null,
  phone text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.profiles (school_id, role);
-- One account per phone number / email within a school; invites match on these.
create unique index profiles_school_phone on public.profiles (school_id, phone) where phone is not null;
create unique index profiles_school_email on public.profiles (school_id, lower(email)) where email is not null;

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  name text not null,
  min_age_months int check (min_age_months >= 0),
  max_age_months int check (max_age_months >= 0),
  capacity int check (capacity > 0),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.classes (school_id);

create table public.staff_assignments (
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  school_id uuid not null references public.schools (id),
  primary key (teacher_id, class_id)
);
create index on public.staff_assignments (class_id);

create table public.curriculum_areas (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  name text not null,
  description text,
  position int not null default 0
);
create index on public.curriculum_areas (school_id);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  area_id uuid not null references public.curriculum_areas (id) on delete cascade,
  name text not null,
  description text,
  position int not null default 0
);
create index on public.materials (area_id);

create table public.children (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  class_id uuid references public.classes (id) on delete set null,
  first_name text not null,
  last_name text not null,
  date_of_birth date not null,
  allergies text,
  medical_notes text,
  photo_consent boolean not null default false,
  outings_consent boolean not null default false,
  status public.child_status not null default 'active',
  start_date date,
  left_date date,
  created_at timestamptz not null default now()
);
create index on public.children (school_id, class_id);

create table public.guardians (
  parent_id uuid not null references public.profiles (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  school_id uuid not null references public.schools (id),
  relationship text not null,
  is_primary boolean not null default false,
  can_pick_up boolean not null default true,
  primary key (parent_id, child_id)
);
create index on public.guardians (child_id);

create table public.authorised_pickups (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  child_id uuid not null references public.children (id) on delete cascade,
  full_name text not null,
  phone text,
  relationship text,
  photo_path text,
  created_at timestamptz not null default now()
);
create index on public.authorised_pickups (child_id);

-- Invites are only read and written by the server (service role) and by admins.
-- The raw token is never stored, only its SHA-256 hash.
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  role public.app_role not null check (role <> 'owner'),
  full_name text not null,
  phone text,
  email text,
  class_id uuid references public.classes (id) on delete set null,
  child_id uuid references public.children (id) on delete cascade,
  relationship text,
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id),
  revoked_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  check (phone is not null or email is not null),
  check (role <> 'parent' or child_id is not null)
);
create index on public.invites (school_id);

create table public.audit_log (
  id bigint generated always as identity primary key,
  school_id uuid,
  actor_id uuid,
  table_name text not null,
  record_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  at timestamptz not null default now()
);
create index on public.audit_log (school_id, at desc);

-- Helper functions -------------------------------------------------------------
-- security definer so policies can look up the caller's profile without
-- recursing into the profiles policies. Kept in a schema the API does not expose.

-- Owner/admin rights only apply to a session that passed two-step verification.
create function private.has_mfa()
returns boolean
language sql stable
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;

create function private.my_profile()
returns public.profiles
language sql stable security definer set search_path = ''
as $$
  select p.* from public.profiles p where p.id = auth.uid() and p.active
$$;

create function private.my_school_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.school_id from public.profiles p where p.id = auth.uid() and p.active
$$;

create function private.my_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.active
$$;

create function private.is_admin(target_school uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active
      and p.role in ('owner', 'admin')
      and p.school_id = target_school
  ) and private.has_mfa()
$$;

create function private.is_owner(target_school uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active
      and p.role = 'owner'
      and p.school_id = target_school
  ) and private.has_mfa()
$$;

create function private.teaches_class(target_class uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_assignments sa
    join public.profiles p on p.id = sa.teacher_id
    where sa.teacher_id = auth.uid() and p.active and p.role = 'teacher'
      and sa.class_id = target_class
  )
$$;

create function private.is_guardian_of(target_child uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.guardians g
    join public.profiles p on p.id = g.parent_id
    where g.parent_id = auth.uid() and p.active and g.child_id = target_child
  )
$$;

create function private.can_see_child(target_child uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.children c
    where c.id = target_child
      and (
        private.is_admin(c.school_id)
        or (c.class_id is not null and private.teaches_class(c.class_id))
        or private.is_guardian_of(c.id)
      )
  )
$$;

grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

-- Row-level security ------------------------------------------------------------

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.staff_assignments enable row level security;
alter table public.curriculum_areas enable row level security;
alter table public.materials enable row level security;
alter table public.children enable row level security;
alter table public.guardians enable row level security;
alter table public.authorised_pickups enable row level security;
alter table public.invites enable row level security;
alter table public.audit_log enable row level security;

-- Nothing is readable without logging in.
revoke all on all tables in schema public from anon;

-- schools
create policy "members read their school" on public.schools
  for select to authenticated using (id = private.my_school_id());
create policy "owner updates the school" on public.schools
  for update to authenticated using (private.is_owner(id)) with check (private.is_owner(id));

-- profiles
create policy "read own profile" on public.profiles
  for select to authenticated using (id = auth.uid() and active);
create policy "admins read school profiles" on public.profiles
  for select to authenticated using (private.is_admin(school_id));
-- Teachers deliberately get no access to parents' profiles (names, phone numbers):
-- parents hear about their child through the app, and teachers don't contact families.
create policy "admins update school profiles" on public.profiles
  for update to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));

-- Only the owner may grant or change the owner/admin roles, or edit an owner/admin.
create function private.guard_profile_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new; -- server (service role) or migrations
  end if;
  if new.school_id <> old.school_id or new.id <> old.id then
    raise exception 'cannot move a profile between schools';
  end if;
  if not private.is_owner(old.school_id)
     and (new.role <> old.role or old.role in ('owner', 'admin')) then
    raise exception 'only the owner can change roles or edit owner/admin accounts';
  end if;
  if new.id = auth.uid() and (new.role <> old.role or not new.active) then
    raise exception 'you cannot change your own role or deactivate yourself';
  end if;
  return new;
end;
$$;
create trigger guard_profile_update before update on public.profiles
  for each row execute function private.guard_profile_update();

-- classes, curriculum: readable school-wide, written by admins
create policy "members read classes" on public.classes
  for select to authenticated using (school_id = private.my_school_id());
create policy "admins write classes" on public.classes
  for all to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));

create policy "members read curriculum areas" on public.curriculum_areas
  for select to authenticated using (school_id = private.my_school_id());
create policy "admins write curriculum areas" on public.curriculum_areas
  for all to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));

create policy "members read materials" on public.materials
  for select to authenticated using (school_id = private.my_school_id());
create policy "admins write materials" on public.materials
  for all to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));

-- staff assignments
create policy "admins manage assignments" on public.staff_assignments
  for all to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));
create policy "teachers read own assignments" on public.staff_assignments
  for select to authenticated using (teacher_id = auth.uid() and private.my_role() = 'teacher');

-- children
create policy "see permitted children" on public.children
  for select to authenticated using (private.can_see_child(id));
create policy "admins write children" on public.children
  for all to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));

-- guardians
create policy "see guardians of permitted children" on public.guardians
  for select to authenticated using (private.can_see_child(child_id));
create policy "admins write guardians" on public.guardians
  for all to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));

-- authorised pick-ups
create policy "see pickups of permitted children" on public.authorised_pickups
  for select to authenticated using (private.can_see_child(child_id));
create policy "admins write pickups" on public.authorised_pickups
  for all to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));

-- invites: admins only, and only the owner may invite another admin
create policy "admins manage invites" on public.invites
  for all to authenticated
  using (private.is_admin(school_id))
  with check (
    private.is_admin(school_id)
    and created_by = auth.uid()
    and (role <> 'admin' or private.is_owner(school_id))
  );

-- audit log: owner reads; nobody updates or deletes
create policy "owner reads audit log" on public.audit_log
  for select to authenticated using (private.is_owner(school_id));
revoke insert, update, delete, truncate on public.audit_log from authenticated;

-- Consistency: rows that reference other rows must stay in the same school ----

create function private.check_same_school()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  other uuid;
begin
  if tg_table_name = 'staff_assignments' then
    select school_id into other from public.classes where id = new.class_id;
    if other is distinct from new.school_id
       or (select school_id from public.profiles where id = new.teacher_id) is distinct from new.school_id then
      raise exception 'assignment crosses schools';
    end if;
    if (select role from public.profiles where id = new.teacher_id) <> 'teacher' then
      raise exception 'only teachers can be assigned to classes';
    end if;
  elsif tg_table_name = 'children' then
    if new.class_id is not null
       and (select school_id from public.classes where id = new.class_id) is distinct from new.school_id then
      raise exception 'class belongs to another school';
    end if;
  elsif tg_table_name = 'guardians' then
    if (select school_id from public.children where id = new.child_id) is distinct from new.school_id
       or (select school_id from public.profiles where id = new.parent_id) is distinct from new.school_id then
      raise exception 'guardian link crosses schools';
    end if;
    if (select role from public.profiles where id = new.parent_id) <> 'parent' then
      raise exception 'only parent accounts can be guardians';
    end if;
  elsif tg_table_name in ('authorised_pickups') then
    if (select school_id from public.children where id = new.child_id) is distinct from new.school_id then
      raise exception 'child belongs to another school';
    end if;
  elsif tg_table_name = 'invites' then
    if new.class_id is not null
       and (select school_id from public.classes where id = new.class_id) is distinct from new.school_id then
      raise exception 'class belongs to another school';
    end if;
    if new.child_id is not null
       and (select school_id from public.children where id = new.child_id) is distinct from new.school_id then
      raise exception 'child belongs to another school';
    end if;
  elsif tg_table_name = 'materials' then
    if (select school_id from public.curriculum_areas where id = new.area_id) is distinct from new.school_id then
      raise exception 'curriculum area belongs to another school';
    end if;
  end if;
  return new;
end;
$$;

create trigger same_school before insert or update on public.staff_assignments
  for each row execute function private.check_same_school();
create trigger same_school before insert or update on public.children
  for each row execute function private.check_same_school();
create trigger same_school before insert or update on public.guardians
  for each row execute function private.check_same_school();
create trigger same_school before insert or update on public.authorised_pickups
  for each row execute function private.check_same_school();
create trigger same_school before insert or update on public.materials
  for each row execute function private.check_same_school();
create trigger same_school before insert or update on public.invites
  for each row execute function private.check_same_school();

-- Audit trail -------------------------------------------------------------------

create function private.write_audit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  row_data jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (school_id, actor_id, table_name, record_id, action, old_data, new_data)
  values (
    (row_data ->> 'school_id')::uuid,
    auth.uid(),
    tg_table_name,
    coalesce(row_data ->> 'id', row_data ->> 'child_id'),
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger audit after insert or update or delete on public.children
  for each row execute function private.write_audit();
create trigger audit after insert or update or delete on public.guardians
  for each row execute function private.write_audit();
create trigger audit after insert or update or delete on public.authorised_pickups
  for each row execute function private.write_audit();
create trigger audit after insert or update or delete on public.profiles
  for each row execute function private.write_audit();
create trigger audit after insert or update or delete on public.staff_assignments
  for each row execute function private.write_audit();
