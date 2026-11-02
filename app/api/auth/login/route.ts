import { NextResponse } from "next/server";
import {
  createSessionToken,
  isAuthConfigured,
  passwordsMatch,
  SESSION_COOKIE,
  SESSION_DURATION_SECONDS,
} from "@/lib/auth";
import { canAttemptLogin } from "@/lib/login-rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: "Logowanie nie jest skonfigurowane." }, { status: 503 });
  }

  try {
    if (!(await canAttemptLogin(request))) {
      return NextResponse.json({ error: "Za dużo prób. Spróbuj ponownie za 15 minut." }, { status: 429 });
    }
  } catch {
    return NextResponse.json({ error: "Ochrona logowania jest chwilowo niedostępna." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe żądanie." }, { status: 400 });
  }

  const inputPassword =
    typeof body === "object" && body !== null && "password" in body && typeof body.password === "string"
      ? body.password
      : "";
  if (!passwordsMatch(inputPassword, process.env.CHAT_PASSWORD!)) {
    return NextResponse.json({ error: "Nieprawidłowe hasło." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
  return response;
}
