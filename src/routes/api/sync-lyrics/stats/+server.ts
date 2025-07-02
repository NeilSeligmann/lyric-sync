import type { RequestHandler } from "@sveltejs/kit";

import { logger } from "$lib/logger";
import { getSyncStats } from "$lib/server/db/query-utils";

export const GET: RequestHandler = async ({ url }) => {
  const library = url.searchParams.get("library");

  if (!library) {
    return new Response(JSON.stringify({ error: "Library parameter is required" }), { status: 400 });
  }

  try {
    const stats = await getSyncStats(library);

    logger.info(`Retrieved sync stats for library ${library}:`, stats);

    return new Response(JSON.stringify({ stats }));
  }
  catch (error) {
    logger.error(`Error retrieving sync stats for library ${library}:`, error);
    return new Response(JSON.stringify({ error: "Failed to retrieve sync stats" }), { status: 500 });
  }
};
