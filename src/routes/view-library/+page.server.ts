import type { ArtistWithAlbumCount, ServerLoadValues } from "$lib/types";
import { getAllArtistsInLibraryWithAlbumCounts } from "$lib/server/db/query-utils";
import { redirect } from "@sveltejs/kit";

export const load = async ({ parent }: { parent: () => Promise<ServerLoadValues> }) => {
  const { currentLibrary, serverConfiguration }: ServerLoadValues = await parent();

  // If no server configuration, redirect to add server
  if (!serverConfiguration) {
    redirect(302, "/add-server");
  }

  // If no current library is selected, redirect to library selection
  if (!currentLibrary) {
    redirect(302, "/select-library");
  }

  // Get artists for the current library
  const returnedArtists = await getAllArtistsInLibraryWithAlbumCounts(currentLibrary.uuid);

  // this is to mitigate weird skeleton ui v3 bug with cards
  returnedArtists.unshift({
    title: "",
    uuid: "",
    image: "",
    key: "",
    synced: false,
    library: "hide_me",
    summary: null,
    createdAt: null,
    updatedAt: null,
    totalAlbums: 1,
    albumsSynced: 0,
  });

  // Return the data that will be available to the page
  return {
    currentLibrary,
    serverConfiguration,
    returnedArtists,
  };
}; 