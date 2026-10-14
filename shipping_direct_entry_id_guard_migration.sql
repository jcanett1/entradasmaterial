-- Protege el historial de salidas de Shipping Direct, que debe apuntar a
-- una entrada exacta. No aplica a kitteo_exits: KITTEO permite salidas válidas
-- registradas solo por número de parte, sin FIFO, PO, cantidad ni entry_id.
-- Las filas históricas de Shipping Direct con entry_id NULL no se modifican.

CREATE OR REPLACE FUNCTION public.require_shipping_direct_entry_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.entry_id IS NULL THEN
    RAISE EXCEPTION
      'No se puede registrar una salida de Shipping Direct sin entry_id exacto.'
      USING ERRCODE = '23502';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shipping_direct_require_entry_id_insert
  ON public.shipping_direct;
CREATE TRIGGER shipping_direct_require_entry_id_insert
  BEFORE INSERT ON public.shipping_direct
  FOR EACH ROW
  EXECUTE FUNCTION public.require_shipping_direct_entry_id();

DROP TRIGGER IF EXISTS shipping_direct_require_entry_id_update
  ON public.shipping_direct;
CREATE TRIGGER shipping_direct_require_entry_id_update
  BEFORE UPDATE OF entry_id ON public.shipping_direct
  FOR EACH ROW
  WHEN (NEW.entry_id IS NULL)
  EXECUTE FUNCTION public.require_shipping_direct_entry_id();
