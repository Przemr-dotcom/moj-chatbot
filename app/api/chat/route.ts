import { NextResponse } from "next/server";
import { hasValidSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await hasValidSession())) {
    return NextResponse.json({ error: "Brak aktywnej sesji." }, { status: 401 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  if (!apiKey || !model) {
    return NextResponse.json({ error: "Brakuje konfiguracji OpenRouter na serwerze." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe żądanie." }, { status: 400 });
  }

  const rawMessages =
    typeof body === "object" && body !== null && "messages" in body && Array.isArray(body.messages)
      ? body.messages
      : null;
  if (!rawMessages || rawMessages.length === 0 || rawMessages.length > 20) {
    return NextResponse.json({ error: "Rozmowa musi zawierać od 1 do 20 wiadomości." }, { status: 400 });
  }

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  let totalLength = 0;
  for (const item of rawMessages) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("role" in item) ||
      !("content" in item) ||
      (item.role !== "user" && item.role !== "assistant") ||
      typeof item.content !== "string"
    ) {
      return NextResponse.json({ error: "Nieprawidłowa wiadomość." }, { status: 400 });
    }
    const content = item.content.trim();
    if (!content || content.length > 4000) {
      return NextResponse.json({ error: "Wiadomość musi mieć od 1 do 4000 znaków." }, { status: 400 });
    }
    totalLength += content.length;
    if (totalLength > 12000) {
      return NextResponse.json({ error: "Rozmowa jest za długa. Rozpocznij nową." }, { status: 400 });
    }
    messages.push({ role: item.role, content });
  }

  try {
    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages, max_tokens: 512 }),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: "OpenRouter nie przyjął zapytania. Sprawdź model i klucz API." }, { status: 502 });
    }

    const result: unknown = await upstream.json();
    if (
      typeof result !== "object" ||
      result === null ||
      !("choices" in result) ||
      !Array.isArray(result.choices)
    ) {
      return NextResponse.json({ error: "OpenRouter zwrócił nieoczekiwaną odpowiedź." }, { status: 502 });
    }
    const firstChoice = result.choices[0];
    if (
      typeof firstChoice !== "object" ||
      firstChoice === null ||
      !("message" in firstChoice) ||
      typeof firstChoice.message !== "object" ||
      firstChoice.message === null ||
      !("content" in firstChoice.message) ||
      typeof firstChoice.message.content !== "string"
    ) {
      return NextResponse.json({ error: "Model nie zwrócił tekstowej odpowiedzi." }, { status: 502 });
    }

    return NextResponse.json({ reply: firstChoice.message.content });
  } catch {
    return NextResponse.json({ error: "Nie udało się połączyć z OpenRouter." }, { status: 502 });
  }
}
