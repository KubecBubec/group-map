import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, MarkerF, PolylineF, useJsApiLoader } from "@react-google-maps/api";
import { MAPS_KEY, apiFetch } from "../lib/api";
import { useCoordinator } from "../lib/coordinator";
import { centerMap } from "../lib/mapCenter";
import { formatRouteDistanceLabel, formatRouteEta, formatRouteSummary, useMeetingRoutePaths } from "../lib/meetingRoutes";
import { resolveMeetingTargetUserIds } from "../lib/meetingTargets";
import { isLocationFreshForRoute, staleLocationRouteHint } from "../lib/locationFreshness";
import { canManageMeetingPoint } from "../lib/meetingPermissions";
import { useTapPulse } from "../lib/tapFeedback";
import { fromNow } from "../lib/time";
import type { LatLng, LocationRow, MeetingPoint } from "../lib/types";
import { CreateMeetingSheet } from "../components/CreateMeetingSheet";
import { LocationClusterSheet } from "../components/LocationClusterSheet";
import { MeetingPointSheet } from "../components/MeetingPointSheet";
import { clusterLocations } from "../lib/locationClusters";
import { Avatar, RoleBadge, Sheet, StatusDot } from "../components/ui";
import { CloseIcon, LayersIcon, MapIcon, PlusIcon, SatelliteIcon, TargetIcon } from "../components/icons";

