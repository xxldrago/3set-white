'use client';

type FraudSignal = {
  type: string;
  severity: string;
  subject: string;
  evidence: any;
  count?: number;
};

const TYPE_LABELS: Record<string, string> = {
  self_dealing: 'Self-dealing промокод',
  mutual_referral: 'Взаимный реферал',
  ip_cluster: 'IP-кластер',
  trial_no_pay: 'Trial→no-pay',
};

export default function FraudSignalsTable({ signals }: { signals: FraudSignal[] }) {
  if (signals.length === 0) {
    return (
      <div className="rounded-2xl border border-solid border-line p-6 text-center text-sm text-muted">
        Фрод-сигналов не обнаружено
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-solid border-line">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-foreground/5">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-foreground">Тип</th>
            <th className="px-4 py-3 text-left font-medium text-foreground">Уровень</th>
            <th className="px-4 py-3 text-left font-medium text-foreground">Объект</th>
            <th className="px-4 py-3 text-left font-medium text-foreground">Доказательства</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((signal, idx) => (
            <tr key={idx} className="border-b border-line last:border-0">
              <td className="px-4 py-3 text-foreground">{TYPE_LABELS[signal.type] || signal.type}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                    signal.severity === 'высокий риск'
                      ? 'bg-red-500/10 text-red-500'
                      : signal.severity === 'проверить'
                        ? 'bg-amber-500/10 text-amber-500'
                        : 'bg-blue-500/10 text-blue-500'
                  }`}
                >
                  {signal.severity}
                </span>
              </td>
              <td className="px-4 py-3 text-foreground">{signal.subject}</td>
              <td className="px-4 py-3 text-muted">{JSON.stringify(signal.evidence)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
