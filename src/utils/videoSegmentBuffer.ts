/**
 * Video Segment Buffer - Manages circular buffer of video segments for live recording
 * 
 * Architecture:
 * - Records in 5-minute segments with 1-minute overlap
 * - Maintains last 2 segments for clip generation
 * - Saves segments to storage periodically
 */

export interface VideoSegment {
  id: string;
  startTime: number; // Recording time in seconds when segment started
  endTime: number; // Recording time when segment ended (or current if active)
  chunks: Blob[];
  blob?: Blob; // Full segment blob after combining chunks
  url?: string; // Storage URL after upload
  isActive: boolean;
  uploadStatus: 'pending' | 'uploading' | 'complete' | 'error';
}

export interface SegmentBufferConfig {
  segmentDurationMs: number; // 5 minutes = 300000ms
  overlapDurationMs: number; // 1 minute = 60000ms
  maxSegments: number; // Keep last 2 segments in memory
  chunkIntervalMs: number; // 5 seconds between chunks
}

const DEFAULT_CONFIG: SegmentBufferConfig = {
  segmentDurationMs: 5 * 60 * 1000, // 5 minutes
  overlapDurationMs: 1 * 60 * 1000, // 1 minute overlap
  maxSegments: 3, // Keep 3 segments to ensure overlap coverage
  chunkIntervalMs: 5000, // 5 second chunks
};

export class VideoSegmentBuffer {
  private segments: VideoSegment[] = [];
  private config: SegmentBufferConfig;
  private onSegmentComplete?: (segment: VideoSegment) => Promise<void>;
  private recordingStartTime: number = 0;

  constructor(
    config: Partial<SegmentBufferConfig> = {},
    onSegmentComplete?: (segment: VideoSegment) => Promise<void>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.onSegmentComplete = onSegmentComplete;
  }

  /**
   * Initialize buffer for new recording session
   */
  start(recordingStartTime: number = Date.now()): void {
    this.segments = [];
    this.recordingStartTime = recordingStartTime;
    this.startNewSegment(0);
  }

