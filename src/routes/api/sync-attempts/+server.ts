import type { RequestHandler } from "@sveltejs/kit";

import { logger } from "$lib/logger";
import { libraries, syncAttempts } from "$lib/schema";
import db from "$lib/server/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";

interface SyncAttemptsQuery {
  page: number;
  limit: number;
  status?: "pending" | "running" | "completed" | "failed";
  sync_type?: "bulk" | "individual" | "retry" | "check_existing" | "scheduled" | "comprehensive";
  library_id?: string;
  start_date?: string; // ISO date string
  end_date?: string; // ISO date string
  order_by: "start_time" | "end_time" | "total_tracks" | "synced_tracks";
  order_direction: "asc" | "desc";
}

export const GET: RequestHandler = async ({ url }) => {
  try {
    // Parse query parameters
    const query: SyncAttemptsQuery = {
      page: Number.parseInt(url.searchParams.get("page") || "1"),
      limit: Math.min(Number.parseInt(url.searchParams.get("limit") || "20"), 100), // Max 100 per page
      status: url.searchParams.get("status") as any,
      sync_type: url.searchParams.get("sync_type") as any,
      library_id: url.searchParams.get("library_id") || undefined,
      start_date: url.searchParams.get("start_date") || undefined,
      end_date: url.searchParams.get("end_date") || undefined,
      order_by: (url.searchParams.get("order_by") as any) || "start_time",
      order_direction: (url.searchParams.get("order_direction") as any) || "desc",
    };

    // Validate status if provided
    if (query.status && !["pending", "running", "completed", "failed"].includes(query.status)) {
      return new Response(JSON.stringify({ error: "Invalid status parameter" }), { status: 400 });
    }

    // Validate sync_type if provided
    if (query.sync_type && !["bulk", "individual", "retry", "check_existing", "scheduled", "comprehensive"].includes(query.sync_type)) {
      return new Response(JSON.stringify({ error: "Invalid sync_type parameter" }), { status: 400 });
    }

    // Validate order_by if provided
    if (!["start_time", "end_time", "total_tracks", "synced_tracks"].includes(query.order_by)) {
      return new Response(JSON.stringify({ error: "Invalid order_by parameter" }), { status: 400 });
    }

    // Validate order_direction if provided
    if (!["asc", "desc"].includes(query.order_direction)) {
      return new Response(JSON.stringify({ error: "Invalid order_direction parameter" }), { status: 400 });
    }

    // Build where conditions
    const whereConditions = [];

    if (query.status) {
      whereConditions.push(eq(syncAttempts.status, query.status));
    }

    if (query.sync_type) {
      whereConditions.push(eq(syncAttempts.sync_type, query.sync_type));
    }

    if (query.library_id) {
      whereConditions.push(eq(syncAttempts.library_id, query.library_id));
    }

    if (query.start_date) {
      const startTimestamp = new Date(query.start_date).getTime();
      whereConditions.push(sql`${syncAttempts.start_time} >= ${startTimestamp}`);
    }

    if (query.end_date) {
      const endTimestamp = new Date(query.end_date).getTime();
      whereConditions.push(sql`${syncAttempts.start_time} <= ${endTimestamp}`);
    }

    // Build order by clause
    let orderByClause;
    switch (query.order_by) {
      case "start_time":
        orderByClause = query.order_direction === "asc" ? asc(syncAttempts.start_time) : desc(syncAttempts.start_time);
        break;
      case "end_time":
        orderByClause = query.order_direction === "asc" ? asc(syncAttempts.end_time) : desc(syncAttempts.end_time);
        break;
      case "total_tracks":
        orderByClause = query.order_direction === "asc" ? asc(syncAttempts.total_tracks) : desc(syncAttempts.total_tracks);
        break;
      case "synced_tracks":
        orderByClause = query.order_direction === "asc" ? asc(syncAttempts.synced_tracks) : desc(syncAttempts.synced_tracks);
        break;
      default:
        orderByClause = desc(syncAttempts.start_time);
    }

    // Calculate offset
    const offset = (query.page - 1) * query.limit;

    // Get total count for pagination
    const countResult = await db.select({ count: sql<number>`count(*)` })
      .from(syncAttempts)
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

    const totalCount = countResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / query.limit);

    // Get sync attempts with library info
    const attempts = await db.select({
      id: syncAttempts.id,
      library_id: syncAttempts.library_id,
      library_title: libraries.title,
      start_time: syncAttempts.start_time,
      end_time: syncAttempts.end_time,
      status: syncAttempts.status,
      sync_type: syncAttempts.sync_type,
      total_tracks: syncAttempts.total_tracks,
      processed_tracks: syncAttempts.processed_tracks,
      synced_tracks: syncAttempts.synced_tracks,
      failed_tracks: syncAttempts.failed_tracks,
      results_json: syncAttempts.results_json,
    })
      .from(syncAttempts)
      .leftJoin(libraries, eq(syncAttempts.library_id, libraries.uuid))
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(orderByClause)
      .limit(query.limit)
      .offset(offset);

    // Calculate success rate and duration for each attempt
    const attemptsWithStats = attempts.map((attempt) => {
      const successRate = attempt.total_tracks > 0
        ? Math.round((attempt.synced_tracks / attempt.total_tracks) * 100)
        : 0;

      const duration = attempt.end_time && attempt.start_time
        ? (attempt.end_time.getTime() - attempt.start_time.getTime())
        : null;

      return {
        ...attempt,
        success_rate: successRate,
        duration_ms: duration,
        duration_formatted: duration ? formatDuration(duration) : null,
        start_time_formatted: new Date(attempt.start_time).toISOString(),
        end_time_formatted: attempt.end_time ? new Date(attempt.end_time).toISOString() : null,
      };
    });

    return new Response(JSON.stringify({
      attempts: attemptsWithStats,
      pagination: {
        page: query.page,
        limit: query.limit,
        total_count: totalCount,
        total_pages: totalPages,
        has_next: query.page < totalPages,
        has_prev: query.page > 1,
      },
      filters: {
        status: query.status,
        sync_type: query.sync_type,
        library_id: query.library_id,
        start_date: query.start_date,
        end_date: query.end_date,
        order_by: query.order_by,
        order_direction: query.order_direction,
      },
    }));
  }
  catch (error) {
    logger.error("Error fetching sync attempts:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch sync attempts" }), { status: 500 });
  }
};

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  else {
    return `${seconds}s`;
  }
}
