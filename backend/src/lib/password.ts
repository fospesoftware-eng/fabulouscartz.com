import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

const PREDICTABLE = new Set([
  "password",
  "password123",
  "password1234",
  "passw0rd",
  "letmein123",
  "qwertyuiop",
  "qwerty1234",
  "iloveyou123",
  "admin12345",
  "admin123456",
  "welcome1234",
  "fabulouscartz",
  "fabulous123",
]);

/**
 * Returns a human-readable policy failure, or null when the password passes.
 * Checks are intentionally specific so the UI can tell the user what to fix,
 * without revealing anything about other accounts.
 */
export function passwordPolicyMessage(value: string): string | null {
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  }
  if (!/[A-Za-z]/.test(value)) return "Password must include at least one letter";
  if (!/[0-9]/.test(value)) return "Password must include at least one number";
  if (!/[^A-Za-z0-9]/.test(value)) return "Password must include at least one symbol";
  if (/(.)\1{3,}/.test(value)) return "Password must not repeat the same character four or more times";
  if (PREDICTABLE.has(value.toLowerCase())) return "Password is too predictable";
  return null;
}

/** zod schema shared by registration, password change and staff creation. */
export const passwordSchema = z
  .string()
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`)
  .superRefine((value, ctx) => {
    const message = passwordPolicyMessage(value);
    if (message) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    }
  });
