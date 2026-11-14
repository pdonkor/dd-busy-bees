-- Phase 3: fees and payments. Amounts are whole pesewas (GHS 1 = 100 pesewas) so
-- sums are exact. A child's account is: invoices (termly fee, uniform and other
-- one-off charges) plus a feeding charge for each day they were checked in, minus
-- payments. Teachers see none of it; parents see only their own children's.
--
-- Who may do what: the owner sets fee plans and voids invoices and payments; the
-- office (owner or admin) issues invoices and records cash and bank payments;
-- Paystack payments are written only by the server after Paystack confirms them.

create type public.fee_kind as enum ('termly', 'one_off', 'feeding');

alter table public.schools
  add column sibling_discount_percent int not null default 0 check (sibling_discount_percent between 0 and 100);

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  name text not null check (char_length(name) <= 60),
  starts_on date not null,
  ends_on date not null,
  fees_due_on date not null,
  invoices_generated_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_on > starts_on),
  unique (school_id, starts_on)
);

create table public.fee_plans (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  name text not null check (char_length(name) <= 80),
  kind public.fee_kind not null,
  -- termly: per term; one_off: per item; feeding: per day attended
  amount_pesewas int not null check (amount_pesewas > 0 and amount_pesewas <= 100000000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.fee_plans (school_id);

alter table public.children
  add column fee_plan_id uuid references public.fee_plans (id) on delete set null,
  add column feeding_plan_id uuid references public.fee_plans (id) on delete set null;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  school_id uuid not null references public.schools (id),
  child_id uuid not null references public.children (id) on delete restrict,
  term_id uuid references public.terms (id) on delete restrict,
  kind text not null check (kind in ('termly', 'one_off')),
  description text not null check (char_length(description) <= 200),
  issued_on date not null default (now() at time zone 'Africa/Accra')::date,
  due_on date not null,
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  void_reason text check (char_length(void_reason) <= 300),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (kind <> 'termly' or term_id is not null)
);
create index on public.invoices (school_id, issued_on desc);
create index on public.invoices (child_id);
-- One termly invoice per child per term (a voided one can be reissued).
create unique index invoices_one_termly on public.invoices (child_id, term_id) where kind = 'termly' and voided_at is null;

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  description text not null check (char_length(description) <= 200),
  quantity int not null default 1 check (quantity between 1 and 1000),
  -- Negative for discounts.
  unit_pesewas int not null check (unit_pesewas between -100000000 and 100000000),
  amount_pesewas int generated always as (quantity * unit_pesewas) stored,
  position int not null default 0
);
create index on public.invoice_lines (invoice_id);

create table public.feeding_charges (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  child_id uuid not null references public.children (id) on delete cascade,
  attendance_id uuid references public.attendance (id) on delete cascade,
  date date not null,
  amount_pesewas int not null check (amount_pesewas > 0),
  created_at timestamptz not null default now(),
  unique (child_id, date)
);
create index on public.feeding_charges (school_id, date);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  child_id uuid not null references public.children (id) on delete restrict,
  amount_pesewas int not null check (amount_pesewas > 0 and amount_pesewas <= 100000000),
  method text not null check (method in ('paystack', 'cash', 'bank', 'momo_direct')),
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'void')),
  -- Paystack: our reference, and the channel the parent used (mobile_money, card…).
  reference text unique,
  channel text,
  paid_at timestamptz,
  payer_id uuid references public.profiles (id) on delete set null,
  recorded_by uuid references public.profiles (id),
  note text check (char_length(note) <= 300),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  void_reason text check (char_length(void_reason) <= 300),
  created_at timestamptz not null default now(),
  check (method = 'paystack' or (recorded_by is not null and status in ('success', 'void'))),
  check (status <> 'success' or paid_at is not null)
);
create index on public.payments (school_id, paid_at desc);
create index on public.payments (child_id);

