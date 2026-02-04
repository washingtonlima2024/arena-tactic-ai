"""
Arena Play - Audio Processor
Handles audio extraction, conversion, and segmentation for Whisper transcription.
"""

import os
import subprocess
import json
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List, Tuple
import uuid

from database import get_db_session

# Constants
WHISPER_SAMPLE_RATE = 16000
WHISPER_CHANNELS = 1
SEGMENT_DURATION = 45  # seconds
SEGMENT_OVERLAP = 2    # seconds

# FFmpeg paths
FFMPEG = 'ffmpeg'
FFPROBE = 'ffprobe'


def get_audio_duration(audio_path: str) -> float:
    """Get audio duration in seconds using ffprobe."""
    try:
        result = subprocess.run([
            FFPROBE, '-v', 'quiet',
            '-show_entries', 'format=duration',
            '-of', 'json',
            audio_path
        ], capture_output=True, text=True)
        
        data = json.loads(result.stdout)
        return float(data['format']['duration'])
    except Exception as e:
        print(f"[AUDIO] Error getting duration: {e}")
        return 0.0


def get_video_info(video_path: str) -> Dict[str, Any]:
    """Get video/audio file information using ffprobe."""
    try:
        result = subprocess.run([
            FFPROBE, '-v', 'quiet',
            '-show_format', '-show_streams',
            '-of', 'json',
            video_path
        ], capture_output=True, text=True)
        
        return json.loads(result.stdout)
    except Exception as e:
        print(f"[AUDIO] Error getting video info: {e}")
        return {}


def needs_video_conversion(video_path: str) -> Tuple[bool, str]:
    """
    Check if video needs conversion to MP4 H.264 + AAC.
    Returns: (needs_conversion, reason)
    """
    info = get_video_info(video_path)
    if not info:
        return True, "Não foi possível obter informações do vídeo"
    
    ext = Path(video_path).suffix.lower()
    
    # Check container
    if ext not in ['.mp4']:
        return True, f"Container {ext} precisa ser convertido para MP4"
    
    # Check codecs
    streams = info.get('streams', [])
    video_codec = None
    audio_codec = None
    
    for stream in streams:
        if stream.get('codec_type') == 'video':
            video_codec = stream.get('codec_name')
        elif stream.get('codec_type') == 'audio':
            audio_codec = stream.get('codec_name')
    
    if video_codec and video_codec not in ['h264', 'libx264']:
        return True, f"Codec de vídeo {video_codec} precisa ser H.264"
    
    if audio_codec and audio_codec not in ['aac', 'mp3']:
        return True, f"Codec de áudio {audio_codec} precisa ser AAC"
    
    return False, "Arquivo já está no formato ideal"


def convert_video_to_mp4(
    input_path: str,
    output_path: str,
    progress_callback: callable = None
) -> Dict[str, Any]:
    """
    Convert video to MP4 H.264 + AAC.
    Uses CRF 23 for good quality/size balance.
    """
    try:
        # Get input duration for progress
        duration = get_audio_duration(input_path)
        
        # Build ffmpeg command
        cmd = [
            FFMPEG, '-y', '-i', input_path,
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-progress', 'pipe:1',
            output_path
        ]
        
        print(f"[AUDIO] Converting video: {Path(input_path).name}")
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True
        )
        
        # Parse progress
        for line in process.stdout:
            if 'out_time_ms=' in line:
                try:
                    time_ms = int(line.split('=')[1].strip())
                    time_sec = time_ms / 1000000
                    if duration > 0 and progress_callback:
                        progress = min(100, int((time_sec / duration) * 100))
                        progress_callback(progress)
                except:
                    pass
        
        process.wait()
        
        if process.returncode != 0:
            error = process.stderr.read()
            return {'success': False, 'error': error}
        
        output_size = Path(output_path).stat().st_size if Path(output_path).exists() else 0
        
        return {
            'success': True,
            'outputPath': output_path,
            'outputSize': output_size,
            'duration': duration
        }
        
    except Exception as e:
        return {'success': False, 'error': str(e)}


