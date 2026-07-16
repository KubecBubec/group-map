import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, MarkerF, PolylineF, useJsApiLoader } from "@react-google-maps/api";
import { MAPS_KEY, apiFetch } from "../lib/api";
import { useCoordinator } from "../lib/coordinator";
import { centerMap } from "../lib/mapCenter";
import { formatRouteDistanceLabel, formatRouteEta, useMeetingRoutePaths } from "../lib/meetingRoutes";
import { resolveMeetingTargetUserIds } from "../lib/meetingTargets";
import { canShowRouteForLocation, isLocationLive, noRouteLocationHint, staleLocationRouteHint } from "../lib/locationFreshness";
import { canManageMeetingPoint } from "../lib/meetingPermissions";
import { useTapPulse } from "../lib/tapFeedback";
import { fromNow } from "../lib/time";
import type { LatLng, LocationRow, MeetingPoint } from "../lib/types";
import { CreateMeetingSheet } from "../components/CreateMeetingSheet";
import { LocationClusterSheet } from "../components/LocationClusterSheet";
import { MeetingPointSheet } from "../components/MeetingPointSheet";
import { clusterLocations } from "../lib/locationClusters";
import { Avatar, RoleBadge, Sheet, StatusDot } from "../components/ui";
import { LayersIcon, MapIcon, PlusIcon, SatelliteIcon, TargetIcon } from "../components/icons";

const LIBRARIES: "places"[] = ["places"];
const DEFAULT_CENTER = { lat: 43.0707, lng: 12.6197 };
const MAP_LAYER_STORAGE_KEY = "mapLayerMode";
/** Zoom pri „Vycentrovať“ – bližší ako bežné recenter (14). */
const FOCUS_ZOOM = 18;

type MapLayerMode = "roadmap" | "satellite" | "hybrid";

const MAP_LAYER_CYCLE: MapLayerMode[] = ["roadmap", "satellite", "hybrid"];

const MAP_LAYER_LABEL: Record<MapLayerMode, string> = {
  roadmap: "Mapa",
  satellite: "Satelit",
  hybrid: "Hybrid",
};

