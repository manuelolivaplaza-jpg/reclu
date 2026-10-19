# NOTAS-F48 — /aprende

## Qué se hizo

Diez fichas cortas en español, en `src/content/aprende.ts` (`slug`, `titulo`, `resumen`, `cuerpo`, `fuentes`). Cada ficha tiene al menos una fuente. Las rutas son `/aprende` y `/aprende/[slug]`, con `generateStaticParams` para los diez slugs. Un slug desconocido llama a `notFound()`. No se exporta `dynamicParams`: con `cacheComponents` ese flag rompe el build.

Temas: 13F, Form 4, PTR y STOCK Act, OGE 278-T, hecho esencial, AFP y multifondos, InfoProbidad, sesgos (atraso y supervivencia), Ley Fintec (“por qué no te decimos qué comprar”) y DJ 1929.

El texto solo repite lo que dicen las fuentes listadas en `scrapers/data/v2/F48/fuentes.md` y las páginas oficiales que esas URLs citan (más el README y los textos de F42 para la DJ 1929). La ficha de la Ley Fintec dice que reclu no recomienda, no ejecuta órdenes y no las enruta. La ficha PTR dice que los informes del 5 U.S.C. § 13107 se muestran sin muro de pago. InfoProbidad y el aviso citan el mínimo de datos personales y la finalidad explícita (leyes 19.628 y 21.719).

## Variables nuevas

Ninguna.

## Deudas

- TODO(F16): no existen `src/components/legal/legal-notice.tsx` ni `src/lib/public-disclosure.ts`. El aviso está en `AVISO_APRENDE` (`src/content/aprende.ts`) y se pinta al pie de las dos páginas. Cuando F16 exista, hay que sustituir ese bloque por el componente y enganchar el muro en el módulo de disclosures.
- `/aprende` no está en el header, el footer ni `src/app/sitemap.ts`. El sitemap lo une F57; no se tocó.
- Migraciones presentes: `008_planes_alertas.sql`, `009_pagos_suscripciones.sql`, `014_trump_dice.sql`, `015_holders_por_simbolo.sql`, `016_insiders.sql`. Faltan `017`–`021`. Se siguió igual, como pidió el orquestador de la Fase 0.
- La página de Nasdaq del ETF SJIM no respondió al fetch directo. Las fechas de cierre (25 de enero, 13 de febrero y 23 de febrero de 2024) salen del texto de ese mismo comunicado, recuperado por búsqueda. No se usaron cifras de rendimiento de notas de prensa de terceros.
- El índice de dividendos de la CMF se cita como página pública de esa estadística. No se reprodujo una tabla.
- `npx next build` compiló y pasó el chequeo de TypeScript del proyecto, y después falló al prerenderizar `/accion/sqm-b`: `Date.now()` en `src/lib/utils.ts` (`timeAgo`), llamado desde `src/app/accion/[symbol]/page.tsx`. Esa ruta no es de F48 y no se modificó. El build no llegó a declarar éxito.

## Cómo probar

```bash
npm test
```

La suite quedó en 216 tests, 20 archivos, incluido `tests/aprende.test.ts` (diez slugs, ninguna ficha sin fuentes).

`npm run lint` pasó. `npm run typecheck` pasa después de que el build genera `.next/types` (`LayoutProps`). Un `tsc` aislado, sin esa carpeta, marca el error de `LayoutProps` que ya describe `AGENTS.md`.

No se levantó servidor: el orquestador lo prohíbe. Falta mirar `/aprende` y una ficha (por ejemplo `/aprende/ley-fintec`) en el navegador. No hay env vars nuevas.
