import { useState } from "react";
import { Segmented } from "./ui";

type Platform = "ios" | "android";

const detectPlatform = (): Platform =>
  /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "ios" : "android";

const STEPS: Record<Platform, string[]> = {
  ios: [
    "Otvor aplikáciu v prehliadači Safari.",
    "Klepni na ikonu Zdieľať (štvorec so šípkou nahor).",
    'Vyber možnosť „Pridať na plochu“.',
    'Potvrď „Pridať“ – appka sa objaví ako ikona.',
  ],
  android: [
    "Otvor aplikáciu v prehliadači Chrome.",
    "Klepni na menu (tri bodky vpravo hore).",
    'Vyber „Pridať na plochu“ alebo „Inštalovať aplikáciu“.',
    "Potvrď a spusti appku z plochy.",
  ],
};

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [platform, setPlatform] = useState<Platform>(detectPlatform());

  return (
    <div className="onboard">
      <div className="onboard__card">
        <div className="onboard__phone">📲</div>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 22 }}>Pridaj si appku na plochu</h1>
          <p className="hint" style={{ marginTop: 8 }}>
            Aplikácia funguje najlepšie ako ikona na ploche – rýchlejší prístup, celá
            obrazovka a spoľahlivejšie notifikácie počas akcie.
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

        <button className="btn btn--primary btn--block" onClick={onComplete}>
          Hotovo, pokračovať
        </button>
        <p className="hint" style={{ textAlign: "center" }}>
          Po prihlásení appka požiada o povolenie polohy a notifikácií. Prehliadač si polohu pamätá pri
          rovnakej adrese – najlepšie funguje ikona na ploche (PWA).
        </p>
        <p className="hint" style={{ textAlign: "center" }}>
          Tento návod nájdeš kedykoľvek neskôr v sekcii „Viac“.
        </p>
      </div>
    </div>
  );
}
