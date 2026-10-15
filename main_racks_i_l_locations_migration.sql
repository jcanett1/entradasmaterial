-- Agrega las locaciones principales solicitadas para los racks I, J, K y L.
-- Códigos: I-01..I-15, J-01..J-18, K-01..K-18 y L-01..L-09.
-- La operación es idempotente: no duplica códigos ya existentes.
INSERT INTO public.locations (rack, location_code)
SELECT rack_definitions.rack_code,
       rack_definitions.rack_code || '-' || lpad(slot_numbers.slot_number::text, 2, '0')
FROM (VALUES ('I', 15), ('J', 18), ('K', 18), ('L', 9))
  AS rack_definitions(rack_code, location_count)
CROSS JOIN LATERAL generate_series(1, rack_definitions.location_count)
  AS slot_numbers(slot_number)
ON CONFLICT (location_code) DO NOTHING;