def extract_audio_for_whisper(
    input_path: str,
    output_path: str,
    progress_callback: callable = None
) -> Dict[str, Any]:
    """
    Extract audio from video/audio file to WAV mono 16kHz for Whisper.
    """
    try:
        duration = get_audio_duration(input_path)
        
        cmd = [
            FFMPEG, '-y', '-i', input_path,
            '-vn',  # No video
            '-acodec', 'pcm_s16le',
            '-ar', str(WHISPER_SAMPLE_RATE),
            '-ac', str(WHISPER_CHANNELS),
            '-progress', 'pipe:1',
            output_path
        ]
        
        print(f"[AUDIO] Extracting audio for Whisper: {Path(input_path).name}")
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True
        )
        
        for line in process.stdout:
            if 'out_time_ms=' in line:
                try:
                    time_ms = int(line.split('=')[1].strip())
                    time_sec = time_ms / 1000000
                    if duration > 0 and progress_callback:
                        progress = min(100, int((time_sec / duration) * 100))
                        progress_callback(progress)
                except:
                    pass
        
        process.wait()
        
        if process.returncode != 0:
            error = process.stderr.read()
            return {'success': False, 'error': error}
        
        output_size = Path(output_path).stat().st_size if Path(output_path).exists() else 0
        actual_duration = get_audio_duration(output_path)
        
        return {
            'success': True,
            'outputPath': output_path,
            'outputSize': output_size,
            'duration': actual_duration
        }
        
    except Exception as e:
        return {'success': False, 'error': str(e)}


def segment_audio_for_whisper(
    audio_path: str,
    output_dir: str,
    segment_duration: int = SEGMENT_DURATION,
    overlap: int = SEGMENT_OVERLAP
) -> Dict[str, Any]:
    """
    Segment audio into smaller chunks for Whisper transcription.
    Uses overlap to avoid cutting words.
    
    Returns manifest with segment information.
    """
    try:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        total_duration = get_audio_duration(audio_path)
        if total_duration <= 0:
            return {'success': False, 'error': 'Não foi possível obter duração do áudio'}
        
        segments = []
        current_time = 0.0
        segment_index = 0
        step = segment_duration - overlap
        
        while current_time < total_duration:
            end_time = min(current_time + segment_duration, total_duration)
            segment_filename = f'segment_{segment_index:04d}.wav'
            segment_path = output_dir / segment_filename
            
            # Extract segment
            cmd = [
                FFMPEG, '-y',
                '-i', audio_path,
                '-ss', str(current_time),
                '-t', str(end_time - current_time),
                '-acodec', 'pcm_s16le',
                '-ar', str(WHISPER_SAMPLE_RATE),
                '-ac', str(WHISPER_CHANNELS),
                str(segment_path)
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode != 0:
                print(f"[AUDIO] Warning: Failed to extract segment {segment_index}")
                continue
            
            segment_info = {
                'index': segment_index,
                'filename': segment_filename,
                'path': str(segment_path),
                'startMs': int(current_time * 1000),
                'endMs': int(end_time * 1000),
                'durationMs': int((end_time - current_time) * 1000)
            }
            segments.append(segment_info)
            
            current_time += step
            segment_index += 1
            
            # Progress
            print(f"[AUDIO] Segmented {segment_index}/{int(total_duration / step) + 1}")
        
        # Save manifest
        manifest = {
            'sourceFile': audio_path,
            'totalDurationMs': int(total_duration * 1000),
            'segmentDuration': segment_duration,
            'overlap': overlap,
            'segments': segments,
            'createdAt': datetime.utcnow().isoformat()
        }
        
        manifest_path = output_dir / 'manifest.json'
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)
        
        return {
            'success': True,
            'manifestPath': str(manifest_path),
            'totalSegments': len(segments),
            'totalDuration': total_duration
        }
        
    except Exception as e:
        return {'success': False, 'error': str(e)}


def load_segment_checkpoint(upload_id: str, segment_index: int) -> Optional[Dict[str, Any]]:
    """Load checkpoint for a specific segment if it exists."""
    from chunked_upload import get_upload_dir
    
    checkpoint_path = get_upload_dir(upload_id) / 'transcript' / f'checkpoint_{segment_index:04d}.json'
    if checkpoint_path.exists():
        try:
            with open(checkpoint_path, 'r') as f:
                return json.load(f)
        except:
            pass
    return None


def save_segment_checkpoint(
    upload_id: str,
    segment_index: int,
    text: str,
    start_ms: int,
    end_ms: int,
    word_timestamps: List[Dict] = None
) -> bool:
    """Save checkpoint for a transcribed segment."""
    from chunked_upload import get_upload_dir
    
    try:
        transcript_dir = get_upload_dir(upload_id) / 'transcript'
        transcript_dir.mkdir(parents=True, exist_ok=True)
        
        checkpoint = {
            'segmentIndex': segment_index,
            'text': text,
            'startMs': start_ms,
            'endMs': end_ms,
            'wordTimestamps': word_timestamps or [],
            'createdAt': datetime.utcnow().isoformat()
        }
        
        checkpoint_path = transcript_dir / f'checkpoint_{segment_index:04d}.json'
        with open(checkpoint_path, 'w') as f:
            json.dump(checkpoint, f, indent=2)
        
        return True
    except Exception as e:
        print(f"[AUDIO] Error saving checkpoint: {e}")
        return False


