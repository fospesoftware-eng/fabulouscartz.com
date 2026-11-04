import { prisma } from "../db.js";

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

/** Turn an email local-part into a valid candidate handle. */
export function usernameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "member";
  const cleaned = local
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "_")
    .replace(/^[_ .-]+|[_ .-]+$/g, "");
  if (cleaned.length >= 3) return cleaned.slice(0, 32);
  const padded = `${cleaned || "member"}_user`;
  return padded.slice(0, 32);
}

/**
 * Find a free handle: the requested one first, then base_2, base_3, ...
 * Callers should still handle the unique-index race with a retry at the edge.
 */
export async function allocateUsername(preferred: string): Promise<string> {
  const base = normalizeUsername(preferred);
  if (!USERNAME_PATTERN.test(base)) {
    throw new Error(`Invalid username seed: ${preferred}`);
  }
  let candidate = base;
  let suffix = 2;
  while (await prisma.user.findUnique({ where: { username: candidate } })) {
    const trimmed = base.slice(0, 32 - String(suffix).length - 1);
    candidate = `${trimmed}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}
