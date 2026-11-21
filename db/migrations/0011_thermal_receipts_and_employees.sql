-- Conserva lo entregado por el cliente para mostrar el cambio real en el recibo.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS amount_received_cents integer
  CHECK (amount_received_cents IS NULL OR amount_received_cents >= total_cents);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS change_cents integer
  CHECK (change_cents IS NULL OR change_cents >= 0);

-- Retirar un empleado lo oculta del listado activo sin perder turnos ni pagos.
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS removed_at timestamptz;

-- Firma nueva; la anterior permanece durante el cambio de despliegue.
CREATE OR REPLACE FUNCTION public.pay_order(
  p_order_id bigint, p_cash_session_id bigint, p_cashier_user_id text,
  p_payment_method text, p_expected_total_cents integer, p_amount_received_cents integer
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
  IF p_amount_received_cents IS NULL OR p_amount_received_cents < v_total
    OR p_amount_received_cents > 100000000
    OR (p_payment_method = 'qr' AND p_amount_received_cents <> v_total) THEN
    RAISE EXCEPTION 'Importe recibido inválido';
  END IF;
  UPDATE public.orders SET payment_method = p_payment_method, paid_at = now(),
    paid_by = p_cashier_user_id, paid_cash_session_id = p_cash_session_id,
    amount_received_cents = p_amount_received_cents,
    change_cents = p_amount_received_cents - v_total
    WHERE id = v_order_id;
  RETURN v_order_id;
END;
$$;
