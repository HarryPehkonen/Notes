import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { checkAllowlist } from "../../server/auth/allowlist.js";

const exists = () => true;
const absent = () => false;
const mustNotLookUp = () => {
  throw new Error("userExists should not be called");
};

Deno.test("allowlist: unset or blank means open signup", async () => {
  for (const raw of [undefined, null, "", "   "]) {
    const r = await checkAllowlist("anyone@x.com", raw, mustNotLookUp);
    assertEquals(r, { allowed: true, reason: "open-signup" });
  }
});

Deno.test("allowlist: email on the list is allowed without a DB lookup", async () => {
  const r = await checkAllowlist("a@b.com", "a@b.com,c@d.com", mustNotLookUp);
  assertEquals(r, { allowed: true, reason: "on-allowlist" });
});

Deno.test("allowlist: off-list email with an existing user is grandfathered", async () => {
  const r = await checkAllowlist("old@x.com", "a@b.com", exists);
  assertEquals(r, { allowed: true, reason: "existing-user" });
});

Deno.test("allowlist: off-list email with no user is rejected", async () => {
  const r = await checkAllowlist("new@x.com", "a@b.com", absent);
  assertEquals(r, { allowed: false, reason: "not-on-allowlist" });
});

Deno.test("allowlist: matching is case-insensitive in both directions", async () => {
  assertEquals((await checkAllowlist("Foo@Bar.COM", "foo@bar.com", absent)).allowed, true);
  assertEquals((await checkAllowlist("foo@bar.com", "FOO@BAR.com", absent)).allowed, true);
});

Deno.test("allowlist: whitespace around entries is ignored", async () => {
  const raw = " a@b.com , c@d.com ";
  assertEquals((await checkAllowlist("a@b.com", raw, absent)).allowed, true);
  assertEquals((await checkAllowlist("c@d.com", raw, absent)).allowed, true);
  assertEquals((await checkAllowlist("e@f.com", raw, absent)).allowed, false);
});

Deno.test("allowlist: empty entries never match an empty email", async () => {
  const r = await checkAllowlist("", "a@b.com,,", absent);
  assertEquals(r.allowed, false);
});