-- Each child's running balance (positive = owes the school).
create view public.child_balances
with (security_invoker = true)
as
select
  c.id as child_id,
  c.school_id,
  -- A few child fields, so lists of balances don't need a second query.
  c.first_name,
  c.last_name,
  c.status,
  c.class_id,
  c.fee_plan_id,
  coalesce(inv.total, 0) as invoiced_pesewas,
  coalesce(feed.total, 0) as feeding_pesewas,
  coalesce(paid.total, 0) as paid_pesewas,
  coalesce(inv.total, 0) + coalesce(feed.total, 0) - coalesce(paid.total, 0) as balance_pesewas
from public.children c
left join lateral (
  select sum(l.amount_pesewas)::bigint as total
  from public.invoices i join public.invoice_lines l on l.invoice_id = i.id
  where i.child_id = c.id and i.voided_at is null
) inv on true
left join lateral (
  select sum(f.amount_pesewas)::bigint as total from public.feeding_charges f where f.child_id = c.id
) feed on true
left join lateral (
  select sum(p.amount_pesewas)::bigint as total from public.payments p where p.child_id = c.id and p.status = 'success'
) paid on true;

-- Helpers ---------------------------------------------------------------------------

/** Owner/admin of the child's school, or one of the child's parents. Teachers are left out on purpose. */
create function private.can_see_fees(target_child uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.children c
    where c.id = target_child and (private.is_admin(c.school_id) or private.is_guardian_of(c.id))
  )
$$;
grant execute on function private.can_see_fees(uuid) to authenticated;

-- Row-level security ------------------------------------------------------------------

alter table public.terms enable row level security;
alter table public.fee_plans enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.feeding_charges enable row level security;
alter table public.payments enable row level security;

create policy "members read terms" on public.terms
  for select to authenticated using (school_id = private.my_school_id());
create policy "admins manage terms" on public.terms
  for all to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));

create policy "office and parents read fee plans" on public.fee_plans
  for select to authenticated
  using (private.is_admin(school_id) or (school_id = private.my_school_id() and private.my_role() = 'parent'));
create policy "owner sets fees" on public.fee_plans
  for all to authenticated using (private.is_owner(school_id)) with check (private.is_owner(school_id));

create policy "office and parents read invoices" on public.invoices
  for select to authenticated using (private.can_see_fees(child_id));
create policy "office issues invoices" on public.invoices
  for insert to authenticated
  with check (private.is_admin(school_id) and created_by = auth.uid() and voided_at is null);
create policy "owner voids invoices" on public.invoices
  for update to authenticated using (private.is_owner(school_id)) with check (private.is_owner(school_id));

create policy "office and parents read invoice lines" on public.invoice_lines
  for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and private.can_see_fees(i.child_id)));
