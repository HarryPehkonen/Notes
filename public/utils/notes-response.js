/**
 * Read a notes payload into the three things the list needs: the rows, the
 * total behind them, and whether a next page exists.
 *
 * Both the initial load and every filter/search path must go through this. The
 * initial load used to keep only the rows, which is how a freshly loaded page
 * came to say "20 Notes" with no "Load more" button, while fetching the same
 * data through a filter said "20 of 65".
 *
 * The list endpoint puts its rows in `data.notes`; the search endpoints use
 * `data.results`. Reading both here keeps that difference out of the component.
 */

/**
 * @param {unknown} payload The parsed API envelope.
 * @returns {{notes: unknown[], total: number|null, hasMore: boolean}}
 *   `total` is null when the response does not report one.
 */
export function readNotesPage(payload) {
  const data = payload?.data ?? null;
  const meta = payload?.meta ?? null;
  const rows = data?.notes ?? data?.results ?? [];

  return {
    notes: Array.isArray(rows) ? rows : [],
    total: Number.isFinite(meta?.total) ? meta.total : null,
    hasMore: Boolean(meta?.hasMore),
  };
}
