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

- [x] Insert the counter snippet (script + `<noscript>` pixel) before `</body>` of
      every `landing/**/index.html` (14 files), verbatim from the Metrika dashboard
      with one added guard: `window.dataLayer = window.dataLayer || []` so the
      configured `ecommerce: "dataLayer"` transport never hits a missing object.
- [x] Verify: exactly one `tag.js?id=113865085` and one `watch/113865085` per file.
- [x] Verify live-in-browser behaviour against a local static server:
      `tag.js` → 200, pageview hit `mc.yandex.com/watch/113865085` → 200
      (so `ssr:true` does not suppress the initial hit).
- [ ] Deploy: `rsync -az --delete landing/ root@<host>:/var/www/3set.online/`.

## Notes

- Placement at the very end of `<body>` keeps the counter off the render-critical
  path (the async tag script cannot block paint).
- `ssr: true` is Metrika's technical flag for server-generated insert code; per
  docs it does not disable tracking — confirmed by the local run above.
- The dashboard app (`dash.3set.online`) is a separate surface and deliberately
  not instrumented in this task.
