// ADM-02 admin user-search + profile vectors.
//
// Search returns only the PII-minimal row shape ({userId, telegramId,
// displayName, staffRole?}) — never chatId/tokens/sub-links (T-05-05); exact
// telegram-id matches order first; results are capped at 50 with a truncation
// flag. Both admin BFF routes are role-gated (SessionError→401, AdminError→404,
// never 403) for the `users` section, which all three staff roles hold. The
// profile reads keys/payments/tickets and every sub-section degrades
// independently. Runs against the real local Postgres with a private id range.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

import AdminUsersPage from "../../app/admin/users/page";
import { GET as searchGET } from "../../app/api/admin/users/search/route";
import UserSearchResults from "../../components/admin/UserSearchResults";
import { ADMIN_SEARCH_LIMIT, adminSearchUsers, loadAdminProfile } from "../../lib/admin-service";
import { signSession } from "../../lib/auth";
import { t } from "../../lib/i18n";
import { prisma } from "../../lib/prisma";

const SECRET =
  process.env["SESSION_SECRET"] ?? "unit-test-session-secret-at-least-32-characters";

// User telegram ids (private range).
const EXACT = BigInt("930000101");
const KEY_USER = BigInt("930000102");
const PII_USER = BigInt("930000103");
const STRANGER = BigInt("930000104");
// Profile fixture.
const PROFILE_USER = BigInt("930000105");

// Bulk range for the truncation boundary.
const BULK_BASE = 930010000;
const BULK_COUNT = 51;

// Admin telegram ids (private range).
const ADMIN = 910000301;
const SUPPORT = 910000302;
const MANAGER = 910000303;
const ADMIN_IDS = [ADMIN, SUPPORT, MANAGER].map((id) => BigInt(id));

const KEY_TOKEN = "KEYTOKEN05";
const PII_TOKEN = "PIITOKEN05";
const BULK_TOKEN = "BULKTOKEN05";
const FIFTY_TOKEN = "FIFTYTOKEN05";

const PII_CHAT_ID = BigInt("555000111");
const PII_SUB_URL = "https://sub.secret/PIITOKEN05";

const ALL_USER_IDS: bigint[] = [
  EXACT,
  KEY_USER,
  PII_USER,
  STRANGER,
  PROFILE_USER,
  ...Array.from({ length: BULK_COUNT }, (_, i) => BigInt(BULK_BASE + i)),
];

let exactUserId: number;
let keyUserId: number;
let piiUserId: number;
let profileUserId: number;

async function cleanupUser(telegramId: bigint): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { telegramId },
    select: { id: true },
  });
  if (!user) return;
  await prisma.keyCache.deleteMany({ where: { userId: user.id } });
  await prisma.order.deleteMany({ where: { userId: user.id } });
  await prisma.ticket.deleteMany({ where: { userId: user.id } });
  await prisma.user.deleteMany({ where: { id: user.id } });
}

async function cleanup(): Promise<void> {
  for (const telegramId of ALL_USER_IDS) await cleanupUser(telegramId);
  await prisma.adminUser.deleteMany({ where: { telegramId: { in: ADMIN_IDS } } });
}

async function authorize(telegramId: number): Promise<void> {
  session.token = await signSession(telegramId, SECRET);
}

function search(q: string): Promise<Response> {
  return searchGET(
    new Request(`http://localhost/api/admin/users/search?q=${encodeURIComponent(q)}`),
  );
}

/** Invoke an async RSC page as Next would and capture its redirect/404 digest. */
async function callPage(
  page: () => Promise<unknown>,
): Promise<{ ok: true } | { digest: string }> {
  try {
    await page();
    return { ok: true };
  } catch (err) {
    const digest = (err as { digest?: unknown }).digest;
    return { digest: typeof digest === "string" ? digest : "unknown" };
  }
}

type AnyElement = { props?: Record<string, unknown> };

/** Walk a rendered React element tree (function components pre-invoked). */
function walkElements(node: unknown, visit: (element: AnyElement) => void): void {
  if (node === null || node === undefined || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walkElements(child, visit);
    return;
  }
  const element = node as AnyElement;
  if (!element.props) return;
  visit(element);
  walkElements(element.props.children, visit);
}

