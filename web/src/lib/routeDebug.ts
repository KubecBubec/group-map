import { geoLog } from "./geoDebug";
import type { LatLng } from "./types";

export function routeLog(
  event: string,
  detail?: unknown,
  level: "info" | "warn" | "error" = "info",
) {
  geoLog(`route:${event}`, detail, level);
}

export function logRouteRequest(input: {
  userId: string;
  meetingId: string;
  origin: LatLng;
  dest: LatLng;
  cached: boolean;
}) {
  routeLog("request", input);
}

export function logRouteSuccess(input: {
  userId: string;
  meetingId: string;
  pointCount: number;
  cached: boolean;
}) {
  routeLog("success", input);
}

export function logRouteError(input: {
  userId: string;
  meetingId: string;
  origin: LatLng;
  dest: LatLng;
  raw: string;
  message: string;
}) {
  routeLog("error", input, "error");
}
