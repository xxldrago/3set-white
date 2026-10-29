---
status: complete
quick_id: 261029-gni
slug: yandex-metrika-landing
date: 2026-10-29
commit: 866c093
sync_commit: e113217
deployed: 2026-10-29
---

# Summary: Yandex Metrika counter on 3set.online

Counter `113865085` is installed and **live** on every page of `3set.online`.

## Placement

Per the follow-up request the script sits **in `<head>`** (before `</head>`) so the
counter starts as early as possible; the `<noscript>` pixel sits immediately after
the `<body>` opening tag, because a `<div>` inside `<head>` is invalid HTML (the
parser would reparent it anyway, with no upside).

Snippet = Metrika dashboard code (Webvisor, clickmap, `accurateTrackBounce`,
`trackLinks`, `ecommerce: "dataLayer"`, explicit `referrer`/`url`) plus
`window.dataLayer = window.dataLayer || []` as the first line so the ecommerce
transport is guaranteed to exist.

## Repo files (16)

`landing/index.html`, `landing/{android,ios,mac,windows,router,setup,smart-tv,shadowsocks,vless-reality,wireguard}/index.html`,
`landing/blog/{free-vs-paid,kak-vybrat-vpn,vpn-otklyuchaetsya}/index.html`,
plus `landing/privacy/index.html` and `landing/terms/index.html` (adopted into the
repo together with the rest of the canonical server copy).

Commits: `c77c820` (add, end of body) → `866c093` (move to head).

## Deploy (2026-10-29)

Host: `3set.online` → `212.192.14.166`, docroot `/var/www/3set.online` (static nginx).

- Backup first: `/root/3set-landing-20261029-0508.tar.gz` (2.3 MB, whole docroot).
- Pushed with **`rsync -azR` without `--delete`**, 16 pages.
- Verified live: all 16 URLs return the counter, script line < `</head>` line;
  in a real browser `tag.js` → 200 and the pageview hit
  `mc.yandex.com/watch/113865085` → 200, zero console messages.

### ⚠️ `--delete` must NOT be used on this docroot

`docs/DEPLOY.md` §5 recommends `rsync --delete`, and a dry run showed it would
destroy live-only content:

- `/privacy/` and `/terms/` — legal pages that exist **only on the server**, not in `landing/`;
- every `index.html.bak-20261022-*` backup;
- the `._*` AppleDouble files.

So the deploy was a targeted file push. `privacy/index.html` and `terms/index.html`
were patched **in place on the server only** — they still need to be brought into
the repo, otherwise the next `--delete` deploy removes them again.

### ⚠️ Repo and live site had diverged (resolved 2026-10-29)

Server files were last modified 2026-10-22; the repo's landing content was from
2026-10-19. Per page 26–54 lines differed beyond the counter: meta description,
FAQ JSON-LD, the Telegram handle (`@threeSet_bot` on the server vs
`@3set_online_bot` in the repo), the hero badge («РАБОТАЕТ В РОССИИ» vs
«РАБОТАЕТ В РОССИИ · ОБХОД DPI») and a few `.f-bot` CSS rules.

**Resolution:** the owner declared the live server copy canonical. `landing/` was
re-synced **from** the host (`e113217`), so repo ↔ live diff is now empty across
all 16 pages and assets. `privacy/` and `terms/` — previously server-only — are
now in the repo as well, which makes a plain `rsync --delete` safe again.

The live host vhost was also missing from the repo; it is now recorded verbatim
as `nginx/3set-landing.conf`, and the stale `nginx/3set.online.conf` (a redirect
to dash, never mounted by Compose) is marked legacy.

## Not done

- `dash.3set.online` (Next.js app) intentionally left uninstrumented.
- Server-side `index.html.bak-20261022-*` and `._*` leftovers not removed (a
  future `rsync --delete` clears them; they are not content).

## Verification table

| Check | Result |
|-------|--------|
| One `tag.js?id=113865085` per repo page | 14/14 |
| One `watch/113865085` noscript pixel per repo page | 14/14 |
| Live pages carrying the counter | 16/16 (incl. `privacy`, `terms`) |
| Script before `</head>` on live pages | 16/16 |
| Repo ↔ live diff after canonical sync | empty (`diff -rq` clean) |
| `tag.js` in a real browser on `https://3set.online/` | 200 |
| Pageview hit `mc.yandex.com/watch/113865085` | 200 |
| Console errors | none |

Note: `ssr: true` keeps the hit — verified on local and on live, not assumed.