/** Collect every literal string in a rendered element tree. */
function collectStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectStrings(child, out);
    return out;
  }
  const element = node as AnyElement;
  if (element.props) collectStrings(element.props.children, out);
  return out;
}

beforeAll(async () => {
  await cleanup();

  const [exact, keyUser, pii, stranger, profile] = await Promise.all([
    prisma.user.create({ data: { telegramId: EXACT, firstName: "Exact" }, select: { id: true } }),
    prisma.user.create({
      data: { telegramId: KEY_USER, firstName: "Key", username: "keyuser" },
      select: { id: true },
    }),
    prisma.user.create({
      data: { telegramId: PII_USER, chatId: PII_CHAT_ID, firstName: "Pii" },
      select: { id: true },
    }),
    prisma.user.create({ data: { telegramId: STRANGER }, select: { id: true } }),
    prisma.user.create({
      data: { telegramId: PROFILE_USER, firstName: "Profile", lastName: "User" },
      select: { id: true },
    }),
  ]);
  exactUserId = exact.id;
  keyUserId = keyUser.id;
  piiUserId = pii.id;
  profileUserId = profile.id;

  await prisma.keyCache.createMany({
    data: [
      // Exact telegram-id string also appears in a key id (dedupe/exact-first).
      { userId: keyUserId, keyId: `key-${EXACT}-ref`, status: "active" },
      // Two rows match KEY_TOKEN by keyId, one by customerRef → dedupe to one user.
      {
        userId: keyUserId,
        keyId: `key-${KEY_TOKEN}-a`,
        status: "active",
        customerRef: `cust-${KEY_TOKEN}-ref`,
      },
      { userId: keyUserId, keyId: `key-${KEY_TOKEN}-b`, status: "active" },
      // PII fixture: a subscription URL + key reference must never leave search.
      {
        userId: piiUserId,
        keyId: `key-${PII_TOKEN}`,
        status: "active",
        subscriptionUrl: PII_SUB_URL,
      },
    ],
  });

  // Profile fixture: a key, an order, and a ticket for one user.
  await prisma.keyCache.create({
    data: { userId: profileUserId, keyId: "key-profile-1", name: "Профиль", status: "active" },
  });
  await prisma.order.create({
    data: {
      userId: profileUserId,
      kind: "new",
      days: 30,
      devices: 2,
      amount: 199,
      currency: "RUB",
      status: "provisioned",
    },
  });
  await prisma.ticket.create({
    data: { userId: profileUserId, subject: "Профиль обращение" },
  });

  // Bulk users for the truncation boundary: each has a BULK_TOKEN key; the
  // first 50 also have a FIFTY_TOKEN key (exactly-50 vs over-50).
  const bulkUsers = await Promise.all(
    Array.from({ length: BULK_COUNT }, (_, i) =>
      prisma.user.create({
        data: { telegramId: BigInt(BULK_BASE + i), firstName: `Bulk${i}` },
        select: { id: true },
      }),
    ),
  );
  const bulkKeys = bulkUsers.map((user, i) => ({
    userId: user.id,
    keyId: `key-${BULK_TOKEN}-${i}`,
    status: "active",
  }));
  const fiftyKeys = bulkUsers.slice(0, 50).map((user, i) => ({
    userId: user.id,
    keyId: `key-${FIFTY_TOKEN}-${i}`,
    status: "active",
  }));
  await prisma.keyCache.createMany({ data: [...bulkKeys, ...fiftyKeys] });

  await prisma.adminUser.createMany({
    data: [
      { telegramId: BigInt(ADMIN), role: "administrator" },
      { telegramId: BigInt(SUPPORT), role: "support" },
      { telegramId: BigInt(MANAGER), role: "manager" },
    ],
  });
});

afterAll(async () => {
  await cleanup();
});

