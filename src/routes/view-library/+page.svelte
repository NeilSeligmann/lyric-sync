<script lang="ts">
  import ArtistCard from "$lib/components/ArtistCard.svelte";
  import SyncProgressBar from "$lib/components/SyncProgressBar.svelte";
  import { type ToastContext } from "@skeletonlabs/skeleton-svelte";
  import { invalidateAll } from "$app/navigation";
  import { Download } from "lucide-svelte";
  import { getContext } from "svelte";

  import type { PageData } from "./$types";

  const { data }: { data: PageData } = $props();
  const toast: ToastContext = getContext("toast");
  
  let syncing = $state(false);
  let unsyncedCount = $state(0);

  // Get the count of unsynced tracks
  async function getUnsyncedCount(): Promise<void> {
    if (!data.currentLibrary) return;
    
    try {
      const response = await fetch(`/api/sync-lyrics/unsynced-tracks?library=${data.currentLibrary.uuid}`);
      if (response.ok) {
        const data = await response.json();
        unsyncedCount = data.count;
      }
    } catch (error) {
      console.error("Failed to get unsynced count:", error);
    }
  }

  // Sync all missing tracks
  async function syncAllMissingTracks(): Promise<void> {
    if (!data.currentLibrary) return;
    
    syncing = true;
    
    try {
      const response = await fetch("/api/sync-lyrics/sync-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ library: data.currentLibrary.uuid }),
      });

      if (response.ok) {
        const result = await response.json();
        
        if (result.message === "Bulk sync started") {
          toast.create({
            title: "Sync Started",
            description: `Started syncing ${result.totalTracks} tracks. Progress will be shown below.`,
            type: "info",
          });
        } else {
          toast.create({
            title: "No Tracks to Sync",
            description: result.message,
            type: "info",
          });
        }
      } else if (response.status === 409) {
        const error = await response.json();
        toast.create({
          title: "Sync Already Running",
          description: "A sync operation is already in progress for this library.",
          type: "info",
        });
      } else {
        const error = await response.json();
        toast.create({
          title: "Sync Failed",
          description: error.error || "An error occurred starting the bulk sync",
          type: "error",
        });
      }
    } catch (error) {
      toast.create({
        title: "Sync Failed",
        description: "An error occurred starting the bulk sync",
        type: "error",
      });
    } finally {
      syncing = false;
    }
  }

  // Get unsynced count on page load
  $effect(() => {
    if (data.currentLibrary) {
      getUnsyncedCount();
    }
  });
</script>

<div class="px-5 py-1">
  {#if data.currentLibrary}
    <!-- Progress Bar - shows current sync progress -->
    <SyncProgressBar libraryId={data.currentLibrary.uuid} />
    
    <!-- Sync Button - only show if there are unsynced tracks and no sync in progress -->
    {#if unsyncedCount > 0}
      <div class="mb-4 flex justify-between items-center">
        <div class="text-lg font-semibold">
          {unsyncedCount} tracks missing lyrics
        </div>
        <button
          type="button"
          class="btn preset-filled-primary-500"
          disabled={syncing}
          on:click={syncAllMissingTracks}
        >
          <Download class="size-4" />
          {syncing ? "Starting Sync..." : "Sync All Missing Tracks"}
        </button>
      </div>
    {/if}
  {/if}
  
  <div class="grid lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
    {#if data.returnedArtists}
      {#each data.returnedArtists as artist}
        <ArtistCard {artist} serverConfiguration={data.serverConfiguration} />
      {/each}
    {/if}
  </div>
</div>
