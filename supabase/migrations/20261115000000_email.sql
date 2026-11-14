-- Email: parents can choose an address for payment receipts (they log in by phone, so
-- this is separate from profiles.email, which office accounts log in with).

alter table public.profiles
  add column receipt_email text check (
    receipt_email is null
    or (char_length(receipt_email) <= 200 and receipt_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  );

-- A parent sets or clears their own receipt address. Admins can also edit it through the
-- existing "admins update school profiles" policy.
create function public.set_receipt_email(address text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  cleaned text := nullif(lower(btrim(address)), '');
begin
  if cleaned is not null and (char_length(cleaned) > 200 or cleaned !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid email address' using errcode = '22023';
  end if;
  update public.profiles set receipt_email = cleaned
  where id = auth.uid() and active and role = 'parent';
end;
$$;
revoke execute on function public.set_receipt_email(text) from anon, public;
grant execute on function public.set_receipt_email(text) to authenticated;

-- sms_log also records emails (kind "receipt-email", "invite-email"), so every automatic
-- message, whatever the channel, is sent at most once.
alter table public.sms_log add column channel text not null default 'sms' check (channel in ('sms', 'email'));
