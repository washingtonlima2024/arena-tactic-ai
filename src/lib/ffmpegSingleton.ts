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
    
    // Helper for timeout
    const withTimeout = <T>(promise: Promise<T>, ms: number, msg: string): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<T>((_, reject) => 
          setTimeout(() => reject(new Error(msg)), ms)
        )
      ]);
    };
    
    try {
      console.log('[FFmpeg Singleton] Downloading core files...');
      const coreURL = await withTimeout(
        toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        30000,
        'FFmpeg core.js download timeout (30s)'
      );
      const wasmURL = await withTimeout(
        toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        60000,
        'FFmpeg WASM download timeout (60s)'
      );
      
      console.log('[FFmpeg Singleton] Loading FFmpeg...');
      await withTimeout(ff.load({ coreURL, wasmURL }), 30000, 'FFmpeg load timeout (30s)');
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
