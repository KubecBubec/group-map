export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";
export const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";

export const getSocketUrl = () => {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL as string;
  if (API_BASE.startsWith("http")) return API_BASE;
  return window.location.origin;
};

let token: string | null = localStorage.getItem("token");

export const getToken = () => token;

export const setToken = (value: string | null) => {
  token = value;
  if (value) localStorage.setItem("token", value);
  else localStorage.removeItem("token");
};

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed with status ${res.status}`);
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

export const loginWithGoogleUrl = () => `${API_BASE}/auth/google`;

export interface AppMeta {
  googleOAuthEnabled: boolean;
  lanLoginEnabled: boolean;
  lanLoginAvailable: boolean;
}

export interface LanUser {
  id: string;
  name: string;
  role: string;
}

export async function fetchMeta(): Promise<AppMeta> {
  return apiFetch<AppMeta>("/meta");
}

export async function fetchLanUsers(): Promise<LanUser[]> {
  return apiFetch<LanUser[]>("/auth/lan/users");
}

export async function loginViaLan(userId: string): Promise<{ token: string }> {
  return apiFetch<{ token: string }>("/auth/lan", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}
