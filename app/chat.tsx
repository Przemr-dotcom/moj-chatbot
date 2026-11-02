"use client";

import { useState, type FormEvent } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };

export function Chat() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage || busy) return;

    const updatedMessages = [...messages, { role: "user" as const, content: trimmedMessage }];
    setMessages(updatedMessages);
    setMessage("");
    setError("");
    setBusy(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages.slice(-20).map((currentMessage, index) => ({
            id: `message-${index}`,
            role: currentMessage.role,
            parts: [{ type: "text", text: currentMessage.content }],
          })),
        }),
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        setError(result.error ?? "Nie udało się uzyskać odpowiedzi.");
        return;
      }

      if (!response.body) throw new Error("Brak strumienia odpowiedzi.");
      setMessages((currentMessages) => [...currentMessages, { role: "assistant", content: "" }]);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        setMessages((currentMessages) => {
          const nextMessages = [...currentMessages];
          const lastMessage = nextMessages[nextMessages.length - 1];
          if (lastMessage?.role === "assistant") {
            nextMessages[nextMessages.length - 1] = { ...lastMessage, content: reply };
          }
          return nextMessages;
        });
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      reply += decoder.decode();
      setMessages((currentMessages) => {
        const nextMessages = [...currentMessages];
        const lastMessage = nextMessages[nextMessages.length - 1];
        if (lastMessage?.role === "assistant") {
          nextMessages[nextMessages.length - 1] = { ...lastMessage, content: reply };
        }
        return nextMessages;
      });
    } catch {
      setError("Nie udało się połączyć z serwerem.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  }

  return (
    <main className="chat">
      <div className="chat-heading">
        <h1>Mój chatbot</h1>
        <button className="logout-button" type="button" onClick={logout}>Wyjdź</button>
      </div>
      <section className="conversation" aria-label="Rozmowa" aria-live="polite">
        {messages.map((currentMessage, index) => (
          <p className={`message ${currentMessage.role}`} key={`${index}-${currentMessage.role}`}>
            {currentMessage.content}
          </p>
        ))}
        {busy && messages[messages.length - 1]?.role === "user" && (
          <p className="message assistant">Piszę odpowiedź…</p>
        )}
      </section>
      <form className="composer" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Napisz wiadomość…"
          aria-label="Wiadomość"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <button type="submit" disabled={busy}>{busy ? "Wysyłam…" : "Wyślij"}</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
    </main>
  );
}
