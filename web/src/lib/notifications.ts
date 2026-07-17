import { apiFetch } from "./api";
import { APP_ICON, APP_ICON_SMALL } from "./appBrand";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type NotificationStatus = "unsupported" | "disabled" | "default" | "granted" | "denied";

export function getNotificationStatus(): NotificationStatus {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    return "disabled";
  }
  return Notification.permission as NotificationStatus;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (e) {
    console.warn("Service worker registration failed:", e);
    return null;
  }
}

export async function enablePushNotifications(): Promise<NotificationStatus> {
  const status = getNotificationStatus();
  if (status === "unsupported" || status === "disabled") return status;

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") return permission as NotificationStatus;

  const vapid = await apiFetch<{ publicKey: string | null }>("/push/vapid-public-key");
  if (!vapid.publicKey) return "disabled";

  const reg = await registerServiceWorker();
  if (!reg) return "unsupported";

  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid.publicKey) as BufferSource,
    });
  }

  const json = sub.toJSON();
  await apiFetch("/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
    }),
  });

  return "granted";
}

export function showLocalNotification(title: string, body: string): void {
  if (Notification.permission !== "granted") return;
  try {
    if (navigator.serviceWorker?.controller) {
      void navigator.serviceWorker.ready.then((reg) =>
        reg.showNotification(title, {
          body,
          icon: APP_ICON,
          badge: APP_ICON_SMALL,
          tag: "ping-local",
        }),
      );
      return;
    }
    new Notification(title, { body, icon: APP_ICON });
  } catch {
    /* iOS môže blokovať mimo service workera */
  }
}
