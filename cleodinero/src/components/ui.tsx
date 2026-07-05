import type { NivelRiesgo } from '@/lib/types';

/** Chip de estado — siempre icono + texto, nunca solo color. */
export function ChipEstado({ estado }: { estado: string }) {
  const estilos: Record<string, { clase: string; icono: string }> = {
    previsto: { clase: 'bg-barbie-50 text-barbie-700 border border-barbie-200', icono: '🕐' },
    recibido: { clase: 'bg-emerald-50 text-ingreso border border-emerald-200', icono: '✓' },
    pagado: { clase: 'bg-emerald-50 text-ingreso border border-emerald-200', icono: '✓' },
    atrasado: { clase: 'bg-red-50 text-gasto border border-red-200', icono: '⚠' },
    pendiente: { clase: 'bg-gold-100 text-gold-700 border border-gold-200', icono: '💭' },
    comprado: { clase: 'bg-emerald-50 text-ingreso border border-emerald-200', icono: '🛍' },
    descartado: { clase: 'bg-gray-100 text-gray-500 border border-gray-200', icono: '✕' },
  };
  const s = estilos[estado] ?? estilos.previsto;
  return (
    <span className={`chip ${s.clase}`}>
      <span aria-hidden>{s.icono}</span> {estado}
    </span>
  );
}

export function ChipRiesgo({ nivel, texto }: { nivel: NivelRiesgo; texto?: string }) {
  const estilos: Record<NivelRiesgo, { clase: string; icono: string; defecto: string }> = {
    verde: { clase: 'bg-emerald-50 text-ingreso border border-emerald-200', icono: '💚', defecto: 'Sin peligro' },
    naranja: { clase: 'bg-orange-50 text-alerta border border-orange-200', icono: '⚠️', defecto: 'Con cuidado' },
    rojo: { clase: 'bg-red-50 text-gasto border border-red-200', icono: '🚨', defecto: 'Riesgo alto' },
  };
  const s = estilos[nivel];
  return (
    <span className={`chip ${s.clase}`}>
      <span aria-hidden>{s.icono}</span> {texto ?? s.defecto}
    </span>
  );
}

export function ChipPrioridad({ prioridad }: { prioridad: string }) {
  const estilos: Record<string, string> = {
    indispensable: 'bg-red-50 text-gasto border border-red-200',
    importante: 'bg-gold-100 text-gold-700 border border-gold-200',
    opcional: 'bg-barbie-50 text-barbie-600 border border-barbie-200',
  };
  return <span className={`chip ${estilos[prioridad] ?? estilos.importante}`}>{prioridad}</span>;
}
