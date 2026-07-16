import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { OAuth2Client } from "google-auth-library";
import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  getClientIp,
  getOAuthRedirectUri,
  getRequestOrigin,
  isLanRequest,
  isPrivateLanHost,
} from "./network.js";
import {
  getVapidPublicKey,
  resolvePingRecipientIds,
  sendPingPush,
} from "./push.js";
import { getApiUsageReport, trackApiUsage } from "./usage.js";
import { fetchWalkingDirections } from "./directions.js";
import { findMeetingLimitConflict } from "./meetingPointLimits.js";
import { meetingTitleSchema, validationErrorResponse } from "./meetingValidation.js";

type AppRole = "ADMIN" | "MAIN_LEADER" | "LEADER" | "MEMBER";
type AppPriority = "INFO" | "MEET" | "URGENT";

const prisma = new PrismaClient();
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

const PORT = Number(process.env.PORT ?? 4000);
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const GOOGLE_MAPS_API_KEY =
  process.env.GOOGLE_MAPS_SERVER_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY ?? "";
const ALLOW_LAN_LOGIN =
  process.env.ALLOW_LAN_LOGIN === "true" ||
  (process.env.ALLOW_LAN_LOGIN !== "false" && process.env.NODE_ENV !== "production");

const googleOAuthEnabled = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

const publicUser = <T extends { passwordHash?: string | null }>(user: T) => {
  const { passwordHash: _ignored, ...safe } = user;
  return safe;
};

async function loadGroup(groupId: string) {
  return prisma.group.findUnique({
    where: { id: groupId },
    include: { memberships: true },
  });
}

function emitUserNew(user: { id: string; email: string; name: string; role: AppRole; googleId?: string | null }) {
  io.emit("user:new", { ...user, memberships: [] });
}

function emitUserUpdated(user: { id: string; email: string; name: string; role: AppRole; googleId?: string | null }) {
  io.emit("user:updated", user);
}

async function emitGroupUpdated(groupId: string) {
  const group = await loadGroup(groupId);
  if (group) io.emit("group:updated", group);
}

app.set("trust proxy", true);
app.use(cors());
app.use(express.json());

type AuthRequest = express.Request & { user?: { id: string; role: AppRole } };

const signToken = (id: string, role: AppRole) =>
  jwt.sign({ sub: id, role }, JWT_SECRET, { expiresIn: "7d" });

const auth =
  (roles?: AppRole[]) =>
  (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
    const raw = req.headers.authorization?.replace("Bearer ", "");
    if (!raw) return res.status(401).json({ error: "Missing auth token" });
    try {
      const decoded = jwt.verify(raw, JWT_SECRET) as { sub: string; role: AppRole };
      req.user = { id: decoded.sub, role: decoded.role };
      if (roles && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      return next();
    } catch {
      return res.status(401).json({ error: "Invalid auth token" });
    }
  };

app.get("/health", async (_req, res) => {
  const config = await prisma.featureConfig.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global" },
  });
  res.json({ ok: true, config });
});

app.get("/meta", (req, res) => {
  const origin = getRequestOrigin(req);
  const host = new URL(origin).hostname;

  res.json({
    googleOAuthEnabled,
    lanLoginEnabled: ALLOW_LAN_LOGIN,
    lanLoginAvailable: ALLOW_LAN_LOGIN && (isLanRequest(req) || isPrivateLanHost(host)),
    clientIp: getClientIp(req),
    pushEnabled: Boolean(getVapidPublicKey()),
  });
});

app.get("/push/vapid-public-key", (_req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

app.post("/push/subscribe", auth(), async (req: AuthRequest, res) => {
  const body = z
    .object({
      endpoint: z.string().url(),
      keys: z.object({
        p256dh: z.string(),
        auth: z.string(),
      }),
    })
    .parse(req.body);

  const sub = await prisma.pushSubscription.upsert({
    where: { endpoint: body.endpoint },
    update: {
      userId: req.user!.id,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    },
    create: {
      userId: req.user!.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    },
  });
  res.json({ ok: true, id: sub.id });
});

app.delete("/push/subscribe", auth(), async (req: AuthRequest, res) => {
  const endpoint = String(req.body?.endpoint ?? req.query.endpoint ?? "");
  if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });
  await prisma.pushSubscription.deleteMany({
    where: { endpoint, userId: req.user!.id },
  });
  res.status(204).send();
});

