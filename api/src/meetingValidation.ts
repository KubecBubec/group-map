import { z } from "zod";

export const MEETING_TITLE_MIN = 2;

export const meetingTitleSchema = z
  .string()
  .trim()
  .min(MEETING_TITLE_MIN, { message: "Názov musí mať aspoň 2 znaky." });

export function meetingTitleErrorMessage(): string {
  return `Názov musí mať aspoň ${MEETING_TITLE_MIN} znaky.`;
}

export function validationErrorResponse(error: z.ZodError): { status: number; body: { error: string; detail: string } } {
  const titleIssue = error.issues.find((issue) => issue.path[0] === "title");
  if (titleIssue) {
    return {
      status: 400,
      body: { error: "invalid_title", detail: meetingTitleErrorMessage() },
    };
  }
  return {
    status: 400,
    body: { error: "validation_error", detail: "Neplatné údaje." },
  };
}
