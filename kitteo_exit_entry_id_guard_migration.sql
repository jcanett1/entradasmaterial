-- Evita crear nuevas salidas terminales sin vínculo a la entrada exacta.
-- Protege KITTEO y Shipping Direct.
-- Las filas históricas que ya tienen entry_id = NULL se conservan y pueden
-- actualizarse en otras columnas; la regla protege INSERT y cambios explícitos
-- de entry_id a NULL.

CREATE OR REPLACE FUNCTION public.require_exact_entry_for_exit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.entry_id IS NULL THEN
    RAISE EXCEPTION
      'No se puede registrar una salida sin entry_id exacto. Asigna la entrada/FIFO antes de guardar.'
      USING ERRCODE = '23502';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kitteo_exits_require_entry_id_insert
  ON public.kitteo_exits;
CREATE TRIGGER kitteo_exits_require_entry_id_insert
  BEFORE INSERT ON public.kitteo_exits
  FOR EACH ROW
  EXECUTE FUNCTION public.require_exact_entry_for_exit();

DROP TRIGGER IF EXISTS kitteo_exits_require_entry_id_update
  ON public.kitteo_exits;
CREATE TRIGGER kitteo_exits_require_entry_id_update
  BEFORE UPDATE OF entry_id ON public.kitteo_exits
  FOR EACH ROW
  WHEN (NEW.entry_id IS NULL)
  EXECUTE FUNCTION public.require_exact_entry_for_exit();

DROP TRIGGER IF EXISTS shipping_direct_require_entry_id_insert
  ON public.shipping_direct;
CREATE TRIGGER shipping_direct_require_entry_id_insert
  BEFORE INSERT ON public.shipping_direct
  FOR EACH ROW
  EXECUTE FUNCTION public.require_exact_entry_for_exit();

DROP TRIGGER IF EXISTS shipping_direct_require_entry_id_update
  ON public.shipping_direct;
CREATE TRIGGER shipping_direct_require_entry_id_update
  BEFORE UPDATE OF entry_id ON public.shipping_direct
  FOR EACH ROW
  WHEN (NEW.entry_id IS NULL)
  EXECUTE FUNCTION public.require_exact_entry_for_exit();
