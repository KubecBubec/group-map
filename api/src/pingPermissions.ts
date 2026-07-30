import type { PrismaClient } from "@prisma/client";

type PingRole = "ADMIN" | "MAIN_LEADER" | "LEADER" | "MEMBER";

export function isPingLeader(role: PingRole): boolean {
  return role === "ADMIN" || role === "MAIN_LEADER" || role === "LEADER";
}

export async function assertCanSendPing(
  prisma: PrismaClient,
  user: { id: string; role: PingRole },
  scope: string,
  targetIds: string[],
): Promise<{ ok: true } | { ok: false; status: number; error: string; detail?: string }> {
  if (scope === "ALL") {
    if (!isPingLeader(user.role)) {
      return {
        ok: false,
        status: 403,
        error: "all_ping_leader_only",
        detail: "Ping všetkých môže poslať len vedúci.",
      };
    }
    return { ok: true };
  }

  if (scope === "GROUP") {
    if (targetIds.length === 0) {
      return { ok: false, status: 400, error: "invalid_group_target", detail: "Chýba cieľová skupina." };
    }
    if (isPingLeader(user.role)) return { ok: true };

    for (const groupId of targetIds) {
      const membership = await prisma.groupMembership.findFirst({
        where: { userId: user.id, groupId },
      });
      if (!membership) {
        return {
          ok: false,
          status: 403,
          error: "group_ping_membership_required",
          detail: "Ping skupiny môžeš poslať len do skupiny, v ktorej si členom.",
        };
      }
    }
    return { ok: true };
  }

  if (scope === "SELECTED" || scope === "USER") {
    if (targetIds.length === 0) {
      return { ok: false, status: 400, error: "invalid_ping_targets", detail: "Chýba príjemca pingu." };
    }
    return { ok: true };
  }

  return { ok: false, status: 400, error: "invalid_scope", detail: "Neplatný rozsah pingu." };
}
