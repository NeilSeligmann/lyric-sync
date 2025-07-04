import type { AlbumWithTrackCount, ArtistWithAlbumCount, InferredInsertLibrarySchema, InferredSelectAlbumSchema, InferredSelectArtistSchema, InferredSelectLibrarySchema, InferredSelectTrackSchema, LibraryItems } from "$lib/types";

import { logger } from "$lib/logger";
import { albums, artists, libraries, tracks } from "$lib/schema";
import { and, asc, eq, getTableColumns, or, sql, type SQL } from "drizzle-orm";

import db from ".";

// create an update many sql statement for use with db.update.set()
// please don't pass an empty array to this function
export function updateAllCurrentLibraryValuesToFalseExceptOne(inputs: Array<InferredInsertLibrarySchema>): { sql: SQL; uuids: Array<string> } {
  const sqlChunks: Array<SQL> = [];
  const ids: Array<string> = [];

  sqlChunks.push(sql`(case`);

  for (const input of inputs) {
    if (input.currentLibrary) {
      sqlChunks.push(sql`when ${libraries.uuid} = ${input.uuid} then true`);
    }
    else {
      sqlChunks.push(sql`when ${libraries.uuid} = ${input.uuid} then false`);
    }
    ids.push(input.uuid);
  }

  sqlChunks.push(sql`end)`);

  const finalSql: SQL = sql.join(sqlChunks, sql.raw(" "));
  return {
    sql: finalSql,
    uuids: ids,
  };
};

export async function getArtistByUuid(artistUUID: string): Promise<InferredSelectArtistSchema | undefined> {
  const returnedArtist: InferredSelectArtistSchema | undefined = await db.query.artists.findFirst({
    where: eq(artists.uuid, artistUUID),
  });

  logger.info(`returning artist by UUID: ${artistUUID}`);
  logger.debug(returnedArtist);

  return returnedArtist;
};

export async function getAllArtistsInLibrary(libraryUUID: string): Promise<Array<InferredSelectArtistSchema>> {
  const returnedArtists: Array<InferredSelectArtistSchema> | undefined = await db.query.artists.findMany({
    where: eq(artists.library, libraryUUID),
  });

  logger.info(`returning all artists in library ${libraryUUID}`);
  logger.debug(returnedArtists);

  return returnedArtists;
};

export async function getAllArtistsInLibraryWithAlbumCounts(libraryUUID: string): Promise<Array<ArtistWithAlbumCount>> {
  const returnedArtists: Array<ArtistWithAlbumCount> = await db.select({
    ...getTableColumns(artists),
    totalAlbums: sql<number>`COUNT(${albums.uuid})`,
    albumsSynced: sql<number>`SUM(CASE WHEN ${albums.synced} = 1 THEN 1 ELSE 0 END)`,
  }).from(artists).leftJoin(albums, sql`${albums.artist} = ${artists.uuid}`).where(eq(artists.library, libraryUUID)).groupBy(artists.uuid).orderBy(asc(sql`LOWER(${artists.title})`));

  logger.info(`returning all artists in library with album counts ${libraryUUID}`);
  logger.debug(returnedArtists);

  return returnedArtists;
};

export async function getAllAlbumsFromArtistInLibraryWithTrackCounts(libraryUUID: string, artistUUID: string): Promise<Array<AlbumWithTrackCount>> {
  const returnedAlbums: Array<AlbumWithTrackCount> = await db.select({
    ...getTableColumns(albums),
    totalTracks: sql<number>`COUNT(${tracks.uuid})`,
    tracksSynced: sql<number>`SUM(CASE WHEN ${tracks.synced} = 1 THEN 1 ELSE 0 END)`,
  }).from(albums).leftJoin(tracks, sql`${tracks.artist} = ${albums.artist} AND ${tracks.album} = ${albums.uuid}`).where(and(eq(tracks.library, libraryUUID), eq(tracks.artist, artistUUID))).groupBy(albums.uuid).orderBy(asc(sql`LOWER(${albums.title})`));

  logger.info(`returning albums from artist: ${artistUUID} in library ${libraryUUID}, album count: ${returnedAlbums.length}`);
  logger.debug(returnedAlbums);

  return returnedAlbums;
};

