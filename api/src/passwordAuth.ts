import bcrypt from "bcryptjs";
import { z } from "zod";

const BCRYPT_ROUNDS = 10;

export const authNameSchema = z
  .string()
  .trim()
  .min(2, "Meno musí mať aspoň 2 znaky")
  .max(40, "Meno môže mať najviac 40 znakov")
  .regex(
    /^[\p{L}\p{N} ._-]+$/u,
    "Meno môže obsahovať písmená, čísla, medzery, . _ -",
  );

export const authPasswordSchema = z
  .string()
  .min(6, "Heslo musí mať aspoň 6 znakov")
  .max(100, "Heslo je príliš dlhé");

export const credentialsSchema = z.object({
  name: authNameSchema,
  password: authPasswordSchema,
});

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

/** Stabilný e-mail pre DB (email je stále povinný v schéme). */
export function localEmailForName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${slug || "user"}@local.app`;
}

/** Unikátne zobrazované meno (Google OAuth / registrácia). */
export async function allocateUniqueName(
  exists: (name: string) => Promise<boolean>,
  preferred: string,
): Promise<string> {
  const base = preferred.trim().slice(0, 40) || "User";
  let candidate = base;
  let n = 2;
  while (await exists(candidate)) {
    const suffix = ` ${n++}`;
    candidate = `${base.slice(0, Math.max(1, 40 - suffix.length))}${suffix}`;
  }
  return candidate;
}
