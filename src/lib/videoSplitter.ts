// Video splitter using FFmpeg.wasm for in-browser video division
import { getFFmpeg } from './ffmpegSingleton';
import { fetchFile } from '@ffmpeg/util';

export interface SplitProgress {
  part: number;
  total: number;
  message: string;
  stage: 'loading' | 'splitting' | 'complete';
}

/**
 * Get video duration using HTML5 video element
 */
async function getVideoDurationFromBlob(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(Math.floor(video.duration));
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve(0);
    };
    
    video.src = URL.createObjectURL(blob);
  });
}

/**
 * Split a video blob into multiple parts using FFmpeg.wasm
 * Uses stream copy (no re-encoding) for speed
 */
export async function splitVideoInBrowser(
  videoBlob: Blob,
  numParts: number,
  onProgress?: (progress: SplitProgress) => void
): Promise<Blob[]> {
  console.log('[VideoSplitter] Starting split into', numParts, 'parts');
  console.log('[VideoSplitter] Video size:', (videoBlob.size / (1024 * 1024)).toFixed(1), 'MB');
  
  onProgress?.({ part: 0, total: numParts, message: 'Carregando FFmpeg...', stage: 'loading' });
  
  const ffmpeg = await getFFmpeg();
  const parts: Blob[] = [];
  
  try {
    // Get video duration
    onProgress?.({ part: 0, total: numParts, message: 'Analisando vídeo...', stage: 'loading' });
    const duration = await getVideoDurationFromBlob(videoBlob);
    
    if (duration === 0) {
      throw new Error('Não foi possível determinar a duração do vídeo');
    }
    
    console.log('[VideoSplitter] Video duration:', duration, 'seconds');
    const partDuration = Math.ceil(duration / numParts);
    
    // Write video to FFmpeg virtual filesystem
    onProgress?.({ part: 0, total: numParts, message: 'Carregando vídeo...', stage: 'loading' });
    await ffmpeg.writeFile('input.mp4', await fetchFile(videoBlob));
    
    for (let i = 0; i < numParts; i++) {
      const startTime = i * partDuration;
      const outputName = `part_${i + 1}.mp4`;
      
      onProgress?.({ 
        part: i + 1, 
        total: numParts, 
        message: `Extraindo parte ${i + 1}/${numParts}...`,
        stage: 'splitting'
      });
      
      console.log(`[VideoSplitter] Extracting part ${i + 1}: ${startTime}s to ${startTime + partDuration}s`);
      
      // Extract part using stream copy (fast, no re-encoding)
      await ffmpeg.exec([
        '-i', 'input.mp4',
        '-ss', startTime.toString(),
        '-t', partDuration.toString(),
        '-c', 'copy', // Stream copy for speed
        '-avoid_negative_ts', 'make_zero',
        outputName
      ]);
      
      // Read the output file
      const data = await ffmpeg.readFile(outputName);
      // Create blob from FFmpeg output - handle type conversion
      let partBlob: Blob;
      if (typeof data === 'string') {
        partBlob = new Blob([data], { type: 'video/mp4' });
      } else {
        // Cast to ArrayBuffer to satisfy TypeScript
        partBlob = new Blob([data.buffer as ArrayBuffer], { type: 'video/mp4' });
      }
      parts.push(partBlob);
      
      console.log(`[VideoSplitter] Part ${i + 1} size:`, (partBlob.size / (1024 * 1024)).toFixed(1), 'MB');
      // Clean up part file
      await ffmpeg.deleteFile(outputName);
    }
    
    // Clean up input file
    await ffmpeg.deleteFile('input.mp4');
    
    onProgress?.({ 
      part: numParts, 
      total: numParts, 
      message: 'Divisão concluída!',
      stage: 'complete'
    });
    
    console.log('[VideoSplitter] Split complete:', parts.length, 'parts created');
    return parts;
    
  } catch (error) {
    console.error('[VideoSplitter] Error splitting video:', error);
    
    // Try to clean up on error
    try {
      await ffmpeg.deleteFile('input.mp4');
    } catch { /* ignore */ }
    
    throw error;
  }
}

/**
 * Calculate optimal number of parts based on video size
 * Target: each part should be ~150-200MB for efficient cloud transcription
 */
export function calculateOptimalParts(sizeMB: number): number {
  if (sizeMB <= 200) return 1;
  if (sizeMB <= 400) return 2;
  if (sizeMB <= 600) return 3;
  if (sizeMB <= 1000) return 4;
  return 6; // Max 6 parts for very large videos
}

/**
 * Check if video should be split in browser
 * - Server offline
 * - Size between 200MB and 1GB (browser memory limit)
 */
export function shouldSplitInBrowser(
  sizeMB: number, 
  isServerOnline: boolean
): boolean {
  // If server is online, let it handle splitting
  if (isServerOnline) return false;
  
  // Too small, no need to split
  if (sizeMB <= 200) return false;
  
  // Too large for browser memory (>1GB)
  if (sizeMB > 1000) return false;
  
  return true;
}
