import type { LRCResponse, SyncTrackResponse } from "$lib/types";

import { LrcLibApi } from "$lib/external-links";
import { logger } from "$lib/logger";
import { 
  getUnsyncedTracksInLibrary, 
  getFailedTracksReadyForRetry, 
  getNewTracksForSync,
  markTrackAsSyncedWithDetails 
} from "$lib/server/db/query-utils";
import { syncProgressManager } from "$lib/server/sync-progress";
import fs from "node:fs/promises";
import path from "node:path";

interface SyncOptions {
  mode: "manual" | "scheduled" | "comprehensive" | "bulk";
}

export async function processSyncTracks(
  progressId: string | null, 
  unsyncedTracks: any[], 
  library: string, 
  options: SyncOptions = { mode: "bulk" }
): Promise<void> {
  try {
    let tracksToProcess: any[] = [];

    // Determine which tracks to process based on mode
    switch (options.mode) {
      case "scheduled":
        // In scheduled mode, only process failed tracks ready for retry and new tracks
        const failedTracks = await getFailedTracksReadyForRetry(library);
        const newTracks = await getNewTracksForSync(library);
        tracksToProcess = [...failedTracks, ...newTracks];
        break;
      
      case "comprehensive":
        // In comprehensive mode, process all unsynced tracks
        tracksToProcess = await getUnsyncedTracksInLibrary(library);
        break;
      
      case "manual":
        // In manual mode, process failed tracks ready for retry
        tracksToProcess = await getFailedTracksReadyForRetry(library);
        break;
      
      case "bulk":
      default:
        // In bulk mode, use the provided tracks
        tracksToProcess = unsyncedTracks;
        break;
    }

    if (tracksToProcess.length === 0) {
      logger.info(`No tracks to process for library ${library} in mode ${options.mode}`);
      if (progressId) {
        syncProgressManager.completeProgress(progressId, 'completed');
      }
      return;
    }

    logger.info(`Processing ${tracksToProcess.length} tracks for library ${library} in mode ${options.mode}`);

    // Create progress tracking if not provided
    if (!progressId) {
      progressId = syncProgressManager.createProgress(library, tracksToProcess.length);
      syncProgressManager.updateProgress(progressId, { status: 'running' });
    }

    let processedCount = 0;
    let errorCount = 0;

    for (const trackData of tracksToProcess) {
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
            await markTrackAsSyncedWithDetails(trackData.uuid, library, true);
            syncTrackResponse.message = `LRC lyrics grabbed for ${trackData.title}`;
          } else if (lyricResponseJson.plainLyrics) {
            // Write plain lyrics to TXT file
            const txtPath: string = `${path.dirname(trackData.path)}/${path.parse(trackData.path).name}.txt`;
            
            await fs.writeFile(txtPath, lyricResponseJson.plainLyrics);
            syncTrackResponse.synced = true;
            syncTrackResponse.plainLyrics = true;
            await markTrackAsSyncedWithDetails(trackData.uuid, library, true);
            syncTrackResponse.message = `TXT lyrics grabbed for ${trackData.title}`;
          } else {
            syncTrackResponse.message = `${trackData.title} has an entry in the lrclib api but no lyrics`;
            await markTrackAsSyncedWithDetails(trackData.uuid, library, false, syncTrackResponse.message);
          }
        } else {
          syncTrackResponse.message = `No lyrics found for ${trackData.title}`;
          await markTrackAsSyncedWithDetails(trackData.uuid, library, false, syncTrackResponse.message);
        }
      } catch (error: unknown) {
        errorCount++;
        if (error instanceof Error) {
          syncTrackResponse.message = error.message;
          syncTrackResponse.stack = error.stack;
          logger.error(`Error processing track ${trackData.title}: ${error.message}`);
        } else {
          syncTrackResponse.message = 'Unknown error occurred';
          logger.error(`Unknown error processing track ${trackData.title}:`, error);
        }
        await markTrackAsSyncedWithDetails(trackData.uuid, library, false, syncTrackResponse.message);
      }

      processedCount++;

      // Update progress if we have a progress ID
      if (progressId) {
        syncProgressManager.incrementProcessed(progressId, syncTrackResponse, trackData.title, trackData.artistInfo.title);
      }
    }

    // Mark as completed
    if (progressId) {
      syncProgressManager.completeProgress(progressId, 'completed');
      
      const progress = syncProgressManager.getProgress(progressId);
      logger.info(`Sync completed. Progress ID: ${progressId}, Synced: ${progress?.syncedTracks}, Failed: ${progress?.failedTracks}, Total: ${progress?.totalTracks}`);
    }

    // Log summary
    logger.info(`Sync process finished for library ${library}. Processed: ${processedCount}, Errors: ${errorCount}`);

  } catch (error) {
    logger.error(`Critical error during sync process for library ${library}:`);
    logger.error(error);
    if (progressId) {
      syncProgressManager.completeProgress(progressId, 'failed');
    }

    // Re-throw the error to let the caller handle it
    throw error;
  }
} 