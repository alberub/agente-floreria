BEGIN;

-- =========================================================
-- DATOS DE EJEMPLO PARA PROBAR PROGRAMACION DE ENTREGAS
-- Ajusta nombres/ids si en tu base real cambian.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Ajuste base de la sucursal principal
-- ---------------------------------------------------------
UPDATE public.sucursales
SET
  hora_apertura = TIME '09:00',
  hora_cierre = TIME '19:00',
  tiempo_preparacion_min = 60,
  buffer_logistico_min = 30,
  activo = TRUE
WHERE nombre = 'Sucursal Principal';

-- ---------------------------------------------------------
-- 2. Horarios semanales de ejemplo
-- Lunes a sabado abiertos, domingo cerrado
-- 0 = domingo ... 6 = sabado
-- ---------------------------------------------------------
UPDATE public.sucursales_horarios sh
SET
  hora_apertura = CASE
    WHEN sh.dia_semana BETWEEN 1 AND 6 THEN TIME '09:00'
    ELSE TIME '00:00'
  END,
  hora_cierre = CASE
    WHEN sh.dia_semana BETWEEN 1 AND 6 THEN TIME '19:00'
    ELSE TIME '00:00'
  END,
  activo = CASE
    WHEN sh.dia_semana BETWEEN 1 AND 6 THEN TRUE
    ELSE FALSE
  END
FROM public.sucursales s
WHERE sh.sucursal_id = s.id
  AND s.nombre = 'Sucursal Principal';

-- ---------------------------------------------------------
-- 3. Productos: tiempos de preparacion de ejemplo
-- ---------------------------------------------------------
UPDATE public.productos
SET
  tiempo_preparacion_min = CASE
    WHEN lower(nombre) LIKE '%ramo%' THEN 90
    WHEN lower(nombre) LIKE '%rosa%' THEN 60
    ELSE 75
  END,
  permite_entrega_mismo_dia = TRUE,
  activo_para_entrega = TRUE
WHERE activo = TRUE;

-- ---------------------------------------------------------
-- 4. Limpieza opcional de ventanas/pedidos de prueba previos
-- Descomenta si quieres reiniciar siempre este escenario
-- ---------------------------------------------------------
-- DELETE FROM public.pedidos_historial_estado
-- WHERE comentario LIKE 'seed_entregas_%';
--
-- DELETE FROM public.pedidos
-- WHERE notas_entrega LIKE 'seed_entregas_%';
--
-- DELETE FROM public.ventanas_entrega
-- WHERE estado = 'seed';

-- ---------------------------------------------------------
-- 5. Ventanas de entrega de ejemplo
-- Hoy y manana para la sucursal principal
-- Capacidad limitada para probar mismo dia / siguiente dia
-- ---------------------------------------------------------
WITH sucursal AS (
  SELECT id
  FROM public.sucursales
  WHERE nombre = 'Sucursal Principal'
  LIMIT 1
)
INSERT INTO public.ventanas_entrega (
  sucursal_id,
  fecha,
  hora_inicio,
  hora_fin,
  capacidad_maxima,
  capacidad_reservada,
  estado
)
SELECT
  s.id,
  slot.fecha,
  slot.hora_inicio,
  slot.hora_fin,
  slot.capacidad_maxima,
  slot.capacidad_reservada,
  'seed'
FROM sucursal s
CROSS JOIN (
  VALUES
    (CURRENT_DATE, TIME '10:00', TIME '12:00', 2, 2),
    (CURRENT_DATE, TIME '12:00', TIME '14:00', 2, 2),
    (CURRENT_DATE, TIME '16:00', TIME '18:00', 5, 1),
    (CURRENT_DATE + 1, TIME '10:00', TIME '12:00', 5, 0),
    (CURRENT_DATE + 1, TIME '12:00', TIME '14:00', 5, 0),
    (CURRENT_DATE + 1, TIME '16:00', TIME '18:00', 5, 0)
) AS slot(fecha, hora_inicio, hora_fin, capacidad_maxima, capacidad_reservada)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.ventanas_entrega ve
  WHERE ve.sucursal_id = s.id
    AND ve.fecha = slot.fecha
    AND ve.hora_inicio = slot.hora_inicio
    AND ve.hora_fin = slot.hora_fin
);

