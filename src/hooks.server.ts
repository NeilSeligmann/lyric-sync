import type { Handle } from "@sveltejs/kit";
import { cronService } from "$lib/server/cron-service";
import { logger } from "$lib/logger";

// Initialize cron service when the server starts
cronService.initialize();
logger.info("Cron service initialized");

export const handle: Handle = async ({ event, resolve }) => {
  return resolve(event);
}; 