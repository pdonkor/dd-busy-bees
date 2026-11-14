-- Phase 4: sign-ups and enrolment, oversight (ratios, incidents, lesson plans,
-- reports) and parent communication with the school. Teachers still cannot send
-- a message to anyone: messages and announcements are between parents and the
-- office only, and the database enforces it.

-- Enquiries and the enrolment pipeline -----------------------------------------------

create type public.enquiry_stage as enum ('enquiry', 'tour_booked', 'offered', 'enrolled', 'waitlisted', 'declined');

create table public.enquiries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  parent_name text not null check (char_length(parent_name) <= 120),
  relationship text check (char_length(relationship) <= 40),
  phone text not null,
  email text check (char_length(email) <= 200),
  child_first_name text not null check (char_length(child_first_name) <= 80),
  child_last_name text not null check (char_length(child_last_name) <= 80),
  child_dob date not null,
  start_date date,
  sessions text check (char_length(sessions) <= 200),
  message text check (char_length(message) <= 2000),
  stage public.enquiry_stage not null default 'enquiry',
  notes text check (char_length(notes) <= 2000),
  tour_at timestamptz,
  child_id uuid references public.children (id) on delete set null,
  -- Hash of the sender's IP address, only for rate limiting the public form.
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.enquiries (school_id, stage);
create index on public.enquiries (ip_hash, created_at);

alter table public.enquiries enable row level security;
-- The public form writes through the server; only the office reads and moves enquiries.
create policy "admins manage enquiries" on public.enquiries
  for all to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));

-- Enrolment pack filled in by parents --------------------------------------------------

alter table public.children
  add column doctor_name text check (char_length(doctor_name) <= 120),
  add column doctor_phone text check (char_length(doctor_phone) <= 30),
  add column enrolment_submitted_at timestamptz;

create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  child_id uuid not null references public.children (id) on delete cascade,
  full_name text not null check (char_length(full_name) <= 120),
  phone text not null check (char_length(phone) <= 30),
  relationship text check (char_length(relationship) <= 40),
  created_at timestamptz not null default now()
);
create index on public.emergency_contacts (child_id);
alter table public.emergency_contacts enable row level security;

-- Phone numbers stay with the office and the family; teachers don't contact families.
create policy "office and parents read emergency contacts" on public.emergency_contacts
  for select to authenticated using (private.is_admin(school_id) or private.is_guardian_of(child_id));
create policy "office and parents add emergency contacts" on public.emergency_contacts
  for insert to authenticated
  with check ((private.is_admin(school_id) or private.is_guardian_of(child_id)));
create policy "office and parents remove emergency contacts" on public.emergency_contacts
  for delete to authenticated using (private.is_admin(school_id) or private.is_guardian_of(child_id));

-- Parents can ask for someone to be added to the pick-up list; the office approves.
alter table public.authorised_pickups
  add column approved boolean not null default true,
  add column requested_by uuid references public.profiles (id) on delete set null;

create policy "parents request pick-up people" on public.authorised_pickups
  for insert to authenticated
  with check (private.is_guardian_of(child_id) and not approved and requested_by = auth.uid());

-- Only approved people appear on the teacher's check-out list.
create or replace function public.pickup_options(target_child uuid)
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
  where a.child_id = target_child and a.approved and private.can_staff_child(target_child)
$$;

