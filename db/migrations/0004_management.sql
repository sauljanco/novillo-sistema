-- Administración del restaurante. Los importes se guardan en centavos de boliviano.
ALTER TABLE public.staff_access DROP CONSTRAINT IF EXISTS staff_access_role_check;
ALTER TABLE public.staff_access ADD CONSTRAINT staff_access_role_check
  CHECK (role IN ('superadministrador', 'administrador', 'caja', 'cocina'));

CREATE TABLE IF NOT EXISTS public.employees (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name text NOT NULL,
  job_title text NOT NULL DEFAULT '',
  daily_rate_cents integer NOT NULL DEFAULT 0 CHECK (daily_rate_cents >= 0),
  half_day_rate_cents integer NOT NULL DEFAULT 0 CHECK (half_day_rate_cents >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.work_shifts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id bigint NOT NULL REFERENCES public.employees(id),
  work_date date NOT NULL,
  shift text NOT NULL CHECK (shift IN ('dia', 'medio_dia', 'noche')),
  note text NOT NULL DEFAULT '',
  UNIQUE (employee_id, work_date, shift)
);
CREATE INDEX IF NOT EXISTS work_shifts_date_idx ON public.work_shifts(work_date);
CREATE TABLE IF NOT EXISTS public.attendance (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id bigint NOT NULL REFERENCES public.employees(id),
  work_date date NOT NULL,
  work_type text NOT NULL CHECK (work_type IN ('dia', 'medio_dia')),
  earned_cents integer NOT NULL CHECK (earned_cents >= 0),
  note text NOT NULL DEFAULT '',
  recorded_by text NOT NULL REFERENCES public.staff_access(user_id),
  UNIQUE (employee_id, work_date)
);
CREATE INDEX IF NOT EXISTS attendance_date_idx ON public.attendance(work_date);
CREATE TABLE IF NOT EXISTS public.payroll_payments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id bigint NOT NULL REFERENCES public.employees(id),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  payment_type text NOT NULL CHECK (payment_type IN ('sueldo', 'adelanto')),
  payment_method text NOT NULL CHECK (payment_method IN ('efectivo', 'qr')),
  paid_at timestamptz NOT NULL DEFAULT now(),
  note text NOT NULL DEFAULT '',
  recorded_by text NOT NULL REFERENCES public.staff_access(user_id)
);
CREATE INDEX IF NOT EXISTS payroll_payments_employee_idx ON public.payroll_payments(employee_id, paid_at);

CREATE TABLE IF NOT EXISTS public.suppliers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE,
  contact text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE,
  unit text NOT NULL,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  minimum_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK (minimum_quantity >= 0),
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inventory_item_id bigint NOT NULL REFERENCES public.inventory_items(id),
  quantity_delta numeric(14,3) NOT NULL CHECK (quantity_delta <> 0),
  reason text NOT NULL CHECK (reason IN ('compra', 'ajuste', 'consumo', 'merma')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text NOT NULL REFERENCES public.staff_access(user_id)
);
CREATE INDEX IF NOT EXISTS stock_movements_item_idx ON public.stock_movements(inventory_item_id, created_at);
CREATE TABLE IF NOT EXISTS public.purchases (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  supplier_id bigint REFERENCES public.suppliers(id),
  inventory_item_id bigint REFERENCES public.inventory_items(id),
  quantity numeric(14,3),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  category text NOT NULL CHECK (category IN ('insumo', 'inversion', 'gasto')),
  description text NOT NULL,
  payment_status text NOT NULL CHECK (payment_status IN ('pagado', 'pendiente')),
  purchased_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text NOT NULL REFERENCES public.staff_access(user_id),
  CHECK ((category = 'insumo' AND inventory_item_id IS NOT NULL AND quantity > 0)
    OR (category <> 'insumo' AND inventory_item_id IS NULL AND quantity IS NULL))
);
CREATE INDEX IF NOT EXISTS purchases_date_idx ON public.purchases(purchased_at);

