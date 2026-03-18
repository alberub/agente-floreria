BEGIN;

-- =========================================================
-- Tabla existente: productos
-- Campo opcional para acceso rapido a la imagen principal
-- =========================================================
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS imagen_principal_url TEXT;

-- =========================================================
-- Galeria de imagenes por producto
-- Permite multiples imagenes, orden, portada y estado
-- =========================================================
CREATE TABLE IF NOT EXISTS public.productos_imagenes (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  orden INTEGER NOT NULL DEFAULT 1,
  alt_text TEXT,
  es_principal BOOLEAN NOT NULL DEFAULT FALSE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_creacion TIMESTAMP NOT NULL DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =========================================================
-- Restricciones utiles
-- =========================================================
ALTER TABLE public.productos_imagenes
  ADD CONSTRAINT productos_imagenes_url_no_vacia
  CHECK (length(trim(url)) > 0);

ALTER TABLE public.productos_imagenes
  ADD CONSTRAINT productos_imagenes_orden_positivo
  CHECK (orden > 0);

-- =========================================================
-- Indices para consultas comunes
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_productos_imagenes_producto
  ON public.productos_imagenes(producto_id);

CREATE INDEX IF NOT EXISTS idx_productos_imagenes_producto_activo
  ON public.productos_imagenes(producto_id, activo);

CREATE INDEX IF NOT EXISTS idx_productos_imagenes_producto_orden
  ON public.productos_imagenes(producto_id, orden);

CREATE UNIQUE INDEX IF NOT EXISTS ux_productos_imagenes_principal_activa
  ON public.productos_imagenes(producto_id)
  WHERE es_principal = TRUE AND activo = TRUE;

-- =========================================================
-- Trigger para mantener fecha_actualizacion al dia
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_fecha_actualizacion_productos_imagenes()
RETURNS TRIGGER AS $$
BEGIN
  NEW.fecha_actualizacion = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_productos_imagenes_fecha_actualizacion
  ON public.productos_imagenes;

CREATE TRIGGER trg_productos_imagenes_fecha_actualizacion
BEFORE UPDATE ON public.productos_imagenes
FOR EACH ROW
EXECUTE FUNCTION public.set_fecha_actualizacion_productos_imagenes();

-- =========================================================
-- Sincronizacion automatica de imagen principal en productos
-- Si existe una imagen activa marcada como principal, copiamos su URL
-- =========================================================
CREATE OR REPLACE FUNCTION public.sync_imagen_principal_producto()
RETURNS TRIGGER AS $$
DECLARE
  v_producto_id INTEGER;
BEGIN
  v_producto_id := COALESCE(NEW.producto_id, OLD.producto_id);

  UPDATE public.productos p
  SET imagen_principal_url = (
    SELECT pi.url
    FROM public.productos_imagenes pi
    WHERE pi.producto_id = v_producto_id
      AND pi.es_principal = TRUE
      AND pi.activo = TRUE
    ORDER BY pi.orden ASC, pi.id ASC
    LIMIT 1
  )
  WHERE p.id = v_producto_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_productos_imagenes_sync_insert
  ON public.productos_imagenes;
DROP TRIGGER IF EXISTS trg_productos_imagenes_sync_update
  ON public.productos_imagenes;
DROP TRIGGER IF EXISTS trg_productos_imagenes_sync_delete
  ON public.productos_imagenes;

CREATE TRIGGER trg_productos_imagenes_sync_insert
AFTER INSERT ON public.productos_imagenes
FOR EACH ROW
EXECUTE FUNCTION public.sync_imagen_principal_producto();

CREATE TRIGGER trg_productos_imagenes_sync_update
AFTER UPDATE ON public.productos_imagenes
FOR EACH ROW
EXECUTE FUNCTION public.sync_imagen_principal_producto();

CREATE TRIGGER trg_productos_imagenes_sync_delete
AFTER DELETE ON public.productos_imagenes
FOR EACH ROW
EXECUTE FUNCTION public.sync_imagen_principal_producto();

COMMIT;
