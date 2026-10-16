/**
 * Settings > API tokens - the page's behaviour.
 *
 * Vanilla on purpose: this is one form and one list, on a page someone visits
 * twice a year, so it does not earn a Lit component, an import map or a CDN
 * request. Wording and shapes come from `public/utils/token-view.js`, which is
 * unit-tested; this file only moves data between the DOM and `/api/tokens`.
 *
 * Everything the server sends is inserted as TEXT (`textContent`), never as
 * markup: a token name is user input, and this page has no reason to trust it.
 */

import { createTokenBody, stateLabel, tokenSummary } from "./utils/token-view.js";

const API = "/api/tokens";

const form = document.getElementById("create-form");
const createButton = document.getElementById("create-btn");
const createError = document.getElementById("create-error");
const reveal = document.getElementById("reveal");
const tokenValue = document.getElementById("token-value");
const copyButton = document.getElementById("copy-btn");
const listState = document.getElementById("list-state");
const list = document.getElementById("token-list");

/** One API call, with the app's error envelope unwrapped into an Error. */
async function call(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (response.status === 204) return null;

  let body = null;
  try {
    body = await response.json();
  } catch (_error) {
    body = null;
  }

  if (!response.ok) {
    const message = body?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return body?.data ?? null;
}

/** Show a failure next to the form, in place, with no alert(). */
function showError(message) {
  createError.textContent = message;
  createError.hidden = false;
}

/** One row per token: name, state, summary, and Revoke while it is still live. */
function renderRow(row) {
  const item = document.createElement("li");
  item.className = "token-row";

  const name = document.createElement("span");
  name.className = "token-name";
  name.textContent = row.name;

  const badge = document.createElement("span");
  badge.className = `badge ${row.state}`;
  badge.textContent = stateLabel(row.state);
  name.append(badge);

  const meta = document.createElement("span");
  meta.className = "token-meta";
  meta.textContent = row.id ? `#${row.id} \u00b7 ${tokenSummary(row)}` : tokenSummary(row);
  item.append(name, meta);

  if (row.state === "active") {
    const revoke = document.createElement("button");
    revoke.type = "button";
    revoke.className = "danger";
    revoke.textContent = "Revoke";
    revoke.addEventListener("click", async () => {
      const confirmed = confirm(
        `Revoke "${row.name}"? Anything using it stops working immediately. This cannot be undone.`,
      );
      if (!confirmed) return;
      revoke.disabled = true;
      try {
        await call(`${API}/${row.id}`, { method: "DELETE" });
        await loadTokens();
      } catch (error) {
        revoke.disabled = false;
        showError(error.message);
      }
    });
    item.append(revoke);
  }

  return item;
}

/** Load and draw the list. */
async function loadTokens() {
  try {
    const rows = (await call(API)) || [];
    list.replaceChildren();
    listState.hidden = rows.length > 0;
    listState.textContent = rows.length === 0
      ? "You have no tokens yet. Create one above to let a program work on your notes."
      : "";
    for (const row of rows) list.append(renderRow(row));
  } catch (error) {
    listState.hidden = false;
    listState.textContent = `Could not load your tokens: ${error.message}`;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  createError.hidden = true;
  createButton.disabled = true;

  const data = new FormData(form);
  const body = createTokenBody({
    name: data.get("name"),
    scope: data.get("scope"),
    expiresInDays: data.get("expires_in_days"),
  });

  if (!body.name) {
    createButton.disabled = false;
    showError("Give the token a name, so you can tell it apart later.");
    return;
  }

  try {
    const created = await call(API, { method: "POST", body: JSON.stringify(body) });
    tokenValue.textContent = created.token;
    reveal.hidden = false;
    reveal.scrollIntoView({ behavior: "smooth", block: "center" });
    form.reset();
    await loadTokens();
  } catch (error) {
    showError(error.message);
  } finally {
    createButton.disabled = false;
  }
});

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(tokenValue.textContent.trim());
    copyButton.textContent = "Copied";
    setTimeout(() => {
      copyButton.textContent = "Copy token";
    }, 2000);
  } catch (_error) {
    // Clipboard access can be refused (insecure context, permissions). The
    // token is selectable, so saying so is a better outcome than a silent no-op.
    copyButton.textContent = "Select it and copy";
  }
});

// Load the list the moment the page opens.
loadTokens();
