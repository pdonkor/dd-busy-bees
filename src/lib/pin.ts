import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** Pick-up PINs are four digits, and the most guessable ones are refused. */
export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin) && !/^(\d)\1{3}$/.test(pin) && !["1234", "4321", "0123", "9876"].includes(pin);
}

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return ["scrypt", salt.toString("base64"), hash.toString("base64")].join(":");
}

export function checkPin(pin: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = scryptSync(pin, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(expected, actual);
}

/** Wrong PIN attempts allowed per child per day before PIN check-out locks for that child. */
export const MAX_PIN_FAILURES = 5;
