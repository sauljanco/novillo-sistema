-- Invitaciones aprobadas por superadministrador. La contraseña la crea cada usuario.
CREATE TABLE IF NOT EXISTS public.staff_invites (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL CHECK (email = lower(email)),
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('administrador', 'caja')),
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'aceptada', 'revocada')),
  created_by text NOT NULL REFERENCES public.staff_access(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_user_id text,
  accepted_at timestamptz,
  CHECK ((status = 'aceptada' AND accepted_user_id IS NOT NULL AND accepted_at IS NOT NULL)
    OR (status <> 'aceptada' AND accepted_user_id IS NULL AND accepted_at IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS staff_invites_one_pending_email
  ON public.staff_invites(email) WHERE status = 'pendiente';
CREATE INDEX IF NOT EXISTS staff_invites_created_idx ON public.staff_invites(created_at DESC);

-- Se ejecuta al cargar /api/me: solo acepta una invitación si Neon ya verificó el correo.
CREATE OR REPLACE FUNCTION public.claim_staff_invite(p_user_id text)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_user record; v_invite public.staff_invites%ROWTYPE;
BEGIN
  SELECT u.id, u.email INTO v_user FROM neon_auth."user" u
    WHERE u.id::text = p_user_id AND u."emailVerified" = true;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v_invite FROM public.staff_invites
    WHERE email = lower(v_user.email) AND status = 'pendiente' AND expires_at > now()
    FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.staff_access(user_id, display_name, role, active)
    VALUES (p_user_id, v_invite.display_name, v_invite.role, true)
    ON CONFLICT (user_id) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.staff_invites SET status = 'aceptada', accepted_user_id = p_user_id,
    accepted_at = now() WHERE id = v_invite.id;
  RETURN true;
END;
$$;
