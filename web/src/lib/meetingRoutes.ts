import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api";
import { formatDistance, formatWalkingDuration } from "./geo";
import { logRouteError, logRouteRequest, logRouteSuccess, routeLog } from "./routeDebug";
import type { Group, LatLng, LocationRow, MeetingPoint, SearchUser } from "./types";

export type MeetingRouteLine = {
  userId: string;
  path: LatLng[];
  durationSeconds: number | null;
  distanceMeters: number | null;
  loading: boolean;
  error: string | null;
};

type RouteResult = {
  path: LatLng[];
  durationSeconds: number;
  distanceMeters: number;
};

function routeCacheKey(origin: LatLng, dest: LatLng): string {
  return `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}->${dest.lat.toFixed(5)},${dest.lng.toFixed(5)}`;
}

const routeCache = new Map<string, RouteResult>();

const ROUTE_ERROR_LABEL: Record<string, string> = {
  routes_disabled: "Presné trasy sú vypnuté v nastaveniach (Viac → Presné ETA).",
  maps_key_missing: "Chýba Google Maps API kľúč na serveri.",
  directions_failed: "Directions API zlyhala – skontroluj, či je zapnutá v Google Cloud.",
  REQUEST_DENIED:
    "Directions API zamietnutá – v Google Cloud zapni Directions API a pridaj ju medzi povolené API pre kľúč (pozri README).",
  OVER_QUERY_LIMIT: "Prekročený limit Directions API.",
  ZERO_RESULTS: "Pre túto vzdialenosť sa nenašla chodníková trasa.",
  NOT_FOUND: "Nepodarilo sa nájsť trasu medzi týmito bodmi.",
};

export function formatRouteEta(line: MeetingRouteLine): string | null {
  if (line.loading) return null;
  if (line.error || line.durationSeconds == null) return null;
  return formatWalkingDuration(line.durationSeconds);
}

export function formatRouteDistanceLabel(line: MeetingRouteLine): string | null {
  if (line.loading) return null;
  if (line.error || line.distanceMeters == null) return null;
  return formatDistance(line.distanceMeters);
}

export function formatRouteSummary(line: MeetingRouteLine): string | null {
  if (line.loading) return "počítam trasu…";
  if (line.error || line.durationSeconds == null) return null;
  const time = formatWalkingDuration(line.durationSeconds);
  const dist = line.distanceMeters ? formatDistance(line.distanceMeters) : null;
  return dist ? `${time} chôdza · ${dist}` : `${time} chôdza`;
}

function parseRouteFetchError(err: unknown): string {
  if (!(err instanceof Error)) return "directions_failed";
  try {
    const body = JSON.parse(err.message) as { error?: string; detail?: string };
    return body.detail ?? body.error ?? err.message;
  } catch {
    return err.message;
  }
}

function routeErrorMessage(code: string): string {
  const key = code.split(":")[0]?.split(" ")[0] ?? code;
  return ROUTE_ERROR_LABEL[key] ?? `Trasa nedostupná (${code}).`;
}

function canUseClientDirections(): boolean {
  return typeof google !== "undefined" && Boolean(google.maps?.DirectionsService);
}

function shouldFallbackToClient(raw: string): boolean {
  const upper = raw.toUpperCase();
  return (
    upper.includes("REQUEST_DENIED") ||
    raw.includes("maps_key_missing") ||
    raw.includes("directions_failed") ||
    raw.startsWith("HTTP_")
  );
}

function parseDirectionsResult(result: google.maps.DirectionsResult): RouteResult {
  const route = result.routes[0];
  const leg = route?.legs?.[0];
  const path = route?.overview_path?.map((p) => ({ lat: p.lat(), lng: p.lng() })) ?? [];
  if (path.length < 2) throw new Error("EMPTY_ROUTE");
  return {
    path,
    durationSeconds: leg?.duration?.value ?? 0,
    distanceMeters: leg?.distance?.value ?? 0,
  };
}

async function fetchWalkingRoutePathClient(origin: LatLng, dest: LatLng): Promise<RouteResult> {
  const service = new google.maps.DirectionsService();
  const result = await new Promise<google.maps.DirectionsResult>((resolve, reject) => {
    service.route(
      {
        origin,
        destination: dest,
        travelMode: google.maps.TravelMode.WALKING,
      },
      (res, status) => {
        if (status === google.maps.DirectionsStatus.OK && res) resolve(res);
        else reject(new Error(status));
      },
    );
  });

  const parsed = parseDirectionsResult(result);

  apiFetch("/usage/report", {
    method: "POST",
    body: JSON.stringify({ sku: "routes" }),
  }).catch(() => {});

  return parsed;
}

