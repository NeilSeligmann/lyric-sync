import type { SyncTrackResponse } from "$lib/types";

import { logger } from "$lib/logger";
import { 
  getUnsyncedTracksInLibrary, 
  getFailedTracksReadyForRetry, 
  getNewTracksForSync,
  markTrackAsSyncedWithDetails 
} from "$lib/server/db/query-utils";
import { processLyrics } from "$lib/server/lyrics-search";
import { syncProgressManager } from "$lib/server/sync-progress";
import env from "$lib/server/env";

interface SyncOptions {
  mode: "manual" | "scheduled" | "comprehensive" | "bulk";
  maxConcurrency?: number;
}

export async function processSyncTracks(
  progressId: string | null, 
  unsyncedTracks: any[], 
  library: string, 
  options: SyncOptions = { mode: "bulk", maxConcurrency: env.SYNC_CONCURRENCY }
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

    logger.info(`Processing ${tracksToProcess.length} tracks for library ${library} in mode ${options.mode} with max concurrency: ${options.maxConcurrency || env.SYNC_CONCURRENCY}`);

    // Create progress tracking if not provided
    if (!progressId) {
      const maxConcurrency = options.maxConcurrency || env.SYNC_CONCURRENCY;
      progressId = syncProgressManager.createProgress(library, tracksToProcess.length, maxConcurrency);
      syncProgressManager.updateProgress(progressId, { status: 'running' });
    }

    const maxConcurrency = options.maxConcurrency || env.SYNC_CONCURRENCY;
    let processedCount = 0;
    let errorCount = 0;

    // Process tracks in batches with controlled concurrency using Promise.allSettled
    for (let i = 0; i < tracksToProcess.length; i += maxConcurrency) {
      const batch = tracksToProcess.slice(i, i + maxConcurrency);
      const batchNumber = Math.floor(i / maxConcurrency) + 1;
      
      // Start tracking this batch
      if (progressId) {
        syncProgressManager.startBatch(progressId, batchNumber, batch);
      }
      
      // Process batch in parallel using Promise.allSettled
      const batchPromises = batch.map(async (trackData) => {
        try {
          // Validate track data
          if (!trackData.title || !trackData.uuid || !trackData.artistInfo?.title || !trackData.albumInfo?.title || !trackData.duration || isNaN(trackData.duration) || !isFinite(trackData.duration)) {
            const errorMsg = `Invalid track data: title=${trackData.title}, uuid=${trackData.uuid}, artist=${trackData.artistInfo?.title}, album=${trackData.albumInfo?.title}, duration=${trackData.duration}`;
            logger.error(errorMsg);
            return {
              success: false,
              error: errorMsg,
              trackTitle: trackData.title || 'unknown',
              artistName: trackData.artistInfo?.title || 'unknown'
            };
          }

          // Process lyrics using unified function
          const syncTrackResponse: SyncTrackResponse = await processLyrics({
            artistName: trackData.artistInfo.title,
            trackName: trackData.title,
            albumName: trackData.albumInfo.title,
            duration: trackData.duration,
            trackUuid: trackData.uuid,
            library,
            trackPath: trackData.path
          });

          return {
            success: true,
            syncTrackResponse,
            trackTitle: trackData.title,
            artistName: trackData.artistInfo.title
          };
        } catch (error) {
          logger.error(`Error processing track ${trackData.title}:`, error);
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            trackTitle: trackData.title || 'unknown',
            artistName: trackData.artistInfo?.title || 'unknown'
          };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process batch results
      for (const result of batchResults) {
        processedCount++;
        
        if (result.status === 'fulfilled') {
          const { success, syncTrackResponse, error, trackTitle, artistName } = result.value;
          
          if (success && syncTrackResponse) {
            // Update progress if we have a progress ID
            if (progressId) {
              syncProgressManager.completeTrack(progressId, trackTitle, artistName, syncTrackResponse);
            }
            
            if (!syncTrackResponse.synced) {
              errorCount++;
            }
          } else {
            errorCount++;
            logger.error(`Failed to process track ${trackTitle}: ${error}`);
            
            // Update progress for failed processing
            if (progressId) {
              syncProgressManager.completeTrack(progressId, trackTitle, artistName, {
                synced: false,
                plainLyrics: true,
                message: error || 'Unknown error'
              });
            }
          }
        } else {
          errorCount++;
          logger.error(`Promise rejected for track: ${result.reason}`);
          
          // Update progress for rejected promise
          if (progressId) {
            syncProgressManager.incrementProcessed(progressId, {
              synced: false,
              plainLyrics: true,
              message: `Promise rejected: ${result.reason}`
            }, 'unknown', 'unknown');
          }
        }
      }
      
      // Log batch progress
      logger.info(`Processed batch ${Math.floor(i / maxConcurrency) + 1}/${Math.ceil(tracksToProcess.length / maxConcurrency)}. Total processed: ${processedCount}/${tracksToProcess.length}`);
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