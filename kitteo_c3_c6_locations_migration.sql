-- Agrega las locaciones C3 del rack 3 y C6 del rack 6 de KITTEO.
-- Los location_code mantienen el prefijo del rack, igual que los códigos existentes.
INSERT INTO public.kitteo_locations (rack, location_code) VALUES
  ('3', '3-C3'),
  ('6', '6-C6')
ON CONFLICT (location_code) DO NOTHING;
