// Modelos de datos de CleoDinero — toda la app habla español ✨

export type Recurrencia = 'puntual' | 'semanal' | 'mensual' | 'anual';

export type EstadoIngreso = 'previsto' | 'recibido' | 'atrasado';
export type EstadoGasto = 'previsto' | 'pagado' | 'atrasado';
export type Prioridad = 'indispensable' | 'importante' | 'opcional';
export type Nivel = 'baja' | 'media' | 'alta';
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

export const MEDIOS_PAGO = [
  'Domiciliación',
  'Transferencia',
  'Tarjeta',
  'Efectivo',
  'Cheque',
] as const;

export interface Ingreso {
  id: number;
  nombre: string;
  monto: number;
  fecha_prevista: string; // ISO yyyy-mm-dd
  estado: EstadoIngreso;
  recurrencia: Recurrencia;
  categoria: string;
  comentario: string;
}

export interface Gasto {
  id: number;
  nombre: string;
  monto: number;
  fecha_prevista: string;
  estado: EstadoGasto;
  recurrencia: Recurrencia;
  categoria: string;
  prioridad: Prioridad;
  comentario: string;
}

export interface CargaFija {
  id: number;
  nombre: string;
  monto: number;
  dia_cargo: number; // día del mes (1–28) o día de la semana para semanal
  recurrencia: Recurrencia;
  medio_pago: string;
  categoria: string;
  activa: number; // 1 activa / 0 inactiva (SQLite)
}

export interface Capricho {
  id: number;
  nombre: string;
  monto: number;
  fecha_deseada: string;
  prioridad_emocional: Nivel;
  utilidad_real: Nivel;
  puede_esperar: number; // 1 sí / 0 no
  estado: 'pendiente' | 'comprado' | 'descartado';
}

export interface ReglaCategoria {
  id: number;
  palabra_clave: string;
  categoria: string;
  tipo: 'ingreso' | 'gasto';
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

export interface AnalisisCapricho {
  capricho: Capricho;
  saldoAhora: number;
  saldoSiComproAhora: number;
  saldoSiEspero7: number;
  saldoSiEspero30: number;
  cargasFijas30Dias: number;
  impactoCargasFijas: number; // % del colchón de cargas fijas que consume
  riesgo: NivelRiesgo;
  recomendacion: string;
  mensaje: string;
}
