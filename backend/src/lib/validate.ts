import type { ZodTypeAny, z } from "zod";
import { validationError } from "./errors.js";

/** Parse input with zod and convert failures into the API error envelope. */
export function parse<T extends ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw validationError(
      "Request validation failed",
      result.error.issues.map((issue) => ({
        path: issue.path.join(".") || "(root)",
        code: issue.code,
        message: issue.message,
      })),
    );
  }
  return result.data;
}

export function tryParse<T extends ZodTypeAny>(schema: T, input: unknown): z.infer<T> | null {
  const result = schema.safeParse(input);
  return result.success ? result.data : null;
}
