/**
 * Clickable checkbox support for markdown notes.
 *
 * Rather than teaching `marked` to render task lists, checkbox markers are
 * replaced with placeholder tokens *before* parsing and turned into `<input>`
 * elements *after* parsing. That keeps one stable numbering scheme -- the
 * order of appearance of `[ ]` / `[x]` in the markdown source -- shared by the
 * rendered checkbox (`data-cb-index`) and by {@link toggleCheckbox}, so a tap
 * in preview mode maps deterministically back to a character range in the note.
 *
 * Markers inside fenced code blocks and inline code spans are ignored
 * everywhere, so documentation about checkboxes never becomes a checkbox.
 */

/** Matches a checkbox marker anchored at the start of the given slice. */
const MARKER = /^\[[ xX]\]/;

/** Length of a `[ ]` / `[x]` marker. */
const MARKER_LENGTH = 3;

/** Matches the placeholder tokens emitted by {@link tokenizeCheckboxes}. */
const TOKEN = /@@CB([UC])(\d+)@@/g;

/** Matches an opening or closing code fence line. */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * @typedef {object} CheckboxMatch
 * @property {number} index - Offset of the `[` in the source markdown
 * @property {boolean} checked - Whether the marker is `[x]` / `[X]`
 */

/**
 * Find the closing backtick run of the same length, starting at `from`.
 * @param {string} line
 * @param {number} from
 * @param {number} length - Length of the opening run
 * @returns {number} Offset of the closing run, or -1 if there is none
 */
function findClosingBacktickRun(line, from, length) {
  let i = from;
  while (i < line.length) {
    if (line[i] !== "`") {
      i++;
      continue;
    }
    let run = 0;
    while (line[i + run] === "`") run++;
    if (run === length) return i;
    i += run;
  }
  return -1;
}

/**
 * Collect checkbox markers on a single line, skipping inline code spans and
 * backslash-escaped brackets.
 * @param {string} line
 * @param {number} offset - Offset of the line within the full markdown
 * @param {CheckboxMatch[]} matches - Accumulator, appended to in place
 */
function scanLine(line, offset, matches) {
  let i = 0;
  while (i < line.length) {
    const char = line[i];

    if (char === "`") {
      let run = 0;
      while (line[i + run] === "`") run++;
      const closing = findClosingBacktickRun(line, i + run, run);
      // An unmatched run is literal text; step past it and keep scanning.
      i = closing === -1 ? i + run : closing + run;
      continue;
    }

    if (char === "\\") {
      i += 2;
      continue;
    }

    if (char === "[") {
      const marker = MARKER.exec(line.slice(i));
      if (marker) {
        matches.push({ index: offset + i, checked: marker[0][1] !== " " });
        i += MARKER_LENGTH;
        continue;
      }
    }

    i++;
  }
}

/**
 * Find every checkbox marker in the markdown, in order of appearance,
 * ignoring anything inside fenced code blocks or inline code spans.
 * @param {string} markdown
 * @returns {CheckboxMatch[]}
 */
function findCheckboxMatches(markdown) {
  /** @type {CheckboxMatch[]} */
  const matches = [];
  if (typeof markdown !== "string" || markdown.length === 0) return matches;

  /** @type {{ char: string, length: number } | null} */
  let fence = null;
  let lineStart = 0;

  while (lineStart <= markdown.length) {
    let lineEnd = markdown.indexOf("\n", lineStart);
    if (lineEnd === -1) lineEnd = markdown.length;
    const line = markdown.slice(lineStart, lineEnd);
    const fenceMatch = FENCE.exec(line);

    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence.char && fenceMatch[1].length >= fence.length) {
        fence = null;
      }
    } else if (fenceMatch) {
      fence = { char: fenceMatch[1][0], length: fenceMatch[1].length };
    } else {
      scanLine(line, lineStart, matches);
    }

    if (lineEnd === markdown.length) break;
    lineStart = lineEnd + 1;
  }

  return matches;
}

/**
 * Replace checkbox markers with placeholder tokens that survive `marked.parse`.
 * `[ ]` becomes `@@CBn@@`-style text carrying both the checked state and the
 * marker's index, so no markdown structure is needed to preserve it.
 * @param {string} markdown - Raw note content
 * @returns {string} Markdown with markers replaced by tokens
 */
export function tokenizeCheckboxes(markdown) {
  if (typeof markdown !== "string") return markdown;

  const matches = findCheckboxMatches(markdown);
  if (matches.length === 0) return markdown;

  let result = "";
  let cursor = 0;
  matches.forEach((match, index) => {
    result += markdown.slice(cursor, match.index) +
      `@@CB${match.checked ? "C" : "U"}${index}@@`;
    cursor = match.index + MARKER_LENGTH;
  });
  return result + markdown.slice(cursor);
}

/**
 * Replace placeholder tokens in parsed HTML with checkbox inputs. Malformed or
 * unknown `@@...@@` text is left untouched.
 * @param {string} html - Output of `marked.parse`
 * @returns {string} HTML with `<input type="checkbox" data-cb-index="n">` elements
 */
export function parseCheckboxTokens(html) {
  if (typeof html !== "string") return html;

  return html.replace(TOKEN, (_token, state, index) => {
    const checked = state === "C" ? " checked" : "";
    return `<input type="checkbox" data-cb-index="${index}"${checked}>`;
  });
}

/**
 * Flip the index-th checkbox marker in the markdown source. The index is the
 * same one {@link tokenizeCheckboxes} assigned, i.e. the value read back from
 * a clicked input's `data-cb-index`.
 * @param {string} markdown - Raw note content
 * @param {number} index - Zero-based position in order of appearance
 * @returns {string} Updated markdown, or the input unchanged if index is out of range
 */
export function toggleCheckbox(markdown, index) {
  if (typeof markdown !== "string") return markdown;

  const match = findCheckboxMatches(markdown)[index];
  if (!match) return markdown;

  return markdown.slice(0, match.index) +
    (match.checked ? "[ ]" : "[x]") +
    markdown.slice(match.index + MARKER_LENGTH);
}
