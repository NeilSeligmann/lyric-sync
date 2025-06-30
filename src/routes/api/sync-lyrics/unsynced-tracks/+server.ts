import type { RequestHandler } from "@sveltejs/kit";
import type { InferredSelectTrackSchema } from "$lib/types";

import { getUnsyncedTracksInLibrary } from "$lib/server/db/query-utils";
import { logger } from "$lib/logger";

export const GET: RequestHandler = async ({ url }) => {
  const library = url.searchParams.get("library");

  if (!library) {
    return new Response(JSON.stringify({ error: "Library parameter is required" }), { status: 400 });
  }

  try {
    const unsyncedTracks: Array<InferredSelectTrackSchema> = await getUnsyncedTracksInLibrary(library);
    
    logger.info(`Retrieved ${unsyncedTracks.length} unsynced tracks for library ${library}`);
    
    return new Response(JSON.stringify({ tracks: unsyncedTracks, count: unsyncedTracks.length }));
  } catch (error) {
    logger.error(`Error retrieving unsynced tracks for library ${library}:`, error);
    return new Response(JSON.stringify({ error: "Failed to retrieve unsynced tracks" }), { status: 500 });
  }
}; 