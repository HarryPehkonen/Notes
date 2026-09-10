/**
 * Toasts: identity, and the reactivity trap behind "they never disappear".
 *
 * Each toast carries an id so its own five-second timer removes that one and no
 * other. Two toasts created in the same millisecond shared an id (Date.now()),
 * so one removal swept away both.
 *
 * The reason a toast could linger at all is subtler and is guarded below: the
 * app renders `this.toasts` in its template, but the field was missing from
 * Lit's `static properties`, so writing to it - including removing a toast when
 * the timer fired - never triggered a re-render. The toast left the array and
 * stayed on screen until something unrelated happened to redraw the app.
 */
import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { makeToastId } from "../../public/utils/toast-queue.js";

Deno.test("makeToastId: a fresh id is distinct from every toast on screen", () => {
  const existing = [{ id: 1000 }, { id: 1001 }];
  assertEquals(makeToastId(existing, 1000), 1002);
});

Deno.test("makeToastId: two toasts in the same millisecond still differ", () => {
  const now = 1_789_000_000_000;
  const first = makeToastId([], now);
  const second = makeToastId([{ id: first }], now);
  assert(first !== second, "ids must not collide inside one millisecond");
});

Deno.test("makeToastId: no toasts yet, and a hostile list", () => {
  assertEquals(makeToastId([], 5000), 5000);
  assertEquals(makeToastId(null, 5000), 5000);
  assertEquals(makeToastId([{ id: "x" }, {}], 5000), 5000);
});

Deno.test("the app declares `toasts` reactive, or removals never repaint", async () => {
  const source = await Deno.readTextFile(
    new URL("../../public/components/notes-app.js", import.meta.url),
  );
  const properties = source.slice(
    source.indexOf("static properties = {"),
    source.indexOf("};", source.indexOf("static properties = {")),
  );
  assertMatch(
    properties,
    /toasts:/,
    "`toasts` is rendered by the template, so it must be in static properties",
  );
});
