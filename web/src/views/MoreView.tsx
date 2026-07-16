import { useState } from "react";
import { useCoordinator } from "../lib/coordinator";
import { enablePushNotifications, getNotificationStatus, type NotificationStatus } from "../lib/notifications";
import { geoPermissionLabel } from "../lib/geoConsent";
import { Avatar, RoleBadge, Toggle } from "../components/ui";
import { LogoutIcon, ShieldIcon } from "../components/icons";
import { Onboarding } from "../components/Onboarding";
import { ApiUsagePanel } from "../components/ApiUsagePanel";
import { GeoDiagnosticsPanel } from "../components/GeoDiagnosticsPanel";
import type { FeatureConfig, Role } from "../lib/types";

const ROLES: { value: Role; label: string }[] = [
  { value: "MEMBER", label: "Účastník" },
  { value: "LEADER", label: "Vedúci" },
  { value: "MAIN_LEADER", label: "Hlavný vedúci" },
  { value: "ADMIN", label: "Admin" },
];

const FEATURE_TOGGLES: {
  key: "routesEnabled" | "placesEnabled" | "auditTrailEnabled" | "incidentEnabled";
  title: string;
  sub: string;
}[] = [
  { key: "routesEnabled", title: "Presné ETA (Routes API)", sub: "Presnejší odhad chôdze v ETA. Trasy na mape idú vždy cez Directions API." },
  { key: "placesEnabled", title: "Vyhľadávanie miest (Places)", sub: "Body záujmu na mape. Vyššie náklady na API." },
  { key: "auditTrailEnabled", title: "Audit trail", sub: "História polôh členov. Citlivé – zapínať uvážlivo." },
  { key: "incidentEnabled", title: "Incident mód", sub: "Núdzové sledovanie počas krízovej situácie." },
];

const NOTIF_LABEL: Record<NotificationStatus, string> = {
  unsupported: "Zariadenie nepodporuje push notifikácie",
  disabled: "Vyžaduje HTTPS a ikonu na ploche (nie http://IP)",
  default: "Notifikácie ešte nie sú povolené",
  granted: "Notifikácie sú zapnuté",
  denied: "Notifikácie sú v systéme vypnuté",
};

