import type { RequestHandler } from "@sveltejs/kit";
import type { InferredSelectTrackSchema, SyncTrackResponse } from "$lib/types";

import { logger } from "$lib/logger";
import { syncAttempts } from "$lib/schema";
import db from "$lib/server/db";
import { processLyrics } from "$lib/server/lyrics-search";
import { eq } from "drizzle-orm";

export const POST: RequestHandler = async ({ request }) => {
  const { library, artistName, albumName, track }: {
    library: string;
    artistName: string;
    albumName: string;
    track: InferredSelectTrackSchema;
  } = await request.json();

  // Create sync attempt record for individual track sync
  let syncAttemptId: number | null = null;
  const startTime = Date.now();

  try {
    // Insert sync_attempts record for individual track sync
    const insertResult = await db.insert(syncAttempts).values({
      library_id: library,
      start_time: new Date(startTime),
      status: "running",
      sync_type: "individual",
      total_tracks: 1,
      processed_tracks: 0,
      synced_tracks: 0,
      failed_tracks: 0,
      results_json: null,
    }).returning({ id: syncAttempts.id });
    syncAttemptId = insertResult[0]?.id ?? null;

    // Validate inputs
    if (!library || !track?.uuid || !track?.title || !artistName || !albumName || !track?.duration || Number.isNaN(track.duration) || !Number.isFinite(track.duration)) {
      const errorMsg = `Invalid request data: library=${library}, track.uuid=${track?.uuid}, track.title=${track?.title}, artistName=${artistName}, albumName=${albumName}, duration=${track?.duration}`;
      logger.error(errorMsg);
      const syncTrackResponse: SyncTrackResponse = {
        synced: false,
        plainLyrics: true,
        message: errorMsg,
      };

      // Update sync attempt record as failed
      if (syncAttemptId !== null) {
        await db.update(syncAttempts)
          .set({
            end_time: new Date(),
            status: "failed",
            processed_tracks: 1,
            synced_tracks: 0,
            failed_tracks: 1,
            results_json: JSON.stringify([{
              track_title: track?.title || "unknown",
              error: errorMsg,
            }]),
          })
          .where(eq(syncAttempts.id, syncAttemptId));
      }

      return new Response(JSON.stringify(syncTrackResponse));
    }

    // Process lyrics using unified function
    const syncTrackResponse: SyncTrackResponse = await processLyrics({
      artistName,
      trackName: track.title,
      albumName,
      duration: track.duration,
      trackUuid: track.uuid,
      library,
      trackPath: track.path,
    });

    // Update sync attempt record as completed
    if (syncAttemptId !== null) {
      await db.update(syncAttempts)
        .set({
          end_time: new Date(),
          status: "completed",
          processed_tracks: 1,
          synced_tracks: syncTrackResponse.synced ? 1 : 0,
          failed_tracks: syncTrackResponse.synced ? 0 : 1,
          results_json: JSON.stringify([{
            track_title: track.title,
            artist_name: artistName,
            album_name: albumName,
            synced: syncTrackResponse.synced,
            plain_lyrics: syncTrackResponse.plainLyrics,
            message: syncTrackResponse.message,
          }]),
        })
        .where(eq(syncAttempts.id, syncAttemptId));
    }

    return new Response(JSON.stringify(syncTrackResponse));
  }
  catch (error) {
    logger.error(`Error syncing individual track ${track?.title}:`, error);

    // Update sync attempt record as failed
    if (syncAttemptId !== null) {
      await db.update(syncAttempts)
        .set({
          end_time: new Date(),
          status: "failed",
          processed_tracks: 1,
          synced_tracks: 0,
          failed_tracks: 1,
          results_json: JSON.stringify([{
            track_title: track?.title || "unknown",
            error: error instanceof Error ? error.message : "Unknown error",
          }]),
        })
        .where(eq(syncAttempts.id, syncAttemptId));
    }

    const syncTrackResponse: SyncTrackResponse = {
      synced: false,
      plainLyrics: true,
      message: error instanceof Error ? error.message : "Unknown error occurred",
    };

    return new Response(JSON.stringify(syncTrackResponse));
  }
};
