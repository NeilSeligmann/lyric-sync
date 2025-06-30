<script lang="ts">
  import ArtistCard from "$lib/components/ArtistCard.svelte";
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
        const { syncedTracks, failedTracks, totalTracks } = result.summary;
        
        toast.create({
          title: "Bulk Sync Complete",
          description: `Successfully synced ${syncedTracks} tracks. ${failedTracks} tracks failed.`,
          type: syncedTracks > 0 ? "success" : "error",
        });
        
        // Refresh the page to show updated sync status
        await invalidateAll();
      } else {
        const error = await response.json();
        toast.create({
          title: "Sync Failed",
          description: error.error || "An error occurred during bulk sync",
          type: "error",
        });
      }
    } catch (error) {
      toast.create({
        title: "Sync Failed",
        description: "An error occurred during bulk sync",
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
  {#if data.currentLibrary && unsyncedCount > 0}
    <div class="mb-4 flex justify-between items-center">
      <div class="text-lg font-semibold">
        {unsyncedCount} tracks missing lyrics
      </div>
      <button
        type="button"
        class="btn preset-filled-primary-500"
        disabled={syncing}
        onclick={syncAllMissingTracks}
      >
        <Download class="size-4" />
        {syncing ? "Syncing..." : "Sync All Missing Tracks"}
      </button>
    </div>
  {/if}
  
  <div class="grid lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
    {#if data.returnedArtists}
      {#each data.returnedArtists as artist}
        <ArtistCard {artist} serverConfiguration={data.serverConfiguration} />
      {/each}
    {/if}
  </div>
</div>
