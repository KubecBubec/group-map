export const MEETING_TITLE_MIN = 2;

export function validateMeetingTitle(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return "Zadaj názov.";
  if (trimmed.length < MEETING_TITLE_MIN) {
    return `Názov musí mať aspoň ${MEETING_TITLE_MIN} znaky.`;
  }
  return null;
}

export function parseApiErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const raw = err.message.trim();
  if (!raw) return fallback;

  try {
    const body = JSON.parse(raw) as
      | { detail?: string; error?: string; issues?: { path?: (string | number)[]; message?: string }[] }
      | { path?: (string | number)[]; message?: string }[];

    if (Array.isArray(body)) {
      const titleIssue = body.find((issue) => issue.path?.[0] === "title");
      if (titleIssue) return meetingTitleApiMessage();
      return fallback;
    }

    if (body.detail) return body.detail;
    if (body.error === "invalid_title") return meetingTitleApiMessage();
    if (body.issues?.length) {
      const titleIssue = body.issues.find((issue) => issue.path?.[0] === "title");
      if (titleIssue) return meetingTitleApiMessage();
    }
    if (body.error && body.error !== "validation_error") return body.error;
  } catch {
    if (raw.includes("too_small") && raw.includes("title")) return meetingTitleApiMessage();
  }

  return raw.length > 120 ? fallback : raw;
}

function meetingTitleApiMessage(): string {
  return `Názov musí mať aspoň ${MEETING_TITLE_MIN} znaky.`;
}
