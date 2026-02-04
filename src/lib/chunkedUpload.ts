/**
 * Arena Play - Chunked Upload Service
 * Handles large file uploads with chunking, resume, and progress tracking.
 */

import { apiClient } from './apiClient';

// Constants
const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024; // 8MB
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // ms
const SPEED_SAMPLE_SIZE = 5; // Number of samples for speed averaging

export type UploadStatus = 
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'paused'
  | 'assembling'
  | 'converting'
  | 'extracting'
  | 'segmenting'
  | 'transcribing'
  | 'complete'
  | 'error'
  | 'cancelled';

export interface UploadState {
  uploadId: string;
  matchId: string;
  filename: string;
  fileType: 'video' | 'audio';
  status: UploadStatus;
  stage: string;
  totalBytes: number;
  uploadedBytes: number;
  currentChunk: number;
  totalChunks: number;
  speedBps: number;
  estimatedSecondsRemaining: number;
  conversionProgress: number;
  transcriptionProgress: number;
  transcriptionSegment: { current: number; total: number };
  events: Array<{ timestamp: string; message: string }>;
  errorMessage?: string;
}

export interface ChunkUploadOptions {
  file: File;
  matchId: string;
  chunkSize?: number;
  onProgress?: (state: UploadState) => void;
  onComplete?: (result: UploadResult) => void;
  onError?: (error: Error) => void;
}

export interface UploadResult {
  uploadId: string;
  outputPath: string;
  status: string;
}

// Storage key for persisted uploads
const STORAGE_KEY = 'arena_pending_uploads';

interface PersistedUpload {
  uploadId: string;
  matchId: string;
  filename: string;
  fileType: string;
  totalChunks: number;
  sentChunks: number[];
  lastUpdated: string;
}

class ChunkedUploadService {
  private file: File | null = null;
  private matchId: string = '';
  private chunkSize: number = DEFAULT_CHUNK_SIZE;
  private uploadId: string = '';
  private state: UploadState;
  private abortController: AbortController | null = null;
  private speedSamples: number[] = [];
  private lastProgressTime: number = 0;
  private lastProgressBytes: number = 0;
  private sentChunks: Set<number> = new Set();
  private onProgress?: (state: UploadState) => void;
  private onComplete?: (result: UploadResult) => void;
  private onError?: (error: Error) => void;
  private isPaused: boolean = false;

  constructor() {
    this.state = this.createInitialState();
  }

  private createInitialState(): UploadState {
    return {
      uploadId: '',
      matchId: '',
      filename: '',
      fileType: 'video',
      status: 'idle',
      stage: '',
      totalBytes: 0,
      uploadedBytes: 0,
      currentChunk: 0,
      totalChunks: 0,
      speedBps: 0,
      estimatedSecondsRemaining: 0,
      conversionProgress: 0,
      transcriptionProgress: 0,
      transcriptionSegment: { current: 0, total: 0 },
      events: []
    };
  }

  private addEvent(message: string): void {
    this.state.events = [
      ...this.state.events.slice(-49),
      { timestamp: new Date().toISOString(), message }
    ];
  }

  private updateSpeed(bytesSent: number): void {
    const now = Date.now();
    const timeDiff = (now - this.lastProgressTime) / 1000;
    
    if (timeDiff > 0.1) {
      const bytesDiff = bytesSent - this.lastProgressBytes;
      const speed = bytesDiff / timeDiff;
      
      this.speedSamples.push(speed);
      if (this.speedSamples.length > SPEED_SAMPLE_SIZE) {
        this.speedSamples.shift();
      }
      
      // Average speed
      this.state.speedBps = Math.round(
        this.speedSamples.reduce((a, b) => a + b, 0) / this.speedSamples.length
      );
      
      // Estimated time remaining
      const bytesRemaining = this.state.totalBytes - bytesSent;
      if (this.state.speedBps > 0) {
        this.state.estimatedSecondsRemaining = Math.round(bytesRemaining / this.state.speedBps);
      }
      
      this.lastProgressTime = now;
      this.lastProgressBytes = bytesSent;
    }
  }

  private emitProgress(): void {
    if (this.onProgress) {
      this.onProgress({ ...this.state });
    }
  }

  private persistState(): void {
    try {
      const persisted: PersistedUpload = {
        uploadId: this.uploadId,
        matchId: this.matchId,
        filename: this.file?.name || '',
        fileType: this.state.fileType,
        totalChunks: this.state.totalChunks,
        sentChunks: Array.from(this.sentChunks),
        lastUpdated: new Date().toISOString()
      };
      
      const existing = this.getPersistedUploads();
      const updated = existing.filter(u => u.uploadId !== this.uploadId);
      updated.push(persisted);
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('[ChunkedUpload] Failed to persist state:', e);
    }
  }

