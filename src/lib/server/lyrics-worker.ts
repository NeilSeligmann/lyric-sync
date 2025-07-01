import { parentPort, workerData } from 'worker_threads';
import { processLyrics } from './lyrics-search.js';
import type { SyncTrackResponse } from '$lib/types';

interface WorkerTrackData {
  uuid: string;
  title: string;
  path: string;
  duration: number;
  artistInfo: {
    title: string;
  };
  albumInfo: {
    title: string;
  };
}

interface WorkerParams {
  trackData: WorkerTrackData;
  library: string;
}

interface WorkerMessage {
  success: boolean;
  result?: SyncTrackResponse;
  error?: string;
  trackTitle: string;
  artistName: string;
}

async function processTrackInWorker(params: WorkerParams): Promise<SyncTrackResponse> {
  const { trackData, library } = params;
  
  try {
    const syncTrackResponse: SyncTrackResponse = await processLyrics({
      artistName: trackData.artistInfo.title,
      trackName: trackData.title,
      albumName: trackData.albumInfo.title,
      duration: trackData.duration,
      trackUuid: trackData.uuid,
      library,
      trackPath: trackData.path
    });
    
    return syncTrackResponse;
  } catch (error) {
    return {
      synced: false,
      plainLyrics: true,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      stack: error instanceof Error ? error.stack : undefined
    };
  }
}

// Worker thread entry point
if (parentPort) {
  const { trackData, library }: WorkerParams = workerData;
  
  processTrackInWorker({ trackData, library })
    .then((result) => {
      const message: WorkerMessage = {
        success: true,
        result,
        trackTitle: trackData.title,
        artistName: trackData.artistInfo.title
      };
      parentPort!.postMessage(message);
    })
    .catch((error) => {
      const message: WorkerMessage = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        trackTitle: trackData.title,
        artistName: trackData.artistInfo.title
      };
      parentPort!.postMessage(message);
    });
} 