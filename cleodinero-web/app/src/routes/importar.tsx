import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { useState, type FormEvent, type ChangeEvent } from 'react';

import { Shell } from '../components/cleo/Shell';
import { importarCsv, sesionValida } from '../lib/api/cleo.functions';

export const Route = createFileRoute('/importar')({
  beforeLoad: async () => {
    const { ok } = await sesionValida();
    if (!ok) throw redirect({ to: '/acceso' });
  },
  head: () => ({ meta: [{ title: 'CleoDinero ✨ — Importar del banco' }] }),
  component: ImportarPage,
});

const ejemplo = `Fecha;Libellé;Monto;Tipo
05/07/2026;URSSAF;450,00;debito
06/07/2026;Doctolib;129,00;debito
08/07/2026;Reembolso mutua;89,50;credito
10/07/2026;Ingresos boutique;1200,00;credito`;

function ImportarPage() {
  const router = useRouter();
  const [contenido, setContenido] = useState('');
  const [resultado, setResultado] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const leerArchivo = (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () => setContenido(String(lector.result ?? ''));
    lector.readAsText(archivo);
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!contenido.trim()) return;
    setCargando(true);
    const r = await importarCsv({ data: { contenido } });
    setCargando(false);
    setResultado(
      r.importadas > 0
        ? `¡${r.importadas} movimiento(s) importado(s) y clasificado(s)! ✨`
        : 'No se encontró ninguna línea válida en el CSV 🤔 Revisa el formato.',
    );
    setContenido('');
    void router.invalidate();
  };

  return (
    <Shell>
      <div className="space-y-6">
        <header>
          <h1 className="titulo-pagina">Importar del banco 🏦</h1>
          <p className="text-sm text-tinta/60">
            Pega o sube tu CSV bancario y Cleo clasifica cada línea automáticamente ✨
          </p>
        </header>

        <form onSubmit={enviar} className="tarjeta space-y-4">
          <div>
            <label className="etiqueta" htmlFor="archivo">Archivo CSV</label>
            <input
              className="campo file:mr-3 file:rounded-full file:border-0 file:bg-barbie-100 file:px-4 file:py-1.5 file:text-xs file:font-bold file:text-barbie-700"
              id="archivo"
              type="file"
              accept=".csv,text/csv"
              onChange={leerArchivo}
            />
          </div>
          <div>
            <label className="etiqueta" htmlFor="contenido">…o pega el contenido aquí</label>
            <textarea
              className="campo min-h-[180px] font-mono text-xs"
              id="contenido"
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              placeholder={ejemplo}
            />
          </div>
          <div className="rounded-2xl bg-barbie-50/70 p-4 text-xs text-tinta/70">
            <p className="mb-1 font-display font-bold text-barbie-700">Formato esperado 💡</p>
            <p>
              Columnas <b>Fecha</b> (dd/mm/aaaa o aaaa-mm-dd), <b>Libellé</b>, <b>Monto</b> (coma o punto decimal) y{' '}
              <b>Tipo</b> (débito/crédito, opcional — si falta, se usa el signo del monto). Separador: punto y coma o
              coma.
            </p>
            <p className="mt-2">
              Los créditos se registran como <b>ingresos recibidos</b> y los débitos como <b>gastos pagados</b>, con
              la categoría sugerida por tus reglas (editables en Ajustes).
            </p>
          </div>
          {resultado && (
            <p className="rounded-2xl bg-emerald-50 p-3 text-center text-sm font-semibold text-ingreso">
              {resultado}
            </p>
          )}
          <button className="boton-brillante" type="submit" disabled={cargando || !contenido.trim()}>
            {cargando ? 'Importando…' : '✨ Importar y clasificar'}
          </button>
        </form>
      </div>
    </Shell>
  );
}
