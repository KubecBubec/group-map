import { useCallback, useState } from "react";

const PULSE_MS = 280;

/** Krátky vizuálny pulz po klepnutí – vráti triedu a funkciu na spustenie. */
export function useTapPulse() {
  const [activeId, setActiveId] = useState<string | null>(null);

  const pulse = useCallback((id: string) => {
    setActiveId(id);
    window.setTimeout(() => setActiveId(null), PULSE_MS);
  }, []);

  const isPulsing = useCallback((id: string) => activeId === id, [activeId]);

  return { pulse, isPulsing };
}

export function tapClass(active: boolean, base = ""): string {
  return `${base}${active ? " is-tapped" : ""}`.trim();
}
