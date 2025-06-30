import type { RequestHandler } from "@sveltejs/kit";
import type { InferredSelectTrackSchema, SyncTrackResponse } from "$lib/types";

import { logger } from "$lib/logger";
import { processLyrics } from "$lib/server/lyrics-search";

export const POST: RequestHandler = async ({ request }) => {
  const { library, artistName, albumName, track }: {
    library: string;
    artistName: string;
    albumName: string;
    track: InferredSelectTrackSchema;
  } = await request.json();

  // Validate inputs
  if (!library || !track?.uuid || !track?.title || !artistName || !albumName || !track?.duration || isNaN(track.duration) || !isFinite(track.duration)) {
    const errorMsg = `Invalid request data: library=${library}, track.uuid=${track?.uuid}, track.title=${track?.title}, artistName=${artistName}, albumName=${albumName}, duration=${track?.duration}`;
    logger.error(errorMsg);
    const syncTrackResponse: SyncTrackResponse = {
      synced: false,
      plainLyrics: true,
      message: errorMsg,
    };
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
    trackPath: track.path
  });

  return new Response(JSON.stringify(syncTrackResponse));
};
