<script lang="ts">
  import type { InferredSelectArtistSchema } from "$lib/types";

  import { ProgressRing } from "@skeletonlabs/skeleton-svelte";
  import AlbumCard from "$lib/components/AlbumCard.svelte";
  import { getArtistImageUrl } from "$lib/image-utils";
  import { fade } from "svelte/transition";

  import type { PageData } from "./$types";

  const { data }: { data: PageData } = $props();
  // TODO: Move this to the server side maybe...

  const artist: InferredSelectArtistSchema | undefined = $derived.by(() => {
    return data.returnedArtist;
  });

  let loading: boolean = $state(true);

  function imageLoaded(): void {
    loading = false;
  }
</script>

<div class="px-2 py-1 grid grid-cols-1 w-full space-y-3">
  <div class="card preset-filled-surface-100-900 border-[1px] border-surface-200-800 w-full h-56 p-4 flex">
    {#if artist}
      <img src={getArtistImageUrl(artist.image, data.serverConfiguration)} class="h-48" alt="Artist Artwork"
           class:hidden={loading}
           transition:fade
           onload={imageLoaded} />
      <div class:hidden={!loading}>
        <ProgressRing value={null} size="size-48" meterStroke="stroke-primary-600-400" trackStroke="stroke-secondary-50-950" />
      </div>
      <span class="text-ellipsis overflow-hidden content-center text-left px-3">
        {artist.summary}
      </span>
    {/if}
  </div>
</div>

<div class="px-2 py-1 grid lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
  {#if data.returnedAlbums}
    {#each data.returnedAlbums as album}
      <AlbumCard {album} serverConfiguration={data.serverConfiguration} />
    {/each}
  {/if}
</div>