async function fetchWalkingRoute(
  origin: LatLng,
  dest: LatLng,
  meta: { userId: string; meetingId: string },
): Promise<RouteResult> {
  const key = routeCacheKey(origin, dest);
  const cached = routeCache.get(key);
  if (cached) {
    logRouteRequest({ ...meta, origin, dest, cached: true });
    logRouteSuccess({ userId: meta.userId, meetingId: meta.meetingId, pointCount: cached.path.length, cached: true });
    return cached;
  }

  logRouteRequest({ ...meta, origin, dest, cached: false });

  const params = new URLSearchParams({
    originLat: String(origin.lat),
    originLng: String(origin.lng),
    destLat: String(dest.lat),
    destLng: String(dest.lng),
  });

  let result: RouteResult;
  try {
    result = await apiFetch<RouteResult>(`/routes/walking?${params}`);
  } catch (serverErr) {
    const raw = parseRouteFetchError(serverErr);
    if (shouldFallbackToClient(raw) && canUseClientDirections()) {
      routeLog("fallback_client", { reason: raw, userId: meta.userId }, "warn");
      result = await fetchWalkingRoutePathClient(origin, dest);
    } else {
      throw serverErr;
    }
  }

  if (!result.path?.length || result.path.length < 2) throw new Error("EMPTY_ROUTE");

  routeCache.set(key, result);
  logRouteSuccess({
    userId: meta.userId,
    meetingId: meta.meetingId,
    pointCount: result.path.length,
    cached: false,
  });
  return result;
}

export function useMeetingRoutePaths(
  activeMeeting: MeetingPoint | null,
  routeUserIds: string[],
  locations: LocationRow[],
  _users: SearchUser[],
  _groups: Group[],
): { routes: MeetingRouteLine[]; routeError: string | null } {
  const [routes, setRoutes] = useState<MeetingRouteLine[]>([]);
  const [routeError, setRouteError] = useState<string | null>(null);

  const routeOriginsKey = useMemo(() => {
    return routeUserIds
      .map((userId) => {
        const loc = locations.find((l) => l.userId === userId);
        if (!loc) return `${userId}:none`;
        return `${userId}:${loc.latitude.toFixed(5)},${loc.longitude.toFixed(5)}`;
      })
      .join("|");
  }, [routeUserIds, locations]);

  useEffect(() => {
    if (!activeMeeting || routeUserIds.length === 0) {
      setRoutes([]);
      setRouteError(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      // Caller (mapa) už rozhodol, koho trasu zobraziť – nefiltruj podľa targetIds
      // (tvoja navigácia k zrazu má fungovať aj keď zraz nie je „pre teba“).
      const pending = routeUserIds.filter((userId) =>
        locations.some((l) => l.userId === userId),
      );

      setRouteError(null);
      setRoutes(
        pending.map((userId) => ({
          userId,
          path: [],
          durationSeconds: null,
          distanceMeters: null,
          loading: true,
          error: null,
        })),
      );

      let firstError: string | null = null;

      for (const userId of pending) {
        const loc = locations.find((l) => l.userId === userId)!;
        const origin = { lat: loc.latitude, lng: loc.longitude };
        const dest = { lat: activeMeeting.latitude, lng: activeMeeting.longitude };

        try {
          const result = await fetchWalkingRoute(origin, dest, {
            userId,
            meetingId: activeMeeting.id,
          });
          if (cancelled) return;
          setRoutes((prev) =>
            prev.map((line) =>
              line.userId === userId
                ? {
                    userId,
                    path: result.path,
                    durationSeconds: result.durationSeconds,
                    distanceMeters: result.distanceMeters,
                    loading: false,
                    error: null,
                  }
                : line,
            ),
          );
        } catch (err) {
          if (cancelled) return;
          const raw = parseRouteFetchError(err);
          const message = routeErrorMessage(raw);
          logRouteError({
            userId,
            meetingId: activeMeeting.id,
            origin,
            dest,
            raw,
            message,
          });
          if (!firstError) firstError = message;
          setRoutes((prev) =>
            prev.map((line) =>
              line.userId === userId
                ? {
                    userId,
                    path: [],
                    durationSeconds: null,
                    distanceMeters: null,
                    loading: false,
                    error: message,
                  }
                : line,
            ),
          );
        }
      }

      if (!cancelled) setRouteError(firstError);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [
    activeMeeting?.id,
    activeMeeting?.latitude,
    activeMeeting?.longitude,
    routeUserIds.join(","),
    routeOriginsKey,
    // locations is covered via routeOriginsKey; keep meeting fields above
  ]);

  return { routes, routeError };
}
