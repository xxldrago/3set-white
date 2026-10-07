import Nav from '@/components/Nav';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'FAQ — 3set VPN',
};

// FAQ content mirrors the 3set.online landing FAQ.
const FAQ: { q: string; a: string }[] = [
  {
    q: 'VPN работает в России при блокировках?',
    a: 'Да. Протокол VLESS Reality маскирует трафик под обычный HTTPS, поэтому DPI-фильтры его не распознают. Адреса серверов автоматически ротируются — если один заблокируют, приложение переключится за секунды.',
  },
  {
    q: 'Как оплатить российской картой?',
    a: 'Принимаем карты МИР, Visa/MC российских банков, СБП, а также криптовалюты USDT и TON. Ключ выдаётся автоматически в течение минуты после оплаты.',
  },
  {
    q: 'Сколько устройств можно подключить?',
    a: 'От 1 до 10 устройств в зависимости от тарифа. «Максимум» поддерживает настройку на роутере — так защищается вся домашняя сеть одним подключением.',
  },
  {
    q: 'Будет ли падать скорость?',
    a: 'Серверы держат до 1 Гбит/с. Ближайшие локации (Финляндия, Германия, Турция) дают пинг 20–40 мс — этого достаточно для 4K-стриминга и онлайн-игр.',
  },
  {
    q: 'Можно ли вернуть деньги?',
    a: 'Да, у нас 7 дней гарантии на проверку. Если сервис не подошёл — вернём полную сумму без вопросов, достаточно написать в поддержку.',
  },
  {
    q: 'Есть ли Telegram-бот?',
    a: 'Да, @3set_online_bot: выдаёт ключи, принимает оплату и присылает пошаговые инструкции для любого устройства. Это самый быстрый способ подключения с телефона.',
  },
];

export default async function FaqPage() {
  const user = await getSessionUser();

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans">
      <Nav user={user} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <header className="flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-green">
            FAQ
          </span>
          <h1 className="text-3xl font-semibold text-foreground">Вопросы и ответы</h1>
        </header>

        <div className="flex flex-col gap-3">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-line bg-panel p-5 open:shadow-[0_18px_40px_-28px_rgba(14,21,18,.3)]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-foreground">
                {item.q}
                <span className="font-mono text-lg text-green transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </main>
    </div>
  );
}
