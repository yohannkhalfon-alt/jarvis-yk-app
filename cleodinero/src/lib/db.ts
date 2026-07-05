import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

function enDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function getDb(): Database.Database {
  if (db) return db;

  const dir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new Database(path.join(dir, 'cleodinero.db'));
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS ajustes (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ingresos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      monto REAL NOT NULL,
      fecha_prevista TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'previsto',
      recurrencia TEXT NOT NULL DEFAULT 'puntual',
      categoria TEXT NOT NULL DEFAULT 'Otros',
      comentario TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS gastos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      monto REAL NOT NULL,
      fecha_prevista TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'previsto',
      recurrencia TEXT NOT NULL DEFAULT 'puntual',
      categoria TEXT NOT NULL DEFAULT 'Otros',
      prioridad TEXT NOT NULL DEFAULT 'importante',
      comentario TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS cargas_fijas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      monto REAL NOT NULL,
      dia_cargo INTEGER NOT NULL DEFAULT 1,
      recurrencia TEXT NOT NULL DEFAULT 'mensual',
      medio_pago TEXT NOT NULL DEFAULT 'Domiciliación',
      categoria TEXT NOT NULL DEFAULT 'Otros',
      activa INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS caprichos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      monto REAL NOT NULL,
      fecha_deseada TEXT NOT NULL,
      prioridad_emocional TEXT NOT NULL DEFAULT 'media',
      utilidad_real TEXT NOT NULL DEFAULT 'media',
      puede_esperar INTEGER NOT NULL DEFAULT 1,
      estado TEXT NOT NULL DEFAULT 'pendiente'
    );
    CREATE TABLE IF NOT EXISTS reglas_categoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      palabra_clave TEXT NOT NULL,
      categoria TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'gasto'
    );
  `);

  seedSiVacio(db);
  return db;
}

function seedSiVacio(db: Database.Database) {
  const tieneAjustes = db.prepare('SELECT COUNT(*) AS n FROM ajustes').get() as { n: number };
  if (tieneAjustes.n > 0) return;

  db.prepare("INSERT INTO ajustes (clave, valor) VALUES ('saldo_actual', '10000')").run();
  db.prepare("INSERT INTO ajustes (clave, valor) VALUES ('margen_seguridad', '1000')").run();

  const insCarga = db.prepare(
    'INSERT INTO cargas_fijas (nombre, monto, dia_cargo, recurrencia, medio_pago, categoria, activa) VALUES (?,?,?,?,?,?,1)'
  );
  insCarga.run('Crédito casa', 7000, 5, 'mensual', 'Domiciliación', 'Crédito casa');
  insCarga.run('Impuestos', 3000, 15, 'mensual', 'Domiciliación', 'Impuestos');
  insCarga.run('Salarios equipo', 12000, 28, 'mensual', 'Transferencia', 'Salarios');

  const insIngreso = db.prepare(
    'INSERT INTO ingresos (nombre, monto, fecha_prevista, estado, recurrencia, categoria, comentario) VALUES (?,?,?,?,?,?,?)'
  );
  insIngreso.run('Ingresos centro médico', 15000, enDias(3), 'previsto', 'mensual', 'Centro médico', 'Facturación mensual');
  insIngreso.run('Ingresos boutique', 10000, enDias(10), 'previsto', 'mensual', 'Boutique', 'Ventas del mes');

  const insGasto = db.prepare(
    'INSERT INTO gastos (nombre, monto, fecha_prevista, estado, recurrencia, categoria, prioridad, comentario) VALUES (?,?,?,?,?,?,?,?)'
  );
  insGasto.run('Gastos personales', 4000, enDias(7), 'previsto', 'mensual', 'Otros', 'importante', 'Vida diaria y familia');

  db.prepare(
    "INSERT INTO caprichos (nombre, monto, fecha_deseada, prioridad_emocional, utilidad_real, puede_esperar, estado) VALUES ('Viaje soñado ✈️', 3500, ?, 'alta', 'media', 1, 'pendiente')"
  ).run(enDias(14));

  const insRegla = db.prepare(
    'INSERT INTO reglas_categoria (palabra_clave, categoria, tipo) VALUES (?,?,?)'
  );
  const reglas: Array<[string, string, string]> = [
    ['urssaf', 'Cargas sociales', 'gasto'],
    ['impuesto', 'Impuestos', 'gasto'],
    ['impôt', 'Impuestos', 'gasto'],
    ['crédito casa', 'Créditos', 'gasto'],
    ['credito', 'Créditos', 'gasto'],
    ['alquiler', 'Alquiler', 'gasto'],
    ['loyer', 'Alquiler', 'gasto'],
    ['salario', 'Salarios', 'gasto'],
    ['doctolib', 'Suscripciones', 'gasto'],
    ['seguro', 'Seguro', 'gasto'],
    ['netflix', 'Suscripciones', 'gasto'],
    ['viaje', 'Viajes', 'gasto'],
    ['nómina', 'Salario', 'ingreso'],
    ['dividendo', 'Dividendos', 'ingreso'],
    ['reembolso', 'Reembolso', 'ingreso'],
    ['boutique', 'Boutique', 'ingreso'],
    ['centro médico', 'Centro médico', 'ingreso'],
  ];
  for (const [p, c, t] of reglas) insRegla.run(p, c, t);
}

// ——— Lecturas tipadas ———

export function getAjuste(clave: string, porDefecto: string): string {
  const row = getDb().prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave) as
    | { valor: string }
    | undefined;
  return row?.valor ?? porDefecto;
}

export function setAjuste(clave: string, valor: string) {
  getDb()
    .prepare('INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor')
    .run(clave, valor);
}

export function getSaldoActual(): number {
  return parseFloat(getAjuste('saldo_actual', '0'));
}

export { hoy, enDias };
