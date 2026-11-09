-- pg_trgm accelerates substring search; unaccent keeps searches accent-insensitive.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.inventory_history_search_key(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT lower(extensions.unaccent(normalize(COALESCE(p_value, ''), NFKD)));
$function$;

CREATE INDEX IF NOT EXISTS idx_entries_registered_at_id_desc
  ON public.entries (registered_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_entries_search_part_number_trgm
  ON public.entries USING gin (public.inventory_history_search_key(part_number) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_entries_search_description_trgm
  ON public.entries USING gin (public.inventory_history_search_key(description) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_entries_search_unit_trgm
  ON public.entries USING gin (public.inventory_history_search_key(unit_of_measure) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_entries_search_registered_by_trgm
  ON public.entries USING gin (public.inventory_history_search_key(registered_by) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_entries_search_po_trgm
  ON public.entries USING gin (public.inventory_history_search_key(po) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_location_items_entry_id_history
  ON public.location_items (entry_id) WHERE entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_locations_entry_id_history
  ON public.locations (entry_id) WHERE entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transferes_entry_id_history
  ON public.transferes (entry_id) WHERE entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fifo_labels_entry_id_history
  ON public.fifo_labels (entry_id) WHERE entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipping_direct_entry_id_history
  ON public.shipping_direct (entry_id) WHERE entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kitteo_locations_occupied_entry_history
  ON public.kitteo_locations (entry_id) WHERE status = 'ocupado' AND entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kitteo_exits_legacy_match_history
  ON public.kitteo_exits (
    public.inventory_return_normalize_part(part_number),
    public.inventory_return_normalize_po(po), qty, boxes, exited_at
  ) WHERE entry_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipping_direct_legacy_match_history
  ON public.shipping_direct (
    public.inventory_return_normalize_part(part_number),
    public.inventory_return_normalize_po(po), qty, boxes, exited_at
  ) WHERE entry_id IS NULL;

GRANT USAGE ON SCHEMA extensions TO authenticated;
REVOKE ALL ON FUNCTION public.inventory_history_search_key(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_history_search_key(text) TO authenticated;
