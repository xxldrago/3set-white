import { createHash } from "node:crypto";
import { clientIp } from "./client-ip";

export function hashIpString(ip: string): string | null {
  if (!ip || ip === "direct") return null;
  return createHash("sha256").update(ip).digest("hex");
}

export function getSignupIpHash(req: Request): string | null {
  const ip = clientIp(req);
  return hashIpString(ip);
}

export function getTrialIpHash(req: Request): string | null {
  const ip = clientIp(req);
  return hashIpString(ip);
}
