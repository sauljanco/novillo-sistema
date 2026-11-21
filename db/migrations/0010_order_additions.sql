-- Amplía una ficha pendiente sin emitir un número nuevo.
-- El bloqueo de caja y pedido sigue el mismo orden que pay_order para evitar carreras.
CREATE OR REPLACE FUNCTION public.add_items_to_order(
  p_order_id bigint, p_cash_session_id bigint, p_cashier_user_id text, p_items jsonb
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_order_id bigint; v_expected integer; v_total bigint;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Productos inválidos';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_access WHERE user_id = p_cashier_user_id AND active
    AND role IN ('superadministrador', 'administrador', 'caja')) THEN
    RAISE EXCEPTION 'Usuario no autorizado';
  END IF;
  PERFORM 1 FROM public.cash_sessions WHERE id = p_cash_session_id AND closed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caja cerrada'; END IF;
  SELECT id INTO v_order_id FROM public.orders
    WHERE id = p_order_id AND paid_at IS NULL AND status <> 'anulado' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido pagado, cancelado o inexistente'; END IF;

  SELECT count(*) INTO v_expected
    FROM jsonb_array_elements(p_items) item
    JOIN public.products p ON p.id = (item.value->>'product_id')::bigint
      AND p.active AND p.deleted_at IS NULL AND p.price_cents > 0
    WHERE (item.value->>'quantity')::integer BETWEEN 1 AND 99;
  IF v_expected <> jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'Productos o cantidades inválidos';
  END IF;

  INSERT INTO public.order_items(order_id, product_id, product_name, presentation, quantity, unit_price_cents, line_total_cents)
    SELECT v_order_id, p.id, p.name, p.presentation, (item.value->>'quantity')::integer,
      p.price_cents, p.price_cents * (item.value->>'quantity')::integer
    FROM jsonb_array_elements(p_items) item
    JOIN public.products p ON p.id = (item.value->>'product_id')::bigint;
  SELECT sum(line_total_cents) INTO v_total FROM public.order_items WHERE order_id = v_order_id;
  IF v_total IS NULL OR v_total > 100000000 THEN RAISE EXCEPTION 'Total inválido'; END IF;
  UPDATE public.orders SET total_cents = v_total::integer WHERE id = v_order_id;
  RETURN v_order_id;
END;
$$;

-- El cajero solo confirma el importe que vio en pantalla. Si otra caja añadió
-- productos después, se exige refrescar la cuenta antes de cobrar.
CREATE OR REPLACE FUNCTION public.pay_order(
  p_order_id bigint, p_cash_session_id bigint, p_cashier_user_id text,
  p_payment_method text, p_expected_total_cents integer
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_order_id bigint; v_total integer;
BEGIN
  IF p_payment_method NOT IN ('efectivo', 'qr') THEN RAISE EXCEPTION 'Medio de pago inválido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_access WHERE user_id = p_cashier_user_id AND active
    AND role IN ('superadministrador', 'administrador', 'caja')) THEN
    RAISE EXCEPTION 'Cajero no autorizado';
  END IF;
  PERFORM 1 FROM public.cash_sessions WHERE id = p_cash_session_id AND closed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caja cerrada'; END IF;
  SELECT id, total_cents INTO v_order_id, v_total FROM public.orders
    WHERE id = p_order_id AND paid_at IS NULL AND status <> 'anulado' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido pagado, cancelado o inexistente'; END IF;
  IF v_total <> p_expected_total_cents THEN RAISE EXCEPTION 'El total del pedido cambió'; END IF;
  UPDATE public.orders SET payment_method = p_payment_method, paid_at = now(),
    paid_by = p_cashier_user_id, paid_cash_session_id = p_cash_session_id WHERE id = v_order_id;
  RETURN v_order_id;
END;
$$;
