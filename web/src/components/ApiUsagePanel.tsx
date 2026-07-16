import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import type { ApiUsageReport } from "../lib/types";

function usd(n: number) {
  return `$${n.toFixed(2)}`;
}

function SkuRow({
  label,
  count,
  pricePer1000,
}: {
  label: string;
  count: number;
  pricePer1000: number;
}) {
  const est = (count / 1000) * pricePer1000;
  return (
    <div className="usage-sku">
      <div className="usage-sku__label">{label}</div>
      <div className="usage-sku__count">{count.toLocaleString("sk-SK")}</div>
      <div className="usage-sku__cost">{usd(est)}</div>
    </div>
  );
}

export function ApiUsagePanel() {
  const [report, setReport] = useState<ApiUsageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await apiFetch<ApiUsageReport>("/admin/api-usage"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nepodarilo sa načítať metriky.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !report) {
    return <p className="hint">Načítavam spotrebu API…</p>;
  }

  if (error && !report) {
    return (
      <div>
        <p className="hint" style={{ color: "var(--danger)" }}>
          {error}
        </p>
        <button className="btn btn--block" onClick={load}>
          Skúsiť znova
        </button>
      </div>
    );
  }

  if (!report) return null;

  const { pricing, today, monthToDate, forecast, daily, limits } = report;
  const warnClass =
    limits.warningLevel === "critical"
      ? "usage-alert usage-alert--critical"
      : limits.warningLevel === "warn"
        ? "usage-alert usage-alert--warn"
        : null;

  return (
    <div className="usage-panel">
      {warnClass && (
        <div className={warnClass}>
          {limits.warningLevel === "critical"
            ? "Mesačný interný limit prekročený."
            : `Spotreba dosiahla ${limits.budgetUsedPct ?? 0} % interného limitu.`}
        </div>
      )}

      <div className="usage-grid">
        <div className="usage-stat">
          <div className="usage-stat__label">Dnes (odhad)</div>
          <div className="usage-stat__value">{usd(today.estimatedBillUsd)}</div>
          <div className="usage-stat__sub">hrubá cena {usd(today.grossUsd)}</div>
        </div>
        <div className="usage-stat">
          <div className="usage-stat__label">Tento mesiac (odhad)</div>
          <div className="usage-stat__value">{usd(monthToDate.estimatedBillUsd)}</div>
          <div className="usage-stat__sub">
            po kredite {usd(pricing.monthlyFreeCreditUsd)} z {usd(monthToDate.grossUsd)}
          </div>
        </div>
        <div className="usage-stat">
          <div className="usage-stat__label">Prognóza mesiaca</div>
          <div className="usage-stat__value">{usd(forecast.estimatedBillUsd)}</div>
          <div className="usage-stat__sub">hrubá {usd(forecast.grossUsd)}</div>
        </div>
      </div>

      <p className="section-title" style={{ marginTop: 16 }}>
        Dnes podľa SKU
      </p>
      <div className="usage-sku-table">
        <div className="usage-sku usage-sku--head">
          <div>Služba</div>
          <div>Počet</div>
          <div>Odhad</div>
        </div>
        <SkuRow label="Maps (načítanie mapy)" count={today.mapsLoads} pricePer1000={pricing.mapsPer1000} />
        <SkuRow label="Routes API" count={today.routesCalls} pricePer1000={pricing.routesPer1000} />
        <SkuRow label="Places API" count={today.placesCalls} pricePer1000={pricing.placesPer1000} />
      </div>

      <p className="section-title" style={{ marginTop: 16 }}>
        Mesiac celkom (MTD)
      </p>
      <div className="usage-sku-table">
        <SkuRow label="Maps" count={monthToDate.mapsLoads} pricePer1000={pricing.mapsPer1000} />
        <SkuRow label="Routes" count={monthToDate.routesCalls} pricePer1000={pricing.routesPer1000} />
        <SkuRow label="Places" count={monthToDate.placesCalls} pricePer1000={pricing.placesPer1000} />
      </div>

      {daily.length > 0 && (
        <>
          <p className="section-title" style={{ marginTop: 16 }}>
            Denný prehľad
          </p>
          <div className="usage-daily">
            {[...daily].reverse().slice(0, 7).map((d) => (
              <div className="usage-daily__row" key={d.day}>
                <span>{d.day}</span>
                <span>
                  M {d.mapsLoads} · R {d.routesCalls} · P {d.placesCalls}
                </span>
                <span>{usd(d.estimatedBillUsd)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="hint" style={{ marginTop: 12 }}>
        {report.note}
      </p>
      <p className="hint">
        Presné fakturované sumy:{" "}
        <a href="https://console.cloud.google.com/billing" target="_blank" rel="noreferrer">
          Google Cloud Console → Billing
        </a>
      </p>

      <button className="btn btn--block" style={{ marginTop: 8 }} onClick={load} disabled={loading}>
        {loading ? "Obnovujem…" : "Obnoviť metriky"}
      </button>
    </div>
  );
}
