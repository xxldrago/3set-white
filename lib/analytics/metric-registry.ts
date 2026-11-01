// lib/analytics/metric-registry.ts
// Metric registry for Phase 12 - D-15
// Single source of id, label, formula, source, direction, constraints

export type MetricDirection = 'up-good' | 'down-good' | 'neutral';

export interface MetricRegistryEntry {
  id: string;
  label: string;
  formula: string;
  source: string;
  direction: MetricDirection;
  constraints: string;
  kind?: 'flow' | 'stock';
}

export const METRIC_REGISTRY: Record<string, MetricRegistryEntry> = {
  MRR: {
    id: 'MRR',
    label: 'MRR',
    formula: 'Sum of active subscription MRR (point-in-time)',
    source: 'keyCache / subscriptions',
    direction: 'up-good',
    constraints: 'Point-in-time at end of day; excludes trial',
    kind: 'stock',
  },
  ARR: {
    id: 'ARR',
    label: 'ARR',
    formula: 'MRR * 12',
    source: 'derived from MRR',
    direction: 'up-good',
    constraints: 'Derived metric',
    kind: 'stock',
  },
  activeKeys: {
    id: 'activeKeys',
    label: 'Активные ключи',
    formula: 'COUNT(keys where status=active)',
    source: 'keyCache',
    direction: 'up-good',
    constraints: 'Excludes revoked/expired',
    kind: 'stock',
  },
  newUsers: {
    id: 'newUsers',
    label: 'Новые пользователи',
    formula: 'COUNT(users where createdAt in window)',
    source: 'users',
    direction: 'up-good',
    constraints: 'New registrations in MSK window',
    kind: 'flow',
  },
  renewOrders: {
    id: 'renewOrders',
    label: 'Продления',
    formula: 'COUNT(orders where kind=renew and status=paid in window)',
    source: 'orders',
    direction: 'up-good',
    constraints: 'Paid renewals only',
    kind: 'flow',
  },
  upgradeOrders: {
    id: 'upgradeOrders',
    label: 'Апгрейды',
    formula: 'COUNT(orders where kind=upgrade and status=paid in window)',
    source: 'orders',
    direction: 'up-good',
    constraints: 'Paid upgrades only',
    kind: 'flow',
  },
  providerCostRub: {
    id: 'providerCostRub',
    label: 'Себестоимость провайдера',
    formula: 'SUM(providerCost)',
    source: 'orders',
    direction: 'down-good',
    constraints: 'Sum of provider costs for paid orders',
    kind: 'flow',
  },
  providerCostOrders: {
    id: 'providerCostOrders',
    label: 'Заказы с себестоимостью',
    formula: 'COUNT(orders where providerCost is not null)',
    source: 'orders',
    direction: 'neutral',
    constraints: 'Count of orders with provider cost data',
    kind: 'flow',
  },
  goodwillDays: {
    id: 'goodwillDays',
    label: 'Дни лояльности',
    formula: 'SUM(goodwill days granted)',
    source: 'orders',
    direction: 'neutral',
    constraints: 'Goodwill days granted to users',
    kind: 'flow',
  },
  paidOrders: {
    id: 'paidOrders',
    label: 'Оплаченные заказы',
    formula: 'COUNT(orders where status in (paid, provisioned) in window)',
    source: 'orders',
    direction: 'up-good',
    constraints: 'Paid/provisioned orders',
    kind: 'flow',
  },
  paidCashRub: {
    id: 'paidCashRub',
    label: 'Выручка',
    formula: 'SUM(finalAmount - balanceUsed) for paid orders',
    source: 'orders',
    direction: 'up-good',
    constraints: 'cash = finalAmount - balanceUsed per D-07',
    kind: 'flow',
  },
  newOrders: {
    id: 'newOrders',
    label: 'Новые заказы',
    formula: 'COUNT(orders where kind=new and status=paid in window)',
    source: 'orders',
    direction: 'up-good',
    constraints: 'New orders only',
    kind: 'flow',
  },
};

export type MetricId = keyof typeof METRIC_REGISTRY;

export function getMetric(id: MetricId): MetricRegistryEntry | undefined {
  return METRIC_REGISTRY[id];
}

export function getAllMetrics(): MetricRegistryEntry[] {
  return Object.values(METRIC_REGISTRY);
}

export function isMetricId(id: string): id is MetricId {
  return id in METRIC_REGISTRY;
}
