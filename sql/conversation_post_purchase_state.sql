BEGIN;

INSERT INTO public.cat_estados_conversacion (nombre)
SELECT 'pedido_confirmado'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.cat_estados_conversacion
  WHERE nombre = 'pedido_confirmado'
);

COMMIT;
