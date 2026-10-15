// Cloudflare Worker: Telegram Bot API forwarder.
//
// WHY: some hosts (e.g. AS207713) block egress to api.telegram.org while
// Cloudflare is reachable. This worker relays Bot API calls so the cabinet
// bot keeps working without code changes beyond TELEGRAM_API_ROOT.
//
// Deploy (needs a Cloudflare account, free tier is enough):
//   npm i -g wrangler && wrangler login
//   wrangler init --no-interaction telegram-forwarder   # or paste this file
//   wrangler deploy
// Then set TELEGRAM_API_ROOT=https://<name>.<account>.workers.dev
// in the server .env and restart web.
//
// SECURITY: only paths starting with `/bot` are relayed, and only to
// api.telegram.org — the worker cannot be abused as an open proxy. The bot
// token in the path IS the credential (same as talking to Telegram
// directly); whoever holds it can already call the API. No secrets are
// stored in the worker.
//
// NOTE: file uploads (sendPhoto etc.) stream through `request.body` untouched.
export default {
  async fetch(req) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/bot")) {
      return new Response("Not found", { status: 404 });
    }
    const target = `https://api.telegram.org${url.pathname}${url.search}`;
    const headers = new Headers(req.headers);
    headers.delete("cf-connecting-ip");
    headers.set("host", "api.telegram.org");
    return fetch(target, {
      method: req.method,
      headers,
      body: req.body,
      redirect: "manual",
    });
  },
};
