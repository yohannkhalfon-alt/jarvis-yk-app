-- CleoDinero ✨ — esquema + datos de ejemplo.
-- D1 (SQLite). Una sola base compartida por preview + producción: todo aditivo
-- (CREATE TABLE IF NOT EXISTS / INSERT OR IGNORE), nunca pisa datos existentes.

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

-- Ajustes iniciales
INSERT OR IGNORE INTO ajustes (clave, valor) VALUES ('saldo_actual', '10000');
INSERT OR IGNORE INTO ajustes (clave, valor) VALUES ('margen_seguridad', '1000');
INSERT OR IGNORE INTO ajustes (clave, valor) VALUES ('codigo_acceso', 'CLEO2026');

-- Datos de ejemplo (ids fijos: el seed es idempotente)
INSERT OR IGNORE INTO cargas_fijas (id, nombre, monto, dia_cargo, recurrencia, medio_pago, categoria, activa) VALUES
  (1, 'Crédito casa', 7000, 5, 'mensual', 'Domiciliación', 'Crédito casa', 1),
  (2, 'Impuestos', 3000, 15, 'mensual', 'Domiciliación', 'Impuestos', 1),
  (3, 'Salarios equipo', 12000, 28, 'mensual', 'Transferencia', 'Salarios', 1);

INSERT OR IGNORE INTO ingresos (id, nombre, monto, fecha_prevista, estado, recurrencia, categoria, comentario) VALUES
  (1, 'Ingresos centro médico', 15000, date('now', '+3 days'), 'previsto', 'mensual', 'Centro médico', 'Facturación mensual'),
  (2, 'Ingresos boutique', 10000, date('now', '+10 days'), 'previsto', 'mensual', 'Boutique', 'Ventas del mes');

INSERT OR IGNORE INTO gastos (id, nombre, monto, fecha_prevista, estado, recurrencia, categoria, prioridad, comentario) VALUES
  (1, 'Gastos personales', 4000, date('now', '+7 days'), 'previsto', 'mensual', 'Otros', 'importante', 'Vida diaria y familia');

INSERT OR IGNORE INTO caprichos (id, nombre, monto, fecha_deseada, prioridad_emocional, utilidad_real, puede_esperar, estado) VALUES
  (1, 'Viaje soñado ✈️', 3500, date('now', '+14 days'), 'alta', 'media', 1, 'pendiente');

INSERT OR IGNORE INTO reglas_categoria (id, palabra_clave, categoria, tipo) VALUES
  (1, 'urssaf', 'Cargas sociales', 'gasto'),
  (2, 'impuesto', 'Impuestos', 'gasto'),
  (3, 'impôt', 'Impuestos', 'gasto'),
  (4, 'crédito casa', 'Créditos', 'gasto'),
  (5, 'credito', 'Créditos', 'gasto'),
  (6, 'alquiler', 'Alquiler', 'gasto'),
  (7, 'loyer', 'Alquiler', 'gasto'),
  (8, 'salario', 'Salarios', 'gasto'),
  (9, 'doctolib', 'Suscripciones', 'gasto'),
  (10, 'seguro', 'Seguro', 'gasto'),
  (11, 'netflix', 'Suscripciones', 'gasto'),
  (12, 'viaje', 'Viajes', 'gasto'),
  (13, 'nómina', 'Salario', 'ingreso'),
  (14, 'dividendo', 'Dividendos', 'ingreso'),
  (15, 'reembolso', 'Reembolso', 'ingreso'),
  (16, 'boutique', 'Boutique', 'ingreso'),
  (17, 'centro médico', 'Centro médico', 'ingreso');
