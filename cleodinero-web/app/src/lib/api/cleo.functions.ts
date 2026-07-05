// CleoDinero ✨ — funciones de servidor (RPC). Todas las operaciones de datos
// pasan por aquí; cada una (salvo `entrar`) exige la sesión con código de acceso.

import { createServerFn } from '@tanstack/react-start';
import { getCookie, setCookie } from '@tanstack/react-start/server';
import { z } from 'zod';
import type { D1Database } from '@cloudflare/workers-types';

import { bindings } from '../bindings.server';
import {
  analizarCapricho,
  calcularPrevision,
  parsearCsvBancario,
  sugerirCategoria,
  hoyIso,
  type AnalisisCapricho,
  type Capricho,
  type CargaFija,
  type DatosFinancieros,
  type Gasto,
  type Ingreso,
  type Prevision,
  type ReglaCategoria,
} from '../cleo/motor';

const COOKIE_SESION = 'cleo_acceso';

function db(): D1Database {
  const { DB } = bindings();
  if (!DB) throw new Error('La base de datos no está disponible');
  return DB;
}

async function leerAjuste(clave: string, porDefecto: string): Promise<string> {
  const row = await db()
    .prepare('SELECT valor FROM ajustes WHERE clave = ?')
    .bind(clave)
    .first<{ valor: string }>();
  return row?.valor ?? porDefecto;
}

async function guardarAjuste(clave: string, valor: string): Promise<void> {
  await db()
    .prepare(
      'INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor',
    )
    .bind(clave, valor)
    .run();
}

async function exigirSesion(): Promise<void> {
  const cookie = getCookie(COOKIE_SESION);
  const codigo = await leerAjuste('codigo_acceso', 'CLEO2026');
  if (!cookie || cookie !== codigo) throw new Error('NO_AUTORIZADA');
}

async function cargarDatos(): Promise<DatosFinancieros> {
  const DB = db();
  const [saldo, ingresos, gastos, cargas, caprichos] = await Promise.all([
    leerAjuste('saldo_actual', '0'),
    DB.prepare("SELECT * FROM ingresos WHERE estado != 'recibido'").all<Ingreso>(),
    DB.prepare("SELECT * FROM gastos WHERE estado != 'pagado'").all<Gasto>(),
    DB.prepare('SELECT * FROM cargas_fijas WHERE activa = 1').all<CargaFija>(),
    DB.prepare("SELECT * FROM caprichos WHERE estado = 'pendiente'").all<Capricho>(),
  ]);
  return {
    saldoActual: parseFloat(saldo),
    ingresos: ingresos.results ?? [],
    gastos: gastos.results ?? [],
    cargas: cargas.results ?? [],
    caprichos: caprichos.results ?? [],
  };
}

// ——— Sesión ———

export const sesionValida = createServerFn({ method: 'POST' }).handler(async () => {
  try {
    await exigirSesion();
    return { ok: true };
  } catch {
    return { ok: false };
  }
});

export const entrar = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ codigo: z.string().min(1) }))
  .handler(async ({ data }) => {
    const real = await leerAjuste('codigo_acceso', 'CLEO2026');
    if (data.codigo.trim().toUpperCase() !== real.toUpperCase()) {
      return { ok: false };
    }
    setCookie(COOKIE_SESION, real, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 180,
    });
    return { ok: true };
  });

export const salir = createServerFn({ method: 'POST' }).handler(async () => {
  setCookie(COOKIE_SESION, '', { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 0 });
  return { ok: true };
});

// ——— Panel + previsión ———

export interface DatosPanel {
  prevision: Prevision;
  ahorroMes: number;
  caprichosPendientes: Capricho[];
  proximosIngresos: Ingreso[];
  proximosGastos: Gasto[];
}

