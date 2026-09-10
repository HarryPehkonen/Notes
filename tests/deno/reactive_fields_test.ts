/**
 * A field the template renders must be declared in `static properties`.
 *
 * This is the class behind two bugs found the same evening:
 *
 * - `toasts`: the five-second timer removed a toast from the array and nothing
 *   re-rendered, so toasts stayed on screen until an unrelated redraw.
 * - `user`: harmless in practice (set in the constructor, before the first
 *   render), but a later update would never have repainted the avatar.
 *
 * Lit only schedules a re-render for values it knows about, so a template that
 * reads `this.x` while `x` is undeclared is a silent "the UI doesn't update"
 * generator. This walks every component and fails on that shape.
 */
import { assert } from "https://deno.land/std@0.208.0/assert/mod.ts";

const COMPONENTS = [
  "notes-app.js",
  "note-list.js",
  "note-editor.js",
  "search-bar.js",
  "tag-manager.js",
];

Deno.test("every field the template renders is declared reactive", async () => {
  for (const component of COMPONENTS) {
    const source = await Deno.readTextFile(
      new URL(`../../public/components/${component}`, import.meta.url),
    );

    const start = source.indexOf("static properties = {");
    if (start === -1) continue;

    const block = source.slice(start, source.indexOf("};", start));
    /** @type {Set<string>} */
    const declared = new Set(
      [...block.matchAll(/^\s{4}([A-Za-z_$][\w$]*):/gm)].map((m) => String(m[1])),
    );
    if (declared.size === 0) continue;

    /** @type {Set<string>} */
    const rendered = new Set(
      [...source.matchAll(/\$\{[^}]*\bthis\.([A-Za-z_$][\w$]*)\b/g)].map((m) => String(m[1])),
    );

    const missing = [...rendered]
      .filter((name) => !name.startsWith("_")) // private scratch, never rendered
      .filter((name) => !declared.has(name))
      .filter((name) => !new RegExp(`(^|[\\s;{])${name}\\s*\\(`).test(source)); // a method, not state

    assert(
      missing.length === 0,
      `${component}: rendered but not declared in static properties: ${missing.join(", ")}`,
    );
  }
});
