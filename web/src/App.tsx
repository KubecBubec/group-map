import { useEffect, useState, type ReactNode } from "react";
import { CoordinatorProvider, useCoordinator } from "./lib/coordinator";
import { Login } from "./components/Login";
import { Onboarding } from "./components/Onboarding";
import { PingSheet } from "./components/PingSheet";
import { MapView } from "./views/MapView";
import { MembersView } from "./views/MembersView";
import { GroupsView } from "./views/GroupsView";
import { MeetingsView } from "./views/MeetingsView";
import { MoreView } from "./views/MoreView";
import { BellIcon, LayersIcon, MapIcon, MoreIcon, PinIcon, UsersIcon } from "./components/icons";

type Tab = "map" | "members" | "groups" | "meetings" | "more";

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: "map", label: "Mapa", icon: <MapIcon /> },
  { id: "members", label: "Členovia", icon: <UsersIcon /> },
  { id: "groups", label: "Skupiny", icon: <LayersIcon /> },
  { id: "meetings", label: "Body", icon: <PinIcon /> },
  { id: "more", label: "Viac", icon: <MoreIcon /> },
];

const TAB_TITLE: Record<Tab, string> = {
  map: "Živá mapa",
  members: "Členovia",
  groups: "Skupiny",
  meetings: "Body stretnutia",
  more: "Viac",
};

function Shell() {
  const [tab, setTab] = useState<Tab>("map");
  const { selectedUserIds, openPing, focusTarget, meetingPickNonce, meetingMoveNonce, activeMeetingId } =
    useCoordinator();

  useEffect(() => {
    if (focusTarget) setTab("map");
  }, [focusTarget]);

  useEffect(() => {
    if (meetingPickNonce) setTab("map");
  }, [meetingPickNonce]);

  useEffect(() => {
    if (meetingMoveNonce) setTab("map");
  }, [meetingMoveNonce]);

  useEffect(() => {
    if (activeMeetingId) setTab("map");
  }, [activeMeetingId]);

  return (
    <div className="shell">
      <nav className="nav">
        <div className="nav__brand">
          <span style={{ fontSize: 22 }}>🧭</span> Koordinátor
        </div>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`nav__item${tab === t.id ? " is-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span style={{ position: "relative", display: "flex" }}>
              {t.icon}
              {t.id === "members" && selectedUserIds.length > 0 && (
                <span className="nav__badge">{selectedUserIds.length}</span>
              )}
            </span>
            <span className="nav__label">{t.label}</span>
          </button>
        ))}
      </nav>

      <div className="shell__main">
        <div className="topbar">
          <div>
            <div className="topbar__title">{TAB_TITLE[tab]}</div>
          </div>
          <div className="topbar__actions">
            <button
              className="btn btn--icon"
              aria-label="Pingnúť"
              onClick={() => openPing({ scope: "ALL", targetIds: [], label: "všetci" })}
            >
              <BellIcon />
            </button>
          </div>
        </div>

        <div className="shell__body">
          <div className={`map-host${tab === "map" ? " map-host--visible" : ""}`}>
            <MapView isActive={tab === "map"} />
          </div>
          {tab !== "map" && (
            <div className="tab-panel">
              {tab === "members" && <MembersView />}
              {tab === "groups" && <GroupsView />}
              {tab === "meetings" && <MeetingsView />}
              {tab === "more" && <MoreView />}
            </div>
          )}
        </div>
      </div>

      <PingSheet />
    </div>
  );
}

function Root() {
  const { token, ready, authError, acceptToken, enableGeoTracking } = useCoordinator();
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem("onboarded") === "1");

  if (!token) return <Login error={authError} onLogin={acceptToken} />;

  if (!ready) {
    return (
      <div className="center-screen">
        <div className="spinner" />
        <p className="muted">Načítavam…</p>
      </div>
    );
  }

  if (!onboarded) {
    return (
      <Onboarding
        enableGeoTracking={enableGeoTracking}
        onComplete={() => {
          localStorage.setItem("onboarded", "1");
          setOnboarded(true);
        }}
      />
    );
  }

  return <Shell />;
}

export default function App() {
  return (
    <CoordinatorProvider>
      <Root />
    </CoordinatorProvider>
  );
}
