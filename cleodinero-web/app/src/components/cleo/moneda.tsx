import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { euros } from '../../lib/cleo/motor';
import { getTasaCop } from '../../lib/api/cleo.functions';

/**
 * Doble moneda EUR → COP: él envía en euros, ella recibe en pesos colombianos.
 * La tasa se obtiene del servidor (cacheada 6 h en la base) y se refresca sola.
 */
const TasaContext = createContext<number | null>(null);

export function ProveedorTasa({ children }: { children: ReactNode }) {
  const [tasa, setTasa] = useState<number | null>(null);

  useEffect(() => {
    let activo = true;
    const cargar = () =>
      getTasaCop()
        .then((r: { tasa: number }) => {
          if (activo && r.tasa > 0) setTasa(r.tasa);
        })
        .catch(() => {});
    void cargar();
    const intervalo = setInterval(cargar, 60 * 60 * 1000);
    return () => {
      activo = false;
      clearInterval(intervalo);
    };
  }, []);

  return <TasaContext.Provider value={tasa}>{children}</TasaContext.Provider>;
}

export function useTasa(): number | null {
  return useContext(TasaContext);
}

export function cop(n: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n) + ' COP';
}

/**
 * Muestra un monto en euros con su equivalente en pesos debajo (columna) o
 * al lado entre paréntesis (inline). El color se hereda del contenedor.
 */
export function Doble({
  n,
  signo = '',
  inline = false,
  className = '',
}: {
  n: number;
  signo?: string;
  inline?: boolean;
  className?: string;
}) {
  const tasa = useTasa();

  if (inline) {
    return (
      <span className={className}>
        {signo}
        {euros(n)}
        {tasa != null && <span className="opacity-70"> (≈ {cop(n * tasa)})</span>}
      </span>
    );
  }

  return (
    <span className={`inline-flex flex-col ${className}`}>
      <span>
        {signo}
        {euros(n)}
      </span>
      {tasa != null && (
        <span className="text-[10px] font-medium leading-tight opacity-70">
          ≈ {signo}
          {cop(n * tasa)}
        </span>
      )}
    </span>
  );
}