  private clearPersistedState(): void {
    try {
      const existing = this.getPersistedUploads();
      const updated = existing.filter(u => u.uploadId !== this.uploadId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('[ChunkedUpload] Failed to clear persisted state:', e);
    }
  }

  async start(options: ChunkUploadOptions): Promise<string> {
    this.file = options.file;
    this.matchId = options.matchId;
    this.chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
    this.onProgress = options.onProgress;
    this.onComplete = options.onComplete;
    this.onError = options.onError;
    this.abortController = new AbortController();
    this.isPaused = false;
    this.sentChunks.clear();
    this.speedSamples = [];
    this.lastProgressTime = Date.now();
    this.lastProgressBytes = 0;

    // Validate file
    const validVideoExts = ['mp4', 'mov', 'mkv', 'avi', 'mpeg', 'webm'];
    const validAudioExts = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'];
    const ext = this.file.name.split('.').pop()?.toLowerCase() || '';
    
    const isVideo = validVideoExts.includes(ext);
    const isAudio = validAudioExts.includes(ext);
    
    if (!isVideo && !isAudio) {
      throw new Error(`Extensão não suportada: ${ext}`);
    }

    // Calculate chunks
    const totalChunks = Math.ceil(this.file.size / this.chunkSize);

    // Initialize state
    this.state = {
      ...this.createInitialState(),
      matchId: this.matchId,
      filename: this.file.name,
      fileType: isVideo ? 'video' : 'audio',
      status: 'preparing',
      stage: 'initializing',
      totalBytes: this.file.size,
      totalChunks
    };
    this.addEvent(`Preparando upload: ${this.file.name}`);
    this.emitProgress();

    // Initialize upload on server
    const initResult = await apiClient.post('/api/upload/init', {
      matchId: this.matchId,
      filename: this.file.name,
      fileSize: this.file.size,
      totalChunks,
      fileType: isVideo ? 'video' : 'audio',
      mimeType: this.file.type
    });

    if (!initResult.success) {
      throw new Error(initResult.error || 'Falha ao inicializar upload');
    }

    this.uploadId = initResult.uploadId;
    this.state.uploadId = this.uploadId;
    this.addEvent(`Upload iniciado: ${totalChunks} partes de ${(this.chunkSize / (1024 * 1024)).toFixed(0)}MB`);
    this.emitProgress();
    this.persistState();

    // Start uploading chunks
    await this.uploadChunks();

    return this.uploadId;
  }

  private async uploadChunks(): Promise<void> {
    if (!this.file) return;

    this.state.status = 'uploading';
    this.state.stage = 'uploading_chunks';
    this.emitProgress();

    for (let i = 0; i < this.state.totalChunks; i++) {
      // Check if paused or cancelled
      if (this.isPaused) {
        this.state.status = 'paused';
        this.emitProgress();
        return;
      }

      if (this.abortController?.signal.aborted) {
        this.state.status = 'cancelled';
        this.emitProgress();
        return;
      }

      // Skip already sent chunks (for resume)
      if (this.sentChunks.has(i)) {
        continue;
      }

      // Get chunk data
      const start = i * this.chunkSize;
      const end = Math.min(start + this.chunkSize, this.file.size);
      const chunk = this.file.slice(start, end);

      this.state.currentChunk = i + 1;

      // Upload with retries
      let success = false;
      let lastError: Error | null = null;

      for (let retry = 0; retry < MAX_RETRIES && !success; retry++) {
        try {
          await this.uploadChunk(i, chunk);
          success = true;
          this.sentChunks.add(i);
          
          // Update progress
          this.state.uploadedBytes = end;
          this.updateSpeed(end);
          this.emitProgress();
          this.persistState();

          // Log milestones
          const progress = Math.floor((this.sentChunks.size / this.state.totalChunks) * 100);
          if (progress % 25 === 0 && progress > 0) {
            this.addEvent(`${progress}% enviado (${this.sentChunks.size}/${this.state.totalChunks} partes)`);
          }
        } catch (e) {
          lastError = e instanceof Error ? e : new Error(String(e));
          if (retry < MAX_RETRIES - 1) {
            await this.delay(RETRY_DELAY * (retry + 1));
          }
        }
      }

      if (!success && lastError) {
        this.state.status = 'error';
        this.state.errorMessage = lastError.message;
        this.addEvent(`Erro no upload: ${lastError.message}`);
        this.emitProgress();
        if (this.onError) {
          this.onError(lastError);
        }
        return;
      }
    }

    // All chunks uploaded, complete the upload
    await this.complete();
  }

  private async uploadChunk(index: number, chunk: Blob): Promise<void> {
    const formData = new FormData();
    formData.append('chunk', chunk);
    formData.append('uploadId', this.uploadId);
    formData.append('chunkIndex', String(index));

    // Get base URL from apiClient's getApiUrl method
    const baseUrl = apiClient.getApiUrl();
    const uploadUrl = baseUrl ? `${baseUrl}/api/upload/chunk` : '/api/upload/chunk';

    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      signal: this.abortController?.signal
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `HTTP ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Falha no upload do chunk');
    }
  }

  private async complete(): Promise<void> {
    this.state.status = 'assembling';
    this.state.stage = 'assembling_file';
    this.addEvent('Montando arquivo a partir das partes...');
    this.emitProgress();

    try {
      const result = await apiClient.post('/api/upload/complete', {
        uploadId: this.uploadId
      });

      if (!result.success) {
        throw new Error(result.error || 'Falha ao completar upload');
      }

      this.addEvent('Upload concluído com sucesso!');
      this.clearPersistedState();

      // Start polling for processing status
      this.pollProcessingStatus();

    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      this.state.status = 'error';
      this.state.errorMessage = error.message;
      this.addEvent(`Erro: ${error.message}`);
      this.emitProgress();
      if (this.onError) {
        this.onError(error);
      }
    }
  }

  private async pollProcessingStatus(): Promise<void> {
    const poll = async () => {
      try {
        const status = await apiClient.get(`/api/upload/status/${this.uploadId}`);
        
        if (status.success) {
          this.state.status = status.status as UploadStatus;
          this.state.stage = status.stage;
          this.state.conversionProgress = status.conversionProgress || 0;
          this.state.transcriptionProgress = status.transcriptionProgress || 0;
          this.state.transcriptionSegment = status.transcriptionSegment || { current: 0, total: 0 };
          this.state.events = status.events || [];
          
          this.emitProgress();

          // Check if complete or error
          if (status.status === 'complete') {
            if (this.onComplete) {
              this.onComplete({
                uploadId: this.uploadId,
                outputPath: status.outputPath || '',
                status: 'complete'
              });
            }
            return;
          }

          if (status.status === 'error') {
            this.state.errorMessage = status.errorMessage;
            if (this.onError) {
              this.onError(new Error(status.errorMessage || 'Processing error'));
            }
            return;
          }

          // Continue polling
          setTimeout(poll, 2000);
        }
      } catch (e) {
        console.error('[ChunkedUpload] Poll error:', e);
        setTimeout(poll, 5000);
      }
    };

    poll();
  }

  pause(): void {
    this.isPaused = true;
    this.state.status = 'paused';
    this.addEvent('Upload pausado');
    this.emitProgress();
    this.persistState();

    // Also notify server
    apiClient.post(`/api/upload/pause/${this.uploadId}`).catch(console.error);
  }

  async resume(): Promise<void> {
    if (!this.file || !this.uploadId) {
      throw new Error('Nenhum upload para retomar');
    }

    this.isPaused = false;
    this.abortController = new AbortController();
    this.addEvent('Upload retomado');
    
    // Resume upload on server
    await apiClient.post(`/api/upload/resume/${this.uploadId}`);
    
    // Continue uploading remaining chunks
    await this.uploadChunks();
  }

  async cancel(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
    }
    
    this.state.status = 'cancelled';
    this.addEvent('Upload cancelado');
    this.emitProgress();
    this.clearPersistedState();

    // Notify server
    if (this.uploadId) {
      await apiClient.delete(`/api/upload/cancel/${this.uploadId}`).catch(console.error);
    }
  }

  getState(): UploadState {
    return { ...this.state };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Static methods for persistence
  static getPersistedUploads(): PersistedUpload[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  getPersistedUploads(): PersistedUpload[] {
    return ChunkedUploadService.getPersistedUploads();
  }

  static getPersistedUploadsForMatch(matchId: string): PersistedUpload[] {
    return this.getPersistedUploads().filter(u => u.matchId === matchId);
  }

  static clearPersistedUpload(uploadId: string): void {
    try {
      const existing = this.getPersistedUploads();
      const updated = existing.filter(u => u.uploadId !== uploadId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('[ChunkedUpload] Failed to clear persisted upload:', e);
    }
  }

  static clearAllPersisted(): void {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export { ChunkedUploadService };
export default ChunkedUploadService;
