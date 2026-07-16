import type { AuthUser, MeetingPoint, Role } from "./types";

/** Upraviť / zrušiť bod stretnutia môže autor alebo admin – nie hocijaký vedúci. */
export function canManageMeetingPoint(user: AuthUser | null, meeting: MeetingPoint): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  return meeting.creatorId === user.id;
}

/** Globálny zraz („pre všetkých“) môže vytvoriť len vedúci. */
export function canCreateGlobalMeetingPoint(user: AuthUser | null | { role: Role }): boolean {
  return user?.role === "LEADER";
}
