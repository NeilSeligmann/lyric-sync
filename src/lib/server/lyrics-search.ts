import type { LRCResponse, SyncTrackResponse } from "$lib/types";

import { LrcLibApi } from "$lib/external-links";
import { logger } from "$lib/logger";
import { markTrackAsSyncedWithDetails } from "$lib/server/db/query-utils";
import fs from "node:fs/promises";
import path from "node:path";

interface LyricsSearchParams {
  artistName: string;
  trackName: string;
  albumName: string;
  duration: number;
}

interface LyricsProcessingParams extends LyricsSearchParams {
  trackUuid: string;
  library: string;
  trackPath: string;
}

/**
 * Search for lyrics with fallback mechanism
 * First attempts to find lyrics with album name, then falls back to search without album name
 */
export async function searchLyrics(params: LyricsSearchParams): Promise<LRCResponse | null> {
  const { artistName, trackName, albumName, duration } = params;
  const durationInSeconds = Math.floor(duration / 1000);

  // First attempt: search with album name
  const lrcGetUrlWithAlbum: string = `${LrcLibApi}artist_name=${encodeURIComponent(artistName)}&track_name=${encodeURIComponent(trackName)}&album_name=${encodeURIComponent(albumName)}&duration=${durationInSeconds}`;

  logger.info(`Searching for lyrics with album name: ${lrcGetUrlWithAlbum}`);
  let lyricResponse: Response = await fetch(lrcGetUrlWithAlbum);

  // If first attempt fails, try without album name
  if (!lyricResponse.ok) {
    const lrcGetUrlWithoutAlbum: string = `${LrcLibApi}artist_name=${encodeURIComponent(artistName)}&track_name=${encodeURIComponent(trackName)}&duration=${durationInSeconds}`;
    logger.info(`First search failed, trying without album name: ${lrcGetUrlWithoutAlbum}`);
    lyricResponse = await fetch(lrcGetUrlWithoutAlbum);
  }

  if (lyricResponse.ok) {
    const lyricResponseJson: LRCResponse = await lyricResponse.json();
    return lyricResponseJson;
  }

  return null;
}

/**
 * Complete lyrics processing: search, write files, and update database
 * This unifies all the logic that was previously duplicated between the API endpoint and sync service
 */
export async function processLyrics(params: LyricsProcessingParams): Promise<SyncTrackResponse> {
  const syncTrackResponse: SyncTrackResponse = {
    synced: false,
    plainLyrics: true,
    message: "",
  };

  try {
    // Search for lyrics using unified function
    const lyricResponseJson: LRCResponse | null = await searchLyrics({
      artistName: params.artistName,
      trackName: params.trackName,
      albumName: params.albumName,
      duration: params.duration,
    });

    if (lyricResponseJson) {
      if (lyricResponseJson.syncedLyrics) {
        // Write synced lyrics to LRC file
        const lrcPath: string = `${path.dirname(params.trackPath)}/${path.parse(params.trackPath).name}.lrc`;

        try {
          await fs.writeFile(lrcPath, lyricResponseJson.syncedLyrics);
          syncTrackResponse.synced = true;
          syncTrackResponse.plainLyrics = false;
          await markTrackAsSyncedWithDetails(params.trackUuid, params.library, true);
          syncTrackResponse.message = `LRC lyrics grabbed for ${params.trackName}`;
        }
        catch (error: unknown) {
          if (error instanceof Error) {
            syncTrackResponse.message = error.message;
            syncTrackResponse.stack = error.stack;
          }
          await markTrackAsSyncedWithDetails(params.trackUuid, params.library, false, syncTrackResponse.message);
        }
      }
      else if (lyricResponseJson.plainLyrics) {
        // Write plain lyrics to TXT file
        const txtPath: string = `${path.dirname(params.trackPath)}/${path.parse(params.trackPath).name}.txt`;

        try {
          await fs.writeFile(txtPath, lyricResponseJson.plainLyrics);
          syncTrackResponse.synced = true;
          syncTrackResponse.plainLyrics = true;
          await markTrackAsSyncedWithDetails(params.trackUuid, params.library, true);
          syncTrackResponse.message = `TXT lyrics grabbed for ${params.trackName}`;
        }
        catch (error: unknown) {
          if (error instanceof Error) {
            syncTrackResponse.message = error.message;
            syncTrackResponse.stack = error.stack;
          }
          await markTrackAsSyncedWithDetails(params.trackUuid, params.library, false, syncTrackResponse.message);
        }
      }
      else {
        syncTrackResponse.message = `${params.trackName} has an entry in the lrclib api but no lyrics. Perhaps we can contribute some to lrclib.net?`;
        await markTrackAsSyncedWithDetails(params.trackUuid, params.library, false, syncTrackResponse.message);
      }
    }
    else {
      // No lyrics found from the provider
      syncTrackResponse.message = `No lyrics found for ${params.trackName}`;
      logger.info(`No lyrics found for ${params.trackName}`);
      await markTrackAsSyncedWithDetails(params.trackUuid, params.library, false, syncTrackResponse.message);
    }
  }
  catch (error: unknown) {
    if (error instanceof Error) {
      syncTrackResponse.message = error.message;
      syncTrackResponse.stack = error.stack;
      logger.error(`Error processing track ${params.trackName}: ${error.message}`);
    }
    else {
      syncTrackResponse.message = "Unknown error occurred";
      logger.error(`Unknown error processing track ${params.trackName}:`, error);
    }
    await markTrackAsSyncedWithDetails(params.trackUuid, params.library, false, syncTrackResponse.message);
  }

  return syncTrackResponse;
}
