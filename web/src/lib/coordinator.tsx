import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { apiFetch, getSocketUrl, getToken, setToken } from "./api";
import { enablePushNotifications, showLocalNotification } from "./notifications";
import {
  geoLog,
  geolocationErrorLabel,
  getCurrentPositionLogged,
  logGeoEnvironment,
  readGeoPermission,
} from "./geoDebug";
import {
  hasGeoConsent,
  setGeoConsent,
  type GeoPermissionState,
} from "./geoConsent";
import type {
  AuthUser,
  FeatureConfig,
  Group,
  LatLng,
  LocationRow,
  MeetingPoint,
  MeetingScope,
  Priority,
  PingScope,
  Role,
  SearchUser,
} from "./types";

export interface PingTarget {
  scope: PingScope;
  targetIds: string[];
  label: string;
}

interface CoordinatorValue {
  token: string | null;
  user: AuthUser | null;
  users: SearchUser[];
  locations: LocationRow[];
  groups: Group[];
  meetingPoints: MeetingPoint[];
  config: FeatureConfig | null;
  myPos: LatLng | null;
  geoPermission: GeoPermissionState;
  geoConsentGranted: boolean;
  geoDiagNonce: number;
  selectedUserIds: string[];
  focusTarget: { id: string; nonce: number } | null;
  meetingPickNonce: number | null;
  meetingMoveId: string | null;
  meetingMoveNonce: number | null;
  activeMeetingId: string | null;
  pingTarget: PingTarget | null;
  authError: string | null;
  ready: boolean;
  acceptToken: (token: string) => void;
  isAdmin: boolean;
  isLeader: boolean;
  locationByUser: Record<string, LocationRow>;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
  focusUser: (id: string) => void;
  requestMeetingPick: () => void;
  requestMeetingMove: (id: string) => void;
  clearMeetingMove: () => void;
  focusMeeting: (id: string) => void;
  clearActiveMeeting: () => void;
  requestMyLocation: (reason: string) => Promise<LatLng>;
  enableGeoTracking: () => Promise<void>;
  refreshGeoDiagnostics: () => void;
  openPing: (target: PingTarget) => void;
  closePing: () => void;
  refresh: () => Promise<void>;
  logout: () => void;
  createGroup: (name: string) => Promise<void>;
  addMember: (groupId: string, userId: string) => Promise<void>;
  removeMember: (groupId: string, userId: string) => Promise<void>;
  createMeetingPoint: (input: {
    title: string;
    scope: MeetingScope;
    targetIds: string[];
    position: LatLng;
  }) => Promise<void>;
  moveMeetingPoint: (id: string, position: LatLng) => Promise<void>;
  updateMeetingPoint: (id: string, patch: { title?: string }) => Promise<void>;
  cancelMeetingPoint: (id: string) => Promise<void>;
  sendPing: (input: {
    scope: PingScope;
    targetIds: string[];
    message: string;
    priority: Priority;
  }) => Promise<void>;
  setRole: (userId: string, role: Role) => Promise<void>;
  updateConfig: (patch: Partial<FeatureConfig>) => Promise<void>;
  createIncident: (title: string, targetUserId?: string) => Promise<void>;
}

const CoordinatorContext = createContext<CoordinatorValue | undefined>(undefined);

export function useCoordinator(): CoordinatorValue {
  const ctx = useContext(CoordinatorContext);
  if (!ctx) throw new Error("useCoordinator must be used within CoordinatorProvider");
  return ctx;
}

