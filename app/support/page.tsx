import Link from "next/link";
import { requireSession } from "@/lib/session";
import { Nav } from "@/components/Nav";
import { t } from "@/lib/i18n";

export default async function SupportPage() {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black font-sans">
      <Nav session={session} />
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="space-y-6">
          <div className="rounded-2xl border border-black/10 bg-white p-6 dark:border-white/15 dark:bg-zinc-900">
            <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
              Поддержка
            </h1>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              Свяжитесь с нами через форму ниже или создайте новый тикет.
            </p>
            <Link href="/support/new" className="mt-4 inline-flex items-center rounded-full bg-foreground px-5 py-2.5 text-background hover:bg-[#383838] dark:hover:bg-[#ccc]">
              Создать тикет
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
