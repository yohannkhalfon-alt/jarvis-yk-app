import { calcularPrevision } from './forecast';
import { getAjuste, getDb } from './db';
import type { AnalisisCapricho, Capricho, CargaFija, NivelRiesgo } from './types';

/**
 * Sistema de puntuación de riesgo para el módulo "Capricho antes de comprar".
 *
 * Simula la compra hoy, en 7 días y en 30 días sobre la previsión (sin contar
 * este capricho), compara el saldo mínimo resultante con el margen de seguridad
 * y con las cargas fijas de los próximos 30 días, y produce una recomendación
 * clara y cariñosa.
 */
export function analizarCapricho(capricho: Capricho): AnalisisCapricho {
  const margen = parseFloat(getAjuste('margen_seguridad', '1000'));
  const prevision = calcularPrevision(60, false);

  const cargas = getDb().prepare('SELECT * FROM cargas_fijas WHERE activa = 1').all() as CargaFija[];
  const cargasFijas30Dias = cargas
    .filter((c) => c.recurrencia === 'mensual')
    .reduce((s, c) => s + c.monto, 0);

  // Saldo mínimo de la previsión a partir del día N, restando el capricho
  const saldoMinDesde = (dia: number) => {
    const tramo = prevision.timeline.slice(dia);
    return Math.min(...tramo.map((p) => p.saldo)) - capricho.monto;
  };

  const saldoSiComproAhora = saldoMinDesde(0);
  const saldoSiEspero7 = saldoMinDesde(7);
  const saldoSiEspero30 = saldoMinDesde(30);

  const impactoCargasFijas =
    cargasFijas30Dias > 0 ? Math.round((capricho.monto / cargasFijas30Dias) * 100) : 0;

  // Puntuación
  const puntuar = (saldoMin: number): NivelRiesgo => {
    if (saldoMin >= margen) return 'verde';
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
    mensaje = 'Cuidado, este gasto puede debilitar tu mes 🚨 Mejor evitarlo por ahora: tu futuro yo te lo agradecerá.';
  }

  // La prioridad emocional alta + utilidad real alta suaviza el mensaje naranja
  if (riesgo === 'naranja' && capricho.utilidad_real === 'alta' && !capricho.puede_esperar) {
    mensaje += ' Si es realmente urgente, vigila el resto del mes de cerca.';
  }

  return {
    capricho,
    saldoAhora: prevision.saldoActual,
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
