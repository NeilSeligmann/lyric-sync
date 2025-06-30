<script lang="ts">
  import { ProgressRing } from "@skeletonlabs/skeleton-svelte";
  import { Download, CheckCircle, XCircle, Clock } from "lucide-svelte";
  import { onMount, onDestroy } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import type { SyncProgress } from "$lib/server/sync-progress";

  const { libraryId }: { libraryId: string } = $props();
  
  let progress: SyncProgress | null = $state(null);
  let pollingInterval: ReturnType<typeof setInterval> | undefined = $state(undefined);
  let error: string | null = $state(null);

  let progressPercentage = $state(0);
  let elapsedTime = $state(0);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  async function fetchProgress(): Promise<void> {
    try {
      const response = await fetch(`/api/sync-lyrics/progress?library=${libraryId}`);
      if (response.ok) {
        const data = await response.json();
        progress = data.progress;
        
        if (progress) {
          // Update derived values
          progressPercentage = progress.totalTracks > 0 ? Math.round((progress.processedTracks / progress.totalTracks) * 100) : 0;
          
          const endTime = progress.endTime || new Date();
          elapsedTime = Math.round((endTime.getTime() - progress.startTime.getTime()) / 1000);
        }
        
        // Stop polling if sync is completed or failed
        if (progress && (progress.status === 'completed' || progress.status === 'failed')) {
          stopPolling();
          
          // Refresh the page after a short delay to show updated sync status
          if (progress.status === 'completed') {
            setTimeout(() => {
              invalidateAll();
            }, 2000);
          }
        }
      }
    } catch (err) {
      error = "Failed to fetch progress";
      console.error("Error fetching progress:", err);
    }
  }

  function startPolling(): void {
    // Poll every 2 seconds
    pollingInterval = setInterval(fetchProgress, 2000);
  }

  function stopPolling(): void {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = undefined;
    }
  }

  onMount(() => {
    // Initial fetch
    fetchProgress();
    // Start polling
    startPolling();
  });

  onDestroy(() => {
    stopPolling();
  });
</script>

{#if progress}
  <div class="card preset-filled-surface-100-900 border-[1px] border-surface-200-800 p-4 mb-4">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        {#if progress.status === 'running'}
          <Download class="size-5 animate-pulse" />
        {:else if progress.status === 'completed'}
          <CheckCircle class="size-5 text-green-500" />
        {:else if progress.status === 'failed'}
          <XCircle class="size-5 text-red-500" />
        {:else}
          <Clock class="size-5" />
        {/if}
        <h3 class="text-lg font-semibold">
          {#if progress.status === 'running'}
            Syncing Lyrics...
          {:else if progress.status === 'completed'}
            Sync Completed
          {:else if progress.status === 'failed'}
            Sync Failed
          {:else}
            Sync Pending
          {/if}
        </h3>
      </div>
      <div class="text-sm text-gray-600">
        {formatTime(elapsedTime)}
      </div>
    </div>

    <div class="mb-3">
      <div class="flex items-center gap-3 mb-2">
        <ProgressRing
          value={progressPercentage}
          max={100}
          size="size-12"
        />
        <div class="flex-1">
          <div class="flex justify-between text-sm">
            <span>{progress.processedTracks} / {progress.totalTracks} tracks processed</span>
            <span>{progressPercentage}%</span>
          </div>
        </div>
      </div>
    </div>

    {#if progress.currentTrack && progress.status === 'running'}
      <div class="text-sm text-gray-600 mb-2">
        Currently processing: <span class="font-medium">{progress.currentTrack}</span>
      </div>
    {/if}

    <div class="flex gap-4 text-sm">
      <div class="flex items-center gap-1">
        <CheckCircle class="size-4 text-green-500" />
        <span>{progress.syncedTracks} synced</span>
      </div>
      <div class="flex items-center gap-1">
        <XCircle class="size-4 text-red-500" />
        <span>{progress.failedTracks} failed</span>
      </div>
    </div>

    {#if progress.status === 'completed'}
      <div class="mt-3 p-2 bg-green-100 text-green-800 rounded text-sm">
        Successfully synced {progress.syncedTracks} tracks. {progress.failedTracks} tracks failed.
      </div>
    {:else if progress.status === 'failed'}
      <div class="mt-3 p-2 bg-red-100 text-red-800 rounded text-sm">
        Sync operation failed. Please try again.
      </div>
    {/if}
  </div>
{:else if error}
  <div class="card preset-filled-surface-100-900 border-[1px] border-surface-200-800 p-4 mb-4">
    <div class="text-red-600">{error}</div>
  </div>
{/if} 