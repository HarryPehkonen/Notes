/**
 * Notes Application - Main Server
 * Integrates PostgreSQL and Google OAuth
 */

import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { Session } from "https://deno.land/x/oak_sessions@v4.1.9/mod.ts";
import { PostgresSessionStore } from "./session-store.js";
import { DatabaseClient } from "./database/client.js";
import { GoogleAuthHandler } from "./auth/auth-handler.js";
import { optionalAuth, redirectIfAuthenticated, requireAuth } from "./auth/middleware.js";

// Import API routes
import { createNotesRouter } from "./api/notes.js";
import { createTagsRouter } from "./api/tags.js";
import { createSearchRouter } from "./api/search.js";
import { createImagesRouter } from "./api/images.js";

// Configuration
const config = {
  port: parseInt(Deno.env.get("PORT") || "8000"),
  host: Deno.env.get("HOST") || "localhost",
  googleClientId: Deno.env.get("GOOGLE_CLIENT_ID"),
  googleClientSecret: Deno.env.get("GOOGLE_CLIENT_SECRET"),
  googleRedirectUri: Deno.env.get("GOOGLE_REDIRECT_URI"),
};

// Validate required environment variables
const requiredEnvVars = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "DB_USER",
  "DB_NAME",
  "DB_PASSWORD",
];

for (const envVar of requiredEnvVars) {
  if (!Deno.env.get(envVar)) {
    console.error(`✗ Missing required environment variable: ${envVar}`);
    console.error("Please check your .env file and ensure all variables are set.");
    Deno.exit(1);
  }
}

// Initialize services
const db = new DatabaseClient({
  user: Deno.env.get("DB_USER"),
  database: Deno.env.get("DB_NAME"),
  hostname: Deno.env.get("DB_HOST") || "localhost",
  port: parseInt(Deno.env.get("DB_PORT") || "5432"),
  password: Deno.env.get("DB_PASSWORD"),
});

const authHandler = new GoogleAuthHandler(
  config.googleClientId,
  config.googleClientSecret,
  config.googleRedirectUri,
);

// Initialize Oak application
// proxy: true tells Oak to trust X-Forwarded-* headers from reverse proxy (Caddy)
const app = new Application({ proxy: true });

// Session middleware with secure cookies in production
// Note: With proxy=true, Oak checks X-Forwarded-Proto for HTTPS detection
const isProduction = Deno.env.get("NODE_ENV") === "production";
const sessionStore = new PostgresSessionStore(db.pool);
// Note: secure is set to false here because Caddy terminates TLS and forwards
// plain HTTP to Oak. Oak's SecureCookieMap rejects secure cookies over non-TLS
// connections even with proxy:true. Caddy's Strict-Transport-Security header
// ensures cookies are only sent over HTTPS by the browser.
app.use(Session.initMiddleware(sessionStore, {
  cookieSetOptions: {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
  },
}));

// Helper to get real client IP (respects X-Forwarded-For behind proxy)
function getClientIp(ctx) {
  // Oak with proxy=true handles this, but let's be explicit
  const forwarded = ctx.request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return ctx.request.ip;
}

// Rate limiting for auth endpoints
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 requests per minute

function rateLimit(ctx, key) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;

  // Get or create entry
  let entry = rateLimitMap.get(key);
  if (!entry) {
    entry = { requests: [], blocked: false };
    rateLimitMap.set(key, entry);
  }

  // Clean old requests
  entry.requests = entry.requests.filter((t) => t > windowStart);

  // Check limit
  if (entry.requests.length >= RATE_LIMIT_MAX) {
    ctx.response.status = 429;
    ctx.response.body = { error: "Too many requests. Please try again later." };
    return false;
  }

  entry.requests.push(now);
  return true;
}

// Clean up rate limit map periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  for (const [key, entry] of rateLimitMap) {
    entry.requests = entry.requests.filter((t) => t > windowStart);
    if (entry.requests.length === 0) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Error handling middleware
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error("Server error:", err);
    ctx.response.status = 500;
    ctx.response.body = {
      error: "Internal server error",
      message: Deno.env.get("NODE_ENV") === "development" ? err.message : "Something went wrong",
    };
  }
});

// Logging middleware
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(
    `${ctx.request.method} ${ctx.request.url.pathname} - ${ctx.response.status} - ${ms}ms`,
  );
});

// Make services available to all routes
app.use(async (ctx, next) => {
  ctx.state.db = db;
  ctx.state.authHandler = authHandler;
  await next();
});

