'use client';

export default function SaveListTable({ keys }: { keys: any[] }) {
  if (keys.length === 0) {
    return <div className="rounded-2xl border border-line p-6 text-center text-sm text-muted">Список пуст</div>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-foreground/5">
          <tr>
            <th className="px-4 py-3 text-left">Ключ</th>
            <th className="px-4 py-3 text-left">Пользователь</th>
            <th className="px-4 py-3 text-left">Истекает</th>
            <th className="px-4 py-3 text-left">Дней осталось</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.id} className="border-b border-line last:border-0">
              <td className="px-4 py-3">{k.name || k.keyId}</td>
              <td className="px-4 py-3">{k.userId}</td>
              <td className="px-4 py-3">{k.expiresAt}</td>
              <td className="px-4 py-3">{k.daysLeft}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
