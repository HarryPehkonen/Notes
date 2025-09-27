/**
 * Google OAuth Proof-of-Concept Server
 * Minimal OAuth implementation using Oak and native fetch
 */

import { Application, Router, send } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { GoogleAuthHandler } from "./auth-handler.js";

// Simple in-memory session store (for POC only)
const sessions = new Map();

/**
 * @typedef {Object} Session
 * @property {string} id
 * @property {Object} user
 * @property {Date} createdAt
 */

// Initialize OAuth handler
const auth = new GoogleAuthHandler(
    Deno.env.get("GOOGLE_CLIENT_ID") || "",
    Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
    Deno.env.get("GOOGLE_REDIRECT_URI") || "http://localhost:8000/auth/callback"
);

// Create Oak application
const app = new Application();
const router = new Router();

// Middleware for logging
app.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    console.log(`${ctx.request.method} ${ctx.request.url.pathname} - ${ms}ms`);
});

// Routes
router.get("/", async (ctx) => {
    // Check if user is logged in
    const sessionId = await ctx.cookies.get("session");
    const session = sessions.get(sessionId);

    if (session) {
        // Redirect to dashboard if logged in
        ctx.response.redirect("/dashboard");
    } else {
        // Serve login page
        await send(ctx, "index.html", {
            root: `${Deno.cwd()}/public`,
        });
    }
});

router.get("/dashboard", async (ctx) => {
    const sessionId = await ctx.cookies.get("session");
    const session = sessions.get(sessionId);

    if (!session) {
        ctx.response.redirect("/");
        return;
    }

    // Serve dashboard with user info injected
    const dashboardHtml = await Deno.readTextFile("./public/dashboard.html");
    const htmlWithUser = dashboardHtml.replace(
        "<!-- USER_DATA -->",
        `<script>window.userData = ${JSON.stringify(session.user)};</script>`
    );

    ctx.response.body = htmlWithUser;
    ctx.response.type = "text/html";
});

router.get("/auth/google", (ctx) => {
    // Redirect to Google OAuth
    const authUrl = auth.getAuthorizationUrl();
    console.log("Redirecting to Google OAuth:", authUrl);
    ctx.response.redirect(authUrl);
});

router.get("/auth/callback", async (ctx) => {
    try {
        // Get authorization code from query params
        const code = ctx.request.url.searchParams.get("code");
        const error = ctx.request.url.searchParams.get("error");

        if (error) {
            console.error("OAuth error:", error);
            ctx.response.body = `Authentication error: ${error}`;
            return;
        }

        if (!code) {
            ctx.response.status = 400;
            ctx.response.body = "No authorization code received";
            return;
        }

        console.log("Received auth code:", code.substring(0, 10) + "...");

        // Exchange code for tokens
        const tokens = await auth.exchangeCodeForTokens(code);
        console.log("Got tokens!");

        // Get user info
        const userInfo = await auth.getUserInfo(tokens.access_token);
        console.log("User info:", userInfo);

        // Create session
        const sessionId = crypto.randomUUID();
        sessions.set(sessionId, {
            id: sessionId,
            user: userInfo,
            createdAt: new Date(),
            tokens: tokens // Store tokens for future API calls
        });

        // Set session cookie
        await ctx.cookies.set("session", sessionId, {
            httpOnly: true,
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        // Redirect to dashboard
        ctx.response.redirect("/dashboard");

    } catch (error) {
        console.error("Callback error:", error);
        ctx.response.status = 500;
        ctx.response.body = `Authentication failed: ${error.message}`;
    }
});

router.get("/auth/logout", async (ctx) => {
    // Clear session
    const sessionId = await ctx.cookies.get("session");
    if (sessionId) {
        sessions.delete(sessionId);
    }

    // Clear cookie
    await ctx.cookies.delete("session");

    // Redirect to home
    ctx.response.redirect("/");
});

router.get("/api/user", async (ctx) => {
    const sessionId = await ctx.cookies.get("session");
    const session = sessions.get(sessionId);

    if (!session) {
        ctx.response.status = 401;
        ctx.response.body = { error: "Not authenticated" };
        return;
    }

    ctx.response.body = session.user;
});

// Serve static files
router.get("/(.*)", async (ctx) => {
    await send(ctx, ctx.request.url.pathname, {
        root: `${Deno.cwd()}/public`,
    });
});

// Apply routes
app.use(router.routes());
app.use(router.allowedMethods());

// Start server
const port = parseInt(Deno.env.get("PORT") || "8000");
console.log(`🚀 OAuth server starting on http://localhost:${port}`);
console.log(`📝 Make sure you have set the following environment variables:`);
console.log(`   - GOOGLE_CLIENT_ID`);
console.log(`   - GOOGLE_CLIENT_SECRET`);
console.log(`   - GOOGLE_REDIRECT_URI (default: http://localhost:8000/auth/callback)`);
console.log(`\n🔑 Login at: http://localhost:${port}`);

await app.listen({ port });