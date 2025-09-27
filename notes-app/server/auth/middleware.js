/**
 * Authentication middleware for protecting API routes
 */

/**
 * Middleware to require authentication for protected routes
 * @param {Object} ctx - Oak context
 * @param {Function} next - Next middleware function
 */
export async function requireAuth(ctx, next) {
    const user = await ctx.state.session.get("user");

    if (!user) {
        ctx.response.status = 401;
        ctx.response.body = {
            error: "Authentication required",
            redirectTo: "/auth/login"
        };
        return;
    }

    // Add user to context for use in API handlers
    ctx.state.user = user;
    await next();
}

/**
 * Middleware to optionally add user info if authenticated
 * @param {Object} ctx - Oak context
 * @param {Function} next - Next middleware function
 */
export async function optionalAuth(ctx, next) {
    const user = await ctx.state.session.get("user");

    if (user) {
        ctx.state.user = user;
    }

    await next();
}

/**
 * Middleware to redirect authenticated users away from login pages
 * @param {Object} ctx - Oak context
 * @param {Function} next - Next middleware function
 */
export async function redirectIfAuthenticated(ctx, next) {
    const user = await ctx.state.session.get("user");

    if (user) {
        ctx.response.redirect("/");
        return;
    }

    await next();
}
