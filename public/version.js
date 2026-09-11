/**
 * The client build number, shown in the account menu.
 *
 * One number for the whole front end, bumped in the same commit as any change
 * under `public/` - the same rule as `CACHE_NAME` in `sw.js`, which must carry
 * this number: `tests/deno/app_version_test.ts` fails if the two drift, because
 * drift means a device runs the old code while the page claims to be current.
 *
 * A plain counter rather than a git sha: the only consumer is a human on a
 * phone being asked "what does it say?", so it has to be short, readable, and
 * comparable at a glance ("mine says 22, yours says 23").
 */
export const APP_VERSION = 24;
