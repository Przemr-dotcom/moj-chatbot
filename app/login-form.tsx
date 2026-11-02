"use client";

import { useState, type FormEvent } from "react";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Nie udało się wejść.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Nie udało się połączyć z serwerem.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="gate">
      <h1>Wpisz hasło</h1>
      <form className="composer" onSubmit={handleSubmit}>
        <input
          type="password"
          autoComplete="current-password"
          aria-label="Hasło warsztatowe"
          placeholder="Hasło warsztatowe"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <button type="submit" disabled={busy}>{busy ? "Sprawdzam…" : "Wejdź"}</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
    </main>
  );
}
