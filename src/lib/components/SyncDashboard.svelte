<script lang="ts">
  import type { InferredSelectLibrarySchema } from "$lib/types";
  import { AppBar, ProgressRing } from "@skeletonlabs/skeleton-svelte";
  import { RefreshCw, Play, AlertCircle, CheckCircle, Clock } from "lucide-svelte";
  import { onMount } from "svelte";

  const { library }: { library: InferredSelectLibrarySchema } = $props();

  let stats = $state({
    totalTracks: 0,
    syncedTracks: 0,
    failedTracks: 0,
    pendingRetryTracks: 0,
    newTracks: 0
  });

  let loading = $state(false);
  let lastUpdated = $state<Date | null>(null);

  async function fetchStats(): Promise<void> {
    try {
      const response = await fetch(`/api/sync-lyrics/stats?library=${library.uuid}`);
      if (response.ok) {
        const data = await response.json();
        stats = data.stats;
        lastUpdated = new Date();
      }
    } catch (error) {
      console.error("Failed to fetch sync stats:", error);
    }
  }

  async function triggerManualSync(mode: "retry" | "new" | "comprehensive"): Promise<void> {
    loading = true;
    try {
      const response = await fetch("/api/sync-lyrics/manual-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ library: library.uuid, mode }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`Manual sync started: ${result.message}`);
        // Refresh stats after a short delay
        setTimeout(fetchStats, 2000);
      } else {
        const error = await response.json();
        console.error("Manual sync failed:", error.error);
      }
    } catch (error) {
      console.error("Error triggering manual sync:", error);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchStats();
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  });

  const syncPercentage = $derived(stats.totalTracks > 0 ? Math.round((stats.syncedTracks / stats.totalTracks) * 100) : 0);
</script>

<div class="card p-4">
  <header class="flex items-center justify-between mb-4">
    <h3 class="text-lg font-semibold">Sync Dashboard</h3>
    <button class="btn btn-ghost btn-sm" onclick={fetchStats} disabled={loading}>
      <RefreshCw class="size-4" />
    </button>
  </header>

  <!-- Progress Overview -->
  <div class="mb-6">
    <div class="flex justify-between items-center mb-2">
      <span class="text-sm font-medium">Overall Progress</span>
      <span class="text-sm text-surface-600-400">{syncPercentage}%</span>
    </div>
    <div class="w-full bg-gray-200 rounded-full h-2 mb-2">
      <div class="bg-blue-600 h-2 rounded-full" style="width: {syncPercentage}%"></div>
    </div>
    <div class="text-xs text-surface-600-400">
      {stats.syncedTracks} of {stats.totalTracks} tracks synced
    </div>
  </div>

  <!-- Stats Grid -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
    <div class="text-center">
      <div class="flex items-center justify-center mb-1">
        <CheckCircle class="size-5 text-green-500" />
      </div>
      <div class="text-2xl font-bold text-green-500">{stats.syncedTracks}</div>
      <div class="text-xs text-surface-600-400">Synced</div>
    </div>
    
    <div class="text-center">
      <div class="flex items-center justify-center mb-1">
        <AlertCircle class="size-5 text-red-500" />
      </div>
      <div class="text-2xl font-bold text-red-500">{stats.failedTracks}</div>
      <div class="text-xs text-surface-600-400">Failed</div>
    </div>
    
    <div class="text-center">
      <div class="flex items-center justify-center mb-1">
        <Clock class="size-5 text-yellow-500" />
      </div>
      <div class="text-2xl font-bold text-yellow-500">{stats.pendingRetryTracks}</div>
      <div class="text-xs text-surface-600-400">Pending Retry</div>
    </div>
    
    <div class="text-center">
      <div class="flex items-center justify-center mb-1">
        <Play class="size-5 text-blue-500" />
      </div>
      <div class="text-2xl font-bold text-blue-500">{stats.newTracks}</div>
      <div class="text-xs text-surface-600-400">New Tracks</div>
    </div>
  </div>

  <!-- Manual Sync Controls -->
  <div class="space-y-2">
    <h4 class="text-sm font-medium">Manual Sync</h4>
    <div class="flex flex-wrap gap-2">
      <button 
        class="btn btn-filled btn-sm" 
        disabled={loading || stats.pendingRetryTracks === 0}
        onclick={() => triggerManualSync("retry")}
      >
        <RefreshCw class="size-4 mr-1" />
        Retry Failed ({stats.pendingRetryTracks})
      </button>
      
      <button 
        class="btn btn-filled btn-sm" 
        disabled={loading || stats.newTracks === 0}
        onclick={() => triggerManualSync("new")}
      >
        <Play class="size-4 mr-1" />
        Sync New ({stats.newTracks})
      </button>
      
      <button 
        class="btn btn-filled btn-sm" 
        disabled={loading}
        onclick={() => triggerManualSync("comprehensive")}
      >
        <RefreshCw class="size-4 mr-1" />
        Comprehensive
      </button>
    </div>
  </div>

  {#if lastUpdated}
    <div class="text-xs text-surface-600-400 mt-4">
      Last updated: {lastUpdated.toLocaleTimeString()}
    </div>
  {/if}
</div> 