-- Agrega el rack principal H con ocho ubicaciones, siguiendo el formato existente.
-- Se puede ejecutar más de una vez sin duplicar códigos.
INSERT INTO public.locations (rack, location_code) VALUES
  ('H', 'H-01'),
  ('H', 'H-02'),
  ('H', 'H-03'),
  ('H', 'H-04'),
  ('H', 'H-05'),
  ('H', 'H-06'),
  ('H', 'H-07'),
  ('H', 'H-08')
ON CONFLICT (location_code) DO NOTHING;