-- Compra de insumo y aumento de existencias en una sola transacción.
CREATE OR REPLACE FUNCTION public.record_purchase(
  p_supplier_id bigint, p_item_id bigint, p_quantity numeric,
  p_amount_cents integer, p_category text, p_description text,
  p_payment_status text, p_user_id text
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_id bigint;
BEGIN
  IF p_category = 'insumo' AND (p_item_id IS NULL OR p_quantity <= 0) THEN
    RAISE EXCEPTION 'Cantidad o artículo inválido';
  END IF;
  IF p_category <> 'insumo' AND p_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'Artículo solo permitido para insumos';
  END IF;
  INSERT INTO public.purchases(supplier_id, inventory_item_id, quantity, amount_cents,
    category, description, payment_status, recorded_by)
  VALUES (p_supplier_id, p_item_id, CASE WHEN p_category = 'insumo' THEN p_quantity ELSE NULL END,
    p_amount_cents, p_category, p_description, p_payment_status, p_user_id)
  RETURNING id INTO v_id;
  IF p_category = 'insumo' THEN
    UPDATE public.inventory_items SET quantity = quantity + p_quantity WHERE id = p_item_id AND active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Artículo no disponible'; END IF;
    INSERT INTO public.stock_movements(inventory_item_id, quantity_delta, reason, note, recorded_by)
    VALUES (p_item_id, p_quantity, 'compra', 'Compra #' || v_id, p_user_id);
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_item_id bigint, p_delta numeric, p_reason text, p_note text, p_user_id text
) RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE v_quantity numeric;
BEGIN
  IF p_delta = 0 OR p_reason NOT IN ('ajuste', 'consumo', 'merma') THEN
    RAISE EXCEPTION 'Movimiento inválido';
  END IF;
  UPDATE public.inventory_items SET quantity = quantity + p_delta
    WHERE id = p_item_id AND active AND quantity + p_delta >= 0
    RETURNING quantity INTO v_quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'Existencia insuficiente o artículo inactivo'; END IF;
  INSERT INTO public.stock_movements(inventory_item_id, quantity_delta, reason, note, recorded_by)
    VALUES (p_item_id, p_delta, p_reason, p_note, p_user_id);
  RETURN v_quantity;
END;
$$;

-- Permite operar la caja al superadministrador.
CREATE OR REPLACE FUNCTION public.create_paid_order(
  p_cash_session_id bigint, p_cashier_user_id text, p_payment_method text, p_items jsonb
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_order_id bigint; v_ticket integer;
  v_date date := (now() AT TIME ZONE 'America/La_Paz')::date;
  v_total integer; v_expected integer;
BEGIN
  IF p_payment_method NOT IN ('efectivo', 'qr') THEN RAISE EXCEPTION 'Medio de pago inválido'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Pedido inválido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_access WHERE user_id = p_cashier_user_id AND active
    AND role IN ('superadministrador','administrador','caja')) THEN RAISE EXCEPTION 'Cajero no autorizado'; END IF;
  PERFORM 1 FROM public.cash_sessions WHERE id = p_cash_session_id AND closed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caja cerrada'; END IF;
  SELECT count(*), sum(p.price_cents * (item.value->>'quantity')::integer) INTO v_expected, v_total
    FROM jsonb_array_elements(p_items) item
    JOIN public.products p ON p.id = (item.value->>'product_id')::bigint AND p.active
    WHERE (item.value->>'quantity')::integer BETWEEN 1 AND 99;
  IF v_expected <> jsonb_array_length(p_items) OR v_total IS NULL OR v_total <= 0 THEN
    RAISE EXCEPTION 'Productos o cantidades inválidos'; END IF;
  INSERT INTO public.daily_tickets(service_date, last_number) VALUES (v_date, 1)
    ON CONFLICT (service_date) DO UPDATE SET last_number = daily_tickets.last_number + 1
    RETURNING last_number INTO v_ticket;
  INSERT INTO public.orders(service_date, ticket_number, cash_session_id, cashier_user_id, payment_method, total_cents)
    VALUES (v_date, v_ticket, p_cash_session_id, p_cashier_user_id, p_payment_method, v_total)
    RETURNING id INTO v_order_id;
  INSERT INTO public.order_items(order_id, product_id, product_name, presentation, quantity, unit_price_cents, line_total_cents)
    SELECT v_order_id, p.id, p.name, p.presentation, (item.value->>'quantity')::integer,
      p.price_cents, p.price_cents * (item.value->>'quantity')::integer
    FROM jsonb_array_elements(p_items) item JOIN public.products p ON p.id = (item.value->>'product_id')::bigint;
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
    WHERE cash_session_id = p_session_id AND payment_method = 'efectivo' AND status <> 'anulado';
  UPDATE public.cash_sessions SET closed_by = p_user_id, closed_at = now(),
    counted_cash_cents = p_counted_cash_cents WHERE id = p_session_id;
  RETURN QUERY SELECT p_session_id, v_opening::bigint + v_cash_sales,
    p_counted_cash_cents::bigint - v_opening::bigint - v_cash_sales;
END;
$$;
