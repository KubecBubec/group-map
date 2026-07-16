const GEO_CONSENT_KEY = "geoConsentGranted";

export type GeoPermissionState = "granted" | "denied" | "prompt" | "unsupported" | "query_failed";

export function hasGeoConsent(): boolean {
  return localStorage.getItem(GEO_CONSENT_KEY) === "1";
}

export function setGeoConsent(granted: boolean): void {
  if (granted) localStorage.setItem(GEO_CONSENT_KEY, "1");
  else localStorage.removeItem(GEO_CONSENT_KEY);
}

export function geoPermissionLabel(permission: GeoPermissionState, consented: boolean): string {
  switch (permission) {
    case "granted":
      return "Poloha je povolená – appka ju zdieľa so skupinou.";
    case "denied":
      return "Poloha je v prehliadači zamietnutá. Povoľ ju v nastaveniach zariadenia pre túto adresu.";
    case "prompt":
      return consented
        ? "Poloha bola v appke zapnutá – prehliadač ešte čaká na potvrdenie."
        : "Zdieľanie polohy ešte nie je zapnuté.";
    default:
      return "Stav povolenia polohy nie je dostupný v tomto prehliadači.";
  }
}