def merge_segments_to_srt(
    upload_id: str,
    segments: List[Dict[str, Any]],
    overlap_ms: int = SEGMENT_OVERLAP * 1000
) -> str:
    """
    Merge segment transcriptions into SRT format.
    Adjusts timestamps accounting for overlap.
    """
    srt_entries = []
    entry_index = 1
    
    for i, segment in enumerate(segments):
        text = segment.get('text', '').strip()
        if not text:
            continue
        
        start_ms = segment.get('startMs', 0)
        end_ms = segment.get('endMs', 0)
        
        # Adjust for overlap (except first segment)
        if i > 0:
            start_ms = max(0, start_ms - overlap_ms // 2)
        
        # Format timestamps
        def format_time(ms: int) -> str:
            hours = ms // 3600000
            minutes = (ms % 3600000) // 60000
            seconds = (ms % 60000) // 1000
            millis = ms % 1000
            return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"
        
        srt_entries.append(f"{entry_index}\n{format_time(start_ms)} --> {format_time(end_ms)}\n{text}\n")
        entry_index += 1
    
    return '\n'.join(srt_entries)


def merge_segments_to_text(segments: List[Dict[str, Any]]) -> str:
    """Merge segment transcriptions into plain text."""
    texts = []
    for segment in segments:
        text = segment.get('text', '').strip()
        if text:
            texts.append(text)
    return ' '.join(texts)


def complete_transcription(
    upload_id: str,
    manifest_path: str,
    dirs: Dict[str, Path],
    update_job: callable,
    add_event: callable
) -> Dict[str, Any]:
    """
    Execute transcription of all segments and update job progress.
    Called automatically after segmentation.
    
    ROBUST FEATURES:
    - Loads checkpoint per segment (resumable)
    - Continues on error (logs and skips)
    - Saves progress after each segment
    
    Args:
        upload_id: Upload job ID
        manifest_path: Path to segments manifest.json
        dirs: Dictionary of upload directories
        update_job: Function to update job status
        add_event: Function to add event log
    
    Returns:
        Dict with 'success', 'text', 'srtContent', 'segments', 'errors'
    """
    from ai_services import transcribe_upload_segments
    
    def progress_callback(current: int, total: int, segment_text: str):
        """Update progress in database."""
        progress_percent = int(80 + (current / total) * 20)  # 80-100%
        update_job({
            'transcription_segment_current': current,
            'transcription_progress': int((current / total) * 100),
            'progress': progress_percent,
            'current_step': f'Transcrevendo segmento {current}/{total}...'
        })
    
    # Call the robust transcription function
    result = transcribe_upload_segments(
        upload_id=upload_id,
        manifest_path=manifest_path,
        progress_callback=progress_callback
    )
    
    return result


def process_upload_media(upload_id: str) -> Dict[str, Any]:
    """
    Process uploaded media: convert video, extract audio, segment for Whisper.
    Updates job status throughout the process.
    """
    from models import UploadJob
    from chunked_upload import get_upload_dir, ensure_upload_dirs
    
    def update_job(updates: Dict[str, Any]):
        with get_db_session() as session:
            job = session.query(UploadJob).filter_by(id=upload_id).first()
            if job:
                for key, value in updates.items():
                    setattr(job, key, value)
                session.commit()
    
    def add_event(message: str):
        with get_db_session() as session:
            job = session.query(UploadJob).filter_by(id=upload_id).first()
            if job:
                events = job.events_log or []
                events.append({
                    'timestamp': datetime.utcnow().isoformat(),
                    'message': message
                })
                job.events_log = events
                session.commit()
    
    try:
        dirs = ensure_upload_dirs(upload_id)
        
        with get_db_session() as session:
            job = session.query(UploadJob).filter_by(id=upload_id).first()
            if not job:
                return {'success': False, 'error': 'Job não encontrado'}
            
            input_path = job.output_path
            file_type = job.file_type
            job.started_at = datetime.utcnow()
            session.commit()
        
        # Step 1: Video conversion (if needed)
        if file_type == 'video':
            needs_conv, reason = needs_video_conversion(input_path)
            
            if needs_conv:
                update_job({'status': 'converting', 'stage': 'converting_video', 'current_step': reason})
                add_event(f'Convertendo vídeo: {reason}')
                
                output_mp4 = str(dirs['media'] / 'converted.mp4')
                
                def conv_progress(p):
                    update_job({'conversion_progress': p})
                
                result = convert_video_to_mp4(input_path, output_mp4, conv_progress)
                
                if not result.get('success'):
                    update_job({'status': 'error', 'error_message': result.get('error')})
                    return result
                
                input_path = output_mp4
                add_event(f'Vídeo convertido ({result.get("outputSize", 0) / (1024*1024):.1f} MB)')
        
        # Step 2: Extract audio for Whisper
        update_job({'status': 'extracting', 'stage': 'extracting_audio', 'current_step': 'Extraindo áudio...'})
        add_event('Extraindo áudio para transcrição')
        
        audio_wav = str(dirs['audio'] / 'audio.wav')
        
        def audio_progress(p):
            update_job({'progress': 50 + p // 4})  # 50-75%
        
        result = extract_audio_for_whisper(input_path, audio_wav, audio_progress)
        
        if not result.get('success'):
            update_job({'status': 'error', 'error_message': result.get('error')})
            return result
        
        add_event(f'Áudio extraído ({result.get("duration", 0):.0f}s)')
        
        # Step 3: Segment audio
        update_job({'status': 'segmenting', 'stage': 'segmenting_audio', 'current_step': 'Fatiando áudio...'})
        add_event('Fatiando áudio em segmentos de 45s')
        
        segments_dir = str(dirs['audio'] / 'segments')
        result = segment_audio_for_whisper(audio_wav, segments_dir)
        
        if not result.get('success'):
            update_job({'status': 'error', 'error_message': result.get('error')})
            return result
        
        total_segments = result.get('totalSegments', 0)
        add_event(f'Áudio fatiado em {total_segments} segmentos')
        
        # Step 4: Start transcription automatically
        update_job({
            'status': 'transcribing',
            'stage': 'transcribing_segments',
            'transcription_segment_total': total_segments,
            'transcription_segment_current': 0,
            'progress': 80,
            'current_step': 'Iniciando transcrição com Whisper Local...'
        })
        add_event('Iniciando transcrição com Whisper Local...')
        
        manifest_path = result.get('manifestPath')
        transcription_result = complete_transcription(upload_id, manifest_path, dirs, update_job, add_event)
        
        if transcription_result.get('success'):
            add_event(f'Transcrição completa: {len(transcription_result.get("text", ""))} caracteres')
            
            # Save SRT and TXT files
            srt_content = transcription_result.get('srtContent', '')
            text_content = transcription_result.get('text', '')
            
            srt_path = dirs['transcript'] / 'final.srt'
            txt_path = dirs['transcript'] / 'final.txt'
            
            srt_path.write_text(srt_content, encoding='utf-8')
            txt_path.write_text(text_content, encoding='utf-8')
            
            update_job({
                'status': 'complete',
                'stage': 'complete',
                'progress': 100,
                'srt_path': str(srt_path),
                'txt_path': str(txt_path),
                'completed_at': datetime.utcnow()
            })
            add_event('Upload e transcrição completos!')
            
            return {
                'success': True,
                'audioPath': audio_wav,
                'segmentsDir': segments_dir,
                'manifestPath': manifest_path,
                'totalSegments': total_segments,
                'srtPath': str(srt_path),
                'txtPath': str(txt_path),
                'transcription': transcription_result
            }
        else:
            errors = transcription_result.get('errors', [])
            add_event(f'Transcrição concluída com erros: {errors}')
            
            # Still mark as complete if we got some text
            if transcription_result.get('text'):
                srt_content = transcription_result.get('srtContent', '')
                text_content = transcription_result.get('text', '')
                
                srt_path = dirs['transcript'] / 'final.srt'
                txt_path = dirs['transcript'] / 'final.txt'
                
                if srt_content:
                    srt_path.write_text(srt_content, encoding='utf-8')
                if text_content:
                    txt_path.write_text(text_content, encoding='utf-8')
                
                update_job({
                    'status': 'complete',
                    'stage': 'complete_with_errors',
                    'progress': 100,
                    'srt_path': str(srt_path) if srt_content else None,
                    'txt_path': str(txt_path) if text_content else None,
                    'completed_at': datetime.utcnow()
                })
                
                return {
                    'success': True,
                    'audioPath': audio_wav,
                    'segmentsDir': segments_dir,
                    'manifestPath': manifest_path,
                    'totalSegments': total_segments,
                    'srtPath': str(srt_path) if srt_content else None,
                    'transcription': transcription_result,
                    'warnings': errors
                }
            else:
                update_job({'status': 'error', 'error_message': f'Transcrição falhou: {errors}'})
                return {'success': False, 'error': f'Transcrição falhou: {errors}'}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        update_job({'status': 'error', 'error_message': str(e)})
        return {'success': False, 'error': str(e)}
