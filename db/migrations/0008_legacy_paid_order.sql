-- Protege pedidos creados por la versión anterior mientras Vercel cambia de versión.
CREATE OR REPLACE FUNCTION public.stamp_legacy_paid_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.payment_method IS NOT NULL AND NEW.paid_at IS NULL THEN
    NEW.paid_at := now();
    NEW.paid_by := NEW.cashier_user_id;
    NEW.paid_cash_session_id := NEW.cash_session_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS stamp_legacy_paid_order ON public.orders;
CREATE TRIGGER stamp_legacy_paid_order BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.stamp_legacy_paid_order();
