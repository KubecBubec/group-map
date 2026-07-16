import type { Group, MeetingPoint, SearchUser } from "./types";

/** Určí používateľov, pre ktorých sa počíta ETA k bodu stretnutia. */
export function resolveMeetingTargetUserIds(
  meeting: MeetingPoint,
  users: SearchUser[],
  groups: Group[],
): string[] {
  if (meeting.scope === "GLOBAL") {
    return users.map((u) => u.id);
  }
  if (meeting.scope === "GROUP") {
    const ids = new Set<string>();
    for (const groupId of meeting.targetIds) {
      const g = groups.find((x) => x.id === groupId);
      for (const m of g?.memberships ?? []) ids.add(m.userId);
    }
    return [...ids];
  }
  if (meeting.scope === "SELECTED") {
    return meeting.targetIds;
  }
  return [];
}

export function meetingTargetUsers(
  meeting: MeetingPoint,
  users: SearchUser[],
  groups: Group[],
): SearchUser[] {
  const ids = new Set(resolveMeetingTargetUserIds(meeting, users, groups));
  return users.filter((u) => ids.has(u.id));
}
