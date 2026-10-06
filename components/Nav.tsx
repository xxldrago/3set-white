"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { requireSession } from "@/lib/session";

interface NavProps {
  session: Awaited<ReturnType<typeof requireSession>>;
}

const NAV_ITEMS: { href: string; label: string; exact?: boolean }[] = [
  { href: "/", label: "Подписки" },
  { href: "/payments", label: "История платежей" },
  { href: "/support", label: "Поддержка" },
  { href: "/profile", label: "Профиль" },
];

export default function Nav({ session }: NavProps) {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-black/10 bg-white/80 backdrop-blur dark:border-white/15 dark:bg-black/80">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <img src="/logo.png" alt="3set" className="h-8 w-auto" />
          <span className="text-lg font-semibold text-black dark:text-zinc-50">
            3set
          </span>
        </Link>

        <ul className="flex items-center gap-2">
          {NAV_ITEMS.map((item) => {
            const exactActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                    exactActive
                      ? "bg-black text-white dark:bg-white dark:text-black"
                      : "text-zinc-600 hover:bg-black/5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}

          <li>
            <Link
              href="/profile"
              className={`ml-2 flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-xs font-medium transition-colors hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10 ${
                session ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-400"
              }`}
              title={session ? session.user.name : "Профиль"}
            >
              {session ? session.user.email.slice(0, 1).toUpperCase() : "?"}
            </Link>
          </li>
        </ul>
      </div>
    </nav>
  );
}
