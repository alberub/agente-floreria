BEGIN;

-- =========================================================
-- Ejemplo de imagenes para los primeros 3 productos activos
-- Sustituye las URLs por las tuyas antes de usar en produccion
-- =========================================================
WITH productos_objetivo AS (
  SELECT id, nombre
  FROM public.productos
  WHERE activo = TRUE
  ORDER BY id ASC
  LIMIT 3
),
datos_seed AS (
  SELECT
    id AS producto_id,
    nombre,
    CASE row_number() OVER (ORDER BY id)
      WHEN 1 THEN 'https://images.unsplash.com/photo-1519378058457-4c29a0a2efac?auto=format&fit=crop&w=1200&q=80'
      WHEN 2 THEN 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?auto=format&fit=crop&w=1200&q=80'
      WHEN 3 THEN 'https://images.unsplash.com/photo-1468327768560-75b778cbb551?auto=format&fit=crop&w=1200&q=80'
    END AS url_principal,
    CASE row_number() OVER (ORDER BY id)
      WHEN 1 THEN 'Arreglo floral romantico con rosas y lilys'
      WHEN 2 THEN 'Ramo clasico de rosas rojas'
      WHEN 3 THEN 'Ramo premium en tonos rosa'
    END AS alt_principal,
    CASE row_number() OVER (ORDER BY id)
      WHEN 1 THEN 'https://images.unsplash.com/photo-1526047932273-341f2a7631f9?auto=format&fit=crop&w=1200&q=80'
      WHEN 2 THEN 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1200&q=80'
      WHEN 3 THEN 'https://images.unsplash.com/photo-1487070183336-b863922373d4?auto=format&fit=crop&w=1200&q=80'
    END AS url_secundaria,
    CASE row_number() OVER (ORDER BY id)
      WHEN 1 THEN 'Vista alternativa del arreglo floral'
      WHEN 2 THEN 'Vista lateral del ramo de rosas'
      WHEN 3 THEN 'Detalle del ramo premium'
    END AS alt_secundaria
  FROM productos_objetivo
)
INSERT INTO public.productos_imagenes (
  producto_id,
  url,
  orden,
  alt_text,
  es_principal,
  activo
)
SELECT
  producto_id,
  url_principal,
  1,
  alt_principal,
  TRUE,
  TRUE
FROM datos_seed
WHERE url_principal IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.productos_imagenes pi
    WHERE pi.producto_id = datos_seed.producto_id
      AND pi.url = datos_seed.url_principal
  );

WITH productos_objetivo AS (
  SELECT id, nombre
  FROM public.productos
  WHERE activo = TRUE
  ORDER BY id ASC
  LIMIT 3
),
datos_seed AS (
  SELECT
    id AS producto_id,
    nombre,
    CASE row_number() OVER (ORDER BY id)
      WHEN 1 THEN 'https://images.unsplash.com/photo-1526047932273-341f2a7631f9?auto=format&fit=crop&w=1200&q=80'
      WHEN 2 THEN 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1200&q=80'
      WHEN 3 THEN 'https://images.unsplash.com/photo-1487070183336-b863922373d4?auto=format&fit=crop&w=1200&q=80'
    END AS url_secundaria,
    CASE row_number() OVER (ORDER BY id)
      WHEN 1 THEN 'Vista alternativa del arreglo floral'
      WHEN 2 THEN 'Vista lateral del ramo de rosas'
      WHEN 3 THEN 'Detalle del ramo premium'
    END AS alt_secundaria
  FROM productos_objetivo
)
INSERT INTO public.productos_imagenes (
  producto_id,
  url,
  orden,
  alt_text,
  es_principal,
  activo
)
SELECT
  producto_id,
  url_secundaria,
  2,
  alt_secundaria,
  FALSE,
  TRUE
FROM datos_seed
WHERE url_secundaria IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.productos_imagenes pi
    WHERE pi.producto_id = datos_seed.producto_id
      AND pi.url = datos_seed.url_secundaria
  );

COMMIT;
