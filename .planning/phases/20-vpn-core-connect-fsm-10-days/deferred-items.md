# Deferred Items — Phase 20

## Out-of-scope discoveries (do NOT auto-fix in 20-01)

- **Global `npx tsc --noEmit` is red on unrelated, actively-edited files from parallel work**: `lib/bot.ts` (`TS2554` Expected 3 arguments but got 2; `I18nKey` errors), `lib/bot-guides.ts` (`TS2345` `"bot.guidesSubLink"` / `"bot.backToMenu"` not in `I18nKey`), alongside modified `lib/i18n/messages/ru.ts`. Line numbers shifted between two consecutive runs, confirming concurrent edits. These files are NOT imported by the 20-01 route/builder/test slice.
  - **Scope decision:** pre-existing failures in unrelated files; per deviation-rule scope boundary, they are not fixed here. Recorded for the owning workstream.
  - **Proof the 20-01 slice is clean:** scoped `tsc --noEmit` over `app/api/mobile/config/route.ts`, `lib/mobile-config.ts`, `tests/unit/mobile-config-route.test.ts` exits 0; `npx vitest run tests/unit/mobile-config-route.test.ts tests/unit/mobile-servers-route.test.ts` → 2 files / 23 tests passed.
  - **Follow-up:** re-run the full `npx tsc --noEmit` once the parallel bot/i18n work is committed before phase verification.
