-- Phase 2 (part 1): attendance, activity logs and the maintenance task calendar.
-- Same rules as the foundation: everything is per school, teachers act only on
-- children in their own classes, parents only read their own children's records.

create type public.log_kind as enum ('activity', 'meal', 'nap', 'toilet', 'mood', 'note');
create type public.progress_stage as enum ('presented', 'practising', 'mastered');
create type public.task_frequency as enum ('daily', 'weekly', 'monthly', 'termly', 'yearly');

-- Months in which a term starts; "termly" tasks fall due in these months.
alter table public.schools add column term_start_months int[] not null default '{1,5,9}';

-- Helpers ------------------------------------------------------------------------

/** Owner/admin of the child's school, or a teacher of the child's class. */
create function private.can_staff_child(target_child uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.children c
    where c.id = target_child
      and (private.is_admin(c.school_id) or (c.class_id is not null and private.teaches_class(c.class_id)))
  )
$$;

/** Any active staff member (owner, admin or teacher) of the school. Owner/admin need two-step verification. */
create function private.is_staff(target_school uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_admin(target_school) or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and p.role = 'teacher' and p.school_id = target_school
  )
$$;

grant execute on all functions in schema private to authenticated;

-- Attendance -----------------------------------------------------------------------

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  child_id uuid not null references public.children (id) on delete cascade,
  date date not null default (now() at time zone 'Africa/Accra')::date,
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid not null references public.profiles (id),
  checked_out_at timestamptz,
  checked_out_by uuid references public.profiles (id),
  -- Who collected the child, as chosen from the parents and authorised pick-up list.
  collected_by text,
  -- True when the person was not on the list; the owner sees these on the dashboard.
  collected_by_unlisted boolean not null default false,
  note text,
  unique (child_id, date),
  check (checked_out_at is null or checked_out_at >= checked_in_at)
);
create index on public.attendance (school_id, date);

alter table public.attendance enable row level security;

create policy "see attendance of permitted children" on public.attendance
  for select to authenticated using (private.can_see_child(child_id));
create policy "staff check children in" on public.attendance
  for insert to authenticated
  with check (private.can_staff_child(child_id) and checked_in_by = auth.uid());
create policy "staff check children out" on public.attendance
  for update to authenticated
  using (private.can_staff_child(child_id))
  with check (private.can_staff_child(child_id));
create policy "admins delete attendance" on public.attendance
  for delete to authenticated using (private.is_admin(school_id));

-- Only the check-out fields may change after check-in, and only by the person
-- recording the check-out; admins may also correct times.
create function private.guard_attendance_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or private.is_admin(old.school_id) then
    return new;
  end if;
  if new.child_id <> old.child_id or new.school_id <> old.school_id or new.date <> old.date
     or new.checked_in_at <> old.checked_in_at or new.checked_in_by <> old.checked_in_by then
    raise exception 'check-in details can only be corrected by the school office';
  end if;
  if new.checked_out_at is not null and new.checked_out_by is distinct from auth.uid() then
    raise exception 'check-out must be recorded by the person doing it';
  end if;
  return new;
end;
$$;
create trigger guard_attendance_update before update on public.attendance
  for each row execute function private.guard_attendance_update();

-- Names (never phone numbers) of the people who may collect a child, for the
-- check-out screen. Teachers can't read parent profiles directly.
create function public.pickup_options(target_child uuid)
returns table (name text, relationship text, is_parent boolean)
language sql stable security definer set search_path = ''
as $$
  select p.full_name, g.relationship, true
  from public.guardians g
  join public.profiles p on p.id = g.parent_id
  where g.child_id = target_child and g.can_pick_up and p.active and private.can_staff_child(target_child)
  union all
  select a.full_name, a.relationship, false
  from public.authorised_pickups a
  where a.child_id = target_child and private.can_staff_child(target_child)
$$;
revoke execute on function public.pickup_options(uuid) from anon, public;
grant execute on function public.pickup_options(uuid) to authenticated;

-- Activity logs ----------------------------------------------------------------------
-- One log can cover several children (a group activity, a whole-class snack).

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  kind public.log_kind not null,
  area_id uuid references public.curriculum_areas (id) on delete set null,
  material_id uuid references public.materials (id) on delete set null,
  stage public.progress_stage,
  body text check (char_length(body) <= 2000),
  occurred_at timestamptz not null default now(),
  logged_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  check (kind = 'activity' or (area_id is null and material_id is null and stage is null))
);
create index on public.activity_logs (school_id, occurred_at desc);

