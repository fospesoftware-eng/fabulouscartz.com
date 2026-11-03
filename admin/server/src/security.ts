import crypto from "node:crypto";

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export interface SessionPayload {
  sub: string;
  role: string;
  exp: number;
}

export function signToken(payload: SessionPayload, secret: string): string {
  const body = base64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(token: string, secret: string): SessionPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (expected.length !== sig.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload?.sub || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export { TOKEN_TTL_MS };
