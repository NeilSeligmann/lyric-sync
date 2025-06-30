import type { Handle } from "@sveltejs/kit";
import { cronService } from "$lib/server/cron-service";
import { logger } from "$lib/logger";

// Initialize cron service when the server starts
if (process.env.NODE_ENV === "production") {
  cronService.initialize();
  logger.info("Cron service initialized in production mode");
} else {
  logger.info("Cron service not initialized in development mode");
}

export const handle: Handle = async ({ event, resolve }) => {
  return resolve(event);
}; 