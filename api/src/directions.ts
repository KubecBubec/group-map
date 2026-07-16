import type { LatLng } from "./directionsTypes.js";

export type { LatLng };

export type WalkingDirections = {
  path: LatLng[];
  durationSeconds: number;
  distanceMeters: number;
};

function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

type DirectionsResponse = {
  status: string;
  error_message?: string;
  routes?: {
    overview_polyline?: { points?: string };
    legs?: { duration?: { value: number }; distance?: { value: number } }[];
  }[];
};

export async function fetchWalkingDirections(
  apiKey: string,
  origin: LatLng,
  dest: LatLng,
): Promise<WalkingDirections> {
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
  url.searchParams.set("destination", `${dest.lat},${dest.lng}`);
  url.searchParams.set("mode", "walking");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP_${res.status}`);
  }

  const data = (await res.json()) as DirectionsResponse;
  if (data.status !== "OK") {
    throw new Error(data.status + (data.error_message ? `: ${data.error_message}` : ""));
  }

  const route = data.routes?.[0];
  const encoded = route?.overview_polyline?.points;
  if (!encoded) throw new Error("EMPTY_ROUTE");

  const path = decodePolyline(encoded);
  if (path.length < 2) throw new Error("EMPTY_ROUTE");

  const leg = route.legs?.[0];
  return {
    path,
    durationSeconds: leg?.duration?.value ?? 0,
    distanceMeters: leg?.distance?.value ?? 0,
  };
}
