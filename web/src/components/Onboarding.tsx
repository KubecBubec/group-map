import { useState } from "react";
import { enablePushNotifications, getNotificationStatus } from "../lib/notifications";
import { Segmented } from "./ui";

type Platform = "ios" | "android";
type Step = "install" | "permissions";

const detectPlatform = (): Platform =>
  /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "ios" : "android";

const isStandalonePwa = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  // iOS Safari
  Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

const STEPS: Record<Platform, string[]> = {
  ios: [
    "Otvor aplikáciu v prehliadači Safari.",
    "Klepni na ikonu Zdieľať (štvorec so šípkou nahor).",
    'Vyber možnosť „Pridať na plochu“.',
    'Potvrď „Pridať“ – appka sa objaví ako ikona.',
    "Otvor appku z plochy a pokračuj tu.",
  ],
  android: [
    "Otvor aplikáciu v prehliadači Chrome.",
    "Klepni na menu (tri bodky vpravo hore).",
    'Vyber „Pridať na plochu“ alebo „Inštalovať aplikáciu“.',
    "Potvrď a spusti appku z plochy.",
    "Otvor appku z plochy a pokračuj tu.",
  ],
};

export function Onboarding({
  onComplete,
  enableGeoTracking,
}: {
  onComplete: () => void;
  enableGeoTracking: () => Promise<void>;
}) {
  const [platform, setPlatform] = useState<Platform>(detectPlatform());
  const [step, setStep] = useState<Step>(isStandalonePwa() ? "permissions" : "install");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const requestPermissions = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const notif = await enablePushNotifications();
      try {
        await enableGeoTracking();
      } catch {
        /* používateľ môže zamietnuť – pokračujeme, mapa ukáže banner */
      }

      if (notif === "granted") {
        onComplete();
        return;
      }
      if (notif === "denied") {
        setMsg(
          "Notifikácie sú zamietnuté. Bez nich neprídu pingy. Zapni ich v nastaveniach systému a skús znova.",
        );
        return;
      }
      if (notif === "disabled") {
        setMsg(
          "Notifikácie potrebujú HTTPS a appku z plochy (nie lokálnu IP). Pridaj appku na plochu cez Safari/Chrome a otvor ju z ikony.",
        );
        return;
      }
      setMsg("Povol notifikácie v dialógu prehliadača – bez nich appka nefunguje spoľahlivo.");
    } finally {
      setBusy(false);
    }
  };

  if (step === "permissions") {
    const status = getNotificationStatus();
    return (
      <div className="onboard">
        <div className="onboard__card">
          <div className="onboard__phone">🔔</div>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: 22 }}>Povolenia pre akciu</h1>
            <p className="hint" style={{ marginTop: 8 }}>
              Bez <strong>notifikácií</strong> a <strong>polohy</strong> aplikácia nefunguje – pingy
              a živá mapa ich potrebujú. Povolenia si prehliadač pamätá pri rovnakej adrese (najlepšie
              ikona na ploche).
            </p>
          </div>

          <div className="stack">
            <div className="card" style={{ margin: 0 }}>
              <p className="section-title">1. Notifikácie</p>
              <p className="hint">
                Stav:{" "}
                {status === "granted"
                  ? "povolené"
                  : status === "denied"
                    ? "zamietnuté"
                    : status === "disabled"
                      ? "vyžaduje HTTPS / PWA"
                      : "ešte nepovolené"}
              </p>
            </div>
            <div className="card" style={{ margin: 0 }}>
              <p className="section-title">2. Poloha</p>
              <p className="hint">Potrebné, aby ťa ostatní videli na mape.</p>
            </div>
          </div>

          {msg && <div className="auth__error">{msg}</div>}

          <button
            className="btn btn--primary btn--block"
            disabled={busy}
            onClick={() => void requestPermissions()}
          >
            {busy ? "Žiadam povolenia…" : "Povoliť notifikácie a polohu"}
          </button>
          {status === "granted" && (
            <button className="btn btn--block" disabled={busy} onClick={() => void requestPermissions()}>
              Pokračovať
            </button>
          )}
          <p className="hint" style={{ textAlign: "center" }}>
            Tento návod nájdeš kedykoľvek neskôr v sekcii „Viac“.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="onboard">
      <div className="onboard__card">
        <div className="onboard__phone">📲</div>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 22 }}>Pridaj si appku na plochu</h1>
          <p className="hint" style={{ marginTop: 8 }}>
            Aplikácia funguje najlepšie ako ikona na ploche – rýchlejší prístup, celá obrazovka a
            spoľahlivé notifikácie počas akcie.
          </p>
        </div>

        <Segmented<Platform>
          value={platform}
          onChange={setPlatform}
          options={[
            { value: "ios", label: "iPhone / iPad" },
            { value: "android", label: "Android" },
          ]}
        />

        <div className="steps">
          {STEPS[platform].map((text, i) => (
            <div className="step" key={i}>
              <span className="step__num">{i + 1}</span>
              <span className="step__text">{text}</span>
            </div>
          ))}
        </div>

        <button className="btn btn--primary btn--block" onClick={() => setStep("permissions")}>
          Hotovo, mám appku na ploche
        </button>
        <button className="btn btn--block" onClick={() => setStep("permissions")}>
          Pokračovať bez inštalácie
        </button>
        <p className="hint" style={{ textAlign: "center" }}>
          Po tomto kroku appka okamžite požiada o notifikácie a polohu.
        </p>
      </div>
    </div>
  );
}
