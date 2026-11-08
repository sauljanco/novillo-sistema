CREATE OR REPLACE FUNCTION public.close_cash_session(
  p_session_id bigint, p_user_id text, p_counted_cash_cents integer
) RETURNS TABLE (session_id bigint, expected_cash_cents bigint, difference_cents bigint)
LANGUAGE plpgsql AS $$
DECLARE v_opening integer; v_cash_sales bigint;
BEGIN
  IF p_counted_cash_cents < 0 OR p_counted_cash_cents > 100000000 THEN
    RAISE EXCEPTION 'Conteo inválido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_access WHERE user_id = p_user_id AND active AND role IN ('administrador','caja')) THEN
    RAISE EXCEPTION 'Usuario no autorizado';
  END IF;
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
