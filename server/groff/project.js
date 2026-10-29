/**
 * Project a groff document to markdown.
 *
 * The source of truth for a groff note is the groff text itself; this projection
 * exists so the note can be READ and SEARCHED with everything the app already
 * has. It is display-only and must never be written back over `content` -- the
 * save path stores it in its own column, and the editor only ever loads the
 * groff source.
 *
 * Deliberately approximate, and honest about where: the house vocabulary
 * (.DOC/.RECIPE .SECTION .ING .STEP .NOTE .CODE) is projected exactly, ms's own
 * requests are projected where a plain reading exists and otherwise dropped with
 * a warning, so a lossy rendering is visible rather than silent. groff is never
 * invoked here -- this is a text transform, which is why it can run server-side
 * on every save with no toolchain installed.
 *
 * @param {string} source - The groff document
 * @returns {{title: string, subtitle: string, markdown: string, warnings: string[]}}
 */

/** groff named specials that appear in the house vocabulary's documents. */
const NAMED_SPECIALS = {
  "bu": "\u2022",
  "em": "\u2014",
  "en": "\u2013",
  "de": "\u00B0",
  "12": "\u00BD",
  "14": "\u00BC",
  "34": "\u00BE",
  "lq": "\u201C",
  "rq": "\u201D",
  "oq": "\u2018",
  "cq": "\u2019",
  "sq": "\u25A1",
  "co": "\u00A9",
  "rg": "\u00AE",
  "tm": "\u2122",
  "mi": "\u2212",
  "mu": "\u00D7",
  "di": "\u00F7",
};

/**
 * Turn groff escapes into the characters they stand for.
 *
 * Documents keep their source pure ASCII, so `\[u00BD]` is how a half lands in a
 * recipe. A reader should see the half. Escapes that only steer typography --
 * font changes, string and register interpolations -- carry no text and go.
 *
 * @param {string} text - Text containing groff escapes
 * @returns {string} The same text with the escapes resolved
 */
export function decodeGroffEscapes(text) {
  return text
    .replace(/\\\[u([0-9A-Fa-f]{4,6})\]/g, (match, hex) => {
      const code = parseInt(hex, 16);
      // A lone surrogate cannot be encoded; better left as written than mangled.
      return code >= 0xD800 && code <= 0xDFFF ? match : String.fromCodePoint(code);
    })
    .replace(/\\\((..)/g, (match, name) => NAMED_SPECIALS[name] ?? match)
    .replace(/\\f(\[[^\]]*\]|.)/g, "")
    .replace(/\\[*n]\{[^}]*\}/g, "")
    .replace(/\\(.)/g, "$1");
}

/**
 * Pull the double-quoted arguments out of a request line.
 *
 * The vocabulary takes quoted arguments (`.ING "190 g all-purpose flour"`), and
 * an argument may contain an escaped quote.
 *
 * @param {string} rest - Everything after the request name
 * @returns {string[]} The arguments, unescaped
 */
export function quotedArguments(rest) {
  const args = [];
  for (const match of rest.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    args.push(match[1].replace(/\\"/g, '"'));
  }
  return args;
}

/** Requests that carry no text of their own and project to a paragraph break. */
const BREAKS = new Set(["PP", "P", "LP", "br", "sp"]);

/** Requests that style the text around them rather than being text: a plain
 * reading has nowhere to put them. Dropping them loses emphasis, never words. */
const FONT_REQUESTS = new Set(["B", "I", "R", "BR", "BI", "IB", "SM", "LG"]);

/** Both of these bracket a block whose line breaks are meant to survive. */
const FENCE_END = /^\.(ENDCODE|fi)\b/;

/**
 * @param {string} source - The groff document
 * @returns {{title: string, subtitle: string, markdown: string, warnings: string[]}}
 */
export function projectGroff(source) {
  /** @type {string[]} */
  const lines = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {string[]} */
  let paragraph = [];
  let title = "";
  let subtitle = "";
  let inCode = false;

  const lastLine = () => lines[lines.length - 1];
  const separate = () => {
    if (lastLine() !== undefined && lastLine() !== "") lines.push("");
  };

  // Prose lines are joined, not emitted one by one, so markdown reflows them the
  // way groff filled them. The paragraph ends at the next block of any kind.
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    lines.push(paragraph.join("\n"));
    paragraph = [];
  };
  // Headings, notes and code fences want air around them.
  const pushBlock = (text) => {
    flushParagraph();
    separate();
    lines.push(text);
  };
  // A list needs a blank line before its first item and no blank line between
  // items, so consecutive ingredients or steps read as one list. A list of the
  // other kind gets the blank line, or markdown would run them together.
  const pushListItem = (marker, text) => {
    flushParagraph();
    const previous = lastLine();
    if (previous !== undefined && previous !== "" && !previous.startsWith(`${marker} `)) {
      lines.push("");
    }
    lines.push(`${marker} ${text}`);
  };
  const warn = (lineNumber, message) => warnings.push(`line ${lineNumber}: ${message}`);

  String(source ?? "").split("\n").forEach((raw, index) => {
    const lineNumber = index + 1;
    const line = raw.replace(/\s+$/, "");

    if (inCode) {
      if (FENCE_END.test(line)) {
        inCode = false;
        lines.push("```");
      } else {
        lines.push(line);
      }
      return;
    }

    if (/^\.\\"/.test(line)) return; // a comment

    const request = /^[.'](\S+)\s*(.*)$/.exec(line);
    if (!request) {
      if (line.trim() === "") {
        // A blank line ends a paragraph, and the next block starts after air.
        flushParagraph();
        separate();
      } else {
        paragraph.push(decodeGroffEscapes(line));
      }
      return;
    }

    const name = request[1];
    const args = quotedArguments(request[2]);
    const first = decodeGroffEscapes(args[0] ?? "");

    switch (name) {
      case "DOC":
      case "RECIPE": {
        title = first;
        subtitle = decodeGroffEscapes(args[1] ?? "");
        flushParagraph();
        if (subtitle !== "") lines.push(`_${subtitle}_`);
        return;
      }
      case "SECTION":
        pushBlock(`## ${first}`);
        return;
      case "ING":
        pushListItem("-", first);
        return;
      case "STEP":
        pushListItem("1.", first);
        return;
      case "NOTE":
        pushBlock(`> ${first}`);
        return;
      case "CODE":
      case "nf":
        pushBlock("```");
        inCode = true;
        return;
      case "ENDCODE":
        warn(lineNumber, ".ENDCODE without .CODE");
        return;
      default:
        break;
    }

    if (BREAKS.has(name)) {
      flushParagraph();
      separate();
      return;
    }
    if (FONT_REQUESTS.has(name)) {
      warn(lineNumber, `.${name} styles what follows and is not projected`);
      return;
    }
    warn(lineNumber, `.${name} is not part of the vocabulary and is not projected`);
  });

  flushParagraph();
  if (inCode) warnings.push(".CODE was never closed with .ENDCODE");

  const markdown = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { title, subtitle, markdown, warnings };
}
