// CleoDinero ✨ — motor de cálculo puro (sin base de datos).
// La previsión, el scoring de riesgo, la clasificación automática y el parser
// CSV viven aquí; las funciones de servidor les pasan los datos de D1.

export type Recurrencia = 'puntual' | 'semanal' | 'mensual' | 'anual';
export type NivelRiesgo = 'verde' | 'naranja' | 'rojo';

export const CATEGORIAS_INGRESO = [
  'Salario',
  'Dividendos',
  'Reembolso',
  'Centro médico',
  'Boutique',
  'Ingresos',
  'Otros',
] as const;

export const CATEGORIAS_GASTO = [
  'Gastos fijos',
  'Impuestos',
  'Créditos',
  'Alquiler',
  'Salarios',
  'Proveedor',
  'Familia',
  'Viajes',
  'Caprichos',
  'Deudas',
  'Ahorros',
  'Emergencias',
  'Cargas sociales',
  'Suscripciones',
  'Seguro',
  'Otros',
] as const;

export const CATEGORIAS_CARGA_FIJA = [
  'Crédito casa',
  'Alquiler',
  'Cargas sociales',
  'Impuestos',
  'Salarios',
  'Seguro',
  'Suscripciones',
  'Deudas',
  'Otros',
] as const;

export const MEDIOS_PAGO = ['Domiciliación', 'Transferencia', 'Tarjeta', 'Efectivo', 'Cheque'] as const;

export interface Ingreso {
  id: number;
  nombre: string;
  monto: number;
  fecha_prevista: string;
  estado: string; // previsto | recibido | atrasado
  recurrencia: string;
  categoria: string;
  comentario: string;
}

export interface Gasto {
  id: number;
  nombre: string;
  monto: number;
  fecha_prevista: string;
  estado: string; // previsto | pagado | atrasado
  recurrencia: string;
  categoria: string;
  prioridad: string;
  comentario: string;
}

export interface CargaFija {
  id: number;
  nombre: string;
  monto: number;
  dia_cargo: number;
  recurrencia: string;
  medio_pago: string;
  categoria: string;
  activa: number;
}

export interface Capricho {
  id: number;
  nombre: string;
  monto: number;
  fecha_deseada: string;
  prioridad_emocional: string;
  utilidad_real: string;
  puede_esperar: number;
  estado: string; // pendiente | comprado | descartado
}

export interface ReglaCategoria {
  id: number;
  palabra_clave: string;
  categoria: string;
  tipo: string; // ingreso | gasto
}

export interface PuntoTimeline {
  fecha: string;
  saldo: number;
  ingresos: number;
  gastos: number;
  eventos: string[];
}