// Dev/staging auth bypass - auto-login as specified user
// Useful for LAN testing where OAuth redirect URIs don't work
// Usage: DEV_USER_EMAIL=your@email.com deno task staging
const devUserEmail = Deno.env.get("DEV_USER_EMAIL");
if (devUserEmail && !isProduction) {
  console.log(`⚠ DEV_USER_EMAIL set - auto-authenticating as ${devUserEmail}`);
  app.use(async (ctx, next) => {
    const existingUser = await ctx.state.session.get("user");
    if (!existingUser) {
      // Find or create the dev user
      let user = await db.findUserByEmail(devUserEmail);
      if (!user) {
        user = await db.createUser({
          email: devUserEmail,
          name: "Dev User",
          picture: null,
        });
        console.log(`  Created dev user: ${devUserEmail}`);
      }
      await ctx.state.session.set("user", {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
      });
    }
    await next();
  });
}

// Routes
const router = new Router();

// Health check
router.get("/health", (ctx) => {
  ctx.response.body = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  };
});

// Authentication routes (rate limited)
router.get("/auth/login", redirectIfAuthenticated, async (ctx) => {
  const ip = getClientIp(ctx);
  if (!rateLimit(ctx, `auth:${ip}`)) return;

  // Generate CSRF state token and store in session
  const state = crypto.randomUUID();
  await ctx.state.session.set("oauth_state", state);

  const authUrl = authHandler.getAuthorizationUrl(state);
  ctx.response.redirect(authUrl);
});

router.get("/auth/callback", async (ctx) => {
  const ip = getClientIp(ctx);
  if (!rateLimit(ctx, `auth:${ip}`)) return;

  const code = ctx.request.url.searchParams.get("code");
  const error = ctx.request.url.searchParams.get("error");
  const state = ctx.request.url.searchParams.get("state");

  if (error) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Authentication failed", details: error };
    return;
  }

  if (!code) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Missing authorization code" };
    return;
  }

  // Validate CSRF state token
  const expectedState = await ctx.state.session.get("oauth_state");
  await ctx.state.session.set("oauth_state", null);
  if (!state || state !== expectedState) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid OAuth state - possible CSRF attack" };
    return;
  }

  try {
    // Exchange code for tokens and get user info
    const tokens = await authHandler.exchangeCodeForTokens(code);
    const userInfo = await authHandler.getUserInfo(tokens.access_token);

    // Find or create user in database
    let user = await db.findUserByEmail(userInfo.email);
    if (!user) {
      user = await db.createUser({
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
      });
    } else {
      // Update last login
      await db.updateLastLogin(user.id);
    }

    // Create session and rotate key to prevent session fixation
    await ctx.state.session.set("user", {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
    });
    ctx.state.rotate_session_key = true;

    ctx.response.redirect("/");
  } catch (error) {
    console.error("OAuth callback error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Authentication failed" };
  }
});

router.post("/auth/logout", async (ctx) => {
  await ctx.state.session.deleteSession();
  ctx.response.body = { success: true, redirectTo: "/" };
});

// Static file serving for frontend
router.get("/", optionalAuth, async (ctx) => {
  const user = await ctx.state.session.get("user");
  if (!user) {
    // Serve login page
    ctx.response.redirect("/login");
    return;
  }

  // Serve main app
  ctx.response.type = "text/html";
  ctx.response.body = await Deno.readTextFile("./public/index.html");
});

router.get("/login", redirectIfAuthenticated, async (ctx) => {
  ctx.response.type = "text/html";
  ctx.response.body = await Deno.readTextFile("./public/login.html");
});

// Mount API routes
const notesRouter = createNotesRouter();
const tagsRouter = createTagsRouter();
const searchRouter = createSearchRouter();
const imagesRouter = createImagesRouter();
router.use("/api/notes", requireAuth, notesRouter.routes(), notesRouter.allowedMethods());
router.use("/api/tags", requireAuth, tagsRouter.routes(), tagsRouter.allowedMethods());
router.use("/api/search", requireAuth, searchRouter.routes(), searchRouter.allowedMethods());
router.use("/api/images", requireAuth, imagesRouter.routes(), imagesRouter.allowedMethods());

