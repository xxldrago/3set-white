'use client';

export default function UpsellRadarTable({ users }: { users: any[] }) {
  if (users.length === 0) {
    return <div className="rounded-2xl border border-line p-6 text-center text-sm text-muted">Нет кандидатов</div>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-foreground/5">
          <tr>
            <th className="px-4 py-3 text-left">Пользователь</th>
            <th className="px-4 py-3 text-left">Трафик</th>
            <th className="px-4 py-3 text-left">Устройства</th>
            <th className="px-4 py-3 text-left">Текущий тариф</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-line last:border-0">
              <td className="px-4 py-3">{u.id}</td>
              <td className="px-4 py-3">{u.traffic}</td>
              <td className="px-4 py-3">{u.devices}</td>
              <td className="px-4 py-3">{u.tariff}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