  /**
   * Start a new segment at the given recording time (in seconds)
   */
  private startNewSegment(recordingTimeSeconds: number): VideoSegment {
    const segment: VideoSegment = {
      id: `segment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      startTime: recordingTimeSeconds,
      endTime: recordingTimeSeconds,
      chunks: [],
      isActive: true,
      uploadStatus: 'pending',
    };

    this.segments.push(segment);
    console.log(`[SegmentBuffer] Started new segment at ${recordingTimeSeconds}s`);
    return segment;
  }

  /**
   * Add a video chunk to the current active segment
   */
  addChunk(chunk: Blob, recordingTimeSeconds: number): void {
    const activeSegment = this.getActiveSegment();
    if (!activeSegment) {
      console.warn('[SegmentBuffer] No active segment, starting new one');
      this.startNewSegment(recordingTimeSeconds);
      return this.addChunk(chunk, recordingTimeSeconds);
    }

    activeSegment.chunks.push(chunk);
    activeSegment.endTime = recordingTimeSeconds;

    // Check if current segment is complete (5 minutes)
    const segmentDurationSeconds = this.config.segmentDurationMs / 1000;
    const elapsedSeconds = recordingTimeSeconds - activeSegment.startTime;

    if (elapsedSeconds >= segmentDurationSeconds) {
      this.completeSegment(activeSegment);
      
      // Start new segment with 1 minute overlap
      const overlapSeconds = this.config.overlapDurationMs / 1000;
      const newStartTime = recordingTimeSeconds - overlapSeconds;
      this.startNewSegment(newStartTime);
    }

    // Prune old segments
    this.pruneOldSegments();
  }

  /**
   * Complete a segment and trigger upload
   */
  private async completeSegment(segment: VideoSegment): Promise<void> {
    segment.isActive = false;
    
    // Combine chunks into single blob
    if (segment.chunks.length > 0) {
      segment.blob = new Blob(segment.chunks, { type: 'video/webm' });
      console.log(`[SegmentBuffer] Segment ${segment.id} complete: ${(segment.blob.size / 1024 / 1024).toFixed(2)}MB`);
      
      // Trigger callback for upload
      if (this.onSegmentComplete) {
        segment.uploadStatus = 'uploading';
        try {
          await this.onSegmentComplete(segment);
          segment.uploadStatus = 'complete';
        } catch (error) {
          console.error('[SegmentBuffer] Segment upload failed:', error);
          segment.uploadStatus = 'error';
        }
      }
    }
  }

  /**
   * Get the currently active segment
   */
  getActiveSegment(): VideoSegment | undefined {
    return this.segments.find(s => s.isActive);
  }

  /**
   * Get all segments
   */
  getAllSegments(): VideoSegment[] {
    return [...this.segments];
  }

  /**
   * Get segment that covers a specific recording time
   */
  getSegmentForTime(recordingTimeSeconds: number): VideoSegment | undefined {
    // Find segment where time falls within start-end range
    return this.segments.find(s => 
      recordingTimeSeconds >= s.startTime && recordingTimeSeconds <= s.endTime + 10
    );
  }

  /**
   * Get the blob for a specific time range (for clip generation)
   * Returns the best segment that covers the requested time
   */
  getBlobForTimeRange(startSeconds: number, endSeconds: number): Blob | null {
    // First try to find a completed segment with blob
    const completedSegment = this.segments.find(s => 
      !s.isActive && 
      s.blob && 
      startSeconds >= s.startTime && 
      endSeconds <= s.endTime + 10
    );

    if (completedSegment?.blob) {
      return completedSegment.blob;
    }

    // Fall back to active segment chunks
    const activeSegment = this.getActiveSegment();
    if (activeSegment && activeSegment.chunks.length > 0) {
      if (startSeconds >= activeSegment.startTime) {
        return new Blob(activeSegment.chunks, { type: 'video/webm' });
      }
    }

    // Combine multiple segments if needed
    const relevantSegments = this.segments.filter(s => 
      (s.blob || s.chunks.length > 0) &&
      s.startTime <= endSeconds && 
      s.endTime >= startSeconds
    );

    if (relevantSegments.length > 0) {
      const blobs = relevantSegments.map(s => 
        s.blob || new Blob(s.chunks, { type: 'video/webm' })
      );
      return new Blob(blobs, { type: 'video/webm' });
    }

    return null;
  }

  /**
   * Get all chunks combined (for final video)
   */
  getAllChunksCombined(): Blob | null {
    const allBlobs: Blob[] = [];
    
    for (const segment of this.segments) {
      if (segment.blob) {
        allBlobs.push(segment.blob);
      } else if (segment.chunks.length > 0) {
        allBlobs.push(new Blob(segment.chunks, { type: 'video/webm' }));
      }
    }

    if (allBlobs.length === 0) return null;
    return new Blob(allBlobs, { type: 'video/webm' });
  }

  /**
   * Remove old segments to free memory
   */
  private pruneOldSegments(): void {
    while (this.segments.length > this.config.maxSegments) {
      const oldest = this.segments.shift();
      if (oldest) {
        // Clear references to free memory
        oldest.chunks = [];
        oldest.blob = undefined;
        console.log(`[SegmentBuffer] Pruned old segment ${oldest.id}`);
      }
    }
  }

  /**
   * Force complete and upload the active segment
   */
  async flush(): Promise<void> {
    const activeSegment = this.getActiveSegment();
    if (activeSegment) {
      await this.completeSegment(activeSegment);
    }
  }

  /**
   * Get total recording duration based on segments
   */
  getTotalDuration(): number {
    if (this.segments.length === 0) return 0;
    const firstSegment = this.segments[0];
    const lastSegment = this.segments[this.segments.length - 1];
    return lastSegment.endTime - firstSegment.startTime;
  }

  /**
   * Get storage URLs for all uploaded segments
   */
  getUploadedSegmentUrls(): string[] {
    return this.segments
      .filter(s => s.url && s.uploadStatus === 'complete')
      .map(s => s.url!);
  }

  /**
   * Reset the buffer
   */
  reset(): void {
    this.segments = [];
    this.recordingStartTime = 0;
  }
}

/**
 * Calculate clip time window based on event time
 */
export function calculateClipWindow(
  eventTimeSeconds: number,
  bufferBeforeSeconds: number = 5,
  bufferAfterSeconds: number = 5
): { start: number; end: number; duration: number } {
  const start = Math.max(0, eventTimeSeconds - bufferBeforeSeconds);
  const end = eventTimeSeconds + bufferAfterSeconds;
  return {
    start,
    end,
    duration: end - start,
  };
}