export const getPanel = createServerFn({ method: 'POST' }).handler(async (): Promise<DatosPanel> => {
  await exigirSesion();
  const DB = db();
  const datos = await cargarDatos();
  const mes = hoyIso().slice(0, 7) + '%';

  const [recibido, pagado, caprichos, proxIng, proxGas] = await Promise.all([
    DB.prepare("SELECT COALESCE(SUM(monto),0) AS s FROM ingresos WHERE estado='recibido' AND fecha_prevista LIKE ?")
      .bind(mes)
      .first<{ s: number }>(),
    DB.prepare("SELECT COALESCE(SUM(monto),0) AS s FROM gastos WHERE estado='pagado' AND fecha_prevista LIKE ?")
      .bind(mes)
      .first<{ s: number }>(),
    DB.prepare("SELECT * FROM caprichos WHERE estado = 'pendiente' ORDER BY fecha_deseada").all<Capricho>(),
    DB.prepare("SELECT * FROM ingresos WHERE estado != 'recibido' ORDER BY fecha_prevista LIMIT 3").all<Ingreso>(),
    DB.prepare("SELECT * FROM gastos WHERE estado != 'pagado' ORDER BY fecha_prevista LIMIT 3").all<Gasto>(),
  ]);

  return {
    prevision: calcularPrevision(datos, 90),
    ahorroMes: (recibido?.s ?? 0) - (pagado?.s ?? 0),
    caprichosPendientes: caprichos.results ?? [],
    proximosIngresos: proxIng.results ?? [],
    proximosGastos: proxGas.results ?? [],
  };
});

export const getPrevision = createServerFn({ method: 'POST' }).handler(async (): Promise<Prevision> => {
  await exigirSesion();
  return calcularPrevision(await cargarDatos(), 90);
});

// ——— Ingresos ———

export const getIngresos = createServerFn({ method: 'POST' }).handler(async () => {
  await exigirSesion();
  const r = await db().prepare('SELECT * FROM ingresos ORDER BY fecha_prevista').all<Ingreso>();
  return r.results ?? [];
});

const esquemaIngreso = z.object({
  nombre: z.string().min(1),
  monto: z.number().positive(),
  fecha_prevista: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  estado: z.enum(['previsto', 'recibido', 'atrasado']),
  recurrencia: z.enum(['puntual', 'semanal', 'mensual', 'anual']),
  categoria: z.string(),
  comentario: z.string(),
});

export const crearIngreso = createServerFn({ method: 'POST' })
  .inputValidator(esquemaIngreso)
  .handler(async ({ data }) => {
    await exigirSesion();
    let categoria = data.categoria;
    if (!categoria) {
      const reglas = await db().prepare('SELECT * FROM reglas_categoria').all<ReglaCategoria>();
      categoria = sugerirCategoria(reglas.results ?? [], data.nombre, 'ingreso') ?? 'Otros';
    }
    await db()
      .prepare(
        'INSERT INTO ingresos (nombre, monto, fecha_prevista, estado, recurrencia, categoria, comentario) VALUES (?,?,?,?,?,?,?)',
      )
      .bind(data.nombre, data.monto, data.fecha_prevista, data.estado, data.recurrencia, categoria, data.comentario)
      .run();
    return { ok: true };
  });

export const cambiarEstadoIngreso = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number(), estado: z.enum(['previsto', 'recibido', 'atrasado']) }))
  .handler(async ({ data }) => {
    await exigirSesion();
    await db().prepare('UPDATE ingresos SET estado = ? WHERE id = ?').bind(data.estado, data.id).run();
    return { ok: true };
  });

export const eliminarIngreso = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number() }))
  .handler(async ({ data }) => {
    await exigirSesion();
    await db().prepare('DELETE FROM ingresos WHERE id = ?').bind(data.id).run();
    return { ok: true };
  });

// ——— Gastos ———

export const getGastos = createServerFn({ method: 'POST' }).handler(async () => {
  await exigirSesion();
  const r = await db().prepare('SELECT * FROM gastos ORDER BY fecha_prevista').all<Gasto>();
  return r.results ?? [];
});

const esquemaGasto = z.object({
  nombre: z.string().min(1),
  monto: z.number().positive(),
  fecha_prevista: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  estado: z.enum(['previsto', 'pagado', 'atrasado']),
  recurrencia: z.enum(['puntual', 'semanal', 'mensual', 'anual']),
  categoria: z.string(),
  prioridad: z.enum(['indispensable', 'importante', 'opcional']),
  comentario: z.string(),
});

export const crearGasto = createServerFn({ method: 'POST' })
  .inputValidator(esquemaGasto)
  .handler(async ({ data }) => {
    await exigirSesion();
    let categoria = data.categoria;
    if (!categoria) {
      const reglas = await db().prepare('SELECT * FROM reglas_categoria').all<ReglaCategoria>();
      categoria = sugerirCategoria(reglas.results ?? [], data.nombre, 'gasto') ?? 'Otros';
    }
    await db()
      .prepare(
        'INSERT INTO gastos (nombre, monto, fecha_prevista, estado, recurrencia, categoria, prioridad, comentario) VALUES (?,?,?,?,?,?,?,?)',
      )
      .bind(
        data.nombre,
        data.monto,
        data.fecha_prevista,
        data.estado,
        data.recurrencia,
        categoria,
        data.prioridad,
        data.comentario,
      )
      .run();
    return { ok: true };
  });