-- ---------------------------------------------------------
-- 6. Fecha bloqueada de ejemplo
-- Descomenta si quieres probar que una fecha completa no reciba entregas
-- ---------------------------------------------------------
-- INSERT INTO public.sucursales_fechas_bloqueadas (
--   sucursal_id,
--   fecha,
--   motivo,
--   activo
-- )
-- SELECT
--   s.id,
--   CURRENT_DATE + 2,
--   'seed_entregas_dia_bloqueado',
--   TRUE
-- FROM public.sucursales s
-- WHERE s.nombre = 'Sucursal Principal'
--   AND NOT EXISTS (
--     SELECT 1
--     FROM public.sucursales_fechas_bloqueadas fb
--     WHERE fb.sucursal_id = s.id
--       AND fb.fecha = CURRENT_DATE + 2
--   );

-- ---------------------------------------------------------
-- 7. Pedidos de ejemplo para consumir cupo
-- Nota: toman el primer cliente y producto activo disponibles
-- ---------------------------------------------------------
WITH sucursal AS (
  SELECT id
  FROM public.sucursales
  WHERE nombre = 'Sucursal Principal'
  LIMIT 1
),
cliente AS (
  SELECT id
  FROM public.clientes_floreria
  ORDER BY id ASC
  LIMIT 1
),
producto AS (
  SELECT id, precio
  FROM public.productos
  WHERE activo = TRUE
  ORDER BY id ASC
  LIMIT 1
)
INSERT INTO public.pedidos (
  cliente_id,
  producto_id,
  conversacion_id,
  direccion_entrega,
  total,
  estado,
  fecha_creacion,
  sucursal_id,
  fecha_entrega,
  hora_entrega_inicio,
  hora_entrega_fin,
  fecha_confirmacion,
  notas_entrega,
  estatus_entrega
)
SELECT
  c.id,
  p.id,
  NULL,
  'Seed Entregas 1, Apodaca, Nuevo Leon, Mexico',
  p.precio,
  'pendiente',
  NOW(),
  s.id,
  CURRENT_DATE,
  TIME '16:00',
  TIME '18:00',
  NOW(),
  'seed_entregas_mismo_dia',
  'programado'
FROM sucursal s
CROSS JOIN cliente c
CROSS JOIN producto p
WHERE NOT EXISTS (
  SELECT 1
  FROM public.pedidos pe
  WHERE pe.notas_entrega = 'seed_entregas_mismo_dia'
);

WITH sucursal AS (
  SELECT id
  FROM public.sucursales
  WHERE nombre = 'Sucursal Principal'
  LIMIT 1
),
cliente AS (
  SELECT id
  FROM public.clientes_floreria
  ORDER BY id ASC
  LIMIT 1
),
producto AS (
  SELECT id, precio
  FROM public.productos
  WHERE activo = TRUE
  ORDER BY id ASC
  LIMIT 1
)
INSERT INTO public.pedidos (
  cliente_id,
  producto_id,
  conversacion_id,
  direccion_entrega,
  total,
  estado,
  fecha_creacion,
  sucursal_id,
  fecha_entrega,
  hora_entrega_inicio,
  hora_entrega_fin,
  fecha_confirmacion,
  notas_entrega,
  estatus_entrega
)
SELECT
  c.id,
  p.id,
  NULL,
  'Seed Entregas 2, Guadalupe, Nuevo Leon, Mexico',
  p.precio,
  'pendiente',
  NOW(),
  s.id,
  CURRENT_DATE + 1,
  TIME '10:00',
  TIME '12:00',
  NOW(),
  'seed_entregas_siguiente_dia',
  'programado'
FROM sucursal s
CROSS JOIN cliente c
CROSS JOIN producto p
WHERE NOT EXISTS (
  SELECT 1
  FROM public.pedidos pe
  WHERE pe.notas_entrega = 'seed_entregas_siguiente_dia'
);

-- ---------------------------------------------------------
-- 8. Historial de ejemplo para los pedidos seed
-- ---------------------------------------------------------
INSERT INTO public.pedidos_historial_estado (
  pedido_id,
  estado,
  comentario,
  fecha
)
SELECT
  p.id,
  p.estatus_entrega,
  p.notas_entrega,
  NOW()
FROM public.pedidos p
WHERE p.notas_entrega IN (
  'seed_entregas_mismo_dia',
  'seed_entregas_siguiente_dia'
)
AND NOT EXISTS (
  SELECT 1
  FROM public.pedidos_historial_estado phe
  WHERE phe.pedido_id = p.id
    AND phe.comentario = p.notas_entrega
);

COMMIT;
