<script lang="ts">
  import type { ArtistWithAlbumCount } from "$lib/types";
  import { Search, X } from "lucide-svelte";

  const { 
    artists, 
    onSearchChange 
  }: { 
    artists: ArtistWithAlbumCount[];
    onSearchChange: (filteredArtists: ArtistWithAlbumCount[]) => void;
  } = $props();

  let searchQuery = $state("");
  let isSearchFocused = $state(false);
  let searchInput: HTMLInputElement;

  // Filter artists based on search query
  const filteredArtists = $derived(
    !searchQuery.trim() 
      ? artists 
      : artists.filter(artist => {
          // Skip the placeholder artist
          if (artist.library === "hide_me") {
            return false;
          }
          
          const query = searchQuery.toLowerCase().trim();
          
          // Search in artist title
          if (artist.title.toLowerCase().includes(query)) {
            return true;
          }
          
          // Search in summary if available
          if (artist.summary && artist.summary.toLowerCase().includes(query)) {
            return true;
          }
          
          return false;
        })
  );

  // Update parent component when filtered results change
  $effect(() => {
    onSearchChange(filteredArtists);
  });

  function clearSearch(): void {
    searchQuery = "";
    searchInput?.focus();
  }

  function handleSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    searchQuery = target.value;
  }

  function handleKeydown(event: KeyboardEvent): void {
    // Clear search with Escape key
    if (event.key === "Escape" && searchQuery) {
      clearSearch();
      event.preventDefault();
    }
    
    // Focus search with Ctrl/Cmd + K
    if ((event.ctrlKey || event.metaKey) && event.key === "k") {
      event.preventDefault();
      searchInput?.focus();
    }
  }

  // Add global keyboard listener
  $effect(() => {
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("keydown", handleKeydown);
    };
  });

  // Highlight search terms in text
  function highlightText(text: string, query: string): string {
    if (!query.trim()) return text;
    
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">$1</mark>');
  }
</script>

<div class="mb-6">
  <div class="relative max-w-md">
    <div class="relative">
      <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 text-surface-500-400 size-4" />
      <input
        bind:this={searchInput}
        type="text"
        placeholder="Search artists... (Ctrl+K)"
        class="w-full pl-10 pr-10 py-2 border border-surface-300-600 rounded-lg bg-surface-50-950 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
        value={searchQuery}
        oninput={handleSearchInput}
        onfocus={() => isSearchFocused = true}
        onblur={() => isSearchFocused = false}
      />
      {#if searchQuery}
        <button
          type="button"
          class="absolute right-3 top-1/2 transform -translate-y-1/2 text-surface-500-400 hover:text-surface-700-300 transition-colors duration-200"
          onclick={clearSearch}
          title="Clear search (Esc)"
        >
          <X class="size-4" />
        </button>
      {/if}
    </div>
    
    {#if searchQuery && filteredArtists.length > 0}
      <div class="mt-2 text-sm text-surface-600-400">
        Found {filteredArtists.length} artist{filteredArtists.length === 1 ? '' : 's'}
        {#if filteredArtists.length < artists.length - 1}
          <span class="text-surface-500-400"> • {artists.length - 1 - filteredArtists.length} hidden</span>
        {/if}
      </div>
    {/if}
    
    {#if searchQuery && filteredArtists.length === 0}
      <div class="mt-2 text-sm text-surface-600-400">
        No artists found matching "{searchQuery}"
      </div>
    {/if}
  </div>
</div> 