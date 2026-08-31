/**
 * Shared inline icon set - one consistent stroke-based line language
 * used across every component, instead of mixing filled SVGs, text
 * glyphs (☰ ✕ ※), and emoji.
 *
 * Note the split between `html` and `svg` tags below: lit-html parses
 * `html` templates with regular HTML rules, so bare <path>/<circle>/<rect>
 * tags inside a *nested* html`` template are never given SVG-namespace
 * elements and silently fail to render. The inner path data must be built
 * with the `svg` tag so lit parses it under SVG rules; only the outer
 * <svg> wrapper (a real, recognized tag) can stay in the `html` template.
 */
import { html, svg } from "lit";

const stroke = (paths) =>
  html`
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      ${paths}
    </svg>
  `;

export const icons = {
  home: stroke(svg`
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1V10.5Z" />
  `),
  pin: stroke(svg`
    <path d="M12 2v6" />
    <path d="M8 8h8l1 4H7l1-4Z" />
    <path d="M12 12v10" />
  `),
  hash: stroke(svg`
    <path d="M9 3 7 21" />
    <path d="M17 3l-2 18" />
    <path d="M4 9h16" />
    <path d="M3 15h16" />
  `),
  plus: stroke(svg`
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  `),
  menu: stroke(svg`
    <path d="M4 6h16" />
    <path d="M4 12h16" />
    <path d="M4 18h16" />
  `),
  close: stroke(svg`
    <path d="M6 6l12 12" />
    <path d="M18 6 6 18" />
  `),
  chevronLeft: stroke(svg`
    <path d="M15 5 8 12l7 7" />
  `),
  chevronDown: stroke(svg`
    <path d="M5 8l7 7 7-7" />
  `),
  clock: stroke(svg`
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  `),
  image: stroke(svg`
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M3.7 16.5 9 12l3 2.5 3.5-3.5 4.8 5" />
  `),
  edit: stroke(svg`
    <path d="M4 20l1-4.2L15.8 5a1.8 1.8 0 0 1 2.6 0l.6.6a1.8 1.8 0 0 1 0 2.6L8.2 19 4 20Z" />
  `),
  eye: stroke(svg`
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.6" />
  `),
  search: stroke(svg`
    <circle cx="10.8" cy="10.8" r="6.8" />
    <path d="M20 20l-4.6-4.6" />
  `),
  sort: stroke(svg`
    <path d="M7 4v16" />
    <path d="M3.5 7.5 7 4l3.5 3.5" />
    <path d="M17 20V4" />
    <path d="M13.5 16.5 17 20l3.5-3.5" />
  `),
  grid: stroke(svg`
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
  `),
  list: stroke(svg`
    <path d="M8 6h13" />
    <path d="M8 12h13" />
    <path d="M8 18h13" />
    <path d="M3.5 6h.01" />
    <path d="M3.5 12h.01" />
    <path d="M3.5 18h.01" />
  `),
  trash: stroke(svg`
    <path d="M4 7h16" />
    <path d="M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7" />
    <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  `),
  doc: stroke(svg`
    <path
      d="M7 3.5h7l3.5 3.5V19a1.2 1.2 0 0 1-1.2 1.2H7A1.2 1.2 0 0 1 5.8 19V4.7A1.2 1.2 0 0 1 7 3.5Z"
    />
    <path d="M14 3.5V7h3.5" />
    <path d="M8.2 12h7.2" />
    <path d="M8.2 15.3h7.2" />
  `),
  printer: stroke(svg`
    <path d="M7 9V4.2h10V9" />
    <path d="M7 17H5.2A1.2 1.2 0 0 1 4 15.8v-5.6A1.2 1.2 0 0 1 5.2 9h13.6A1.2 1.2 0 0 1 20 10.2v5.6a1.2 1.2 0 0 1-1.2 1.2H17" />
    <path d="M7 14h10v5.8H7Z" />
  `),
  logout: stroke(svg`
    <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
    <path d="M15 16l4-4-4-4" />
    <path d="M19 12H9" />
  `),
};
