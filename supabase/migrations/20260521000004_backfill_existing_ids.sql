-- Backfill registration_number for existing applications (from raw->>registrationNumber)
-- and employee_nip for approved applications

-- Step 1: Copy raw->>registrationNumber to new registration_number column for existing records
update public.employee_onboarding_applications
set registration_number = raw->>'registrationNumber'
where registration_number is null
  and raw->>'registrationNumber' is not null;

-- Step 2: Generate sequential REG numbers for records that have no raw->>registrationNumber
-- (edge case — should not happen, but handle safely)
do $$
declare
  rec record;
  new_reg text;
begin
  for rec in select id from employee_onboarding_applications
    where registration_number is null
    order by created_at asc
  loop
    new_reg := next_registration_number('registration', 'REG');
    update employee_onboarding_applications
    set registration_number = new_reg
    where id = rec.id;
  end loop;
end $$;

-- Step 3: Generate employee NIP for approved users that don't have one
do $$
declare
  rec record;
  new_nip text;
  role_prefix text;
  role_name text;
begin
  for rec in select e.id, e.employment, e.approved_user_source_id
    from employee_onboarding_applications e
    where e.status = 'approved'
      and e.employee_nip is null
      and e.approved_user_source_id is not null
    order by e.created_at asc
  loop
    role_name := upper(trim(rec.employment->>'roleName'));
    role_prefix := case
      when role_name like 'BARISTA%' then 'BRT'
      when role_name like 'KASIR%' then 'KSR'
      when role_name like 'WAITRESS%' or role_name like 'WAITER%' then 'WTR'
      when role_name like 'CHEF%' then 'CHF'
      when role_name like 'KITCHEN%' or role_name like 'KTC%' then 'KTC'
      when role_name like 'MANAGER%' or role_name like 'MGR%' then 'MGR'
      when role_name like 'SUPERVISOR%' or role_name like 'SPV%' then 'SPV'
      when role_name like 'ADMIN%' or role_name like 'ADM%' then 'ADM'
      else 'EMP'
    end;
    new_nip := next_registration_number(role_prefix, role_prefix);
    update employee_onboarding_applications
    set employee_nip = new_nip
    where id = rec.id;
    if rec.approved_user_source_id is not null then
      update yumi_users
      set employee_nip = new_nip
      where source_id = rec.approved_user_source_id;
    end if;
  end loop;
end $$;
