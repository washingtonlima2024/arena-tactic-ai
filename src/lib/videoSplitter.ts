// Video splitting utilities - delegates to backend server
// All heavy video processing is done server-side using native FFmpeg

/**
 * Calculate optimal number of parts based on file size
 * @param sizeMB File size in megabytes
 * @returns Optimal number of parts (1-8)
 */
export function calculateOptimalParts(sizeMB: number): number {
  if (sizeMB < 200) return 1;
  if (sizeMB < 500) return 2;
  if (sizeMB < 1000) return 3;
  if (sizeMB < 2000) return 4;
  return Math.min(8, Math.ceil(sizeMB / 500));
}

/**
 * Determine if video should be split in browser
 * Now always returns false - all splitting is done server-side
 */
export function shouldSplitInBrowser(sizeMB: number, isServerOnline: boolean): boolean {
  // Always delegate to server for video splitting
  return false;
}

/**
 * Download video with progress tracking
 */
export async function downloadVideoWithProgress(
  url: string,
  onProgress?: (percent: number) => void
): Promise<Blob> {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`);
  }
  
  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  
  if (!response.body) {
    const blob = await response.blob();
    onProgress?.(100);
    return blob;
  }
  
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    chunks.push(value);
    received += value.length;
    
    if (total > 0) {
      onProgress?.(Math.round((received / total) * 100));
    }
  }
  
  onProgress?.(100);
  
  const blob = new Blob(chunks as BlobPart[], { type: 'video/mp4' });
  return blob;
}

export interface SplitProgress {
  part: number;
  total: number;
  message: string;
  stage: 'loading' | 'splitting' | 'complete';
}

/**
 * Split video in browser - DEPRECATED
 * Now throws error and directs to use server-side splitting
 */
export async function splitVideoInBrowser(
  videoBlob: Blob,
  numParts: number,
  onProgress?: (progress: SplitProgress) => void
): Promise<Blob[]> {
  throw new Error(
    'Browser-side video splitting has been disabled. ' +
    'Please upload videos directly to the server for processing.'
  );
}
