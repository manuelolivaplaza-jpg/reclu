import { ArrowRight, BellRing, Sparkles, TrendingUp } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { HeroChart } from "@/components/hero-chart";

/**
 * Hero section — the first impression.
 * Pattern: centered headline over a soft grid+glow background, with a
 * floating product mockup (alert email preview) built in pure CSS.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-ink-200/60">
      {/* Background: subtle grid + radial glow */}
      <div className="absolute inset-0 bg-glow" aria-hidden />
      <div
        className="absolute inset-0 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]"
        aria-hidden
      />

      <div className="container-page relative pt-20 pb-24 sm:pt-28 sm:pb-32">
        {/* Announcement pill */}
        <div className="animate-fade-up flex justify-center">
          <Link
            href="/#precios"
            className="group inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/80 py-1.5 pr-3 pl-1.5 text-sm shadow-subtle backdrop-blur transition-colors hover:border-brand-200"
          >
            <Badge variant="brand" className="rounded-full">
              Nuevo
            </Badge>
            <span className="font-medium text-ink-700">
              Carteras chilenas de Renta 4 ya disponibles
            </span>
            <ArrowRight className="size-3.5 text-ink-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Headline */}
        <h1
          className="animate-fade-up mx-auto mt-8 max-w-3xl text-center text-4xl font-semibold leading-[1.1] tracking-tight text-balance text-ink-900 sm:text-5xl lg:text-6xl"
          style={{ animationDelay: "0.05s" }}
        >
          Los portafolios que mueven el mercado,{" "}
          <span className="bg-gradient-to-r from-brand-600 to-brand-400 bg-clip-text text-transparent">
            directo a tu correo
          </span>
        </h1>

        <p
          className="animate-fade-up mx-auto mt-6 max-w-xl text-center text-lg leading-relaxed text-ink-600 sm:text-xl"
          style={{ animationDelay: "0.1s" }}
        >
          Sigue a políticos de EE.UU., corredoras chilenas y fondos. Recibe alertas
          con análisis AI cada vez que hay un cambio — sin ejecutar órdenes, sin
          ruido.
        </p>

        {/* CTAs */}
        <div
          className="animate-fade-up mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
          style={{ animationDelay: "0.15s" }}
        >
          <ButtonLink href="/signup" size="lg" className="w-full sm:w-auto">
            Comenzar gratis
            <ArrowRight className="size-4" />
          </ButtonLink>
          <ButtonLink
            href="/explore"
            variant="outline"
            size="lg"
            className="w-full sm:w-auto"
          >
            Explorar portafolios
          </ButtonLink>
        </div>

        <p
          className="animate-fade-up mt-4 text-center text-sm text-ink-500"
          style={{ animationDelay: "0.2s" }}
        >
          Gratis para siempre en 2 portafolios · Sin tarjeta de crédito
        </p>

        {/* Visual composition: alert card + animated performance chart */}
        <div
          className="animate-fade-up relative mx-auto mt-16 max-w-5xl"
          style={{ animationDelay: "0.3s" }}
        >
          <div
            className="absolute -inset-x-8 -top-4 -bottom-8 rounded-[2rem] bg-gradient-to-b from-brand-100/40 via-transparent to-transparent blur-2xl"
            aria-hidden
          />
          <div className="relative grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <HeroAlertCard />
            <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-ink-900">Rendimiento del portafolio</p>
                  <p className="text-xs text-ink-500">AI World War III · últimos 12 meses</p>
                </div>
                <span className="rounded-full bg-positive-bg px-2.5 py-1 text-xs font-semibold text-positive">
                  +42.8%
                </span>
              </div>
              <HeroChart className="mt-4 w-full" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Visual mockup of the product's core output: an alert email.
 * Purely decorative — data is illustrative.
 */
function HeroAlertCard() {
  return (
    <div className="relative rounded-2xl border border-ink-200 bg-white p-1.5 shadow-pop">
      {/* Window chrome */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="size-3 rounded-full bg-ink-300" />
          <span className="size-3 rounded-full bg-ink-300" />
          <span className="size-3 rounded-full bg-ink-300" />
        </div>
        <span className="ml-2 flex-1 truncate rounded-md bg-ink-100 px-3 py-1 text-center text-xs text-ink-500">
          Nueva alerta · reclu.cl
        </span>
      </div>

      {/* Email body */}
      <div className="rounded-xl border border-ink-100 bg-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="brand" className="gap-1.5">
            <BellRing className="size-3" />
            Pelosi Tracker
          </Badge>
          <Badge variant="positive" className="gap-1.5">
            <TrendingUp className="size-3" />
            Nueva compra
          </Badge>
        </div>

        <h3 className="mt-4 text-xl font-semibold tracking-tight text-ink-900">
          Nancy Pelosi compró $1M–$5M en NVDA
        </h3>
        <p className="mt-1 text-sm text-ink-500">Hace 2 horas · Capitol Trades</p>

        {/* AI summary block */}
        <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50/60 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-brand-800">
            <Sparkles className="size-4" />
            Resumen AI
          </div>
          <p className="mt-2 text-sm leading-relaxed text-brand-900/80">
            La congresista Pelosi realizó una compra significativa de NVIDIA vía
            opciones call, su tercera operación en el sector semiconductores este
            trimestre. Históricamente, operaciones de este tamaño en el portafolio
            Pelosi han precedido movimientos positivos en el sector tech.
          </p>
        </div>

        {/* Mini stats row */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          {[
            { label: "Retorno YTD", value: "+31.4%", positive: true },
            { label: "Operaciones", value: "127", positive: null },
            { label: "Seguidores", value: "12.4K", positive: null },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-center"
            >
              <div className="text-xs text-ink-500">{stat.label}</div>
              <div
                className={
                  "mt-0.5 text-sm font-semibold tabular-nums " +
                  (stat.positive === true
                    ? "text-positive"
                    : stat.positive === false
                      ? "text-negative"
                      : "text-ink-900")
                }
              >
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
