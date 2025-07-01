import type { Metadata as Tracks, Root as TracksResponse } from "$lib/plex-api-types/library-sections-key-all-type-10";
import type { Metadata as Artists, Root as ArtistsResponse } from "$lib/plex-api-types/library-sections-key-all-type-8";
import type { Metadata as Albums, Root as AlbumsResponse } from "$lib/plex-api-types/library-sections-key-all-type-9";
import type { Directory, Root } from "$lib/plex-api-types/library-sections";
import type { InferredInsertAlbumSchema, InferredInsertArtistSchema, InferredInsertTrackSchema, InferredInsertLibrarySchema, InferredSelectLibrarySchema, InferredSelectServerSchema } from "$lib/types";

import { logger } from "$lib/logger";
import { albums, artists, libraries, tracks } from "$lib/schema";
import db from "$lib/server/db";
import noPlexAlbums from "$lib/server/db/no-plex-seed/albums";
import noPlexArtists from "$lib/server/db/no-plex-seed/artists";
import noPlexTracks from "$lib/server/db/no-plex-seed/tracks";
import noPlexLibraries from "$lib/server/db/no-plex-seed/libraries";
import { getAllArtistsAlbumsTracksInLibrary } from "$lib/server/db/query-utils";
import env from "$lib/server/env";
import { eq, sql } from "drizzle-orm";
import { toSnakeCase } from "drizzle-orm/casing";

interface PlexSyncOptions {
  mode: "libraries" | "library_content" | "full";
  libraryId?: string;
}

