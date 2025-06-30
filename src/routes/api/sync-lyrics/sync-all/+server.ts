import type { RequestHandler } from "@sveltejs/kit";
import type { LRCResponse, SyncTrackResponse } from "$lib/types";

import { LrcLibApi } from "$lib/external-links";
import { logger } from "$lib/logger";
import { getUnsyncedTracksInLibrary, markTrackAsSynced } from "$lib/server/db/query-utils";
import { syncProgressManager } from "$lib/server/sync-progress";
import fs from "node:fs/promises";
import path from "node:path";

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
        progressId: existingProgress.id 
      }), { status: 409 });
    }

    // Get all unsynced tracks with artist and album info
    const unsyncedTracks = await getUnsyncedTracksInLibrary(library);
    const totalTracks = unsyncedTracks.length;

    if (totalTracks === 0) {
      return new Response(JSON.stringify({ 
        message: "No unsynced tracks found",
        summary: { totalTracks: 0, syncedTracks: 0, failedTracks: 0 }
      }));
    }

    // Create progress tracking
    const progressId = syncProgressManager.createProgress(library, totalTracks);
    syncProgressManager.updateProgress(progressId, { status: 'running' });

    logger.info(`Starting bulk sync for ${totalTracks} tracks in library ${library} with progress ID: ${progressId}`);

    // Start the sync process asynchronously
    processSyncTracks(progressId, unsyncedTracks, library);

    return new Response(JSON.stringify({ 
      message: "Bulk sync started",
      progressId,
      totalTracks
    }));

  } catch (error) {
    logger.error(`Error starting bulk sync for library ${library}:`, error);
    return new Response(JSON.stringify({ error: "Failed to start sync" }), { status: 500 });
  }
};

async function processSyncTracks(progressId: string, unsyncedTracks: any[], library: string): Promise<void> {
  try {
    for (const trackData of unsyncedTracks) {
      const syncTrackResponse: SyncTrackResponse = {
        synced: false,
        plainLyrics: true,
        message: "",
      };

      try {
        // Build the LRC API URL using the artist and album info
        const lrcGetUrl: string = `${LrcLibApi}artist_name=${encodeURIComponent(trackData.artistInfo.title)}&track_name=${encodeURIComponent(trackData.title)}&album_name=${encodeURIComponent(trackData.albumInfo.title)}&duration=${trackData.duration / 1000}`;

        logger.info(`Searching for lyrics: ${lrcGetUrl}`);

        const lyricResponse: Response = await fetch(lrcGetUrl);

        if (lyricResponse.ok) {
          const lyricResponseJson: LRCResponse = await lyricResponse.json();
          
          if (lyricResponseJson.syncedLyrics) {
            // Write synced lyrics to LRC file
            const lrcPath: string = `${path.dirname(trackData.path)}/${path.parse(trackData.path).name}.lrc`;

            await fs.writeFile(lrcPath, lyricResponseJson.syncedLyrics);
            syncTrackResponse.synced = true;
            syncTrackResponse.plainLyrics = false;
            markTrackAsSynced(trackData.uuid, library);
            syncTrackResponse.message = `LRC lyrics grabbed for ${trackData.title}`;
          } else if (lyricResponseJson.plainLyrics) {
            // Write plain lyrics to TXT file
            const txtPath: string = `${path.dirname(trackData.path)}/${path.parse(trackData.path).name}.txt`;
            
            await fs.writeFile(txtPath, lyricResponseJson.plainLyrics);
            syncTrackResponse.synced = true;
            syncTrackResponse.plainLyrics = true;
            markTrackAsSynced(trackData.uuid, library);
            syncTrackResponse.message = `TXT lyrics grabbed for ${trackData.title}`;
          } else {
            syncTrackResponse.message = `${trackData.title} has an entry in the lrclib api but no lyrics`;
          }
        } else {
          syncTrackResponse.message = `No lyrics found for ${trackData.title}`;
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          syncTrackResponse.message = error.message;
          syncTrackResponse.stack = error.stack;
        }
      }

      // Update progress
      syncProgressManager.incrementProcessed(progressId, syncTrackResponse, trackData.title, trackData.artistInfo.title);
    }

    // Mark as completed
    syncProgressManager.completeProgress(progressId, 'completed');
    
    const progress = syncProgressManager.getProgress(progressId);
    logger.info(`Bulk sync completed. Progress ID: ${progressId}, Synced: ${progress?.syncedTracks}, Failed: ${progress?.failedTracks}, Total: ${progress?.totalTracks}`);

  } catch (error) {
    logger.error(`Error during bulk sync. Progress ID: ${progressId}:`, error);
    syncProgressManager.completeProgress(progressId, 'failed');
  }
} 