-- Lines can only be added while the invoice is being created (same transaction is not
-- required, but only by the office and only to invoices that aren't void).
create policy "office adds invoice lines" on public.invoice_lines
  for insert to authenticated
  with check (
    private.is_admin(school_id)
    and exists (select 1 from public.invoices i where i.id = invoice_id and i.voided_at is null and i.school_id = invoice_lines.school_id)
  );

create policy "office and parents read feeding" on public.feeding_charges
  for select to authenticated using (private.can_see_fees(child_id));
create policy "owner waives feeding" on public.feeding_charges
  for delete to authenticated using (private.is_owner(school_id));

create policy "office and parents read payments" on public.payments
  for select to authenticated using (private.can_see_fees(child_id));
create policy "office records cash and bank payments" on public.payments
  for insert to authenticated
  with check (
    private.is_admin(school_id)
    and method <> 'paystack'
    and status = 'success'
    and recorded_by = auth.uid()
    and voided_at is null
  );
create policy "owner voids payments" on public.payments
  for update to authenticated using (private.is_owner(school_id)) with check (private.is_owner(school_id));

-- Guards: an invoice or payment can only be voided, never rewritten -----------------

create function private.guard_money_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new; -- the server settling a Paystack payment
  end if;
  if tg_table_name = 'invoices' then
    if old.voided_at is not null then
      raise exception 'this invoice is already void';
    end if;
    if new.voided_at is null or new.void_reason is null
       or (to_jsonb(new) - array['voided_at', 'voided_by', 'void_reason'])
          <> (to_jsonb(old) - array['voided_at', 'voided_by', 'void_reason']) then
      raise exception 'an invoice can only be voided, with a reason';
    end if;
    new.voided_by := auth.uid();
  elsif tg_table_name = 'payments' then
    if old.status <> 'success' or new.status <> 'void' or new.void_reason is null
       or (to_jsonb(new) - array['status', 'voided_at', 'voided_by', 'void_reason'])
          <> (to_jsonb(old) - array['status', 'voided_at', 'voided_by', 'void_reason']) then
      raise exception 'a payment can only be voided, with a reason';
    end if;
    new.voided_by := auth.uid();
    new.voided_at := coalesce(new.voided_at, now());
  end if;
  return new;
end;
$$;

create trigger guard_money_update before update on public.invoices
  for each row execute function private.guard_money_update();
create trigger guard_money_update before update on public.payments
  for each row execute function private.guard_money_update();

-- Feeding is charged automatically from attendance -----------------------------------

create function private.charge_feeding()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  rate int;
begin
  select fp.amount_pesewas into rate
  from public.children c
  join public.fee_plans fp on fp.id = c.feeding_plan_id and fp.active and fp.kind = 'feeding'
  where c.id = new.child_id;
  if rate is not null then
    insert into public.feeding_charges (school_id, child_id, attendance_id, date, amount_pesewas)
    values (new.school_id, new.child_id, new.id, new.date, rate)
    on conflict (child_id, date) do nothing;
  end if;
  return new;
end;
$$;

create trigger charge_feeding after insert on public.attendance
  for each row execute function private.charge_feeding();

-- Same-school consistency ---------------------------------------------------------------

create function private.check_same_school_money()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name in ('invoices', 'payments', 'feeding_charges') then
    if (select school_id from public.children where id = new.child_id) is distinct from new.school_id then
      raise exception 'child belongs to another school';
    end if;
  end if;
  if tg_table_name = 'invoices' then
    if new.term_id is not null
       and (select school_id from public.terms where id = new.term_id) is distinct from new.school_id then
      raise exception 'term belongs to another school';
    end if;
  elsif tg_table_name = 'invoice_lines' then
    if (select school_id from public.invoices where id = new.invoice_id) is distinct from new.school_id then
      raise exception 'invoice belongs to another school';
    end if;
  elsif tg_table_name = 'children' then
    if new.fee_plan_id is not null and not exists (
      select 1 from public.fee_plans where id = new.fee_plan_id and school_id = new.school_id and kind = 'termly'
    ) then
      raise exception 'choose a termly fee plan from this school';
    end if;
    if new.feeding_plan_id is not null and not exists (
      select 1 from public.fee_plans where id = new.feeding_plan_id and school_id = new.school_id and kind = 'feeding'
    ) then
      raise exception 'choose a feeding plan from this school';
    end if;
  end if;
  return new;
end;
$$;

create trigger same_school_money before insert or update on public.invoices
  for each row execute function private.check_same_school_money();
create trigger same_school_money before insert or update on public.invoice_lines
  for each row execute function private.check_same_school_money();
create trigger same_school_money before insert or update on public.payments
  for each row execute function private.check_same_school_money();
create trigger same_school_money before insert or update on public.feeding_charges
  for each row execute function private.check_same_school_money();
create trigger same_school_money before insert or update of fee_plan_id, feeding_plan_id on public.children
  for each row execute function private.check_same_school_money();

-- Audit trail ------------------------------------------------------------------------------

create trigger audit after insert or update or delete on public.fee_plans
  for each row execute function private.write_audit();
create trigger audit after insert or update or delete on public.terms
  for each row execute function private.write_audit();
create trigger audit after insert or update or delete on public.invoices
  for each row execute function private.write_audit();
create trigger audit after insert or update or delete on public.invoice_lines
  for each row execute function private.write_audit();
create trigger audit after insert or update or delete on public.payments
  for each row execute function private.write_audit();
create trigger audit after insert or update or delete on public.feeding_charges
  for each row execute function private.write_audit();

-- Nothing in this migration is for logged-out visitors (row-level security already
-- returns nothing to them; this removes table access altogether).
revoke all on all tables in schema public from anon;
