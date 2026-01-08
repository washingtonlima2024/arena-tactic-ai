// FFmpeg singleton to ensure only one instance is loaded across the app
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let ffmpegLoading: Promise<FFmpeg> | null = null;

export async function getFFmpeg(): Promise<FFmpeg> {
  // Return existing instance if loaded
  if (ffmpeg?.loaded) {
    console.log('[FFmpeg Singleton] Using existing instance');
    return ffmpeg;
  }
  
  // Return pending promise if loading
  if (ffmpegLoading) {
    console.log('[FFmpeg Singleton] Waiting for existing load...');
    return ffmpegLoading;
  }
  
  console.log('[FFmpeg Singleton] Loading new instance...');
  
  ffmpegLoading = (async () => {
    const ff = new FFmpeg();
    
    ff.on('log', ({ message }) => {
      console.log('[FFmpeg]', message);
    });
    
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    
    try {
      const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
      
      await ff.load({ coreURL, wasmURL });
      console.log('[FFmpeg Singleton] Loaded successfully');
      
      ffmpeg = ff;
      return ff;
    } catch (error) {
      console.error('[FFmpeg Singleton] Primary load failed, trying fallback...', error);
      
      // Try fallback CDN
      const fallbackURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd';
      const coreURL = await toBlobURL(`${fallbackURL}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${fallbackURL}/ffmpeg-core.wasm`, 'application/wasm');
      
      await ff.load({ coreURL, wasmURL });
      console.log('[FFmpeg Singleton] Loaded via fallback CDN');
      
      ffmpeg = ff;
      return ff;
    }
  })();
  
  try {
    return await ffmpegLoading;
  } catch (error) {
    // Reset on failure so next attempt can retry
    ffmpegLoading = null;
    throw error;
  }
}

// Check if FFmpeg is already loaded
export function isFFmpegLoaded(): boolean {
  return ffmpeg?.loaded ?? false;
}
