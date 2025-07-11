import { logger } from "$lib/logger";
import { getAllLibrariesInServer } from "$lib/server/db/query-utils";
import env from "$lib/server/env";
import { processSyncTracks } from "$lib/server/sync-service";
import cron from "node-cron";

import { plexSyncService } from "./plex-sync-service";

export class CronService {
  private static instance: CronService;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): CronService {
    if (!CronService.instance) {
      CronService.instance = new CronService();
    }
    return CronService.instance;
  }

  initialize(): void {
    if (this.isInitialized) {
      logger.warn("CronService already initialized");
      return;
    }

    logger.info("Initializing CronService...");

    // Run every 12 hours - retry failed tracks and sync new tracks
    cron.schedule("0 */12 * * *", async () => {
      logger.info("Running scheduled sync job...");
      await this.runScheduledSync();
    }, {
      scheduled: true,
      timezone: env.CRON_TIMEZONE,
    });

    // Run every 12 hours - more comprehensive sync
    cron.schedule("0 */12 * * *", async () => {
      logger.info("Running comprehensive sync job...");
      await this.runComprehensiveSync();
    }, {
      scheduled: true,
      timezone: env.CRON_TIMEZONE,
    });

    // Run every 6 hours - sync Plex library with database
    cron.schedule("0 */6 * * *", async () => {
      logger.info("Running Plex library sync job...");
      await this.runPlexLibrarySync();
    }, {
      scheduled: true,
      timezone: env.CRON_TIMEZONE,
    });

    this.isInitialized = true;
    logger.info("CronService initialized successfully");
  }

  private async runScheduledSync(): Promise<void> {
    try {
      const libraries = await getAllLibrariesInServer();

      for (const library of libraries) {
        try {
          logger.info(`Running scheduled sync for library: ${library.title} (${library.uuid})`);
          await processSyncTracks(null, [], library.uuid, { mode: "scheduled" });
        }
        catch (error) {
          logger.error(`Error in scheduled sync for library ${library.uuid}:`, error);
        }
      }
    }
    catch (error) {
      logger.error("Error in scheduled sync job:", error);
    }
  }

  private async runComprehensiveSync(): Promise<void> {
    try {
      const libraries = await getAllLibrariesInServer();

      for (const library of libraries) {
        try {
          logger.info(`Running comprehensive sync for library: ${library.title} (${library.uuid})`);
          await processSyncTracks(null, [], library.uuid, { mode: "comprehensive" });
        }
        catch (error) {
          logger.error(`Error in comprehensive sync for library ${library.uuid}:`, error);
        }
      }
    }
    catch (error) {
      logger.error("Error in comprehensive sync job:", error);
    }
  }

  private async runPlexLibrarySync(): Promise<void> {
    try {
      logger.info("Starting Plex library sync with database...");
      await plexSyncService.syncPlexData({ mode: "full" });
      logger.info("Plex library sync completed successfully");
    }
    catch (error) {
      logger.error("Error in Plex library sync job:", error);
    }
  }

  // Manual trigger for testing
  async triggerManualSync(libraryId?: string): Promise<void> {
    logger.info("Manual sync triggered");

    if (libraryId) {
      await processSyncTracks(null, [], libraryId, { mode: "manual" });
    }
    else {
      await this.runScheduledSync();
    }
  }

  // Manual trigger for Plex sync
  async triggerManualPlexSync(mode: "libraries" | "library_content" | "full" = "full", libraryId?: string): Promise<void> {
    logger.info(`Manual Plex sync triggered with mode: ${mode}`);

    try {
      await plexSyncService.syncPlexData({ mode, libraryId });
      logger.info("Manual Plex sync completed successfully");
    }
    catch (error) {
      logger.error("Error in manual Plex sync:", error);
      throw error;
    }
  }
}

export const cronService = CronService.getInstance();
