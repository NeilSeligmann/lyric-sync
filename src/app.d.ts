// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { AuthSession } from "$lib/server/auth-service";

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      auth: AuthSession;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
