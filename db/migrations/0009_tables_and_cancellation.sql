-- Cada pedido nuevo corresponde a una de las doce mesas del salón.
-- La columna admite NULL para conservar las fichas anteriores a esta versión.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS table_number smallint;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_table_number_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_table_number_check
  CHECK (table_number BETWEEN 1 AND 12);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS canceled_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS canceled_by text REFERENCES public.staff_access(user_id);

-- La firma anterior permanece disponible durante el cambio de despliegue.
CREATE OR REPLACE FUNCTION public.create_pending_order(
  p_cash_session_id bigint, p_cashier_user_id text, p_items jsonb, p_table_number smallint
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_order_id bigint;
BEGIN
  IF p_table_number IS NULL OR p_table_number NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Mesa inválida';
  END IF;
  v_order_id := public.create_pending_order(p_cash_session_id, p_cashier_user_id, p_items);
  UPDATE public.orders SET table_number = p_table_number WHERE id = v_order_id;
  RETURN v_order_id;
END;
$$;