export function MoreView() {
  const {
    user,
    isAdmin,
    config,
    users,
    logout,
    setRole,
    updateConfig,
    createIncident,
    geoPermission,
    geoConsentGranted,
    enableGeoTracking,
  } = useCoordinator();
  const [showHelp, setShowHelp] = useState(false);
  const [notifStatus, setNotifStatus] = useState<NotificationStatus>(() => getNotificationStatus());
  const [roleUser, setRoleUser] = useState("");
  const [roleValue, setRoleValue] = useState<Role>("LEADER");
  const [promoteUser, setPromoteUser] = useState("");
  const [incidentTitle, setIncidentTitle] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [budgetInput, setBudgetInput] = useState("");

  const isPlainLeader = user?.role === "LEADER";
  const memberCandidates = users.filter((u) => u.role === "MEMBER" && u.id !== user?.id);

  if (showHelp) {
    return <Onboarding onComplete={() => setShowHelp(false)} />;
  }

  return (
    <div className="page">
      <div className="page__inner">
        <div className="card">
          <div className="row">
            <Avatar name={user?.name ?? "?"} />
            <div className="grow">
              <div className="list-row__title">
                {user?.name}
                {user && <RoleBadge role={user.role} />}
              </div>
              <div className="list-row__sub">{user?.email}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <p className="section-title">Diagnostika (GPS + trasy)</p>
          <p className="hint" style={{ marginBottom: 12 }}>
            Log udalostí pre GPS a trasy k zrazu. Pri chybe trasy skopíruj log a pozri aj server (
            <code>docker compose logs api</code>).
          </p>
          <GeoDiagnosticsPanel />
        </div>

        <div className="card">
          <p className="section-title">Zdieľanie polohy</p>
          <p className="hint" style={{ marginBottom: 12 }}>
            {geoPermissionLabel(geoPermission, geoConsentGranted)}
          </p>
          <p className="hint" style={{ marginBottom: 12 }}>
            Povolenie ukladá <strong>prehliadač</strong> pre konkrétnu adresu (napr.{" "}
            <code>{window.location.host}</code>). Ak sa URL mení (iná IP, nový tunel), musíš povoliť
            znova. Najspoľahlivejšie: pridaj appku na plochu a otváraj vždy z tej istej ikony.
          </p>
          <button
            className="btn btn--primary btn--block"
            style={{ marginBottom: 8 }}
            disabled={geoPermission === "denied"}
            onClick={async () => {
              await enableGeoTracking();
              setMsg("Poloha aktualizovaná. Ak sa zobrazil systémový dialóg, potvrď Povoliť.");
            }}
          >
            📍 {geoPermission === "granted" ? "Obnoviť polohu" : "Povoliť zdieľanie polohy"}
          </button>
        </div>

        <div className="card">
          <p className="section-title">Notifikácie</p>
          <p className="hint" style={{ marginBottom: 12 }}>
            {NOTIF_LABEL[notifStatus]}
          </p>
          {notifStatus === "disabled" && (
            <p className="hint" style={{ marginBottom: 12 }}>
              Na iPhone: pridaj appku na plochu cez Safari a otvor ju z ikony. Push funguje od iOS 16.4
              len cez HTTPS (nie cez lokálnu IP v sieti).
            </p>
          )}
          <button
            className="btn btn--primary btn--block"
            style={{ marginBottom: 8 }}
            disabled={notifStatus === "unsupported" || notifStatus === "denied"}
            onClick={async () => {
              const next = await enablePushNotifications();
              setNotifStatus(next);
              if (next === "granted") setMsg("Notifikácie zapnuté.");
            }}
          >
            🔔 Povoliť notifikácie
          </button>
        </div>

        <div className="card">
          <p className="section-title">Aplikácia</p>
          <button className="btn btn--block" onClick={() => setShowHelp(true)} style={{ marginBottom: 8 }}>
            📲 Návod na inštaláciu
          </button>
          <button className="btn btn--danger btn--block" onClick={logout}>
            <LogoutIcon /> Odhlásiť sa
          </button>
        </div>

        {isPlainLeader && (
          <div className="card">
            <p className="section-title">Pridať vedúceho</p>
            <p className="hint" style={{ marginBottom: 12 }}>
              Môžeš povýšiť účastníka na vedúceho. Ostatné roly nemeniteľ.
            </p>
            <div className="stack">
              <select className="select" value={promoteUser} onChange={(e) => setPromoteUser(e.target.value)}>
                <option value="">— vyber účastníka —</option>
                {memberCandidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <button
                className="btn btn--primary btn--block"
                disabled={!promoteUser}
                onClick={async () => {
                  try {
                    await setRole(promoteUser, "LEADER");
                    setPromoteUser("");
                    setMsg("Vedúci pridaný.");
                  } catch (e) {
                    setMsg(e instanceof Error ? e.message : "Nepodarilo sa pridať vedúceho.");
                  }
                }}
              >
                Nastaviť ako vedúceho
              </button>
              {memberCandidates.length === 0 && (
                <p className="hint">Momentálne nie je žiadny účastník na povýšenie.</p>
              )}
            </div>
          </div>
        )}

        {isAdmin && (
          <>
            <div className="card">
              <div className="card__head">
                <div>
                  <h3 className="card__title">Google API – spotreba a náklady</h3>
                  <p className="card__sub">Meraná spotreba v aplikácii a odhad podľa publikovaných cien.</p>
                </div>
              </div>
              <ApiUsagePanel />
            </div>

            <div className="card">
              <p className="section-title">Interný mesačný limit</p>
              <p className="hint" style={{ marginBottom: 12 }}>
                Voliteľný limit pre varovanie (nie hard stop). Presná fakturácia je v Google Cloud.
              </p>
              <div className="stack">
                <input
                  className="input"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="napr. 50 (USD po kredite)"
                  value={budgetInput || (config?.monthlyBudgetUsd != null ? String(config.monthlyBudgetUsd) : "")}
                  onChange={(e) => setBudgetInput(e.target.value)}
                />
                <button
                  className="btn btn--primary btn--block"
                  onClick={async () => {
                    const raw = budgetInput.trim();
                    const monthlyBudgetUsd = raw === "" ? null : Number(raw);
                    if (raw !== "" && (Number.isNaN(monthlyBudgetUsd) || monthlyBudgetUsd! < 0)) {
                      setMsg("Zadaj platnú sumu v USD.");
                      return;
                    }
                    await updateConfig({ monthlyBudgetUsd });
                    setBudgetInput("");
                    setMsg("Limit uložený.");
                  }}
                >
                  Uložiť limit
                </button>
              </div>
            </div>

            <div className="card">
              <div className="card__head">
                <div>
                  <h3 className="card__title">
                    <ShieldIcon /> Funkcie a náklady
                  </h3>
                  <p className="card__sub">Zapínaj drahé alebo citlivé funkcie podľa potreby.</p>
                </div>
              </div>
              {config ? (
                FEATURE_TOGGLES.map((f) => (
                  <div className="toggle-row" key={f.key}>
                    <div>
                      <div className="toggle-row__title">{f.title}</div>
                      <div className="toggle-row__sub">{f.sub}</div>
                    </div>
                    <Toggle
                      checked={config[f.key]}
                      onChange={(v) => updateConfig({ [f.key]: v } as Partial<FeatureConfig>)}
                    />
                  </div>
                ))
              ) : (
                <p className="hint">Načítavam konfiguráciu…</p>
              )}
            </div>

            <div className="card">
              <p className="section-title">Roly účastníkov</p>
              <div className="stack">
                <select className="select" value={roleUser} onChange={(e) => setRoleUser(e.target.value)}>
                  <option value="">— vyber účastníka —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
                <select className="select" value={roleValue} onChange={(e) => setRoleValue(e.target.value as Role)}>
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn--primary btn--block"
                  disabled={!roleUser}
                  onClick={async () => {
                    await setRole(roleUser, roleValue);
                    setMsg("Rola aktualizovaná.");
                  }}
                >
                  Nastaviť rolu
                </button>
              </div>
            </div>

            {config?.incidentEnabled && (
              <div className="card">
                <p className="section-title">Incident</p>
                <div className="stack">
                  <input
                    className="input"
                    value={incidentTitle}
                    onChange={(e) => setIncidentTitle(e.target.value)}
                    placeholder="Popis incidentu"
                  />
                  <button
                    className="btn btn--danger btn--block"
                    disabled={incidentTitle.trim().length < 3}
                    onClick={async () => {
                      await createIncident(incidentTitle.trim());
                      setIncidentTitle("");
                      setMsg("Incident nahlásený.");
                    }}
                  >
                    Nahlásiť incident
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        {msg && <p className="hint">{msg}</p>}
      </div>
    </div>
  );
}
