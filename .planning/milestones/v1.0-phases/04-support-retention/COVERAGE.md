# API Coverage — Phase 4 (Support & Retention)

No external API integration: the deterministic detector over the Phase 4 roadmap section returned `{"detected": false, "signals": []}` — this phase adds no new external API/SDK. It uses the already-integrated **Telegram Bot API** through the existing `telegraf` singleton (extension only: `getFileLink` → `fetch` for the largest `PhotoSize` of an incoming support photo, plus `sendMessage` inline-keyboard reminders already exercised in Phase 3). FRONTEND/DB-only surfaces (support thread, attachments on a local volume, notification queue, daily reminder tick) make up the rest of the phase.

The Telegram file-download surface (D-55) is an extension of an existing integration, not a new one, so no coverage matrix is required. If a future phase adds a genuinely new third-party API, a matrix must be produced then.