app.get("/auth/lan/users", async (req, res) => {
  if (!ALLOW_LAN_LOGIN) return res.status(403).json({ error: "LAN login disabled" });
  if (!isLanRequest(req)) {
    return res.status(403).json({ error: "LAN login is only available on local network" });
  }
  const users = await prisma.user.findMany({
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  res.json(users);
});

app.post("/auth/lan", async (req, res) => {
  if (!ALLOW_LAN_LOGIN) return res.status(403).json({ error: "LAN login disabled" });
  if (!isLanRequest(req)) {
    return res.status(403).json({ error: "LAN login is only available on local network" });
  }
  const body = z.object({ userId: z.string().min(1) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: body.userId } });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ token: signToken(user.id, user.role), user: publicUser(user) });
});

app.get("/auth/google", (req, res) => {
  if (!googleOAuthEnabled) return res.status(503).json({ error: "Google OAuth is not configured" });

  const redirectUri = getOAuthRedirectUri(req);
  const host = new URL(redirectUri).hostname;
  const isPrivateLanHost =
    host.startsWith("192.168.") ||
    host.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);

  if (isPrivateLanHost) {
    return res.status(400).json({
      error:
        "Google OAuth na IP adrese v sieti nie je podporované. Použi LAN prihlásenie alebo http://localhost:8080 na PC.",
    });
  }

  const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
  const state = jwt.sign({ n: randomUUID(), redirectUri }, JWT_SECRET, { expiresIn: "10m" });
  const url = client.generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    prompt: "select_account",
    state,
    redirect_uri: redirectUri,
  });
  res.redirect(url);
});

app.get("/auth/callback/google", async (req, res) => {
  if (!googleOAuthEnabled) return res.status(503).send("Google OAuth is not configured");
  const frontendOrigin = getRequestOrigin(req);
  try {
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    if (!code) return res.status(400).send("Missing authorization code");
    const statePayload = jwt.verify(state, JWT_SECRET) as { n: string; redirectUri: string };
    const redirectUri = statePayload.redirectUri ?? getOAuthRedirectUri(req);
    const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);

    const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
    if (!tokens.id_token) return res.status(400).send("Missing id_token from Google");

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.sub) {
      return res.status(400).send("Google account is missing required profile data");
    }

    const email = payload.email;
    const googleId = payload.sub;
    const name = payload.name ?? email.split("@")[0];

    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    });

    if (user) {
      if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId },
        });
      }
    } else {
      const firstUserCount = await prisma.user.count();
      const role: AppRole = firstUserCount === 0 ? "ADMIN" : "MEMBER";
      user = await prisma.user.create({
        data: { email, name, googleId, role },
      });
      emitUserNew(user);
    }

    const token = signToken(user.id, user.role);
    res.redirect(`${frontendOrigin}/?token=${encodeURIComponent(token)}`);
  } catch (error) {
    console.error("Google OAuth callback failed:", error);
    res.redirect(`${frontendOrigin}/?oauth_error=1`);
  }
});

app.get("/me", auth(), async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: publicUser(user) });
});

app.post("/roles/:userId", auth(["ADMIN", "MAIN_LEADER", "LEADER"]), async (req: AuthRequest, res) => {
  const body = z.object({ role: z.enum(["ADMIN", "MAIN_LEADER", "LEADER", "MEMBER"]) }).parse(req.body);
  const userId = String(req.params.userId);
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return res.status(404).json({ error: "User not found" });

  const actorRole = req.user!.role;

  // Vedúci môže len povýšiť účastníka na vedúceho
  if (actorRole === "LEADER") {
    if (target.role !== "MEMBER" || body.role !== "LEADER") {
      return res.status(403).json({
        error: "leader_can_only_promote_to_leader",
        detail: "Vedúci môže len pridať ďalšieho vedúceho spomedzi účastníkov.",
      });
    }
  }

  // Hlavný vedúci nesmie meniť admina ani prideľovať rolu ADMIN
  if (actorRole === "MAIN_LEADER") {
    if (target.role === "ADMIN") {
      return res.status(403).json({ error: "main_leader_cannot_change_admin" });
    }
    if (body.role === "ADMIN") {
      return res.status(403).json({ error: "main_leader_cannot_assign_admin" });
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role: body.role },
  });
  emitUserUpdated(updated);
  res.json({ user: publicUser(updated) });
});