/** Parents submit the medical and consent part of the enrolment pack for their own child. */
create function public.submit_enrolment(
  target_child uuid,
  p_allergies text,
  p_medical_notes text,
  p_doctor_name text,
  p_doctor_phone text,
  p_photo_consent boolean,
  p_outings_consent boolean
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_guardian_of(target_child) then
    raise exception 'not your child';
  end if;
  update public.children set
    allergies = nullif(left(trim(p_allergies), 2000), ''),
    medical_notes = nullif(left(trim(p_medical_notes), 2000), ''),
    doctor_name = nullif(left(trim(p_doctor_name), 120), ''),
    doctor_phone = nullif(left(trim(p_doctor_phone), 30), ''),
    photo_consent = p_photo_consent,
    outings_consent = p_outings_consent,
    enrolment_submitted_at = now()
  where id = target_child;
end;
$$;
revoke execute on function public.submit_enrolment(uuid, text, text, text, text, boolean, boolean) from anon, public;
grant execute on function public.submit_enrolment(uuid, text, text, text, text, boolean, boolean) to authenticated;

-- Ratios --------------------------------------------------------------------------------

alter table public.classes
  add column ratio_children_per_adult int check (ratio_children_per_adult between 1 and 40);

-- Incidents and accidents -----------------------------------------------------------------

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  child_id uuid not null references public.children (id) on delete cascade,
  kind text not null check (kind in ('accident', 'incident', 'illness')),
  occurred_at timestamptz not null,
  description text not null check (char_length(description) <= 4000),
  action_taken text check (char_length(action_taken) <= 4000),
  reported_by uuid not null references public.profiles (id),
  parent_ack_at timestamptz,
  parent_ack_by uuid references public.profiles (id),
  owner_signoff_at timestamptz,
  owner_signoff_by uuid references public.profiles (id),
  owner_note text check (char_length(owner_note) <= 2000),
  created_at timestamptz not null default now()
);
create index on public.incidents (school_id, occurred_at desc);
create index on public.incidents (child_id);
alter table public.incidents enable row level security;

create policy "see incidents of permitted children" on public.incidents
  for select to authenticated using (private.can_see_child(child_id));
create policy "staff report incidents for their children" on public.incidents
  for insert to authenticated
  with check (
    private.can_staff_child(child_id) and reported_by = auth.uid()
    and parent_ack_at is null and owner_signoff_at is null
  );
create policy "office signs off incidents" on public.incidents
  for update to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));

-- The report itself can't be rewritten: a parent can only acknowledge it and the
-- office can only sign it off.
create function private.guard_incident_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ack text[] := array['parent_ack_at', 'parent_ack_by'];
  signoff text[] := array['owner_signoff_at', 'owner_signoff_by', 'owner_note'];
begin
  if auth.uid() is null then
    return new;
  end if;
  if (to_jsonb(new) - ack - signoff) <> (to_jsonb(old) - ack - signoff) then
    raise exception 'an incident report can only be acknowledged or signed off, not changed';
  end if;
  if (to_jsonb(new) - signoff) <> (to_jsonb(old) - signoff) then
    if old.parent_ack_at is not null or not private.is_guardian_of(old.child_id) then
      raise exception 'only the child''s parent can acknowledge an incident';
    end if;
    new.parent_ack_by := auth.uid();
    new.parent_ack_at := now();
  end if;
  if (to_jsonb(new) - ack) <> (to_jsonb(old) - ack) then
    if not private.is_admin(old.school_id) then
      raise exception 'only the office can sign off an incident';
    end if;
    new.owner_signoff_by := auth.uid();
    new.owner_signoff_at := coalesce(old.owner_signoff_at, now());
  end if;
  return new;
end;
$$;
create trigger guard_incident_update before update on public.incidents
  for each row execute function private.guard_incident_update();