export interface Alerta {
  nivel: NivelRiesgo;
  titulo: string;
  detalle: string;
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

export interface DatosFinancieros {
  saldoActual: number;
  ingresos: Ingreso[]; // no recibidos
  gastos: Gasto[]; // no pagados
  cargas: CargaFija[]; // activas
  caprichos: Capricho[]; // pendientes
}

export interface AnalisisCapricho {
  capricho: Capricho;
  saldoSiComproAhora: number;
  saldoSiEspero7: number;
  saldoSiEspero30: number;
  cargasFijas30Dias: number;
  impactoCargasFijas: number;
  riesgo: NivelRiesgo;
  recomendacion: string;
  mensaje: string;
}

function aFecha(iso: string): Date {
  return new Date(iso + 'T00:00:00');
}

function aIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Expande un movimiento recurrente en sus fechas dentro de [desde, hasta]. */
function ocurrencias(fechaPrevista: string, recurrencia: string, desde: Date, hasta: Date): string[] {
  const res: string[] = [];
  const d = aFecha(fechaPrevista);
  if (recurrencia === 'puntual') {
    if (d >= desde && d <= hasta) res.push(aIso(d));
    return res;
  }
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

/** Fechas de cargo de una carga fija dentro del rango. */
function ocurrenciasCarga(carga: CargaFija, desde: Date, hasta: Date): string[] {
  const res: string[] = [];
  if (carga.recurrencia === 'semanal') {
    const d = new Date(desde);
    while (d.getDay() !== carga.dia_cargo % 7) d.setDate(d.getDate() + 1);
    while (d <= hasta) {
      res.push(aIso(d));
      d.setDate(d.getDate() + 7);
    }
    return res;
  }
  const d = new Date(desde.getFullYear(), desde.getMonth(), 1);
  while (d <= hasta) {
    const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const cargo = new Date(d.getFullYear(), d.getMonth(), Math.min(carga.dia_cargo, ultimoDia));
    if (cargo >= desde && cargo <= hasta) {
      if (carga.recurrencia !== 'anual' || cargo.getMonth() === desde.getMonth()) {
        res.push(aIso(cargo));
      }
    }
    d.setMonth(d.getMonth() + 1);
  }
  return res;
}

export function formatearFechaCorta(iso: string): string {
  return aFecha(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function formatearFechaLarga(iso: string): string {
  return aFecha(iso).toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function euros(n: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

/**
 * Proyección del saldo día a día:
 * saldo actual + ingresos previstos − gastos previstos − cargas fijas − caprichos.
 */
export function calcularPrevision(datos: DatosFinancieros, dias = 90, incluirCaprichos = true): Prevision {
  const desde = aFecha(hoyIso());
  const hasta = new Date(desde);
  hasta.setDate(hasta.getDate() + dias);

  const porDia = new Map<string, { ingresos: number; gastos: number; eventos: string[] }>();
  const bucket = (f: string) => {
    let b = porDia.get(f);
    if (!b) {
      b = { ingresos: 0, gastos: 0, eventos: [] };
      porDia.set(f, b);
    }
    return b;
  };

  for (const ing of datos.ingresos) {
    for (const f of ocurrencias(ing.fecha_prevista, ing.recurrencia, desde, hasta)) {
      const b = bucket(f);
      b.ingresos += ing.monto;
      b.eventos.push(`+ ${ing.nombre}`);
    }
  }
  for (const g of datos.gastos) {
    for (const f of ocurrencias(g.fecha_prevista, g.recurrencia, desde, hasta)) {
      const b = bucket(f);
      b.gastos += g.monto;
      b.eventos.push(`− ${g.nombre}`);
    }
  }
  for (const c of datos.cargas) {
    for (const f of ocurrenciasCarga(c, desde, hasta)) {
      const b = bucket(f);
      b.gastos += c.monto;
      b.eventos.push(`− ${c.nombre} (fija)`);
    }
  }
  if (incluirCaprichos) {
    for (const cap of datos.caprichos) {
      const f = cap.fecha_deseada;
      if (aFecha(f) >= desde && aFecha(f) <= hasta) {
        const b = bucket(f);
        b.gastos += cap.monto;
        b.eventos.push(`− ${cap.nombre} (capricho)`);
      }
    }
  }

  const timeline: PuntoTimeline[] = [];
  let saldo = datos.saldoActual;
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
    saldoActual: datos.saldoActual,
    saldo7: saldoEn(7),
    saldo30: saldoEn(30),
    saldo60: saldoEn(60),
    saldo90: saldoEn(90),
    totalIngresosPrevistos: Math.round(totalIngresos * 100) / 100,
    totalGastosPrevistos: Math.round(totalGastos * 100) / 100,
    alertas: generarAlertas(timeline, datos.gastos, datos.cargas),
  };
}

function generarAlertas(timeline: PuntoTimeline[], gastos: Gasto[], cargas: CargaFija[]): Alerta[] {
  const alertas: Alerta[] = [];

  const primerNegativo = timeline.find((p) => p.saldo < 0);
  if (primerNegativo) {
    alertas.push({
      nivel: 'rojo',
      titulo: 'Descubierto probable 🚨',
      detalle: `Tu saldo podría ser negativo el ${formatearFechaCorta(primerNegativo.fecha)} (${primerNegativo.saldo.toLocaleString('es-ES')} €). Revisa tus gastos, tu dinero te necesita.`,
    });
  }

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

  const atrasados = gastos.filter((g) => g.estado === 'atrasado');
  if (atrasados.length > 0) {
    alertas.push({
      nivel: 'naranja',
      titulo: 'Pagos atrasados 💌',
      detalle: `Tienes ${atrasados.length} pago(s) atrasado(s): ${atrasados.map((g) => g.nombre).join(', ')}. Ponte al día para proteger tu mes.`,
    });
  }

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

/**
 * Scoring del módulo "capricho antes de comprar": simula la compra hoy / en 7
 * días / en 30 días sobre la previsión SIN este capricho y compara el saldo
 * mínimo resultante con el colchón de seguridad.
 */
export function analizarCapricho(
  capricho: Capricho,
  datos: DatosFinancieros,
  margenSeguridad: number,
): AnalisisCapricho {
  const sinEste: DatosFinancieros = {
    ...datos,
    caprichos: datos.caprichos.filter((c) => c.id !== capricho.id),
  };
  const prevision = calcularPrevision(sinEste, 60, true);

  const cargasFijas30Dias = datos.cargas
    .filter((c) => c.recurrencia === 'mensual')
    .reduce((s, c) => s + c.monto, 0);

  const saldoMinDesde = (dia: number) => {
    const tramo = prevision.timeline.slice(dia);
    return Math.min(...tramo.map((p) => p.saldo)) - capricho.monto;
  };

  const saldoSiComproAhora = saldoMinDesde(0);
  const saldoSiEspero7 = saldoMinDesde(7);
  const saldoSiEspero30 = saldoMinDesde(30);

  const impactoCargasFijas =
    cargasFijas30Dias > 0 ? Math.round((capricho.monto / cargasFijas30Dias) * 100) : 0;

  const puntuar = (saldoMin: number): NivelRiesgo => {
    if (saldoMin >= margenSeguridad) return 'verde';
    if (saldoMin >= 0) return 'naranja';
    return 'rojo';
  };

  const ahora = puntuar(saldoSiComproAhora);
  const en7 = puntuar(saldoSiEspero7);
  const en30 = puntuar(saldoSiEspero30);

  let riesgo: NivelRiesgo;
  let recomendacion: string;
  let mensaje: string;

  if (ahora === 'verde') {
    riesgo = 'verde';
    recomendacion = 'Puedes comprarlo';
    mensaje = '¡Puedes comprarlo sin peligro! Tu dinero sigue protegido ✨';
  } else if (en7 === 'verde') {
    riesgo = 'naranja';
    recomendacion = 'Espera 7 días';
    mensaje = 'Este capricho puede esperar un poco 💕 En 7 días podrás dártelo tranquila.';
  } else if (en30 === 'verde') {
    riesgo = 'naranja';
    recomendacion = 'Espera 30 días';
    mensaje = 'Paciencia, reina 👑 En 30 días este capricho será tuyo sin estrés.';
  } else if (ahora !== 'rojo') {
    riesgo = 'naranja';
    recomendacion = 'Espera 30 días';
    mensaje = 'Cuidado, este gasto puede debilitar tu mes. Dale un poco de tiempo 💕';
  } else {
    riesgo = 'rojo';
    recomendacion = 'A evitar por ahora';
    mensaje =
      'Cuidado, este gasto puede debilitar tu mes 🚨 Mejor evitarlo por ahora: tu futuro yo te lo agradecerá.';
  }

  if (riesgo === 'naranja' && capricho.utilidad_real === 'alta' && !capricho.puede_esperar) {
    mensaje += ' Si es realmente urgente, vigila el resto del mes de cerca.';
  }

  return {
    capricho,
    saldoSiComproAhora,
    saldoSiEspero7,
    saldoSiEspero30,
    cargasFijas30Dias,
    impactoCargasFijas,
    riesgo,
    recomendacion,
    mensaje,
  };
}

/** Clasificación automática por palabras clave (reglas editables). */
export function sugerirCategoria(reglas: ReglaCategoria[], nombre: string, tipo: 'ingreso' | 'gasto'): string | null {
  const texto = nombre.toLowerCase();
  const candidatas = reglas
    .filter((r) => r.tipo === tipo)
    .sort((a, b) => b.palabra_clave.length - a.palabra_clave.length);
  for (const regla of candidatas) {
    if (texto.includes(regla.palabra_clave.toLowerCase())) return regla.categoria;
  }
  return null;
}

export interface LineaCsv {
  fecha: string;
  libelle: string;
  monto: number;
  tipo: 'debito' | 'credito';
  categoria: string;
}

/** Parser de CSV bancario: Fecha;Libellé;Monto;Tipo (o con comas). */
export function parsearCsvBancario(contenido: string, reglas: ReglaCategoria[]): LineaCsv[] {
  const lineas = contenido.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const resultado: LineaCsv[] = [];

  for (const linea of lineas) {
    const sep = linea.includes(';') ? ';' : ',';
    const campos = linea.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (campos.length < 3) continue;

    const [rawFecha, libelle, rawMonto, rawTipo] = campos;
    if (/fecha|date/i.test(rawFecha)) continue;

    let fecha = rawFecha;
    const ddmmyyyy = rawFecha.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (ddmmyyyy) fecha = `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;

    const monto = parseFloat(rawMonto.replace(/\s|€/g, '').replace(',', '.'));
    if (isNaN(monto)) continue;

    const tipo: 'debito' | 'credito' = rawTipo
      ? /cr[eé]dit|abono|ingreso/i.test(rawTipo)
        ? 'credito'
        : 'debito'
      : monto >= 0
        ? 'credito'
        : 'debito';

    const categoria = sugerirCategoria(reglas, libelle, tipo === 'credito' ? 'ingreso' : 'gasto') ?? 'Otros';

    resultado.push({ fecha, libelle, monto: Math.abs(monto), tipo, categoria });
  }
  return resultado;
}
