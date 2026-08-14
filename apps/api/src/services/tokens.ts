import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 32;
const INVALID_USERNAME_CHARACTERS = /[^a-z0-9_.-]+/g;
const EDGE_USERNAME_CHARACTERS = /^[-._]+|[-._]+$/g;

export function normalizeUsername(username: string): string {
  const normalized = username
    .trim()
    .toLowerCase()
    .replace(INVALID_USERNAME_CHARACTERS, "-")
    .replace(EDGE_USERNAME_CHARACTERS, "");

  if (!normalized) {
    throw new Error("username is required");
  }

  return normalized;
}

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function verifyToken(token: string, tokenHash: string): boolean {
  const actual = Buffer.from(hashToken(token), "utf8");
  const expected = Buffer.from(tokenHash, "utf8");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function redactSecret(value: string): string {
  if (!value) {
    return "<empty>";
  }
  if (value.length <= 8) {
    return "<redacted>";
  }
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
