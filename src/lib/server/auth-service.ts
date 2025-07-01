import env from "./env";
import { logger } from "$lib/logger";

export interface AuthSession {
  authenticated: boolean;
  username?: string;
}

class AuthService {
  private isAuthEnabled(): boolean {
    return !!(env.AUTH_USERNAME && env.AUTH_PASSWORD);
  }

  /**
   * Validates Basic Auth credentials
   */
  validateCredentials(username: string, password: string): boolean {
    if (!this.isAuthEnabled()) {
      return true; // No auth required
    }

    return username === env.AUTH_USERNAME && password === env.AUTH_PASSWORD;
  }

  /**
   * Extracts and validates Basic Auth from request headers
   */
  validateRequest(request: Request): AuthSession {
    if (!this.isAuthEnabled()) {
      return { authenticated: true };
    }

    const authHeader = request.headers.get("authorization");
    
    if (!authHeader || !authHeader.startsWith("Basic ")) {
      return { authenticated: false };
    }

    try {
      const base64Credentials = authHeader.substring(6);
      const credentials = Buffer.from(base64Credentials, "base64").toString("utf-8");
      const [username, password] = credentials.split(":");

      if (this.validateCredentials(username, password)) {
        return { authenticated: true, username };
      }
    } catch (error) {
      logger.error("Error parsing Basic Auth credentials:", error);
    }

    return { authenticated: false };
  }

  /**
   * Creates a Basic Auth challenge response
   */
  createAuthChallenge(): Response {
    return new Response("Authentication required", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Lyric Sync"',
        "Content-Type": "text/plain",
      },
    });
  }

  /**
   * Checks if authentication is required for the current request
   */
  isAuthRequired(url: URL): boolean {
    if (!this.isAuthEnabled()) {
      return false;
    }

    // Skip auth for static assets and API endpoints that might be called by the frontend
    const path = url.pathname;
    
    // Allow static assets
    if (path.startsWith("/static/") || path.startsWith("/favicon")) {
      return false;
    }

    // Allow API endpoints (they can implement their own auth if needed)
    if (path.startsWith("/api/")) {
      return false;
    }

    return true;
  }
}

export const authService = new AuthService(); 