import type { RequestHandler } from "@sveltejs/kit";

import { logger } from "$lib/logger";
import { getUnsyncedTracksInLibrary } from "$lib/server/db/query-utils";
import { syncProgressManager } from "$lib/server/sync-progress";
import { processSyncTracks } from "$lib/server/sync-service";

export const POST: RequestHandler = async ({ request }) => {
  const { library }: { library: string } = await request.json();

  if (!library) {
    return new Response(JSON.stringify({ error: "Library parameter is required" }), { status: 400 });
  }

  try {
    // Check if there's already a sync in progress for this library
    const existingProgress = syncProgressManager.getProgressByLibrary(library);
    if (existingProgress) {
      return new Response(JSON.stringify({
        error: "A sync operation is already in progress for this library",
        progressId: existingProgress.id,
      }), { status: 409 });
    }

    // Get all unsynced tracks with artist and album info
    const unsyncedTracks = await getUnsyncedTracksInLibrary(library);
    const totalTracks = unsyncedTracks.length;

    if (totalTracks === 0) {
      return new Response(JSON.stringify({
        message: "No unsynced tracks found",
        summary: { totalTracks: 0, syncedTracks: 0, failedTracks: 0 },
      }));
    }

    // Create progress tracking
    const progressId = syncProgressManager.createProgress(library, totalTracks);
    syncProgressManager.updateProgress(progressId, { status: "running" });

    logger.info(`Starting bulk sync for ${totalTracks} tracks in library ${library} with progress ID: ${progressId}`);

    // Start the sync process asynchronously using the new sync service
    processSyncTracks(progressId, unsyncedTracks, library, { mode: "bulk" });

    return new Response(JSON.stringify({
      message: "Bulk sync started",
      progressId,
      totalTracks,
    }));
  }
  catch (error) {
    logger.error(`Error starting bulk sync for library ${library}:`, error);
    return new Response(JSON.stringify({ error: "Failed to start sync" }), { status: 500 });
  }
};
