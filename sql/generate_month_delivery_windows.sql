BEGIN;

-- =========================================================
-- GENERADOR DE VENTANAS DE ENTREGA PARA 30 DIAS
-- =========================================================
-- Que hace:
-- 1. Toma las sucursales activas
-- 2. Lee los horarios activos por dia de semana
-- 3. Genera slots de 2 horas para los proximos 30 dias
-- 4. Omite fechas bloqueadas
-- 5. No duplica ventanas existentes
--
-- Ajusta estos valores en el CTE "configuracion" si lo necesitas:
-- - fecha_inicio
-- - dias_a_generar
-- - duracion_slot_minutos
-- - capacidad_por_slot
-- - estado_ventana
-- =========================================================

WITH configuracion AS (
  SELECT
    CURRENT_DATE AS fecha_inicio,
    30::INTEGER AS dias_a_generar,
    120::INTEGER AS duracion_slot_minutos,
    5::INTEGER AS capacidad_por_slot,
    'disponible'::VARCHAR(20) AS estado_ventana
),
fechas AS (
  SELECT
    (c.fecha_inicio + offs.dia) AS fecha
  FROM configuracion c
  CROSS JOIN generate_series(0, (SELECT dias_a_generar - 1 FROM configuracion)) AS offs(dia)
),
horarios_validos AS (
  SELECT
    s.id AS sucursal_id,
    f.fecha,
    sh.hora_apertura,
    sh.hora_cierre
  FROM fechas f
  JOIN public.sucursales s
    ON s.activo = TRUE
  JOIN public.sucursales_horarios sh
    ON sh.sucursal_id = s.id
   AND sh.activo = TRUE
   AND sh.dia_semana = EXTRACT(DOW FROM f.fecha)::SMALLINT
  LEFT JOIN public.sucursales_fechas_bloqueadas fb
    ON fb.sucursal_id = s.id
   AND fb.fecha = f.fecha
   AND fb.activo = TRUE
  WHERE fb.id IS NULL
    AND sh.hora_cierre > sh.hora_apertura
),
slots AS (
  SELECT
    hv.sucursal_id,
    hv.fecha,
    make_time((serie.minuto_inicio / 60)::INTEGER, (serie.minuto_inicio % 60)::INTEGER, 0) AS hora_inicio,
    make_time(
      ((serie.minuto_inicio + cfg.duracion_slot_minutos) / 60)::INTEGER,
      ((serie.minuto_inicio + cfg.duracion_slot_minutos) % 60)::INTEGER,
      0
    ) AS hora_fin,
    cfg.capacidad_por_slot AS capacidad_maxima,
    cfg.estado_ventana AS estado
  FROM horarios_validos hv
  CROSS JOIN configuracion cfg
  CROSS JOIN LATERAL generate_series(
    (EXTRACT(HOUR FROM hv.hora_apertura)::INTEGER * 60)
      + EXTRACT(MINUTE FROM hv.hora_apertura)::INTEGER,
    (
      (EXTRACT(HOUR FROM hv.hora_cierre)::INTEGER * 60)
      + EXTRACT(MINUTE FROM hv.hora_cierre)::INTEGER
      - cfg.duracion_slot_minutos
    ),
    cfg.duracion_slot_minutos
  ) AS serie(minuto_inicio)
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
  s.sucursal_id,
  s.fecha,
  s.hora_inicio,
  s.hora_fin,
  s.capacidad_maxima,
  0,
  s.estado
FROM slots s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.ventanas_entrega ve
  WHERE ve.sucursal_id = s.sucursal_id
    AND ve.fecha = s.fecha
    AND ve.hora_inicio = s.hora_inicio
    AND ve.hora_fin = s.hora_fin
);

COMMIT;
