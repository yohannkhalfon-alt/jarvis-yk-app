import { getDb, getSaldoActual, hoy } from './db';
import type { Alerta, Capricho, CargaFija, Gasto, Ingreso, PuntoTimeline } from './types';

function aFecha(iso: string): Date {
  return new Date(iso + 'T00:00:00');
}

function aIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Expande un movimiento recurrente en todas sus fechas dentro de [desde, hasta].
 * La primera ocurrencia es fecha_prevista; luego se repite según la recurrencia.
 */
function ocurrencias(fechaPrevista: string, recurrencia: string, desde: Date, hasta: Date): string[] {
  const res: string[] = [];
  const d = aFecha(fechaPrevista);
  if (recurrencia === 'puntual') {
    if (d >= desde && d <= hasta) res.push(aIso(d));
    return res;
  }
  // Avanza hasta la primera ocurrencia >= desde
  while (d < desde) {
    if (recurrencia === 'semanal') d.setDate(d.getDate() + 7);
    else if (recurrencia === 'mensual') d.setMonth(d.getMonth() + 1);
    else if (recurrencia === 'anual') d.setFullYear(d.getFullYear() + 1);
    else break;
  }
  while (d <= hasta) {
    res.push(aIso(d));
    if (recurrencia === 'semanal') d.setDate(d.getDate() + 7);
    else if (recurrencia === 'mensual') d.setMonth(d.getMonth() + 1);
    else if (recurrencia === 'anual') d.setFullYear(d.getFullYear() + 1);
    else break;
  }
  return res;
}

/** Fechas de cargo de una carga fija mensual/semanal/anual dentro del rango. */
function ocurrenciasCarga(carga: CargaFija, desde: Date, hasta: Date): string[] {
  const res: string[] = [];
  if (carga.recurrencia === 'semanal') {
    const d = new Date(desde);
    // dia_cargo = día de la semana (0 domingo … 6 sábado)
    while (d.getDay() !== carga.dia_cargo % 7) d.setDate(d.getDate() + 1);
    while (d <= hasta) {
      res.push(aIso(d));
      d.setDate(d.getDate() + 7);
    }
    return res;
  }
  // mensual (por defecto) y anual: dia_cargo = día del mes
  const d = new Date(desde.getFullYear(), desde.getMonth(), 1);
  while (d <= hasta) {
    const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const cargo = new Date(d.getFullYear(), d.getMonth(), Math.min(carga.dia_cargo, ultimoDia));
    if (cargo >= desde && cargo <= hasta) {
      if (carga.recurrencia !== 'anual' || cargo.getMonth() === aFecha(hoy()).getMonth()) {
        res.push(aIso(cargo));
      }
    }
    d.setMonth(d.getMonth() + 1);
  }
  return res;
}

export interface Prevision {
  timeline: PuntoTimeline[];
  saldoActual: number;
  saldo7: number;
  saldo30: number;
  saldo60: number;
  saldo90: number;
  totalIngresosPrevistos: number;
  totalGastosPrevistos: number;
  alertas: Alerta[];
}

/**
 * Proyección inteligente del saldo, día a día:
 * saldo actual + ingresos previstos − gastos previstos − cargas fijas − caprichos planificados.
 */
