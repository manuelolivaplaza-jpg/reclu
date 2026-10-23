-- 058: nombre visible de inverse-cramer-real (idempotente).
-- Aclara que el portafolio incluye posiciones cortas: va corto en las compras
-- que recomienda Jim Cramer en el Lightning Round y largo en sus ventas.
update public.portfolios
set
  name = 'Inverse Cramer – Lightning Round (largo/corto)',
  description = 'Hace lo contrario de las recomendaciones del Lightning Round de Jim Cramer (CNBC): corto en lo que recomienda comprar y largo en lo que recomienda vender. Cada señal dura 30 días hábiles. Incluye posiciones cortas. No es recomendación de inversión.'
where slug = 'inverse-cramer-real'
  and name is distinct from 'Inverse Cramer – Lightning Round (largo/corto)';
