import { importarCsv } from '@/lib/actions';

export const dynamic = 'force-dynamic';

const ejemplo = `Fecha;Libellé;Monto;Tipo
05/07/2026;URSSAF;450,00;debito
06/07/2026;Doctolib;129,00;debito
08/07/2026;Reembolso mutua;89,50;credito
10/07/2026;Ingresos boutique;1200,00;credito`;

export default function ImportarPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="titulo-pagina">Importar del banco 🏦</h1>
        <p className="text-sm text-tinta/60">
          Pega o sube tu CSV bancario y Cleo clasifica cada línea automáticamente ✨
        </p>
      </header>

      <form action={importarCsv} className="tarjeta space-y-4">
        <div>
          <label className="etiqueta" htmlFor="archivo">Archivo CSV</label>
          <input
            className="campo file:mr-3 file:rounded-full file:border-0 file:bg-barbie-100 file:px-4 file:py-1.5 file:text-xs file:font-bold file:text-barbie-700"
            id="archivo"
            name="archivo"
            type="file"
            accept=".csv,text/csv"
          />
        </div>
        <div>
          <label className="etiqueta" htmlFor="contenido">…o pega el contenido aquí</label>
          <textarea
            className="campo min-h-[180px] font-mono text-xs"
            id="contenido"
            name="contenido"
            placeholder={ejemplo}
          />
        </div>
        <div className="rounded-2xl bg-barbie-50/70 p-4 text-xs text-tinta/70">
          <p className="mb-1 font-display font-bold text-barbie-700">Formato esperado 💡</p>
          <p>
            Columnas <b>Fecha</b> (dd/mm/aaaa o aaaa-mm-dd), <b>Libellé</b>, <b>Monto</b> (coma o punto decimal) y{' '}
            <b>Tipo</b> (débito/crédito, opcional — si falta, se usa el signo del monto). Separador: punto y coma o coma.
          </p>
          <p className="mt-2">
            Los créditos se registran como <b>ingresos recibidos</b> y los débitos como <b>gastos pagados</b>, con la
            categoría sugerida por tus reglas (editables en Ajustes).
          </p>
        </div>
        <button className="boton-brillante" type="submit">✨ Importar y clasificar</button>
      </form>
    </div>
  );
}
