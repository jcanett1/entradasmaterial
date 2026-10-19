-- Tabla propia para conservar la Revisión final como snapshot por comparación.
-- Se relaciona con inventory_comparison_runs.id (UUID) y se elimina en cascada
-- únicamente si se elimina su comparación padre.
CREATE TABLE IF NOT EXISTS public.inventory_final_review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_run_id uuid NOT NULL
    REFERENCES public.inventory_comparison_runs(id) ON DELETE CASCADE,
  inventory_id text NOT NULL,
  normalized_inventory_id text NOT NULL,
  description text NULL,
  on_hand numeric NOT NULL CHECK (on_hand >= 0),
  warehouse_counted numeric NULL CHECK (warehouse_counted IS NULL OR warehouse_counted >= 0),
  kitteo_counted numeric NULL CHECK (kitteo_counted IS NULL OR kitteo_counted >= 0),
  total_counted numeric NULL CHECK (total_counted IS NULL OR total_counted >= 0),
  difference numeric NULL,
  physical_count_status text NOT NULL
    CHECK (physical_count_status IN ('complete', 'partial', 'pending', 'not_audited')),
  physical_audit_item_count integer NOT NULL DEFAULT 0 CHECK (physical_audit_item_count >= 0),
  physical_audit_counted_items integer NOT NULL DEFAULT 0 CHECK (physical_audit_counted_items >= 0),
  review_status text NOT NULL
    CHECK (review_status IN ('match', 'difference', 'partial', 'pending', 'not_audited')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_final_review_items_run_part_unique
    UNIQUE (comparison_run_id, normalized_inventory_id),
  CONSTRAINT inventory_final_review_counted_items_check
    CHECK (physical_audit_counted_items <= physical_audit_item_count),
  CONSTRAINT inventory_final_review_difference_complete_check
    CHECK (difference IS NULL OR physical_count_status = 'complete'),
  CONSTRAINT inventory_final_review_status_consistency_check
    CHECK (
      (review_status NOT IN ('match', 'difference') OR
        (physical_count_status = 'complete' AND difference IS NOT NULL))
      AND (review_status <> 'match' OR difference = 0)
      AND (review_status <> 'difference' OR difference <> 0)
    )
);

COMMENT ON TABLE public.inventory_final_review_items IS
  'Snapshot de revisión final de On Hand, con conteos físicos separados por origen almacén/KITTEO.';
COMMENT ON COLUMN public.inventory_final_review_items.warehouse_counted IS
  'Cantidad capturada en auditoría en locaciones cuyo origen es normal (almacén).';
COMMENT ON COLUMN public.inventory_final_review_items.kitteo_counted IS
  'Cantidad capturada en auditoría en locaciones cuyo origen es kitto (KITTEO).';
COMMENT ON COLUMN public.inventory_final_review_items.total_counted IS
  'Suma del conteo capturado de almacén más KITTEO; NULL cuando no hay cantidades capturadas.';
COMMENT ON COLUMN public.inventory_final_review_items.difference IS
  'Total contado menos On Hand; se conserva NULL mientras el conteo por Inventory ID no esté completo.';

ALTER TABLE public.inventory_final_review_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inventory_final_review_items FROM anon;
GRANT SELECT, INSERT ON TABLE public.inventory_final_review_items TO authenticated;

CREATE POLICY inventory_final_review_items_manager_select
  ON public.inventory_final_review_items
  FOR SELECT TO authenticated
  USING (public.can_manage_inventory_comparisons());

CREATE POLICY inventory_final_review_items_manager_insert
  ON public.inventory_final_review_items
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_inventory_comparisons());
