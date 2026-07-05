import { getAjuste, getDb } from '@/lib/db';
import { guardarAjustes, crearRegla, eliminarRegla } from '@/lib/actions';
import { CATEGORIAS_GASTO, CATEGORIAS_INGRESO, type ReglaCategoria } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default function AjustesPage() {
  const saldo = getAjuste('saldo_actual', '0');
  const margen = getAjuste('margen_seguridad', '1000');
  const reglas = getDb()
    .prepare('SELECT * FROM reglas_categoria ORDER BY tipo, palabra_clave')
    .all() as ReglaCategoria[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="titulo-pagina">Ajustes ⚙️</h1>
        <p className="text-sm text-tinta/60">Tu app, tus reglas, reina 👑</p>
      </header>

      {/* Saldo y margen */}
      <form action={guardarAjustes} className="tarjeta grid gap-3 md:grid-cols-3">
        <div>
          <label className="etiqueta" htmlFor="saldo_actual">Saldo actual (€)</label>
          <input
            className="campo" id="saldo_actual" name="saldo_actual"
            type="number" step="0.01" defaultValue={saldo} required
          />
        </div>
        <div>
          <label className="etiqueta" htmlFor="margen_seguridad">Colchón de seguridad (€)</label>
          <input
            className="campo" id="margen_seguridad" name="margen_seguridad"
            type="number" step="0.01" min="0" defaultValue={margen} required
          />
          <p className="mt-1 text-[11px] text-tinta/50">
            Saldo mínimo que Cleo protege al evaluar tus caprichos 💕
          </p>
        </div>
        <div className="flex items-end">
          <button className="boton-brillante w-full" type="submit">💾 Guardar</button>
        </div>
      </form>

      {/* Reglas de clasificación automática */}
      <section className="tarjeta space-y-4">
        <div>
          <h2 className="font-display text-base font-bold">Clasificación automática 🪄</h2>
          <p className="text-xs text-tinta/60">
            Si el nombre de un movimiento contiene la palabra clave, Cleo le asigna la categoría. Ej.: «urssaf» →
            Cargas sociales, «doctolib» → Suscripciones.
          </p>
        </div>

        <form action={crearRegla} className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="etiqueta" htmlFor="palabra_clave">Palabra clave</label>
            <input className="campo" id="palabra_clave" name="palabra_clave" placeholder="ej.: netflix" required />
          </div>
          <div>
            <label className="etiqueta" htmlFor="tipo">Tipo</label>
            <select className="campo" id="tipo" name="tipo" defaultValue="gasto">
              <option value="gasto">Gasto</option>
              <option value="ingreso">Ingreso</option>
            </select>
          </div>
          <div>
            <label className="etiqueta" htmlFor="categoria">Categoría</label>
            <select className="campo" id="categoria" name="categoria" required>
              <optgroup label="Gasto">
                {['Cargas sociales', 'Suscripciones', 'Seguro', ...CATEGORIAS_GASTO].map((c) => (
                  <option key={`g-${c}`} value={c}>{c}</option>
                ))}
              </optgroup>
              <optgroup label="Ingreso">
                {CATEGORIAS_INGRESO.map((c) => (
                  <option key={`i-${c}`} value={c}>{c}</option>
                ))}
              </optgroup>
            </select>
          </div>
          <div className="flex items-end">
            <button className="boton-dorado w-full" type="submit">＋ Añadir regla</button>
          </div>
        </form>

        <div className="grid gap-2 md:grid-cols-2">
          {reglas.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-2xl border border-barbie-100 bg-white/60 px-3 py-2 text-sm">
              <span className={`chip ${r.tipo === 'ingreso' ? 'border border-emerald-200 bg-emerald-50 text-ingreso' : 'border border-red-200 bg-red-50 text-gasto'}`}>
                {r.tipo}
              </span>
              <span className="min-w-0 flex-1 truncate">
                «{r.palabra_clave}» → <b>{r.categoria}</b>
              </span>
              <form action={eliminarRegla.bind(null, r.id)}>
                <button className="boton-suave !text-gasto" title="Eliminar regla">🗑</button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <p className="text-center text-xs text-barbie-300">CleoDinero ✨ — hecha con 💕 para que ahorrar sea un placer</p>
    </div>
  );
}
