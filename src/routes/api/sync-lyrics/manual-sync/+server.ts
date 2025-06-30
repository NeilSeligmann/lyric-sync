import type { RequestHandler } from "@sveltejs/kit";

import { logger } from "$lib/logger";
import { syncProgressManager } from "$lib/server/sync-progress";
import { processSyncTracks } from "$lib/server/sync-service";

export const POST: RequestHandler = async ({ request }) => {
  const { library, mode }: { library: string; mode: "retry" | "new" | "comprehensive" } = await request.json();

  if (!library) {
    return new Response(JSON.stringify({ error: "Library parameter is required" }), { status: 400 });
  }

  if (!mode || !["retry", "new", "comprehensive"].includes(mode)) {
    return new Response(JSON.stringify({ error: "Mode parameter is required and must be 'retry', 'new', or 'comprehensive'" }), { status: 400 });
  }

  try {
    // Check if there's already a sync in progress for this library
    const existingProgress = syncProgressManager.getProgressByLibrary(library);
    if (existingProgress) {
      return new Response(JSON.stringify({ 
        error: "A sync operation is already in progress for this library",
        progressId: existingProgress.id 
      }), { status: 409 });
    }

    // Map mode to sync service mode
    const syncMode = mode === "retry" ? "manual" : mode === "new" ? "scheduled" : "comprehensive";

    logger.info(`Starting manual sync for library ${library} in mode ${mode} (${syncMode})`);

    // Start the sync process asynchronously
    processSyncTracks(null, [], library, { mode: syncMode });

    return new Response(JSON.stringify({ 
      message: `Manual sync started in ${mode} mode`,
      mode,
      library
    }));

  } catch (error) {
    logger.error(`Error starting manual sync for library ${library}:`, error);
    return new Response(JSON.stringify({ error: "Failed to start manual sync" }), { status: 500 });
  }
}; 