// Static file serving
router.get("/static/:path*", async (ctx) => {
  const filePath = ctx.params.path;
  try {
    // Resolve to absolute path and verify it stays within ./public/
    const publicDir = await Deno.realPath("./public");
    const requestedPath = await Deno.realPath(`./public/${filePath}`);
    if (!requestedPath.startsWith(publicDir + "/") && requestedPath !== publicDir) {
      ctx.response.status = 403;
      ctx.response.body = "Forbidden";
      return;
    }

    const file = await Deno.readFile(requestedPath);

    // Set content type based on extension
    const ext = filePath.split(".").pop()?.toLowerCase();
    const contentTypes = {
      "js": "application/javascript",
      "css": "text/css",
      "html": "text/html",
      "json": "application/json",
      "png": "image/png",
      "jpg": "image/jpeg",
      "svg": "image/svg+xml",
    };

    ctx.response.type = contentTypes[ext] || "application/octet-stream";

    // Set caching headers for static assets
    // Cache for 1 hour in development, 1 day in production
    const maxAge = Deno.env.get("ENVIRONMENT") === "production" ? 86400 : 3600;
    // Service worker must always revalidate so the browser detects updates quickly.
    // ETag makes this cheap (304 Not Modified when unchanged).
    if (filePath === "sw.js") {
      ctx.response.headers.set("Cache-Control", "no-cache");
    } else {
      ctx.response.headers.set("Cache-Control", `public, max-age=${maxAge}`);
    }

    // ETag based on content hash for stable cache validation
    const hashBuffer = await crypto.subtle.digest("SHA-1", file);
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map((b) =>
      b.toString(16).padStart(2, "0")
    ).join("");
    ctx.response.headers.set("ETag", `"${hashHex}"`);

    // Set longer cache for assets that rarely change
    if (ext === "svg" || ext === "png" || ext === "jpg" || filePath.includes("favicon")) {
      ctx.response.headers.set("Cache-Control", `public, max-age=${maxAge * 24}`); // 24x longer cache
    }

    ctx.response.body = file;
  } catch (_error) {
    ctx.response.status = 404;
    ctx.response.body = "File not found";
  }
});

// Handle favicon.ico requests by redirecting to SVG favicon
router.get("/favicon.ico", (ctx) => {
  ctx.response.redirect("/static/favicon.svg");
});

// Apply routes
app.use(router.routes());
app.use(router.allowedMethods());

// Initialize database schema on startup
// Single schema file uses IF NOT EXISTS (safe to run repeatedly)
// RESET_DATABASE=true drops all tables first for a clean slate
try {
  if (Deno.env.get("RESET_DATABASE") === "true") {
    console.log("  RESET_DATABASE enabled — dropping all tables...");
    await db.query(`
      DROP TABLE IF EXISTS note_versions CASCADE;
      DROP TABLE IF EXISTS note_tags CASCADE;
      DROP TABLE IF EXISTS images CASCADE;
      DROP TABLE IF EXISTS tags CASCADE;
      DROP TABLE IF EXISTS notes CASCADE;
      DROP TABLE IF EXISTS auth_providers CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `);
  }
  console.log("  Initializing database schema...");
  await db.initializeSchema("./server/database/schema.sql");
  console.log("✓ Database schema initialized successfully");
} catch (error) {
  console.error("✗ Failed to initialize database:", error.message);
  console.error("Please check your database configuration and ensure PostgreSQL is running.");
  Deno.exit(1);
}

// Start server
console.log(`→ Notes App server starting on http://${config.host}:${config.port}`);
console.log(`  Environment: ${Deno.env.get("NODE_ENV") || "development"}`);
console.log(`   Database: ${Deno.env.get("DB_NAME")} on ${Deno.env.get("DB_HOST")}`);

// Periodic session cleanup (every hour, removes sessions older than 7 days)
const SESSION_CLEANUP_INTERVAL = 60 * 60 * 1000;
const sessionCleanupTimer = setInterval(async () => {
  try {
    const deleted = await sessionStore.deleteExpiredSessions(7);
    if (deleted > 0) {
      console.log(`  Cleaned up ${deleted} expired session(s)`);
    }
  } catch (error) {
    console.error("Session cleanup error:", error.message);
  }
}, SESSION_CLEANUP_INTERVAL);

// Graceful shutdown
const handleShutdown = async (signal) => {
  console.log(`\n  Received ${signal}, shutting down gracefully...`);
  clearInterval(sessionCleanupTimer);
  await db.close();
  Deno.exit(0);
};

// Handle shutdown signals
Deno.addSignalListener("SIGINT", () => handleShutdown("SIGINT"));
Deno.addSignalListener("SIGTERM", () => handleShutdown("SIGTERM"));

await app.listen({
  hostname: config.host,
  port: config.port,
});
