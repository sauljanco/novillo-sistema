-- Acceso explícito: registrarse en Neon Auth no concede permisos operativos.
CREATE TABLE IF NOT EXISTS public.staff_access (
  user_id text PRIMARY KEY,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('administrador', 'caja', 'cocina')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  opened_by text NOT NULL REFERENCES public.staff_access(user_id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_cash_cents integer NOT NULL CHECK (opening_cash_cents >= 0),
  closed_by text REFERENCES public.staff_access(user_id),
  closed_at timestamptz,
  counted_cash_cents integer CHECK (counted_cash_cents >= 0),
  CHECK ((closed_at IS NULL AND closed_by IS NULL AND counted_cash_cents IS NULL)
      OR (closed_at IS NOT NULL AND closed_by IS NOT NULL AND counted_cash_cents IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_cash_session
  ON public.cash_sessions ((true)) WHERE closed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.daily_tickets (
  service_date date PRIMARY KEY,
  last_number integer NOT NULL CHECK (last_number > 0)
);

CREATE TABLE IF NOT EXISTS public.orders (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service_date date NOT NULL,
  ticket_number integer NOT NULL,
  cash_session_id bigint NOT NULL REFERENCES public.cash_sessions(id),
  cashier_user_id text NOT NULL REFERENCES public.staff_access(user_id),
  payment_method text NOT NULL CHECK (payment_method IN ('efectivo', 'qr')),
  total_cents integer NOT NULL CHECK (total_cents > 0),
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'preparando', 'listo', 'entregado', 'anulado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_date, ticket_number)
);
CREATE INDEX IF NOT EXISTS orders_session_created_idx ON public.orders (cash_session_id, created_at);

CREATE TABLE IF NOT EXISTS public.order_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES public.orders(id),
  product_id bigint NOT NULL REFERENCES public.products(id),
  product_name text NOT NULL,
  presentation text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents integer NOT NULL CHECK (line_total_cents >= 0)
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON public.order_items (order_id);

-- La base vuelve a calcular los precios. La ficha nace en la misma transacción que el cobro registrado.
CREATE OR REPLACE FUNCTION public.create_paid_order(
  p_cash_session_id bigint,
  p_cashier_user_id text,
  p_payment_method text,
  p_items jsonb
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  v_order_id bigint;
  v_ticket integer;
  v_date date := (now() AT TIME ZONE 'America/La_Paz')::date;
  v_total integer;
  v_expected integer;
BEGIN
  IF p_payment_method NOT IN ('efectivo', 'qr') THEN
    RAISE EXCEPTION 'Medio de pago inválido';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Pedido inválido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_access WHERE user_id = p_cashier_user_id AND active AND role IN ('administrador','caja')) THEN
    RAISE EXCEPTION 'Cajero no autorizado';
  END IF;
  PERFORM 1 FROM public.cash_sessions WHERE id = p_cash_session_id AND closed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caja cerrada'; END IF;

  SELECT count(*), sum(p.price_cents * (item.value->>'quantity')::integer)
    INTO v_expected, v_total
  FROM jsonb_array_elements(p_items) item
  JOIN public.products p ON p.id = (item.value->>'product_id')::bigint AND p.active
  WHERE (item.value->>'quantity')::integer BETWEEN 1 AND 99;
  IF v_expected <> jsonb_array_length(p_items) OR v_total IS NULL OR v_total <= 0 THEN
    RAISE EXCEPTION 'Productos o cantidades inválidos';
  END IF;

  INSERT INTO public.daily_tickets(service_date, last_number) VALUES (v_date, 1)
    ON CONFLICT (service_date) DO UPDATE SET last_number = daily_tickets.last_number + 1
    RETURNING last_number INTO v_ticket;
  INSERT INTO public.orders(service_date, ticket_number, cash_session_id, cashier_user_id, payment_method, total_cents)
    VALUES (v_date, v_ticket, p_cash_session_id, p_cashier_user_id, p_payment_method, v_total)
    RETURNING id INTO v_order_id;
  INSERT INTO public.order_items(order_id, product_id, product_name, presentation, quantity, unit_price_cents, line_total_cents)
    SELECT v_order_id, p.id, p.name, p.presentation, (item.value->>'quantity')::integer,
           p.price_cents, p.price_cents * (item.value->>'quantity')::integer
    FROM jsonb_array_elements(p_items) item
    JOIN public.products p ON p.id = (item.value->>'product_id')::bigint;
  RETURN v_order_id;
END;
$$;