export function calcularPrevision(dias = 90, incluirCaprichos = true): Prevision {
  const db = getDb();
  const saldoActual = getSaldoActual();
  const desde = aFecha(hoy());
  const hasta = new Date(desde);
  hasta.setDate(hasta.getDate() + dias);

  const ingresos = db.prepare("SELECT * FROM ingresos WHERE estado != 'recibido'").all() as Ingreso[];
  const gastos = db.prepare("SELECT * FROM gastos WHERE estado != 'pagado'").all() as Gasto[];
  const cargas = db.prepare('SELECT * FROM cargas_fijas WHERE activa = 1').all() as CargaFija[];
  const caprichos = incluirCaprichos
    ? (db.prepare("SELECT * FROM caprichos WHERE estado = 'pendiente'").all() as Capricho[])
    : [];

  // Mapa fecha → {ingresos, gastos, eventos}
  const porDia = new Map<string, { ingresos: number; gastos: number; eventos: string[] }>();
  const bucket = (f: string) => {
    let b = porDia.get(f);
    if (!b) {
      b = { ingresos: 0, gastos: 0, eventos: [] };
      porDia.set(f, b);
    }
    return b;
  };

  for (const ing of ingresos) {
    for (const f of ocurrencias(ing.fecha_prevista, ing.recurrencia, desde, hasta)) {
      const b = bucket(f);
      b.ingresos += ing.monto;
      b.eventos.push(`+ ${ing.nombre}`);
    }
  }
  for (const g of gastos) {
    for (const f of ocurrencias(g.fecha_prevista, g.recurrencia, desde, hasta)) {
      const b = bucket(f);
      b.gastos += g.monto;
      b.eventos.push(`− ${g.nombre}`);
    }
  }
  for (const c of cargas) {
    for (const f of ocurrenciasCarga(c, desde, hasta)) {
      const b = bucket(f);
      b.gastos += c.monto;
      b.eventos.push(`− ${c.nombre} (fija)`);
    }
  }
  for (const cap of caprichos) {
    const f = cap.fecha_deseada;
    if (aFecha(f) >= desde && aFecha(f) <= hasta) {
      const b = bucket(f);
      b.gastos += cap.monto;
      b.eventos.push(`− ${cap.nombre} (capricho)`);
    }
  }

  // Timeline día a día
  const timeline: PuntoTimeline[] = [];
  let saldo = saldoActual;
  let totalIngresos = 0;
  let totalGastos = 0;
  const cursor = new Date(desde);
  for (let i = 0; i <= dias; i++) {
    const f = aIso(cursor);
    const b = porDia.get(f);
    if (b) {
      saldo += b.ingresos - b.gastos;
      totalIngresos += b.ingresos;
      totalGastos += b.gastos;
    }
    timeline.push({
      fecha: f,
      saldo: Math.round(saldo * 100) / 100,
      ingresos: b?.ingresos ?? 0,
      gastos: b?.gastos ?? 0,
      eventos: b?.eventos ?? [],
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  const saldoEn = (n: number) => timeline[Math.min(n, timeline.length - 1)].saldo;

  return {
    timeline,
    saldoActual,
    saldo7: saldoEn(7),
    saldo30: saldoEn(30),
    saldo60: saldoEn(60),
    saldo90: saldoEn(90),
    totalIngresosPrevistos: Math.round(totalIngresos * 100) / 100,
    totalGastosPrevistos: Math.round(totalGastos * 100) / 100,
    alertas: generarAlertas(timeline, gastos, cargas),
  };
}

function generarAlertas(timeline: PuntoTimeline[], gastos: Gasto[], cargas: CargaFija[]): Alerta[] {
  const alertas: Alerta[] = [];

  // Descubierto probable
  const primerNegativo = timeline.find((p) => p.saldo < 0);
  if (primerNegativo) {
    alertas.push({
      nivel: 'rojo',
      titulo: 'Descubierto probable 🚨',
      detalle: `Tu saldo podría ser negativo el ${formatearFechaCorta(primerNegativo.fecha)} (${primerNegativo.saldo.toLocaleString('es-ES')} €). Revisa tus gastos, tu dinero te necesita.`,
    });
  }

  // Gran gasto próximo (≥ 2 000 € en los próximos 14 días)
  const dentro14 = timeline.slice(0, 15);
  for (const p of dentro14) {
    if (p.gastos >= 2000) {
      alertas.push({
        nivel: 'naranja',
        titulo: 'Gran gasto a la vista ⚠️',
        detalle: `El ${formatearFechaCorta(p.fecha)} salen ${p.gastos.toLocaleString('es-ES')} € (${p.eventos.filter((e) => e.startsWith('−')).join(', ')}). Prepárate con cariño.`,
      });
      break;
    }
  }

  // Carga fija posiblemente olvidada: gasto atrasado
  const atrasados = gastos.filter((g) => g.estado === 'atrasado');
  if (atrasados.length > 0) {
    alertas.push({
      nivel: 'naranja',
      titulo: 'Pagos atrasados 💌',
      detalle: `Tienes ${atrasados.length} pago(s) atrasado(s): ${atrasados.map((g) => g.nombre).join(', ')}. Ponte al día para proteger tu mes.`,
    });
  }

  // Sin cargas fijas activas → probable olvido
  if (cargas.length === 0) {
    alertas.push({
      nivel: 'naranja',
      titulo: '¿Cargas fijas olvidadas? 🤔',
      detalle: 'No tienes ninguna carga fija activa. Añádelas para que la previsión sea fiable.',
    });
  }

  if (alertas.length === 0) {
    alertas.push({
      nivel: 'verde',
      titulo: '¡Bravo, estás protegiendo tu dinero ✨!',
      detalle: 'Ningún riesgo detectado en los próximos 90 días. Tu objetivo de ahorro va por buen camino.',
    });
  }
  return alertas;
}

export function formatearFechaCorta(iso: string): string {
  return aFecha(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