function readMapLayerMode(): MapLayerMode {
  const stored = localStorage.getItem(MAP_LAYER_STORAGE_KEY);
  return MAP_LAYER_CYCLE.includes(stored as MapLayerMode) ? (stored as MapLayerMode) : "roadmap";
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

type Filter = "ALL" | "GROUP" | "SELECTED";

export function MapView({ isActive }: { isActive: boolean }) {
  const {
    locations,
    meetingPoints,
    users,
    groups,
    user,
    myPos,
    geoPermission,
    geoConsentGranted,
    enableGeoTracking,
    selectedUserIds,
    focusTarget,
    meetingPickNonce,
    meetingMoveId,
    meetingMoveNonce,
    activeMeetingId,
    clearMeetingMove,
    focusMeeting,
    openPing,
    requestMeetingPick,
    requestMeetingMove,
    moveMeetingPoint,
    cancelMeetingPoint,
    requestMyLocation,
    refreshGeoDiagnostics,
  } = useCoordinator();

  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: MAPS_KEY,
    libraries: LIBRARIES,
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const pendingFocusRef = useRef<{ id: string; nonce: number } | null>(null);
  const locationsRef = useRef(locations);
  locationsRef.current = locations;
  const mapsUsageReportedRef = useRef(false);
  const didInitialCenterRef = useRef(false);
  const staticCenterRef = useRef(DEFAULT_CENTER);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [peek, setPeek] = useState<LocationRow | null>(null);
  const [peekRouteOn, setPeekRouteOn] = useState(false);
  const [myRouteHidden, setMyRouteHidden] = useState(false);
  const [pickMeetingForRoute, setPickMeetingForRoute] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [pickPurpose, setPickPurpose] = useState<"create" | "move" | null>(null);
  const [pickedPos, setPickedPos] = useState<LatLng | null>(null);
  const [createSheetPos, setCreateSheetPos] = useState<LatLng | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [recenterMsg, setRecenterMsg] = useState<string | null>(null);
  const [recenterBusy, setRecenterBusy] = useState(false);
  const [centering, setCentering] = useState<{ targetId: string; label: string } | null>(null);
  const [peekCenterBusy, setPeekCenterBusy] = useState(false);
  const [meetingDetail, setMeetingDetail] = useState<MeetingPoint | null>(null);
  const [clusterPick, setClusterPick] = useState<LocationRow[] | null>(null);
  const [routeUserIds, setRouteUserIds] = useState<string[]>([]);
  const [mapLayer, setMapLayer] = useState<MapLayerMode>(() => readMapLayerMode());
  const { pulse, isPulsing } = useTapPulse();

  const myGroupUserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of groups) for (const m of g.memberships ?? []) ids.add(m.userId);
    return ids;
  }, [groups]);

  const movingMeeting = useMemo(
    () => meetingPoints.find((m) => m.id === meetingMoveId) ?? null,
    [meetingPoints, meetingMoveId],
  );

  const pickMode = pickPurpose !== null;
  const showGeoBanner = !pickMode && geoPermission !== "granted";
  const activeMeeting = useMemo(
    () => meetingPoints.find((m) => m.id === activeMeetingId) ?? null,
    [meetingPoints, activeMeetingId],
  );

  const { routes: routeLines, routeError } = useMeetingRoutePaths(
    activeMeeting,
    routeUserIds,
    locations,
    users,
    groups,
  );

  const meetingTargetIds = useMemo(() => {
    if (!activeMeeting) return new Set<string>();
    return new Set(resolveMeetingTargetUserIds(activeMeeting, users, groups));
  }, [activeMeeting, users, groups]);

  const myLoc = useMemo(
    () => (user ? locations.find((l) => l.userId === user.id) : undefined),
    [locations, user?.id],
  );
  const canShowMyRoute = Boolean(
    activeMeeting && user && canShowRouteForLocation(myLoc),
  );
  const myRouteOn = Boolean(user && routeUserIds.includes(user.id));
  const iAmMeetingTarget = Boolean(user && meetingTargetIds.has(user.id));

  const peekFresh = useMemo(() => {
    if (!peek) return null;
    return locations.find((l) => l.userId === peek.userId) ?? peek;
  }, [peek, locations]);

  const peekCanRoute = Boolean(
    activeMeeting &&
      peekFresh &&
      user &&
      peekFresh.userId !== user.id &&
      meetingTargetIds.has(peekFresh.userId) &&
      canShowRouteForLocation(peekFresh),
  );

  /** Označený iný člen – výhradný fokus (nie zároveň s mojou trasou). */
  const peerFocus = Boolean(peekFresh && user && peekFresh.userId !== user.id);
  const selfFocus = Boolean(activeMeeting && myRouteOn && !peerFocus);
  const routePrompt = Boolean(
    activeMeeting && canShowMyRoute && !myRouteOn && !peerFocus && !pickMeetingForRoute,
  );
  const showNavPanel = Boolean(
    !pickMode && (selfFocus || peerFocus || routePrompt || pickMeetingForRoute),
  );

  const myRouteLine = useMemo(
    () => (user ? routeLines.find((l) => l.userId === user.id) : undefined),
    [routeLines, user?.id],
  );
  const peekRouteLine = useMemo(
    () => (peekFresh ? routeLines.find((l) => l.userId === peekFresh.userId) : undefined),
    [routeLines, peekFresh],
  );

  const myEta = myRouteLine ? formatRouteEta(myRouteLine) : null;
  const myDistance = myRouteLine ? formatRouteDistanceLabel(myRouteLine) : null;
  const myRouteLoading = myRouteLine?.loading ?? false;
  const peekEta = peekRouteLine ? formatRouteEta(peekRouteLine) : null;
  const peekDistance = peekRouteLine ? formatRouteDistanceLabel(peekRouteLine) : null;
  const peekRouteLoading = peekRouteLine?.loading ?? false;

  const closePeek = useCallback(() => {
    setPeek(null);
    setPeekRouteOn(false);
  }, []);

  const focusMyRoute = useCallback(() => {
    closePeek();
    setPickMeetingForRoute(false);
    setMyRouteHidden(false);
    if (activeMeetingId) return;
    if (meetingPoints.length === 1) {
      focusMeeting(meetingPoints[0].id);
    } else if (meetingPoints.length > 1) {
      setPickMeetingForRoute(true);
    }
  }, [activeMeetingId, closePeek, focusMeeting, meetingPoints]);

  const openPeek = useCallback(
    (loc: LocationRow) => {
      if (user && loc.userId === user.id) {
        focusMyRoute();
        return;
      }
      pulse(loc.userId);
      setPickMeetingForRoute(false);
      setPeek(loc);
      const canRoute =
        Boolean(activeMeeting) &&
        meetingTargetIds.has(loc.userId) &&
        canShowRouteForLocation(loc);
      setPeekRouteOn(canRoute);
      // Výhradný fokus: pri označenom členovi schovaj moju trasu.
      setMyRouteHidden(true);
    },
    [activeMeeting, focusMyRoute, meetingTargetIds, pulse, user],
  );

  const cycleMapLayer = useCallback(() => {
    setMapLayer((prev) => {
      const idx = MAP_LAYER_CYCLE.indexOf(prev);
      const next = MAP_LAYER_CYCLE[(idx + 1) % MAP_LAYER_CYCLE.length] ?? "roadmap";
      localStorage.setItem(MAP_LAYER_STORAGE_KEY, next);
      return next;
    });
  }, []);

  // Jedna trasa naraz: buď ja, alebo označený člen (jemná).
  useEffect(() => {
    if (!activeMeeting || !user) {
      setRouteUserIds([]);
      return;
    }
    const next: string[] = [];
    const peerRoute =
      peekRouteOn &&
      peekFresh &&
      peekFresh.userId !== user.id &&
      meetingTargetIds.has(peekFresh.userId) &&
      canShowRouteForLocation(peekFresh);
    if (peerRoute && peekFresh) {
      next.push(peekFresh.userId);
    } else if (canShowMyRoute && !myRouteHidden) {
      next.push(user.id);
    }
    setRouteUserIds((prev) => (sameIdSet(prev, next) ? prev : next));
  }, [
    activeMeeting,
    user,
    canShowMyRoute,
    myRouteHidden,
    peekRouteOn,
    peekFresh,
    meetingTargetIds,
  ]);

  useEffect(() => {
    setMyRouteHidden(false);
    setPickMeetingForRoute(false);
    setPeek(null);
    setPeekRouteOn(false);
  }, [activeMeetingId]);

  useEffect(() => {
    if (!activeMeetingId) {
      setPeekRouteOn(false);
      return;
    }
    if (!meetingPoints.some((m) => m.id === activeMeetingId)) {
      setRouteUserIds([]);
      setPeekRouteOn(false);
    }
  }, [meetingPoints, activeMeetingId]);

  // Obnov peek podľa čerstvých polôh
  useEffect(() => {
    setPeek((prev) => {
      if (!prev) return null;
      const fresh = locations.find((l) => l.userId === prev.userId);
      if (!fresh) return null;
      if (
        fresh.updatedAt === prev.updatedAt &&
        fresh.latitude === prev.latitude &&
        fresh.longitude === prev.longitude &&
        fresh.status === prev.status &&
        fresh.heading === prev.heading
      ) {
        return prev;
      }
      return fresh;
    });
  }, [locations]);

  useEffect(() => {
    if (!peek) {
      setPeekRouteOn(false);
    }
  }, [peek]);

  useEffect(() => {
    if (!meetingDetail) return;
    const fresh = meetingPoints.find((m) => m.id === meetingDetail.id);
    if (fresh) setMeetingDetail(fresh);
    else setMeetingDetail(null);
  }, [meetingPoints, meetingDetail?.id]);

  useEffect(() => {
    if (!activeMeetingId || !mapRef.current) return;
    const meeting = meetingPoints.find((m) => m.id === activeMeetingId);
    if (!meeting) return;
    centerMap(mapRef.current, { lat: meeting.latitude, lng: meeting.longitude });
  }, [activeMeetingId, meetingPoints]);

  useEffect(() => {
    if (!myPos || !mapRef.current || didInitialCenterRef.current) return;
    didInitialCenterRef.current = true;
    centerMap(mapRef.current, myPos, 14);
  }, [myPos]);

  const filtered = useMemo(() => {
    const selfId = user?.id;
    const includeSelf = (l: LocationRow) => Boolean(selfId && l.userId === selfId);

    if (filter === "SELECTED") {
      return locations.filter((l) => selectedUserIds.includes(l.userId) || includeSelf(l));
    }
    if (filter === "GROUP") {
      return locations.filter((l) => myGroupUserIds.has(l.userId) || includeSelf(l));
    }
    return locations;
  }, [locations, filter, selectedUserIds, myGroupUserIds, user?.id]);

  const mapClusters = useMemo(() => clusterLocations(filtered), [filtered]);

  const focusUserOnMap = useCallback(
    (userId: string, openPeekPanel: boolean) => {
      const loc = locationsRef.current.find((l) => l.userId === userId);
      if (!loc || !mapRef.current) return false;
      centerMap(mapRef.current, { lat: loc.latitude, lng: loc.longitude });
      if (openPeekPanel) openPeek(loc);
      return true;
    },
    [openPeek],
  );

  useEffect(() => {
    if (!focusTarget) return;
    if (!focusUserOnMap(focusTarget.id, true)) {
      pendingFocusRef.current = focusTarget;
    }
  }, [focusTarget?.id, focusTarget?.nonce, focusUserOnMap]);

  useEffect(() => {
    if (!isActive || !mapRef.current) return;
    google.maps.event.trigger(mapRef.current, "resize");
    const pending = pendingFocusRef.current;
    if (!pending) return;
    window.setTimeout(() => {
      if (mapRef.current && focusUserOnMap(pending.id, true)) {
        pendingFocusRef.current = null;
      }
    }, 80);
  }, [isActive, focusTarget?.nonce, focusUserOnMap]);

  useEffect(() => {
    if (!meetingPickNonce) return;
    setPickPurpose("create");
    setPickedPos(null);
    setCreateSheetPos(null);
    setPeek(null);
    setPeekRouteOn(false);
    setClusterPick(null);
    setShowActions(false);
    setMeetingDetail(null);
  }, [meetingPickNonce]);

  useEffect(() => {
    if (!meetingMoveNonce || !meetingMoveId) return;
    setPickPurpose("move");
    setPickedPos(null);
    setCreateSheetPos(null);
    setPeek(null);
    setPeekRouteOn(false);
    setClusterPick(null);
    setShowActions(false);
    setMeetingDetail(null);
  }, [meetingMoveNonce, meetingMoveId]);

  const exitPickMode = () => {
    setPickPurpose(null);
    setPickedPos(null);
    clearMeetingMove();
  };

  const confirmPick = async () => {
    if (!pickedPos || !pickPurpose) return;
    if (pickPurpose === "create") {
      setCreateSheetPos(pickedPos);
      setPickPurpose(null);
      setPickedPos(null);
      return;
    }
    if (!meetingMoveId) return;
    setMoveBusy(true);
    try {
      await moveMeetingPoint(meetingMoveId, pickedPos);
      setPickPurpose(null);
      setPickedPos(null);
      clearMeetingMove();
    } finally {
      setMoveBusy(false);
    }
  };

  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    if (!pickMode || !e.latLng) return;
    setPickedPos({ lat: e.latLng.lat(), lng: e.latLng.lng() });
  };

  const recenter = async () => {
    if (!mapRef.current || recenterBusy) return;
    setRecenterMsg(null);
    setRecenterBusy(true);
    const clearCentering = () => setCentering(null);
    try {
      if (myPos) {
        setCentering({ targetId: user?.id ?? "me", label: "moju polohu" });
        centerMap(mapRef.current, myPos, 14, clearCentering);
        return;
      }
      setRecenterMsg("Hľadám GPS…");
      const pos = await requestMyLocation("recenter_button");
      setRecenterMsg(null);
      setCentering({ targetId: user?.id ?? "me", label: "moju polohu" });
      centerMap(mapRef.current, pos, 14, clearCentering);
      refreshGeoDiagnostics();
    } catch {
      setCentering(null);
      setRecenterMsg("GPS nedostupné – pozri Viac → Diagnostika polohy.");
    } finally {
      setRecenterBusy(false);
    }
  };

  const centerOnFocus = (target: LocationRow, busy: "self" | "peer") => {
    if (!mapRef.current) return;
    if (busy === "peer" && peekCenterBusy) return;
    if (busy === "self" && peekCenterBusy) return;
    setPeekCenterBusy(true);
    setCentering({ targetId: target.userId, label: target.user.name });
    pulse(target.userId);
    centerMap(
      mapRef.current,
      { lat: target.latitude, lng: target.longitude },
      FOCUS_ZOOM,
      () => {
        setCentering(null);
        setPeekCenterBusy(false);
      },
    );
  };

  if (!MAPS_KEY) {
    return (
      <div className="page">
        <div className="card">
          <h3 className="card__title">Mapa nie je nakonfigurovaná</h3>
          <p className="card__sub">Chýba <code>VITE_GOOGLE_MAPS_API_KEY</code> v prostredí.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`map-wrap page page--flush${pickMode ? " map-wrap--pick" : ""}`}>
      <div className="map-overlay-top">
        {!pickMode && (
          <>
            <button className={`chip${filter === "ALL" ? " is-active" : ""}`} onClick={() => setFilter("ALL")}>
              Všetci ({locations.length})
            </button>
            <button className={`chip${filter === "GROUP" ? " is-active" : ""}`} onClick={() => setFilter("GROUP")}>
              Moje skupiny
            </button>
            <button
              className={`chip${filter === "SELECTED" ? " is-active" : ""}`}
              onClick={() => setFilter("SELECTED")}
            >
              Vybraní ({selectedUserIds.length})
            </button>
          </>
        )}
        {activeMeeting && routeError && !pickMode && (
          <div className="map-route-error">
            {routeError} Log: Viac → Diagnostika (GPS + trasy).
          </div>
        )}
        {centering && !pickMode && (
          <div className="map-centering-banner" role="status" aria-live="polite">
            <span className="spinner spinner--sm" aria-hidden />
            <span>Centrujem na {centering.label}…</span>
          </div>
        )}
        {pickMode && (
          <div className="map-pick-banner">
            {pickPurpose === "move" && movingMeeting
              ? `Presúvaš „${movingMeeting.title}“ – klepni na novú polohu zrazu.`
              : "Klepni na mapu, kam má ísť zraz. Môžeš klepnúť znova a upraviť polohu."}
          </div>
        )}
        {showGeoBanner && (
          <div className="map-geo-banner">
            <p className="map-geo-banner__text">
              {geoPermission === "denied"
                ? "Poloha je v prehliadači zamietnutá. V Safari: Nastavenia → Poloha služby → povoliť pre túto stránku. Používaj stále rovnakú adresu (záložka alebo ikona na ploche)."
                : geoConsentGranted
                  ? "Čaká sa na potvrdenie polohy v prehliadači, alebo GPS ešte neodpovedá."
                  : "Zdieľanie polohy sa zapne raz – prehliadač si povolenie pamätá pri rovnakej adrese appky."}
            </p>
            {geoPermission !== "denied" && (
              <button type="button" className="btn btn--sm btn--primary" onClick={() => void enableGeoTracking()}>
                {geoConsentGranted ? "Skúsiť znova" : "Povoliť polohu"}
              </button>
            )}
          </div>
        )}
      </div>

      {isLoaded ? (
        <GoogleMap
          mapContainerStyle={{ width: "100%", height: "100%" }}
          center={staticCenterRef.current}
          zoom={14}
          onLoad={(map) => {
            mapRef.current = map;
            google.maps.event.trigger(map, "resize");
            if (!mapsUsageReportedRef.current) {
              mapsUsageReportedRef.current = true;
              apiFetch("/usage/report", {
                method: "POST",
                body: JSON.stringify({ sku: "maps" }),
              }).catch(() => {});
            }
            const pending = pendingFocusRef.current;
            if (pending) {
              window.setTimeout(() => {
                if (focusUserOnMap(pending.id, true)) pendingFocusRef.current = null;
              }, 80);
            } else if (myPos && !didInitialCenterRef.current) {
              didInitialCenterRef.current = true;
              centerMap(map, myPos, 14);
            }
          }}
          onClick={handleMapClick}
          options={{
            disableDefaultUI: true,
            zoomControl: false,
            mapTypeId: mapLayer,
            clickableIcons: !pickMode,
            gestureHandling: "greedy",
          }}
        >
          {mapClusters.map((cluster) => {
            if (cluster.members.length === 1) {
              const l = cluster.members[0];
              const isMe = Boolean(user && l.userId === user.id);
              const tapped = isPulsing(l.userId) || centering?.targetId === l.userId;
              return (
                <MarkerF
                  key={l.id}
                  position={{ lat: l.latitude, lng: l.longitude }}
                  onClick={() => {
                    if (pickMode) return;
                    if (isMe) focusMyRoute();
                    else openPeek(l);
                  }}
                  icon={{
                    path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                    fillColor: isMe
                      ? "#1d4ed8"
                      : l.status === "online"
                        ? "#16a34a"
                        : "#f59e0b",
                    fillOpacity: 1,
                    strokeWeight: isMe ? 3.5 : tapped ? 2.5 : 1.5,
                    strokeColor: isMe ? "#eff6ff" : tapped ? "#93c5fd" : "#ffffff",
                    scale: isMe ? 9 : tapped ? 7 : 5.5,
                    rotation: l.heading ?? 0,
                  }}
                  label={
                    isMe
                      ? {
                          text: "Ja",
                          color: "#1e3a8a",
                          fontSize: "11px",
                          fontWeight: "800",
                        }
                      : undefined
                  }
                  title={isMe ? `${l.user.name} (ty)` : l.user.name}
                  zIndex={isMe ? 2500 : tapped ? 1000 : 1}
                />
              );
            }

            const count = cluster.members.length;
            const hasMe = Boolean(user && cluster.members.some((m) => m.userId === user.id));
            const hasOnline = cluster.members.some((m) => m.status === "online");
            const tapped = isPulsing(cluster.id);
            return (
              <MarkerF
                key={cluster.id}
                position={cluster.center}
                onClick={() => {
                  if (pickMode) return;
                  pulse(cluster.id);
                  setClusterPick(cluster.members);
                }}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  fillColor: hasMe ? "#1d4ed8" : hasOnline ? "#16a34a" : "#f59e0b",
                  fillOpacity: 1,
                  strokeWeight: hasMe || tapped ? 3.5 : 2,
                  strokeColor: hasMe ? "#eff6ff" : tapped ? "#93c5fd" : "#ffffff",
                  scale: Math.min(22, (hasMe ? 13 : 11) + count * 1.5),
                }}
                label={{
                  text: hasMe ? `${count}·ja` : String(count),
                  color: "#ffffff",
                  fontSize: count > 9 || hasMe ? "10px" : "13px",
                  fontWeight: "700",
                }}
                title={
                  hasMe
                    ? `${count} členovia na tomto mieste (vrátane teba)`
                    : `${count} členovia na tomto mieste`
                }
                zIndex={hasMe ? 2400 : tapped ? 1000 : 10 + count}
              />
            );
          })}
          {meetingPoints.map((m) => {
            const tapped = isPulsing(m.id);
            const isActive = m.id === activeMeetingId;
            const isGlobal = m.scope === "GLOBAL";
            const fillColor = isGlobal
              ? isActive || tapped
                ? "#c2410c"
                : "#ea580c"
              : isActive
                ? "#7c3aed"
                : "#ffffff";
            const strokeColor = isGlobal
              ? "#9a3412"
              : isActive || tapped
                ? "#6d28d9"
                : "#d4d4d8";
            return (
            <MarkerF
              key={m.id}
              position={{ lat: m.latitude, lng: m.longitude }}
              onClick={() => {
                if (pickMode) return;
                pulse(m.id);
                setMeetingDetail(m);
              }}
              label={{
                text: isGlobal ? "⚑" : "📍",
                fontSize: tapped || isGlobal ? "24px" : "20px",
                fontWeight: "700",
              }}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: tapped ? 24 : isGlobal ? 22 : 18,
                fillColor,
                fillOpacity: isGlobal ? (isActive ? 0.95 : 0.88) : isActive ? 0.22 : 0.9,
                strokeWeight: tapped || isGlobal ? 3 : isActive ? 2.5 : 2,
                strokeColor,
              }}
              title={`${isGlobal ? "Zraz pre všetkých" : "Stretnutie"}: ${m.title}${canManageMeetingPoint(user, m) ? " – klepni pre úpravu" : " – klepni pre detail"}`}
              zIndex={isActive ? 900 : tapped ? 850 : isGlobal ? 80 : 40}
            />
            );
          })}
          {routeLines
            .filter((line) => line.path.length >= 2 && !line.error)
            .map((line) => {
              const isSelf = line.userId === user?.id;
              return (
                <PolylineF
                  key={line.userId}
                  path={line.path}
                  options={{
                    strokeColor: isSelf ? "#1d4ed8" : "#64748b",
                    strokeOpacity: line.loading ? 0.2 : isSelf ? 0.92 : 0.38,
                    strokeWeight: isSelf ? 5.5 : 2.5,
                    geodesic: false,
                    zIndex: isSelf ? 4 : 1,
                  }}
                />
              );
            })}
          {pickedPos && (
            <MarkerF
              position={pickedPos}
              label={{ text: "📍", fontSize: "22px" }}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 0,
              }}
            />
          )}
        </GoogleMap>
      ) : (
        <div className="center-screen">
          <div className="spinner" />
          <p className="muted">Načítavam mapu…</p>
        </div>
      )}

      {showNavPanel && (
        <div className="map-overlay-bottom-left">
          <div className="map-route-nav">
            {pickMeetingForRoute && (
              <>
                <div className="map-route-nav__info">
                  <span className="map-route-nav__title">Vyber zraz pre trasu</span>
                  <p className="map-route-nav__hint">
                    Máš viacero bodov stretnutia – klepni na jeden, alebo vyber nižšie.
                  </p>
                </div>
                <div className="map-route-nav__actions map-route-nav__actions--stack">
                  {meetingPoints.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="btn btn--sm btn--block"
                      onClick={() => {
                        focusMeeting(m.id);
                        setPickMeetingForRoute(false);
                        setMyRouteHidden(false);
                      }}
                    >
                      {m.title}
                    </button>
                  ))}
                </div>
              </>
            )}

            {selfFocus && activeMeeting && (
              <>
                <div className="map-route-nav__info">
                  <span className="map-route-nav__title">
                    {activeMeeting.title}
                    {" · tvoja trasa"}
                  </span>
                  <span className="map-route-nav__meta" role="status" aria-live="polite">
                    {myRouteLoading ? (
                      <>
                        <span className="spinner spinner--sm" aria-hidden />
                        počítam trasu…
                      </>
                    ) : myEta && myDistance ? (
                      <>
                        <span className="map-route-nav__eta">{myEta}</span>
                        <span className="map-route-nav__sep">·</span>
                        <span className="map-route-nav__dist">{myDistance}</span>
                      </>
                    ) : myEta ? (
                      <span className="map-route-nav__eta">{myEta}</span>
                    ) : (
                      <span className="map-route-nav__eta map-route-nav__eta--muted">—</span>
                    )}
                  </span>
                </div>
                <div className="map-route-nav__actions">
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={() => setMyRouteHidden(true)}
                  >
                    Skryť trasu
                  </button>
                  {myLoc && (
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => centerOnFocus(myLoc, "self")}
                      disabled={peekCenterBusy}
                    >
                      {peekCenterBusy ? "Centrujem…" : "Vycentrovať"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={() => setMeetingDetail(activeMeeting)}
                  >
                    Zoznam
                  </button>
                </div>
                {myLoc && !isLocationLive(myLoc) && (
                  <p className="map-route-nav__hint map-route-nav__hint--warn">
                    {staleLocationRouteHint(true)}
                  </p>
                )}
                {canShowMyRoute && !iAmMeetingTarget && (
                  <p className="map-route-nav__hint">
                    Tento zraz nie je priamo pre teba – trasa je len na navigáciu.
                  </p>
                )}
                {!routeError && !myEta && !myRouteLoading && Boolean(myRouteLine) && (
                  <p className="map-route-nav__hint map-route-nav__hint--warn">
                    Nepodarilo sa vypočítať ETA trasy.
                  </p>
                )}
              </>
            )}

            {routePrompt && activeMeeting && (
              <>
                <div className="map-route-nav__info">
                  <span className="map-route-nav__title">{activeMeeting.title}</span>
                  <p className="map-route-nav__hint">Trasa k zrazu nie je na mape.</p>
                </div>
                <div className="map-route-nav__actions">
                  <button
                    type="button"
                    className="btn btn--sm btn--primary"
                    onClick={() => setMyRouteHidden(false)}
                  >
                    Zobraziť trasu
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={() => setMeetingDetail(activeMeeting)}
                  >
                    Zoznam
                  </button>
                </div>
              </>
            )}

            {peerFocus && peekFresh && (
              <>
                <div className="map-route-nav__who">
                  <Avatar name={peekFresh.user.name} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <span className="map-route-nav__title">{peekFresh.user.name}</span>
                    <span className="map-route-nav__member-sub">
                      <StatusDot status={peekFresh.status} />
                      {peekFresh.status === "online" ? "Online" : "Posledná poloha"}
                      <span>· {fromNow(peekFresh.updatedAt)}</span>
                    </span>
                    <RoleBadge role={peekFresh.user.role} />
                  </div>
                </div>

                {activeMeeting && meetingTargetIds.has(peekFresh.userId) && (
                  <>
                    {peekCanRoute && peekRouteOn ? (
                      <span className="map-route-nav__meta map-route-nav__meta--peer" role="status">
                        {peekRouteLoading ? (
                          <>
                            <span className="spinner spinner--sm" aria-hidden />
                            počítam trasu…
                          </>
                        ) : peekEta && peekDistance ? (
                          <>
                            <span className="map-route-nav__peer-eta">{peekEta}</span>
                            <span className="map-route-nav__sep">·</span>
                            <span>{peekDistance}</span>
                            <span className="map-route-nav__peer-label">jemná trasa</span>
                          </>
                        ) : peekEta ? (
                          <span className="map-route-nav__peer-eta">{peekEta}</span>
                        ) : (
                          <span className="map-route-nav__eta map-route-nav__eta--muted">—</span>
                        )}
                      </span>
                    ) : null}
                    {peekCanRoute && !isLocationLive(peekFresh) && peekRouteOn && (
                      <p className="map-route-nav__hint map-route-nav__hint--warn">
                        {staleLocationRouteHint(false)}
                      </p>
                    )}
                    {!peekCanRoute && (
                      <p className="map-route-nav__hint map-route-nav__hint--warn">
                        {noRouteLocationHint(false)}
                      </p>
                    )}
                  </>
                )}

                <div className="map-route-nav__actions">
                  {activeMeeting && peekCanRoute && (
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      onClick={() => {
                        if (peekRouteOn) closePeek();
                        else setPeekRouteOn(true);
                      }}
                    >
                      {peekRouteOn ? "Skryť trasu" : "Zobraziť trasu"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => centerOnFocus(peekFresh, "peer")}
                    disabled={peekCenterBusy}
                  >
                    {peekCenterBusy ? "Centrujem…" : "Vycentrovať"}
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm btn--primary"
                    onClick={() => {
                      openPing({
                        scope: "USER",
                        targetIds: [peekFresh.userId],
                        label: peekFresh.user.name,
                      });
                      closePeek();
                    }}
                  >
                    Pingnúť
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {!pickMode && (
        <div className="map-controls">
          <button
            type="button"
            className={`round-btn${mapLayer !== "roadmap" ? " is-active" : ""}`}
            onClick={cycleMapLayer}
            aria-label={`Typ mapy: ${MAP_LAYER_LABEL[mapLayer]}. Klepni pre zmenu.`}
            title={MAP_LAYER_LABEL[mapLayer]}
          >
            {mapLayer === "roadmap" ? (
              <MapIcon />
            ) : mapLayer === "satellite" ? (
              <SatelliteIcon />
            ) : (
              <LayersIcon />
            )}
          </button>
          <button
            className={`round-btn${recenterBusy ? " is-busy" : ""}`}
            onClick={() => void recenter()}
            disabled={recenterBusy}
            aria-label="Na moju polohu"
          >
            {recenterBusy ? <span className="spinner spinner--sm" aria-hidden /> : <TargetIcon />}
          </button>
          {recenterMsg && <div className="map-recenter-hint">{recenterMsg}</div>}
        </div>
      )}

      {!pickMode && (
        <button className="fab" onClick={() => setShowActions(true)} aria-label="Akcie">
          <PlusIcon size={26} />
        </button>
      )}

      {pickMode && (
        <div className="map-pick-bar">
          <button className="btn grow" onClick={exitPickMode} disabled={moveBusy}>
            Zrušiť
          </button>
          <button
            className="btn btn--primary grow"
            onClick={confirmPick}
            disabled={!pickedPos || moveBusy}
          >
            {moveBusy
              ? "Ukladám…"
              : pickPurpose === "move"
                ? "Potvrdiť novú polohu"
                : "Potvrdiť polohu"}
          </button>
        </div>
      )}

      {showActions && (
        <Sheet title="Rýchle akcie" onClose={() => setShowActions(false)}>
          <div className="stack">
            <button
              className="btn btn--primary btn--block"
              onClick={() => {
                openPing({ scope: "ALL", targetIds: [], label: "všetci" });
                setShowActions(false);
              }}
            >
              🔔 Pingnúť
            </button>
            <button
              className="btn btn--block"
              onClick={() => {
                setShowActions(false);
                requestMeetingPick();
              }}
            >
              📍 Nový bod stretnutia na mape
            </button>
          </div>
        </Sheet>
      )}

      {createSheetPos && (
        <CreateMeetingSheet position={createSheetPos} onClose={() => setCreateSheetPos(null)} />
      )}

      {meetingDetail && (
        <MeetingPointSheet
          meeting={meetingDetail}
          routeVisible={meetingDetail.id === activeMeeting?.id && myRouteOn}
          routeSummary={
            meetingDetail.id === activeMeeting?.id
              ? myRouteLoading
                ? "počítam trasu…"
                : myEta && myDistance
                  ? `${myEta} · ${myDistance}`
                  : myEta
              : null
          }
          onClose={() => setMeetingDetail(null)}
          onToggleRoute={() => {
            if (meetingDetail.id !== activeMeetingId) {
              focusMeeting(meetingDetail.id);
              setMyRouteHidden(false);
            } else if (myRouteOn) {
              setMyRouteHidden(true);
            } else {
              setMyRouteHidden(false);
            }
            setMeetingDetail(null);
          }}
          onMove={() => {
            setMeetingDetail(null);
            requestMeetingMove(meetingDetail.id);
          }}
          onCancel={async () => {
            await cancelMeetingPoint(meetingDetail.id);
            setMeetingDetail(null);
          }}
        />
      )}

      {clusterPick && (
        <LocationClusterSheet
          members={clusterPick}
          currentUserId={user?.id}
          onClose={() => setClusterPick(null)}
          onSelect={(loc) => {
            setClusterPick(null);
            openPeek(loc);
          }}
        />
      )}
    </div>
  );
}
