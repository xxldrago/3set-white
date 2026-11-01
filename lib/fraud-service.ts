import { prisma } from "./prisma";
import { detectSelfDealing, detectMutualReferrals, detectIpClusters, detectTrialNoPayRatio } from "./analytics/fraud";

export async function loadFraudSignals() {
  const signals: any[] = [];
  
  // Self-dealing
  const promoCodes = await prisma.promoCode.findMany({
    where: { ownerUserId: { not: null } },
    select: { id: true, code: true, ownerUserId: true },
  });
  const orders = await prisma.order.findMany({
    where: { promoCode: { not: null } },
    select: { id: true, userId: true, promoCode: true },
    take: 1000,
  });
  const ordersWithPromoId = orders.map(o => ({ ...o, promoCodeId: o.promoCode }));
  signals.push(...detectSelfDealing(promoCodes, ordersWithPromoId as any));
  
  // Mutual referrals
  const users = await prisma.user.findMany({
    where: { referredById: { not: null } },
    select: { id: true, referredById: true },
  });
  signals.push(...detectMutualReferrals(users));
  
  // IP clusters
  const usersWithIp = await prisma.user.findMany({
    where: { signupIpHash: { not: null } },
    select: { id: true, signupIpHash: true, createdAt: true },
  });
  signals.push(...detectIpClusters(usersWithIp));
  
  // Trial no-pay ratio
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const trials = await prisma.user.count({ where: { trialUsed: true, createdAt: { gte: thirtyDaysAgo } } });
  const pays = await prisma.order.count({
    where: {
      status: { in: ["paid", "provisioning", "provisioned"] },
      paidAt: { gte: thirtyDaysAgo },
    },
  });
  const overallRate = trials > 0 ? (pays / trials) * 100 : 0;
  
  signals.push(...detectTrialNoPayRatio(
    { direct: trials },
    { direct: pays },
    overallRate
  ));
  
  return signals;
}

export async function dismissSignal(signalId: string, reason: string, adminId: number) {
  // Store in a simple way - could create a table, for now just log
  console.log(`Fraud signal ${signalId} dismissed by ${adminId}: ${reason}`);
  return { ok: true };
}
