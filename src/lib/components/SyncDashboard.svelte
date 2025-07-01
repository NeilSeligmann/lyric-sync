<script lang="ts">
  import type { InferredSelectLibrarySchema } from "$lib/types";
  import { AppBar, ProgressRing } from "@skeletonlabs/skeleton-svelte";
  import { RefreshCw, Play, AlertCircle, CheckCircle, Clock, Download, XCircle, ChevronDown, ChevronUp, FileText, Music, BarChart3 } from "lucide-svelte";
  import { onMount, onDestroy } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import type { SyncProgress } from "$lib/server/sync-progress";
  import type { SyncTrackResponse } from "$lib/types";
  import SyncSpeedChart from "./SyncSpeedChart.svelte";

  const { library }: { library: InferredSelectLibrarySchema } = $props();

  let stats = $state({
    totalTracks: 0,
    syncedTracks: 0,
    noLyricsTracks: 0,
    pendingRetryTracks: 0,
    newTracks: 0
  });

  let loading = $state(false);
  let lastUpdated = $state<Date | null>(null);

  // Progress tracking
  let progress: SyncProgress | null = $state(null);
  let pollingInterval: ReturnType<typeof setInterval> | undefined = $state(undefined);
  let error: string | null = $state(null);
  let progressPercentage = $state(0);
  let elapsedTime = $state(0);
  let processingSpeed = $state(0); // tracks per second
  let estimatedTimeRemaining = $state(0); // seconds
  let showDetailedResults = $state(false);
  let showSpeedChart = $state(false);
  
  // Speed tracking over time
  let speedData = $state<Array<{ timestamp: number; tracksPerSecond: number }>>([]);
  let lastProcessedCount = $state(0);
  let lastSpeedUpdate = $state(0);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Get recent results (last 10)
  const recentResults = $derived.by(() => {
    if (!progress?.results) return [];
    return (progress.results as SyncTrackResponse[]).slice(-10).reverse(); // Show most recent first
  });

  // Calculate processing speed and ETA
  const calculateProcessingMetrics = () => {
    if (!progress || progress.processedTracks === 0) {
      processingSpeed = 0;
      estimatedTimeRemaining = 0;
      return;
    }

    const elapsed = (Date.now() - progress.startTime) / 1000;
    processingSpeed = elapsed > 0 ? progress.processedTracks / elapsed : 0;
    
    const remainingTracks = progress.totalTracks - progress.processedTracks;
    estimatedTimeRemaining = processingSpeed > 0 ? remainingTracks / processingSpeed : 0;
    
    // Track speed data over time
    const now = Date.now();
    if (progress.status === 'running' && 
        (progress.processedTracks !== lastProcessedCount || now - lastSpeedUpdate > 5000)) {
      
      // Calculate instantaneous speed (tracks processed since last update)
      if (lastProcessedCount > 0 && lastSpeedUpdate > 0) {
        const timeDiff = (now - lastSpeedUpdate) / 1000;
        const tracksDiff = progress.processedTracks - lastProcessedCount;
        const instantSpeed = timeDiff > 0 ? tracksDiff / timeDiff : 0;
        
        if (instantSpeed > 0) {
          speedData = [...speedData, { timestamp: now, tracksPerSecond: instantSpeed }];
          
          // Keep only last 50 data points to prevent memory issues
          if (speedData.length > 50) {
            speedData = speedData.slice(-50);
          }
        }
      }
      
      lastProcessedCount = progress.processedTracks;
      lastSpeedUpdate = now;
    }
  };

  async function fetchStats(): Promise<void> {
    try {
      const response = await fetch(`/api/sync-lyrics/stats?library=${library.uuid}`);
      if (response.ok) {
        const data = await response.json();
        // Map backend failedTracks to frontend noLyricsTracks
        stats = {
          ...data.stats,
          noLyricsTracks: data.stats.failedTracks
        };
        lastUpdated = new Date();
      }
    } catch (error) {
      console.error("Failed to fetch sync stats:", error);
    }
  }

  async function fetchProgress(): Promise<void> {
    try {
      const response = await fetch(`/api/sync-lyrics/progress?library=${library.uuid}`);
      if (response.ok) {
        const data = await response.json();
        progress = data.progress;
        
        if (progress) {
          // Update derived values
          progressPercentage = progress.totalTracks > 0 ? Math.round((progress.processedTracks / progress.totalTracks) * 100) : 0;
          
          const endTime = progress.endTime || Date.now();
          elapsedTime = Math.round((endTime - progress.startTime) / 1000);
          
          // Calculate processing metrics
          calculateProcessingMetrics();
        }
        
        // Stop polling if sync is completed or failed
        if (progress && (progress.status === 'completed' || progress.status === 'failed')) {
          stopPolling();
          
          // Refresh stats and page after a short delay to show updated sync status
          if (progress.status === 'completed') {
            setTimeout(() => {
              fetchStats();
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

  async function triggerManualSync(mode: "retry" | "new" | "comprehensive"): Promise<void> {
    loading = true;
    // Reset speed tracking for new sync
    speedData = [];
    lastProcessedCount = 0;
    lastSpeedUpdate = 0;
    
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
        // Start polling for progress
        startPolling();
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
    fetchProgress();
    // Start polling for progress
    startPolling();
    // Refresh stats every 30 seconds
    const statsInterval = setInterval(fetchStats, 30000);
    return () => {
      clearInterval(statsInterval);
      stopPolling();
    };
  });

  onDestroy(() => {
    stopPolling();
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

  <!-- Progress Bar - shows current sync progress -->
  {#if progress}
    <div class="mb-6 p-4 bg-surface-50-950 border border-surface-200-800 rounded-lg">
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
          <h4 class="text-md font-semibold">
            {#if progress.status === 'running'}
              Syncing Lyrics...
            {:else if progress.status === 'completed'}
              Sync Completed
            {:else if progress.status === 'failed'}
              Sync Failed
            {:else}
              Sync Pending
            {/if}
          </h4>
        </div>
        <div class="text-sm text-surface-600-400">
          {formatTime(elapsedTime)}
        </div>
      </div>

      <div class="mb-3">
        <div class="flex items-center gap-3 mb-2">
          <ProgressRing
            value={progressPercentage}
            max={100}
            size="size-10"
          />
          <div class="flex-1">
            <div class="flex justify-between text-sm">
              <span>{progress.processedTracks} / {progress.totalTracks} tracks processed</span>
              <span>{progressPercentage}%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Active Tracks Display -->
      {#if progress.activeTracks && progress.activeTracks.length > 0 && progress.status === 'running'}
        <div class="mb-3">
          <div class="text-sm text-surface-600-400 mb-2">
            Batch {progress.currentBatch} of {progress.totalBatches} - Active Tracks ({progress.activeTracks.length}):
          </div>
          <div class="space-y-1 max-h-32 overflow-y-auto">
            {#each progress.activeTracks as track}
              <div class="flex items-center justify-between p-1 bg-surface-100-900 rounded text-xs">
                <div class="flex items-center gap-2 flex-1 min-w-0">
                  {#if track.status === 'processing'}
                    <div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  {:else if track.status === 'completed'}
                    <CheckCircle class="size-3 text-green-500" />
                  {:else if track.status === 'failed'}
                    <XCircle class="size-3 text-red-500" />
                  {/if}
                  <div class="min-w-0 flex-1">
                    <div class="font-medium truncate">
                      {track.artistName} - {track.trackTitle}
                    </div>
                    {#if track.status === 'processing'}
                      <div class="text-xs text-surface-600-400">
                        Processing... ({formatDuration((Date.now() - track.startTime) / 1000)})
                      </div>
                    {:else if track.result}
                      <div class="text-xs text-surface-600-400 truncate">
                        {track.result.message}
                      </div>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Processing Metrics -->
      {#if progress.status === 'running' && processingSpeed > 0}
        <div class="grid grid-cols-2 gap-4 mb-3 text-sm">
          <div class="flex items-center gap-1">
            <Music class="size-4" />
            <span>{processingSpeed.toFixed(1)} tracks/sec</span>
          </div>
          <div class="flex items-center gap-1">
            <Clock class="size-4" />
            <span>ETA: {formatDuration(estimatedTimeRemaining)}</span>
          </div>
        </div>
        
        <!-- Speed Chart Toggle -->
        <div class="mb-3">
          <button 
            class="btn btn-ghost btn-sm flex items-center gap-1"
            onclick={() => showSpeedChart = !showSpeedChart}
          >
            <BarChart3 class="size-4" />
            {#if showSpeedChart}
              Hide Speed Chart
            {:else}
              Show Speed Chart
            {/if}
          </button>
        </div>
        
        <!-- Speed Chart -->
        {#if showSpeedChart && speedData.length > 0}
          <div class="mb-3">
            <SyncSpeedChart data={speedData} height="200px" />
          </div>
        {/if}
        
        <!-- Batch Progress -->
        {#if progress.totalBatches > 1}
          <div class="mb-3 text-sm">
            <div class="flex items-center justify-between mb-1">
              <span class="text-surface-600-400">Batch Progress</span>
              <span>{progress.currentBatch} / {progress.totalBatches}</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-1">
              <div class="bg-blue-600 h-1 rounded-full" style="width: {Math.round((progress.currentBatch / progress.totalBatches) * 100)}%"></div>
            </div>
          </div>
        {/if}
      {/if}

      <div class="flex gap-4 text-sm">
        <div class="flex items-center gap-1">
          <CheckCircle class="size-4 text-green-500" />
          <span>{progress.syncedTracks} synced</span>
        </div>
        <div class="flex items-center gap-1">
          <XCircle class="size-4 text-red-500" />
          <span>{progress.failedTracks} unavailable</span>
        </div>
      </div>

      <!-- Detailed Results Toggle -->
      {#if progress.results && progress.results.length > 0}
        <div class="mt-3">
          <button 
            class="btn btn-ghost btn-sm flex items-center gap-1"
            onclick={() => showDetailedResults = !showDetailedResults}
          >
            {#if showDetailedResults}
              <ChevronUp class="size-4" />
            {:else}
              <ChevronDown class="size-4" />
            {/if}
            Recent Results ({recentResults.length})
          </button>
        </div>

        {#if showDetailedResults}
          <div class="mt-3 max-h-64 overflow-y-auto">
            <div class="space-y-2">
              {#each recentResults as result}
                <div class="flex items-center justify-between p-2 bg-surface-100-900 rounded text-sm">
                  <div class="flex items-center gap-2 flex-1 min-w-0">
                    {#if (result as SyncTrackResponse).synced}
                      <CheckCircle class="size-4 text-green-500 flex-shrink-0" />
                    {:else}
                      <XCircle class="size-4 text-red-500 flex-shrink-0" />
                    {/if}
                    <div class="min-w-0 flex-1">
                      <div class="font-medium truncate">
                        {(result as SyncTrackResponse).message || 'Track processed'}
                      </div>
                      {#if (result as SyncTrackResponse).plainLyrics}
                        <div class="text-xs text-surface-600-400">Plain lyrics</div>
                      {:else}
                        <div class="text-xs text-surface-600-400">Synced lyrics</div>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {/if}

      {#if progress.status === 'completed'}
        <div class="mt-3 p-2 bg-green-100 text-green-800 rounded text-sm">
          Successfully synced {progress.syncedTracks} tracks. {progress.failedTracks} tracks unavailable.
        </div>
        
        <!-- Show final speed chart for completed sync -->
        {#if speedData.length > 0}
          <div class="mt-3">
            <h5 class="text-sm font-medium mb-2">Sync Performance</h5>
            <SyncSpeedChart data={speedData} height="200px" />
          </div>
        {/if}
      {:else if progress.status === 'failed'}
        <div class="mt-3 p-2 bg-red-100 text-red-800 rounded text-sm">
          Sync operation failed. Please try again.
        </div>
      {/if}
    </div>
  {:else if error}
    <div class="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
      <div class="text-red-600">{error}</div>
    </div>
  {/if}

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
      <div class="text-2xl font-bold text-red-500">{stats.noLyricsTracks}</div>
      <div class="text-xs text-surface-600-400">No Lyrics</div>
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
        disabled={loading || stats.pendingRetryTracks === 0 || progress?.status === 'running'}
        onclick={() => triggerManualSync("retry")}
      >
        <RefreshCw class="size-4 mr-1" />
        Retry Unavailable ({stats.pendingRetryTracks})
      </button>
      
      <button 
        class="btn btn-filled btn-sm" 
        disabled={loading || stats.newTracks === 0 || progress?.status === 'running'}
        onclick={() => triggerManualSync("new")}
      >
        <Play class="size-4 mr-1" />
        Sync New ({stats.newTracks})
      </button>
      
      <button 
        class="btn btn-filled btn-sm" 
        disabled={loading || progress?.status === 'running'}
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