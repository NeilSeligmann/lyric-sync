import type { InferredSelectLibrarySchema, InferredSelectServerSchema, ServerLoadValues } from "$lib/types";

import { libraries } from "$lib/schema";
import db from "$lib/server/db";
import { eq } from "drizzle-orm";
import { plexSyncService } from "$lib/server/plex-sync-service";

import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => {
  const defaultValues: ServerLoadValues = {
    serverConfiguration: undefined,
    libraries: [],
    currentLibrary: undefined,
    auth: locals.auth,
  };

  // get server configuration
  const serverConfiguration: InferredSelectServerSchema | undefined = await db.query.servers.findFirst();

  if (serverConfiguration) {
    defaultValues.serverConfiguration = serverConfiguration;

    // Use the new Plex sync service to sync libraries
    try {
      await plexSyncService.syncPlexData({ mode: "libraries" });
    } catch (error) {
      console.error("Error syncing Plex libraries:", error);
    }

    // get libraries from database after sync
    const updatedLibraries: Array<InferredSelectLibrarySchema> | undefined = await db.query.libraries.findMany({
      where: eq(libraries.serverName, serverConfiguration.serverName),
    });

    if (updatedLibraries && updatedLibraries.length > 0) {
      // again for skeleton ui beta 3 bug, or I might just not understand something about how cards work
      const dummyLibrary: InferredSelectLibrarySchema = JSON.parse(JSON.stringify(updatedLibraries[0]));
      dummyLibrary.key = "hide_me";
      updatedLibraries.unshift(dummyLibrary);
      
      defaultValues.libraries = updatedLibraries;
      defaultValues.currentLibrary = updatedLibraries.find(library => library.currentLibrary);
    }
  }

  return {
    ...defaultValues,
    auth: locals.auth,
  };
};