/** A parent confirms they have read an incident report about their child. */
create function public.acknowledge_incident(target uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.incidents set parent_ack_at = now(), parent_ack_by = auth.uid()
  where id = target and parent_ack_at is null and private.is_guardian_of(child_id)
$$;
revoke execute on function public.acknowledge_incident(uuid) from anon, public;
grant execute on function public.acknowledge_incident(uuid) to authenticated;

-- Lesson plans ------------------------------------------------------------------------------

create table public.lesson_plans (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  class_id uuid not null references public.classes (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  body text not null check (char_length(body) <= 8000),
  author_id uuid not null references public.profiles (id),
  owner_comment text check (char_length(owner_comment) <= 2000),
  updated_at timestamptz not null default now(),
  unique (class_id, week_start)
);
alter table public.lesson_plans enable row level security;

create policy "office and class teachers read plans" on public.lesson_plans
  for select to authenticated using (private.is_admin(school_id) or private.teaches_class(class_id));
create policy "class teachers write plans" on public.lesson_plans
  for insert to authenticated with check (private.teaches_class(class_id) and author_id = auth.uid());
create policy "class teachers and office update plans" on public.lesson_plans
  for update to authenticated
  using (private.teaches_class(class_id) or private.is_admin(school_id))
  with check (private.teaches_class(class_id) or private.is_admin(school_id));

-- Teachers edit the plan; the office only comments.
create function private.guard_lesson_plan_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.class_id <> old.class_id or new.week_start <> old.week_start or new.school_id <> old.school_id then
    raise exception 'a plan cannot be moved';
  end if;
  if private.teaches_class(old.class_id) then
    new.owner_comment := old.owner_comment;
    new.author_id := auth.uid();
  else
    new.body := old.body;
    new.author_id := old.author_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger guard_lesson_plan_update before update on public.lesson_plans
  for each row execute function private.guard_lesson_plan_update();

-- Termly reports ------------------------------------------------------------------------------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  child_id uuid not null references public.children (id) on delete cascade,
  term_id uuid not null references public.terms (id) on delete cascade,
  body text not null check (char_length(body) <= 12000),
  author_id uuid not null references public.profiles (id),
  -- Set by the office when the report is checked and shared with the parents.
  shared_at timestamptz,
  shared_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  unique (child_id, term_id)
);
alter table public.reports enable row level security;

create policy "staff read reports" on public.reports
  for select to authenticated using (private.can_staff_child(child_id));
create policy "parents read shared reports" on public.reports
  for select to authenticated using (shared_at is not null and private.is_guardian_of(child_id));
create policy "staff draft reports" on public.reports
  for insert to authenticated
  with check (private.can_staff_child(child_id) and author_id = auth.uid() and shared_at is null);
create policy "staff edit reports" on public.reports
  for update to authenticated using (private.can_staff_child(child_id)) with check (private.can_staff_child(child_id));

-- Only the office shares a report; once shared, teachers can no longer change it.
create function private.guard_report_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.child_id <> old.child_id or new.term_id <> old.term_id or new.school_id <> old.school_id then
    raise exception 'a report cannot be moved';
  end if;
  if not private.is_admin(old.school_id) then
    if old.shared_at is not null then
      raise exception 'this report has been shared; ask the office to change it';
    end if;
    if new.shared_at is not null then
      raise exception 'only the office can share reports';
    end if;
    new.author_id := auth.uid();
  elsif new.shared_at is not null and old.shared_at is null then
    new.shared_by := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger guard_report_update before update on public.reports
  for each row execute function private.guard_report_update();

-- Parent and office messages ------------------------------------------------------------------
-- One conversation per parent, with the school office. Teachers have no access at all.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  parent_id uuid not null references public.profiles (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index on public.messages (school_id, parent_id, created_at desc);
alter table public.messages enable row level security;

create policy "parents read their conversation" on public.messages
  for select to authenticated using (parent_id = auth.uid() and private.my_role() = 'parent');
create policy "parents write to the office" on public.messages
  for insert to authenticated
  with check (parent_id = auth.uid() and sender_id = auth.uid() and private.my_role() = 'parent'
              and school_id = private.my_school_id() and read_at is null);
create policy "office reads conversations" on public.messages
  for select to authenticated using (private.is_admin(school_id));
create policy "office replies" on public.messages
  for insert to authenticated
  with check (
    private.is_admin(school_id) and sender_id = auth.uid() and read_at is null
    and exists (select 1 from public.profiles p where p.id = parent_id and p.role = 'parent' and p.school_id = messages.school_id)
  );

/** Marks the other side's messages in a conversation as read. */
create function public.mark_messages_read(conversation uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.messages m set read_at = now()
  where m.parent_id = conversation and m.read_at is null and m.sender_id <> auth.uid()
    and (
      (conversation = auth.uid() and private.my_role() = 'parent')
      or private.is_admin(m.school_id)
    )
$$;
revoke execute on function public.mark_messages_read(uuid) from anon, public;
grant execute on function public.mark_messages_read(uuid) to authenticated;

-- Announcements and the school calendar ----------------------------------------------------------

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  class_id uuid references public.classes (id) on delete cascade,
  title text not null check (char_length(title) <= 120),
  body text not null check (char_length(body) <= 4000),
  sent_sms boolean not null default false,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.announcements (school_id, created_at desc);
alter table public.announcements enable row level security;

create function private.can_see_announcement(target_school uuid, target_class uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_staff(target_school) or (
    target_school = private.my_school_id() and private.my_role() = 'parent' and (
      target_class is null or exists (
        select 1 from public.guardians g join public.children c on c.id = g.child_id
        where g.parent_id = auth.uid() and c.class_id = target_class and c.status = 'active'
      )
    )
  )
$$;
grant execute on function private.can_see_announcement(uuid, uuid) to authenticated;

create policy "members read announcements meant for them" on public.announcements
  for select to authenticated using (private.can_see_announcement(school_id, class_id));
create policy "office posts announcements" on public.announcements
  for insert to authenticated with check (private.is_admin(school_id) and created_by = auth.uid());
create policy "office removes announcements" on public.announcements
  for delete to authenticated using (private.is_admin(school_id));

create table public.events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  class_id uuid references public.classes (id) on delete cascade,
  title text not null check (char_length(title) <= 120),
  kind text not null default 'event' check (kind in ('event', 'closure', 'meeting', 'holiday')),
  starts_on date not null,
  ends_on date not null,
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index on public.events (school_id, starts_on);
alter table public.events enable row level security;

create policy "members read events meant for them" on public.events
  for select to authenticated using (private.can_see_announcement(school_id, class_id));
create policy "office manages events" on public.events
  for all to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));

-- Same-school consistency -------------------------------------------------------------------------

create function private.check_same_school_oversight()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name in ('emergency_contacts', 'incidents', 'reports') then
    if (select school_id from public.children where id = new.child_id) is distinct from new.school_id then
      raise exception 'child belongs to another school';
    end if;
  end if;
  if tg_table_name = 'reports' then
    if (select school_id from public.terms where id = new.term_id) is distinct from new.school_id then
      raise exception 'term belongs to another school';
    end if;
  elsif tg_table_name = 'lesson_plans' then
    if (select school_id from public.classes where id = new.class_id) is distinct from new.school_id then
      raise exception 'class belongs to another school';
    end if;
  elsif tg_table_name in ('announcements', 'events') then
    if new.class_id is not null
       and (select school_id from public.classes where id = new.class_id) is distinct from new.school_id then
      raise exception 'class belongs to another school';
    end if;
  elsif tg_table_name = 'enquiries' then
    if new.child_id is not null
       and (select school_id from public.children where id = new.child_id) is distinct from new.school_id then
      raise exception 'child belongs to another school';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger same_school before insert or update on public.emergency_contacts
  for each row execute function private.check_same_school_oversight();
create trigger same_school before insert or update on public.incidents
  for each row execute function private.check_same_school_oversight();
create trigger same_school before insert or update on public.reports
  for each row execute function private.check_same_school_oversight();
create trigger same_school before insert or update on public.lesson_plans
  for each row execute function private.check_same_school_oversight();
create trigger same_school before insert or update on public.announcements
  for each row execute function private.check_same_school_oversight();
create trigger same_school before insert or update on public.events
  for each row execute function private.check_same_school_oversight();
create trigger same_school before insert or update on public.enquiries
  for each row execute function private.check_same_school_oversight();

-- Audit trail ---------------------------------------------------------------------------------------

create trigger audit after insert or update or delete on public.incidents
  for each row execute function private.write_audit();
create trigger audit after insert or update or delete on public.emergency_contacts
  for each row execute function private.write_audit();
create trigger audit after insert or update or delete on public.enquiries
  for each row execute function private.write_audit();
create trigger audit after insert or update or delete on public.reports
  for each row execute function private.write_audit();

-- Nothing in this migration is for logged-out visitors (row-level security already
-- returns nothing to them; this removes table access altogether).
revoke all on all tables in schema public from anon;
