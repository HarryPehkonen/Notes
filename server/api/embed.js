/**
 * Embedding client
 *
 * Talks to the local llama.cpp server (OpenAI-compatible /v1/embeddings)
 * serving BGE-M3. Everything except `embedText` is pure so the prompt format
 * and the pgvector literal can be unit-tested without a network.
 */

/** Dimensionality of the BGE-M3 vectors stored in note_embeddings */
export const EMBEDDING_DIMENSIONS = 1024;

/** Default endpoint - the embedding server runs on the same host as the app */
const DEFAULT_EMBEDDING_URL = "http://127.0.0.1:8080/v1/embeddings";
const DEFAULT_EMBEDDING_MODEL = "bge-m3";
// CPU-only BGE-M3 takes ~25s for a 3.4K-token note; 60s is a generous ceiling.
const DEFAULT_TIMEOUT_MS = 60_000;

/** Every embedding failure - unreachable server, bad status, bad body */
export class EmbeddingError extends Error {
  /**
   * @param {string} message - What went wrong
   * @param {Object} [options] - Standard Error options (cause)
   */
  constructor(message, options) {
    super(message, options);
    this.name = "EmbeddingError";
  }
}

/**
 * Read an environment variable without exploding when --allow-env is absent
 * (the test runner has no env permission and only imports the pure helpers).
 * @param {string} name - Variable name
 * @returns {string|undefined} Value, or undefined when unset/unreadable
 */
function readEnv(name) {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

/** @returns {string} The configured embeddings endpoint */
export function embeddingUrl() {
  return readEnv("EMBEDDING_URL") || DEFAULT_EMBEDDING_URL;
}

/** @returns {string} The configured embedding model name */
export function embeddingModel() {
  return readEnv("EMBEDDING_MODEL") || DEFAULT_EMBEDDING_MODEL;
}

/** Timeout for embedding requests (ms). Tune EMBEDDING_TIMEOUT_MS for slow
 * CPU-only servers; falls back to the generous default. */
export function embeddingTimeoutMs() {
  const raw = readEnv("EMBEDDING_TIMEOUT_MS");
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

/**
 * Build the text that represents a note to the embedding model.
 *
 * Format is `title\n\ncontent`; either part may be missing, and an empty note
 * yields an empty prompt (callers skip embedding those).
 *
 * @param {string} title - Note title
 * @param {string} content - Note body, plain text preferred
 * @returns {string} Prompt text
 */
export function buildEmbeddingPrompt(title, content) {
  const trimmedTitle = typeof title === "string" ? title.trim() : "";
  const trimmedContent = typeof content === "string" ? content.trim() : "";

  if (trimmedTitle && trimmedContent) return `${trimmedTitle}\n\n${trimmedContent}`;
  return trimmedTitle || trimmedContent;
}

/**
 * Format a vector as a pgvector literal, e.g. "[0.1,-0.25,3]".
 *
 * Passed as a text parameter and cast with `$1::vector` at the call site, so
 * the values never reach the SQL string themselves.
 *
 * @param {number[]} values - Embedding values
 * @returns {string} pgvector literal
 */
export function toVectorLiteral(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new EmbeddingError("Embedding must be a non-empty array of numbers");
  }
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new EmbeddingError("Embedding contains a non-finite value");
    }
  }
  return `[${values.join(",")}]`;
}

/**
 * Pull the embedding out of an OpenAI-shaped /v1/embeddings response
 * @param {unknown} body - Parsed JSON response body
 * @returns {number[]} The first embedding
 */
export function parseEmbeddingResponse(body) {
  const embedding = body?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new EmbeddingError("Embedding server returned no embedding");
  }
  return embedding;
}

/**
 * Embed a single piece of text via the local embedding server.
 *
 * Never throws anything but EmbeddingError, so callers can distinguish "the
 * embedding server is down" from a database or application failure.
 *
 * @param {string} text - Text to embed
 * @param {Object} [options] - Request options
 * @param {number} [options.timeoutMs] - Abort after this many milliseconds
 * @returns {Promise<number[]>} The embedding vector
 */
export async function embedText(text, options = {}) {
  const timeoutMs = options.timeoutMs ?? embeddingTimeoutMs();

  if (typeof text !== "string" || text.trim().length === 0) {
    throw new EmbeddingError("Cannot embed empty text");
  }

  let response;
  try {
    response = await fetch(embeddingUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: embeddingModel(), input: text }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new EmbeddingError(`Embedding server unreachable: ${error.message}`, { cause: error });
  }

  if (!response.ok) {
    // Drain the body so the connection can be reused
    await response.text().catch(() => {});
    throw new EmbeddingError(`Embedding server returned HTTP ${response.status}`);
  }

  let body;
  try {
    body = await response.json();
  } catch (error) {
    throw new EmbeddingError("Embedding server returned invalid JSON", { cause: error });
  }

  return parseEmbeddingResponse(body);
}
