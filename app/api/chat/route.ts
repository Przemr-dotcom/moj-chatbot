import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
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

  const messages: UIMessage[] = [];
  let totalLength = 0;
  for (const item of rawMessages) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("role" in item) ||
      !("parts" in item) ||
      (item.role !== "user" && item.role !== "assistant") ||
      !Array.isArray(item.parts)
    ) {
      return NextResponse.json({ error: "Nieprawidłowa wiadomość." }, { status: 400 });
    }

    const textParts: string[] = [];
    for (const part of item.parts as unknown[]) {
      if (
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        textParts.push(part.text);
      }
    }
    const text = textParts.join("").trim();
    if (!text || text.length > 4000) {
      return NextResponse.json({ error: "Wiadomość musi mieć od 1 do 4000 znaków." }, { status: 400 });
    }
    totalLength += text.length;
    if (totalLength > 12000) {
      return NextResponse.json({ error: "Rozmowa jest za długa. Rozpocznij nową." }, { status: 400 });
    }
    messages.push({
      id: `message-${messages.length}`,
      role: item.role,
      parts: [{ type: "text", text }],
    });
  }

  const openrouter = createOpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    name: "openrouter",
  });

  const result = streamText({
    model: openrouter(model),
    messages: await convertToModelMessages(messages),
    maxOutputTokens: 512,
  });

  return result.toTextStreamResponse({
    headers: { "Cache-Control": "no-cache, no-transform" },
  });
}