app.get("/users/search", auth(), async (req: AuthRequest, res) => {
  const q = String(req.query.q ?? "");
  const groupId = req.query.groupId ? String(req.query.groupId) : undefined;
  const users = await prisma.user.findMany({
    where: {
      AND: [
        q ? { name: { contains: q, mode: "insensitive" } } : {},
        groupId ? { memberships: { some: { groupId } } } : {},
      ],
    },
    include: { memberships: true },
    take: 100,
  });
  res.json(users.map((u: typeof users[number]) => publicUser(u)));
});

app.get("/groups", auth(), async (req: AuthRequest, res) => {
  const groups = await prisma.group.findMany({
    where: { memberships: { some: { userId: req.user!.id } } },
    include: { memberships: true },
  });
  res.json(groups);
});

app.post("/groups", auth(), async (req: AuthRequest, res) => {
  const body = z.object({ name: z.string().min(2) }).parse(req.body);
  const group = await prisma.group.create({
    data: {
      name: body.name,
      creatorId: req.user!.id,
      memberships: { create: { userId: req.user!.id } },
    },
    include: { memberships: true },
  });
  io.emit("group:new", group);
  res.json(group);
});

app.post("/groups/:groupId/members", auth(), async (req: AuthRequest, res) => {
  const body = z.object({ userId: z.string() }).parse(req.body);
  const groupId = String(req.params.groupId);
  const added = await prisma.groupMembership.upsert({
    where: { userId_groupId: { userId: body.userId, groupId } },
    update: {},
    create: { userId: body.userId, groupId },
  });
  await emitGroupUpdated(groupId);
  res.json(added);
});

app.delete("/groups/:groupId/members/:userId", auth(), async (req, res) => {
  const groupId = String(req.params.groupId);
  const userId = String(req.params.userId);
  await prisma.groupMembership.delete({
    where: { userId_groupId: { groupId, userId } },
  });
  await emitGroupUpdated(groupId);
  res.status(204).send();
});

app.post("/locations", auth(), async (req: AuthRequest, res) => {
  const body = z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      heading: z.number().optional(),
      accuracy: z.number().optional(),
    })
    .parse(req.body);
  const update = await prisma.locationUpdate.create({
    data: { userId: req.user!.id, ...body },
  });
  io.emit("location:update", update);
  res.json(update);
});

app.get("/locations/latest", auth(), async (_req, res) => {
  const latest = await prisma.locationUpdate.findMany({
    orderBy: { updatedAt: "desc" },
    distinct: ["userId"],
    include: { user: true },
  });
  res.json(
    latest.map((x: typeof latest[number]) => ({
      ...x,
      user: publicUser(x.user),
      status: Date.now() - new Date(x.updatedAt).getTime() < 60_000 ? "online" : "last_known",
    })),
  );
});

function canManageMeetingPoint(
  user: { id: string; role: AppRole },
  meeting: { creatorId: string },
) {
  if (user.role === "ADMIN") return true;
  return meeting.creatorId === user.id;
}