export async function getAllTracksFromAlbumInLibrary(libraryUUID: string, albumUUID: string): Promise<Array<InferredSelectTrackSchema>> {
  const returnedTracks: Array<InferredSelectTrackSchema> = await db.query.tracks.findMany({
    where: and(eq(tracks.album, albumUUID), eq(tracks.library, libraryUUID)),
    orderBy: [asc(tracks.trackNumber)],
  });

  logger.info(`retruning tracks from album: ${albumUUID} in library ${libraryUUID}`);
  logger.debug(returnedTracks);

  return returnedTracks;
};

export async function getAllAlbumsInLibrary(libraryUUID: string): Promise<Array<InferredSelectAlbumSchema>> {
  const returnedAlbums: Array<InferredSelectAlbumSchema> | undefined = await db.query.albums.findMany({
    where: eq(albums.library, libraryUUID),
  });

  logger.info(`returning all albums in library ${libraryUUID}`);
  logger.debug(returnedAlbums);

  return returnedAlbums;
};

export async function getAllTracksInLibrary(libraryUUID: string): Promise<Array<InferredSelectTrackSchema>> {
  const returnedTracks: Array<InferredSelectTrackSchema> | undefined = await db.query.tracks.findMany({
    where: eq(tracks.library, libraryUUID),
  });

  logger.info(`returning all tracks in library ${libraryUUID}`);
  logger.debug(returnedTracks);

  return returnedTracks;
};

export async function getAllArtistsAlbumsTracksInLibrary(libraryUUID: string): Promise<LibraryItems> {
  const returnedArtists: Array<InferredSelectArtistSchema> | undefined = await getAllArtistsInLibrary(libraryUUID);

  const returnedAlbums: Array<InferredSelectAlbumSchema> | undefined = await getAllAlbumsInLibrary(libraryUUID);

  const returnedTracks: Array<InferredSelectTrackSchema> | undefined = await getAllTracksInLibrary(libraryUUID);

  return {
    returnedArtists,
    returnedAlbums,
    returnedTracks,
  };
};

export async function markTrackAsSynced(trackUUID: string, libraryUUID: string): Promise<Array<InferredSelectTrackSchema>> {
  logger.info(`Attempting to mark track: ${trackUUID} in libary: ${libraryUUID} as SYNCED`);
  const returnedTrack: Array<InferredSelectTrackSchema> | undefined = await db.update(tracks).set({ synced: true }).where(and(eq(tracks.uuid, trackUUID), eq(tracks.library, libraryUUID))).returning();

  if (returnedTrack) {
    logger.info(`track: ${trackUUID} in library: ${libraryUUID} SYNCED`);
    logger.debug(returnedTrack);
  }

  return returnedTrack;
};

export async function markAlbumAsSynced(albumUUID: string, libraryUUID: string): Promise<Array<InferredSelectAlbumSchema>> {
  logger.info(`Attempting to mark album: ${albumUUID} in libary: ${libraryUUID} as SYNCED`);
  const returnedAlbum: Array<InferredSelectAlbumSchema> | undefined = await db.update(albums).set({ synced: true }).where(and(eq(albums.uuid, albumUUID), eq(albums.library, libraryUUID))).returning();

  if (returnedAlbum) {
    logger.info(`album: ${albumUUID} in library: ${libraryUUID} SYNCED`);
    logger.debug(returnedAlbum);
  }

  return returnedAlbum;
};

export async function getUnsyncedTracksInLibrary(libraryUUID: string): Promise<Array<InferredSelectTrackSchema & { artistInfo: InferredSelectArtistSchema; albumInfo: InferredSelectAlbumSchema }>> {
  const returnedTracks = await db.select({
    ...getTableColumns(tracks),
    artistInfo: {
      title: artists.title,
      uuid: artists.uuid,
      image: artists.image,
      key: artists.key,
      synced: artists.synced,
      library: artists.library,
      summary: artists.summary,
      createdAt: artists.createdAt,
      updatedAt: artists.updatedAt,
    },
    albumInfo: {
      title: albums.title,
      uuid: albums.uuid,
      image: albums.image,
      key: albums.key,
      synced: albums.synced,
      library: albums.library,
      artist: albums.artist,
      summary: albums.summary,
      createdAt: albums.createdAt,
      updatedAt: albums.updatedAt,
    },
  }).from(tracks).innerJoin(artists, eq(tracks.artist, artists.uuid)).innerJoin(albums, eq(tracks.album, albums.uuid)).where(and(eq(tracks.library, libraryUUID), eq(tracks.synced, false))).orderBy(asc(tracks.title));

  logger.info(`returning unsynced tracks in library ${libraryUUID}, count: ${returnedTracks.length}`);
  logger.debug(returnedTracks);

  return returnedTracks as Array<InferredSelectTrackSchema & { artistInfo: InferredSelectArtistSchema; albumInfo: InferredSelectAlbumSchema }>;
};

