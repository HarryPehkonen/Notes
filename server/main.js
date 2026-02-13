/**
 * Notes Application - Main Server
 * Integrates PostgreSQL and Google OAuth
 */

import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { Session } from "https://deno.land/x/oak_sessions@v4.1.9/mod.ts";
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
  sessionSecret: Deno.env.get("SESSION_SECRET"),
  googleClientId: Deno.env.get("GOOGLE_CLIENT_ID"),
  googleClientSecret: Deno.env.get("GOOGLE_CLIENT_SECRET"),
  googleRedirectUri: Deno.env.get("GOOGLE_REDIRECT_URI"),
};

// Validate required environment variables
const requiredEnvVars = [
  "SESSION_SECRET",
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
app.use(Session.initMiddleware(undefined, {
  cookieSetOptions: {
    httpOnly: true,
    secure: isProduction,
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

    // Create session
    await ctx.state.session.set("user", {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
    });

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

router.get("/login", redirectIfAuthenticated, (ctx) => {
  ctx.response.type = "text/html";
  ctx.response.body = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Notes App - Login</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 1rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .login-card {
            background: white;
            padding: 2rem;
            border-radius: 12px;
            /* Phase 2.3: Enhanced shadow for depth */
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            text-align: center;
            max-width: 400px;
            width: 100%;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        /* Phase 2.3: Subtle lift on hover */
        .login-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
        }
        /* Phase 2.2: Better mobile spacing */
        @media (max-width: 375px) {
            .login-card {
                padding: 1.5rem;
                margin: 1rem;
                max-width: calc(100% - 2rem);
            }
            h1 {
                font-size: 1.5rem;
            }
            p {
                font-size: 0.9rem;
            }
        }
        .login-btn {
            background: #4285f4;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 4px;
            text-decoration: none;
            display: inline-block;
            margin-top: 1rem;
            font-size: 16px;
            cursor: pointer;
            position: relative;
            transition: all 0.2s ease;
            min-width: 200px;
        }
        /* Phase 2.3: Enhanced hover effect */
        .login-btn:hover {
            background: #3367d6;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(66, 133, 244, 0.3);
        }
        .login-btn:active {
            transform: translateY(0);
            box-shadow: 0 2px 8px rgba(66, 133, 244, 0.2);
        }
        /* Phase 2.1: Loading state */
        .login-btn.loading {
            pointer-events: none;
            background: #93b4f7;
            padding-right: 48px;
        }
        .login-btn.loading::after {
            content: "";
            position: absolute;
            right: 16px;
            top: 50%;
            transform: translateY(-50%);
            width: 16px;
            height: 16px;
            border: 2px solid white;
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 0.6s linear infinite;
        }
        @keyframes spin {
            to { transform: translateY(-50%) rotate(360deg); }
        }
        /* Phase 2.1: Feedback message */
        .feedback-message {
            margin-top: 1rem;
            font-size: 0.9rem;
            color: #666;
            opacity: 0;
            transition: opacity 0.3s ease;
        }
        .feedback-message.show {
            opacity: 1;
        }
        h1 { color: #333; margin-bottom: 0.5rem; }
        p { color: #666; line-height: 1.5; }
    </style>
</head>
<body>
    <div class="login-card">
        <h1>※ Notes App</h1>
        <p>Secure, searchable notes with full-text search and offline support.</p>
        <a href="/auth/login" class="login-btn" id="loginBtn">Login with Google</a>
        <div class="feedback-message" id="feedbackMsg">Redirecting to Google...</div>
    </div>

    <script>
        // Phase 2.1: Add loading state on click
        document.getElementById('loginBtn').addEventListener('click', function(e) {
            this.classList.add('loading');
            this.textContent = 'Signing in...';
            document.getElementById('feedbackMsg').classList.add('show');
        });
    </script>
</body>
</html>`;
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
    ctx.response.headers.set("Cache-Control", `public, max-age=${maxAge}`);

    // ETag based on file size + content hash for stable cache validation
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
// Use schema-init.sql (production-safe with IF NOT EXISTS)
// Use schema.sql only for dev reset (drops all tables!)
try {
  const schemaFile = Deno.env.get("RESET_DATABASE") === "true"
    ? "./server/database/schema.sql"
    : "./server/database/schema-init.sql";
  console.log(`  Initializing database schema from ${schemaFile}...`);
  await db.initializeSchema(schemaFile);
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

// Graceful shutdown
const handleShutdown = async (signal) => {
  console.log(`\n  Received ${signal}, shutting down gracefully...`);
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
