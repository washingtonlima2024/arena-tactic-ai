"""
Arena Play - Chunked Upload Handler
Handles large file uploads through chunking with resume capability.
"""

import os
import json
import hashlib
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List
from threading import Thread
from queue import Queue, Empty
import uuid
from sqlalchemy.orm.attributes import flag_modified

from database import get_db_session
from models import generate_uuid

# Constants
CHUNK_SIZE = 8 * 1024 * 1024  # 8MB default
UPLOADS_DIR = Path(__file__).parent / 'data' / 'uploads'
MAX_CONCURRENT_JOBS = 1

# Valid extensions
VIDEO_EXTENSIONS = {'mp4', 'mov', 'mkv', 'avi', 'mpeg', 'webm'}
AUDIO_EXTENSIONS = {'mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'}
ALLOWED_EXTENSIONS = VIDEO_EXTENSIONS | AUDIO_EXTENSIONS

# Processing queue
processing_queue = Queue()


def get_upload_dir(upload_id: str) -> Path:
    """Get the upload directory for a specific upload."""
    return UPLOADS_DIR / upload_id


def ensure_upload_dirs(upload_id: str) -> Dict[str, Path]:
    """Create all subdirectories for an upload job."""
    base_dir = get_upload_dir(upload_id)
    dirs = {
        'base': base_dir,
        'chunks': base_dir / 'chunks',
        'media': base_dir / 'media',
        'audio': base_dir / 'audio',
        'transcript': base_dir / 'transcript',
        'logs': base_dir / 'logs'
    }
    for d in dirs.values():
        d.mkdir(parents=True, exist_ok=True)
    return dirs


def validate_extension(filename: str) -> tuple[bool, str, str]:
    """
    Validate file extension.
    Returns: (is_valid, extension, file_type)
    """
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if ext in VIDEO_EXTENSIONS:
        return True, ext, 'video'
    elif ext in AUDIO_EXTENSIONS:
        return True, ext, 'audio'
    return False, ext, 'unknown'


def calculate_chunk_checksum(data: bytes) -> str:
    """Calculate MD5 checksum for chunk data."""
    return hashlib.md5(data).hexdigest()


def init_upload(
    match_id: str,
    filename: str,
    file_size: int,
    total_chunks: int,
    mime_type: str = None
) -> Dict[str, Any]:
    """
    Initialize a new chunked upload.
    Creates upload job in database and prepares directories.
    """
    from models import UploadJob
    
    # Validate extension
    is_valid, ext, file_type = validate_extension(filename)
    if not is_valid:
        return {
            'success': False,
            'error': f'Extensão inválida: {ext}. Permitidas: {", ".join(ALLOWED_EXTENSIONS)}'
        }
    
    upload_id = generate_uuid()
    dirs = ensure_upload_dirs(upload_id)
    
    # Create job in database
    with get_db_session() as session:
        job = UploadJob(
            id=upload_id,
            match_id=match_id,
            original_filename=filename,
            file_extension=ext,
            file_type=file_type,
            total_size_bytes=file_size,
            chunk_size_bytes=CHUNK_SIZE,
            total_chunks=total_chunks,
            received_chunks=[],
            chunks_dir=str(dirs['chunks']),
            status='uploading',
            stage='receiving_chunks',
            progress=0,
            events_log=[]
        )
        # Add initial event after creation
        initial_events = [{
            'timestamp': datetime.utcnow().isoformat(),
            'message': f'Upload iniciado: {filename} ({file_size / (1024*1024):.1f} MB)'
        }]
        job.events_log = initial_events
        job.created_at = datetime.utcnow()
        flag_modified(job, 'events_log')
        session.add(job)
        session.commit()
        
        return {
            'success': True,
            'uploadId': upload_id,
            'chunkSize': CHUNK_SIZE,
            'totalChunks': total_chunks,
            'uploadUrl': f'/api/upload/chunk',
            'fileType': file_type
        }


def receive_chunk(
    upload_id: str,
    chunk_index: int,
    chunk_data: bytes,
    checksum: str = None
) -> Dict[str, Any]:
    """
    Receive and store a single chunk.
    Validates checksum if provided.
    """
    from models import UploadJob
    
    with get_db_session() as session:
        job = session.query(UploadJob).filter_by(id=upload_id).first()
        if not job:
            return {'success': False, 'error': 'Upload não encontrado'}
        
        if job.status == 'cancelled':
            return {'success': False, 'error': 'Upload foi cancelado'}
        
        # Validate checksum if provided
        if checksum:
            calculated = calculate_chunk_checksum(chunk_data)
            if calculated != checksum:
                return {
                    'success': False,
                    'error': f'Checksum inválido para chunk {chunk_index}'
                }
        
        # Save chunk to disk
        chunks_dir = Path(job.chunks_dir)
        chunk_path = chunks_dir / f'chunk_{chunk_index:06d}'
        chunk_path.write_bytes(chunk_data)
        
        # Update received chunks list
        received = list(job.received_chunks or [])  # Create copy
        if chunk_index not in received:
            received.append(chunk_index)
            received.sort()
        job.received_chunks = received
        flag_modified(job, 'received_chunks')  # Force dirty detection
        
        # Calculate progress
        progress = int((len(received) / job.total_chunks) * 100)
        job.progress = progress
        
        # Add event for milestones
        milestones = [25, 50, 75, 100]
        for m in milestones:
            if progress >= m and (progress - (100 / job.total_chunks)) < m:
                events = list(job.events_log or [])  # Create copy
                events.append({
                    'timestamp': datetime.utcnow().isoformat(),
                    'message': f'{progress}% enviado ({len(received)}/{job.total_chunks} partes)'
                })
                job.events_log = events
                flag_modified(job, 'events_log')  # Force dirty detection
                break
        
        session.commit()
        
        return {
            'success': True,
            'chunkIndex': chunk_index,
            'received': len(received),
            'total': job.total_chunks,
            'progress': progress
        }


