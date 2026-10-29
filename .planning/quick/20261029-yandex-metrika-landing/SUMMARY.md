---
status: complete
quick_id: 261029-gni
slug: yandex-metrika-landing
date: 2026-10-29
commit: c77c820
---

# Summary: Yandex Metrika counter on 3set.online

Counter `113865085` is installed on all 14 landing documents.

## Changed files

| File | Change |
|------|--------|
| `landing/index.html` | + counter snippet before `</body>` |
| `landing/{android,ios,mac,windows,router,setup,smart-tv,shadowsocks,vless-reality,wireguard}/index.html` | same |
| `landing/blog/{free-vs-paid,kak-vybrat-vpn,vpn-otklyuchaetsya}/index.html` | same |

Snippet = Metrika dashboard code (Webvisor, clickmap, `accurateTrackBounce`,
`trackLinks`, `ecommerce: "dataLayer"`, explicit `referrer`/`url`) plus
`window.dataLayer = window.dataLayer || []` as the first line, so the ecommerce
transport is guaranteed to exist.

## Verification

| Check | Result |
|-------|--------|
| One `tag.js?id=113865085` per file | 14/14 |
| One `watch/113865085` noscript pixel per file | 14/14 |
| `tag.js` request in browser (local static server) | 200 |
| Pageview hit `mc.yandex.com/watch/113865085` | 200, correct `page-url` and title |
| Console errors | none |

Note: `ssr: true` keeps the hit — verified, not assumed.

## Not done

- Deploy to the host: `rsync -az --delete landing/ root@<host>:/var/www/3set.online/`
  (per `docs/DEPLOY.md` §5). Repo change only.
- `dash.3set.online` (Next.js app) intentionally left uninstrumented.
