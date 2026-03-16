BEGIN;

-- =========================================================
-- Extensiones
-- =========================================================
CREATE EXTENSION IF NOT EXISTS postgis;

-- =========================================================
-- Tabla existente: sucursales
-- Agregamos datos operativos para calcular disponibilidad
-- =========================================================
ALTER TABLE public.sucursales
  ADD COLUMN IF NOT EXISTS hora_apertura TIME,
  ADD COLUMN IF NOT EXISTS hora_cierre TIME,
  ADD COLUMN IF NOT EXISTS tiempo_preparacion_min INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS buffer_logistico_min INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;

-- Valores por defecto razonables para registros existentes
UPDATE public.sucursales
SET
  hora_apertura = COALESCE(hora_apertura, TIME '09:00'),
  hora_cierre = COALESCE(hora_cierre, TIME '19:00'),
  tiempo_preparacion_min = COALESCE(tiempo_preparacion_min, 60),
  buffer_logistico_min = COALESCE(buffer_logistico_min, 30),
  activo = COALESCE(activo, TRUE);

-- =========================================================
-- Tabla existente: productos
-- Campos para promesa de entrega
-- =========================================================
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS tiempo_preparacion_min INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS permite_entrega_mismo_dia BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS activo_para_entrega BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.productos
SET
  tiempo_preparacion_min = COALESCE(tiempo_preparacion_min, 60),
  permite_entrega_mismo_dia = COALESCE(permite_entrega_mismo_dia, TRUE),
  activo_para_entrega = COALESCE(activo_para_entrega, TRUE);

-- =========================================================
-- Tabla existente: pedidos
-- Campos para programacion de entrega
-- =========================================================
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS sucursal_id INTEGER,
  ADD COLUMN IF NOT EXISTS fecha_entrega DATE,
  ADD COLUMN IF NOT EXISTS hora_entrega_inicio TIME,
  ADD COLUMN IF NOT EXISTS hora_entrega_fin TIME,
  ADD COLUMN IF NOT EXISTS fecha_confirmacion TIMESTAMP,
  ADD COLUMN IF NOT EXISTS notas_entrega TEXT,
  ADD COLUMN IF NOT EXISTS estatus_entrega VARCHAR(30) NOT NULL DEFAULT 'pendiente_programacion';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pedidos_sucursal_id_fkey'
  ) THEN
    ALTER TABLE public.pedidos
      ADD CONSTRAINT pedidos_sucursal_id_fkey
      FOREIGN KEY (sucursal_id)
      REFERENCES public.sucursales(id);
  END IF;
END $$;

-- =========================================================
-- Horarios por dia de semana
-- 0 = domingo ... 6 = sabado
-- =========================================================
CREATE TABLE IF NOT EXISTS public.sucursales_horarios (
  id SERIAL PRIMARY KEY,
  sucursal_id INTEGER NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
  dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_apertura TIME NOT NULL,
  hora_cierre TIME NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT sucursales_horarios_unique UNIQUE (sucursal_id, dia_semana)
);

-- =========================================================
-- Fechas bloqueadas por sucursal
-- =========================================================
CREATE TABLE IF NOT EXISTS public.sucursales_fechas_bloqueadas (
  id SERIAL PRIMARY KEY,
  sucursal_id INTEGER NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  motivo VARCHAR(255),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT sucursales_fechas_bloqueadas_unique UNIQUE (sucursal_id, fecha)
);

-- =========================================================
-- Ventanas de entrega
-- Capacidad por franja
-- =========================================================
CREATE TABLE IF NOT EXISTS public.ventanas_entrega (
  id SERIAL PRIMARY KEY,
  sucursal_id INTEGER NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  capacidad_maxima INTEGER NOT NULL CHECK (capacidad_maxima > 0),
  capacidad_reservada INTEGER NOT NULL DEFAULT 0 CHECK (capacidad_reservada >= 0),
  estado VARCHAR(20) NOT NULL DEFAULT 'disponible',
  CONSTRAINT ventanas_entrega_unique UNIQUE (sucursal_id, fecha, hora_inicio, hora_fin)
);

-- =========================================================
-- Historial de estados de pedidos
-- =========================================================
CREATE TABLE IF NOT EXISTS public.pedidos_historial_estado (
  id SERIAL PRIMARY KEY,
  pedido_id INTEGER NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  estado VARCHAR(30) NOT NULL,
  comentario TEXT,
  fecha TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =========================================================
-- Indices utiles
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_pedidos_fecha_entrega
  ON public.pedidos(fecha_entrega);

CREATE INDEX IF NOT EXISTS idx_pedidos_estatus_entrega
  ON public.pedidos(estatus_entrega);

CREATE INDEX IF NOT EXISTS idx_ventanas_entrega_fecha_sucursal
  ON public.ventanas_entrega(sucursal_id, fecha);

CREATE INDEX IF NOT EXISTS idx_historial_pedido_fecha
  ON public.pedidos_historial_estado(pedido_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_fechas_bloqueadas_sucursal_fecha
  ON public.sucursales_fechas_bloqueadas(sucursal_id, fecha);

-- =========================================================
-- Carga inicial de horarios
-- Solo inserta si no existen para la sucursal
-- =========================================================
INSERT INTO public.sucursales_horarios (
  sucursal_id,
  dia_semana,
  hora_apertura,
  hora_cierre,
  activo
)
SELECT
  s.id,
  d.dia_semana,
  TIME '09:00',
  TIME '19:00',
  TRUE
FROM public.sucursales s
CROSS JOIN (
  VALUES (0), (1), (2), (3), (4), (5), (6)
) AS d(dia_semana)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.sucursales_horarios sh
  WHERE sh.sucursal_id = s.id
    AND sh.dia_semana = d.dia_semana
);

-- =========================================================
-- Opcional: si quieres una ventana base para hoy y siguientes dias,
-- aqui tienes un ejemplo comentado para generar slots manualmente.
-- Ajustalo segun tu operacion antes de ejecutarlo.
-- =========================================================
-- INSERT INTO public.ventanas_entrega (
--   sucursal_id, fecha, hora_inicio, hora_fin, capacidad_maxima, estado
-- )
-- SELECT
--   s.id,
--   CURRENT_DATE,
--   TIME '10:00',
--   TIME '12:00',
--   10,
--   'disponible'
-- FROM public.sucursales s
-- WHERE s.activo = TRUE;

COMMIT;
