import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Metodología",
  description:
    "Cómo calcula reclu.cl el rendimiento de los portafolios: precios de cierre, ventanas de retorno, Sharpe, máxima caída y comparación contra S&P 500 e IPSA.",
};

/**
 * Página de metodología — transparencia total del cálculo.
 * El "ranking honesto" solo vale si cualquiera puede reproducirlo.
 */
export default function MetodologiaPage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <div className="container-page max-w-3xl py-16 md:py-20">
          <p className="label-line">Transparencia</p>
          <h1 className="type-section mt-3 text-ink-900">Metodología.</h1>
          <p className="type-body mt-5">
            Todo número de rendimiento que publiquemos se calcula con las reglas de
            esta página, sobre fuentes públicas y precios de cierre. Si un dato no
            alcanza para calcular algo, mostramos “sin datos suficientes” — nunca
            inventamos un número.
          </p>

          <nav className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
            <a href="#datos" className="underline underline-offset-4">Datos de partida</a>
            <a href="#retornos" className="underline underline-offset-4">Retornos</a>
            <a href="#riesgo" className="underline underline-offset-4">Riesgo</a>
            <a href="#benchmarks" className="underline underline-offset-4">Benchmarks</a>
            <a href="#politicos" className="underline underline-offset-4">Por qué los políticos son estimaciones</a>
            <a href="#limites" className="underline underline-offset-4">Límites y sesgos</a>
          </nav>

          <section id="datos" className="mt-14">
            <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900">
              1. Datos de partida
            </h2>
            <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-ink-600">
              <p>
                Cada portafolio se reconstruye como una cesta ponderada: los pesos
                publicados de sus activos (declaraciones PTR de la Cámara de
                Representantes de EE.UU., filings 13F de la SEC, carteras
                recomendadas de corredoras chilenas) y los precios de cierre diarios
                de cada activo.
              </p>
              <p>
                El valor de la cesta del día <em>d</em> es la suma de{" "}
                <span className="num">peso<sub>i</sub> × precio<sub>i,d</sub></span>{" "}
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

          <section id="retornos" className="mt-14">
            <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900">
              2. Retornos
            </h2>
            <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-ink-600">
              <p>
                <strong className="font-medium text-ink-900">Retorno acumulado</strong>:{" "}
                <span className="num">(valor final / valor inicial − 1) × 100</span>{" "}
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
                <span className="num">
                  (valor final / valor inicial)<sup>1/años</sup> − 1
                </span>
                , con años = días calendario / 365,25. Solo se calcula con al menos
                180 días de historia; con menos, una anualización sería puro ruido.
              </p>
            </div>
          </section>

          <section id="riesgo" className="mt-14">
            <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900">
              3. Riesgo: volatilidad, Sharpe y máxima caída
            </h2>
            <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-ink-600">
              <p>
                <strong className="font-medium text-ink-900">Volatilidad anualizada</strong>:{" "}
                desviación estándar muestral (n−1) de los retornos diarios de la
                cesta, multiplicada por{" "}
                <span className="num">√252</span> (días de bolsa). Se exigen al menos
                10 retornos diarios.
              </p>
              <p>
                <strong className="font-medium text-ink-900">Sharpe</strong>:{" "}
                <span className="num">(CAGR − tasa libre de riesgo) / volatilidad anualizada</span>.
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
                <span className="num">máx(1 − valor / máximo histórico previo)</span>.
                Mide el peor momento posible de haber comprado y vendido.
              </p>
            </div>
          </section>

          <section id="benchmarks" className="mt-14">
            <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900">
              4. Comparación contra el mercado
            </h2>
            <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-ink-600">
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

          <section id="politicos" className="mt-14">
            <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900">
              5. Por qué los políticos son estimaciones
            </h2>
            <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-ink-600">
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

          <section id="limites" className="mt-14">
            <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900">
              6. Límites y sesgos conocidos
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

          <section className="mt-16 border-t border-ink-200 pt-8">
            <h2 className="text-[15px] font-medium text-ink-900">Aviso legal</h2>
            <p className="mt-3 text-xs leading-relaxed text-ink-500">
              Toda la información de reclu.cl proviene de fuentes públicas y tiene
              fines exclusivamente informativos. No constituye asesoría de inversión
              ni una recomendación de compra o venta de instrumentos financieros.
              Reclu no ejecuta órdenes ni gestiona carteras. Rentabilidades pasadas
              no garantizan resultados futuros.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
