import { createFileRoute, Link, redirect } from '@tanstack/react-router';

import { Shell } from '../components/cleo/Shell';
import { BalanceChart } from '../components/cleo/BalanceChart';
import { ChipRiesgo } from '../components/cleo/ui';
import { euros, type NivelRiesgo } from '../lib/cleo/motor';
import { getPanel, sesionValida } from '../lib/api/cleo.functions';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const { ok } = await sesionValida();
    if (!ok) throw redirect({ to: '/acceso' });
  },
  loader: () => getPanel(),
  component: PanelPage,
});

function PanelPage() {
  const { prevision, ahorroMes, caprichosPendientes, proximosIngresos, proximosGastos } =
    Route.useLoaderData();

  const nivelGlobal: NivelRiesgo = prevision.alertas.some((a) => a.nivel === 'rojo')
    ? 'rojo'
    : prevision.alertas.some((a) => a.nivel === 'naranja')
      ? 'naranja'
      : 'verde';

  return (
    <Shell>
      <div className="space-y-6">
        <header>
          <h1 className="titulo-pagina">Hola, jefa 👑</h1>
          <p className="text-sm text-tinta/60">Tu dinero está listo para brillar hoy ✨</p>
        </header>

        {/* Tarjetas hero — ambiente money girl boss */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <div className="tarjeta col-span-2 border-barbie-300 bg-gradient-to-br from-barbie-500 to-barbie-400 md:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Saldo actual</p>
            <p className="mt-1 font-display text-3xl font-bold text-white">{euros(prevision.saldoActual)}</p>
            <p className="mt-1 text-[11px] text-white/70">Hoy, en tu reino 💖</p>
          </div>

          <div className="tarjeta">
            <p className="text-xs font-semibold uppercase tracking-wide text-gold-600">Ahorro del mes</p>
            <p className={`mt-1 font-display text-2xl font-bold ${ahorroMes >= 0 ? 'text-gold-600' : 'text-gasto'}`}>
              {euros(ahorroMes)}
            </p>
            <p className="mt-1 text-[11px] text-tinta/50">
              {ahorroMes >= 0 ? 'Tu objetivo de ahorro va por buen camino 🌟' : 'Este mes pide un poco de mimo 💕'}
            </p>
          </div>

          <div className="tarjeta">
            <p className="text-xs font-semibold uppercase tracking-wide text-barbie-600">Caprichos en espera</p>
            <p className="mt-1 font-display text-2xl font-bold text-barbie-600">{caprichosPendientes.length}</p>
            <p className="mt-1 truncate text-[11px] text-tinta/50">
              {caprichosPendientes[0]
                ? `${caprichosPendientes[0].nombre} · ${euros(caprichosPendientes[0].monto)}`
                : 'Nada en la lista de deseos'}
            </p>
          </div>

          <div className="tarjeta">
            <p className="text-xs font-semibold uppercase tracking-wide text-tinta/60">Nivel de riesgo</p>
            <div className="mt-2">
              <ChipRiesgo nivel={nivelGlobal} />
            </div>
            <p className="mt-2 text-[11px] text-tinta/50">Próximos 90 días</p>
          </div>
        </section>

        {/* Saldos previstos */}
        <section className="tarjeta">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base font-bold">Saldo previsto 🔮</h2>
            <Link to="/prevision" className="boton-suave">
              Ver día a día →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { plazo: '7 días', valor: prevision.saldo7 },
              { plazo: '30 días', valor: prevision.saldo30 },
              { plazo: '60 días', valor: prevision.saldo60 },
              { plazo: '90 días', valor: prevision.saldo90 },
            ].map(({ plazo, valor }) => (
              <div key={plazo} className="tarjeta-suave text-center">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta/50">{plazo}</p>
                <p className={`font-display text-lg font-bold ${valor >= 0 ? 'text-ingreso' : 'text-gasto'}`}>
                  {euros(valor)}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-emerald-50/70 p-3">
              <p className="text-[11px] font-semibold uppercase text-ingreso">Entradas previstas (90 d)</p>
              <p className="font-display text-lg font-bold text-ingreso">
                +{euros(prevision.totalIngresosPrevistos)}
              </p>
            </div>
            <div className="rounded-2xl bg-red-50/70 p-3">
              <p className="text-[11px] font-semibold uppercase text-gasto">Salidas previstas (90 d)</p>
              <p className="font-display text-lg font-bold text-gasto">
                −{euros(prevision.totalGastosPrevistos)}
              </p>
            </div>
          </div>
        </section>

        {/* Gráfico rosa/dorado */}
        <section className="tarjeta">
          <BalanceChart timeline={prevision.timeline} titulo="Evolución del saldo — próximos 90 días" />
        </section>

        {/* Alertas */}
        <section className="space-y-2">
          {prevision.alertas.map((a) => (
            <div
              key={a.titulo}
              className={`tarjeta flex items-start gap-3 p-4 ${
                a.nivel === 'rojo'
                  ? 'border-red-200 bg-red-50/80'
                  : a.nivel === 'naranja'
                    ? 'border-orange-200 bg-orange-50/80'
                    : 'border-emerald-200 bg-emerald-50/80'
              }`}
            >
              <ChipRiesgo
                nivel={a.nivel}
                texto={a.nivel === 'verde' ? 'Todo bien' : a.nivel === 'naranja' ? 'Atención' : 'Alerta'}
              />
              <div>
                <p className="font-display text-sm font-bold">{a.titulo}</p>
                <p className="text-xs text-tinta/70">{a.detalle}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Próximos movimientos */}
        <section className="grid gap-4 md:grid-cols-2">
          <div className="tarjeta">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-ingreso">Próximas entradas 💚</h3>
              <Link to="/ingresos" className="boton-suave">
                Todas →
              </Link>
            </div>
            {proximosIngresos.length === 0 && <p className="text-xs text-tinta/50">Nada previsto todavía.</p>}
            {proximosIngresos.map((i) => (
              <div
                key={i.id}
                className="flex items-center justify-between border-b border-barbie-50 py-2 text-sm last:border-0"
              >
                <span className="truncate">{i.nombre}</span>
                <span className="font-semibold text-ingreso">+{euros(i.monto)}</span>
              </div>
            ))}
          </div>
          <div className="tarjeta">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-gasto">Próximas salidas 💸</h3>
              <Link to="/gastos" className="boton-suave">
                Todas →
              </Link>
            </div>
            {proximosGastos.length === 0 && <p className="text-xs text-tinta/50">Nada previsto todavía.</p>}
            {proximosGastos.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between border-b border-barbie-50 py-2 text-sm last:border-0"
              >
                <span className="truncate">{g.nombre}</span>
                <span className="font-semibold text-gasto">−{euros(g.monto)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Shell>
  );
}