// New functions for enhanced sync tracking

export async function markTrackAsSyncedWithDetails(
  trackUUID: string,
  libraryUUID: string,
  success: boolean = true,
  failureReason?: string,
): Promise<Array<InferredSelectTrackSchema>> {
  // Validate inputs
  if (!trackUUID || !libraryUUID) {
    logger.error(`Invalid parameters: trackUUID=${trackUUID}, libraryUUID=${libraryUUID}`);
    throw new Error("Invalid track UUID or library UUID provided");
  }

  const now = new Date();

  if (!success && failureReason) {
    // First, get the current retry count to calculate the next retry time
    const currentTrack = await db.select({ retryCount: tracks.retryCount })
      .from(tracks)
      .where(and(eq(tracks.uuid, trackUUID), eq(tracks.library, libraryUUID)))
      .limit(1);

    const currentRetryCount = currentTrack[0]?.retryCount ?? 0;
    const newRetryCount = currentRetryCount + 1;

    // Calculate retry delay with exponential backoff (max 24 hours)
    const retryDelay = Math.min(2 ** newRetryCount * 60 * 60 * 1000, 24 * 60 * 60 * 1000);
    const nextRetryAt = new Date(now.getTime() + retryDelay);

    const updateData = {
      synced: false,
      lastSyncAttempt: now,
      syncFailureReason: failureReason,
      retryCount: newRetryCount,
      nextRetryAt,
    };

    logger.info(`Marking track: ${trackUUID} in library: ${libraryUUID} as FAILED (retry ${newRetryCount})`);

    const returnedTrack: Array<InferredSelectTrackSchema> | undefined = await db.update(tracks)
      .set(updateData)
      .where(and(eq(tracks.uuid, trackUUID), eq(tracks.library, libraryUUID)))
      .returning();

    if (returnedTrack) {
      logger.info(`Track: ${trackUUID} in library: ${libraryUUID} FAILED`);
      logger.debug(returnedTrack);
    }

    return returnedTrack;
  }
  else {
    // Success case - reset retry count and clear failure info
    const updateData = {
      synced: true,
      lastSyncAttempt: now,
      syncFailureReason: null,
      retryCount: 0,
      nextRetryAt: null,
    };

    logger.info(`Marking track: ${trackUUID} in library: ${libraryUUID} as SYNCED`);

    const returnedTrack: Array<InferredSelectTrackSchema> | undefined = await db.update(tracks)
      .set(updateData)
      .where(and(eq(tracks.uuid, trackUUID), eq(tracks.library, libraryUUID)))
      .returning();

    if (returnedTrack) {
      logger.info(`Track: ${trackUUID} in library: ${libraryUUID} SYNCED`);
      logger.debug(returnedTrack);
    }

    return returnedTrack;
  }
};

