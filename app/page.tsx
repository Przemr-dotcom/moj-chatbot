import { hasValidSession, isAuthConfigured } from "@/lib/auth";
import { Chat } from "@/app/chat";
import { LoginForm } from "@/app/login-form";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isAuthConfigured()) {
    return (
      <main className="gate">
        <h1>Ochrona niedostępna</h1>
        <p>Ustaw CHAT_PASSWORD oraz SESSION_SECRET w lokalnym pliku .env.local.</p>
      </main>
    );
  }

  if (!(await hasValidSession())) return <LoginForm />;
  return <Chat />;
}