const LIBRARIES: "places"[] = ["places"];
const DEFAULT_CENTER = { lat: 43.0707, lng: 12.6197 };
const MAP_LAYER_STORAGE_KEY = "mapLayerMode";

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
    clearActiveMeeting,
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
  const [detail, setDetail] = useState<LocationRow | null>(null);
  const [showActions, setShowActions] = useState(false);
  const [pickPurpose, setPickPurpose] = useState<"create" | "move" | null>(null);
  const [pickedPos, setPickedPos] = useState<LatLng | null>(null);
  const [createSheetPos, setCreateSheetPos] = useState<LatLng | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [recenterMsg, setRecenterMsg] = useState<string | null>(null);
  const [recenterBusy, setRecenterBusy] = useState(false);
  const [centering, setCentering] = useState<{ targetId: string; label: string } | null>(null);
  const [detailCenterBusy, setDetailCenterBusy] = useState(false);
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
  const canToggleMyRoute = Boolean(
    activeMeeting && user && meetingTargetIds.has(user.id) && isLocationFreshForRoute(myLoc),
  );
  const myRouteVisible = Boolean(user && routeUserIds.includes(user.id));
  const myRouteLine = useMemo(
    () => (user ? routeLines.find((l) => l.userId === user.id) : undefined),
    [routeLines, user?.id],
  );

  const primaryRoute = useMemo(() => {
    if (myRouteVisible && myRouteLine) {
      return { line: myRouteLine, who: null as string | null };
    }
    const visible = routeLines.filter((l) => routeUserIds.includes(l.userId));
    if (visible.length === 1) {
      const line = visible[0];
      const who =
        line.userId === user?.id
          ? null
          : (users.find((u) => u.id === line.userId)?.name ?? "Člen");
      return { line, who };
    }
    return null;
  }, [myRouteVisible, myRouteLine, routeLines, routeUserIds, user?.id, users]);

  const primaryEta = primaryRoute ? formatRouteEta(primaryRoute.line) : null;
  const primaryDistance = primaryRoute ? formatRouteDistanceLabel(primaryRoute.line) : null;
  const primaryLoading = primaryRoute?.line.loading ?? false;

  const otherRouteSummaries = useMemo(() => {
    return routeLines
      .filter((l) => l.userId !== user?.id && routeUserIds.includes(l.userId))
      .map((line) => ({
        userId: line.userId,
        name: users.find((u) => u.id === line.userId)?.name ?? "Člen",
        summary: formatRouteSummary(line),
      }))
      .filter((x) => x.summary && !(primaryRoute && x.userId === primaryRoute.line.userId));
  }, [routeLines, routeUserIds, user?.id, users, primaryRoute]);

  const toggleRouteUser = useCallback(
    (userId: string) => {
      if (!activeMeeting || !meetingTargetIds.has(userId)) return;
      setRouteUserIds((prev) => {
        if (prev.includes(userId)) return prev.filter((id) => id !== userId);
        const loc = locations.find((l) => l.userId === userId);
        if (!isLocationFreshForRoute(loc)) return prev;
        return [...prev, userId];
      });
    },
    [activeMeeting, meetingTargetIds, locations],
  );

  const cycleMapLayer = useCallback(() => {
    setMapLayer((prev) => {
      const idx = MAP_LAYER_CYCLE.indexOf(prev);
      const next = MAP_LAYER_CYCLE[(idx + 1) % MAP_LAYER_CYCLE.length] ?? "roadmap";
      localStorage.setItem(MAP_LAYER_STORAGE_KEY, next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!activeMeetingId || !user) {
      setRouteUserIds([]);
      return;
    }
    const meeting = meetingPoints.find((m) => m.id === activeMeetingId);
    if (!meeting) {
      setRouteUserIds([]);
      return;
    }
    const targetIds = resolveMeetingTargetUserIds(meeting, users, groups);
    const myLoc = locations.find((l) => l.userId === user.id);
    setRouteUserIds(
      targetIds.includes(user.id) && isLocationFreshForRoute(myLoc) ? [user.id] : [],
    );
  }, [activeMeetingId, user?.id, meetingPoints, users, groups, locations]);

  useEffect(() => {
    if (!activeMeeting) return;
    setRouteUserIds((prev) => {
      const next = prev.filter((id) => {
        const loc = locations.find((l) => l.userId === id);
        return isLocationFreshForRoute(loc);
      });
      return next.length === prev.length ? prev : next;
    });
  }, [locations, activeMeeting?.id]);

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
    if (filter === "SELECTED") return locations.filter((l) => selectedUserIds.includes(l.userId));
    if (filter === "GROUP") return locations.filter((l) => myGroupUserIds.has(l.userId));
    return locations;
  }, [locations, filter, selectedUserIds, myGroupUserIds]);

  const mapClusters = useMemo(() => clusterLocations(filtered), [filtered]);

  const focusUserOnMap = useCallback((userId: string, openDetail: boolean) => {
    const loc = locationsRef.current.find((l) => l.userId === userId);
    if (!loc || !mapRef.current) return false;
    centerMap(mapRef.current, { lat: loc.latitude, lng: loc.longitude });
    if (openDetail) setDetail(loc);
    return true;
  }, []);

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
    setDetail(null);
    setClusterPick(null);
    setShowActions(false);
    setMeetingDetail(null);
  }, [meetingPickNonce]);

  useEffect(() => {
    if (!meetingMoveNonce || !meetingMoveId) return;
    setPickPurpose("move");
    setPickedPos(null);
    setCreateSheetPos(null);
    setDetail(null);
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

  const centerOnDetail = () => {
    if (!detail || !mapRef.current || detailCenterBusy) return;
    const target = detail;
    setDetailCenterBusy(true);
    setCentering({ targetId: target.userId, label: target.user.name });
    pulse(target.userId);
    centerMap(
      mapRef.current,
      { lat: target.latitude, lng: target.longitude },
      16,
      () => {
        setCentering(null);
        setDetailCenterBusy(false);
      },
    );
    setDetail(null);
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
              const tapped = isPulsing(l.userId) || centering?.targetId === l.userId;
              const routeVisible = Boolean(activeMeeting && routeUserIds.includes(l.userId));
              return (
                <MarkerF
                  key={l.id}
                  position={{ lat: l.latitude, lng: l.longitude }}
                  onClick={() => {
                    if (pickMode) return;
                    pulse(l.userId);
                    setDetail(l);
                  }}
                  icon={{
                    path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                    fillColor: l.status === "online" ? "#16a34a" : "#f59e0b",
                    fillOpacity: 1,
                    strokeWeight: routeVisible ? 3 : tapped ? 2.5 : 1.5,
                    strokeColor: routeVisible || tapped ? "#6d28d9" : "#ffffff",
                    scale: routeVisible ? 7 : tapped ? 8 : 5.5,
                    rotation: l.heading ?? 0,
                  }}
                  title={l.user.name}
                  zIndex={tapped ? 1000 : 1}
                />
              );
            }

            const count = cluster.members.length;
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
                  fillColor: hasOnline ? "#16a34a" : "#f59e0b",
                  fillOpacity: 1,
                  strokeWeight: tapped ? 3 : 2,
                  strokeColor: tapped ? "#6d28d9" : "#ffffff",
                  scale: Math.min(20, 11 + count * 1.5),
                }}
                label={{
                  text: String(count),
                  color: "#ffffff",
                  fontSize: count > 9 ? "11px" : "13px",
                  fontWeight: "700",
                }}
                title={`${count} členovia na tomto mieste`}
                zIndex={tapped ? 1000 : 10 + count}
              />
            );
          })}
          {meetingPoints.map((m) => {
            const tapped = isPulsing(m.id);
            const isActive = m.id === activeMeetingId;
            return (
            <MarkerF
              key={m.id}
              position={{ lat: m.latitude, lng: m.longitude }}
              onClick={() => {
                if (pickMode) return;
                pulse(m.id);
                setMeetingDetail(m);
              }}
              label={{ text: "📍", fontSize: tapped ? "24px" : "20px", fontWeight: "700" }}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: tapped ? 22 : 18,
                fillColor: isActive ? "#7c3aed" : "#ffffff",
                fillOpacity: isActive ? 0.22 : 0.9,
                strokeWeight: tapped ? 3 : isActive ? 2.5 : 2,
                strokeColor: isActive || tapped ? "#6d28d9" : "#d4d4d8",
              }}
              title={`Stretnutie: ${m.title}${canManageMeetingPoint(user, m) ? " – klepni pre úpravu" : " – klepni pre detail"}`}
              zIndex={isActive ? 900 : tapped ? 850 : 40}
            />
            );
          })}
          {routeLines
            .filter((line) => line.path.length >= 2 && !line.error)
            .map((line) => (
            <PolylineF
              key={line.userId}
              path={line.path}
              options={{
                strokeColor: line.userId === user?.id ? "#6d28d9" : "#2563eb",
                strokeOpacity: line.loading ? 0.35 : 0.85,
                strokeWeight: line.userId === user?.id ? 5 : 4,
                geodesic: false,
              }}
            />
          ))}
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

      {activeMeeting && !pickMode && (
        <div className="map-overlay-bottom-left">
          <div className="map-route-nav">
            <div className="map-route-nav__head">
              <div className="map-route-nav__info">
                <span className="map-route-nav__title">
                  {activeMeeting.title}
                  {myRouteVisible
                    ? " · tvoja trasa"
                    : routeUserIds.length > 0
                      ? ` · ${routeUserIds.length} ${routeUserIds.length === 1 ? "trasa" : "trasy"}`
                      : " · navigácia k zrazu"}
                </span>
                {routeUserIds.length > 0 && (
                  <span className="map-route-nav__meta" role="status" aria-live="polite">
                    {primaryLoading ? (
                      <>
                        <span className="spinner spinner--sm" aria-hidden />
                        počítam trasu…
                      </>
                    ) : primaryEta && primaryDistance ? (
                      <>
                        <span className="map-route-nav__eta">{primaryEta}</span>
                        <span className="map-route-nav__sep">·</span>
                        <span className="map-route-nav__dist">{primaryDistance}</span>
                      </>
                    ) : primaryEta ? (
                      <span className="map-route-nav__eta">{primaryEta}</span>
                    ) : (
                      <span className="map-route-nav__eta map-route-nav__eta--muted">—</span>
                    )}
                    {primaryRoute?.who && (
                      <span className="map-route-nav__who"> · {primaryRoute.who}</span>
                    )}
                  </span>
                )}
              </div>
              <button className="btn btn--icon" onClick={clearActiveMeeting} aria-label="Skryť navigáciu">
                <CloseIcon size={16} />
              </button>
            </div>
            <div className="map-route-nav__actions">
              {canToggleMyRoute && (
                <button
                  type="button"
                  className={`chip chip--route-toggle${myRouteVisible ? " is-active" : ""}`}
                  onClick={() => user && toggleRouteUser(user.id)}
                >
                  {myRouteVisible ? "Skryť moju trasu" : "Moja trasa"}
                </button>
              )}
              <button
                className="btn btn--sm btn--ghost"
                onClick={() => setMeetingDetail(activeMeeting)}
              >
                Zoznam
              </button>
            </div>
            {!canToggleMyRoute &&
              user &&
              meetingTargetIds.has(user.id) &&
              !isLocationFreshForRoute(myLoc) && (
                <p className="map-route-nav__hint map-route-nav__hint--warn">
                  Čaká sa na aktuálnu GPS polohu.
                </p>
              )}
            {!routeError && routeUserIds.length > 0 && !primaryEta && !primaryLoading && myRouteVisible && (
              <p className="map-route-nav__hint map-route-nav__hint--warn">
                Nepodarilo sa vypočítať ETA trasy.
              </p>
            )}
            {!routeError && otherRouteSummaries.length > 0 && (
              <div className="map-route-nav__others">
                {otherRouteSummaries.map((item) => (
                  <span key={item.userId} className="map-route-nav__other">
                    {item.name}: {item.summary}
                  </span>
                ))}
              </div>
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
          routeVisible={meetingDetail.id === activeMeeting?.id && myRouteVisible}
          routeSummary={
            meetingDetail.id === activeMeeting?.id
              ? primaryLoading
                ? "počítam trasu…"
                : primaryEta && primaryDistance
                  ? `${primaryEta} · ${primaryDistance}`
                  : primaryEta
              : null
          }
          onClose={() => setMeetingDetail(null)}
          onToggleRoute={() => {
            if (meetingDetail.id === activeMeetingId && myRouteVisible && user) {
              toggleRouteUser(user.id);
            } else if (meetingDetail.id !== activeMeetingId) {
              focusMeeting(meetingDetail.id);
            } else if (user && !myRouteVisible) {
              toggleRouteUser(user.id);
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
          onClose={() => setClusterPick(null)}
          onSelect={(loc) => {
            setClusterPick(null);
            setDetail(loc);
          }}
        />
      )}

      {detail && (
        <Sheet title={detail.user.name} onClose={() => setDetail(null)}>
          <div className="stack sheet-member-pop">
            <div className="row">
              <Avatar name={detail.user.name} />
              <div className="grow">
                <div className="list-row__title">
                  <StatusDot status={detail.status} />
                  {detail.status === "online" ? "Online" : "Posledná poloha"}
                  <RoleBadge role={detail.user.role} />
                </div>
                <div className="list-row__sub">Aktualizované {fromNow(detail.updatedAt)}</div>
              </div>
            </div>
            {activeMeeting && meetingTargetIds.has(detail.userId) && detail.userId !== user?.id ? (
              (() => {
                const routeFresh = isLocationFreshForRoute(detail);
                const routeVisible = routeUserIds.includes(detail.userId);
                return (
                  <>
                    {routeFresh ? (
                      <>
                        <p className="hint">
                          {routeVisible
                            ? "Trasa k zrazu je zobrazená na mape."
                            : "Tu môžeš zobraziť trasu tohto člena k zrazu na mape."}
                        </p>
                        <button
                          className={`btn btn--block${routeVisible ? "" : " btn--primary"}`}
                          onClick={() => toggleRouteUser(detail.userId)}
                        >
                          {routeVisible ? "Skryť trasu k zrazu" : "Zobraziť trasu k zrazu"}
                        </button>
                      </>
                    ) : (
                      <p className="hint" style={{ color: "var(--warn)" }}>
                        {staleLocationRouteHint(false)}
                      </p>
                    )}
                  </>
                );
              })()
            ) : null}
            <div className="row">
              <button className="btn grow" onClick={centerOnDetail} disabled={detailCenterBusy}>
                {detailCenterBusy ? "Centrujem…" : "Vycentrovať"}
              </button>
              <button
                className="btn btn--primary grow"
                onClick={() => {
                  openPing({ scope: "USER", targetIds: [detail.userId], label: detail.user.name });
                  setDetail(null);
                }}
              >
                Pingnúť
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
