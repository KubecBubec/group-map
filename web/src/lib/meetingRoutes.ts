import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "./api";
import { distanceMeters, formatDistance, formatWalkingDuration } from "./geo";
import { logRouteError, logRouteRequest, logRouteSuccess, routeLog } from "./routeDebug";
import type { Group, LatLng, LocationRow, MeetingPoint, SearchUser } from "./types";

export type MeetingRouteLine = {
  userId: string;
  path: LatLng[];
  durationSeconds: number | null;
  distanceMeters: number | null;
  /** Prvý fetch – ešte nemáme čo zobraziť. */
  loading: boolean;
  /** Refresh na pozadí – stará trasa ostáva viditeľná. */
  refreshing: boolean;
  error: string | null;
};

type RouteResult = {
  path: LatLng[];
  durationSeconds: number;
  distanceMeters: number;
};

type LastFetchMeta = {
  origin: LatLng;
  fetchedAt: number;
  meetingId: string;
  destKey: string;
};

/** Debounce po poslednom GPS ticku pred kontrolou prahu. */
const ROUTE_DEBOUNCE_MS = 2_500;
const ROUTE_PEER_DEBOUNCE_MS = 4_000;
/** Min. interval medzi API volaniami (aj keď sa používateľ hýbe). */
const ROUTE_SELF_MIN_INTERVAL_MS = 45_000;
const ROUTE_PEER_MIN_INTERVAL_MS = 120_000;
/** Nový fetch, ak sa posunul aspoň o toľko metrov. */
const ROUTE_SELF_MOVE_M = 40;
const ROUTE_PEER_MOVE_M = 100;
/** Nový fetch aj bez veľkého posunu – aby ETA nezostaralo. */
const ROUTE_SELF_MAX_AGE_MS = 120_000;
const ROUTE_PEER_MAX_AGE_MS = 180_000;

function snapOriginForCache(origin: LatLng): LatLng {
  return {
    lat: Math.round(origin.lat * 1e4) / 1e4,
    lng: Math.round(origin.lng * 1e4) / 1e4,
  };
}

function routeCacheKey(origin: LatLng, dest: LatLng): string {
  const o = snapOriginForCache(origin);
  return `${o.lat.toFixed(4)},${o.lng.toFixed(4)}->${dest.lat.toFixed(5)},${dest.lng.toFixed(5)}`;
}

function destKey(dest: LatLng): string {
  return `${dest.lat.toFixed(5)},${dest.lng.toFixed(5)}`;
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
  if (line.loading && line.path.length < 2) return null;
  if (line.error || line.durationSeconds == null) return null;
  return formatWalkingDuration(line.durationSeconds);
}

export function formatRouteDistanceLabel(line: MeetingRouteLine): string | null {
  if (line.loading && line.path.length < 2) return null;
  if (line.error || line.distanceMeters == null) return null;
  return formatDistance(line.distanceMeters);
}

