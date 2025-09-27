/**
 * Notes Application - Main Server
 * Integrates PostgreSQL, Google OAuth, and Dropbox APIs
 */

import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { Session } from "https://deno.land/x/oak_sessions@v4.1.9/mod.ts";
import { DatabaseClient } from "./database/client.js";
import { GoogleAuthHandler } from "./auth/auth-handler.js";
import { requireAuth, optionalAuth, redirectIfAuthenticated } from "./auth/middleware.js";

// Import API routes
import { createNotesRouter } from "./api/notes.js";
import { createTagsRouter } from "./api/tags.js";
import { createSearchRouter } from "./api/search.js";
import { createBackupRouter } from "./api/backup.js";
import { createBackupScheduler } from "./services/backup-scheduler.js";

// Configuration
const config = {
    port: parseInt(Deno.env.get("PORT") || "8000"),
    host: Deno.env.get("HOST") || "localhost",
    sessionSecret: Deno.env.get("SESSION_SECRET") || "your-super-secret-session-key",
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
    "DB_PASSWORD"
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
    config.googleRedirectUri
);

const backupScheduler = createBackupScheduler(db);

// Initialize Oak application
const app = new Application();

// Session middleware
app.use(Session.initMiddleware());

// Error handling middleware
app.use(async (ctx, next) => {
    try {
        await next();
    } catch (err) {
        console.error("Server error:", err);
        ctx.response.status = 500;
        ctx.response.body = {
            error: "Internal server error",
            message: Deno.env.get("NODE_ENV") === "development" ? err.message : "Something went wrong"
        };
    }
});

// Logging middleware
app.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    console.log(`${ctx.request.method} ${ctx.request.url.pathname} - ${ctx.response.status} - ${ms}ms`);
});

// Make services available to all routes
app.use(async (ctx, next) => {
    ctx.state.db = db;
    ctx.state.authHandler = authHandler;
    await next();
});

// Routes
const router = new Router();

// Health check
router.get("/health", (ctx) => {
    ctx.response.body = {
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: "1.0.0"
    };
});

// Authentication routes
router.get("/auth/login", redirectIfAuthenticated, async (ctx) => {
    const authUrl = authHandler.getAuthorizationUrl();
    ctx.response.redirect(authUrl);
});

router.get("/auth/callback", async (ctx) => {
    const code = ctx.request.url.searchParams.get("code");
    const error = ctx.request.url.searchParams.get("error");

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
                picture: userInfo.picture
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
            picture: user.picture
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

router.get("/login", redirectIfAuthenticated, async (ctx) => {
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
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .login-card {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            text-align: center;
            max-width: 400px;
            width: 90%;
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
        }
        .login-btn:hover { background: #3367d6; }
        h1 { color: #333; margin-bottom: 0.5rem; }
        p { color: #666; }
    </style>
</head>
<body>
    <div class="login-card">
        <h1>※ Notes App</h1>
        <p>Secure, searchable, synchronized notes with automatic Dropbox backup.</p>
        <a href="/auth/login" class="login-btn">Login with Google</a>
    </div>
</body>
</html>`;
});

// Mount API routes
const notesRouter = createNotesRouter();
const tagsRouter = createTagsRouter();
const searchRouter = createSearchRouter();
const backupRouter = createBackupRouter();

router.use("/api/notes", requireAuth, notesRouter.routes(), notesRouter.allowedMethods());
router.use("/api/tags", requireAuth, tagsRouter.routes(), tagsRouter.allowedMethods());
router.use("/api/search", requireAuth, searchRouter.routes(), searchRouter.allowedMethods());
router.use("/api/backup", requireAuth, backupRouter.routes(), backupRouter.allowedMethods());

// Static file serving
router.get("/static/:path*", async (ctx) => {
    const filePath = ctx.params.path;
    try {
        const file = await Deno.readFile(`./public/${filePath}`);

        // Set content type based on extension
        const ext = filePath.split('.').pop()?.toLowerCase();
        const contentTypes = {
            'js': 'application/javascript',
            'css': 'text/css',
            'html': 'text/html',
            'json': 'application/json',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'svg': 'image/svg+xml'
        };

        ctx.response.type = contentTypes[ext] || 'application/octet-stream';
        ctx.response.body = file;
    } catch (error) {
        ctx.response.status = 404;
        ctx.response.body = "File not found";
    }
});

// Apply routes
app.use(router.routes());
app.use(router.allowedMethods());

// Initialize database schema on startup
try {
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

// Start backup scheduler
backupScheduler.start();

// Graceful shutdown
const handleShutdown = async (signal) => {
    console.log(`\n  Received ${signal}, shutting down gracefully...`);
    backupScheduler.stop();
    await db.close();
    Deno.exit(0);
};

// Handle shutdown signals
Deno.addSignalListener("SIGINT", () => handleShutdown("SIGINT"));
Deno.addSignalListener("SIGTERM", () => handleShutdown("SIGTERM"));

await app.listen({
    hostname: config.host,
    port: config.port
});
