import type { RequestHandler } from "@sveltejs/kit";
import type { InferredSelectLibrarySchema, InferredSelectServerSchema } from "$lib/types";

import { logger } from "$lib/logger";
import { libraries } from "$lib/schema";
import db from "$lib/server/db";
import { plexSyncService } from "$lib/server/plex-sync-service";
import { eq } from "drizzle-orm";

export const GET: RequestHandler = async () => {
  const serverConfiguration: InferredSelectServerSchema | undefined = await db.query.servers.findFirst();

  if (serverConfiguration) {
    const currentLibrary: InferredSelectLibrarySchema | undefined = await db.query.libraries.findFirst({
      where: eq(libraries.currentLibrary, true),
    });

    if (currentLibrary) {
      logger.info(`Syncing library content for: ${currentLibrary.title} (${currentLibrary.uuid})`);

      try {
        // Use the new Plex sync service to sync library content
        await plexSyncService.syncPlexData({
          mode: "library_content",
          libraryId: currentLibrary.uuid,
        });

        logger.info(`Successfully synced library content for: ${currentLibrary.title}`);
      }
      catch (error) {
        logger.error(`Error syncing library content for ${currentLibrary.title}:`, error);
        return new Response(JSON.stringify({
          error: "Failed to sync library content",
          details: error instanceof Error ? error.message : "Unknown error",
        }), { status: 500 });
      }
    }
    else {
      logger.warn("No current library found");
    }
  }
  else {
    logger.warn("No server configuration found");
  }

  return new Response(JSON.stringify({ message: "Library content sync completed" }));
};
