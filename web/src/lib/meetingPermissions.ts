import type { AuthUser, MeetingPoint } from "./types";

export function canManageMeetingPoint(user: AuthUser | null, meeting: MeetingPoint): boolean {
  if (!user) return false;
  if (user.role === "ADMIN" || user.role === "MAIN_LEADER" || user.role === "LEADER") return true;
  return meeting.creatorId === user.id;
}
