/**
 * The guard between an untrusted groff document and the renderer.
 *
 * A groff document in Notes can be written by anyone (including an AI), and the
 * server renders it. groff's own safer mode is on by default and is necessary,
 * but it is NOT sufficient. Measured 2026-10-28 on groff 1.23.0:
 *
 *   .sy echo SY_RAN   -> error: 'sy' request is not allowed in safer mode
 *   .pso echo PSO_RAN -> error: 'pso' request is not allowed in safer mode
 *   .so /etc/hostname -> NO ERROR. The file was read and its contents ("hermes",
 *                        the hostname) were printed into the PDF.
 *
 * So safer mode closes shell execution but leaves file inclusion open, and any
 * note body containing ".so /etc/passwd" would exfiltrate it into a rendered PDF.
 * The defence is an allowlist: a document may use the macros the house style
 * defines, plus the short list of ms primitives below, and nothing else.
 *
 * Two measured facts shape the rest of this file:
 *
 *   * groff EXITS 0 even when it has reported errors. "Rendered without error"
 *     therefore cannot be inferred from the exit code -- see render.js, which
 *     fails a render whose stderr mentions error or warning.
 *   * \X (device control) and \! (driver passthrough) are escapes rather than
 *     requests, so the request allowlist cannot see them. They inject raw output
 *     driver commands, so they are refused by scanning the text.
 *
 * A violation refuses the whole render. Nothing is silently stripped: a document
 * that smuggles a request should be reported, not quietly edited into something
 * that renders, and stripping can change a document's meaning.
 */

/** Macros the house style defines, plus the ms primitives a document may use.
 *  `.SH` and friends are deliberately absent: sectioning goes through SECTION so
 *  a document cannot set its own typography and escape the house look. */
const ALLOWED_REQUESTS = new Set([
  // house style (see groff/house.tmac). STYLE selects an appearance SET by name
  // -- palatino or dejavu -- and the name is looked up in house.tmac, so a
  // document still cannot name a font, a size, a measure or a margin. An unknown
  // name aborts the render (.ab: "error:" on stderr, no PDF), which is the point.
  "DOC", // the generic document opener; .RECIPE is the recipe-flavoured name
  "RECIPE",
  "STYLE",
  "SECTION",
  "ING",
  "STEP",
  "NOTE",
  "CODE",
  "ENDCODE",
  // ms primitives a document may use directly
  "PP",
  "P",
  "LP",
  "B",
  "I",
  "R",
  "BR",
  "nf",
  "fi",
  "br",
  "sp",
]);

/** Escapes refused anywhere in the text, because they reach the output driver. */
const FORBIDDEN_ESCAPES = [
  { probe: "\\X", why: "device control: injects raw output-driver commands" },
  { probe: "\\!", why: "driver passthrough: injects raw output-driver commands" },
];

/** Rough cap so a runaway document cannot tie up the renderer. */
export const MAX_SOURCE_BYTES = 200_000;

/**
 * Check a document against the allowlist.
 *
 * @param {unknown} source raw groff document text
 * @returns {{ok: boolean, violations: Array<{line: number, text: string, reason: string}>}}
 *   `line` is 1-based; 0 means the whole document (used for the size cap).
 */
export function sanitizeGroff(source) {
  const text = String(source ?? "");
  const violations = [];

  if (text.length > MAX_SOURCE_BYTES) {
    violations.push({
      line: 0,
      text: "",
      reason: `document is ${text.length} bytes; the limit is ${MAX_SOURCE_BYTES}`,
    });
  }

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // A control line is a line whose FIRST character is . or '. Leading
    // whitespace makes it ordinary text, so no trimming here.
    const control = line[0] === "." || line[0] === "'";
    if (control) {
      // A comment is inert.
      const isComment = line[1] === "\\" && line[2] === '"';
      if (!isComment) {
        const name = (line.slice(1).match(/^[^\s\\]*/) || [""])[0];
        if (!ALLOWED_REQUESTS.has(name)) {
          violations.push({
            line: i + 1,
            text: line,
            reason: `request "${name}" is not allowed in a document`,
          });
        }
      }
    }

    for (const { probe, why } of FORBIDDEN_ESCAPES) {
      if (line.includes(probe)) {
        violations.push({
          line: i + 1,
          text: line,
          reason: `escape "${probe}" is not allowed: ${why}`,
        });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

/** One line per violation, for showing to a person. */
export function describeViolations(violations) {
  return violations
    .map((v) => (v.line === 0 ? v.reason : `line ${v.line}: ${v.reason}`))
    .join("\n");
}
