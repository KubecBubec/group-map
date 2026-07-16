import { useEffect, useState } from "react";
import { useCoordinator } from "../lib/coordinator";
import { collectGeoDiagnostics, getGeoLogs, getLastGeoLog, type GeoDiagnostics, type GeoLogEntry } from "../lib/geoDebug";

export function GeoDiagnosticsPanel() {
  const { myPos, requestMyLocation, refreshGeoDiagnostics } = useCoordinator();
  const [diag, setDiag] = useState<GeoDiagnostics | null>(null);
  const [logEntries, setLogEntries] = useState<GeoLogEntry[]>(() => getGeoLogs());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = async () => {
    setDiag(await collectGeoDiagnostics(Boolean(myPos)));
    setLogEntries(getGeoLogs());
  };

  const lastRouteError = getLastGeoLog("route:", "error");

  useEffect(() => {
    reload();
    const onLog = () => setLogEntries(getGeoLogs());
    window.addEventListener("geo-log", onLog);
    return () => window.removeEventListener("geo-log", onLog);
  }, [myPos]);

  const copyLogs = async () => {
    const text = [
      "=== Diagnostika (GPS + trasy) ===",
      JSON.stringify(diag, null, 2),
      lastRouteError ? `\nPosledná chyba trasy: ${lastRouteError.detail ?? lastRouteError.event}` : "",
      "",
      "=== Log ===",
      ...logEntries.map((l) => `${l.ts} [${l.level}] ${l.event}${l.detail ? ` ${l.detail}` : ""}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setMsg("Log skopírovaný.");
    } catch {
      setMsg("Kopírovanie zlyhalo – označ text ručne.");
    }
  };

  return (
    <div className="geo-diag">
      {diag && (
        <div className="geo-diag__grid">
          <div>
            <span className="geo-diag__k">Protokol</span>
            <span>{diag.protocol}//{diag.hostname}</span>
          </div>
          <div>
            <span className="geo-diag__k">Secure context</span>
            <span>{diag.secureContext ? "áno" : "nie"}</span>
          </div>
          <div>
            <span className="geo-diag__k">LAN cez HTTP</span>
            <span>{diag.isLanHttp ? "áno ⚠️" : "nie"}</span>
          </div>
          <div>
            <span className="geo-diag__k">Povolenie GPS</span>
            <span>{diag.permission}</span>
          </div>
          <div>
            <span className="geo-diag__k">iOS / PWA</span>
            <span>
              {diag.isIOS ? "iOS" : "iné"} · {diag.isStandalonePwa ? "ikona na ploche" : "prehliadač"}
            </span>
          </div>
          <div>
            <span className="geo-diag__k">Moja poloha v appke</span>
            <span>{diag.myPosKnown ? "známa" : "neznáma"}</span>
          </div>
          <div>
            <span className="geo-diag__k">Posledná chyba trasy</span>
            <span>{lastRouteError?.detail ? lastRouteError.detail.slice(0, 120) : "žiadna"}</span>
          </div>
        </div>
      )}

      {diag?.isLanHttp && diag.isIOS && (
        <p className="hint" style={{ color: "var(--danger)", marginTop: 10 }}>
          iPhone cez <code>http://192.168…</code> geolokáciu väčšinou vôbec nespustí. Riešenie: HTTPS
          tunel (ngrok/cloudflare) alebo test na localhost z PC.
        </p>
      )}

      <div className="row" style={{ marginTop: 12, gap: 8 }}>
        <button
          className="btn btn--primary grow"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              await requestMyLocation("manual_test");
              await reload();
              refreshGeoDiagnostics();
              setMsg("Požiadavka odoslaná – pozri log nižšie.");
            } catch {
              setMsg("GPS zlyhalo – pozri log.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Žiadam GPS…" : "Otestovať GPS"}
        </button>
        <button className="btn grow" onClick={reload}>
          Obnoviť
        </button>
        <button className="btn grow" onClick={copyLogs}>
          Kopírovať log
        </button>
      </div>

      {msg && <p className="hint" style={{ marginTop: 8 }}>{msg}</p>}

      <p className="section-title" style={{ marginTop: 16 }}>
        Posledné udalosti (GPS + trasy)
      </p>
      <div className="geo-diag__log">
        {logEntries.length === 0 ? (
          <p className="hint">Zatiaľ žiadne záznamy.</p>
        ) : (
          logEntries.slice(0, 25).map((l, i) => (
            <div key={`${l.ts}-${i}`} className={`geo-diag__line geo-diag__line--${l.level}`}>
              <span className="geo-diag__ts">{l.ts}</span>
              <span className="geo-diag__ev">{l.event}</span>
              {l.detail && <span className="geo-diag__detail">{l.detail}</span>}
            </div>
          ))
        )}
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        Chyby trás hľadaj pod udalosťou <code>route:error</code>. Server log:{" "}
        <code>docker compose logs api -f</code> (riadky <code>[routes/walking]</code>).
      </p>
    </div>
  );
}