export const cambiarEstadoGasto = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number(), estado: z.enum(['previsto', 'pagado', 'atrasado']) }))
  .handler(async ({ data }) => {
    await exigirSesion();
    await db().prepare('UPDATE gastos SET estado = ? WHERE id = ?').bind(data.estado, data.id).run();
    return { ok: true };
  });

export const eliminarGasto = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number() }))
  .handler(async ({ data }) => {
    await exigirSesion();
    await db().prepare('DELETE FROM gastos WHERE id = ?').bind(data.id).run();
    return { ok: true };
  });

// ——— Cargas fijas ———

export const getCargasFijas = createServerFn({ method: 'POST' }).handler(async () => {
  await exigirSesion();
  const r = await db().prepare('SELECT * FROM cargas_fijas ORDER BY activa DESC, dia_cargo').all<CargaFija>();
  return r.results ?? [];
});

export const crearCargaFija = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      nombre: z.string().min(1),
      monto: z.number().positive(),
      dia_cargo: z.number().int().min(1).max(28),
      recurrencia: z.enum(['semanal', 'mensual', 'anual']),
      medio_pago: z.string(),
      categoria: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    await exigirSesion();
    let categoria = data.categoria;
    if (!categoria) {
      const reglas = await db().prepare('SELECT * FROM reglas_categoria').all<ReglaCategoria>();
      categoria = sugerirCategoria(reglas.results ?? [], data.nombre, 'gasto') ?? 'Otros';
    }
    await db()
      .prepare(
        'INSERT INTO cargas_fijas (nombre, monto, dia_cargo, recurrencia, medio_pago, categoria, activa) VALUES (?,?,?,?,?,?,1)',
      )
      .bind(data.nombre, data.monto, data.dia_cargo, data.recurrencia, data.medio_pago, categoria)
      .run();
    return { ok: true };
  });

export const alternarCargaFija = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number() }))
  .handler(async ({ data }) => {
    await exigirSesion();
    await db().prepare('UPDATE cargas_fijas SET activa = 1 - activa WHERE id = ?').bind(data.id).run();
    return { ok: true };
  });

export const eliminarCargaFija = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number() }))
  .handler(async ({ data }) => {
    await exigirSesion();
    await db().prepare('DELETE FROM cargas_fijas WHERE id = ?').bind(data.id).run();
    return { ok: true };
  });

// ——— Caprichos ———

export interface CaprichosConAnalisis {
  analisis: AnalisisCapricho[];
  historial: Capricho[];
}

export const getCaprichos = createServerFn({ method: 'POST' }).handler(
  async (): Promise<CaprichosConAnalisis> => {
    await exigirSesion();
    const DB = db();
    const [todos, datos, margen] = await Promise.all([
      DB.prepare(
        "SELECT * FROM caprichos ORDER BY CASE estado WHEN 'pendiente' THEN 0 ELSE 1 END, fecha_deseada",
      ).all<Capricho>(),
      cargarDatos(),
      leerAjuste('margen_seguridad', '1000'),
    ]);
    const lista = todos.results ?? [];
    return {
      analisis: lista
        .filter((c) => c.estado === 'pendiente')
        .map((c) => analizarCapricho(c, datos, parseFloat(margen))),
      historial: lista.filter((c) => c.estado !== 'pendiente'),
    };
  },
);

export const crearCapricho = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      nombre: z.string().min(1),
      monto: z.number().positive(),
      fecha_deseada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      prioridad_emocional: z.enum(['baja', 'media', 'alta']),
      utilidad_real: z.enum(['baja', 'media', 'alta']),
      puede_esperar: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    await exigirSesion();
    await db()
      .prepare(
        "INSERT INTO caprichos (nombre, monto, fecha_deseada, prioridad_emocional, utilidad_real, puede_esperar, estado) VALUES (?,?,?,?,?,?,'pendiente')",
      )
      .bind(data.nombre, data.monto, data.fecha_deseada, data.prioridad_emocional, data.utilidad_real, data.puede_esperar ? 1 : 0)
      .run();
    return { ok: true };
  });

