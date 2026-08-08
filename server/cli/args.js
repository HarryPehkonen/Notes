/**
 * Argument parsing for the API token CLI
 *
 * Kept free of I/O so it can be unit tested without a database.
 */

/**
 * @typedef {Object} TokenArgs
 * @property {string|null} command - One of "create", "list", "revoke"
 * @property {string|null} email - Value of --email
 * @property {string|null} name - Value of --name
 * @property {boolean} help - Whether --help/-h was requested
 * @property {string|null} error - Human-readable parse error, if any
 */

/** Subcommands the CLI accepts */
const COMMANDS = ["create", "list", "revoke"];

/** Flags that take a value, per subcommand */
const VALUE_FLAGS = ["--email", "--name"];

/** Flags that are required for a given subcommand */
const REQUIRED_FLAGS = {
  create: ["--email", "--name"],
  list: [],
  revoke: ["--name"],
};

/**
 * Parse CLI arguments for the token tool
 * @param {string[]} argv - Raw arguments (typically `Deno.args`)
 * @returns {TokenArgs} Parsed arguments; inspect `.error` before using them
 */
export function parseTokenArgs(argv) {
  /** @type {TokenArgs} */
  const parsed = { command: null, email: null, name: null, help: false, error: null };
  const values = { "--email": null, "--name": null };

  const rest = [];
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else {
      rest.push(arg);
    }
  }

  let error = null;

  /**
   * Record the first error only, so the message points at the earliest problem
   * @param {string} message - Error message
   */
  const fail = (message) => {
    if (!error) error = message;
  };

  if (rest.length > 0 && !rest[0].startsWith("-")) {
    parsed.command = rest.shift();
    if (!COMMANDS.includes(parsed.command)) {
      fail(`Unknown command: ${parsed.command} (expected ${COMMANDS.join(", ")})`);
    }
  } else {
    fail(`Missing command (expected ${COMMANDS.join(", ")})`);
  }

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];

    if (!arg.startsWith("-")) {
      fail(`Unexpected argument: ${arg}`);
      continue;
    }

    const eq = arg.indexOf("=");
    const flag = eq === -1 ? arg : arg.slice(0, eq);

    if (!VALUE_FLAGS.includes(flag)) {
      fail(`Unknown flag: ${flag}`);
      continue;
    }

    if (eq !== -1) {
      const value = arg.slice(eq + 1);
      if (!value) fail(`Missing value for ${flag}`);
      values[flag] = value || null;
      continue;
    }

    const value = rest[i + 1];
    if (value === undefined || value.startsWith("-")) {
      fail(`Missing value for ${flag}`);
      continue;
    }
    values[flag] = value;
    i++;
  }

  parsed.email = values["--email"];
  parsed.name = values["--name"];

  for (const flag of REQUIRED_FLAGS[parsed.command] || []) {
    if (!values[flag]) fail(`Missing required flag: ${flag}`);
  }

  // --help short-circuits validation so `create --help` prints usage instead
  parsed.error = parsed.help ? null : error;
  return parsed;
}
