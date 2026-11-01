// Pure fraud detection functions
export type FraudSeverity = "наблюдение" | "проверить" | "высокий риск";

export interface FraudSignal {
  type: "self_dealing" | "mutual_referral" | "ip_cluster" | "trial_no_pay";
  severity: FraudSeverity;
  subject: string;
  evidence: any;
  count?: number;
}

export function detectSelfDealing(
  promoCodes: Array<{ id: string; code: string; ownerUserId: number | null }>,
  orders: Array<{ id: string; userId: number; promoCodeId?: string | null }>
): FraudSignal[] {
  const signals: FraudSignal[] = [];
  for (const promo of promoCodes) {
    if (!promo.ownerUserId) continue;
    for (const order of orders) {
      if (order.promoCodeId === promo.id && order.userId === promo.ownerUserId) {
        signals.push({
          type: "self_dealing",
          severity: "высокий риск",
          subject: `promo:${promo.code}`,
          evidence: { promoCodeId: promo.id, ownerUserId: promo.ownerUserId, orderId: order.id },
        });
        break;
      }
    }
  }
  return signals;
}

export function detectMutualReferrals(
  users: Array<{ id: number; referredById: number | null }>
): FraudSignal[] {
  const signals: FraudSignal[] = [];
  const userMap = new Map(users.map((u) => [u.id, u.referredById]));
  const seen = new Set<string>();
  
  for (const user of users) {
    if (!user.referredById) continue;
    const referrer = userMap.get(user.referredById);
    if (referrer === user.id) {
      const pair = [user.id, user.referredById].sort((a, b) => a - b).join(',');
      if (seen.has(pair)) continue;
      seen.add(pair);
      signals.push({
        type: "mutual_referral",
        severity: "проверить",
        subject: `users:${user.id},${user.referredById}`,
        evidence: { userA: user.id, userB: user.referredById },
      });
    }
  }
  return signals;
}

export function detectIpClusters(
  users: Array<{ id: number; signupIpHash: string | null; createdAt: Date }>
): FraudSignal[] {
  const signals: FraudSignal[] = [];
  const clusters = new Map<string, Array<{ id: number; createdAt: Date }>>();
  
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  for (const user of users) {
    if (!user.signupIpHash) continue;
    if (user.createdAt < thirtyDaysAgo) continue;
    if (!clusters.has(user.signupIpHash)) {
      clusters.set(user.signupIpHash, []);
    }
    clusters.get(user.signupIpHash)!.push({ id: user.id, createdAt: user.createdAt });
  }
  
  for (const [ipHash, clusterUsers] of clusters) {
    if (clusterUsers.length >= 3) {
      signals.push({
        type: "ip_cluster",
        severity: "наблюдение",
        subject: `ip:${ipHash.slice(0, 8)}...`,
        evidence: { userIds: clusterUsers.map((u) => u.id), count: clusterUsers.length },
        count: clusterUsers.length,
      });
    }
  }
  return signals;
}

export function detectTrialNoPayRatio(
  trialsBySource: Record<string, number>,
  paysBySource: Record<string, number>,
  overallRate: number
): FraudSignal[] {
  const signals: FraudSignal[] = [];
  
  for (const [source, trialCount] of Object.entries(trialsBySource)) {
    if (trialCount < 20) continue;
    const payCount = paysBySource[source] || 0;
    const rate = (payCount / trialCount) * 100;
    if (rate <= overallRate * 0.5) {
      signals.push({
        type: "trial_no_pay",
        severity: "проверить",
        subject: `source:${source}`,
        evidence: { trials: trialCount, pays: payCount, rate, overallRate },
        count: trialCount,
      });
    }
  }
  return signals;
}
