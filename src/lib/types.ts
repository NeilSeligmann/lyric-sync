import type { AuthSession } from "$lib/server/auth-service";
import type { Icon as IconType } from "lucide-svelte";
import type { z } from "zod";

import type { insertAlbumSchema, insertArtistSchema, insertLibrarySchema, insertServerSchema, insertTrackSchema, selectAlbumSchema, selectArtistSchema, selectLibrarySchema, selectServerSchema, selectTrackSchema } from "./schema";

// types for add-server

export type AddServerFormValues = z.infer<typeof insertServerSchema>;
export type AddServerValidationErrors = Partial<Record<keyof AddServerFormValues, string[]>>;
export type AddServerInputFocused = Record<keyof AddServerFormValues, boolean>;
export interface ClassIconAndTitle {
  class?: string;
  icon?: typeof IconType;
  title?: string;
  color?: string;
};

export interface AddServerButtonsState {
  testButton: {
    class: string;
    disabled: boolean;
  };
  submitButton: {
    disabled: boolean;
  };
}

export interface AddServerFormState {
  formValues: AddServerFormValues;
  inputFocused: AddServerInputFocused;
  formUpdated: boolean;
}

// types for test-connection
export interface TestConnectionResponse {
  connection: boolean;
  message: string;
}

// server load default types
export type InferredSelectServerSchema = z.infer<typeof selectServerSchema>;
export type InferredSelectLibrarySchema = z.infer<typeof selectLibrarySchema>;

export interface ServerLoadValues {
  serverConfiguration: InferredSelectServerSchema | undefined;
  libraries: Array<InferredSelectLibrarySchema> | [];
  currentLibrary: InferredSelectLibrarySchema | undefined;
  auth: AuthSession;
}

// types for select-library
export type InferredInsertLibrarySchema = z.infer<typeof insertLibrarySchema>;

export interface SelectLibraryResponse {
  selected: boolean;
  message: string;
};

// types for artists
export type InferredSelectArtistSchema = z.infer<typeof selectArtistSchema>;
export type InferredInsertArtistSchema = z.infer<typeof insertArtistSchema>;

// types for albums
export type InferredSelectAlbumSchema = z.infer<typeof selectAlbumSchema>;
export type InferredInsertAlbumSchema = z.infer<typeof insertAlbumSchema>;

// types for tracks
export type InferredSelectTrackSchema = z.infer<typeof selectTrackSchema>;
export type InferredInsertTrackSchema = z.infer<typeof insertTrackSchema>;

// types for view-library

export interface LibraryItems {
  returnedArtists: Array<InferredSelectArtistSchema> | undefined;
  returnedAlbums: Array<InferredSelectAlbumSchema> | undefined;
  returnedTracks: Array<InferredSelectTrackSchema> | undefined;
}

export interface ArtistPageData {
  returnedAlbums: Array<AlbumWithTrackCount> | undefined;
  returnedArtist: InferredSelectArtistSchema | undefined;
}

export interface ArtistWithAlbumCount extends InferredSelectArtistSchema {
  totalAlbums: number;
  albumsSynced: number;
}

// types for view-library/artist/slug

export interface AlbumWithTrackCount extends InferredSelectAlbumSchema {
  totalTracks: number;
  tracksSynced: number;
}

// lrclib 200 response api/get?artist_name track_name album_name duration
export interface LRCResponse {
  id: number;
  name: string;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string;
  syncedLyrics: string;
}

// types for /api/sync-lyrics/track
export interface SyncTrackResponse {
  synced: boolean;
  plainLyrics: boolean;
  message: string;
  stack?: string;
}

// types for /api/check-for-lrcs/track
export interface CheckTrackLyricsOnDiskResponse {
  lyricsExist: boolean;
  expectationMet?: boolean;
  plainLyrics: boolean;
  message: string;
  stack?: string;
}

// New types for enhanced sync tracking
export interface SyncStatus {
  synced: boolean;
  lastSyncAttempt?: Date;
  syncFailureReason?: string;
  retryCount: number;
  nextRetryAt?: Date;
}

export interface TrackSyncResult {
  trackId: string;
  success: boolean;
  message: string;
  failureReason?: string;
  retryCount: number;
  nextRetryAt?: Date;
}

export interface BulkSyncResult {
  totalTracks: number;
  successfulTracks: number;
  failedTracks: number;
  results: TrackSyncResult[];
}