export async function getFailedTracksReadyForRetry(libraryUUID: string): Promise<Array<InferredSelectTrackSchema & { artistInfo: InferredSelectArtistSchema; albumInfo: InferredSelectAlbumSchema }>> {
  const now = new Date();

  const returnedTracks = await db.select({
    ...getTableColumns(tracks),
    artistInfo: {
      title: artists.title,
      uuid: artists.uuid,
      image: artists.image,
      key: artists.key,
      synced: artists.synced,
      library: artists.library,
      summary: artists.summary,
      createdAt: artists.createdAt,
      updatedAt: artists.updatedAt,
    },
    albumInfo: {
      title: albums.title,
      uuid: albums.uuid,
      image: albums.image,
      key: albums.key,
      synced: albums.synced,
      library: albums.library,
      artist: albums.artist,
      summary: albums.summary,
      createdAt: albums.createdAt,
      updatedAt: albums.updatedAt,
    },
  }).from(tracks).innerJoin(artists, eq(tracks.artist, artists.uuid)).innerJoin(albums, eq(tracks.album, albums.uuid)).where(
    and(
      eq(tracks.library, libraryUUID),
      eq(tracks.synced, false),
      or(
        sql`${tracks.nextRetryAt} IS NULL`,
        sql`${tracks.nextRetryAt} <= ${now.getTime()}`,
      ),
      sql`${tracks.retryCount} < 5`, // Max 5 retries
    ),
  ).orderBy(asc(tracks.title));

  logger.info(`returning failed tracks ready for retry in library ${libraryUUID}, count: ${returnedTracks.length}`);
  logger.debug(returnedTracks);

  return returnedTracks as Array<InferredSelectTrackSchema & { artistInfo: InferredSelectArtistSchema; albumInfo: InferredSelectAlbumSchema }>;
};

export async function getNewTracksForSync(libraryUUID: string): Promise<Array<InferredSelectTrackSchema & { artistInfo: InferredSelectArtistSchema; albumInfo: InferredSelectAlbumSchema }>> {
  const returnedTracks = await db.select({
    ...getTableColumns(tracks),
    artistInfo: {
      title: artists.title,
      uuid: artists.uuid,
      image: artists.image,
      key: artists.key,
      synced: artists.synced,
      library: artists.library,
      summary: artists.summary,
      createdAt: artists.createdAt,
      updatedAt: artists.updatedAt,
    },
    albumInfo: {
      title: albums.title,
      uuid: albums.uuid,
      image: albums.image,
      key: albums.key,
      synced: albums.synced,
      library: albums.library,
      artist: albums.artist,
      summary: albums.summary,
      createdAt: albums.createdAt,
      updatedAt: albums.updatedAt,
    },
  }).from(tracks).innerJoin(artists, eq(tracks.artist, artists.uuid)).innerJoin(albums, eq(tracks.album, albums.uuid)).where(
    and(
      eq(tracks.library, libraryUUID),
      eq(tracks.synced, false),
      sql`${tracks.lastSyncAttempt} IS NULL`, // Never attempted before
    ),
  ).orderBy(asc(tracks.title));

  logger.info(`returning new tracks for sync in library ${libraryUUID}, count: ${returnedTracks.length}`);
  logger.debug(returnedTracks);

  return returnedTracks as Array<InferredSelectTrackSchema & { artistInfo: InferredSelectArtistSchema; albumInfo: InferredSelectAlbumSchema }>;
};

export async function getSyncStats(libraryUUID: string): Promise<{
  totalTracks: number;
  syncedTracks: number;
  failedTracks: number;
  pendingRetryTracks: number;
  newTracks: number;
}> {
  const now = new Date();

  const stats = await db.select({
    totalTracks: sql<number>`COUNT(*)`,
    syncedTracks: sql<number>`SUM(CASE WHEN ${tracks.synced} = 1 THEN 1 ELSE 0 END)`,
    failedTracks: sql<number>`SUM(CASE WHEN ${tracks.synced} = 0 AND ${tracks.lastSyncAttempt} IS NOT NULL THEN 1 ELSE 0 END)`,
    pendingRetryTracks: sql<number>`SUM(CASE WHEN ${tracks.synced} = 0 AND ${tracks.nextRetryAt} <= ${now.getTime()} AND ${tracks.retryCount} < 5 THEN 1 ELSE 0 END)`,
    newTracks: sql<number>`SUM(CASE WHEN ${tracks.synced} = 0 AND ${tracks.lastSyncAttempt} IS NULL THEN 1 ELSE 0 END)`,
  }).from(tracks).where(eq(tracks.library, libraryUUID));

  const result = stats[0];
  logger.info(`Sync stats for library ${libraryUUID}:`, result);

  return result;
};

export async function getAllLibrariesInServer(): Promise<Array<InferredSelectLibrarySchema>> {
  const returnedLibraries: Array<InferredSelectLibrarySchema> | undefined = await db.query.libraries.findMany({
    orderBy: [asc(libraries.title)],
  });

  logger.info(`returning all libraries in server, count: ${returnedLibraries.length}`);
  logger.debug(returnedLibraries);

  return returnedLibraries;
};
