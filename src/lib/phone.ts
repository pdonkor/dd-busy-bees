/**
 * Normalises a Ghanaian mobile number to E.164 (+233XXXXXXXXX).
 * Accepts 024 123 4567, 0241234567, 241234567, 233241234567 and +233 24 123 4567.
 * Returns null when the input isn't a valid Ghana mobile number.
 */
export function normaliseGhanaPhone(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;

  if (digits.startsWith("233")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);

  // Ghana mobile numbers: 9 digits after the country code, starting 2 or 5.
  if (!/^[25]\d{8}$/.test(digits)) return null;
  return `+233${digits}`;
}
