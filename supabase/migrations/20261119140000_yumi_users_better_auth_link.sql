-- Penghubung akun karyawan/internal ke akun Google (Better Auth). auth_user_id dipakai Supabase Auth, jangan diubah.
ALTER TABLE public.yumi_users ADD COLUMN IF NOT EXISTS better_auth_user_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_yumi_users_better_auth_user_id ON public.yumi_users (better_auth_user_id) WHERE better_auth_user_id IS NOT NULL;
-- Akun HRD lama yang auth_user_id-nya sudah id Better Auth ikut dihubungkan.
UPDATE public.yumi_users u SET better_auth_user_id = u.auth_user_id
 WHERE u.better_auth_user_id IS NULL AND u.auth_user_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM public."user" b WHERE b.id = u.auth_user_id);
