// CAB-02 initData verifier vectors (T-03-02): WebAppData-path cases under
// a synthetic throwaway token only — no real token ever appears here.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyInitData } from "../../lib/auth";

const TOKEN = "900002:UNIT-VECTOR-THROWAWAY-NOT-A-REAL-TOKEN";

function signInitData(params: URLSearchParams): string {
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  return createHmac("sha256", secret).update(dataCheckString).digest("hex");
}

function genuineInitData(authDate = Math.floor(Date.now() / 1000)): string {
  const params = new URLSearchParams({
    query_id: "AAHdF6IQAAAAAN0XohDhrHF7",
    user: JSON.stringify({ id: 300000003, first_name: "Vector", username: "vector_test" }),
    auth_date: String(authDate),
  });
  params.set("hash", signInitData(params));
  return params.toString();
}

describe("auth-initdata", () => {
  it("accepts good initData", () => {
    const out = verifyInitData(genuineInitData(), TOKEN);
    expect(out).not.toBeNull();
    expect(JSON.parse(out?.["user"] ?? "null")).toMatchObject({ id: 300000003 });
  });

  it("rejects a tampered initData pair", () => {
    const tampered = new URLSearchParams(genuineInitData());
    tampered.set(
      "user",
      JSON.stringify({ id: 999999999, first_name: "Mallory", username: "mallory" }),
    );
    expect(verifyInitData(tampered.toString(), TOKEN)).toBeNull();
  });

  it("rejects a missing hash", () => {
    const params = new URLSearchParams(genuineInitData());
    params.delete("hash");
    expect(verifyInitData(params.toString(), TOKEN)).toBeNull();
  });

  it("rejects a stale auth_date", () => {
    const stale = genuineInitData(Math.floor(Date.now() / 1000) - 90_000);
    expect(verifyInitData(stale, TOKEN)).toBeNull();
  });
});
