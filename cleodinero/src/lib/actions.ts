'use server';

import { revalidatePath } from 'next/cache';
import { getDb, setAjuste } from './db';
import { parsearCsvBancario, sugerirCategoria } from './categorize';

function todo() {
  for (const p of ['/', '/ingresos', '/gastos', '/gastos-fijos', '/caprichos', '/prevision', '/ajustes']) {
    revalidatePath(p);
  }
}

function num(fd: FormData, campo: string): number {
  const v = parseFloat(String(fd.get(campo) ?? '0').replace(',', '.'));
  return isNaN(v) ? 0 : v;
}

function str(fd: FormData, campo: string, porDefecto = ''): string {
  const v = fd.get(campo);
  return typeof v === 'string' && v.length > 0 ? v : porDefecto;
}

// ——— Ingresos ———

export async function crearIngreso(fd: FormData) {
  const nombre = str(fd, 'nombre');
  if (!nombre || num(fd, 'monto') <= 0) return;
  const categoria = str(fd, 'categoria') || sugerirCategoria(nombre, 'ingreso') || 'Otros';
  getDb()
    .prepare(
      'INSERT INTO ingresos (nombre, monto, fecha_prevista, estado, recurrencia, categoria, comentario) VALUES (?,?,?,?,?,?,?)'
    )
    .run(
      nombre,
      num(fd, 'monto'),
      str(fd, 'fecha_prevista'),
      str(fd, 'estado', 'previsto'),
      str(fd, 'recurrencia', 'puntual'),
      categoria,
      str(fd, 'comentario')
    );
  todo();
}

export async function cambiarEstadoIngreso(id: number, estado: string) {
  getDb().prepare('UPDATE ingresos SET estado = ? WHERE id = ?').run(estado, id);
  todo();
}

export async function eliminarIngreso(id: number) {
  getDb().prepare('DELETE FROM ingresos WHERE id = ?').run(id);
  todo();
}

// ——— Gastos ———

export async function crearGasto(fd: FormData) {
  const nombre = str(fd, 'nombre');
  if (!nombre || num(fd, 'monto') <= 0) return;
  const categoria = str(fd, 'categoria') || sugerirCategoria(nombre, 'gasto') || 'Otros';
  getDb()
    .prepare(
      'INSERT INTO gastos (nombre, monto, fecha_prevista, estado, recurrencia, categoria, prioridad, comentario) VALUES (?,?,?,?,?,?,?,?)'
    )
    .run(
      nombre,
      num(fd, 'monto'),
      str(fd, 'fecha_prevista'),
      str(fd, 'estado', 'previsto'),
      str(fd, 'recurrencia', 'puntual'),
      categoria,
      str(fd, 'prioridad', 'importante'),
      str(fd, 'comentario')
    );
  todo();
}

export async function cambiarEstadoGasto(id: number, estado: string) {
  getDb().prepare('UPDATE gastos SET estado = ? WHERE id = ?').run(estado, id);
  todo();
}

export async function eliminarGasto(id: number) {
  getDb().prepare('DELETE FROM gastos WHERE id = ?').run(id);
  todo();
}

// ——— Cargas fijas ———

export async function crearCargaFija(fd: FormData) {
  const nombre = str(fd, 'nombre');
  if (!nombre || num(fd, 'monto') <= 0) return;
  getDb()
    .prepare(
      'INSERT INTO cargas_fijas (nombre, monto, dia_cargo, recurrencia, medio_pago, categoria, activa) VALUES (?,?,?,?,?,?,1)'
    )
    .run(
      nombre,
      num(fd, 'monto'),
      Math.min(28, Math.max(1, Math.round(num(fd, 'dia_cargo')) || 1)),
      str(fd, 'recurrencia', 'mensual'),
      str(fd, 'medio_pago', 'Domiciliación'),
      str(fd, 'categoria') || sugerirCategoria(nombre, 'gasto') || 'Otros'
    );
  todo();
}

export async function alternarCargaFija(id: number) {
  getDb().prepare('UPDATE cargas_fijas SET activa = 1 - activa WHERE id = ?').run(id);
  todo();
}

