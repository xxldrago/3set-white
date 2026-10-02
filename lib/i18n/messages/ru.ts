// RU string dictionary (D-16). Every visible string in the cabinet resolves
// through these keys; a future EN pack adds messages/en.ts with the same
// key shape and needs no refactor. Placeholder icons live under public/icons
// and are swapped by dropping real artwork at the same paths (OQ-2).
export const ru = {
  app: {
    name: '3set VPN',
    tagline: 'VPN-подписки: покупка и управление ключами',
  },
  home: {
    keysTitle: 'Мои ключи',
    keysText: 'Кабинет-скелет: список ключей появится в следующих фазах.',
    loginTitle: 'Вход в кабинет',
    loginText: 'Войдите через Telegram, чтобы управлять подпиской.',
    loginCta: 'Войти через Telegram',
    guidesCta: 'Инструкции по подключению',
  },
  login: {
    title: 'Вход через Telegram',
    text: 'Нажмите кнопку ниже, чтобы войти через Telegram. Сессия сохраняется в защищённой cookie.',
    widgetNote: 'Вход через виджет Telegram для браузера.',
    webappNote: 'При входе из бота данные передаются автоматически.',
    error: 'Не удалось войти. Попробуйте ещё раз.',
  },
  guides: {
    title: 'Инструкции по подключению',
    intro: 'Выберите приложение и следуйте шагам. Ключи появятся в кабинете после покупки.',
    v2rayTitle: 'v2rayNG (Android)',
    v2rayText: 'Установите v2rayNG, скопируйте subscription-ссылку из кабинета и вставьте её в приложение.',
    streisandTitle: 'Streisand (iOS)',
    streisandText: 'Установите Streisand, добавьте подписку по ссылке из кабинета и включите соединение.',
    hiddifyTitle: 'Hiddify (Android / iOS / Desktop)',
    hiddifyText: 'Установите Hiddify, импортируйте ссылку подписки и нажмите «Подключить».',
    back: 'На главную',
  },
  pwa: {
    install: 'Установить приложение',
    dismiss: 'Не сейчас',
  },
  pricing: {
    title: 'Выберите тариф',
    daysLabel: 'Срок',
    days7: '7 дней',
    days30: '30 дней',
    days90: '90 дней',
    devicesLabel: 'Устройства',
    priceLabel: 'Стоимость',
    price: '{price} ₽',
    error: 'Не удалось загрузить цены. Попробуйте ещё раз.',
  },
  common: {
    retry: 'Повторить',
  },
  bot: {
    welcome: 'Добро пожаловать в 3set VPN! Выберите раздел ниже.',
    menuKeys: 'Мои ключи',
    menuGuides: 'Инструкции',
    menuHelp: 'Помощь',
  },
} as const;

export type Messages = typeof ru;

/** Dot-path union of every string leaf, e.g. 'home.loginCta'. */
type LeafPaths<T, Prefix extends string = ''> = {
  [K in keyof T]: T[K] extends string
    ? Prefix extends ''
      ? `${K & string}`
      : `${Prefix}.${K & string}`
    : LeafPaths<T[K], Prefix extends '' ? `${K & string}` : `${Prefix}.${K & string}`>;
}[keyof T];

export type I18nKey = LeafPaths<Messages>;

/** Flatten the dictionary to dot-path entries (used by t() and the completeness spec). */
export function flattenMessages(
  node: Record<string, unknown>,
  prefix = '',
): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.push([path, value]);
    else if (value !== null && typeof value === 'object') {
      out.push(...flattenMessages(value as Record<string, unknown>, path));
    }
  }
  return out;
}

export function allKeys(): string[] {
  return flattenMessages(ru as unknown as Record<string, unknown>).map(([k]) => k);
}
