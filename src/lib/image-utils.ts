// Generic fallback images for different entity types
export const FALLBACK_IMAGES = {
  library: "/images/fallback/library.svg",
  artist: "/images/fallback/artist.svg", 
  album: "/images/fallback/album.svg",
} as const;


/**
 * Get the appropriate image URL for an entity, falling back to a generic image if none is provided
 */
export function getImageUrl(
  image: string | null | undefined,
  entityType: keyof typeof FALLBACK_IMAGES,
  serverConfiguration?: { hostname: string; port: number; xPlexToken: string }
): string {
  if (!image || image.trim() === "") {
    return FALLBACK_IMAGES[entityType];
  }
  
  // If it's a "no-plex" placeholder, use fallback
  if (image === "no-plex") {
    return FALLBACK_IMAGES[entityType];
  }
  
  // If we have server configuration, construct the full Plex URL
  if (serverConfiguration) {
    const baseURL = `${serverConfiguration.hostname}:${serverConfiguration.port}`;
    const plexAuthToken = `?X-Plex-Token=${serverConfiguration.xPlexToken}`;
    return baseURL + image + plexAuthToken;
  }
  
  // If no server config but image exists, return as is (might be a full URL)
  return image;
}

/**
 * Get library image URL with fallback
 */
export function getLibraryImageUrl(
  image: string | null | undefined,
  serverConfiguration?: { hostname: string; port: number; xPlexToken: string }
): string {
  return getImageUrl(image, "library", serverConfiguration);
}

/**
 * Get artist image URL with fallback
 */
export function getArtistImageUrl(
  image: string | null | undefined,
  serverConfiguration?: { hostname: string; port: number; xPlexToken: string }
): string {
  return getImageUrl(image, "artist", serverConfiguration);
}

/**
 * Get album image URL with fallback
 */
export function getAlbumImageUrl(
  image: string | null | undefined,
  serverConfiguration?: { hostname: string; port: number; xPlexToken: string }
): string {
  return getImageUrl(image, "album", serverConfiguration);
} 