export function formatRouteSummary(line: MeetingRouteLine): string | null {
  if (line.loading && line.path.length < 2) return "počítam trasu…";
  if (line.refreshing && line.path.length >= 2) {
    const summary = formatRouteEta(line);
    return summary ? `${summary} · aktualizujem…` : "aktualizujem trasu…";
  }
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

function shouldRefreshRoute(
  origin: LatLng,
  last: LastFetchMeta | undefined,
  meetingId: string,
  destKeyValue: string,
  isSelf: boolean,
): boolean {
  if (!last || last.meetingId !== meetingId || last.destKey !== destKeyValue) return true;
  const moved = distanceMeters(origin, last.origin);
  const elapsed = Date.now() - last.fetchedAt;
  const moveThreshold = isSelf ? ROUTE_SELF_MOVE_M : ROUTE_PEER_MOVE_M;
  const maxAge = isSelf ? ROUTE_SELF_MAX_AGE_MS : ROUTE_PEER_MAX_AGE_MS;
  if (moved >= moveThreshold) return true;
  if (elapsed >= maxAge) return true;
  return false;
}

function emptyLine(userId: string): MeetingRouteLine {
  return {
    userId,
    path: [],
    durationSeconds: null,
    distanceMeters: null,
    loading: true,
    refreshing: false,
    error: null,
  };
}

function upsertLine(lines: MeetingRouteLine[], next: MeetingRouteLine): MeetingRouteLine[] {
  const idx = lines.findIndex((l) => l.userId === next.userId);
  if (idx === -1) return [...lines, next];
  const copy = [...lines];
  copy[idx] = next;
  return copy;
}

export function useMeetingRoutePaths(
  activeMeeting: MeetingPoint | null,
  routeUserIds: string[],
  locations: LocationRow[],
  _users: SearchUser[],
  _groups: Group[],
  currentUserId?: string | null,
): { routes: MeetingRouteLine[]; routeError: string | null } {
  const [routes, setRoutes] = useState<MeetingRouteLine[]>([]);
  const [routeError, setRouteError] = useState<string | null>(null);

  const routesRef = useRef(routes);
  routesRef.current = routes;

  const locationsRef = useRef(locations);
  locationsRef.current = locations;

  const activeMeetingRef = useRef(activeMeeting);
  activeMeetingRef.current = activeMeeting;

  const routeUserIdsRef = useRef(routeUserIds);
  routeUserIdsRef.current = routeUserIds;

  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;

  const lastFetchRef = useRef(new Map<string, LastFetchMeta>());
  const debounceTimersRef = useRef(new Map<string, number>());
  const fetchGenRef = useRef(new Map<string, number>());
  const prevContextKeyRef = useRef("");

  const routeContextKey = useMemo(() => {
    if (!activeMeeting || routeUserIds.length === 0) return "";
    return `${activeMeeting.id}|${activeMeeting.latitude.toFixed(5)}|${activeMeeting.longitude.toFixed(5)}|${routeUserIds.join(",")}`;
  }, [activeMeeting, routeUserIds]);

  useEffect(() => {
    const clearDebounce = (userId: string) => {
      const t = debounceTimersRef.current.get(userId);
      if (t != null) window.clearTimeout(t);
      debounceTimersRef.current.delete(userId);
    };

    const runFetch = async (userId: string, initial: boolean) => {
      const meeting = activeMeetingRef.current;
      if (!meeting || !routeUserIdsRef.current.includes(userId)) return;

      const loc = locationsRef.current.find((l) => l.userId === userId);
      if (!loc) return;

      const origin = { lat: loc.latitude, lng: loc.longitude };
      const dest = { lat: meeting.latitude, lng: meeting.longitude };
      const dKey = destKey(dest);
      const isSelf = userId === currentUserIdRef.current;
      const gen = (fetchGenRef.current.get(userId) ?? 0) + 1;
      fetchGenRef.current.set(userId, gen);

      const existing = routesRef.current.find((l) => l.userId === userId);
      const hasVisiblePath = Boolean(existing && existing.path.length >= 2 && !existing.error);

      setRouteError(null);
      setRoutes((prev) =>
        upsertLine(prev, {
          userId,
          path: hasVisiblePath ? existing!.path : [],
          durationSeconds: hasVisiblePath ? existing!.durationSeconds : null,
          distanceMeters: hasVisiblePath ? existing!.distanceMeters : null,
          loading: initial && !hasVisiblePath,
          refreshing: !initial && hasVisiblePath,
          error: null,
        }),
      );

      try {
        const result = await fetchWalkingRoute(origin, dest, {
          userId,
          meetingId: meeting.id,
        });
        if (fetchGenRef.current.get(userId) !== gen) return;

        lastFetchRef.current.set(userId, {
          origin,
          fetchedAt: Date.now(),
          meetingId: meeting.id,
          destKey: dKey,
        });

        setRoutes((prev) =>
          upsertLine(prev, {
            userId,
            path: result.path,
            durationSeconds: result.durationSeconds,
            distanceMeters: result.distanceMeters,
            loading: false,
            refreshing: false,
            error: null,
          }),
        );
        setRouteError(null);
      } catch (err) {
        if (fetchGenRef.current.get(userId) !== gen) return;
        const raw = parseRouteFetchError(err);
        const message = routeErrorMessage(raw);
        logRouteError({
          userId,
          meetingId: meeting.id,
          origin,
          dest,
          raw,
          message,
        });

        setRoutes((prev) => {
          const prevLine = prev.find((l) => l.userId === userId);
          const keepPath = Boolean(prevLine && prevLine.path.length >= 2 && !initial);
          return upsertLine(prev, {
            userId,
            path: keepPath ? prevLine!.path : [],
            durationSeconds: keepPath ? prevLine!.durationSeconds : null,
            distanceMeters: keepPath ? prevLine!.distanceMeters : null,
            loading: false,
            refreshing: false,
            error: keepPath ? null : message,
          });
        });
        if (!hasVisiblePath) setRouteError(message);
      }
    };

    const scheduleRefresh = (userId: string, immediate = false) => {
      const meeting = activeMeetingRef.current;
      if (!meeting) return;

      const isSelf = userId === currentUserIdRef.current;
      const last = lastFetchRef.current.get(userId);
      const maxAge = isSelf ? ROUTE_SELF_MAX_AGE_MS : ROUTE_PEER_MAX_AGE_MS;
      const forceDueToAge = Boolean(last && Date.now() - last.fetchedAt >= maxAge);
      const debounceMs =
        immediate || forceDueToAge ? 0 : isSelf ? ROUTE_DEBOUNCE_MS : ROUTE_PEER_DEBOUNCE_MS;

      clearDebounce(userId);
      debounceTimersRef.current.set(
        userId,
        window.setTimeout(() => {
          debounceTimersRef.current.delete(userId);
          const m = activeMeetingRef.current;
          if (!m || !routeUserIdsRef.current.includes(userId)) return;

          const loc = locationsRef.current.find((l) => l.userId === userId);
          if (!loc) return;

          const origin = { lat: loc.latitude, lng: loc.longitude };
          const dest = { lat: m.latitude, lng: m.longitude };
          const dKey = destKey(dest);
          const last = lastFetchRef.current.get(userId);
          const existing = routesRef.current.find((l) => l.userId === userId);
          const hasVisiblePath = Boolean(existing && existing.path.length >= 2 && !existing.error);
          const destChanged = !last || last.meetingId !== m.id || last.destKey !== dKey;

          if (!hasVisiblePath || destChanged) {
            void runFetch(userId, true);
            return;
          }

          if (!shouldRefreshRoute(origin, last, m.id, dKey, isSelf)) return;

          const minInterval = isSelf ? ROUTE_SELF_MIN_INTERVAL_MS : ROUTE_PEER_MIN_INTERVAL_MS;
          if (last && Date.now() - last.fetchedAt < minInterval) return;

          void runFetch(userId, false);
        }, debounceMs),
      );
    };

    if (!activeMeeting || routeUserIds.length === 0) {
      for (const t of debounceTimersRef.current.values()) window.clearTimeout(t);
      debounceTimersRef.current.clear();
      lastFetchRef.current.clear();
      fetchGenRef.current.clear();
      prevContextKeyRef.current = "";
      setRoutes([]);
      setRouteError(null);
      return;
    }

    const contextChanged = prevContextKeyRef.current !== routeContextKey;
    prevContextKeyRef.current = routeContextKey;

    const activeSet = new Set(routeUserIds);
    for (const userId of routeUserIds) {
      // Pri novom zraze / novom členovi hneď; pri GPS ticku debounce.
      scheduleRefresh(userId, contextChanged);
    }

    for (const userId of [...debounceTimersRef.current.keys()]) {
      if (!activeSet.has(userId)) clearDebounce(userId);
    }
    for (const userId of [...lastFetchRef.current.keys()]) {
      if (!activeSet.has(userId)) lastFetchRef.current.delete(userId);
    }
    setRoutes((prev) => prev.filter((l) => activeSet.has(l.userId)));
  }, [routeContextKey, locations, activeMeeting, routeUserIds]);

  useEffect(() => {
    return () => {
      for (const t of debounceTimersRef.current.values()) window.clearTimeout(t);
      debounceTimersRef.current.clear();
    };
  }, []);

  return { routes, routeError };
}
