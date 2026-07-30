import type { AuthUser, Group, PingScope, Role } from "./types";

export function isPingLeader(user: { role: Role } | null | undefined): boolean {
  const role = user?.role;
  return role === "ADMIN" || role === "MAIN_LEADER" || role === "LEADER";
}

export function userGroups(userId: string | undefined, groups: Group[]): Group[] {
  if (!userId) return [];
  return groups.filter((g) => g.memberships?.some((m) => m.userId === userId));
}

export function canPingAll(user: { role: Role } | null | undefined): boolean {
  return isPingLeader(user);
}

export function canPingGroup(
  user: AuthUser | null | undefined,
  groupId: string,
  groups: Group[],
): boolean {
  if (!user) return false;
  if (isPingLeader(user)) return true;
  return userGroups(user.id, groups).some((g) => g.id === groupId);
}

/** Cieľ pre zvonček v hornom paneli – vedúci pingne všetkých, člen svoju skupinu. */
export function resolveTopBarPingTarget(
  user: AuthUser | null,
  groups: Group[],
  selectedUserIds: string[],
): { scope: PingScope; targetIds: string[]; label: string } | null {
  if (!user) return null;

  if (selectedUserIds.length > 0) {
    return { scope: "SELECTED", targetIds: selectedUserIds, label: "vybraní" };
  }

  if (canPingAll(user)) {
    return { scope: "ALL", targetIds: [], label: "všetci" };
  }

  const mine = userGroups(user.id, groups);
  if (mine.length === 1) {
    return { scope: "GROUP", targetIds: [mine[0].id], label: mine[0].name };
  }
  if (mine.length > 1) {
    const sorted = [...mine].sort((a, b) => a.name.localeCompare(b.name));
    return { scope: "GROUP", targetIds: [sorted[0].id], label: sorted[0].name };
  }

  return null;
}
