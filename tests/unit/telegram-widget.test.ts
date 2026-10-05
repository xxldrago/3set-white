// 06-08 regression guard (T-06-08-01): the Telegram Login Widget parses
// `data-onauth` as a function BODY via `eval('(function(user){<value>})')`
// (telegram-widget.js?22 `__parseFunction`). The 06-05 value
// `window.telegram-login-<bot>-<rand>OnAuth(user)` parsed as subtraction and
// threw `ReferenceError: login is not defined`, so no callback ever fired.
//
// This suite evaluates the emitted attribute exactly as Telegram does: if the
// builder regresses to a hyphenated dot path, vector 2 fails and vector 3 stays
// green as the negative control. No DB, no network, node env.
import { afterEach, describe, expect, it } from "vitest";
import {
  sanitizeWidgetIdPart,
  widgetCallbackName,
  widgetOnAuthExpression,
} from "../../lib/telegram-widget";

type GlobalRecord = Record<string, unknown>;

function globalObject(): GlobalRecord {
  return globalThis as unknown as GlobalRecord;
}

afterEach(() => {
  const g = globalObject();
  for (const name of Object.keys(g)) {
    if (name.startsWith("tgAuth_")) delete g[name];
  }
  delete g.window;
});

describe("telegram-widget callback builder", () => {
  it("builds an identifier-only callback name from hyphen/dot inputs", () => {
    const name = widgetCallbackName("my-bot.name", "abc-123");
    expect(name).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
    expect(name).not.toContain("-");
    expect(name).not.toContain(".");
  });

  it("emits data-onauth that Telegram can eval and invoke (regression guard)", () => {
    const name = widgetCallbackName("my-bot.name", "abc-123");
    const received: unknown[] = [];
    globalObject()[name] = (user: unknown) => {
      received.push(user);
    };

    // Reproduce telegram-widget.js?22 __parseFunction byte-for-byte.
    // eslint-disable-next-line no-eval
    const fn = eval("(function(user){" + widgetOnAuthExpression(name) + "})") as (
      user: unknown,
    ) => void;
    fn({ id: 42 });

    expect(received).toEqual([{ id: 42 }]);
  });

  it("throws on the previous hyphenated window dot-path shape", () => {
    // Provide `window` so the failure is the hyphenated name itself, not a
    // missing global — i.e. exactly the error the verifier observed.
    globalObject().window = globalThis;
    // eslint-disable-next-line no-eval
    const fn = eval(
      "(function(user){window.telegram-login-my-bot-abcOnAuth(user)})",
    ) as (user: unknown) => void;

    expect(() => fn({ id: 42 })).toThrow(ReferenceError);
  });

  it("guarantees a valid identifier start for empty/leading-digit fragments", () => {
    expect(sanitizeWidgetIdPart("")).toMatch(/^[A-Za-z_]/);
    expect(sanitizeWidgetIdPart("9bot")).toMatch(/^[A-Za-z_]/);
    expect(widgetCallbackName("9bot", "9")).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
  });
});