app.post("/meeting-points", auth(), async (req: AuthRequest, res) => {
  const parsed = z
    .object({
      title: meetingTitleSchema,
      latitude: z.number(),
      longitude: z.number(),
      scope: z.enum(["GLOBAL", "GROUP", "SELECTED"]),
      targetIds: z.array(z.string()).default([]),
      activeUntil: z.string().datetime().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    const { status, body } = validationErrorResponse(parsed.error);
    return res.status(status).json(body);
  }
  const body = parsed.data;

  if (body.scope === "GLOBAL" && req.user!.role !== "LEADER") {
    return res.status(403).json({
      error: "global_meeting_leader_only",
      detail: "Bod stretnutia pre všetkých môže vytvoriť len vedúci.",
    });
  }
  if (body.scope === "GROUP" && body.targetIds.length !== 1) {
    return res.status(400).json({ error: "invalid_group_target", detail: "Pre scope GROUP zadaj presne jednu skupinu." });
  }
  if (body.scope === "SELECTED" && body.targetIds.length === 0) {
    return res.status(400).json({ error: "invalid_selected_target", detail: "Pre scope SELECTED zadaj aspoň jedného účastníka." });
  }

  const existing = await prisma.meetingPoint.findMany();
  const limitConflict = findMeetingLimitConflict(existing, {
    scope: body.scope,
    targetIds: body.targetIds,
    creatorId: req.user!.id,
  });
  if (limitConflict) {
    return res.status(409).json({ error: "meeting_limit_reached", detail: limitConflict });
  }

  const mp = await prisma.meetingPoint.create({
    data: {
      title: body.title,
      creatorId: req.user!.id,
      latitude: body.latitude,
      longitude: body.longitude,
      scope: body.scope,
      targetIds: body.targetIds,
      activeUntil: body.activeUntil ? new Date(body.activeUntil) : undefined,
    },
  });
  io.emit("meeting-point:new", mp);
  res.json(mp);
});

app.get("/meeting-points", auth(), async (_req, res) => {
  const points = await prisma.meetingPoint.findMany({ orderBy: { createdAt: "desc" } });
  res.json(points);
});

app.patch("/meeting-points/:id", auth(), async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  const mp = await prisma.meetingPoint.findUnique({ where: { id } });
  if (!mp) return res.status(404).json({ error: "Meeting point not found" });
  if (!canManageMeetingPoint(req.user!, mp)) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }
  const parsed = z
    .object({
      title: meetingTitleSchema.optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    })
    .refine((v) => v.title !== undefined || v.latitude !== undefined || v.longitude !== undefined, {
      message: "No fields to update",
    })
    .safeParse(req.body);
  if (!parsed.success) {
    const { status, body } = validationErrorResponse(parsed.error);
    return res.status(status).json(body);
  }
  const body = parsed.data;
  const updated = await prisma.meetingPoint.update({
    where: { id: mp.id },
    data: body,
  });
  io.emit("meeting-point:updated", updated);
  res.json(updated);
});

app.delete("/meeting-points/:id", auth(), async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  const mp = await prisma.meetingPoint.findUnique({ where: { id } });
  if (!mp) return res.status(404).json({ error: "Meeting point not found" });
  if (!canManageMeetingPoint(req.user!, mp)) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }
  await prisma.meetingPoint.delete({ where: { id: mp.id } });
  io.emit("meeting-point:deleted", { id: mp.id });
  res.status(204).send();
});

app.post("/pings", auth(), async (req: AuthRequest, res) => {
  const body = z
    .object({
      scope: z.enum(["ALL", "GROUP", "SELECTED", "USER"]),
      targetIds: z.array(z.string()).default([]),
      message: z.string().min(1),
      priority: z.enum(["INFO", "MEET", "URGENT"]),
    })
    .parse(req.body);

  const cooldown = await prisma.ping.findFirst({
    where: {
      senderId: req.user!.id,
      scope: body.scope,
      targetIds: { equals: body.targetIds },
      createdAt: { gte: new Date(Date.now() - 30_000) },
    },
  });
  if (cooldown) return res.status(429).json({ error: "Ping cooldown active (30s)" });

  const ping = await prisma.ping.create({
    data: { senderId: req.user!.id, ...body },
    include: { sender: true },
  });

  const recipientIds = await resolvePingRecipientIds(
    prisma,
    body.scope,
    body.targetIds,
    req.user!.id,
  );

  io.emit("ping:new", {
    id: ping.id,
    message: ping.message,
    priority: ping.priority,
    scope: ping.scope,
    senderId: ping.senderId,
    senderName: ping.sender.name,
    recipientIds,
  });

  void sendPingPush(prisma, {
    recipientIds,
    priority: ping.priority,
    message: ping.message,
    senderName: ping.sender.name,
  });

  res.json(ping);
});

