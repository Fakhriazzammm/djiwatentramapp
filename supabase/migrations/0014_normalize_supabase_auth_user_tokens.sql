update auth.users
set
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change = coalesce(email_change, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  updated_at = now()
where confirmation_token is null
   or recovery_token is null
   or email_change is null
   or email_change_token_new is null;
