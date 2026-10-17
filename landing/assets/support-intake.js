/* Support intake — public landing form (POST /api/support/intake).
 *
 * Self-injecting: builds its own FAB + panel, so each landing page needs only
 * `<link href="/assets/support-intake.css">` and a deferred <script> tag — no
 * per-page markup to drift.
 *
 * Mirrors the server contract exactly (app/api/support/intake/route.ts):
 *   step 1 → pick the reply channel, step 2 → supply that contact,
 *   step 3 → describe the problem, step 4 → done.
 * Client validation is a convenience only; the server re-validates everything
 * and is the sole authority. All visitor input is written with textContent —
 * never innerHTML — so a crafted "message" can never inject markup.
 */
(function () {
  'use strict';

  if (window.__siInit) return;
  window.__siInit = true;

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ENDPOINT = '/api/support/intake';

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
  var TG_RE = /^@?[A-Za-z0-9_]{5,32}$/;

  var COPY = {
    fab: 'Написать оператору',
    online: 'живой оператор · ответим в выбранный вами канал',
    email: { label: 'Email', sub: 'пришлём ответ на почту' },
    telegram: { label: 'Telegram', sub: 'ответим в Telegram' },
    q1: 'Куда вам ответить?',
    h1: 'Выберите канал — напишем только туда. Оба варианта бесплатны.',
    q2: 'Куда писать?',
    contactBad: 'Проверьте адрес и попробуйте ещё раз.',
    msgQ: 'Опишите проблему',
    msgH: 'Чем подробнее опишете — тем быстрее разберёмся.',
    name: 'Как к вам обращаться (необязательно)',
    message: 'Что случилось',
    phEmail: 'you@example.com',
    phTg: '@your_username',
    back: 'Назад',
    send: 'Отправить',
    sending: 'Отправляем…',
    doneQ: 'Обращение принято',
    doneH: 'Мы передали его оператору и ответим вам',
    again: 'Написать ещё одно',
    rate: 'Слишком много обращений подряд. Попробуйте через 15 минут или напишите в Telegram-бота.',
    fail: 'Не получилось отправить. Проверьте соединение и попробуйте ещё раз.',
    generic: 'Проверьте заполнение и попробуйте снова.'
  };

  /* ---------- markup ---------- */
  function h(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  var ICON_MAIL =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg>';
  var ICON_TG =
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 4.3 18.9 20c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 12.9 1.4 11.4c-1-.3-1-1 .2-1.5l19.1-7.4c.9-.3 1.6.2 1.2 1.8Z"/></svg>';
  var ICON_PEN =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

  var fab = h(
    '<button class="si-fab" type="button" aria-label="' + COPY.fab + '">' +
      ICON_PEN + '<span>' + COPY.fab + '</span></button>'
  );

  var panel = h(
    '<div class="si-panel" role="dialog" aria-modal="false" aria-label="Обращение в поддержку">' +
      '<div class="si-hd"><span class="si-av">А</span><div>' + COPY.fab +
      '<small>' + COPY.online + '</small></div>' +
      '<button class="si-close" type="button" aria-label="Закрыть">✕</button></div>' +
      '<div class="si-body">' +
        // step 1 — channel
        '<div class="si-step is-on" data-step="1">' +
          '<p class="si-q">' + COPY.q1 + '</p><p class="si-hint">' + COPY.h1 + '</p>' +
          '<div class="si-choice">' +
            '<button type="button" data-channel="email"><span class="si-ic">' + ICON_MAIL + '</span><span>' +
              COPY.email.label + '<span class="si-sub">' + COPY.email.sub + '</span></span></button>' +
            '<button type="button" data-channel="telegram"><span class="si-ic">' + ICON_TG + '</span><span>' +
              COPY.telegram.label + '<span class="si-sub">' + COPY.telegram.sub + '</span></span></button>' +
          '</div>' +
        '</div>' +
        // step 2 — contact
        '<div class="si-step" data-step="2">' +
          '<p class="si-q">' + COPY.q2 + '</p>' +
          '<p class="si-hint" data-hint></p>' +
          '<label class="si-label" data-contact-label></label>' +
          '<input class="si-input" type="text" autocomplete="off" spellcheck="false" data-contact>' +
          '<div class="si-err" data-err2></div>' +
          '<div class="si-actions"><button class="si-btn si-btn-ghost" type="button" data-back>← ' + COPY.back + '</button>' +
          '<button class="si-btn si-btn-primary" type="button" data-next>' + COPY.send + '</button></div>' +
        '</div>' +
        // step 3 — message
        '<div class="si-step" data-step="3">' +
          '<p class="si-q">' + COPY.msgQ + '</p><p class="si-hint">' + COPY.msgH + '</p>' +
          '<label class="si-label">' + COPY.message + '</label>' +
          '<textarea class="si-textarea" data-message maxlength="4000"></textarea>' +
          '<label class="si-label" style="margin-top:12px">' + COPY.name + '</label>' +
          '<input class="si-input" type="text" autocomplete="name" maxlength="64" data-name>' +
          '<div class="si-trap"><label>Website<input type="text" tabindex="-1" autocomplete="off" data-trap></label></div>' +
          '<div class="si-err" data-err3></div>' +
          '<div class="si-actions"><button class="si-btn si-btn-ghost" type="button" data-back>← ' + COPY.back + '</button>' +
          '<button class="si-btn si-btn-primary" type="button" data-submit>' + COPY.send + '</button></div>' +
        '</div>' +
        // step 4 — done
        '<div class="si-step" data-step="4"><div class="si-done">' +
          '<div class="si-check">✓</div>' +
          '<p class="si-q">' + COPY.doneQ + '</p>' +
          '<p>' + COPY.doneH + ':</p><div class="si-where" data-where></div>' +
          '<div class="si-actions"><button class="si-btn si-btn-primary" type="button" data-again>' + COPY.again + '</button></div>' +
        '</div></div>' +
      '</div>' +
    '</div>'
  );

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  /* ---------- element refs ---------- */
  var steps = panel.querySelectorAll('.si-step');
  var q = function (sel) { return panel.querySelector(sel); };
  var elContact = q('[data-contact]');
  var elContactLabel = q('[data-contact-label]');
  var elHint = q('[data-hint]');
  var elErr2 = q('[data-err2]');
  var elErr3 = q('[data-err3]');
  var elMsg = q('[data-message]');
  var elName = q('[data-name]');
  var elTrap = q('[data-trap]');
  var elWhere = q('[data-where]');
  var btnSubmit = q('[data-submit]');

  var state = { channel: '', contact: '' };

  /* ---------- helpers ---------- */
  function show(n) {
    for (var i = 0; i < steps.length; i++) {
      steps[i].classList.toggle('is-on', steps[i].getAttribute('data-step') === String(n));
    }
    if (n === 2) setTimeout(function () { elContact.focus(); }, REDUCED ? 0 : 120);
    if (n === 3) setTimeout(function () { elMsg.focus(); }, REDUCED ? 0 : 120);
  }

  function setErr(el, msg) {
    el.textContent = msg || '';
    el.classList.toggle('is-on', !!msg);
  }

  /** Mirror of the server's per-channel rules so the visitor fails fast. */
  function validateContact(channel, value) {
    var v = (value || '').trim();
    if (!v) return 'empty';
    if (channel === 'email') return EMAIL_RE.test(v) ? null : 'bad';
    return TG_RE.test(v) ? null : 'bad';
  }

  function openPanel() {
    // The page already has its own chat widget at the same corner — never let
    // the two panels stack on top of each other.
    var chat = document.getElementById('chatPanel');
    if (chat) chat.classList.remove('open');
    panel.classList.add('is-open');
    fab.setAttribute('aria-expanded', 'true');
  }

  function closePanel() {
    panel.classList.remove('is-open');
    fab.setAttribute('aria-expanded', 'false');
  }

  /* ---------- wiring ---------- */
  fab.addEventListener('click', function () {
    panel.classList.contains('is-open') ? closePanel() : openPanel();
  });
  q('.si-close').addEventListener('click', closePanel);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.classList.contains('is-open')) closePanel();
  });
  // Opening the native chat must close this panel (same corner).
  var chatBtn = document.getElementById('chatBtn');
  if (chatBtn) chatBtn.addEventListener('click', closePanel);

  // step 1 → 2
  panel.querySelectorAll('[data-channel]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.channel = btn.getAttribute('data-channel');
      var isMail = state.channel === 'email';
      elContactLabel.textContent = isMail ? COPY.email.label : COPY.telegram.label;
      elContact.setAttribute('type', isMail ? 'email' : 'text');
      elContact.setAttribute(
        'placeholder',
        isMail ? COPY.phEmail : COPY.phTg
      );
      elContact.setAttribute(
        'inputmode',
        isMail ? 'email' : 'text'
      );
      elHint.textContent = isMail
        ? COPY.email.sub
        : COPY.telegram.sub;
      elContact.value = '';
      setErr(elErr2, '');
      show(2);
    });
  });

  // step 2 → 3 (validate contact first)
  function submitContact() {
    var problem = validateContact(state.channel, elContact.value);
    if (problem === 'empty') { setErr(elErr2, COPY.contactBad); elContact.focus(); return; }
    if (problem) { setErr(elErr2, COPY.contactBad); elContact.focus(); return; }
    setErr(elErr2, '');
    state.contact = elContact.value.trim();
    setErr(elErr3, '');
    show(3);
  }
  q('[data-next]').addEventListener('click', submitContact);
  elContact.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submitContact(); } });

  panel.querySelectorAll('[data-back]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var step = btn.closest('.si-step');
      var n = parseInt(step.getAttribute('data-step'), 10);
      setErr(n === 2 ? elErr2 : elErr3, '');
      show(n - 1);
    });
  });

  // step 3 → submit
  function submitForm() {
    var msg = elMsg.value.trim();
    if (!msg) { setErr(elErr3, COPY.generic); elMsg.focus(); return; }

    btnSubmit.disabled = true;
    var label = btnSubmit.textContent;
    btnSubmit.textContent = COPY.sending;
    setErr(elErr3, '');

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: state.channel,
        contact: state.contact,
        name: elName.value.trim(),
        message: msg,
        website: elTrap.value
      })
    })
      .then(function (res) {
        if (res.status === 429) return res.json().then(function () { throw new Error('rate'); });
        if (!res.ok) throw new Error('generic');
        elWhere.textContent = state.contact;
        elMsg.value = '';
        elName.value = '';
        show(4);
      })
      .catch(function (err) {
        setErr(elErr3, err && err.message === 'rate' ? COPY.rate : COPY.fail);
      })
      .then(function () {
        btnSubmit.disabled = false;
        btnSubmit.textContent = label;
      });
  }
  btnSubmit.addEventListener('click', submitForm);
  elMsg.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitForm(); }
  });

  // step 4 → reset
  q('[data-again]').addEventListener('click', function () {
    state = { channel: '', contact: '' };
    elContact.value = '';
    setErr(elErr2, '');
    setErr(elErr3, '');
    show(1);
  });
})();