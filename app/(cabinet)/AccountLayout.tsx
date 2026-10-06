"use client";

import { requireSession, SessionError } from "@/lib/session";
import { Nav } from "@/components/Nav";
import { redirect } from "next/navigation";

interface User {
  name: string | null;
  email: string;
  telegramId: number | null;
}

interface AccountProps {
  children: React.ReactNode;
  session: { user: User } | null;
}

export default async function AccountLayout({ children }: AccountProps) {
  let session: { user: User } | null = null;
  try {
    session = await requireSession();
  } catch (err) {
    if (!(err instanceof SessionError)) throw err;
    redirect("/login");
  }

  return <>{children}</>;
}
