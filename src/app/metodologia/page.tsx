import { withSeo } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Chip } from "@/components/app";

export const metadata: Metadata = withSeo("/metodologia", {
  title: "Metodología",
  description:
    "Cómo calcula fraccion.si el rendimiento de los portafolios: precios de cierre, ventanas de retorno, Sharpe, máxima caída, comparación contra S&P 500 e IPSA, el ranking honesto, el muro de 90 días, los datos públicos de funcionarios y la anonimización de personas naturales.",
});

const SECTIONS = [
  { id: "datos", label: "Datos de partida" },
  { id: "retornos", label: "Retornos" },
  { id: "riesgo", label: "Riesgo" },
  { id: "benchmarks", label: "Benchmarks" },
  { id: "politicos", label: "Por qué los políticos son estimaciones" },
  { id: "limites", label: "Límites y sesgos" },
  { id: "ranking", label: "Ranking" },
  { id: "muro", label: "Muro de pago" },
  { id: "funcionarios", label: "Funcionarios públicos" },
  { id: "anonimizacion", label: "Anonimización" },
  { id: "trump-dice", label: "Trump dice" },
  { id: "musk-dice", label: "Elon Musk dice" },
];

const PILLARS = [
  { value: "Cierre", title: "Precios de cierre diarios" },
  { value: "S&P · IPSA", title: "Benchmark por país" },
  { value: "90 días", title: "Historial gratis" },
  { value: "0", title: "Números inventados" },
];

/**
 * Página de metodología — transparencia total del cálculo.
 * El "ranking honesto" solo vale si cualquiera puede reproducirlo.
 */
