import webpush from "web-push";
import type { PrismaClient } from "@prisma/client";

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@koordinator.local";

export const pushEnabled = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);

if (pushEnabled) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

export function getVapidPublicKey(): string | null {
  return pushEnabled ? VAPID_PUBLIC : null;
}

export async function resolvePingRecipientIds(
  prisma: PrismaClient,
  scope: string,
  targetIds: string[],
  senderId: string,
): Promise<string[]> {
  let ids: string[] = [];

  if (scope === "ALL") {
    const users = await prisma.user.findMany({ select: { id: true } });
    ids = users.map((u) => u.id);
  } else if (scope === "GROUP") {
    const members = await prisma.groupMembership.findMany({
      where: { groupId: { in: targetIds } },
      select: { userId: true },
    });
    ids = members.map((m) => m.userId);
  } else if (scope === "SELECTED" || scope === "USER") {
    ids = targetIds;
  }

  return [...new Set(ids.filter((id) => id !== senderId))];
}

const PRIORITY_LABEL: Record<string, string> = {
  INFO: "Info",
  MEET: "Stretnutie",
  URGENT: "Súrne",
};

export async function sendPingPush(
  prisma: PrismaClient,
  input: {
    recipientIds: string[];
    priority: string;
    message: string;
    senderName: string;
  },
): Promise<void> {
  await sendPushToUsers(prisma, {
    recipientIds: input.recipientIds,
    title: `${PRIORITY_LABEL[input.priority] ?? "Ping"} · ${input.senderName}`,
    body: input.message,
    tag: `ping-${Date.now()}`,
  });
}

const MEETING_SCOPE_LABEL: Record<string, string> = {
  GLOBAL: "pre všetkých",
  GROUP: "pre skupinu",
  SELECTED: "pre vybraných",
};

export async function sendMeetingPointPush(
  prisma: PrismaClient,
  input: {
    recipientIds: string[];
    title: string;
    scope: string;
    creatorName: string;
  },
): Promise<void> {
  const scopeLabel = MEETING_SCOPE_LABEL[input.scope] ?? "";
  await sendPushToUsers(prisma, {
    recipientIds: input.recipientIds,
    title: `Zraz · ${input.creatorName}`,
    body: scopeLabel
      ? `Nový bod stretnutia ${scopeLabel}: ${input.title}`
      : `Nový bod stretnutia: ${input.title}`,
    tag: `meeting-${Date.now()}`,
    url: "/",
  });
}

async function sendPushToUsers(
  prisma: PrismaClient,
  input: {
    recipientIds: string[];
    title: string;
    body: string;
    tag: string;
    url?: string;
  },
): Promise<void> {
  if (!pushEnabled || input.recipientIds.length === 0) return;

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: input.recipientIds } },
  });
  if (subs.length === 0) return;

  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    url: input.url ?? "/",
    tag: input.tag,
  });

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    }),
  );
}