export class PlexSyncService {
  private static instance: PlexSyncService;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): PlexSyncService {
    if (!PlexSyncService.instance) {
      PlexSyncService.instance = new PlexSyncService();
    }
    return PlexSyncService.instance;
  }

  /**
   * Sync Plex libraries and/or their content with the database
   */
  async syncPlexData(options: PlexSyncOptions = { mode: "full" }): Promise<void> {
    const serverConfiguration: InferredSelectServerSchema | undefined = await db.query.servers.findFirst();

    if (!serverConfiguration) {
      logger.warn("No server configuration found, skipping Plex sync");
      return;
    }

    try {
      switch (options.mode) {
        case "libraries":
          await this.syncLibraries(serverConfiguration);
          break;
        case "library_content":
          if (!options.libraryId) {
            logger.error("Library ID required for library_content sync mode");
            return;
          }
          await this.syncLibraryContent(serverConfiguration, options.libraryId);
          break;
        case "full":
        default:
          await this.syncLibraries(serverConfiguration);
          const allLibraries = await db.query.libraries.findMany();
          for (const library of allLibraries) {
            await this.syncLibraryContent(serverConfiguration, library.uuid);
          }
          break;
      }
    } catch (error) {
      logger.error("Error during Plex sync:", error);
      throw error;
    }
  }

  /**
   * Initial setup for a newly added library - syncs both metadata and content
   */
  async setupNewLibrary(libraryId: string): Promise<void> {
    const serverConfiguration: InferredSelectServerSchema | undefined = await db.query.servers.findFirst();

    if (!serverConfiguration) {
      logger.warn("No server configuration found, skipping new library setup");
      return;
    }

    logger.info(`Setting up new library: ${libraryId}`);

    try {
      // First sync libraries to ensure the library exists in the database
      await this.syncLibraries(serverConfiguration);
      
      // Then sync the specific library's content
      await this.syncLibraryContent(serverConfiguration, libraryId);
      
      logger.info(`Successfully set up new library: ${libraryId}`);
    } catch (error) {
      logger.error(`Error setting up new library ${libraryId}:`, error);
      throw error;
    }
  }

  /**
   * Sync Plex libraries (metadata only, not content)
   */
  private async syncLibraries(serverConfiguration: InferredSelectServerSchema): Promise<void> {
    logger.info("Starting Plex libraries sync...");

    let databaseLibraries: Array<InferredInsertLibrarySchema> = [];
    let plexLibraries: Array<InferredInsertLibrarySchema> = [];

    // Get libraries from database
    const returned: Array<InferredSelectLibrarySchema> | undefined = await db.query.libraries.findMany({
      where: eq(libraries.serverName, serverConfiguration.serverName),
    });

    if (returned) {
      databaseLibraries = returned.map(({ serverName, path, title, uuid, image, key, currentLibrary }) => {
        return {
          serverName,
          path,
          title,
          uuid,
          image,
          key,
          currentLibrary,
        };
      });
    }

    if (env.NO_PLEX === "true") {
      plexLibraries = noPlexLibraries;
    } else {
      // Get Plex libraries
      const baseURL: string = `${serverConfiguration?.hostname}:${serverConfiguration?.port}`;
      const plexAuthToken: string = `?X-Plex-Token=${serverConfiguration?.xPlexToken}`;
      const response: Response = await fetch(`${baseURL}/library/sections${plexAuthToken}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (response.ok) {
        const LibrarySectionsResponse: Root = await response.json();
        const plexDirectories: Array<Directory> = LibrarySectionsResponse.MediaContainer.Directory.filter(e => e.type === "artist" && !e.hidden);

        plexLibraries = plexDirectories.map((library) => {
          return {
            serverName: serverConfiguration.serverName,
            path: library.Location[0].path,
            title: library.title,
            uuid: library.uuid,
            image: library.composite,
            key: library.key,
          };
        });
      } else {
        logger.error("Failed to fetch Plex libraries");
        return;
      }
    }

    // Remove libraries that no longer exist in Plex
    await Promise.all(databaseLibraries.map((databaseLibrary) => {
      const doesUUIDExistInPlexLibraries: InferredInsertLibrarySchema | undefined = plexLibraries.find(plexLibrary => plexLibrary.uuid === databaseLibrary.uuid);
      if (doesUUIDExistInPlexLibraries) {
        return null;
      } else {
        logger.info(`Removing library ${databaseLibrary.title} (${databaseLibrary.uuid}) - no longer exists in Plex`);
        return db.delete(libraries).where(eq(libraries.uuid, databaseLibrary.uuid));
      }
    }));

    // Upsert libraries
    const updatedLibraries: Array<InferredSelectLibrarySchema> = await db.insert(libraries).values(plexLibraries).onConflictDoUpdate({
      target: libraries.uuid,
      set: {
        serverName: sql.raw(`excluded.${toSnakeCase(libraries.serverName.name)}`),
        path: sql.raw(`excluded.${toSnakeCase(libraries.path.name)}`),
        title: sql.raw(`excluded.${toSnakeCase(libraries.title.name)}`),
        image: sql.raw(`excluded.${toSnakeCase(libraries.image.name)}`),
      },
    }).returning();

    logger.info(`Plex libraries sync completed. Updated ${updatedLibraries.length} libraries`);
  }

  /**
   * Sync content (artists, albums, tracks) for a specific library
   */
  private async syncLibraryContent(serverConfiguration: InferredSelectServerSchema, libraryUUID: string): Promise<void> {
    const library: InferredSelectLibrarySchema | undefined = await db.query.libraries.findFirst({
      where: eq(libraries.uuid, libraryUUID),
    });

    if (!library) {
      logger.warn(`Library ${libraryUUID} not found in database`);
      return;
    }

    logger.info(`Starting content sync for library: ${library.title} (${libraryUUID})`);

    let libraryArtists: Array<InferredInsertArtistSchema> = [];
    let plexLibraryArtists: Array<InferredInsertArtistSchema> = [];
    let artistAlbums: Array<InferredInsertAlbumSchema> = [];
    let plexArtistAlbums: Array<InferredInsertAlbumSchema> = [];
    let albumTracks: Array<InferredInsertTrackSchema> = [];
    let plexAlbumTracks: Array<InferredInsertTrackSchema> = [];

    // Get existing data from database
    const { returnedArtists, returnedAlbums, returnedTracks } = await getAllArtistsAlbumsTracksInLibrary(libraryUUID);

    if (returnedArtists) {
      libraryArtists = returnedArtists.map(({ title, uuid, image, key, summary, synced, library }) => {
        return { title, uuid, image, key, summary, synced, library };
      });
    }

    if (returnedAlbums) {
      artistAlbums = returnedAlbums.map(({ title, uuid, image, key, summary, synced, library, artist }) => {
        return { title, uuid, image, key, summary, synced, library, artist };
      });
    }

    if (returnedTracks) {
      albumTracks = returnedTracks.map(({ title, uuid, key, path, synced, library, artist, album, duration, trackNumber }) => {
        return { title, uuid, key, path, synced, library, artist, album, duration, trackNumber };
      });
    }

    if (env.NO_PLEX === "true") {
      plexLibraryArtists = noPlexArtists;
      plexArtistAlbums = noPlexAlbums;
      plexAlbumTracks = noPlexTracks;
    } else {
      const baseURL: string = `${serverConfiguration?.hostname}:${serverConfiguration?.port}`;
      const plexAuthToken: string = `X-Plex-Token=${serverConfiguration?.xPlexToken}`;

      // Sync artists
      const artistsResponse: Response = await fetch(`${baseURL}/library/sections/${library?.key}/all?type=8&${plexAuthToken}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (artistsResponse.ok) {
        const artistsJSON: ArtistsResponse = await artistsResponse.json();
        const plexArtists: Array<Artists> = artistsJSON.MediaContainer.Metadata;

        plexLibraryArtists = plexArtists.map((artist) => {
          return {
            title: artist.title,
            uuid: artist.guid,
            image: (artist.thumb ? artist.thumb : artist.art) ?? null,
            key: artist.key,
            summary: artist.summary,
            library: artistsJSON.MediaContainer.librarySectionUUID,
          };
        });

        logger.info(`Found ${plexArtists.length} artists in Plex for library ${libraryUUID}`);

        // Remove artists that no longer exist in Plex
        await Promise.all(libraryArtists.map((libraryArtist) => {
          const doesUUIDExistInPlexLibraryArtists: InferredInsertArtistSchema | undefined = plexLibraryArtists.find(plexLibraryArtist => plexLibraryArtist.uuid === libraryArtist.uuid);
          if (doesUUIDExistInPlexLibraryArtists) {
            return null;
          } else {
            logger.info(`Removing artist ${libraryArtist.title} (${libraryArtist.uuid}) - no longer exists in Plex`);
            return db.delete(artists).where(eq(artists.uuid, libraryArtist.uuid));
          }
        }));
      } else {
        logger.error(`Failed to fetch artists for library ${libraryUUID}`);
      }

      // Sync albums
      const albumsResponse: Response = await fetch(`${baseURL}/library/sections/${library?.key}/all?type=9&${plexAuthToken}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (albumsResponse.ok) {
        const albumsJSON: AlbumsResponse = await albumsResponse.json();
        const plexAlbums: Array<Albums> = albumsJSON.MediaContainer.Metadata;

        plexArtistAlbums = plexAlbums.map((album) => {
          return {
            title: album.title,
            uuid: album.guid,
            image: album.thumb ? album.thumb : album.art,
            key: album.key,
            summary: album.summary,
            library: albumsJSON.MediaContainer.librarySectionUUID,
            artist: album.parentGuid,
          };
        });

        logger.info(`Found ${plexAlbums.length} albums in Plex for library ${libraryUUID}`);

        // Remove albums that no longer exist in Plex
        await Promise.all(artistAlbums.map((artistAlbum) => {
          const doesUUIDExistInPlexArtistAlbums: InferredInsertAlbumSchema | undefined = plexArtistAlbums.find(plexArtistAlbum => plexArtistAlbum.uuid === artistAlbum.uuid);
          if (doesUUIDExistInPlexArtistAlbums) {
            return null;
          } else {
            logger.info(`Removing album ${artistAlbum.title} (${artistAlbum.uuid}) - no longer exists in Plex`);
            return db.delete(albums).where(eq(albums.uuid, artistAlbum.uuid));
          }
        }));
      } else {
        logger.error(`Failed to fetch albums for library ${libraryUUID}`);
      }

      // Sync tracks
      const tracksResponse: Response = await fetch(`${baseURL}/library/sections/${library?.key}/all?type=10&${plexAuthToken}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (tracksResponse.ok) {
        const tracksJSON: TracksResponse = await tracksResponse.json();
        const plexTracks: Array<Tracks> = tracksJSON.MediaContainer.Metadata;

        plexAlbumTracks = plexTracks.map((track) => {
          return {
            title: track.title,
            uuid: track.guid,
            key: track.key,
            path: track.Media[0].Part[0].file,
            library: tracksJSON.MediaContainer.librarySectionUUID,
            artist: track.grandparentGuid,
            album: track.parentGuid,
            duration: track.Media[0].Part[0].duration ?? track.Media[0].duration ?? track.duration ?? 0,
            trackNumber: track.index,
          };
        });

        logger.info(`Found ${plexTracks.length} tracks in Plex for library ${libraryUUID}`);

        // Remove tracks that no longer exist in Plex
        await Promise.all(albumTracks.map((albumTrack) => {
          const doesUUIDExistInPlexAlbumTracks: InferredInsertTrackSchema | undefined = plexAlbumTracks.find(plexAlbumTrack => plexAlbumTrack.uuid === albumTrack.uuid);
          if (doesUUIDExistInPlexAlbumTracks) {
            return null;
          } else {
            logger.info(`Removing track ${albumTrack.title} (${albumTrack.uuid}) - no longer exists in Plex`);
            return db.delete(tracks).where(eq(tracks.uuid, albumTrack.uuid));
          }
        }));
      } else {
        logger.error(`Failed to fetch tracks for library ${libraryUUID}`);
      }
    }

    // Upsert data in chunks to avoid overwhelming SQLite
    const CHUNK_SIZE = 100;

    // Upsert artists
    const updatedArtists: Array<any> = [];
    for (let i = 0; i < plexLibraryArtists.length; i += CHUNK_SIZE) {
      const chunk = plexLibraryArtists.slice(i, i + CHUNK_SIZE);
      const chunkResult = await db.insert(artists).values(chunk).onConflictDoUpdate({
        target: artists.uuid,
        set: {
          title: sql.raw(`excluded.${toSnakeCase(artists.title.name)}`),
          image: sql.raw(`excluded.${toSnakeCase(artists.image.name)}`),
          key: sql.raw(`excluded.${toSnakeCase(artists.key.name)}`),
          library: sql.raw(`excluded.${toSnakeCase(artists.library.name)}`),
          summary: sql.raw(`excluded.${toSnakeCase(artists.summary.name)}`),
        },
      }).returning();
      updatedArtists.push(...chunkResult);
    }

    // Upsert albums
    const updatedAlbums: Array<any> = [];
    for (let i = 0; i < plexArtistAlbums.length; i += CHUNK_SIZE) {
      const chunk = plexArtistAlbums.slice(i, i + CHUNK_SIZE);
      const chunkResult = await db.insert(albums).values(chunk).onConflictDoUpdate({
        target: albums.uuid,
        set: {
          title: sql.raw(`excluded.${toSnakeCase(albums.title.name)}`),
          image: sql.raw(`excluded.${toSnakeCase(albums.image.name)}`),
          key: sql.raw(`excluded.${toSnakeCase(albums.key.name)}`),
          library: sql.raw(`excluded.${toSnakeCase(albums.library.name)}`),
          artist: sql.raw(`excluded.${toSnakeCase(albums.artist.name)}`),
          summary: sql.raw(`excluded.${toSnakeCase(albums.summary.name)}`),
        },
      }).returning();
      updatedAlbums.push(...chunkResult);
    }

    // Upsert tracks
    const updatedTracks: Array<any> = [];
    for (let i = 0; i < plexAlbumTracks.length; i += CHUNK_SIZE) {
      const chunk = plexAlbumTracks.slice(i, i + CHUNK_SIZE);
      const chunkResult = await db.insert(tracks).values(chunk).onConflictDoUpdate({
        target: tracks.uuid,
        set: {
          title: sql.raw(`excluded.${toSnakeCase(tracks.title.name)}`),
          key: sql.raw(`excluded.${toSnakeCase(tracks.key.name)}`),
          path: sql.raw(`excluded.${toSnakeCase(tracks.path.name)}`),
          library: sql.raw(`excluded.${toSnakeCase(tracks.library.name)}`),
          artist: sql.raw(`excluded.${toSnakeCase(tracks.artist.name)}`),
          album: sql.raw(`excluded.${toSnakeCase(tracks.album.name)}`),
          duration: sql.raw(`excluded.${toSnakeCase(tracks.duration.name)}`),
          trackNumber: sql.raw(`excluded.${toSnakeCase(tracks.trackNumber.name)}`),
        },
      }).returning();
      updatedTracks.push(...chunkResult);
    }

    logger.info(`Library content sync completed for ${library.title}. Artists: ${updatedArtists.length}, Albums: ${updatedAlbums.length}, Tracks: ${updatedTracks.length}`);
  }
}

export const plexSyncService = PlexSyncService.getInstance(); 