export default function MetodologiaPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="bg-app-canvas">
        <div className="mx-auto w-full max-w-[1360px] px-4 pb-20 pt-6 sm:px-6 md:px-10 md:pt-12">
          <section className="app-card p-5 sm:p-7">
            <div className="flex flex-wrap gap-2">
              <Chip tone="info">Transparencia</Chip>
              <Chip>Reproducible</Chip>
            </div>
            <h1 className="mt-3 text-app-display font-semibold tracking-tight text-ink-900">Metodología</h1>
            <p className="mt-2 max-w-2xl text-app-body text-ink-600">
              Todo número de rendimiento que publiquemos se calcula con las reglas de esta página, sobre fuentes públicas y precios de cierre.
              Si un dato no alcanza para calcular algo, mostramos “sin datos suficientes” — nunca inventamos un número.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {PILLARS.map((p) => (
                <div key={p.title} className="rounded-2xl bg-ink-100/60 p-3 sm:p-4">
                  <p className="text-[20px] font-semibold tracking-tight text-ink-900 tabular-nums">{p.value}</p>
                  <p className="mt-0.5 text-app-caption text-ink-500">{p.title}</p>
                </div>
              ))}
            </div>
          </section>

          <nav aria-label="Secciones" className="sticky top-14 z-10 -mx-4 mt-4 overflow-x-auto bg-app-canvas/90 px-4 py-2 backdrop-blur lg:hidden">
            <div className="flex w-max gap-2">
              {SECTIONS.map((s, i) => (
                <a key={s.id} href={`#${s.id}`} className="inline-flex h-8 items-center rounded-full border border-app-border bg-app-card px-3 text-[13px] font-medium text-ink-700">
                  {i + 1}. {s.label}
                </a>
              ))}
            </div>
          </nav>

          <div className="mt-4 grid gap-4 lg:grid-cols-[240px_1fr]">
            <aside className="hidden lg:block">
              <nav aria-label="Índice" className="app-card sticky top-20 p-3">
                <p className="px-2 pb-2 text-app-caption font-medium text-ink-500">En esta página</p>
                <ol className="flex flex-col">
                  {SECTIONS.map((s, i) => (
                    <li key={s.id}>
                      <a href={`#${s.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-ink-700 hover:bg-ink-100">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-ink-100 text-[11px] font-semibold tabular-nums">{i + 1}</span>
                        {s.label}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </aside>
            <div className="flex min-w-0 flex-col gap-4">
          <section id="datos" className="app-card scroll-mt-28 p-5 sm:p-7">
            <h2 className="flex items-center gap-3 text-app-title font-semibold tracking-tight text-ink-900">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-[13px] font-bold text-white tabular-nums">1</span>
              Datos de partida
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-ink-600">
              <p>
                Cada portafolio se reconstruye como una cesta ponderada: los pesos
                publicados de sus activos (declaraciones PTR de la Cámara de
                Representantes de EE.UU., filings 13F de la SEC, carteras
                recomendadas de corredoras chilenas) y los precios de cierre diarios
                de cada activo.
              </p>
              <p>
                El valor de la cesta del día <em>d</em> es la suma de{" "}
                <span className="num rounded-md bg-ink-100 px-1.5 py-0.5 text-[14px] text-ink-900">peso<sub>i</sub> × precio<sub>i,d</sub></span>{" "}
                sobre los activos con precio conocido. Los activos sin precio quedan
                fuera de la cesta de ese día y sus pesos se renormalizan; el
                porcentaje cubierto siempre se puede consultar en el detalle de cada
                portafolio.
              </p>
              <p>
                El índice base es el primer día con datos: la serie se publica
                normalizada a 100 (“base 100”) para que portafolio e índice sean
                comparables en un mismo gráfico.
              </p>
            </div>
          </section>

          <section id="retornos" className="app-card scroll-mt-28 p-5 sm:p-7">
            <h2 className="flex items-center gap-3 text-app-title font-semibold tracking-tight text-ink-900">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-[13px] font-bold text-white tabular-nums">2</span>
              Retornos
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-ink-600">
              <p>
                <strong className="font-medium text-ink-900">Retorno acumulado</strong>:{" "}
                <span className="num rounded-md bg-ink-100 px-1.5 py-0.5 text-[14px] text-ink-900">(valor final / valor inicial − 1) × 100</span>{" "}
                de la serie base 100, entre el primer y el último día disponible.
              </p>
              <p>
                <strong className="font-medium text-ink-900">Ventanas 1M / 3M / YTD / 1A</strong>:{" "}
                mismo cálculo, pero desde el punto más cercano al inicio de la ventana
                (un mes, tres meses, el 1 de enero del año en curso, un año) hasta el
                último dato. Si la serie no cubre al menos 14 días de la ventana de
                1M (45 de 3M, 150 de 1A), la ventana se marca como “sin datos
                suficientes”.
              </p>
              <p>
                <strong className="font-medium text-ink-900">CAGR</strong> (retorno
                anualizado):{" "}
                <span className="num rounded-md bg-ink-100 px-1.5 py-0.5 text-[14px] text-ink-900">
                  (valor final / valor inicial)<sup>1/años</sup> − 1
                </span>
                , con años = días calendario / 365,25. Solo se calcula con al menos
                180 días de historia; con menos, una anualización sería puro ruido.
              </p>
            </div>
          </section>

          <section id="riesgo" className="app-card scroll-mt-28 p-5 sm:p-7">
            <h2 className="flex items-center gap-3 text-app-title font-semibold tracking-tight text-ink-900">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-[13px] font-bold text-white tabular-nums">3</span>
              Riesgo: volatilidad, Sharpe y máxima caída
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-ink-600">
              <p>
                <strong className="font-medium text-ink-900">Volatilidad anualizada</strong>:{" "}
                desviación estándar muestral (n−1) de los retornos diarios de la
                cesta, multiplicada por{" "}
                <span className="num rounded-md bg-ink-100 px-1.5 py-0.5 text-[14px] text-ink-900">√252</span> (días de bolsa). Se exigen al menos
                10 retornos diarios.
              </p>
              <p>
                <strong className="font-medium text-ink-900">Sharpe</strong>:{" "}
                <span className="num rounded-md bg-ink-100 px-1.5 py-0.5 text-[14px] text-ink-900">(CAGR − tasa libre de riesgo) / volatilidad anualizada</span>.
                Usamos 4% anual como tasa libre de riesgo por defecto. El Sharpe exige
                al menos 30 retornos diarios y CAGR disponible; con menos historia
                queda en “—”.{" "}
                <span className="text-ink-500">
                  El CAGR y el Sharpe son estimaciones: la tasa libre de riesgo es
                  un parámetro y series cortas lo mueven mucho.
                </span>
              </p>
              <p>
                <strong className="font-medium text-ink-900">Máxima caída (max drawdown)</strong>:{" "}
                la mayor pérdida porcentual desde un máximo anterior de la serie,{" "}
                <span className="num rounded-md bg-ink-100 px-1.5 py-0.5 text-[14px] text-ink-900">máx(1 − valor / máximo histórico previo)</span>.
                Mide el peor momento posible de haber comprado y vendido.
              </p>
            </div>
          </section>

          <section id="benchmarks" className="app-card scroll-mt-28 p-5 sm:p-7">
            <h2 className="flex items-center gap-3 text-app-title font-semibold tracking-tight text-ink-900">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-[13px] font-bold text-white tabular-nums">4</span>
              Comparación contra el mercado
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-ink-600">
              <p>
                Cada portafolio se compara con su benchmark natural:{" "}
                <strong className="font-medium text-ink-900">S&P 500 (^GSPC)</strong>{" "}
                para carteras de EE.UU. y globales,{" "}
                <strong className="font-medium text-ink-900">IPSA (^IPSA)</strong>{" "}
                para carteras chilenas. Ambas series se alinean por fecha: solo
                cuentan los días con precio en ambas.
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <strong className="font-medium text-ink-900">Exceso de retorno</strong>:
                  retorno acumulado del portafolio − retorno acumulado del índice, en
                  puntos porcentuales.
                </li>
                <li>
                  <strong className="font-medium text-ink-900">Alfa simple</strong>:
                  CAGR del portafolio − CAGR del índice (exceso anualizado). Es un
                  alfa aritmético, no un alfa de modelo de factores.
                </li>
                <li>
                  <strong className="font-medium text-ink-900">% de días que le gana al índice</strong>:
                  sobre los días alineados, en qué porcentaje el retorno diario del
                  portafolio superó al del índice.
                </li>
              </ul>
              <p>
                El ranking{" "}
                <Link href="/explore" className="underline underline-offset-4">
                  “Le ganan al mercado”
                </Link>{" "}
                ordena los portafolios por exceso de retorno (o por Sharpe). Solo
                entran portafolios con métricas precalculadas; donde no hay datos
                hay espacio vacío, no un cero.
              </p>
            </div>
          </section>

          <section id="politicos" className="app-card scroll-mt-28 p-5 sm:p-7">
            <h2 className="flex items-center gap-3 text-app-title font-semibold tracking-tight text-ink-900">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-[13px] font-bold text-white tabular-nums">5</span>
              Por qué los políticos son estimaciones
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-ink-600">
              <p>
                Las declaraciones de transacciones financieras (PTR) de EE.UU. se
                publican con rangos (por ejemplo “US$15.001 – US$50.000”), describen
                operaciones puntuales —no una cartera completa— y llegan con retraso
                de días o semanas. Reconstruir una “cartera Pelosi” exige supuestos:
                fecha de valoración, tamaño dentro del rango, activos que nunca se
                declararon.
              </p>
              <p>
                Por eso todo número de un portafolio político lleva la etiqueta{" "}
                <strong className="font-medium text-ink-900">“estimado”</strong>. Es
                la reconstrucción honesta de lo declarado, no la cartera real del
                congresista ni una estrategia ejecutable. El retraso de cada
                declaración (días entre operación y publicación) se muestra junto a
                cada alerta.
              </p>
            </div>
          </section>

          <section id="limites" className="app-card scroll-mt-28 p-5 sm:p-7">
            <h2 className="flex items-center gap-3 text-app-title font-semibold tracking-tight text-ink-900">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-[13px] font-bold text-white tabular-nums">6</span>
              Límites y sesgos conocidos
            </h2>
            <ul className="mt-5 list-disc space-y-2.5 pl-6 text-[15px] leading-relaxed text-ink-600">
              <li>
                <strong className="font-medium text-ink-900">Rebalanceo</strong>: la
                cesta usa los pesos de la última composición publicada y se
                renormaliza ante cambios. No simulamos rebalanceos periódicos ni
                fechas de operación intradía; la fecha declarada puede ser distinta a
                la fecha de operación real.
              </li>
              <li>
                <strong className="font-medium text-ink-900">Retraso de declaración</strong>:
                las carteras políticas “conocen” una operación cuando se publica, no
                cuando ocurre. El rendimiento calculado desde la publicación es
                posterior al que tuvo el político real.
              </li>
              <li>
                <strong className="font-medium text-ink-900">Dividendos y costos</strong>:
                la serie usa precios de cierre, sin dividendos reinvertidos ni
                comisiones/impuestos. El rendimiento real de una estrategia
                ejecutable sería menor.
              </li>
              <li>
                <strong className="font-medium text-ink-900">Sesgo de supervivencia</strong>:
                solo se listan fuentes que siguen publicando; carteras abandonadas
                desaparecen del catálogo.
              </li>
              <li>
                <strong className="font-medium text-ink-900">Monedas</strong>: carteras
                chilenas y estadounidenses se miden cada una en su moneda; el
                benchmark de cada una está en la misma moneda, sin conversión
                cambiaria ni cobertura de FX.
              </li>
            </ul>
          </section>

          <section id="ranking" className="app-card scroll-mt-28 p-5 sm:p-7">
            <h2 className="flex items-center gap-3 text-app-title font-semibold tracking-tight text-ink-900">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-[13px] font-bold text-white tabular-nums">7</span>
              Ranking honesto
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-ink-600">
              <p>
                El <Link href="/ranking" className="underline underline-offset-4">
                  ranking
                </Link>{" "}
                ordena cada portafolio y estudio contra el benchmark de su país:
                S&P 500 (SPY) para Estados Unidos e IPSA (ECH en CLP) para
                Chile. La métrica principal es el exceso de retorno acumulado;
                también se puede ordenar por Sharpe.
              </p>
              <p>
                Entran todos los portafolios con métricas precalculadas,
                incluidos los que pierden contra el índice. Donde falta historia
                hay un espacio vacío, no un cero: un portafolio nuevo no se
                hunde ni se corona por no tener datos. Las series cortas se
                rotulan como muestra pequeña.
              </p>
              <p>
                El ranking es descriptivo. No selecciona ganadores, no proyecta
                retornos y no constituye una recomendación de inversión.
              </p>
            </div>
          </section>

          <section id="muro" className="app-card scroll-mt-28 p-5 sm:p-7">
            <h2 className="flex items-center gap-3 text-app-title font-semibold tracking-tight text-ink-900">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-[13px] font-bold text-white tabular-nums">8</span>
              Muro de pago: 90 días de historial gratis
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-ink-600">
              <p>
                La cuenta Gratis permite seguir dos portafolios y recibir
                alertas diarias. En los portafolios que no son premium, la serie
                de rendimiento se muestra recortada a los{" "}
                <strong className="font-medium text-ink-900">últimos 90 días</strong>{" "}
                contados desde el último dato disponible. No es una prueba que
                venza ni pide tarjeta: el historial anterior queda detrás del
                muro.
              </p>
              <p>
                Los planes Pro y Elite ven la serie completa. En portafolios
                premium, las métricas y la serie son solo para planes pagos. Las
                alertas tienen topes distintos (3 para anónimos, 10 para Gratis y
                el límite del plan para pagos), y el resumen AI de cada alerta se
                entrega solo a Pro y Elite.
              </p>
              <p>
                Los datos de declaraciones de funcionarios de EE.UU. son la
                excepción: nunca se recortan ni se cobran (ver la sección
                siguiente).
              </p>
            </div>
          </section>

          <section id="funcionarios" className="app-card scroll-mt-28 p-5 sm:p-7">
            <h2 className="flex items-center gap-3 text-app-title font-semibold tracking-tight text-ink-900">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-[13px] font-bold text-white tabular-nums">9</span>
              Datos públicos de funcionarios, fuera del muro
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-ink-600">
              <p>
                Las declaraciones financieras de funcionarios de EE.UU. —PTR de
                la Cámara, PTR del Senado y formularios OGE 278-T— son públicas
                por mandato legal. La{" "}
                <span className="num rounded-md bg-ink-100 px-1.5 py-0.5 text-[14px] text-ink-900">5 U.S.C. § 13107</span> exige que los
                informes de divulgación financiera estén disponibles para
                consulta pública. Por eso esas series se entregan completas,
                gratis y sin muro, también para visitantes anónimos.
              </p>
              <p>
                La API pública tampoco redistribuye esas fuentes: los datasets
                de funcionarios quedan excluidos de las claves y de cualquier
                plan. Son información para leer en el sitio, no un producto que
                Fraccion revenda.
              </p>
              <p>
                Los montos siguen siendo rangos y llegan con retraso de
                declaración (30 o 45 días según la cámara). La reconstrucción es
                una estimación, como se explica en la sección 5.
              </p>
            </div>
          </section>

          <section id="anonimizacion" className="app-card scroll-mt-28 p-5 sm:p-7">
            <h2 className="flex items-center gap-3 text-app-title font-semibold tracking-tight text-ink-900">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-[13px] font-bold text-white tabular-nums">10</span>
              Anonimización de personas naturales
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-ink-600">
              <p>
                En el registro de 12 mayores accionistas de la CMF, las personas
                naturales aparecen como{" "}
                <strong className="font-medium text-ink-900">
                  “Persona natural (#ranking)”
                </strong>
                . Se conservan el porcentaje, las acciones y el puesto en el
                ranking, pero no el nombre ni el RUT. Las personas jurídicas
                mantienen su razón social.
              </p>
              <p>
                La regla se aplica al cargar y al actualizar el dato: si una
                persona natural vuelve a entrar por el scraper, el trigger la
                anonimiza de nuevo. Es el mismo criterio de mínimo de datos de
                las Leyes 19.628 y 21.719 que usamos en el resto del sitio. No
                guardamos direcciones, familiares ni fichas personales.
              </p>
            </div>
          </section>

          <section id="trump-dice" className="app-card scroll-mt-28 p-5 sm:p-7">
            <h2 className="flex items-center gap-3 text-app-title font-semibold tracking-tight text-ink-900">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-[13px] font-bold text-white tabular-nums">11</span>
              Trump dice
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-ink-600">
              <p>
                <strong className="font-medium text-ink-900">Trump dice</strong> es un
                portafolio simulado. Cada vez que Donald Trump, en un dicho público
                propio (Truth Social, X, discurso o entrevista), llama a comprar una
                empresa cotizada o el mercado, o elogia de forma directa e individual
                a una empresa o a su acción, se anota una compra de US$1.000 al cierre.
              </p>
              <p>
                Si el dicho ocurrió después de las 16:00 ET, en fin de semana o en
                feriado, la compra usa el cierre del siguiente día hábil. Si la hora
                no está confirmada, se usa el cierre del mismo día. La excepción es
                Apple el 06-08-2025: el evento fue en la tarde y, por prudencia, la
                entrada es el 07-08. Se compra y se mantiene. Una empresa nombrada
                varias veces (Dell cinco veces, Intel cuatro) suma una compra nueva
                en cada mención.
              </p>
              <p>
                Cada mención publicada trae la cita y al menos una fuente con URL.
                Quedan fuera las empresas privadas, los actos de gobierno sin un dicho
                de Trump y los elogios colectivos dentro de una lista de empresas. El
                conjunto no es exhaustivo: son los llamados de compra y elogios
                directos verificados entre marzo de 2025 y octubre de 2026. El corte
                de la composición publicada es el cierre del 16-10-2026.
              </p>
              <p>
                U.S. Steel (X) dejó de cotizar. Desde el 18-06-2025 esa posición queda
                en efectivo a US$55 por acción, el precio pagado por Nippon Steel. En
                la cartera aparece como efectivo, no como la acción.
              </p>
              <p>
                La simulación no incluye costos, impuestos ni tipo de cambio. Son 15
                compras, muy concentradas en Dell e Intel: el resultado depende de
                dos acciones, y las menciones más citadas son las que más se movieron.
                Es información histórica. No es una recomendación de inversión.
              </p>
            </div>
          </section>

          <section id="musk-dice" className="app-card scroll-mt-28 p-5 sm:p-7">
            <h2 className="flex items-center gap-3 text-app-title font-semibold tracking-tight text-ink-900">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-[13px] font-bold text-white tabular-nums">12</span>
              Elon Musk dice
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-ink-600">
              <p>
                <strong className="font-medium text-ink-900">Elon Musk dice</strong> no
                es una cartera de señales. En el archivo de posts de @elonmusk solo hay
                tres menciones claras a acciones de terceros, todas de enero de 2021:
                Etsy, GameStop y CD Projekt. Cada una se guarda con el id del post, la
                fecha, una cita corta y el enlace a X.
              </p>
              <p>
                Si el post salió antes del cierre de Nueva York (16:00 ET) en un día
                hábil, la entrada de la simulación es el cierre de ese día. Si salió
                después del cierre, o en fin de semana, entra al cierre del día hábil
                siguiente. Etsy entra el 26-01-2021. GameStop, publicado después del
                cierre, entra el 27-01, cuando el salto ya había pasado. CD Projekt
                cotiza en Varsovia en zloty: queda solo como mención, fuera de la
                composición. Etsy y GameStop pesan 50% cada uno.
              </p>
              <p>
                Musk es insider de Tesla, SpaceX y xAI. Esas menciones se muestran
                como contexto y no son señal de compra ni de venta. El comentario de
                mayo de 2020 sobre el precio de Tesla entra en ese grupo. Comprar
                cuando elogió una acción ajena perdió en los tres casos.
              </p>
              <p>
                Quedan fuera, entre otras, “Use Signal” (subió Signal Advance por
                confusión), la canción Sandstorm, las bromas sobre Ryanair, y los
                textos que no nombran una empresa. Una candidata automática
                (un ticker con $ o la palabra buy junto al nombre de una empresa del
                catálogo) queda pendiente de revisión y no genera alerta. Es
                información histórica. No es una recomendación de inversión.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-app-border px-5 py-4">
            <h2 className="text-[15px] font-medium text-ink-900">Aviso legal</h2>
            <p className="mt-3 text-xs leading-relaxed text-ink-500">
              Toda la información de fraccion.si proviene de fuentes públicas y tiene
              fines exclusivamente informativos. No constituye asesoría de inversión
              ni una recomendación de compra o venta de instrumentos financieros.
              Fraccion no ejecuta órdenes ni gestiona carteras. Rentabilidades pasadas
              no garantizan resultados futuros.
            </p>
          </section>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
