/**
 * Render a groff document to PDF, safely.
 *
 * The rules this file exists to enforce, each one earned by a measurement:
 *
 *   * The document goes in on STDIN and is never named on a command line, and
 *     the process is spawned with an argv array, never a shell. The macro package
 *     and the house style come from the COMMAND LINE, which is why a document
 *     never needs an include and the allowlist in sanitize.js can refuse them all.
 *   * The document is checked by sanitizeGroff() before groff is started. A
 *     refusal means groff is not run at all.
 *   * The exit code is not the verdict. Measured on groff 1.23.0: it exits 0
 *     while printing "error: 'pso' request is not allowed in safer mode" on
 *     stderr. Errors are read from stderr; warnings are returned to the caller
 *     rather than swallowed, because they are what a document author needs to
 *     see, and they do not by themselves mean the render failed.
 *   * Safer mode is groff's default and is left alone: -U is never passed.
 *     Safer mode stops shell execution but NOT file inclusion (.so), which is
 *     why the allowlist above it is mandatory rather than decorative.
 *   * A render that exceeds the timeout is killed, so a pathological document
 *     cannot occupy the server.
 */

import { describeViolations, sanitizeGroff } from "./sanitize.js";

/** Where the house style lives: groff/house.tmac, next to the repo root. */
export const STYLE_DIR = new URL("../../groff/", import.meta.url).pathname;

/** Seconds a single render may take before it is killed. */
export const RENDER_TIMEOUT_MS = 20_000;

export class GroffDocumentError extends Error {
  constructor(message, { violations = [], stderr = [], kind = "rejected" } = {}) {
    super(message);
    this.name = "GroffDocumentError";
    this.violations = violations;
    this.stderr = stderr;
    this.kind = kind; // "rejected" (never ran) | "failed" (groff reported an error)
  }
}

/**
 * @param {unknown} source raw groff document text
 * @param {{timeoutMs?: number}} [opts]
 * @returns {Promise<{pdf: Uint8Array, warnings: string[]}>}
 * @throws {GroffDocumentError} when the document is refused or groff reports an error
 */
export async function renderPdf(source, opts = {}) {
  const check = sanitizeGroff(source);
  if (!check.ok) {
    throw new GroffDocumentError(
      `document refused:\n${describeViolations(check.violations)}`,
      { violations: check.violations },
    );
  }

  const args = [
    "-Kutf8", // input is UTF-8 (without it, é and — arrive mangled)
    "-ww", // report every warning: the caller decides what matters
    "-dpaper=letter",
    "-P-pletter",
    // The DejaVu faces built by scripts/groff-fonts.sh, and embedding forced so
    // the PDF carries its typefaces instead of relying on the reader's. Neither
    // is in groff's default font path, so -F is what makes the house style's
    // .fam DS resolve at all. Overridable for a server where they live
    // elsewhere.
    "-F",
    Deno.env.get("GROFF_FONT_DIR") ?? "/usr/local/share/groff/site-font",
    "-P-e",
    "-ms", // macro package FIRST ...
    "-M",
    STYLE_DIR,
    "-m",
    "house", // ... then our style, so it overrides ms's page setup
    "-Tpdf",
    "-", // the document, on stdin
  ];

  const command = new Deno.Command("groff", {
    args,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
    env: { ...Deno.env.toObject(), LC_ALL: "C.UTF-8", PAPERSIZE: "letter" },
    signal: AbortSignal.timeout(opts.timeoutMs ?? RENDER_TIMEOUT_MS),
  });

  const child = command.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(String(source ?? "")));
  await writer.close();

  const { code, stdout, stderr } = await child.output();
  const lines = new TextDecoder().decode(stderr).split("\n").filter((l) => l.trim() !== "");
  const errors = lines.filter((l) => l.includes("error:"));
  const warnings = lines.filter((l) => !l.includes("error:"));

  if (errors.length > 0) {
    throw new GroffDocumentError(
      `groff reported ${errors.length} error(s):\n${errors.join("\n")}`,
      {
        stderr: lines,
        kind: "failed",
      },
    );
  }
  if (code !== 0) {
    throw new GroffDocumentError(`groff exited ${code}:\n${lines.join("\n")}`, {
      stderr: lines,
      kind: "failed",
    });
  }
  if (stdout.length === 0) {
    // Should be unreachable, but a zero-byte "success" must never be cached as a PDF.
    throw new GroffDocumentError("groff produced no output", { stderr: lines, kind: "failed" });
  }

  return { pdf: stdout, warnings };
}
