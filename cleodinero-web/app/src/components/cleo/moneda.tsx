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
 * Muestra un monto con el PESO COLOMBIANO como moneda principal y el euro
 * como referencia pequeña (columna) o entre paréntesis (inline). Los montos
 * se guardan en euros; la tasa convierte al vuelo. Mientras la tasa carga,
 * se muestra el euro para no dejar el hueco vacío.
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

  if (tasa == null) {
    return (
      <span className={className}>
        {signo}
        {euros(n)}
      </span>
    );
  }

  if (inline) {
    return (
      <span className={className}>
        {signo}
        {cop(n * tasa)}
        <span className="opacity-70"> (≈ {signo}{euros(n)})</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex flex-col ${className}`}>
      <span>
        {signo}
        {cop(n * tasa)}
      </span>
      <span className="text-[10px] font-medium leading-tight opacity-70">
        ≈ {signo}
        {euros(n)}
      </span>
    </span>
  );
}
