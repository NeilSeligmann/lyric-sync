import type { Handle } from "@sveltejs/kit";
import { cronService } from "$lib/server/cron-service";
import { logger } from "$lib/logger";
import { authService } from "$lib/server/auth-service";

// Initialize cron service when the server starts
cronService.initialize();
logger.info("Cron service initialized");

export const handle: Handle = async ({ event, resolve }) => {
  // Check if authentication is required for this request
  if (authService.isAuthRequired(event.url)) {
    const authSession = authService.validateRequest(event.request);
    
    if (!authSession.authenticated) {
      return authService.createAuthChallenge();
    }
    
    // Add auth session to event.locals for use in load functions
    event.locals.auth = authSession;
  } else {
    // No auth required, but still set a default session
    event.locals.auth = { authenticated: true };
  }

  return resolve(event);
}; 