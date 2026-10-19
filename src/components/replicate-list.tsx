"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import type { Holding } from "@/lib/types";
import {
  BROKER_MINIMUMS,
  MINIMUM_NOTICE,
  buildShoppingList,
  shoppingListToCsv,
  type ReplicateCurrency,
} from "@/lib/replicate";
import { LegalNotice } from "@/components/legal/legal-notice";

interface ReplicateListProps {
  slug: string;
  portfolioName: string;
  /** Posiciones que el rol ya puede ver (recortadas en el servidor). */
  holdings: Holding[];
}

const DEFAULT_FX = 950;

function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function formatMoney(value: number, moneda: ReplicateCurrency): string {
  const prefix = moneda === "USD" ? "US$" : "$";
  return `${prefix}${formatNumber(value, moneda === "CLP" ? 0 : 2)}`;
}

/**
 * ReplicateList — "Copiar en mi corredora": lista informativa de compras.
 *
 * No ejecuta órdenes ni las enruta. Solo reparte un monto entre las
 * posiciones visibles y entrega el resultado como texto o CSV.
 */
export function ReplicateList({ slug, portfolioName, holdings }: ReplicateListProps) {
  const [monto, setMonto] = useState<number>(1_000_000);
  const [moneda, setMoneda] = useState<ReplicateCurrency>("CLP");
  const [fx, setFx] = useState<number>(DEFAULT_FX);
  const [fracciones, setFracciones] = useState<boolean>(true);
  const [copiado, setCopiado] = useState(false);

  const needsFx = holdings.some((h) => h.currency === "USD" || h.currency === "CLP");

  const list = useMemo(() => {
    try {
      return buildShoppingList(holdings, monto, moneda, fx, { fracciones });
    } catch {
      return null;
    }
  }, [holdings, monto, moneda, fx, fracciones]);

  async function handleCopy() {
    if (!list) return;
    const text = shoppingListToCsv(list);
    try {
      await navigator.clipboard.writeText(text);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  function handleDownload() {
    if (!list) return;
    const csv = shoppingListToCsv(list);
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reclu-${slug}-lista-compras.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <section aria-labelledby="replicate-heading" className="mt-12 border-t border-ink-200 pt-10">
      <h2 id="replicate-heading" className="text-[15px] font-medium text-ink-900">
        Copiar en mi corredora
      </h2>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-500">
        Lista informativa para replicar las {holdings.length} posiciones visibles
        de {portfolioName} con un monto. Reparte el monto según el peso de cada
        posición. No ejecuta órdenes ni las enruta.
      </p>

      {/* Controles */}
      <div className="mt-6 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-[13px] text-ink-500">
          Monto
          <input
            type="number"
            min={0}
            step={moneda === "CLP" ? 1000 : 1}
            value={Number.isFinite(monto) ? monto : ""}
            onChange={(event) => setMonto(Number(event.target.value))}
            className="h-11 w-40 border border-ink-200 bg-white px-3 num text-[15px] text-ink-900 outline-none focus:border-ink-400"
          />
        </label>

        <label className="flex flex-col gap-1 text-[13px] text-ink-500">
          Moneda
          <select
            value={moneda}
            onChange={(event) => setMoneda(event.target.value as ReplicateCurrency)}
            className="h-11 border border-ink-200 bg-white px-3 text-[15px] text-ink-900 outline-none focus:border-ink-400"
          >
            <option value="CLP">CLP</option>
            <option value="USD">USD</option>
          </select>
        </label>

        {needsFx && (
          <label className="flex flex-col gap-1 text-[13px] text-ink-500">
            Tipo de cambio (CLP por USD)
            <input
              type="number"
              min={0}
              step={1}
              value={Number.isFinite(fx) ? fx : ""}
              onChange={(event) => setFx(Number(event.target.value))}
              className="h-11 w-32 border border-ink-200 bg-white px-3 num text-[15px] text-ink-900 outline-none focus:border-ink-400"
            />
          </label>
        )}

        <label className="flex h-11 items-center gap-2 text-[13px] text-ink-500">
          <input
            type="checkbox"
            checked={fracciones}
            onChange={(event) => setFracciones(event.target.checked)}
            className="size-4 accent-ink-900"
          />
          Permitir fracciones
        </label>
      </div>

      {/* Tabla */}
      {list && list.items.length > 0 ? (
        <div className="mt-6 overflow-x-auto border border-ink-200">
          <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-ink-200 text-ink-500">
                <th className="px-3 py-2.5 font-normal">Activo</th>
                <th className="px-3 py-2.5 text-right font-normal">Peso</th>
                <th className="px-3 py-2.5 text-right font-normal">Precio</th>
                <th className="px-3 py-2.5 text-right font-normal">
                  {fracciones ? "Acciones / fracciones" : "Acciones"}
                </th>
                <th className="px-3 py-2.5 text-right font-normal">Monto</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((item) => (
                <tr key={item.symbol} className="border-b border-ink-100 last:border-0">
                  <td className="px-3 py-2.5">
                    <span className="num text-ink-900">{item.symbol}</span>
                    <span className="ml-2 text-ink-500">{item.name}</span>
                    {item.warning ? (
                      <span className="ml-2 text-[12px] text-ink-400">{item.warning}</span>
                    ) : null}
                  </td>
                  <td className="num px-3 py-2.5 text-right text-ink-500">
                    {formatNumber(item.targetWeight, 1)}%
                  </td>
                  <td className="num px-3 py-2.5 text-right text-ink-900">
                    {item.price !== null
                      ? formatMoney(item.price, item.priceCurrency === "EUR" ? "USD" : item.priceCurrency)
                      : "—"}
                  </td>
                  <td className="num px-3 py-2.5 text-right text-ink-900">
                    {item.shares !== null ? formatNumber(item.shares, fracciones ? 4 : 0) : "—"}
                  </td>
                  <td className="num px-3 py-2.5 text-right text-ink-900">
                    {item.invested !== null ? formatMoney(item.invested, list.moneda) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-6 text-[15px] text-ink-500">
          Ingresa un monto válido para ver la lista.
        </p>
      )}

      {list ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px] text-ink-500">
          <span>
            Asignado: <span className="num text-ink-900">{formatMoney(list.invertido, list.moneda)}</span>
          </span>
          <span>
            Sin asignar: <span className="num text-ink-900">{formatMoney(list.restante, list.moneda)}</span>
          </span>
          {list.sinPrecio > 0 ? (
            <span>{list.sinPrecio} posición(es) sin precio.</span>
          ) : null}
        </div>
      ) : null}

      {/* Acciones */}
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleCopy}
          disabled={!list || list.items.length === 0}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-ink-900 px-5 text-[14px] font-medium text-ink-900 transition-colors hover:bg-ink-900 hover:text-white disabled:opacity-40"
        >
          {copiado ? <Check className="size-4" strokeWidth={1.8} /> : <Copy className="size-4" strokeWidth={1.8} />}
          {copiado ? "Copiado" : "Copiar"}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={!list || list.items.length === 0}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-ink-900 px-5 text-[14px] font-medium text-white transition-colors hover:bg-black disabled:opacity-40"
        >
          <Download className="size-4" strokeWidth={1.8} />
          Descargar CSV
        </button>
      </div>

      <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-ink-500">
        {MINIMUM_NOTICE}
      </p>
      <ul className="mt-2 max-w-xl text-[13px] leading-relaxed text-ink-500">
        {BROKER_MINIMUMS.map((broker) => (
          <li key={broker.broker}>
            {broker.broker}: {broker.note}{" "}
            <a
              href={broker.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-900 underline underline-offset-4"
            >
              Fuente
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <LegalNotice kind="fintec" />
      </div>
    </section>
  );
}
