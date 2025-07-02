import type { RequestHandler } from "@sveltejs/kit";

import { logger } from "$lib/logger";
import { syncProgressManager } from "$lib/server/sync-progress";

export const GET: RequestHandler = async ({ url }) => {
  const library = url.searchParams.get("library");

  if (!library) {
    return new Response(JSON.stringify({ error: "Library parameter is required" }), { status: 400 });
  }

  try {
    // Clean up old progress entries
    syncProgressManager.cleanupOldProgress();

    // Get current progress for this library
    const progress = syncProgressManager.getProgressByLibrary(library);

    if (!progress) {
      return new Response(JSON.stringify({ progress: null }));
    }

    return new Response(JSON.stringify({ progress }));
  }
  catch (error) {
    logger.error(`Error retrieving sync progress for library ${library}:`, error);
    return new Response(JSON.stringify({ error: "Failed to retrieve sync progress" }), { status: 500 });
  }
};
