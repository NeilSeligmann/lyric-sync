<script lang="ts">
  import "../app.postcss";

  import {
    AppBar,
    type ToastContext,
    ToastProvider,
  } from "@skeletonlabs/skeleton-svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { setContext, type Snippet } from "svelte";
  import { LogOut } from "lucide-svelte";

  import type { LayoutServerData } from "./$types";

  const { data, children }: { data: LayoutServerData; children: Snippet }
    = $props();
  export function redirectOnMount(toast: ToastContext): void {
    if (!data.serverConfiguration) {
      goto("/add-server");
      toast.create({
        title: "No Server Configuration",
        description: "Please add a server configuration",
        type: "error",
      });
    }
    // server configuration defined but no currentLibrary is set
    else if (!data.currentLibrary) {
      goto("/select-library");
      toast.create({
        title: "No Library Selected",
        description: "Select which library you would like to sync",
        type: "error",
      });
    }
  }
  setContext("redirectOnMount", redirectOnMount);

  function handleLogout() {
    // Clear stored credentials
    sessionStorage.removeItem("auth_credentials");
    // Reload the page to trigger re-authentication
    window.location.reload();
  }
</script>

<ToastProvider>
  <!-- App Bar -->
  <AppBar classes="fixed z-10 h-16">
    {#snippet lead()}
      <strong class="text-xl uppercase">
        <a href={data.currentLibrary ? "/view-library" : "/"}> Lyric-Sync </a>
      </strong>
    {/snippet}
    {#snippet trail()}
      <div class="flex items-center gap-2">
        {#if data.auth?.authenticated && data.auth.username}
          <span class="text-sm text-surface-600-400">
            {data.auth.username}
          </span>
          <button
            class="btn btn-sm variant-ghost-surface"
            onclick={handleLogout}
            title="Logout"
          >
            <LogOut class="size-4" />
          </button>
        {/if}
        
        {#if data.serverConfiguration}
          {#if data.currentLibrary}
            {#if page.url.pathname !== "/select-library"}
              <a
                class="btn btn-sm variant-ghost-surface"
                href="/select-library"
                rel="noreferrer"
              >
                Change Library
              </a>
            {/if}
            {#if !page.url.pathname.includes("/view-library")}
              <a
                class="btn btn-sm variant-ghost-surface"
                href="/view-library"
                rel="noreferrer"
              >
                View Library
              </a>
            {/if}
            {#if page.url.pathname !== "/sync-history"}
              <a
                class="btn btn-sm variant-ghost-surface"
                href="/sync-history"
                rel="noreferrer"
              >
                Sync History
              </a>
            {/if}
          {/if}
        {:else}
          <a
            class="btn btn-sm variant-ghost-surface"
            href="/add-server"
            rel="noreferrer"
          >
            Add Server
          </a>
        {/if}
      </div>
    {/snippet}
  </AppBar>
  <!-- Page Route Content -->
  {@render children()}
</ToastProvider>

<style>
</style>
