"""
Media Chunker - FFmpeg-based video/audio splitting for ArenaPlay.

This module provides idempotent splitting of video files into chunks
for parallel and resilient transcription processing.
"""

import os
import json
import subprocess
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional, Tuple

# Default chunk duration in seconds
CHUNK_DURATION_DEFAULT = 10

# Audio settings for Whisper transcription
AUDIO_SAMPLE_RATE = 16000
AUDIO_CHANNELS = 1

# Base directory for job data
DATA_DIR = Path(__file__).parent / "data" / "jobs"


def get_video_duration(video_path: str) -> float:
    """
    Get video duration in seconds using ffprobe.
    
    Args:
        video_path: Path to the video file
        
    Returns:
        Duration in seconds (float), or 0.0 on error
    """
    try:
        cmd = [
            'ffprobe', '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            data = json.loads(result.stdout)
            duration = float(data.get('format', {}).get('duration', 0))
            print(f"[MediaChunker] Video duration: {duration:.2f}s ({duration/60:.1f}min)")
            return duration
    except subprocess.TimeoutExpired:
        print(f"[MediaChunker] Timeout getting video duration")
    except json.JSONDecodeError as e:
        print(f"[MediaChunker] Error parsing ffprobe output: {e}")
    except Exception as e:
        print(f"[MediaChunker] Error getting video duration: {e}")
    
    return 0.0


def is_chunk_valid(chunk_path: str, min_size_bytes: int = 1000) -> bool:
    """
    Check if a chunk file exists and has valid size.
    
    Args:
        chunk_path: Path to the chunk file
        min_size_bytes: Minimum file size to consider valid
        
    Returns:
        True if chunk is valid, False otherwise
    """
    if not os.path.exists(chunk_path):
        return False
    
    file_size = os.path.getsize(chunk_path)
    return file_size > min_size_bytes


def get_job_dir(job_id: str) -> Path:
    """Get the job directory path."""
    job_dir = DATA_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    return job_dir


def get_chunks_dir(job_id: str) -> Path:
    """Get the media_chunks directory for a job."""
    chunks_dir = get_job_dir(job_id) / "media_chunks"
    chunks_dir.mkdir(parents=True, exist_ok=True)
    return chunks_dir


def get_source_dir(job_id: str) -> Path:
    """Get the source directory for a job."""
    source_dir = get_job_dir(job_id) / "source"
    source_dir.mkdir(parents=True, exist_ok=True)
    return source_dir


def split_video_to_chunks(
    video_path: str,
    job_id: str,
    chunk_duration: int = CHUNK_DURATION_DEFAULT,
    on_progress: callable = None
) -> Tuple[List[Dict], int]:
    """
    Split video into fixed-duration chunks using FFmpeg.
    
    Uses stream copy (-c copy) for fast splitting without re-encoding.
    Idempotent: skips chunks that already exist with valid size.
    
    Args:
        video_path: Path to the source video file
        job_id: Job ID for output directory
        chunk_duration: Duration of each chunk in seconds
        on_progress: Optional callback(current_chunk, total_chunks, message)
        
    Returns:
        Tuple of (list of chunk info dicts, total_chunks)
    """
    chunks_dir = get_chunks_dir(job_id)
    chunks = []
    
    # Get video duration
    total_duration = get_video_duration(video_path)
    if total_duration <= 0:
        print(f"[MediaChunker] Could not determine video duration")
        return [], 0
    
    total_duration_ms = int(total_duration * 1000)
    chunk_duration_ms = chunk_duration * 1000
    
    # Calculate total chunks needed
    total_chunks = int(total_duration // chunk_duration)
    if total_duration % chunk_duration > 0:
        total_chunks += 1
    
    print(f"[MediaChunker] Splitting video into {total_chunks} chunks of {chunk_duration}s each")
    
    for i in range(total_chunks):
        chunk_index = i + 1
        start_seconds = i * chunk_duration
        start_ms = start_seconds * 1000
        
        # Calculate end time (may be shorter for last chunk)
        remaining = total_duration - start_seconds
        actual_duration = min(chunk_duration, remaining)
        end_ms = start_ms + int(actual_duration * 1000)
        
        # File names with zero-padding
        video_filename = f"chunk_{chunk_index:06d}.mp4"
        audio_filename = f"chunk_{chunk_index:06d}.wav"
        
        video_chunk_path = chunks_dir / video_filename
        audio_chunk_path = chunks_dir / audio_filename
        
        chunk_info = {
            'chunk_index': chunk_index,
            'start_ms': start_ms,
            'end_ms': end_ms,
            'duration_ms': end_ms - start_ms,
            'video_path': video_filename,
            'audio_path': audio_filename,
            'video_size_bytes': 0,
            'audio_size_bytes': 0,
            'status': 'pending'
        }
        
        # Check if video chunk already exists (idempotency)
        if is_chunk_valid(str(video_chunk_path)):
            chunk_info['video_size_bytes'] = os.path.getsize(str(video_chunk_path))
            chunk_info['status'] = 'video_ready'
            print(f"[MediaChunker] Chunk {chunk_index}/{total_chunks} video already exists, skipping")
        else:
            # Extract video chunk using stream copy
            if on_progress:
                on_progress(chunk_index, total_chunks, f"Dividindo vídeo {chunk_index}/{total_chunks}...")
            
            cmd = [
                'ffmpeg', '-y',
                '-ss', str(start_seconds),
                '-i', video_path,
                '-t', str(actual_duration),
                '-c', 'copy',
                '-avoid_negative_ts', 'make_zero',
                str(video_chunk_path)
            ]
            
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
                
                if result.returncode == 0 and is_chunk_valid(str(video_chunk_path)):
                    chunk_info['video_size_bytes'] = os.path.getsize(str(video_chunk_path))
                    chunk_info['status'] = 'video_ready'
                    print(f"[MediaChunker] ✓ Chunk {chunk_index}/{total_chunks} video extracted")
                else:
                    chunk_info['status'] = 'video_failed'
                    chunk_info['error'] = result.stderr[:200] if result.stderr else 'Unknown error'
                    print(f"[MediaChunker] ✗ Chunk {chunk_index} video extraction failed")
            except subprocess.TimeoutExpired:
                chunk_info['status'] = 'video_failed'
                chunk_info['error'] = 'Timeout'
                print(f"[MediaChunker] ✗ Chunk {chunk_index} video extraction timeout")
            except Exception as e:
                chunk_info['status'] = 'video_failed'
                chunk_info['error'] = str(e)
                print(f"[MediaChunker] ✗ Chunk {chunk_index} video extraction error: {e}")
        
        chunks.append(chunk_info)
    
    return chunks, total_chunks


def extract_audio_for_chunks(
    job_id: str,
    chunks: List[Dict],
    on_progress: callable = None
) -> List[Dict]:
    """
    Extract audio WAV files from video chunks for Whisper transcription.
    
    Creates mono 16kHz WAV files optimized for speech recognition.
    Idempotent: skips audio files that already exist with valid size.
    
    Args:
        job_id: Job ID
        chunks: List of chunk info dicts from split_video_to_chunks
        on_progress: Optional callback(current_chunk, total_chunks, message)
        
    Returns:
        Updated list of chunk info dicts
    """
    chunks_dir = get_chunks_dir(job_id)
    total_chunks = len(chunks)
    
    for chunk in chunks:
        chunk_index = chunk['chunk_index']
        video_chunk_path = chunks_dir / chunk['video_path']
        audio_chunk_path = chunks_dir / chunk['audio_path']
        
        # Check if audio already exists (idempotency)
        if is_chunk_valid(str(audio_chunk_path)):
            chunk['audio_size_bytes'] = os.path.getsize(str(audio_chunk_path))
            if chunk['status'] == 'video_ready':
                chunk['status'] = 'ready'
            print(f"[MediaChunker] Chunk {chunk_index}/{total_chunks} audio already exists, skipping")
            continue
        
        # Skip if video chunk is not ready
        if not is_chunk_valid(str(video_chunk_path)):
            print(f"[MediaChunker] Chunk {chunk_index} video not ready, skipping audio extraction")
            continue
        
        if on_progress:
            on_progress(chunk_index, total_chunks, f"Extraindo áudio {chunk_index}/{total_chunks}...")
        
        # Extract audio as WAV mono 16kHz
        cmd = [
            'ffmpeg', '-y',
            '-i', str(video_chunk_path),
            '-vn',
            '-acodec', 'pcm_s16le',
            '-ar', str(AUDIO_SAMPLE_RATE),
            '-ac', str(AUDIO_CHANNELS),
            str(audio_chunk_path)
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            
            if result.returncode == 0 and is_chunk_valid(str(audio_chunk_path)):
                chunk['audio_size_bytes'] = os.path.getsize(str(audio_chunk_path))
                chunk['status'] = 'ready'
                print(f"[MediaChunker] ✓ Chunk {chunk_index}/{total_chunks} audio extracted ({chunk['audio_size_bytes']/1024:.1f}KB)")
            else:
                if chunk['status'] == 'video_ready':
                    chunk['status'] = 'audio_failed'
                chunk['audio_error'] = result.stderr[:200] if result.stderr else 'Unknown error'
                print(f"[MediaChunker] ✗ Chunk {chunk_index} audio extraction failed")
        except subprocess.TimeoutExpired:
            chunk['audio_error'] = 'Timeout'
            print(f"[MediaChunker] ✗ Chunk {chunk_index} audio extraction timeout")
        except Exception as e:
            chunk['audio_error'] = str(e)
            print(f"[MediaChunker] ✗ Chunk {chunk_index} audio extraction error: {e}")
    
    return chunks


def generate_manifest(
    job_id: str,
    source_video: str,
    chunks: List[Dict],
    chunk_duration_seconds: int = CHUNK_DURATION_DEFAULT
) -> Dict:
    """
    Generate manifest.json with complete metadata for all chunks.
    
    Args:
        job_id: Job ID
        source_video: Path to the original video
        chunks: List of chunk info dicts
        chunk_duration_seconds: Configured chunk duration
        
    Returns:
        Manifest dict
    """
    chunks_dir = get_chunks_dir(job_id)
    
    # Calculate totals
    total_duration_ms = sum(c['duration_ms'] for c in chunks)
    ready_chunks = sum(1 for c in chunks if c['status'] == 'ready')
    failed_chunks = sum(1 for c in chunks if 'failed' in c['status'])
    
    manifest = {
        'job_id': job_id,
        'created_at': datetime.now().isoformat(),
        'source_video': source_video,
        'total_duration_ms': total_duration_ms,
        'chunk_duration_ms': chunk_duration_seconds * 1000,
        'total_chunks': len(chunks),
        'ready_chunks': ready_chunks,
        'failed_chunks': failed_chunks,
        'status': 'ready' if ready_chunks == len(chunks) else 'partial',
        'chunks': chunks
    }
    
    # Save manifest
    manifest_path = chunks_dir / 'manifest.json'
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    
    print(f"[MediaChunker] ✓ Manifest saved: {manifest_path}")
    print(f"[MediaChunker]   Total chunks: {len(chunks)}, Ready: {ready_chunks}, Failed: {failed_chunks}")
    
    return manifest


def load_manifest(job_id: str) -> Optional[Dict]:
    """
    Load manifest.json for a job.
    
    Args:
        job_id: Job ID
        
    Returns:
        Manifest dict or None if not found
    """
    manifest_path = get_chunks_dir(job_id) / 'manifest.json'
    
    if not manifest_path.exists():
        return None
    
    try:
        with open(manifest_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"[MediaChunker] Error loading manifest: {e}")
        return None


def prepare_media_for_job(
    job_id: str,
    video_path: str,
    chunk_duration: int = CHUNK_DURATION_DEFAULT,
    on_progress: callable = None
) -> Dict:
    """
    Complete media preparation: split video + extract audio + generate manifest.
    
    This is the main entry point for preparing media for transcription.
    Fully idempotent: safe to call multiple times.
    
    Args:
        job_id: Job ID
        video_path: Path to the source video
        chunk_duration: Duration of each chunk in seconds
        on_progress: Optional callback(stage, current, total, message)
        
    Returns:
        Manifest dict
    """
    print(f"[MediaChunker] ========================================")
    print(f"[MediaChunker] Preparing media for job {job_id}")
    print(f"[MediaChunker] Video: {video_path}")
    print(f"[MediaChunker] Chunk duration: {chunk_duration}s")
    
    # Check if manifest already exists (full idempotency)
    existing_manifest = load_manifest(job_id)
    if existing_manifest and existing_manifest.get('status') == 'ready':
        print(f"[MediaChunker] ✓ Media already prepared, using existing manifest")
        return existing_manifest
    
    # Progress wrapper
    def progress_wrapper(stage: str):
        def inner(current, total, message):
            if on_progress:
                on_progress(stage, current, total, message)
        return inner
    
    # Step 1: Split video
    print(f"[MediaChunker] Step 1: Splitting video...")
    chunks, total_chunks = split_video_to_chunks(
        video_path, 
        job_id, 
        chunk_duration,
        on_progress=progress_wrapper('splitting')
    )
    
    if not chunks:
        return {
            'job_id': job_id,
            'status': 'failed',
            'error': 'Failed to split video'
        }
    
    # Step 2: Extract audio
    print(f"[MediaChunker] Step 2: Extracting audio...")
    chunks = extract_audio_for_chunks(
        job_id, 
        chunks,
        on_progress=progress_wrapper('extracting_audio')
    )
    
    # Step 3: Generate manifest
    print(f"[MediaChunker] Step 3: Generating manifest...")
    manifest = generate_manifest(job_id, video_path, chunks, chunk_duration)
    
    print(f"[MediaChunker] ========================================")
    print(f"[MediaChunker] ✓ Media preparation complete")
    
    return manifest


def get_chunk_audio_path(job_id: str, chunk_index: int) -> Optional[str]:
    """
    Get the full path to a chunk's audio file.
    
    Args:
        job_id: Job ID
        chunk_index: 1-based chunk index
        
    Returns:
        Full path to audio file or None if not found
    """
    audio_path = get_chunks_dir(job_id) / f"chunk_{chunk_index:06d}.wav"
    
    if audio_path.exists():
        return str(audio_path)
    
    return None


def cleanup_job_media(job_id: str, keep_manifest: bool = True) -> bool:
    """
    Clean up all media files for a job.
    
    Args:
        job_id: Job ID
        keep_manifest: Whether to keep the manifest file
        
    Returns:
        True if cleanup was successful
    """
    try:
        job_dir = get_job_dir(job_id)
        
        if not job_dir.exists():
            return True
        
        import shutil
        
        # Remove chunks directory
        chunks_dir = job_dir / "media_chunks"
        if chunks_dir.exists():
            if keep_manifest:
                # Only delete chunk files, keep manifest
                for f in chunks_dir.iterdir():
                    if f.name != 'manifest.json':
                        f.unlink()
            else:
                shutil.rmtree(chunks_dir)
        
        print(f"[MediaChunker] ✓ Cleaned up job {job_id}")
        return True
    except Exception as e:
        print(f"[MediaChunker] Error cleaning up job {job_id}: {e}")
        return False