app.get("/audit-trail/:userId", auth(), async (req: AuthRequest, res) => {
  const config = await prisma.featureConfig.findUnique({ where: { id: "global" } });
  if (!config?.auditTrailEnabled && req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: "Audit trail disabled" });
  }
  const logs = await prisma.locationUpdate.findMany({
    where: { userId: String(req.params.userId) },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
  res.json(logs);
});

app.post("/incidents", auth(["MAIN_LEADER", "LEADER", "ADMIN"]), async (req: AuthRequest, res) => {
  const body = z.object({ title: z.string().min(3), targetUserId: z.string().optional() }).parse(req.body);
  const config = await prisma.featureConfig.findUnique({ where: { id: "global" } });
  if (!config?.incidentEnabled) return res.status(403).json({ error: "Incident mode disabled" });
  const incident = await prisma.incident.create({
    data: { title: body.title, targetUserId: body.targetUserId, createdById: req.user!.id },
  });
  io.emit("incident:new", incident);
  res.json(incident);
});

app.post("/usage/report", auth(), async (req, res) => {
  const body = z
    .object({
      sku: z.enum(["maps", "routes", "places"]),
      count: z.number().int().min(1).max(100).optional(),
    })
    .parse(req.body);
  await trackApiUsage(prisma, body.sku, body.count ?? 1);
  res.json({ ok: true });
});

app.get("/routes/walking", auth(), async (req: AuthRequest, res) => {
  if (!GOOGLE_MAPS_API_KEY) {
    console.error("[routes/walking] maps_key_missing", { userId: req.user?.id });
    return res.status(503).json({ error: "maps_key_missing" });
  }

  const q = z
    .object({
      originLat: z.coerce.number().min(-90).max(90),
      originLng: z.coerce.number().min(-180).max(180),
      destLat: z.coerce.number().min(-90).max(90),
      destLng: z.coerce.number().min(-180).max(180),
    })
    .parse(req.query);

  try {
    const route = await fetchWalkingDirections(
      GOOGLE_MAPS_API_KEY,
      { lat: q.originLat, lng: q.originLng },
      { lat: q.destLat, lng: q.destLng },
    );
    await trackApiUsage(prisma, "routes", 1);
    res.json(route);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "directions_failed";
    console.error("[routes/walking] failed", {
      userId: req.user?.id,
      origin: { lat: q.originLat, lng: q.originLng },
      dest: { lat: q.destLat, lng: q.destLng },
      detail,
    });
    res.status(502).json({ error: "directions_failed", detail });
  }
});

app.get("/admin/api-usage", auth(["ADMIN"]), async (_req, res) => {
  const config = await prisma.featureConfig.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global" },
  });
  const report = await getApiUsageReport(
    prisma,
    config.monthlyBudgetUsd,
    config.warningThresholdPct,
  );
  res.json(report);
});

app.get("/admin/config", auth(["ADMIN"]), async (_req, res) => {
  const config = await prisma.featureConfig.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global" },
  });
  res.json(config);
});

app.patch("/admin/config", auth(["ADMIN"]), async (req, res) => {
  const body = z
    .object({
      routesEnabled: z.boolean().optional(),
      placesEnabled: z.boolean().optional(),
      auditTrailEnabled: z.boolean().optional(),
      incidentEnabled: z.boolean().optional(),
      monthlyBudgetUsd: z.number().min(0).nullable().optional(),
      warningThresholdPct: z.number().int().min(50).max(100).optional(),
    })
    .parse(req.body);
  const config = await prisma.featureConfig.upsert({
    where: { id: "global" },
    update: body,
    create: { id: "global", ...body },
  });
  res.json(config);
});

io.on("connection", (socket) => {
  socket.emit("ready", { connectedAt: new Date().toISOString() });
});

httpServer.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
