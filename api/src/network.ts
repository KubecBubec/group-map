import type { Request } from "express";

export function getRequestOrigin(req: Request): string {
  const host = req.get("x-forwarded-host") ?? req.get("host");
  const proto = req.get("x-forwarded-proto") ?? req.protocol ?? "http";
  if (!host) return process.env.FRONTEND_URL ?? "http://localhost:8080";
  return `${proto}://${host.split(",")[0].trim()}`;
}

export function getClientIp(req: Request): string {
  const forwarded = req.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const raw = req.ip ?? req.socket.remoteAddress ?? "";
  return raw.replace(/^::ffff:/, "");
}

export function isPrivateOrLocalIp(ip: string): boolean {
  if (!ip) return false;
  if (ip === "::1" || ip === "127.0.0.1") return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  const m = /^172\.(\d+)\./.exec(ip);
  if (m) {
    const second = Number(m[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

export function isPrivateLanHost(host: string): boolean {
  if (host === "localhost" || host === "127.0.0.1") return false;
  if (host.startsWith("10.")) return true;
  if (host.startsWith("192.168.")) return true;
  const m = /^172\.(\d+)\./.exec(host);
  if (m) {
    const second = Number(m[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

export function isLanRequest(req: Request): boolean {
  if (isPrivateOrLocalIp(getClientIp(req))) return true;
  const host = new URL(getRequestOrigin(req)).hostname;
  return isPrivateLanHost(host);
}