def verify_chunks_integrity(upload_id: str) -> tuple[bool, str]:
    """
    Verify all chunks are present and valid.
    Returns: (is_valid, error_message)
    """
    from models import UploadJob
    
    with get_db_session() as session:
        job = session.query(UploadJob).filter_by(id=upload_id).first()
        if not job:
            return False, 'Upload não encontrado'
        
        received = job.received_chunks or []
        expected = list(range(job.total_chunks))
        
        # Check all chunks received
        missing = set(expected) - set(received)
        if missing:
            return False, f'Partes faltando: {sorted(missing)[:10]}...'
        
        # Verify chunk files exist
        chunks_dir = Path(job.chunks_dir)
        for i in range(job.total_chunks):
            chunk_path = chunks_dir / f'chunk_{i:06d}'
            if not chunk_path.exists():
                return False, f'Arquivo da parte {i} não encontrado'
            
            # Verify size (last chunk may be smaller)
            expected_size = job.chunk_size_bytes
            if i == job.total_chunks - 1:
                remainder = job.total_size_bytes % job.chunk_size_bytes
                expected_size = remainder if remainder > 0 else job.chunk_size_bytes
            
            actual_size = chunk_path.stat().st_size
            if actual_size != expected_size:
                return False, f'Tamanho incorreto na parte {i}: esperado {expected_size}, recebido {actual_size}'
        
        return True, ''


def assemble_chunks(upload_id: str) -> Dict[str, Any]:
    """
    Assemble all chunks into the final file.
    Returns the path to assembled file.
    """
    from models import UploadJob
    
    with get_db_session() as session:
        job = session.query(UploadJob).filter_by(id=upload_id).first()
        if not job:
            return {'success': False, 'error': 'Upload não encontrado'}
        
        # Verify integrity first
        is_valid, error = verify_chunks_integrity(upload_id)
        if not is_valid:
            job.status = 'error'
            job.error_message = error
            session.commit()
            return {'success': False, 'error': error}
        
        # Update status
        job.status = 'assembling'
        job.stage = 'assembling'
        events = list(job.events_log or [])  # Create copy
        events.append({
            'timestamp': datetime.utcnow().isoformat(),
            'message': 'Montando arquivo a partir das partes...'
        })
        job.events_log = events
        flag_modified(job, 'events_log')  # Force dirty detection
        session.commit()
    
    try:
        # Get paths
        dirs = ensure_upload_dirs(upload_id)
        chunks_dir = dirs['chunks']
        output_path = dirs['media'] / f'original.{job.file_extension}'
        
        # Assemble file
        with open(output_path, 'wb') as outfile:
            for i in range(job.total_chunks):
                chunk_path = chunks_dir / f'chunk_{i:06d}'
                outfile.write(chunk_path.read_bytes())
        
        # Verify assembled file size
        assembled_size = output_path.stat().st_size
        
        with get_db_session() as session:
            job = session.query(UploadJob).filter_by(id=upload_id).first()
            
            if assembled_size != job.total_size_bytes:
                job.status = 'error'
                job.error_message = f'Tamanho final incorreto: {assembled_size} vs {job.total_size_bytes}'
                session.commit()
                return {'success': False, 'error': job.error_message}
            
            job.output_path = str(output_path)
            events = list(job.events_log or [])  # Create copy
            events.append({
                'timestamp': datetime.utcnow().isoformat(),
                'message': f'Arquivo montado com sucesso ({assembled_size / (1024*1024):.1f} MB)'
            })
            job.events_log = events
            flag_modified(job, 'events_log')  # Force dirty detection
            session.commit()
        
        # Clean up chunks
        shutil.rmtree(chunks_dir, ignore_errors=True)
        dirs['chunks'].mkdir(exist_ok=True)  # Recreate empty dir
        
        return {
            'success': True,
            'outputPath': str(output_path),
            'fileSize': assembled_size
        }
        
    except Exception as e:
        with get_db_session() as session:
            job = session.query(UploadJob).filter_by(id=upload_id).first()
            job.status = 'error'
            job.error_message = str(e)
            session.commit()
        return {'success': False, 'error': str(e)}