export async function eliminarCargaFija(id: number) {
  getDb().prepare('DELETE FROM cargas_fijas WHERE id = ?').run(id);
  todo();
}

// ——— Caprichos ———

export async function crearCapricho(fd: FormData) {
  const nombre = str(fd, 'nombre');
  if (!nombre || num(fd, 'monto') <= 0) return;
  getDb()
    .prepare(
      'INSERT INTO caprichos (nombre, monto, fecha_deseada, prioridad_emocional, utilidad_real, puede_esperar, estado) VALUES (?,?,?,?,?,?,\'pendiente\')'
    )
    .run(
      nombre,
      num(fd, 'monto'),
      str(fd, 'fecha_deseada'),
      str(fd, 'prioridad_emocional', 'media'),
      str(fd, 'utilidad_real', 'media'),
      str(fd, 'puede_esperar', 'si') === 'si' ? 1 : 0
    );
  todo();
}

export async function cambiarEstadoCapricho(id: number, estado: string) {
  const db = getDb();
  if (estado === 'comprado') {
    // Al comprar, el capricho se convierte en gasto pagado y descuenta del saldo
    const cap = db.prepare('SELECT * FROM caprichos WHERE id = ?').get(id) as
      | { nombre: string; monto: number; fecha_deseada: string }
      | undefined;
    if (cap) {
      db.prepare(
        "INSERT INTO gastos (nombre, monto, fecha_prevista, estado, recurrencia, categoria, prioridad, comentario) VALUES (?,?,?,'pagado','puntual','Caprichos','opcional','Capricho comprado 💕')"
      ).run(cap.nombre, cap.monto, new Date().toISOString().slice(0, 10));
      const saldo = parseFloat(
        (db.prepare("SELECT valor FROM ajustes WHERE clave='saldo_actual'").get() as { valor: string }).valor
      );
      setAjuste('saldo_actual', String(saldo - cap.monto));
    }
  }
  db.prepare('UPDATE caprichos SET estado = ? WHERE id = ?').run(estado, id);
  todo();
}

export async function eliminarCapricho(id: number) {
  getDb().prepare('DELETE FROM caprichos WHERE id = ?').run(id);
  todo();
}

// ——— Ajustes ———

export async function guardarAjustes(fd: FormData) {
  setAjuste('saldo_actual', String(num(fd, 'saldo_actual')));
  setAjuste('margen_seguridad', String(num(fd, 'margen_seguridad')));
  todo();
}

export async function crearRegla(fd: FormData) {
  const palabra = str(fd, 'palabra_clave');
  const categoria = str(fd, 'categoria');
  if (!palabra || !categoria) return;
  getDb()
    .prepare('INSERT INTO reglas_categoria (palabra_clave, categoria, tipo) VALUES (?,?,?)')
    .run(palabra.toLowerCase(), categoria, str(fd, 'tipo', 'gasto'));
  todo();
}

export async function eliminarRegla(id: number) {
  getDb().prepare('DELETE FROM reglas_categoria WHERE id = ?').run(id);
  todo();
}

// ——— Import CSV ———

export async function importarCsv(fd: FormData) {
  let contenido = str(fd, 'contenido');
  const archivo = fd.get('archivo');
  if (archivo instanceof File && archivo.size > 0) {
    contenido = await archivo.text();
  }
  if (!contenido.trim()) return;

  const lineas = parsearCsvBancario(contenido);
  const db = getDb();
  const insIngreso = db.prepare(
    "INSERT INTO ingresos (nombre, monto, fecha_prevista, estado, recurrencia, categoria, comentario) VALUES (?,?,?,'recibido','puntual',?,'Importado del banco')"
  );
  const insGasto = db.prepare(
    "INSERT INTO gastos (nombre, monto, fecha_prevista, estado, recurrencia, categoria, prioridad, comentario) VALUES (?,?,?,'pagado','puntual',?,'importante','Importado del banco')"
  );
  const tx = db.transaction(() => {
    for (const l of lineas) {
      if (l.tipo === 'credito') insIngreso.run(l.libelle, l.monto, l.fecha, l.categoria);
      else insGasto.run(l.libelle, l.monto, l.fecha, l.categoria);
    }
  });
  tx();
  todo();
}
