import { prisma } from "../prisma";
import { computeFunnel } from "./promo-funnel";
import { computePromoRoi } from "./promo-roi";
import { computePartnerRoi } from "./partner-roi";

export async function loadPromoQuality(period: number = 30) {
  const since = new Date(Date.now() - period * 24 * 60 * 60 * 1000);
  
  // Get all promo codes
  const promoCodes = await prisma.promoCode.findMany({
    select: { id: true, code: true, ownerUserId: true },
  });
  
  const results = [];
  for (const promo of promoCodes) {
    const clicks = await prisma.referralClick.count({
      where: {
        promoCodeId: promo.id,
        createdAt: { gte: since },
      },
    });
    
    // Users who registered with this promo
    const registers = await prisma.user.count({
      where: {
        pendingPromo: promo.code,
        createdAt: { gte: since },
      },
    });
    
    // Users who paid with this promo
    const payingUsers = await prisma.user.findMany({
      where: {
        pendingPromo: promo.code,
      },
      select: { id: true, createdAt: true },
    });
    
    const userIds = payingUsers.map((u) => u.id);
    const pays = await prisma.order.count({
      where: {
        userId: { in: userIds },
        status: { in: ["paid", "provisioning", "provisioned"] },
        paidAt: { gte: since },
      },
    });
    
    const funnel = computeFunnel({ clicks, registers, pays });
    
    // Calculate ROI
    const orders = await prisma.order.findMany({
      where: {
        userId: { in: userIds },
        status: { in: ["paid", "provisioning", "provisioned"] },
        paidAt: { gte: since },
      },
      select: { finalAmount: true, providerCost: true },
    });
    
    const revenue = orders.reduce((sum, o) => sum + o.finalAmount, 0);
    const discountCost = 0; // Would need discount tracking
    const commissions = 0; // For partner codes
    
    const roi = computePromoRoi({ revenue, discountCost, commissions });
    
    results.push({
      code: promo.code,
      ownerUserId: promo.ownerUserId,
      funnel,
      revenue,
      roi: roi.roi,
    });
  }
  
  return results;
}

export async function loadPartnerQuality(period: number = 30) {
  const since = new Date(Date.now() - period * 24 * 60 * 60 * 1000);
  
  const partnerPromoCodes = await prisma.promoCode.findMany({
    where: { ownerUserId: { not: null } },
    select: { ownerUserId: true },
  });
  const partnerIds = [...new Set(partnerPromoCodes.map(p => p.ownerUserId!).filter(Boolean))];
  const partners = await prisma.user.findMany({
    where: { id: { in: partnerIds } },
  });
  
  const results = [];
  for (const partner of partners) {
    // Attributed users
    const attributedUsers = await prisma.user.findMany({
      where: { referredById: partner.id },
      select: { id: true },
    });
    
    const userIds = attributedUsers.map((u) => u.id);
    
    // Attributed revenue
    const orders = await prisma.order.findMany({
      where: {
        userId: { in: userIds },
        status: { in: ["paid", "provisioning", "provisioned"] },
        paidAt: { gte: since },
      },
      select: { finalAmount: true, providerCost: true },
    });
    
    const attributedRevenue = orders.reduce((sum, o) => sum + o.finalAmount, 0);
    const providerCost = orders.reduce((sum, o) => sum + (o.providerCost || 0), 0);
    
    // Commissions
    const commissions = await prisma.walletTx.aggregate({
      where: {
        userId: partner.id,
        reason: "referral_bonus",
        createdAt: { gte: since },
      },
      _sum: { amount: true },
    });
    
    const commissionsTotal = Math.abs(commissions._sum.amount || 0);
    
    // Payouts
    const payoutsApproved = await prisma.withdrawal.aggregate({
      where: {
        userId: partner.id,
        status: "approved",
        createdAt: { gte: since },
      },
      _sum: { amount: true },
    });
    
    const payoutsPending = await prisma.withdrawal.aggregate({
      where: {
        userId: partner.id,
        status: "pending",
      },
      _sum: { amount: true },
    });
    
    const roi = computePartnerRoi({
      attributedRevenue,
      commissions: commissionsTotal,
      payoutsApproved: payoutsApproved._sum.amount || 0,
      payoutsPending: payoutsPending._sum.amount || 0,
      providerCost,
    });
    
    results.push({
      partnerId: partner.id,
      partnerName: partner.firstName || partner.username || String(partner.id),
      attributedRevenue,
      commissions: commissionsTotal,
      accrualRoi: roi.accrualRoi,
      cashPosition: roi.cashPosition,
    });
  }
  
  return results;
}