export function CoordinatorProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(getToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [meetingPoints, setMeetingPoints] = useState<MeetingPoint[]>([]);
  const [config, setConfig] = useState<FeatureConfig | null>(null);
  const [myPos, setMyPos] = useState<LatLng | null>(null);
  const [geoPermission, setGeoPermission] = useState<GeoPermissionState>("unsupported");
  const [geoConsentGranted, setGeoConsentGranted] = useState(() => hasGeoConsent());
  const [geoDiagNonce, setGeoDiagNonce] = useState(0);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [focusTarget, setFocusTarget] = useState<{ id: string; nonce: number } | null>(null);
  const [meetingPickNonce, setMeetingPickNonce] = useState<number | null>(null);
  const [meetingMoveId, setMeetingMoveId] = useState<string | null>(null);
  const [meetingMoveNonce, setMeetingMoveNonce] = useState<number | null>(null);
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [pingTarget, setPingTarget] = useState<PingTarget | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [lastPing, setLastPing] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const userIdRef = useRef<string | null>(null);
  const geoWatchIdRef = useRef<number | null>(null);
  const geoWatchLoggedRef = useRef(false);
  userIdRef.current = user?.id ?? null;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthToken = params.get("token");
    const oauthError = params.get("oauth_error");
    if (oauthError) {
      setAuthError("Prihlásenie cez Google zlyhalo. Skús to znova.");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (oauthToken) {
      setToken(oauthToken);
      setTokenState(oauthToken);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) return;
    const [meData, locationsData, groupsData, mpData, usersData] = await Promise.all([
      apiFetch<{ user: AuthUser }>("/me"),
      apiFetch<LocationRow[]>("/locations/latest"),
      apiFetch<Group[]>("/groups"),
      apiFetch<MeetingPoint[]>("/meeting-points"),
      apiFetch<SearchUser[]>("/users/search"),
    ]);
    setUser(meData.user);
    setLocations(locationsData);
    setGroups(groupsData);
    setMeetingPoints(mpData);
    setUsers(usersData);
    if (meData.user.role === "ADMIN") {
      try {
        setConfig(await apiFetch<FeatureConfig>("/admin/config"));
      } catch {
        setConfig(null);
      }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!token) {
      setReady(true);
      return;
    }
    setReady(false);
    refresh().catch((e) => {
      console.error(e);
      setReady(true);
    });

    const socket = io(getSocketUrl(), { path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;

    const softRefreshLocations = () => {
      apiFetch<LocationRow[]>("/locations/latest").then(setLocations).catch(() => {});
    };

    socket.on("user:new", (u: SearchUser) => {
      setUsers((prev) => {
        if (prev.some((x) => x.id === u.id)) return prev;
        return [...prev, u].sort((a, b) => a.name.localeCompare(b.name));
      });
    });

    socket.on("user:updated", (u: AuthUser) => {
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, ...u } : x)));
      setUser((prev) => (prev?.id === u.id ? { ...prev, ...u } : prev));
    });

    const applyGroup = (g: Group) => {
      const myId = userIdRef.current;
      const iAmMember = Boolean(myId && g.memberships?.some((m) => m.userId === myId));

      setGroups((prev) => {
        if (!iAmMember) return prev.filter((x) => x.id !== g.id);
        if (prev.some((x) => x.id === g.id)) return prev.map((x) => (x.id === g.id ? g : x));
        return [...prev, g];
      });

      setUsers((prev) =>
        prev.map((u) => {
          const mem = g.memberships?.find((m) => m.userId === u.id);
          const rest = (u.memberships ?? []).filter((m) => m.groupId !== g.id);
          if (mem) return { ...u, memberships: [...rest, mem] };
          return { ...u, memberships: rest };
        }),
      );
    };

    socket.on("group:new", applyGroup);
    socket.on("group:updated", applyGroup);

    socket.on("location:update", softRefreshLocations);
    socket.on("meeting-point:new", () => {
      apiFetch<MeetingPoint[]>("/meeting-points").then(setMeetingPoints).catch(() => {});
    });
    socket.on("meeting-point:updated", (mp: MeetingPoint) => {
      setMeetingPoints((prev) => prev.map((x) => (x.id === mp.id ? mp : x)));
    });
    socket.on("meeting-point:deleted", ({ id }: { id: string }) => {
      setMeetingPoints((prev) => prev.filter((x) => x.id !== id));
      setActiveMeetingId((prev) => (prev === id ? null : prev));
    });
    socket.on("ping:new", (ping: {
      priority: Priority;
      message: string;
      senderName?: string;
      recipientIds?: string[];
    }) => {
      const uid = userIdRef.current;
      if (!uid || !ping.recipientIds?.includes(uid)) return;
      const title = ping.senderName ? `${ping.senderName} · ${ping.priority}` : `Ping · ${ping.priority}`;
      setLastPing(`[${ping.priority}] ${ping.message}`);
      showLocalNotification(title, ping.message);
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, refresh]);

  useEffect(() => {
    if (!token || !ready) return;
    enablePushNotifications().catch(() => {});
    logGeoEnvironment(Boolean(myPos));
  }, [token, ready]);

  const applyMyPosition = useCallback((pos: GeolocationPosition, source: string) => {
    const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    setMyPos(next);
    if (source === "watch") {
      if (!geoWatchLoggedRef.current) {
        geoWatchLoggedRef.current = true;
        geoLog("watch:first_position", next);
      }
    } else {
      geoLog(`${source}:apply`, next);
    }
    apiFetch("/locations", {
      method: "POST",
      body: JSON.stringify({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        heading: pos.coords.heading ?? undefined,
        accuracy: pos.coords.accuracy,
      }),
    }).catch((e) => geoLog(`${source}:api_post_failed`, String(e), "warn"));
    return next;
  }, []);

  const requestMyLocation = useCallback(async (reason: string) => {
    const pos = await getCurrentPositionLogged(reason);
    return applyMyPosition(pos, reason);
  }, [applyMyPosition]);

  const refreshGeoDiagnostics = useCallback(() => {
    setGeoDiagNonce(Date.now());
  }, []);

  const stopGeoWatch = useCallback(() => {
    if (geoWatchIdRef.current == null) return;
    geoLog("watch:stop");
    navigator.geolocation.clearWatch(geoWatchIdRef.current);
    geoWatchIdRef.current = null;
    geoWatchLoggedRef.current = false;
  }, []);

  const startGeoWatch = useCallback(() => {
    if (!navigator.geolocation || geoWatchIdRef.current != null) return;
    geoLog("watch:start");
    geoWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        applyMyPosition(pos, "watch");
      },
      (err) => {
        geoLog(
          "watch:error",
          {
            code: err.code,
            label: geolocationErrorLabel(err.code),
            message: err.message,
          },
          "error",
        );
        if (err.code === 1) {
          void readGeoPermission().then((perm) => setGeoPermission(perm as GeoPermissionState));
        }
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
  }, [applyMyPosition]);

  const syncGeoTracking = useCallback(async () => {
    const perm = (await readGeoPermission()) as GeoPermissionState;
    const consented = hasGeoConsent();
    setGeoPermission(perm);
    setGeoConsentGranted(consented);

    if (perm === "granted") {
      if (!consented) {
        setGeoConsent(true);
        setGeoConsentGranted(true);
      }
      startGeoWatch();
      return;
    }

    if (perm === "denied") {
      stopGeoWatch();
      return;
    }

    if (consented) {
      startGeoWatch();
      return;
    }

    stopGeoWatch();
  }, [startGeoWatch, stopGeoWatch]);

  const enableGeoTracking = useCallback(async () => {
    setGeoConsent(true);
    setGeoConsentGranted(true);
    try {
      await requestMyLocation("enable_geo");
    } catch {
      /* používateľ môže v dialógu prehliadača odmietnuť */
    }
    startGeoWatch();
    await syncGeoTracking();
    refreshGeoDiagnostics();
  }, [requestMyLocation, startGeoWatch, syncGeoTracking, refreshGeoDiagnostics]);

  useEffect(() => {
    if (!token) {
      stopGeoWatch();
      return;
    }

    void syncGeoTracking();

    let permissionStatus: PermissionStatus | null = null;
    void navigator.permissions
      ?.query({ name: "geolocation" })
      .then((status) => {
        permissionStatus = status;
        status.onchange = () => {
          void syncGeoTracking();
        };
      })
      .catch(() => {});

    return () => {
      if (permissionStatus) permissionStatus.onchange = null;
      stopGeoWatch();
    };
  }, [token, syncGeoTracking, stopGeoWatch]);

  useEffect(() => {
    if (!lastPing) return;
    const t = setTimeout(() => setLastPing(null), 6000);
    return () => clearTimeout(t);
  }, [lastPing]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);
  const clearSelection = useCallback(() => setSelectedUserIds([]), []);
  const isSelected = useCallback(
    (id: string) => selectedUserIds.includes(id),
    [selectedUserIds],
  );
  const focusUser = useCallback((id: string) => {
    setFocusTarget({ id, nonce: Date.now() });
  }, []);
  const requestMeetingPick = useCallback(() => {
    setMeetingMoveId(null);
    setMeetingMoveNonce(null);
    setMeetingPickNonce(Date.now());
  }, []);
  const requestMeetingMove = useCallback((id: string) => {
    setMeetingMoveId(id);
    setMeetingMoveNonce(Date.now());
  }, []);
  const clearMeetingMove = useCallback(() => {
    setMeetingMoveId(null);
    setMeetingMoveNonce(null);
  }, []);
  const focusMeeting = useCallback((id: string) => {
    setActiveMeetingId(id);
  }, []);
  const clearActiveMeeting = useCallback(() => {
    setActiveMeetingId(null);
  }, []);
  const openPing = useCallback((target: PingTarget) => setPingTarget(target), []);
  const closePing = useCallback(() => setPingTarget(null), []);

  const acceptToken = useCallback((value: string) => {
    setToken(value);
    setTokenState(value);
    setReady(false);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setTokenState(null);
    setUser(null);
    setLocations([]);
    setGroups([]);
    setMeetingPoints([]);
    setUsers([]);
    setConfig(null);
    setSelectedUserIds([]);
    setActiveMeetingId(null);
    setMeetingMoveId(null);
    setMeetingMoveNonce(null);
  }, []);

  const createGroup = useCallback(
    async (name: string) => {
      await apiFetch("/groups", { method: "POST", body: JSON.stringify({ name }) });
      await refresh();
    },
    [refresh],
  );
  const addMember = useCallback(
    async (groupId: string, userId: string) => {
      await apiFetch(`/groups/${groupId}/members`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      await refresh();
    },
    [refresh],
  );
  const removeMember = useCallback(
    async (groupId: string, userId: string) => {
      await apiFetch(`/groups/${groupId}/members/${userId}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );
  const createMeetingPoint = useCallback(
    async (input: { title: string; scope: MeetingScope; targetIds: string[]; position: LatLng }) => {
      const created = await apiFetch<MeetingPoint>("/meeting-points", {
        method: "POST",
        body: JSON.stringify({
          title: input.title,
          scope: input.scope,
          targetIds: input.targetIds,
          latitude: input.position.lat,
          longitude: input.position.lng,
        }),
      });
      const mp = await apiFetch<MeetingPoint[]>("/meeting-points");
      setMeetingPoints(mp);
      setActiveMeetingId(created.id);
    },
    [],
  );
  const moveMeetingPoint = useCallback(async (id: string, position: LatLng) => {
    const updated = await apiFetch<MeetingPoint>(`/meeting-points/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        latitude: position.lat,
        longitude: position.lng,
      }),
    });
    setMeetingPoints((prev) => prev.map((x) => (x.id === id ? updated : x)));
    setActiveMeetingId((prev) => (prev === id ? id : prev));
  }, []);
  const updateMeetingPoint = useCallback(async (id: string, patch: { title?: string }) => {
    const updated = await apiFetch<MeetingPoint>(`/meeting-points/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    setMeetingPoints((prev) => prev.map((x) => (x.id === id ? updated : x)));
  }, []);
  const cancelMeetingPoint = useCallback(async (id: string) => {
    await apiFetch(`/meeting-points/${id}`, { method: "DELETE" });
    setMeetingPoints((prev) => prev.filter((x) => x.id !== id));
    setActiveMeetingId((prev) => (prev === id ? null : prev));
  }, []);
  const sendPing = useCallback(
    async (input: { scope: PingScope; targetIds: string[]; message: string; priority: Priority }) => {
      await apiFetch("/pings", { method: "POST", body: JSON.stringify(input) });
    },
    [],
  );
  const setRole = useCallback(
    async (userId: string, role: Role) => {
      await apiFetch(`/roles/${userId}`, { method: "POST", body: JSON.stringify({ role }) });
      await refresh();
    },
    [refresh],
  );
  const updateConfig = useCallback(async (patch: Partial<FeatureConfig>) => {
    const next = await apiFetch<FeatureConfig>("/admin/config", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    setConfig(next);
  }, []);
  const createIncident = useCallback(async (title: string, targetUserId?: string) => {
    await apiFetch("/incidents", {
      method: "POST",
      body: JSON.stringify({ title, targetUserId }),
    });
  }, []);

  const locationByUser = useMemo(() => {
    const map: Record<string, LocationRow> = {};
    for (const loc of locations) map[loc.userId] = loc;
    return map;
  }, [locations]);

  const value: CoordinatorValue = {
    token,
    user,
    users,
    locations,
    groups,
    meetingPoints,
    config,
    myPos,
    geoPermission,
    geoConsentGranted,
    geoDiagNonce,
    selectedUserIds,
    focusTarget,
    meetingPickNonce,
    meetingMoveId,
    meetingMoveNonce,
    activeMeetingId,
    pingTarget,
    authError,
    ready,
    acceptToken,
    isAdmin: user?.role === "ADMIN",
    isLeader: user?.role === "ADMIN" || user?.role === "MAIN_LEADER" || user?.role === "LEADER",
    locationByUser,
    toggleSelect,
    clearSelection,
    isSelected,
    focusUser,
    requestMeetingPick,
    requestMeetingMove,
    clearMeetingMove,
    focusMeeting,
    clearActiveMeeting,
    requestMyLocation,
    enableGeoTracking,
    refreshGeoDiagnostics,
    openPing,
    closePing,
    refresh,
    logout,
    createGroup,
    addMember,
    removeMember,
    createMeetingPoint,
    moveMeetingPoint,
    updateMeetingPoint,
    cancelMeetingPoint,
    sendPing,
    setRole,
    updateConfig,
    createIncident,
  };

  return (
    <CoordinatorContext.Provider value={value}>
      {children}
      {lastPing && <div className="toast">🔔 {lastPing}</div>}
    </CoordinatorContext.Provider>
  );
}
