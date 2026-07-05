import { getDb } from './db';
import type { ReglaCategoria } from './types';

/**
 * Clasificación automática por palabras clave.
 * Las reglas viven en la tabla reglas_categoria y son editables en Ajustes.
 * Ejemplos sembrados: "urssaf" → Cargas sociales, "impuesto" → Impuestos,
 * "crédito casa" → Créditos, "alquiler" → Alquiler, "doctolib" → Suscripciones.
 */
export function sugerirCategoria(nombre: string, tipo: 'ingreso' | 'gasto'): string | null {
  const reglas = getDb()
    .prepare('SELECT * FROM reglas_categoria WHERE tipo = ? ORDER BY LENGTH(palabra_clave) DESC')
    .all(tipo) as ReglaCategoria[];
  const texto = nombre.toLowerCase();
  for (const regla of reglas) {
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

/**
 * Analiza un CSV bancario: Fecha;Libellé;Monto;Tipo (o con comas).
 * Acepta fechas dd/mm/yyyy o yyyy-mm-dd y montos con coma decimal.
 */
export function parsearCsvBancario(contenido: string): LineaCsv[] {
  const lineas = contenido.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const resultado: LineaCsv[] = [];

  for (const linea of lineas) {
    const sep = linea.includes(';') ? ';' : ',';
    const campos = linea.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (campos.length < 3) continue;

    const [rawFecha, libelle, rawMonto, rawTipo] = campos;

    // Salta la cabecera
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

    const categoria =
      sugerirCategoria(libelle, tipo === 'credito' ? 'ingreso' : 'gasto') ?? 'Otros';

    resultado.push({ fecha, libelle, monto: Math.abs(monto), tipo, categoria });
  }
  return resultado;
}
