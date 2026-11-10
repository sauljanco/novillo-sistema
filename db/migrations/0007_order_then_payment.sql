-- La ficha se emite al pedir; el recibo usa el mismo numero al cobrar.
ALTER TABLE public.orders ALTER COLUMN payment_method DROP NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_by text REFERENCES public.staff_access(user_id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_cash_session_id bigint REFERENCES public.cash_sessions(id);
UPDATE public.orders SET paid_at = created_at, paid_by = cashier_user_id,
  paid_cash_session_id = cash_session_id
WHERE payment_method IS NOT NULL AND paid_at IS NULL;
CREATE INDEX IF NOT EXISTS orders_unpaid_idx ON public.orders (service_date, id DESC)
  WHERE paid_at IS NULL AND status <> 'anulado';
CREATE INDEX IF NOT EXISTS orders_paid_session_idx ON public.orders (paid_cash_session_id)
  WHERE paid_at IS NOT NULL AND status <> 'anulado';

CREATE OR REPLACE FUNCTION public.create_pending_order(
  p_cash_session_id bigint, p_cashier_user_id text, p_items jsonb
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_order_id bigint; v_ticket integer;
  v_date date := (now() AT TIME ZONE 'America/La_Paz')::date;
  v_total integer; v_expected integer;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Pedido inválido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_access WHERE user_id = p_cashier_user_id AND active
    AND role IN ('superadministrador','administrador','caja')) THEN RAISE EXCEPTION 'Usuario no autorizado'; END IF;
  PERFORM 1 FROM public.cash_sessions WHERE id = p_cash_session_id AND closed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caja cerrada'; END IF;
  SELECT count(*), sum(p.price_cents * (item.value->>'quantity')::integer) INTO v_expected, v_total
    FROM jsonb_array_elements(p_items) item
    JOIN public.products p ON p.id = (item.value->>'product_id')::bigint AND p.active AND p.deleted_at IS NULL
    WHERE (item.value->>'quantity')::integer BETWEEN 1 AND 99;
  IF v_expected <> jsonb_array_length(p_items) OR v_total IS NULL OR v_total <= 0 THEN
    RAISE EXCEPTION 'Productos o cantidades inválidos'; END IF;
  INSERT INTO public.daily_tickets(service_date, last_number) VALUES (v_date, 1)
    ON CONFLICT (service_date) DO UPDATE SET last_number = daily_tickets.last_number + 1
    RETURNING last_number INTO v_ticket;
  INSERT INTO public.orders(service_date, ticket_number, cash_session_id, cashier_user_id, total_cents)
    VALUES (v_date, v_ticket, p_cash_session_id, p_cashier_user_id, v_total)
    RETURNING id INTO v_order_id;
  INSERT INTO public.order_items(order_id, product_id, product_name, presentation, quantity, unit_price_cents, line_total_cents)
    SELECT v_order_id, p.id, p.name, p.presentation, (item.value->>'quantity')::integer,
      p.price_cents, p.price_cents * (item.value->>'quantity')::integer
    FROM jsonb_array_elements(p_items) item JOIN public.products p ON p.id = (item.value->>'product_id')::bigint;
  RETURN v_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pay_order(
  p_order_id bigint, p_cash_session_id bigint, p_cashier_user_id text, p_payment_method text
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_order_id bigint;
BEGIN
  IF p_payment_method NOT IN ('efectivo','qr') THEN RAISE EXCEPTION 'Medio de pago inválido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_access WHERE user_id = p_cashier_user_id AND active
    AND role IN ('superadministrador','administrador','caja')) THEN RAISE EXCEPTION 'Cajero no autorizado'; END IF;
  PERFORM 1 FROM public.cash_sessions WHERE id = p_cash_session_id AND closed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caja cerrada'; END IF;
  SELECT id INTO v_order_id FROM public.orders WHERE id = p_order_id AND paid_at IS NULL
    AND status <> 'anulado' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido pagado, anulado o inexistente'; END IF;
  UPDATE public.orders SET payment_method = p_payment_method, paid_at = now(),
    paid_by = p_cashier_user_id, paid_cash_session_id = p_cash_session_id WHERE id = v_order_id;
  RETURN v_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_cash_session(
  p_session_id bigint, p_user_id text, p_counted_cash_cents integer
) RETURNS TABLE (session_id bigint, expected_cash_cents bigint, difference_cents bigint)
LANGUAGE plpgsql AS $$
DECLARE v_opening integer; v_cash_sales bigint;
BEGIN
  IF p_counted_cash_cents < 0 OR p_counted_cash_cents > 100000000 THEN RAISE EXCEPTION 'Conteo inválido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_access WHERE user_id = p_user_id AND active
    AND role IN ('superadministrador','administrador','caja')) THEN RAISE EXCEPTION 'Usuario no autorizado'; END IF;
  SELECT opening_cash_cents INTO v_opening FROM public.cash_sessions
    WHERE id = p_session_id AND closed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caja cerrada'; END IF;
  SELECT COALESCE(sum(total_cents), 0) INTO v_cash_sales FROM public.orders
    WHERE paid_cash_session_id = p_session_id AND payment_method = 'efectivo' AND status <> 'anulado';
  UPDATE public.cash_sessions SET closed_by = p_user_id, closed_at = now(),
    counted_cash_cents = p_counted_cash_cents WHERE id = p_session_id;
  RETURN QUERY SELECT p_session_id, v_opening::bigint + v_cash_sales,
    p_counted_cash_cents::bigint - v_opening::bigint - v_cash_sales;
END;
$$;
