---
status: complete
quick_id: 261029-gni
slug: yandex-metrika-landing
date: 2026-10-29
commit: 866c093
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

## Repo files (14)

`landing/index.html`, `landing/{android,ios,mac,windows,router,setup,smart-tv,shadowsocks,vless-reality,wireguard}/index.html`,
`landing/blog/{free-vs-paid,kak-vybrat-vpn,vpn-otklyuchaetsya}/index.html`.

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

### ⚠️ Repo and live site have diverged (content, not just the counter)

Server files were last modified 2026-10-22; the repo's landing content is from
2026-10-19. Per page 26–54 lines differ beyond the counter: meta description,
FAQ JSON-LD, the Telegram handle (`@threeSet_bot` on the server vs
`@3set_online_bot` in the repo), the hero badge («РАБОТАЕТ В РОССИИ» vs
«РАБОТАЕТ В РОССИИ · ОБХОД DPI») and a few `.f-bot` CSS rules.

Consequence: uploading `landing/` wholesale would rewrite the live copy with the
repo variant. Not done as part of this task — needs an owner decision on which
side is canonical. The live docroot remains byte-identical to its 2026-10-22
state except for the inserted counter block.

## Not done

- `dash.3set.online` (Next.js app) intentionally left uninstrumented.
- `privacy/` / `terms/` not added to the repo.
- Repo↔live content reconciliation.

## Verification table

| Check | Result |
|-------|--------|
| One `tag.js?id=113865085` per repo page | 14/14 |
| One `watch/113865085` noscript pixel per repo page | 14/14 |
| Live pages carrying the counter | 16/16 (incl. server-only `privacy`, `terms`) |
| Script before `</head>` on live pages | 16/16 |
| `tag.js` in a real browser on `https://3set.online/` | 200 |
| Pageview hit `mc.yandex.com/watch/113865085` | 200 |
| Console errors | none |

Note: `ssr: true` keeps the hit — verified on local and on live, not assumed.
