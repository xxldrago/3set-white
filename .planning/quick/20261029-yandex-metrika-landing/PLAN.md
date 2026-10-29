# Quick task: Yandex Metrika counter on 3set.online

## Goal

Install the Yandex Metrika counter `113865085` on the public landing site
(`3set.online`, static HTML in `landing/`), so visits are measured with
Webvisor, clickmap, accurate bounce and ecommerce (`dataLayer`).

## Context

- `3set.online` is served as a static site out of `landing/` (`/var/www/3set.online`
  on the server, see `docs/DEPLOY.md` §5) — **not** the Next.js app, which is
  `dash.3set.online`.
- There are 14 standalone HTML documents (index, 9 platform pages, 3 blog posts,
  and no shared template) — the counter has to be added to each one.
- No CSP header is set in `nginx/` or on the live host, so `mc.yandex.ru` is not
  blocked.

## Tasks

- [x] Insert the counter snippet (script + `<noscript>` pixel) into every landing
      page, verbatim from the Metrika dashboard with one added guard:
      `window.dataLayer = window.dataLayer || []` so the configured
      `ecommerce: "dataLayer"` transport never hits a missing object.
- [x] Move the script into `<head>`; keep the `<noscript>` pixel right after
      `<body>` (a `<div>` inside `<head>` is invalid HTML).
- [x] Verify: exactly one `tag.js?id=113865085` and one `watch/113865085` per file.
- [x] Verify live-in-browser behaviour against a local static server:
      `tag.js` → 200, pageview hit `mc.yandex.com/watch/113865085` → 200
      (so `ssr:true` does not suppress the initial hit).
- [x] Deploy to `212.192.14.166:/var/www/3set.online` (backup first, `rsync -azR`
      **without `--delete`**) and re-verify on the live domain.

## Notes

- Placement of the script inside `<head>` keeps it off the render-critical path
  (the tag script is `async`), and it is early enough to see the whole session.
- `ssr: true` is Metrika's technical flag for server-generated insert code; per
  docs it does not disable tracking — confirmed by the local and live runs above.
- The dashboard app (`dash.3set.online`) is a separate surface and deliberately
  not instrumented in this task.
- Deploy caveat: `--delete` is destructive on this docroot (`privacy/`, `terms/`
  and `.bak-*` files exist only on the server). Use a targeted push until the repo
  and the live copy are reconciled.
