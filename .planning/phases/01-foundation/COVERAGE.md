# API Coverage — Telegram (Bot API + Login Widget)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

Phase 1 integrates the Telegram Bot API (updates, messaging) and the Login
Widget / WebApp data contracts. ARTEMIDA and Platega are out of scope until
Phases 2-3.

| capability | decision | reason |
|---|---|---|
| getUpdates intake via webhook (handleUpdate) | INTEGRATE | /start skeleton plus chat_id capture |
| sendMessage reply on /start | INTEGRATE | skeleton greeting plus menu buttons |
| webhook secret_token verification | INTEGRATE | spoof-resistant intake |
| getMe for token sanity | INTEGRATE | boot-time token check |
| Login Widget data-onauth HMAC verify | INTEGRATE | CAB-02 web entry |
| WebApp initData HMAC verify | INTEGRATE | CAB-02 bot-to-web entry |
| Telegram OIDC login flow | OPT-OUT | deferred migration per OQ-1; classic HMAC stays documented |
| message editing / deletion | OPT-OUT | not needed yet — support replies arrive Phase 4 |
| inline keyboards beyond skeleton menu | OPT-OUT | not needed yet — purchase keyboards arrive Phase 2-3 |
| media / photo upload handling | OPT-OUT | not needed yet — ticket attachments arrive Phase 4 |
| Telegram Payments / invoices | OPT-OUT | explicitly out of scope — Platega handles money in Phase 3 |
| admin / group management APIs | OPT-OUT | not needed — no groups in v1 |
| broadcast / forward fan-out | OPT-OUT | not needed yet — broadcast arrives Phase 5 |