def complete_upload(upload_id: str, auto_process: bool = True) -> Dict[str, Any]:
    """
    Complete the upload: assemble chunks and optionally start processing.
    """
    # Assemble chunks
    result = assemble_chunks(upload_id)
    if not result.get('success'):
        return result
    
    if auto_process:
        # Queue for processing
        processing_queue.put(upload_id)
    
    return {
        'success': True,
        'uploadId': upload_id,
        'outputPath': result.get('outputPath'),
        'status': 'queued_for_processing' if auto_process else 'assembled'
    }


def get_upload_status(upload_id: str) -> Dict[str, Any]:
    """Get current status of an upload job."""
    from models import UploadJob
    
    with get_db_session() as session:
        job = session.query(UploadJob).filter_by(id=upload_id).first()
        if not job:
            return {'success': False, 'error': 'Upload não encontrado'}
        
        return {
            'success': True,
            'uploadId': job.id,
            'matchId': job.match_id,
            'filename': job.original_filename,
            'fileType': job.file_type,
            'totalSize': job.total_size_bytes,
            'status': job.status,
            'stage': job.stage,
            'progress': job.progress,
            'currentStep': job.current_step,
            'errorMessage': job.error_message,
            'receivedChunks': len(job.received_chunks or []),
            'totalChunks': job.total_chunks,
            'uploadSpeed': job.upload_speed_bytes_per_sec,
            'estimatedTime': job.estimated_time_remaining_sec,
            'conversionProgress': job.conversion_progress,
            'transcriptionProgress': job.transcription_progress,
            'transcriptionSegment': {
                'current': job.transcription_segment_current,
                'total': job.transcription_segment_total
            },
            'events': job.events_log or [],
            'createdAt': job.created_at.isoformat() if job.created_at else None,
            'startedAt': job.started_at.isoformat() if job.started_at else None,
            'completedAt': job.completed_at.isoformat() if job.completed_at else None
        }


def pause_upload(upload_id: str) -> Dict[str, Any]:
    """Pause an upload (frontend stops sending chunks)."""
    from models import UploadJob
    
    with get_db_session() as session:
        job = session.query(UploadJob).filter_by(id=upload_id).first()
        if not job:
            return {'success': False, 'error': 'Upload não encontrado'}
        
        if job.status not in ['uploading']:
            return {'success': False, 'error': f'Não é possível pausar upload com status: {job.status}'}
        
        job.status = 'paused'
        job.paused_at = datetime.utcnow()
        events = list(job.events_log or [])  # Create copy
        events.append({
            'timestamp': datetime.utcnow().isoformat(),
            'message': 'Upload pausado'
        })
        job.events_log = events
        flag_modified(job, 'events_log')  # Force dirty detection
        session.commit()
        
        return {'success': True, 'status': 'paused'}


def resume_upload(upload_id: str) -> Dict[str, Any]:
    """Resume a paused upload."""
    from models import UploadJob
    
    with get_db_session() as session:
        job = session.query(UploadJob).filter_by(id=upload_id).first()
        if not job:
            return {'success': False, 'error': 'Upload não encontrado'}
        
        if job.status != 'paused':
            return {'success': False, 'error': f'Upload não está pausado: {job.status}'}
        
        job.status = 'uploading'
        job.paused_at = None
        events = list(job.events_log or [])  # Create copy
        events.append({
            'timestamp': datetime.utcnow().isoformat(),
            'message': 'Upload retomado'
        })
        job.events_log = events
        flag_modified(job, 'events_log')  # Force dirty detection
        session.commit()
        
        return {
            'success': True,
            'status': 'uploading',
            'receivedChunks': job.received_chunks or [],
            'totalChunks': job.total_chunks
        }


def cancel_upload(upload_id: str) -> Dict[str, Any]:
    """Cancel an upload and clean up files."""
    from models import UploadJob
    
    with get_db_session() as session:
        job = session.query(UploadJob).filter_by(id=upload_id).first()
        if not job:
            return {'success': False, 'error': 'Upload não encontrado'}
        
        job.status = 'cancelled'
        events = list(job.events_log or [])  # Create copy
        events.append({
            'timestamp': datetime.utcnow().isoformat(),
            'message': 'Upload cancelado'
        })
        job.events_log = events
        flag_modified(job, 'events_log')  # Force dirty detection
        session.commit()
    
    # Clean up files
    upload_dir = get_upload_dir(upload_id)
    if upload_dir.exists():
        shutil.rmtree(upload_dir, ignore_errors=True)
    
    return {'success': True, 'status': 'cancelled'}


def get_pending_uploads(match_id: str = None) -> List[Dict[str, Any]]:
    """Get list of pending uploads, optionally filtered by match."""
    from models import UploadJob
    
    with get_db_session() as session:
        query = session.query(UploadJob).filter(
            UploadJob.status.in_(['uploading', 'paused', 'assembling', 'converting', 'transcribing'])
        )
        if match_id:
            query = query.filter_by(match_id=match_id)
        
        jobs = query.all()
        return [get_upload_status(job.id) for job in jobs]
