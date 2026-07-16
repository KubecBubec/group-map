import type { PrismaClient } from "@prisma/client";

export type ApiSku = "maps" | "routes" | "places";

const PRICING = {
  mapsPer1000: Number(process.env.MAPS_PRICE_PER_1000 ?? 7),
  routesPer1000: Number(process.env.ROUTES_PRICE_PER_1000 ?? 5),
  placesPer1000: Number(process.env.PLACES_PRICE_PER_1000 ?? 17),
  monthlyFreeCreditUsd: Number(process.env.GOOGLE_MONTHLY_FREE_CREDIT_USD ?? 200),
};

function utcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function monthStart(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function daysInMonth(d = new Date()): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

export function costForUsage(maps: number, routes: number, places: number) {
  const grossUsd =
    (maps / 1000) * PRICING.mapsPer1000 +
    (routes / 1000) * PRICING.routesPer1000 +
    (places / 1000) * PRICING.placesPer1000;
  const creditAppliedUsd = Math.min(grossUsd, PRICING.monthlyFreeCreditUsd);
  const estimatedBillUsd = Math.max(0, grossUsd - PRICING.monthlyFreeCreditUsd);
  return {
    grossUsd: roundUsd(grossUsd),
    creditAppliedUsd: roundUsd(creditAppliedUsd),
    estimatedBillUsd: roundUsd(estimatedBillUsd),
  };
}

function roundUsd(n: number) {
  return Math.round(n * 100) / 100;
}

export async function trackApiUsage(prisma: PrismaClient, sku: ApiSku, count = 1) {
  const day = utcDay();

  await prisma.apiUsageDaily.upsert({
    where: { day },
    create: {
      day,
      mapsLoads: sku === "maps" ? count : 0,
      routesCalls: sku === "routes" ? count : 0,
      placesCalls: sku === "places" ? count : 0,
    },
    update:
      sku === "maps"
        ? { mapsLoads: { increment: count } }
        : sku === "routes"
          ? { routesCalls: { increment: count } }
          : { placesCalls: { increment: count } },
  });
}

export async function getApiUsageReport(
  prisma: PrismaClient,
  monthlyBudgetUsd: number | null,
  warningThresholdPct = 80,
) {
  const now = new Date();
  const start = monthStart(now);
  const rows = await prisma.apiUsageDaily.findMany({
    where: { day: { gte: start } },
    orderBy: { day: "asc" },
  });

  const sum = rows.reduce(
    (acc, r) => ({
      maps: acc.maps + r.mapsLoads,
      routes: acc.routes + r.routesCalls,
      places: acc.places + r.placesCalls,
    }),
    { maps: 0, routes: 0, places: 0 },
  );

  const todayRow = rows.find((r) => r.day.getTime() === utcDay(now).getTime());
  const today = {
    mapsLoads: todayRow?.mapsLoads ?? 0,
    routesCalls: todayRow?.routesCalls ?? 0,
    placesCalls: todayRow?.placesCalls ?? 0,
  };

  const mtdCost = costForUsage(sum.maps, sum.routes, sum.places);
  const todayCost = costForUsage(today.mapsLoads, today.routesCalls, today.placesCalls);

  const dayOfMonth = now.getUTCDate();
  const forecastGrossUsd =
    dayOfMonth > 0 ? (mtdCost.grossUsd / dayOfMonth) * daysInMonth(now) : mtdCost.grossUsd;
  const forecastBillUsd = Math.max(0, forecastGrossUsd - PRICING.monthlyFreeCreditUsd);

  let warningLevel: "ok" | "warn" | "critical" = "ok";
  if (monthlyBudgetUsd && monthlyBudgetUsd > 0) {
    const pct = (mtdCost.estimatedBillUsd / monthlyBudgetUsd) * 100;
    if (pct >= 100) warningLevel = "critical";
    else if (pct >= warningThresholdPct) warningLevel = "warn";
  }

  return {
    pricing: PRICING,
    note:
      "Odhad z meranej spotreby v aplikácii × publikované ceny Google. Presná fakturácia je v Google Cloud Console → Billing.",
    today: {
      ...today,
      ...todayCost,
    },
    monthToDate: {
      mapsLoads: sum.maps,
      routesCalls: sum.routes,
      placesCalls: sum.places,
      ...mtdCost,
    },
    forecast: {
      grossUsd: roundUsd(forecastGrossUsd),
      estimatedBillUsd: roundUsd(forecastBillUsd),
    },
    daily: rows.map((r) => ({
      day: r.day.toISOString().slice(0, 10),
      mapsLoads: r.mapsLoads,
      routesCalls: r.routesCalls,
      placesCalls: r.placesCalls,
      ...costForUsage(r.mapsLoads, r.routesCalls, r.placesCalls),
    })),
    limits: {
      monthlyBudgetUsd,
      warningThresholdPct,
      warningLevel,
      budgetUsedPct:
        monthlyBudgetUsd && monthlyBudgetUsd > 0
          ? roundUsd((mtdCost.estimatedBillUsd / monthlyBudgetUsd) * 100)
          : null,
    },
  };
}
