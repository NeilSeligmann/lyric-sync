import type { RequestHandler } from "@sveltejs/kit";

import { logger } from "$lib/logger";
import { cronService } from "$lib/server/cron-service";

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { mode, libraryId }: { mode?: "libraries" | "library_content" | "full"; libraryId?: string } = await request.json();

    logger.info(`Manual Plex sync requested with mode: ${mode || "full"}, libraryId: ${libraryId || "all"}`);

    await cronService.triggerManualPlexSync(mode || "full", libraryId);

    return new Response(JSON.stringify({ 
      message: "Plex sync completed successfully",
      mode: mode || "full",
      libraryId: libraryId || "all"
    }));

  } catch (error) {
    logger.error("Error in manual Plex sync endpoint:", error);
    
    return new Response(JSON.stringify({ 
      error: "Failed to sync Plex library",
      details: error instanceof Error ? error.message : "Unknown error"
    }), { status: 500 });
  }
}; 