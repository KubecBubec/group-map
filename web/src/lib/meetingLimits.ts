import type { MeetingPoint } from "./types";

export function isMeetingPointActive(mp: Pick<MeetingPoint, "activeUntil">): boolean {
  if (!mp.activeUntil) return true;
  return new Date(mp.activeUntil) > new Date();
}

export function findMeetingLimitConflict(
  existing: MeetingPoint[],
  input: { scope: MeetingPoint["scope"]; targetIds: string[]; creatorId: string },
): string | null {
  const active = existing.filter(isMeetingPointActive);

  if (input.scope === "GLOBAL") {
    const hit = active.find((m) => m.scope === "GLOBAL");
    if (hit) {
      return `Pre celú skupinu už existuje aktívny zraz „${hit.title}". Najprv ho zruš alebo ho uprav.`;
    }
    return null;
  }

  if (input.scope === "GROUP") {
    const groupId = input.targetIds[0];
    if (!groupId) return "Vyber skupinu.";
    const hit = active.find((m) => m.scope === "GROUP" && m.targetIds.includes(groupId));
    if (hit) {
      return `Pre túto skupinu už existuje aktívny zraz „${hit.title}". Najprv ho zruš alebo ho uprav.`;
    }
    return null;
  }

  if (input.scope === "SELECTED") {
    const hit = active.find((m) => m.scope === "SELECTED" && m.creatorId === input.creatorId);
    if (hit) {
      return `Už máš aktívny zraz pre vybraných („${hit.title}"). Najprv ho zruš alebo ho uprav.`;
    }
    return null;
  }

  return null;
}

export { parseApiErrorMessage, validateMeetingTitle, MEETING_TITLE_MIN } from "./meetingValidation";
