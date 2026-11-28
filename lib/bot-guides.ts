// Instruction catalog for the bot's «Инструкции» section.
//
// One platform tap renders EVERY app of that platform in a single message —
// install link, the subscription link (when an active subscription exists) and
// steps. There is no second "pick an app" step: that tap used to be a dead end
// for users, and the message is the whole guide.
//
// Telegram only accepts http(s)/tg URLs in inline buttons: a `v2rayng://`
// import button fails the ENTIRE message with BUTTON_URL_INVALID, so the guide
// (and the key-link panel) never rendered. Buttons here therefore point at the
// https install/store links plus the site's install page; the subscription URL
// travels in the message text, where the user copies it into the app.
//
// Labels resolve through literal t() calls (never a computed key) so the i18n
// completeness scan registers every string this module renders.
import { t } from "./i18n";

export type GuidePlatformId = "android" | "ios" | "desktop";

export type GuideAppId = "v2rayng" | "streisand" | "hiddify" | "v2rayn" | "nekoray";

export interface GuideApp {
  id: GuideAppId;
  installUrl: string;
}

export interface GuidePlatform {
  id: GuidePlatformId;
  apps: GuideApp[];
}

export const GUIDE_PLATFORMS: GuidePlatform[] = [
  {
    id: "android",
    apps: [
      { id: "v2rayng", installUrl: "https://github.com/2dust/v2rayNG/releases" },
      { id: "hiddify", installUrl: "https://github.com/hiddify/hiddify-app/releases" },
    ],
  },
  {
    id: "ios",
    apps: [
      { id: "streisand", installUrl: "https://apps.apple.com/app/streisand/id6450534064" },
      { id: "hiddify", installUrl: "https://apps.apple.com/app/hiddify-proxy-vpn/id6596777532" },
    ],
  },
  {
    id: "desktop",
    apps: [
      { id: "hiddify", installUrl: "https://github.com/hiddify/hiddify-app/releases" },
      { id: "v2rayn", installUrl: "https://github.com/2dust/v2rayN/releases" },
      { id: "nekoray", installUrl: "https://github.com/MatsuriDayo/nekoray/releases" },
    ],
  },
];

export function isGuidePlatform(value: string): value is GuidePlatformId {
  return value === "android" || value === "ios" || value === "desktop";
}

function platformTitle(id: GuidePlatformId): string {
  switch (id) {
    case "android":
      return t("bot.guidesPlatformAndroid");
    case "ios":
      return t("bot.guidesPlatformIOS");
    default:
      return t("bot.guidesPlatformDesktop");
  }
}

function appName(id: GuideAppId): string {
  switch (id) {
    case "v2rayng":
      return t("bot.guidesAppV2ray");
    case "streisand":
      return t("bot.guidesAppStreisand");
    case "hiddify":
      return t("bot.guidesAppHiddify");
    case "v2rayn":
      return t("bot.guidesAppV2rayN");
    default:
      return t("bot.guidesAppNekoRay");
  }
}

export type GuideButton =
  | { text: string; url: string }
  | { text: string; callback_data: string };

/**
 * Build the single message for one platform: every app, its install link and
 * steps, plus the subscription link when one is live. `installUrl` is the
 * site's /install page (all platforms, all apps) for the «Инструкции на сайте»
 * button.
 */
export function guidePlatformMessage(
  platformId: GuidePlatformId,
  subscriptionUrl: string | null,
  installUrl: string,
): { text: string; keyboard: GuideButton[][] } {
  const platform = GUIDE_PLATFORMS.find((row) => row.id === platformId) ?? GUIDE_PLATFORMS[0]!;
  const title = platformTitle(platform.id);
  const blocks: string[] = [`📱 <b>${t("bot.guidesPlatformTitle", { platform: title })}</b>`];

  blocks.push(
    subscriptionUrl ? t("bot.guidesSubLink", { url: subscriptionUrl }) : t("bot.guidesNoSub"),
  );

  const keyboard: GuideButton[][] = [];

  for (const app of platform.apps) {
    const name = appName(app.id);
    // Hoisted: the i18n scanner only sees a t() call whose params carry no
    // nested call, so a nested t() here would read as an unused key.
    const steps = t("bot.guidesStepsManual", { app: name });
    blocks.push(t("bot.guidesAppBlock", { app: name, storeUrl: app.installUrl, steps }));
    keyboard.push([{ text: t("bot.guidesDownload", { app: name }), url: app.installUrl }]);
  }

  blocks.push(t("bot.guidesAllApps"));
  keyboard.push([{ text: t("bot.guidesOnSite"), url: installUrl }]);
  keyboard.push([{ text: t("bot.guidesBack"), callback_data: "menu:guides" }]);

  return { text: blocks.join("\n\n"), keyboard };
}
