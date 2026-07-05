import { calcularPrevision } from '@/lib/forecast';
import { euros, fechaLarga } from '@/lib/format';
import { BalanceChart } from '@/components/BalanceChart';

export const dynamic = 'force-dynamic';

export default function PrevisionPage() {
  const prevision = calcularPrevision(90);

  // Solo los días con movimientos para la tabla día a día
  const diasConMovimiento = prevision.timeline.filter((p) => p.eventos.length > 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="titulo-pagina">Previsión 🔮</h1>
        <p className="text-sm text-tinta/60">
          Tu bola de cristal financiera: saldo proyectado día a día con entradas, salidas, gastos fijos y caprichos.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { plazo: '7 días', valor: prevision.saldo7 },
          { plazo: '30 días', valor: prevision.saldo30 },
          { plazo: '60 días', valor: prevision.saldo60 },
          { plazo: '90 días', valor: prevision.saldo90 },
        ].map(({ plazo, valor }) => (
          <div key={plazo} className="tarjeta text-center !p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta/50">En {plazo}</p>
            <p className={`font-display text-xl font-bold ${valor >= 0 ? 'text-ingreso' : 'text-gasto'}`}>
              {euros(valor)}
            </p>
          </div>
        ))}
      </section>

      <section className="tarjeta">
        <BalanceChart timeline={prevision.timeline} titulo="Saldo proyectado — próximos 90 días" />
      </section>

      {/* Timeline día a día (vista tabla accesible) */}
      <section className="tarjeta overflow-x-auto">
        <h2 className="mb-3 font-display text-base font-bold">Día a día 📅</h2>
        {diasConMovimiento.length === 0 && (
          <p className="text-sm text-tinta/50">Sin movimientos previstos en los próximos 90 días.</p>
        )}
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-barbie-100 text-left text-[11px] uppercase tracking-wide text-tinta/50">
              <th className="py-2 pr-3 font-semibold">Fecha</th>
              <th className="py-2 pr-3 font-semibold">Movimientos</th>
              <th className="py-2 pr-3 text-right font-semibold">Entradas</th>
              <th className="py-2 pr-3 text-right font-semibold">Salidas</th>
              <th className="py-2 text-right font-semibold">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {diasConMovimiento.map((p) => (
              <tr key={p.fecha} className="border-b border-barbie-50 last:border-0">
                <td className="whitespace-nowrap py-2.5 pr-3 font-medium">{fechaLarga(p.fecha)}</td>
                <td className="py-2.5 pr-3">
                  <div className="flex flex-wrap gap-1">
                    {p.eventos.map((e, idx) => (
                      <span
                        key={idx}
                        className={`chip ${
                          e.startsWith('+')
                            ? 'border border-emerald-200 bg-emerald-50 text-ingreso'
                            : 'border border-red-200 bg-red-50 text-gasto'
                        }`}
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-2.5 pr-3 text-right font-semibold text-ingreso">
                  {p.ingresos > 0 ? `+${euros(p.ingresos)}` : '·'}
                </td>
                <td className="py-2.5 pr-3 text-right font-semibold text-gasto">
                  {p.gastos > 0 ? `−${euros(p.gastos)}` : '·'}
                </td>
                <td
                  className={`whitespace-nowrap py-2.5 text-right font-display font-bold ${
                    p.saldo >= 0 ? 'text-ingreso' : 'text-gasto'
                  }`}
                >
                  {euros(p.saldo)}
                  {p.saldo < 0 && <span title="Saldo negativo"> 🚨</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
