-- ============================================================
-- MIGRACIÓN: endurecer permisos de los RPC de Shipping Direct
-- Sigue a shipping_direct_return_and_review.
-- ============================================================

DROP POLICY IF EXISTS shipping_direct_update_managers ON public.shipping_direct;
CREATE POLICY shipping_direct_update_managers
  ON public.shipping_direct
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarioalmacen AS ua
      WHERE ua.user_id = (SELECT auth.uid())
        AND ua.activo = true
        AND ua.rol IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarioalmacen AS ua
      WHERE ua.user_id = (SELECT auth.uid())
        AND ua.activo = true
        AND ua.rol IN ('admin', 'supervisor')
    )
  );

REVOKE ALL ON FUNCTION public.return_shipping_direct_to_location(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_shipping_direct_reviewed(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_shipping_direct_to_location(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_shipping_direct_reviewed(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
