import type { LocationRow } from "./types";

/** Online na mape = poloha mladšia ako 60 s (api/src/index.ts). Trasa smie ísť aj zo staršej. */
export const ROUTE_LOCATION_MAX_AGE_MS = 45 * 60 * 1000; // 45 minút

export function locationAgeMs(loc: Pick<LocationRow, "updatedAt"> | null | undefined): number | null {
  if (!loc?.updatedAt) return null;
  return Date.now() - new Date(loc.updatedAt).getTime();
}

/** Máme dostatočne čerstvú polohu na výpočet trasy (aj last_known). */
export function canShowRouteForLocation(
  loc: Pick<LocationRow, "updatedAt" | "latitude" | "longitude"> | null | undefined,
): boolean {
  if (!loc) return false;
  if (!Number.isFinite(loc.latitude) || !Number.isFinite(loc.longitude)) return false;
  const age = locationAgeMs(loc);
  if (age == null) return false;
  return age < ROUTE_LOCATION_MAX_AGE_MS;
}

/** True = GPS práve živé (zelený online). False = last_known / staršie. */
export function isLocationLive(loc: Pick<LocationRow, "status"> | null | undefined): boolean {
  return loc?.status === "online";
}

/** @deprecated použi canShowRouteForLocation – trasa už nie je viazaná len na online. */
export function isLocationFreshForRoute(
  loc: Pick<LocationRow, "updatedAt" | "latitude" | "longitude" | "status"> | null | undefined,
): boolean {
  return canShowRouteForLocation(loc);
}

export function staleLocationRouteHint(isSelf: boolean): string {
  if (isSelf) {
    return "Tvoja poloha je staršia – trasa pôjde podľa poslednej známej polohy.";
  }
  return "Poloha nie je živá – trasa pôjde podľa poslednej známej polohy (môže byť neaktuálna).";
}

/** Člen nemá appku aktívnu – vidíme len poslednú známu polohu. */
export function stalePeerLocationWakeHint(options?: { routeShown?: boolean }): string {
  const base =
    "Vidíš poslednú známu polohu. Aktuálne GPS zdieľa len ten, kto má appku otvorenú. Pingni ho – nech si ju otvorí.";
  if (options?.routeShown) {
    return `${base} Trasa k zrazu ide podľa tejto polohy.`;
  }
  return base;
}

export function noRouteLocationHint(isSelf: boolean): string {
  if (isSelf) {
    return "Nemáme tvoju polohu (alebo je staršia ako 45 min). Zapni GPS a skús znova.";
  }
  return "Nemáme polohu tohto člena (alebo je staršia ako 45 min). Trasu k zrazu zobraziť nemožno.";
}
