<script lang="ts">
  import ArtistCard from "$lib/components/ArtistCard.svelte";
  import SyncDashboard from "$lib/components/SyncDashboard.svelte";
  import ArtistSearch from "$lib/components/ArtistSearch.svelte";
  import type { ArtistWithAlbumCount } from "$lib/types";
  import { type ToastContext } from "@skeletonlabs/skeleton-svelte";
  import { invalidateAll } from "$app/navigation";
  import { Download, Search } from "lucide-svelte";
  import { getContext } from "svelte";

  import type { PageData } from "./$types";

  const { data }: { data: PageData } = $props();
  const toast: ToastContext = getContext("toast");
  
  let syncing = $state(false);
  let unsyncedCount = $state(0);
  let displayedArtists = $state(data.returnedArtists || []);

  // The page server guarantees currentLibrary is defined
  const currentLibrary = data.currentLibrary!;

  // Handle search results
  function handleSearchChange(filteredArtists: ArtistWithAlbumCount[]): void {
    displayedArtists = filteredArtists;
  }

  // Get the count of unsynced tracks
  async function getUnsyncedCount(): Promise<void> {
    try {
      const response = await fetch(`/api/sync-lyrics/unsynced-tracks?library=${currentLibrary.uuid}`);
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
    syncing = true;
    
    try {
      const response = await fetch("/api/sync-lyrics/sync-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ library: currentLibrary.uuid }),
      });

      if (response.ok) {
        const result = await response.json();
        
        if (result.message === "Bulk sync started") {
          toast.create({
            title: "Sync Started",
            description: `Started syncing ${result.totalTracks} tracks. Progress will be shown in the dashboard.`,
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
    getUnsyncedCount();
  });
</script>

<div class="px-5 py-1">
  <!-- Sync Dashboard - shows progress, statistics and manual controls -->
  <div class="mb-6">
    <SyncDashboard library={currentLibrary} />
  </div>
  
  <!-- Artist Search -->
  {#if data.returnedArtists && data.returnedArtists.length > 1}
    <ArtistSearch 
      artists={data.returnedArtists} 
      onSearchChange={handleSearchChange} 
    />
  {/if}
  
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
        onclick={syncAllMissingTracks}
      >
        <Download class="size-4" />
        {syncing ? "Starting Sync..." : "Sync All Missing Tracks"}
      </button>
    </div>
  {/if}
  
  <div class="grid lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
    {#if displayedArtists && displayedArtists.length > 0}
      {#each displayedArtists as artist}
        <ArtistCard {artist} serverConfiguration={data.serverConfiguration} />
      {/each}
    {:else if displayedArtists && displayedArtists.length === 0}
      <div class="col-span-full text-center py-12">
        <div class="text-surface-600-400">
          <Search class="size-12 mx-auto mb-4 opacity-50" />
          <h3 class="text-lg font-medium mb-2">No artists found</h3>
          <p class="text-sm">Try adjusting your search terms or browse all artists.</p>
        </div>
      </div>
    {/if}
  </div>
</div>
