import type { LocationRow } from "./types";

/** Súlad s API: online = poloha mladšia ako 60 s (api/src/index.ts). */
export function isLocationFreshForRoute(
  loc: Pick<LocationRow, "status"> | null | undefined,
): boolean {
  return loc?.status === "online";
}

export function staleLocationRouteHint(isSelf: boolean): string {
  if (isSelf) {
    return "Tvoja poloha nie je aktuálna. Trasu zobrazíme, keď bude GPS online (do cca 1 minúty).";
  }
  return "Poloha nie je aktuálna – používateľ je neaktívny. Trasu k zrazu zobraziť nemožno.";
}
