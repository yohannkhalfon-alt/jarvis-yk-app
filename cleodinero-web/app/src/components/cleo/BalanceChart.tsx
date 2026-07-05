

import { useMemo, useRef, useState } from 'react';
import type { PuntoTimeline } from '../../lib/cleo/motor';

const W = 720;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };

function euros(n: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n);
}

function fechaCorta(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

/**
 * Gráfico de área del saldo previsto — una sola serie (el título la nombra),
 * con crosshair + tooltip al pasar el dedo/ratón y línea de cero si hay riesgo.
 */
export function BalanceChart({ timeline, titulo }: { timeline: PuntoTimeline[]; titulo?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { puntos, escalaY, minS, maxS, ticksY, ticksX, ceroY } = useMemo(() => {
    const saldos = timeline.map((p) => p.saldo);
    const minS = Math.min(0, ...saldos);
    const maxS = Math.max(...saldos);
    const rango = maxS - minS || 1;
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const escalaX = (i: number) => PAD.left + (i / Math.max(1, timeline.length - 1)) * plotW;
    const escalaY = (s: number) => PAD.top + (1 - (s - minS) / rango) * plotH;

    const puntos = timeline.map((p, i) => ({ x: escalaX(i), y: escalaY(p.saldo), ...p }));

    // 4 ticks de eje Y redondeados
    const paso = rango / 3;
    const ticksY = [0, 1, 2, 3].map((k) => Math.round((minS + k * paso) / 100) * 100);

    // ~5 etiquetas de fecha
    const cada = Math.max(1, Math.floor(timeline.length / 5));
    const ticksX = puntos.filter((_, i) => i % cada === 0 || i === timeline.length - 1);

    return { puntos, escalaY, minS, maxS, ticksY, ticksX, ceroY: escalaY(0) };
  }, [timeline]);

  if (timeline.length < 2) return null;

  const linea = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${linea} L${puntos[puntos.length - 1].x.toFixed(1)},${H - PAD.bottom} L${PAD.left},${H - PAD.bottom} Z`;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((x - PAD.left) / (W - PAD.left - PAD.right)) * (timeline.length - 1));
    setHover(Math.max(0, Math.min(timeline.length - 1, i)));
  };

  const h = hover !== null ? puntos[hover] : null;

  return (
    <div className="w-full">
      {titulo && <p className="mb-2 font-display text-sm font-bold text-tinta/80">{titulo}</p>}
      <div className="relative w-full overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[320px] touch-none select-none"
          role="img"
          aria-label={`Evolución del saldo previsto, de ${euros(minS)} a ${euros(maxS)}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="relleno-rosa" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E6318F" stopOpacity="0.25" />
              <stop offset="70%" stopColor="#C9A227" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#C9A227" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="linea-rosa-oro" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#E6318F" />
              <stop offset="100%" stopColor="#A87900" />
            </linearGradient>
          </defs>

          {/* Rejilla recesiva + eje Y */}
          {ticksY.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left} x2={W - PAD.right} y1={escalaY(t)} y2={escalaY(t)}
                stroke="#E6318F" strokeOpacity="0.10" strokeWidth="1"
              />
              <text x={PAD.left - 8} y={escalaY(t) + 4} textAnchor="end" fontSize="11" fill="#9A7A8C">
                {t >= 1000 || t <= -1000 ? `${Math.round(t / 1000)}k` : t}
              </text>
            </g>
          ))}

          {/* Línea de cero (riesgo) si el saldo puede ser negativo */}
          {minS < 0 && (
            <line
              x1={PAD.left} x2={W - PAD.right} y1={ceroY} y2={ceroY}
              stroke="#D92D20" strokeWidth="1.5" strokeDasharray="6 4"
            />
          )}

          {/* Área + línea */}
          <path d={area} fill="url(#relleno-rosa)" />
          <path d={linea} fill="none" stroke="url(#linea-rosa-oro)" strokeWidth="2.5" strokeLinejoin="round" />

          {/* Eje X */}
          {ticksX.map((p) => (
            <text key={p.fecha} x={p.x} y={H - 8} textAnchor="middle" fontSize="11" fill="#9A7A8C">
              {fechaCorta(p.fecha)}
            </text>
          ))}

          {/* Crosshair */}
          {h && (
            <g>
              <line x1={h.x} x2={h.x} y1={PAD.top} y2={H - PAD.bottom} stroke="#E6318F" strokeOpacity="0.35" strokeWidth="1" />
              <circle cx={h.x} cy={h.y} r="5" fill={h.saldo >= 0 ? '#E6318F' : '#D92D20'} stroke="#FFF5FA" strokeWidth="2" />
            </g>
          )}
        </svg>

        {/* Tooltip */}
        {h && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-2xl border border-barbie-100 bg-white/95 px-3 py-2 text-xs shadow-card backdrop-blur"
            style={{
              left: `min(max(${(h.x / W) * 100}%, 10%), 75%)`,
              transform: 'translateX(-50%)',
            }}
          >
            <p className="font-semibold text-tinta">{fechaCorta(h.fecha)}</p>
            <p className={`font-display font-bold ${h.saldo >= 0 ? 'text-ingreso' : 'text-gasto'}`}>
              {euros(h.saldo)}
            </p>
            {h.eventos.slice(0, 3).map((ev) => (
              <p key={ev} className={ev.startsWith('+') ? 'text-ingreso' : 'text-gasto'}>
                {ev}
              </p>
            ))}
            {h.eventos.length > 3 && <p className="text-tinta/50">+{h.eventos.length - 3} más…</p>}
          </div>
        )}
      </div>
    </div>
  );
}