create table public.activity_children (
  log_id uuid not null references public.activity_logs (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  school_id uuid not null references public.schools (id),
  primary key (log_id, child_id)
);
create index on public.activity_children (child_id);

alter table public.activity_logs enable row level security;
alter table public.activity_children enable row level security;

create function private.can_see_log(target_log uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.activity_children ac
    where ac.log_id = target_log and private.can_see_child(ac.child_id)
  ) or exists (
    select 1 from public.activity_logs l where l.id = target_log and l.logged_by = auth.uid()
  )
$$;
grant execute on function private.can_see_log(uuid) to authenticated;

create policy "see logs about permitted children" on public.activity_logs
  -- The author check lets "insert ... returning" see the new row before any child is tagged.
  for select to authenticated using (logged_by = auth.uid() or private.can_see_log(id));
create policy "staff write their own logs" on public.activity_logs
  for insert to authenticated
  with check (private.is_staff(school_id) and logged_by = auth.uid());
create policy "authors and admins delete logs" on public.activity_logs
  for delete to authenticated
  using ((logged_by = auth.uid() and private.is_staff(school_id)) or private.is_admin(school_id));

-- A parent sees only their own child's row, even on a group log.
create policy "see tagged permitted children" on public.activity_children
  for select to authenticated using (private.can_see_child(child_id));
create policy "authors tag children they look after" on public.activity_children
  for insert to authenticated
  with check (
    private.can_staff_child(child_id)
    and exists (select 1 from public.activity_logs l where l.id = log_id and l.logged_by = auth.uid())
  );
create policy "authors and admins untag" on public.activity_children
  for delete to authenticated
  using (
    private.is_admin(school_id)
    or exists (select 1 from public.activity_logs l where l.id = log_id and l.logged_by = auth.uid())
  );

-- Maintenance tasks ---------------------------------------------------------------

create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  name text not null check (char_length(name) <= 120),
  instructions text check (char_length(instructions) <= 2000),
  frequency public.task_frequency not null,
  -- weekly: ISO weekday 1 (Mon) to 7 (Sun)
  weekday int check (weekday between 1 and 7),
  -- monthly, termly and yearly: day of the month (1 to 28 so every month has it)
  day_of_month int check (day_of_month between 1 and 28),
  -- yearly: month 1 to 12
  month int check (month between 1 and 12),
  -- null means any teacher may do it
  assignee_id uuid references public.profiles (id) on delete set null,
  photo_required boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (frequency <> 'weekly' or weekday is not null),
  check (frequency not in ('monthly', 'termly', 'yearly') or day_of_month is not null),
  check (frequency <> 'yearly' or month is not null)
);
create index on public.task_templates (school_id);

create table public.task_completions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  template_id uuid not null references public.task_templates (id) on delete cascade,
  due_date date not null,
  done_by uuid not null references public.profiles (id),
  done_at timestamptz not null default now(),
  note text check (char_length(note) <= 1000),
  unique (template_id, due_date)
);
create index on public.task_completions (school_id, done_at desc);

alter table public.task_templates enable row level security;
alter table public.task_completions enable row level security;

create policy "staff read tasks" on public.task_templates
  for select to authenticated using (private.is_staff(school_id));
create policy "admins manage tasks" on public.task_templates
  for all to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));

create policy "staff read completions" on public.task_completions
  for select to authenticated using (private.is_staff(school_id));
create policy "staff tick their tasks" on public.task_completions
  for insert to authenticated
  with check (
    done_by = auth.uid()
    and private.is_staff(school_id)
    and due_date <= (now() at time zone 'Africa/Accra')::date
    and exists (
      select 1 from public.task_templates t
      where t.id = template_id and t.active and t.school_id = task_completions.school_id
        and (t.assignee_id is null or t.assignee_id = auth.uid() or private.is_admin(t.school_id))
    )
  );
create policy "undo own tick or admin" on public.task_completions
  for delete to authenticated
  using ((done_by = auth.uid() and private.is_staff(school_id)) or private.is_admin(school_id));

-- Same-school consistency ---------------------------------------------------------

create function private.check_same_school_daily()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'attendance' then
    if (select school_id from public.children where id = new.child_id) is distinct from new.school_id then
      raise exception 'child belongs to another school';
    end if;
  elsif tg_table_name = 'activity_children' then
    if (select school_id from public.children where id = new.child_id) is distinct from new.school_id
       or (select school_id from public.activity_logs where id = new.log_id) is distinct from new.school_id then
      raise exception 'log and child must be in the same school';
    end if;
  elsif tg_table_name = 'activity_logs' then
    if new.area_id is not null
       and (select school_id from public.curriculum_areas where id = new.area_id) is distinct from new.school_id then
      raise exception 'curriculum area belongs to another school';
    end if;
    if new.material_id is not null
       and (select school_id from public.materials where id = new.material_id) is distinct from new.school_id then
      raise exception 'material belongs to another school';
    end if;
  elsif tg_table_name = 'task_templates' then
    if new.assignee_id is not null and not exists (
      select 1 from public.profiles
      where id = new.assignee_id and school_id = new.school_id and role in ('owner', 'admin', 'teacher')
    ) then
      raise exception 'tasks can only be assigned to staff of this school';
    end if;
  end if;
  return new;
end;
$$;

create trigger same_school before insert or update on public.attendance
  for each row execute function private.check_same_school_daily();
create trigger same_school before insert or update on public.activity_children
  for each row execute function private.check_same_school_daily();
create trigger same_school before insert or update on public.activity_logs
  for each row execute function private.check_same_school_daily();
create trigger same_school before insert or update on public.task_templates
  for each row execute function private.check_same_school_daily();

-- Audit trail -----------------------------------------------------------------------

create trigger audit after insert or update or delete on public.attendance
  for each row execute function private.write_audit();
create trigger audit after insert or update or delete on public.task_completions
  for each row execute function private.write_audit();
create trigger audit after insert or update or delete on public.task_templates
  for each row execute function private.write_audit();
