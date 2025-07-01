import type { SyncTrackResponse } from "$lib/types";

export interface ActiveTrack {
  trackTitle: string;
  artistName: string;
  startTime: number;
  status: 'processing' | 'completed' | 'failed';
  result?: SyncTrackResponse;
}

export interface SyncProgress {
  id: string;
  libraryId: string;
  totalTracks: number;
  processedTracks: number;
  syncedTracks: number;
  failedTracks: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: number; // Unix timestamp in milliseconds
  endTime?: number; // Unix timestamp in milliseconds
  results: Array<SyncTrackResponse>;
  
  // Multi-threading support
  activeTracks: Array<ActiveTrack>; // Currently processing tracks
  maxConcurrency: number; // Number of tracks being processed simultaneously
  currentBatch: number; // Current batch number
  totalBatches: number; // Total number of batches
  
  // Legacy fields for backward compatibility
  currentTrack?: string;
  currentArtist?: string;
}

class SyncProgressManager {
  private progressMap = new Map<string, SyncProgress>();

  createProgress(libraryId: string, totalTracks: number, maxConcurrency: number = 4): string {
    const id = `sync_${libraryId}_${Date.now()}`;
    const totalBatches = Math.ceil(totalTracks / maxConcurrency);
    
    const progress: SyncProgress = {
      id,
      libraryId,
      totalTracks,
      processedTracks: 0,
      syncedTracks: 0,
      failedTracks: 0,
      status: 'pending',
      startTime: Date.now(), // Store as timestamp
      results: [],
      activeTracks: [],
      maxConcurrency,
      currentBatch: 0,
      totalBatches,
    };
    
    this.progressMap.set(id, progress);
    return id;
  }

  getProgress(id: string): SyncProgress | undefined {
    return this.progressMap.get(id);
  }

  getProgressByLibrary(libraryId: string): SyncProgress | undefined {
    return Array.from(this.progressMap.values())
      .find(p => p.libraryId === libraryId && p.status === 'running');
  }

  updateProgress(id: string, updates: Partial<SyncProgress>): void {
    const progress = this.progressMap.get(id);
    if (progress) {
      Object.assign(progress, updates);
    }
  }

  // Start processing a batch of tracks
  startBatch(id: string, batchNumber: number, tracks: Array<{ title: string; artistInfo: { title: string } }>): void {
    const progress = this.progressMap.get(id);
    if (progress) {
      progress.currentBatch = batchNumber;
      
      // Add tracks to active tracks
      const newActiveTracks: ActiveTrack[] = tracks.map(track => ({
        trackTitle: track.title,
        artistName: track.artistInfo.title,
        startTime: Date.now(),
        status: 'processing'
      }));
      
      progress.activeTracks = newActiveTracks;
      
      // Update legacy fields for backward compatibility
      if (newActiveTracks.length > 0) {
        progress.currentTrack = newActiveTracks[0].trackTitle;
        progress.currentArtist = newActiveTracks[0].artistName;
      }
    }
  }

  // Complete processing of a specific track
  completeTrack(id: string, trackTitle: string, artistName: string, result: SyncTrackResponse): void {
    const progress = this.progressMap.get(id);
    if (progress) {
      // Find and update the active track
      const activeTrack = progress.activeTracks.find(track => 
        track.trackTitle === trackTitle && track.artistName === artistName
      );
      
      if (activeTrack) {
        activeTrack.status = result.synced ? 'completed' : 'failed';
        activeTrack.result = result;
      }
      
      // Update overall progress
      progress.processedTracks++;
      progress.results.push(result);
      
      if (result.synced) {
        progress.syncedTracks++;
      } else {
        progress.failedTracks++;
      }
      
      // Remove completed track from active tracks
      progress.activeTracks = progress.activeTracks.filter(track => 
        !(track.trackTitle === trackTitle && track.artistName === artistName)
      );
      
      // Update legacy fields for backward compatibility
      if (progress.activeTracks.length > 0) {
        progress.currentTrack = progress.activeTracks[0].trackTitle;
        progress.currentArtist = progress.activeTracks[0].artistName;
      }
    }
  }

  // Legacy method for backward compatibility
  incrementProcessed(id: string, result: SyncTrackResponse, trackTitle?: string, artistName?: string): void {
    if (trackTitle && artistName) {
      this.completeTrack(id, trackTitle, artistName, result);
    } else {
      // Fallback to old behavior
      const progress = this.progressMap.get(id);
      if (progress) {
        progress.processedTracks++;
        progress.results.push(result);
        
        if (result.synced) {
          progress.syncedTracks++;
        } else {
          progress.failedTracks++;
        }
      }
    }
  }

  completeProgress(id: string, status: 'completed' | 'failed' = 'completed'): void {
    const progress = this.progressMap.get(id);
    if (progress) {
      progress.status = status;
      progress.endTime = Date.now(); // Store as timestamp
      progress.activeTracks = []; // Clear active tracks
    }
  }

  cleanupOldProgress(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000; // One hour ago as timestamp
    for (const [id, progress] of this.progressMap.entries()) {
      if (progress.endTime && progress.endTime < oneHourAgo) {
        this.progressMap.delete(id);
      }
    }
  }

  // Get processing statistics
  getProcessingStats(id: string): {
    activeCount: number;
    completedCount: number;
    failedCount: number;
    avgProcessingTime: number;
  } {
    const progress = this.progressMap.get(id);
    if (!progress) {
      return { activeCount: 0, completedCount: 0, failedCount: 0, avgProcessingTime: 0 };
    }

    const activeCount = progress.activeTracks.filter(track => track.status === 'processing').length;
    const completedCount = progress.activeTracks.filter(track => track.status === 'completed').length;
    const failedCount = progress.activeTracks.filter(track => track.status === 'failed').length;

    // Calculate average processing time from completed tracks
    const completedTracks = progress.activeTracks.filter(track => track.status !== 'processing');
    const avgProcessingTime = completedTracks.length > 0 
      ? completedTracks.reduce((sum, track) => sum + (Date.now() - track.startTime), 0) / completedTracks.length
      : 0;

    return {
      activeCount,
      completedCount,
      failedCount,
      avgProcessingTime
    };
  }
}

export const syncProgressManager = new SyncProgressManager(); 