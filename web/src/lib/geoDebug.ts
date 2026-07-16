import { isPrivateHostname } from "./network";

export type GeoLogLevel = "info" | "warn" | "error";

export interface GeoLogEntry {
  ts: string;
  level: GeoLogLevel;
  event: string;
  detail?: string;
}

export interface GeoDiagnostics {
  secureContext: boolean;
  protocol: string;
  hostname: string;
  isLanHttp: boolean;
  geolocationApi: boolean;
  permission: string;
  isIOS: boolean;
  isStandalonePwa: boolean;
  myPosKnown: boolean;
  lastError: string | null;
}

const MAX_LOGS = 80;
const logs: GeoLogEntry[] = [];

function ts() {
  return new Date().toISOString().slice(11, 23);
}

export function geoLog(event: string, detail?: unknown, level: GeoLogLevel = "info") {
  const detailStr =
    detail === undefined
      ? undefined
      : typeof detail === "string"
        ? detail
        : JSON.stringify(detail);
  const entry: GeoLogEntry = { ts: ts(), level, event, detail: detailStr };
  logs.unshift(entry);
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  const prefix = `[geo ${entry.ts}] ${event}`;
  if (level === "error") console.error(prefix, detail ?? "");
  else if (level === "warn") console.warn(prefix, detail ?? "");
  else console.log(prefix, detail ?? "");
  window.dispatchEvent(new CustomEvent("geo-log", { detail: entry }));
}

export function getGeoLogs(): GeoLogEntry[] {
  return [...logs];
}

export function getLastGeoLog(prefix: string, level?: GeoLogLevel): GeoLogEntry | undefined {
  return logs.find((l) => l.event.startsWith(prefix) && (level === undefined || l.level === level));
}

export function geolocationErrorLabel(code: number): string {
  switch (code) {
    case 1:
      return "PERMISSION_DENIED";
    case 2:
      return "POSITION_UNAVAILABLE";
    case 3:
      return "TIMEOUT";
    default:
      return `UNKNOWN_${code}`;
  }
}

export async function readGeoPermission(): Promise<string> {
  if (!navigator.permissions?.query) return "unsupported";
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state;
  } catch {
    return "query_failed";
  }
}

export async function collectGeoDiagnostics(myPosKnown: boolean): Promise<GeoDiagnostics> {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return {
    secureContext: window.isSecureContext,
    protocol: window.location.protocol,
    hostname: window.location.hostname,
    isLanHttp: window.location.protocol === "http:" && isPrivateHostname(),
    geolocationApi: Boolean(navigator.geolocation),
    permission: await readGeoPermission(),
    isIOS,
    isStandalonePwa: window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone)),
    myPosKnown,
    lastError: logs.find((l) => l.level === "error")?.detail ?? null,
  };
}

export function logGeoEnvironment(myPosKnown: boolean) {
  void collectGeoDiagnostics(myPosKnown).then((d) => {
    geoLog("environment", d);
    if (d.isLanHttp) {
      geoLog(
        "blocked_lan_http",
        "iOS/Safari blokuje geolokáciu na http://LAN-IP. Potrebné HTTPS alebo localhost.",
        "warn",
      );
    }
    if (d.isIOS && !d.secureContext) {
      geoLog("blocked_insecure_context", "Geolokácia vyžaduje secure context (HTTPS).", "warn");
    }
  });
}

export function getCurrentPositionLogged(
  reason: string,
  options?: PositionOptions,
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      const msg = "navigator.geolocation nie je dostupné";
      geoLog(reason, msg, "error");
      reject(new Error(msg));
      return;
    }
    geoLog(`${reason}:request`, options ?? { enableHighAccuracy: true });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        geoLog(`${reason}:success`, {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        resolve(pos);
      },
      (err) => {
        geoLog(
          `${reason}:error`,
          { code: err.code, label: geolocationErrorLabel(err.code), message: err.message },
          "error",
        );
        reject(err);
      },
      options ?? { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
  });
}
