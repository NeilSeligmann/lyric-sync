import type { SyncTrackResponse } from "$lib/types";

export interface SyncProgress {
  id: string;
  libraryId: string;
  totalTracks: number;
  processedTracks: number;
  syncedTracks: number;
  failedTracks: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  results: Array<SyncTrackResponse>;
  currentTrack?: string;
}

class SyncProgressManager {
  private progressMap = new Map<string, SyncProgress>();

  createProgress(libraryId: string, totalTracks: number): string {
    const id = `sync_${libraryId}_${Date.now()}`;
    const progress: SyncProgress = {
      id,
      libraryId,
      totalTracks,
      processedTracks: 0,
      syncedTracks: 0,
      failedTracks: 0,
      status: 'pending',
      startTime: new Date(),
      results: [],
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

  incrementProcessed(id: string, result: SyncTrackResponse, trackTitle?: string): void {
    const progress = this.progressMap.get(id);
    if (progress) {
      progress.processedTracks++;
      progress.results.push(result);
      progress.currentTrack = trackTitle;
      
      if (result.synced) {
        progress.syncedTracks++;
      } else {
        progress.failedTracks++;
      }
    }
  }

  completeProgress(id: string, status: 'completed' | 'failed' = 'completed'): void {
    const progress = this.progressMap.get(id);
    if (progress) {
      progress.status = status;
      progress.endTime = new Date();
    }
  }

  cleanupOldProgress(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const [id, progress] of this.progressMap.entries()) {
      if (progress.endTime && progress.endTime < oneHourAgo) {
        this.progressMap.delete(id);
      }
    }
  }
}

export const syncProgressManager = new SyncProgressManager(); 