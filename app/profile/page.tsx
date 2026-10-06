import Link from "next/link";
import { requireSession } from "@/lib/session";
import { Nav } from "@/components/Nav";
import { t } from "@/lib/i18n";

export default async function ProfilePage() {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black font-sans">
      <Nav session={session} />
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="space-y-6">
          <div className="rounded-2xl border border-black/10 bg-white p-6 dark:border-white/15 dark:bg-zinc-900">
            <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
              Профиль пользователя
            </h1>
            <div className="mt-4 space-y-4">
              <div>
                <h3 className="text-sm font-medium text-zinc-500">Email</h3>
                <p className="text-black dark:text-zinc-100">{session.user.email}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-zinc-500">Telegram</h3>
                <p className="text-black dark:text-zinc-100">
                  {session.user.telegramId ? `@id_${session.user.telegramId}` : "Не привязан"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
