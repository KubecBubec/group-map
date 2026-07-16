import type { LatLng } from "./types";

/** Centrovanie mapy – ošetrené pre iOS Safari (resize + fallback setCenter). */
export function centerMap(
  map: google.maps.Map,
  position: LatLng,
  zoom = 16,
  onDone?: () => void,
): void {
  const latLng = new google.maps.LatLng(position.lat, position.lng);
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    onDone?.();
  };

  const idleListener = map.addListener("idle", () => {
    google.maps.event.removeListener(idleListener);
    window.clearTimeout(fallbackTimer);
    finish();
  });
  const fallbackTimer = window.setTimeout(() => {
    google.maps.event.removeListener(idleListener);
    finish();
  }, 2500);

  google.maps.event.trigger(map, "resize");
  map.panTo(latLng);

  window.setTimeout(() => {
    map.setZoom(zoom);
    const c = map.getCenter();
    if (!c) {
      map.setCenter(latLng);
      map.setZoom(zoom);
      return;
    }
    const dLat = Math.abs(c.lat() - position.lat);
    const dLng = Math.abs(c.lng() - position.lng);
    if (dLat > 0.0008 || dLng > 0.0008) {
      map.setCenter(latLng);
      map.setZoom(zoom);
    }
  }, 120);
}
