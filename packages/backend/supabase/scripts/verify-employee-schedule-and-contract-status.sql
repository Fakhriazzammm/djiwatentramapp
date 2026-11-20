-- Run in a transaction after loading the migration without its COMMIT.
do $$
declare
  staff_id text := 'verify-schedule-' || gen_random_uuid();
  admin_id text := 'verify-admin-' || gen_random_uuid();
  admin_token text := gen_random_uuid()::text;
  contract_id uuid;
  staff_role text;
  admin_role text;
  shift_date date := (now() at time zone 'Asia/Jakarta')::date + 14;
begin
  select source_id into strict staff_role from public.yumi_roles where lower(trim(name)) = 'barista';
  select source_id into strict admin_role from public.yumi_roles where lower(trim(name)) = 'owner';
  insert into public.yumi_users(source_id, username, name, role_source_id, is_active) values
    (staff_id, staff_id, staff_id, staff_role, true),
    (admin_id, admin_id, admin_id, admin_role, true);
  insert into public.yumi_sessions(token, user_source_id, expires_at)
  values (admin_token, admin_id, now() + interval '1 minute');
  insert into public.employee_onboarding_applications(full_name, email, phone, status, approved_user_source_id, contract_status)
  values (staff_id, staff_id || '@example.test', '0800000000', 'pending', null, 'pending')
  returning id into contract_id;
  update public.employee_onboarding_applications
     set status = 'approved', approved_user_source_id = staff_id, contract_status = 'signed'
   where id = contract_id;
  insert into pos.attendance_schedules(source_id, user_id, date, shift_name)
  values (staff_id, staff_id, shift_date, 'Pagi');

  begin
    perform public.admin_set_employee_schedule(null, staff_id, false);
    raise exception 'Anonymous caller changed scheduling';
  exception when insufficient_privilege then null;
  end;

  perform public.admin_set_employee_schedule(admin_token, staff_id, false);
  if not exists(select 1 from public.pos_staff_users where "_id" = staff_id and "isActive" and not "scheduleEnabled") then
    raise exception 'Schedule preference changed account access or was not propagated';
  end if;
  begin
    perform public.admin_replace_employee_schedules(admin_token, array[staff_id], shift_date, shift_date, '[]');
    raise exception 'Bulk replace accepted excluded employee';
  exception when check_violation then null;
  end;
  if not exists(select 1 from pos.attendance_schedules where source_id = staff_id) then
    raise exception 'Existing shift disappeared';
  end if;
  begin
    insert into pos.attendance_schedules(source_id, user_id, date, shift_name)
    values (staff_id || '-new', staff_id, shift_date + 1, 'Sore');
    raise exception 'New shift accepted excluded employee';
  exception when check_violation then null;
  end;
  update pos.attendance_schedules set note = 'existing shift still editable' where source_id = staff_id;

  begin
    update pos.attendance_schedules set raw = jsonb_build_object('coverFor', admin_id) where source_id = staff_id;
    raise exception 'Shift cover accepted excluded employee';
  exception when check_violation then null;
  end;
  begin
    perform public.admin_set_employee_contract_status(admin_token, admin_id, contract_id, 'resigned');
    raise exception 'Contract attached to another employee was updated';
  exception when no_data_found then null;
  end;
  perform public.admin_set_employee_contract_status(admin_token, staff_id, contract_id, 'resigned');
  if not exists(select 1 from public.employee_onboarding_applications where id = contract_id
      and employment_contract_status = 'resigned' and contract_status = 'signed') then
    raise exception 'Contract status changed the signature workflow';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(public.admin_employee_directory(admin_token)) row
    where row->>'_id' = staff_id and row->>'scheduleEnabled' = 'false'
      and row#>>'{raw,contracts,0,employmentStatus}' = 'resigned'
  ) then
    raise exception 'Directory did not return the saved settings';
  end if;
  if public.admin_set_employee_contract_status(admin_token, staff_id, contract_id, 'ended') <> 'ended'
    or public.admin_set_employee_contract_status(admin_token, staff_id, contract_id, 'active') <> 'active' then
    raise exception 'Valid contract statuses were rejected';
  end if;
  perform public.admin_set_employee_schedule(admin_token, staff_id, true);
  perform public.admin_replace_employee_schedules(admin_token, array[staff_id], shift_date, shift_date, jsonb_build_array(
    jsonb_build_object('user_id', staff_id, 'date', shift_date, 'shift_name', 'Sore', 'status', 'scheduled')
  ));
  if not exists (select 1 from pos.attendance_schedules where user_id = staff_id and date = shift_date and shift_name = 'Sore') then
    raise exception 'Re-enabled employee could not be scheduled';
  end if;
end;
$$;