beforeEach(() => {
  session.token = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("adminSearchUsers — matching, ordering, dedupe", () => {
  it("orders an exact telegram-id match first", async () => {
    const { rows, count } = await adminSearchUsers(String(EXACT));

    expect(rows[0]?.userId).toBe(exactUserId);
    expect(rows[0]?.telegramId).toBe(String(EXACT));
    expect(rows.some((row) => row.userId === keyUserId)).toBe(true);
    expect(count).toBe(2);
  });

  it("matches key/customerRef contains and dedupes by user", async () => {
    const { rows } = await adminSearchUsers(KEY_TOKEN);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(keyUserId);

    const byCustomerRef = await adminSearchUsers(`cust-${KEY_TOKEN}`);
    expect(byCustomerRef.rows.map((row) => row.userId)).toEqual([keyUserId]);
  });

  it("returns an empty result for a blank query", async () => {
    await expect(adminSearchUsers("   ")).resolves.toEqual({
      rows: [],
      count: 0,
      truncated: false,
    });
  });
});

describe("adminSearchUsers — truncation boundary", () => {
  it(`caps at ${ADMIN_SEARCH_LIMIT} rows and flags truncation above it`, async () => {
    const result = await adminSearchUsers(BULK_TOKEN);

    expect(result.count).toBe(BULK_COUNT);
    expect(result.rows).toHaveLength(ADMIN_SEARCH_LIMIT);
    expect(result.truncated).toBe(true);
  });
});

describe("adminSearchUsers — PII minimum (T-05-05)", () => {
  it("exposes only the four allowed fields and no chat id / token / sub-link", async () => {
    const { rows } = await adminSearchUsers(PII_TOKEN);
    const row = rows.find((candidate) => candidate.userId === piiUserId);
    expect(row).toBeDefined();

    const allowed = new Set(["userId", "telegramId", "displayName", "staffRole"]);
    for (const candidate of rows) {
      for (const key of Object.keys(candidate)) expect(allowed.has(key)).toBe(true);
    }

    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain(String(PII_CHAT_ID));
    expect(serialized).not.toContain(PII_SUB_URL);
    expect(serialized).not.toContain("chatId");
    expect(serialized).not.toContain("subscriptionUrl");
    expect(serialized).not.toContain("sub.secret");
  });
});

describe("GET /api/admin/users/search — role gate (T-05-06)", () => {
  it("returns 401 for a signed-out caller", async () => {
    const res = await search("irrelevant");
    expect(res.status).toBe(401);
  });

  it("returns 404 for a signed-in caller with no admin role", async () => {
    await authorize(Number(STRANGER));
    const res = await search("irrelevant");
    expect(res.status).toBe(404);
  });

  it("returns 200 for administrator, support, and manager", async () => {
    for (const id of [ADMIN, SUPPORT, MANAGER]) {
      await authorize(id);
      const res = await search(String(EXACT));
      expect(res.status).toBe(200);
    }
  });
});

describe("loadAdminProfile — independent sections", () => {
  it("loads keys, payments, and tickets", async () => {
    const profileData = await loadAdminProfile(profileUserId);
    expect(profileData).not.toBeNull();
    expect(profileData?.header.telegramId).toBe(String(PROFILE_USER));
    expect(profileData?.keys.ok).toBe(true);
    expect(profileData?.payments.ok).toBe(true);
    expect(profileData?.tickets.ok).toBe(true);
    if (profileData?.keys.ok) expect(profileData.keys.rows).toHaveLength(1);
    if (profileData?.payments.ok) expect(profileData.payments.rows).toHaveLength(1);
    if (profileData?.tickets.ok) expect(profileData.tickets.rows).toHaveLength(1);
  });

  it("degrades only the Keys section when the keys read fails", async () => {
    const spy = vi
      .spyOn(prisma.keyCache, "findMany")
      .mockRejectedValueOnce(new Error("artemida_keys_unavailable"));

    const profileData = await loadAdminProfile(profileUserId);
    spy.mockRestore();

    expect(profileData?.keys.ok).toBe(false);
    expect(profileData?.payments.ok).toBe(true);
    expect(profileData?.tickets.ok).toBe(true);
  });
});

describe("admin users pages — guard re-check", () => {
  it("redirects a signed-out visitor to /login", async () => {
    const result = await callPage(() => AdminUsersPage());
    expect("digest" in result && result.digest).toContain("NEXT_REDIRECT");
    expect("digest" in result && result.digest).toContain("/login");
  });

  it("returns 404 for a signed-in caller with no admin role", async () => {
    await authorize(Number(STRANGER));
    const result = await callPage(() => AdminUsersPage());
    expect(result).toEqual({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });
});

describe("adminSearchUsers — edge states (no results, exact-50 boundary)", () => {
  it("returns an empty, untruncated result when nothing matches", async () => {
    const result = await adminSearchUsers("NOSUCHTOKEN05");
    expect(result).toEqual({ rows: [], count: 0, truncated: false });
  });

  it("does NOT flag truncation at exactly the 50-row boundary", async () => {
    const result = await adminSearchUsers(FIFTY_TOKEN);
    expect(result.count).toBe(ADMIN_SEARCH_LIMIT);
    expect(result.rows).toHaveLength(ADMIN_SEARCH_LIMIT);
    expect(result.truncated).toBe(false);
  });
});

describe("UserSearchResults — rendering contract (structural)", () => {
  it("renders the truncation notice only when truncated", () => {
    const row = { userId: 1, telegramId: "1", displayName: "A" };

    const truncatedTree = UserSearchResults({ rows: [row], count: 1, truncated: true });
    expect(collectStrings(truncatedTree)).toContain(t("admin.searchMore"));

    const plainTree = UserSearchResults({ rows: [row], count: 1, truncated: false });
    expect(collectStrings(plainTree)).not.toContain(t("admin.searchMore"));
  });

  it("truncates a long display name with a title and renders the id tabular-nums", () => {
    const longName = "О".repeat(120);
    const tree = UserSearchResults({
      rows: [{ userId: 7, telegramId: "930000101", displayName: longName }],
      count: 1,
      truncated: false,
    });

    const elements: AnyElement[] = [];
    walkElements(tree, (element) => elements.push(element));

    const named = elements.find((element) => element.props?.title === longName);
    expect(named).toBeDefined();
    expect(String(named?.props?.className)).toContain("truncate");

    const idLine = elements.find((element) =>
      String(element.props?.className).includes("tabular-nums"),
    );
    expect(idLine).toBeDefined();
    expect(collectStrings(idLine)).toContain(
      t("admin.profileTelegramId", { id: "930000101" }),
    );
  });

  it("wraps the ≥2 count header through the plural helper", () => {
    const rows = [
      { userId: 1, telegramId: "1", displayName: "A" },
      { userId: 2, telegramId: "2", displayName: "B" },
    ];
    const tree = UserSearchResults({ rows, count: 2, truncated: false });
    expect(collectStrings(tree)).toContain(t("admin.searchCountFew", { n: 2 }));
  });
});

describe("UserSearchForm — client-island source contract (structural)", () => {
  const SOURCE = readFileSync(
    new URL("../../components/admin/UserSearchForm.tsx", import.meta.url),
    "utf8",
  );

  it("retains the query text (never clears the field on a state change)", () => {
    expect(SOURCE).toContain("value={query}");
    expect(SOURCE).not.toContain("setQuery('')");
    expect(SOURCE).not.toContain('setQuery("")');
  });

  it("disables submit while the trimmed value is blank or in flight", () => {
    expect(SOURCE).toContain("disabled={trimmed.length === 0 || inFlight}");
  });

  it("aborts a stale request and cleans up on unmount", () => {
    expect(SOURCE).toContain("abortRef.current?.abort()");
    expect(SOURCE).toContain("controller.signal.aborted");
    expect(SOURCE).toMatch(/useEffect\(\(\) => \(\) => abortRef\.current\?\.abort\(\)/);
  });
});

describe("admin users — support/manager role coverage", () => {
  it("renders /admin/users for support and manager (users section)", async () => {
    await authorize(SUPPORT);
    await expect(callPage(() => AdminUsersPage())).resolves.toEqual({ ok: true });

    await authorize(MANAGER);
    await expect(callPage(() => AdminUsersPage())).resolves.toEqual({ ok: true });
  });

  it("never leaks PII through the search route payload", async () => {
    await authorize(ADMIN);
    const res = await search(PII_TOKEN);
    expect(res.status).toBe(200);

    const serialized = JSON.stringify(await res.json());
    expect(serialized).not.toContain(String(PII_CHAT_ID));
    expect(serialized).not.toContain(PII_SUB_URL);
    expect(serialized).not.toContain("chatId");
    expect(serialized).not.toContain("subscriptionUrl");
  });
});
