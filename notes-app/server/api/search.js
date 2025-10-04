/**
 * Search API Routes
 * Handles full-text search operations
 */

import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";

export function createSearchRouter() {
    const router = new Router();

    // GET /api/search - Perform full-text search on notes
    router.get("/", async (ctx) => {
        const { user, db } = ctx.state;
        const q = ctx.request.url.searchParams.get('q');
        const limit = ctx.request.url.searchParams.get('limit') || 20;
        const offset = ctx.request.url.searchParams.get('offset') || 0;

        if (!q || q.trim().length === 0) {
            ctx.response.status = 400;
            ctx.response.body = {
                success: false,
                error: "Search query (q) is required"
            };
            return;
        }

        const query = q.trim();

        // Minimum query length to prevent too broad searches
        if (query.length < 1) {
            ctx.response.status = 400;
            ctx.response.body = {
                success: false,
                error: "Search query must be at least 1 character long"
            };
            return;
        }

        try {
            const searchLimit = Math.min(parseInt(limit), 100); // Cap at 100 results
            const searchOffset = parseInt(offset);

            let results;

            // Check if this is a tag search (starts with #)
            if (query.startsWith('#')) {
                const tagName = query.substring(1).toLowerCase(); // Remove the # prefix

                // First, get the tag ID for this tag name
                const tagResult = await db.query(
                    `SELECT id FROM tags WHERE user_id = $1 AND name = $2`,
                    [user.id, tagName]
                );

                if (tagResult.rows.length > 0) {
                    const tagId = tagResult.rows[0].id;
                    results = await db.getNotes(user.id, {
                        tags: [tagId],
                        limit: searchLimit,
                        offset: searchOffset
                    });
                } else {
                    // Tag doesn't exist, return empty results
                    results = [];
                }
            } else {
                results = await db.searchNotes(user.id, query, searchLimit);
            }

            // Calculate if there are more results
            const hasMore = results.length === searchLimit;

            ctx.response.body = {
                success: true,
                data: {
                    query: query,
                    results: results,
                    meta: {
                        total: results.length,
                        limit: searchLimit,
                        offset: searchOffset,
                        hasMore: hasMore
                    }
                }
            };
        } catch (error) {
            console.error("Error performing search:", error);
            ctx.response.status = 500;
            ctx.response.body = {
                success: false,
                error: "Search failed"
            };
        }
    });

    // GET /api/search/suggestions - Get search suggestions based on existing content
    router.get("/suggestions", async (ctx) => {
        const { user, db } = ctx.state;
        const q = ctx.request.url.searchParams.get('q') || "";
        const limit = ctx.request.url.searchParams.get('limit') || 10;

        try {
            const suggestions = [];

            // Get tag suggestions if query is provided
            if (q.trim().length > 0) {
                const tagResults = await db.query(`
                    SELECT DISTINCT name, color
                    FROM tags
                    WHERE user_id = $1
                      AND name ILIKE $2
                    ORDER BY name
                    LIMIT $3
                `, [user.id, `%${q.trim()}%`, Math.min(parseInt(limit), 20)]);

                for (const tag of tagResults.rows) {
                    suggestions.push({
                        type: 'tag',
                        text: tag.name,
                        color: tag.color,
                        display: `#${tag.name}`
                    });
                }
            }

            // Get recent search terms from note titles and content
            const recentResults = await db.query(`
                SELECT DISTINCT title, updated_at
                FROM notes
                WHERE user_id = $1
                  AND NOT is_archived
                  AND ($2 = '' OR title ILIKE $3)
                ORDER BY updated_at DESC
                LIMIT $4
            `, [user.id, q.trim(), `%${q.trim()}%`, Math.min(parseInt(limit), 10)]);

            for (const note of recentResults.rows) {
                const words = note.title.split(/\s+/).filter(word =>
                    word.length > 2 &&
                    word.toLowerCase().includes(q.toLowerCase())
                );

                for (const word of words.slice(0, 3)) { // Limit to 3 words per title
                    if (!suggestions.some(s => s.text === word)) {
                        suggestions.push({
                            type: 'term',
                            text: word,
                            display: word
                        });
                    }
                }
            }

            ctx.response.body = {
                success: true,
                data: {
                    query: q.trim(),
                    suggestions: suggestions.slice(0, parseInt(limit))
                }
            };
        } catch (error) {
            console.error("Error getting search suggestions:", error);
            ctx.response.status = 500;
            ctx.response.body = {
                success: false,
                error: "Failed to get search suggestions"
            };
        }
    });

    // GET /api/search/recent - Get recent search activity and popular terms
    router.get("/recent", async (ctx) => {
        const { user, db } = ctx.state;
        const limit = ctx.request.url.searchParams.get('limit') || 10;

        try {
            // Get recently modified notes
            const recentNotes = await db.query(`
                SELECT id, title, updated_at,
                       ARRAY(
                           SELECT t.name
                           FROM tags t
                           JOIN note_tags nt ON t.id = nt.tag_id
                           WHERE nt.note_id = n.id
                       ) as tags
                FROM notes n
                WHERE user_id = $1 AND NOT is_archived
                ORDER BY updated_at DESC
                LIMIT $2
            `, [user.id, Math.min(parseInt(limit), 20)]);

            // Get most used tags
            const popularTags = await db.query(`
                SELECT t.name, t.color, COUNT(nt.note_id) as usage_count
                FROM tags t
                LEFT JOIN note_tags nt ON t.id = nt.tag_id
                WHERE t.user_id = $1
                GROUP BY t.id, t.name, t.color
                HAVING COUNT(nt.note_id) > 0
                ORDER BY usage_count DESC, t.name
                LIMIT $2
            `, [user.id, Math.min(parseInt(limit), 10)]);

            ctx.response.body = {
                success: true,
                data: {
                    recentNotes: recentNotes.rows,
                    popularTags: popularTags.rows
                }
            };
        } catch (error) {
            console.error("Error getting recent search data:", error);
            ctx.response.status = 500;
            ctx.response.body = {
                success: false,
                error: "Failed to get recent search data"
            };
        }
    });

    // POST /api/search/advanced - Advanced search with multiple criteria
    router.post("/advanced", async (ctx) => {
        const { user, db } = ctx.state;

        if (!ctx.request.hasBody) {
            ctx.response.status = 400;
            ctx.response.body = {
                success: false,
                error: "Request body is required"
            };
            return;
        }

        try {
            const body = await ctx.request.body({ type: "json" }).value;
            const {
                query = "",
                tags = [],
                dateFrom,
                dateTo,
                isPinned,
                limit = 20,
                offset = 0
            } = body;

            // Build advanced search query
            let searchQuery = `
                SELECT n.*,
                       ARRAY(
                           SELECT t.name
                           FROM tags t
                           JOIN note_tags nt ON t.id = nt.tag_id
                           WHERE nt.note_id = n.id
                       ) as tags,
                       ${query.trim() ?
                         `ts_rank(n.search_vector, plainto_tsquery('english', $${2})) as rank` :
                         '1 as rank'
                       }
                FROM notes n
                WHERE n.user_id = $1 AND NOT n.is_archived
            `;

            const params = [user.id];
            let paramIndex = 2;

            // Add text search condition
            if (query.trim()) {
                searchQuery += ` AND n.search_vector @@ plainto_tsquery('english', $${paramIndex})`;
                params.push(query.trim());
                paramIndex++;
            }

            // Add tag filtering
            if (tags.length > 0) {
                searchQuery += ` AND n.id IN (
                    SELECT DISTINCT nt.note_id
                    FROM note_tags nt
                    JOIN tags t ON t.id = nt.tag_id
                    WHERE t.name = ANY($${paramIndex}) AND t.user_id = $1
                )`;
                params.push(tags);
                paramIndex++;
            }

            // Add date filtering
            if (dateFrom) {
                searchQuery += ` AND n.created_at >= $${paramIndex}`;
                params.push(new Date(dateFrom));
                paramIndex++;
            }

            if (dateTo) {
                searchQuery += ` AND n.created_at <= $${paramIndex}`;
                params.push(new Date(dateTo));
                paramIndex++;
            }

            // Add pinned filtering
            if (isPinned !== undefined) {
                searchQuery += ` AND n.is_pinned = $${paramIndex}`;
                params.push(Boolean(isPinned));
                paramIndex++;
            }

            // Add ordering and limits
            searchQuery += ` ORDER BY rank DESC, n.updated_at DESC`;
            searchQuery += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            params.push(Math.min(parseInt(limit), 100), parseInt(offset));

            const results = await db.query(searchQuery, params);

            ctx.response.body = {
                success: true,
                data: {
                    criteria: {
                        query: query.trim(),
                        tags,
                        dateFrom,
                        dateTo,
                        isPinned
                    },
                    results: results.rows,
                    meta: {
                        total: results.rows.length,
                        limit: Math.min(parseInt(limit), 100),
                        offset: parseInt(offset),
                        hasMore: results.rows.length === Math.min(parseInt(limit), 100)
                    }
                }
            };
        } catch (error) {
            console.error("Error performing advanced search:", error);
            ctx.response.status = 500;
            ctx.response.body = {
                success: false,
                error: "Advanced search failed"
            };
        }
    });

    return router;
}
