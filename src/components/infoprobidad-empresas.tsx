import { DemoBadge } from "@/components/demo-badge";
import {
  AVISO_FINALIDAD,
  AVISO_SIMULACION,
  INFOPROBIDAD_FUENTE,
  INFOPROBIDAD_LICENCIA_URL,
  INFOPROBIDAD_URL,
  formatFechaDeclaracion,
  formatValorClp,
  type EmpresaPublica,
} from "@/lib/infoprobidad";

/**
 * Tabla agregada por empresa. No muestra personas, cargos ni patrimonio familiar.
 */
export function InfoprobidadEmpresas({
  rows,
  isDemo,
}: {
  rows: EmpresaPublica[];
  isDemo: boolean;
}) {
  return (
    <section className="mb-12" aria-labelledby="infoprobidad-empresas-titulo">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="infoprobidad-empresas-titulo" className="text-[15px] font-medium text-ink-900">
          Empresas con más autoridades accionistas
        </h2>
        {isDemo ? <DemoBadge /> : null}
      </div>
      <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-ink-500">
        {AVISO_FINALIDAD} Las declaraciones son anuales o de actualización: esta
        tabla no es una cartera para copiar.
      </p>
      <p className="mt-2 text-[13px] text-ink-500">{AVISO_SIMULACION}</p>

      {rows.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-[15px]">
            <thead>
              <tr className="border-b border-ink-200 text-left text-[13px] text-ink-500">
                <th className="py-3 font-normal">Empresa</th>
                <th className="py-3 font-normal">Nemotécnico</th>
                <th className="py-3 text-right font-normal">Autoridades</th>
                <th className="py-3 text-right font-normal">Valor declarado</th>
                <th className="py-3 text-right font-normal">Última declaración</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.rut} className="border-b border-ink-200">
                  <td className="py-3.5 text-ink-900">{row.nombre}</td>
                  <td className="py-3.5 text-ink-500">{row.symbol ?? "—"}</td>
                  <td className="py-3.5 text-right tabular-nums text-ink-900">
                    {row.autoridades}
                  </td>
                  <td className="py-3.5 text-right tabular-nums text-ink-900">
                    {formatValorClp(row.valorDeclaradoClp)}
                  </td>
                  <td className="py-3.5 text-right tabular-nums text-ink-500">
                    {formatFechaDeclaracion(row.ultimaDeclaracion)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-[15px] text-ink-500">
          El agregado se publica cuando corre el scraper de InfoProbidad. No hay
          fichas por persona.
        </p>
      )}

      <p className="mt-4 text-[13px] leading-relaxed text-ink-500">
        <a
          href={INFOPROBIDAD_URL}
          className="text-ink-900 underline-offset-4 hover:underline"
          rel="noreferrer"
        >
          {INFOPROBIDAD_FUENTE}
        </a>
        {" · "}
        <a
          href={INFOPROBIDAD_LICENCIA_URL}
          className="underline-offset-4 hover:underline"
          rel="noreferrer"
        >
          Licencia CC BY 4.0
        </a>
      </p>
    </section>
  );
}
