import type { SyncTrackResponse } from "$lib/types";
import { Worker } from "worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      progressId = syncProgressManager.createProgress(library, tracksToProcess.length);
      syncProgressManager.updateProgress(progressId, { status: 'running' });
    }

    const maxConcurrency = options.maxConcurrency || env.SYNC_CONCURRENCY;
    let processedCount = 0;
    let errorCount = 0;

    // Process tracks in batches with controlled concurrency
    for (let i = 0; i < tracksToProcess.length; i += maxConcurrency) {
      const batch = tracksToProcess.slice(i, i + maxConcurrency);
      const batchPromises = batch.map(trackData => processTrackWithWorker(trackData, library));
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process batch results
      for (const result of batchResults) {
        processedCount++;
        
        if (result.status === 'fulfilled') {
          const { syncTrackResponse, trackTitle, artistName } = result.value;
          
          // Update progress if we have a progress ID
          if (progressId) {
            syncProgressManager.incrementProcessed(progressId, syncTrackResponse, trackTitle, artistName);
          }
          
          if (!syncTrackResponse.synced) {
            errorCount++;
          }
        } else {
          errorCount++;
          logger.error(`Worker failed for track: ${result.reason}`);
          
          // Update progress for failed worker
          if (progressId) {
            syncProgressManager.incrementProcessed(progressId, {
              synced: false,
              plainLyrics: true,
              message: `Worker failed: ${result.reason}`
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

/**
 * Process a single track using a worker thread
 */
async function processTrackWithWorker(trackData: any, library: string): Promise<{
  syncTrackResponse: SyncTrackResponse;
  trackTitle: string;
  artistName: string;
}> {
  return new Promise((resolve, reject) => {
    // Validate track data
    if (!trackData.title || !trackData.uuid || !trackData.artistInfo?.title || !trackData.albumInfo?.title || !trackData.duration || isNaN(trackData.duration) || !isFinite(trackData.duration)) {
      const errorMsg = `Invalid track data: title=${trackData.title}, uuid=${trackData.uuid}, artist=${trackData.artistInfo?.title}, album=${trackData.albumInfo?.title}, duration=${trackData.duration}`;
      logger.error(errorMsg);
      reject(new Error(errorMsg));
      return;
    }

    // Create worker - TypeScript file will be compiled by the build process
    const workerPath = path.join(__dirname, 'lyrics-worker.js');
    const worker = new Worker(workerPath, {
      workerData: {
        trackData,
        library
      }
    });

    // Set up worker message handling
    worker.on('message', (message) => {
      if (message.success) {
        resolve({
          syncTrackResponse: message.result,
          trackTitle: message.trackTitle,
          artistName: message.artistName
        });
      } else {
        reject(new Error(message.error));
      }
      worker.terminate();
    });

    // Set up worker error handling
    worker.on('error', (error) => {
      logger.error(`Worker error for track ${trackData.title}:`, error);
      reject(error);
      worker.terminate();
    });

    // Set up worker exit handling
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });

    // Set a timeout for the worker
    setTimeout(() => {
      worker.terminate();
      reject(new Error(`Worker timeout for track ${trackData.title}`));
    }, 30000); // 30 second timeout
  });
} 