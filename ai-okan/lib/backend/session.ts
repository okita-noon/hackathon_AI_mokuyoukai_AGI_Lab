import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export const SESSION_COOKIE = "ai_okan_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AnonymousSession = {
  id: string;
  isNew: boolean;
  secure: boolean;
};

function cookieValue(header: string | null, name: string): string | undefined {
  for (const part of header?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator === -1 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
}

export function anonymousSession(request: Request): AnonymousSession {
  const candidate = cookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  const id = candidate && SESSION_ID.test(candidate) ? candidate.toLowerCase() : randomUUID();
  return {
    id,
    isNew: id !== candidate?.toLowerCase(),
    secure: process.env.NODE_ENV === "production" || new URL(request.url).protocol === "https:",
  };
}

export function jsonWithSession(
  session: AnonymousSession,
  body: unknown,
  init?: ResponseInit,
) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  if (session.isNew) {
    response.cookies.set(SESSION_COOKIE, session.id, {
      httpOnly: true,
      secure: session.secure,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
      priority: "high",
    });
  }
  return response;
}