export const cambiarEstadoCapricho = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number(), estado: z.enum(['pendiente', 'comprado', 'descartado']) }))
  .handler(async ({ data }) => {
    await exigirSesion();
    const DB = db();
    if (data.estado === 'comprado') {
      const cap = await DB.prepare('SELECT * FROM caprichos WHERE id = ?').bind(data.id).first<Capricho>();
      if (cap) {
        await DB.prepare(
          "INSERT INTO gastos (nombre, monto, fecha_prevista, estado, recurrencia, categoria, prioridad, comentario) VALUES (?,?,?,'pagado','puntual','Caprichos','opcional','Capricho comprado 💕')",
        )
          .bind(cap.nombre, cap.monto, hoyIso())
          .run();
        const saldo = parseFloat(await leerAjuste('saldo_actual', '0'));
        await guardarAjuste('saldo_actual', String(saldo - cap.monto));
      }
    }
    await DB.prepare('UPDATE caprichos SET estado = ? WHERE id = ?').bind(data.estado, data.id).run();
    return { ok: true };
  });

export const eliminarCapricho = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number() }))
  .handler(async ({ data }) => {
    await exigirSesion();
    await db().prepare('DELETE FROM caprichos WHERE id = ?').bind(data.id).run();
    return { ok: true };
  });

// ——— Ajustes + reglas ———

export const getAjustes = createServerFn({ method: 'POST' }).handler(async () => {
  await exigirSesion();
  const [saldo, margen, reglas] = await Promise.all([
    leerAjuste('saldo_actual', '0'),
    leerAjuste('margen_seguridad', '1000'),
    db().prepare('SELECT * FROM reglas_categoria ORDER BY tipo, palabra_clave').all<ReglaCategoria>(),
  ]);
  return {
    saldoActual: parseFloat(saldo),
    margenSeguridad: parseFloat(margen),
    reglas: reglas.results ?? [],
  };
});

export const guardarAjustes = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      saldo_actual: z.number(),
      margen_seguridad: z.number().min(0),
      codigo_acceso: z.string().trim().min(4).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await exigirSesion();
    await guardarAjuste('saldo_actual', String(data.saldo_actual));
    await guardarAjuste('margen_seguridad', String(data.margen_seguridad));
    if (data.codigo_acceso) {
      await guardarAjuste('codigo_acceso', data.codigo_acceso.toUpperCase());
      setCookie(COOKIE_SESION, data.codigo_acceso.toUpperCase(), {
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        path: '/',
        maxAge: 60 * 60 * 24 * 180,
      });
    }
    return { ok: true };
  });

export const crearRegla = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      palabra_clave: z.string().min(1),
      categoria: z.string().min(1),
      tipo: z.enum(['ingreso', 'gasto']),
    }),
  )
  .handler(async ({ data }) => {
    await exigirSesion();
    await db()
      .prepare('INSERT INTO reglas_categoria (palabra_clave, categoria, tipo) VALUES (?,?,?)')
      .bind(data.palabra_clave.toLowerCase(), data.categoria, data.tipo)
      .run();
    return { ok: true };
  });

export const eliminarRegla = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number() }))
  .handler(async ({ data }) => {
    await exigirSesion();
    await db().prepare('DELETE FROM reglas_categoria WHERE id = ?').bind(data.id).run();
    return { ok: true };
  });

// ——— Import CSV ———

export const importarCsv = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ contenido: z.string().min(1) }))
  .handler(async ({ data }) => {
    await exigirSesion();
    const DB = db();
    const reglas = await DB.prepare('SELECT * FROM reglas_categoria').all<ReglaCategoria>();
    const lineas = parsearCsvBancario(data.contenido, reglas.results ?? []);

    const sentencias = lineas.map((l) =>
      l.tipo === 'credito'
        ? DB.prepare(
            "INSERT INTO ingresos (nombre, monto, fecha_prevista, estado, recurrencia, categoria, comentario) VALUES (?,?,?,'recibido','puntual',?,'Importado del banco')",
          ).bind(l.libelle, l.monto, l.fecha, l.categoria)
        : DB.prepare(
            "INSERT INTO gastos (nombre, monto, fecha_prevista, estado, recurrencia, categoria, prioridad, comentario) VALUES (?,?,?,'pagado','puntual',?,'importante','Importado del banco')",
          ).bind(l.libelle, l.monto, l.fecha, l.categoria),
    );
    if (sentencias.length > 0) await DB.batch(sentencias);
    return { ok: true, importadas: sentencias.length };
  });
