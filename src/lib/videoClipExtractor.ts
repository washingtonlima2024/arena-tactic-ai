import { fetchFile } from '@ffmpeg/util';
import { getFFmpeg } from './ffmpegSingleton';

export interface ClipExtractionResult {
  blob: Blob;
  durationMs: number;
}

export async function extractVideoClip(
  videoUrl: string,
  startSeconds: number,
  durationSeconds: number,
  onProgress?: (progress: number, message: string) => void
): Promise<Blob> {
  onProgress?.(5, 'Carregando FFmpeg...');
  const ff = await getFFmpeg();
  
  onProgress?.(10, 'Baixando vídeo...');
  
  // Download video
  const videoData = await fetchFile(videoUrl);
  await ff.writeFile('input.mp4', videoData);
  
  onProgress?.(50, 'Cortando vídeo...');
  
  // Cut video using FFmpeg with stream copy (fast, no re-encoding)
  await ff.exec([
    '-ss', startSeconds.toFixed(2),
    '-i', 'input.mp4',
    '-t', durationSeconds.toFixed(2),
    '-c', 'copy',
    '-avoid_negative_ts', 'make_zero',
    'output.mp4'
  ]);
  
  onProgress?.(85, 'Finalizando...');
  
  // Read output and convert to proper ArrayBuffer for Blob
  const data = await ff.readFile('output.mp4');
  let blob: Blob;
  if (data instanceof Uint8Array) {
    const buffer = new ArrayBuffer(data.length);
    const view = new Uint8Array(buffer);
    view.set(data);
    blob = new Blob([buffer], { type: 'video/mp4' });
  } else {
    blob = new Blob([data as BlobPart], { type: 'video/mp4' });
  }
  
  // Cleanup
  try {
    await ff.deleteFile('input.mp4');
    await ff.deleteFile('output.mp4');
  } catch (e) {
    // Ignore cleanup errors
  }
  
  onProgress?.(100, 'Concluído');
  
  return blob;
}

export async function extractMultipleClips(
  clips: Array<{
    id: string;
    videoUrl: string;
    startSeconds: number;
    durationSeconds: number;
  }>,
  onClipProgress?: (clipIndex: number, totalClips: number, clipId: string, progress: number, message: string) => void,
  abortSignal?: AbortSignal
): Promise<Map<string, Blob>> {
  const results = new Map<string, Blob>();
  
  // Load FFmpeg once for all clips
  onClipProgress?.(0, clips.length, '', 0, 'Carregando FFmpeg...');
  const ff = await getFFmpeg();
  
  for (let i = 0; i < clips.length; i++) {
    if (abortSignal?.aborted) {
      console.log('[ClipExtractor] Aborted');
      break;
    }
    
    const clip = clips[i];
    
    try {
      onClipProgress?.(i, clips.length, clip.id, 10, 'Baixando vídeo...');
      
      // Download video
      const videoData = await fetchFile(clip.videoUrl);
      await ff.writeFile('input.mp4', videoData);
      
      onClipProgress?.(i, clips.length, clip.id, 50, 'Cortando...');
      
      // Cut video
      await ff.exec([
        '-ss', clip.startSeconds.toFixed(2),
        '-i', 'input.mp4',
        '-t', clip.durationSeconds.toFixed(2),
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero',
        'output.mp4'
      ]);
      
      onClipProgress?.(i, clips.length, clip.id, 85, 'Salvando...');
      
      // Read output and convert to proper ArrayBuffer for Blob
      const data = await ff.readFile('output.mp4');
      let blob: Blob;
      if (data instanceof Uint8Array) {
        const buffer = new ArrayBuffer(data.length);
        const view = new Uint8Array(buffer);
        view.set(data);
        blob = new Blob([buffer], { type: 'video/mp4' });
      } else {
        blob = new Blob([data as BlobPart], { type: 'video/mp4' });
      }
      results.set(clip.id, blob);
      
      // Cleanup
      try {
        await ff.deleteFile('input.mp4');
        await ff.deleteFile('output.mp4');
      } catch (e) {
        // Ignore cleanup errors
      }
      
      onClipProgress?.(i, clips.length, clip.id, 100, 'Concluído');
      
    } catch (error) {
      console.error(`[ClipExtractor] Failed to extract clip ${clip.id}:`, error);
      // Continue with next clip
    }
  }
  
  return results;
}
