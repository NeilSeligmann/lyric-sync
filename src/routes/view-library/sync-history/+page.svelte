<script lang="ts">
  import { goto } from "$app/navigation";
  import { AlertCircle, ArrowLeft, CheckCircle, ChevronLeft, ChevronRight, Clock, Download, Filter, RefreshCw, XCircle } from "lucide-svelte";
  import { onMount } from "svelte";

  interface SyncAttempt {
    id: number;
    library_id: string;
    library_title: string | null;
    start_time: number;
    end_time: number | null;
    status: "pending" | "running" | "completed" | "failed";
    sync_type: "bulk" | "individual" | "retry" | "check_existing" | "scheduled" | "comprehensive";
    total_tracks: number;
    processed_tracks: number;
    synced_tracks: number;
    failed_tracks: number;
    results_json: string | null;
    success_rate: number;
    duration_ms: number | null;
    duration_formatted: string | null;
    start_time_formatted: string;
    end_time_formatted: string | null;
  }

  interface PaginationInfo {
    page: number;
    limit: number;
    total_count: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  }

  let attempts: SyncAttempt[] = [];
  let pagination: PaginationInfo | null = null;
  let loading = false;
  let error: string | null = null;

  // Filter state
  let statusFilter = "";
  let syncTypeFilter = "";
  let startDateFilter = "";
  let endDateFilter = "";
  let orderBy = "start_time";
  let orderDirection = "desc";

  // Pagination state
  let currentPage = 1;
  const pageSize = 20;

  // Get library ID from URL params
  let libraryId = "";

  const statusOptions = [
    { value: "", label: "All Statuses" },
    { value: "pending", label: "Pending" },
    { value: "running", label: "Running" },
    { value: "completed", label: "Completed" },
    { value: "failed", label: "Failed" },
  ];

  const syncTypeOptions = [
    { value: "", label: "All Types" },
    { value: "bulk", label: "Bulk Sync" },
    { value: "individual", label: "Individual Track" },
    { value: "retry", label: "Retry Failed" },
    { value: "check_existing", label: "Check Existing" },
    { value: "scheduled", label: "Scheduled" },
    { value: "comprehensive", label: "Comprehensive" },
  ];

  const orderByOptions = [
    { value: "start_time", label: "Start Time" },
    { value: "end_time", label: "End Time" },
    { value: "total_tracks", label: "Total Tracks" },
    { value: "synced_tracks", label: "Synced Tracks" },
  ];

  async function fetchSyncAttempts() {
    loading = true;
    error = null;

    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
        order_by: orderBy,
        order_direction: orderDirection,
        library_id: libraryId,
      });

      if (statusFilter)
        params.append("status", statusFilter);
      if (syncTypeFilter)
        params.append("sync_type", syncTypeFilter);
      if (startDateFilter)
        params.append("start_date", startDateFilter);
      if (endDateFilter)
        params.append("end_date", endDateFilter);

      const response = await fetch(`/api/sync-attempts?${params}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      attempts = data.attempts;
      pagination = data.pagination;
    }
    catch (err) {
      error = err instanceof Error ? err.message : "Failed to fetch sync attempts";
      console.error("Error fetching sync attempts:", err);
    }
    finally {
      loading = false;
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case "running":
        return Download;
      case "completed":
        return CheckCircle;
      case "failed":
        return XCircle;
      case "pending":
        return Clock;
      default:
        return AlertCircle;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case "running":
        return "text-blue-500";
      case "completed":
        return "text-green-500";
      case "failed":
        return "text-red-500";
      case "pending":
        return "text-yellow-500";
      default:
        return "text-gray-500";
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleString();
  }

  function goToPage(page: number) {
    if (page >= 1 && page <= (pagination?.total_pages || 1)) {
      currentPage = page;
      fetchSyncAttempts();
    }
  }

  function applyFilters() {
    currentPage = 1; // Reset to first page when applying filters
    fetchSyncAttempts();
  }

  function clearFilters() {
    statusFilter = "";
    syncTypeFilter = "";
    startDateFilter = "";
    endDateFilter = "";
    orderBy = "start_time";
    orderDirection = "desc";
    currentPage = 1;
    fetchSyncAttempts();
  }

  function goBack() {
    goto("/view-library");
  }

  onMount(() => {
    // Get library ID from URL or page data
    const urlParams = new URLSearchParams(window.location.search);
    libraryId = urlParams.get("library_id") || "";

    if (!libraryId) {
      // Try to get from page data if available
      // This would need to be passed from the parent page
      error = "Library ID not found";
      return;
    }

    fetchSyncAttempts();
  });
</script>

<svelte:head>
  <title>Library Sync History - Lyric Sync</title>
</svelte:head>

<div class="container mx-auto p-4 space-y-6">
  <div class="flex items-center justify-between mb-6">
    <div class="flex items-center gap-4">
      <button class="btn btn-ghost btn-sm" on:click={goBack}>
        <ArrowLeft class="size-4" />
      </button>
      <h1 class="text-2xl font-bold">Library Sync History</h1>
    </div>
    <button class="btn btn-ghost btn-sm" on:click={fetchSyncAttempts} disabled={loading}>
      <RefreshCw class="size-4" />
    </button>
  </div>

  <!-- Filters -->
  <div class="card p-4">
    <div class="flex items-center gap-2 mb-4">
      <Filter class="size-5" />
      <h2 class="text-lg font-semibold">Filters</h2>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label for="status-filter" class="label">Status</label>
        <select id="status-filter" bind:value={statusFilter} class="select select-filled">
          {#each statusOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>

      <div>
        <label for="sync-type-filter" class="label">Sync Type</label>
        <select id="sync-type-filter" bind:value={syncTypeFilter} class="select select-filled">
          {#each syncTypeOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>

      <div>
        <label for="start-date-filter" class="label">Start Date</label>
        <input
          id="start-date-filter"
          bind:value={startDateFilter}
          class="input input-filled"
          type="date"
        />
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
      <div>
        <label for="end-date-filter" class="label">End Date</label>
        <input
          id="end-date-filter"
          bind:value={endDateFilter}
          class="input input-filled"
          type="date"
        />
      </div>

      <div>
        <label for="order-by-filter" class="label">Order By</label>
        <select id="order-by-filter" bind:value={orderBy} class="select select-filled">
          {#each orderByOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>

      <div>
        <label for="order-direction-filter" class="label">Order Direction</label>
        <select id="order-direction-filter" bind:value={orderDirection} class="select select-filled">
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </div>

      <div class="flex items-end gap-2">
        <button class="btn btn-filled" on:click={applyFilters} disabled={loading}>
          Apply Filters
        </button>
        <button class="btn btn-ghost" on:click={clearFilters} disabled={loading}>
          Clear
        </button>
      </div>
    </div>
  </div>

  <!-- Results -->
  <div class="card p-4">
    {#if loading}
      <div class="flex items-center justify-center py-8">
        <RefreshCw class="size-6 animate-spin" />
        <span class="ml-2">Loading...</span>
      </div>
    {:else if error}
      <div class="text-red-500 text-center py-8">
        Error: {error}
      </div>
    {:else if attempts.length === 0}
      <div class="text-center py-8 text-gray-500">
        No sync attempts found for this library.
      </div>
    {:else}
      <table class="table table-hover">
        <thead>
          <tr>
            <th>Status</th>
            <th>Sync Type</th>
            <th>Start Time</th>
            <th>Duration</th>
            <th>Total Tracks</th>
            <th>Synced</th>
            <th>Failed</th>
            <th>Success Rate</th>
          </tr>
        </thead>
        <tbody>
          {#each attempts as attempt}
            <tr>
              <td>
                <div class="flex items-center gap-2">
                  <svelte:component this={getStatusIcon(attempt.status)} class="size-4 {getStatusColor(attempt.status)}" />
                  <span class="capitalize">{attempt.status}</span>
                </div>
              </td>
              <td>
                <span class="capitalize">{attempt.sync_type.replace("_", " ")}</span>
              </td>
              <td>
                {formatDate(attempt.start_time_formatted)}
              </td>
              <td>
                {attempt.duration_formatted || "-"}
              </td>
              <td>{attempt.total_tracks}</td>
              <td class="text-green-600">{attempt.synced_tracks}</td>
              <td class="text-red-600">{attempt.failed_tracks}</td>
              <td>
                <span class="font-semibold {attempt.success_rate >= 80 ? "text-green-600" : attempt.success_rate >= 50 ? "text-yellow-600" : "text-red-600"}">
                  {attempt.success_rate}%
                </span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>

      <!-- Pagination -->
      {#if pagination && pagination.total_pages > 1}
        <div class="flex items-center justify-between mt-4">
          <div class="text-sm text-gray-600">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total_count)} of {pagination.total_count} results
          </div>

          <div class="flex items-center gap-2">
            <button
              class="btn btn-ghost btn-sm"
              on:click={() => goToPage(pagination!.page - 1)}
              disabled={!pagination.has_prev}
            >
              <ChevronLeft class="size-4" />
            </button>

            <span class="text-sm">
              Page {pagination.page} of {pagination.total_pages}
            </span>

            <button
              class="btn btn-ghost btn-sm"
              on:click={() => goToPage(pagination!.page + 1)}
              disabled={!pagination.has_next}
            >
              <ChevronRight class="size-4" />
            </button>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>
