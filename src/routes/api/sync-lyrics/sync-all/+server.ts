import type { RequestHandler } from "@sveltejs/kit";
import type { LRCResponse, SyncTrackResponse } from "$lib/types";

import { LrcLibApi } from "$lib/external-links";
import { logger } from "$lib/logger";
import { getUnsyncedTracksInLibrary, markTrackAsSynced } from "$lib/server/db/query-utils";
import fs from "node:fs/promises";
import path from "node:path";

export const POST: RequestHandler = async ({ request }) => {
  const { library }: { library: string } = await request.json();

  if (!library) {
    return new Response(JSON.stringify({ error: "Library parameter is required" }), { status: 400 });
  }

  const syncResults: Array<SyncTrackResponse> = [];
  let totalTracks = 0;
  let syncedTracks = 0;
  let failedTracks = 0;

  try {
    // Get all unsynced tracks with artist and album info
    const unsyncedTracks = await getUnsyncedTracksInLibrary(library);
    totalTracks = unsyncedTracks.length;

    logger.info(`Starting bulk sync for ${totalTracks} tracks in library ${library}`);

    // Process each track using the same logic as the single track endpoint
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
            syncedTracks++;
          } else if (lyricResponseJson.plainLyrics) {
            // Write plain lyrics to TXT file
            const txtPath: string = `${path.dirname(trackData.path)}/${path.parse(trackData.path).name}.txt`;
            
            await fs.writeFile(txtPath, lyricResponseJson.plainLyrics);
            syncTrackResponse.synced = true;
            syncTrackResponse.plainLyrics = true;
            markTrackAsSynced(trackData.uuid, library);
            syncTrackResponse.message = `TXT lyrics grabbed for ${trackData.title}`;
            syncedTracks++;
          } else {
            syncTrackResponse.message = `${trackData.title} has an entry in the lrclib api but no lyrics`;
            failedTracks++;
          }
        } else {
          syncTrackResponse.message = `No lyrics found for ${trackData.title}`;
          failedTracks++;
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          syncTrackResponse.message = error.message;
          syncTrackResponse.stack = error.stack;
        }
        failedTracks++;
      }

      syncResults.push(syncTrackResponse);
    }

    logger.info(`Bulk sync completed. Synced: ${syncedTracks}, Failed: ${failedTracks}, Total: ${totalTracks}`);

    return new Response(JSON.stringify({
      results: syncResults,
      summary: {
        totalTracks,
        syncedTracks,
        failedTracks
      }
    }));

  } catch (error) {
    logger.error(`Error during bulk sync for library ${library}:`, error);
    return new Response(JSON.stringify({ error: "Failed to sync tracks" }), { status: 500 });
  }
}; 