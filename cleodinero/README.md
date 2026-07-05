# CleoDinero ✨

**Tu dinero, tu brillo 💕** — App de gestión de finanzas personales/profesionales, girly y premium (rosa Barbie + dorado), 100 % en español, mobile-first.

Sigue tus entradas de dinero, tus salidas, tus gastos fijos, tus deudas y tus caprichos — y sobre todo **anticipa tu saldo futuro antes de gastar**.

## Lanzar el proyecto en local

```bash
cd cleodinero
npm install
npm run dev
```

Abre <http://localhost:3000>. La base SQLite se crea sola en `data/cleodinero.db` con datos de ejemplo (saldo 10 000 €, crédito casa 7 000 €/mes, impuestos 3 000 €/mes, salarios 12 000 €/mes, ingresos 25 000 €/mes, gastos personales 4 000 €/mes y un capricho: viaje de 3 500 €).

Para producción: `npm run build && npm start`.

## Stack

- **Next.js 15** (App Router, Server Components + Server Actions)
- **TypeScript**
- **TailwindCSS** (tema rosa Barbie / dorado personalizado)
- **SQLite** vía `better-sqlite3` (sin servidor externo, cero configuración)

## Arquitectura

```
cleodinero/
├── data/cleodinero.db          ← base SQLite (autocreada + seed)
├── src/
│   ├── app/
│   │   ├── page.tsx            ← Panel (dashboard money girl boss)
│   │   ├── ingresos/           ← Entradas de dinero
│   │   ├── gastos/             ← Salidas de dinero
│   │   ├── gastos-fijos/       ← Cargas fijas (activas/inactivas)
│   │   ├── caprichos/          ← Módulo "capricho antes de comprar"
│   │   ├── prevision/          ← Timeline día a día + gráfico
│   │   ├── importar/           ← Import CSV bancario
│   │   ├── ajustes/            ← Saldo, colchón, reglas de clasificación
│   │   └── layout.tsx          ← Layout global + navegación
│   ├── components/
│   │   ├── Nav.tsx             ← Sidebar escritorio + barra inferior móvil
│   │   ├── BalanceChart.tsx    ← Gráfico SVG rosa/dorado con tooltip
│   │   └── ui.tsx              ← Chips de estado / riesgo / prioridad
│   └── lib/
│       ├── db.ts               ← Conexión SQLite + esquema + seed
│       ├── types.ts            ← Modelos de datos
│       ├── forecast.ts         ← Motor de previsión día a día + alertas
│       ├── risk.ts             ← Scoring de riesgo de los caprichos
│       ├── categorize.ts       ← Clasificación automática + parser CSV
│       ├── actions.ts          ← Server Actions (CRUD completo)
│       └── format.ts           ← Formato € y fechas es-ES
```

## Modelos de datos (SQLite)

| Tabla | Campos clave |
|---|---|
| `ajustes` | `saldo_actual`, `margen_seguridad` (colchón) |
| `ingresos` | nombre, monto, fecha_prevista, estado (previsto/recibido/atrasado), recurrencia (puntual/semanal/mensual/anual), categoría, comentario |
| `gastos` | nombre, monto, fecha_prevista, estado (previsto/pagado/atrasado), recurrencia, categoría, prioridad (indispensable/importante/opcional), comentario |
| `cargas_fijas` | nombre, monto, día de cargo, recurrencia, medio de pago, categoría, activa |
| `caprichos` | nombre, monto, fecha deseada, prioridad emocional, utilidad real, puede esperar, estado |
| `reglas_categoria` | palabra clave → categoría (por tipo ingreso/gasto), editables en Ajustes |

## Cálculo de previsión

`src/lib/forecast.ts` proyecta el saldo **día a día** hasta 90 días:

1. Parte del saldo actual.
2. Expande cada ingreso/gasto recurrente en todas sus ocurrencias (semanal, mensual, anual).
3. Añade las cargas fijas activas según su día de cargo.
4. Añade los caprichos pendientes en su fecha deseada.
5. Produce una timeline `{fecha, saldo, ingresos, gastos, eventos}` y los saldos a 7/30/60/90 días.

Las **alertas** se generan sobre esa timeline: descubierto probable (saldo < 0), gran gasto próximo (≥ 2 000 € en 14 días), pagos atrasados y cargas fijas ausentes.

## Scoring de riesgo de caprichos

`src/lib/risk.ts` simula la compra **ahora / en 7 días / en 30 días** sobre la previsión (sin el capricho), toma el **saldo mínimo** proyectado de cada escenario y lo compara con el colchón de seguridad:

- saldo mínimo ≥ colchón → **verde** · «Puedes comprarlo sin peligro»
- saldo mínimo ≥ 0 → **naranja** · «Espera 7/30 días»
- saldo mínimo < 0 → **rojo** · «A evitar por ahora»

También calcula el impacto del capricho como % de las cargas fijas mensuales. Al pulsar «Lo compré», el capricho se convierte en gasto pagado y se descuenta del saldo.

## Import CSV bancario

Formato: `Fecha;Libellé;Monto;Tipo` (separador `;` o `,`, fechas `dd/mm/aaaa` o `aaaa-mm-dd`, montos con coma o punto). Los créditos entran como ingresos recibidos, los débitos como gastos pagados, clasificados por las reglas automáticas.

## Código de colores

- 💚 Verde `#12894F` — entradas / positivo / seguro
- ❤️ Rojo `#D92D20` — salidas / riesgo
- 🧡 Naranja `#E8730C` — atención (siempre con icono + texto)
- ✨ Dorado `#C9A227` — ahorro / premium
- 💖 Rosa Barbie `#E6318F` — identidad CleoDinero
