import { distanceMeters } from "./geo";
import type { LatLng, LocationRow } from "./types";

/** Vzdialenosť v metroch, v rámci ktorej sa považujú polohy za „rovnaké miesto“. */
export const CLUSTER_THRESHOLD_METERS = 22;

export interface LocationCluster {
  id: string;
  center: LatLng;
  members: LocationRow[];
}

export function clusterLocations(
  locations: LocationRow[],
  thresholdMeters = CLUSTER_THRESHOLD_METERS,
): LocationCluster[] {
  const assigned = new Set<string>();
  const clusters: LocationCluster[] = [];

  for (const seed of locations) {
    if (assigned.has(seed.userId)) continue;

    const members: LocationRow[] = [seed];
    assigned.add(seed.userId);

    let changed = true;
    while (changed) {
      changed = false;
      for (const loc of locations) {
        if (assigned.has(loc.userId)) continue;
        const pos = { lat: loc.latitude, lng: loc.longitude };
        const near = members.some(
          (m) =>
            distanceMeters({ lat: m.latitude, lng: m.longitude }, pos) <= thresholdMeters,
        );
        if (near) {
          members.push(loc);
          assigned.add(loc.userId);
          changed = true;
        }
      }
    }

    const center = {
      lat: members.reduce((sum, m) => sum + m.latitude, 0) / members.length,
      lng: members.reduce((sum, m) => sum + m.longitude, 0) / members.length,
    };

    clusters.push({
      id: members
        .map((m) => m.userId)
        .sort()
        .join("-"),
      center,
      members: members.sort((a, b) => a.user.name.localeCompare(b.user.name)),
    });
  }

  return clusters;
}
