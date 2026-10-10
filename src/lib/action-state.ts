export type ActionState = { error?: string; success?: string; link?: string } | undefined;

/** First validation message from a zod error, phrased for the person filling in the form. */
export function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Please check the form and try again.";
}
