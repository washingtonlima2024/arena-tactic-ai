"""
Local file storage management for Arena Play.
Replaces Supabase Storage with local filesystem.
"""

import os
import shutil
import uuid
from pathlib import Path
from datetime import datetime

# Base storage directory
STORAGE_DIR = Path(os.path.dirname(__file__)) / 'storage'

# Storage buckets (matching Supabase structure)
BUCKETS = {
    'match-videos': STORAGE_DIR / 'match-videos',
    'event-clips': STORAGE_DIR / 'event-clips',
    'generated-audio': STORAGE_DIR / 'generated-audio',
    'thumbnails': STORAGE_DIR / 'thumbnails',
    'smart-editor': STORAGE_DIR / 'smart-editor',
    'vignettes': STORAGE_DIR / 'vignettes'
}


def init_storage():
    """Initialize storage directories."""
    STORAGE_DIR.mkdir(exist_ok=True)
    for bucket_name, bucket_path in BUCKETS.items():
        bucket_path.mkdir(exist_ok=True)
        print(f"Storage bucket initialized: {bucket_name}")


def get_bucket_path(bucket: str) -> Path:
    """Get the path for a storage bucket."""
    if bucket not in BUCKETS:
        raise ValueError(f"Unknown bucket: {bucket}")
    return BUCKETS[bucket]


def save_file(bucket: str, file_data: bytes, filename: str = None, extension: str = None) -> dict:
    """
    Save a file to a storage bucket.
    
    Args:
        bucket: The bucket name
        file_data: The file content as bytes
        filename: Optional custom filename (without extension)
        extension: File extension (e.g., 'mp4', 'mp3', 'png')
    
    Returns:
        dict with 'path', 'url', and 'filename'
    """
    bucket_path = get_bucket_path(bucket)
    
    # Generate filename if not provided
    if not filename:
        filename = f"{uuid.uuid4()}"
    
    # Add extension
    if extension:
        filename = f"{filename}.{extension}"
    
    file_path = bucket_path / filename
    
    # Write file
    with open(file_path, 'wb') as f:
        f.write(file_data)
    
    # Generate URL (relative to storage)
    relative_path = f"{bucket}/{filename}"
    
    return {
        'path': str(file_path),
        'url': f"/api/storage/{relative_path}",
        'filename': filename,
        'bucket': bucket,
        'size': len(file_data),
        'created_at': datetime.utcnow().isoformat()
    }


def save_uploaded_file(bucket: str, file_storage, filename: str = None) -> dict:
    """
    Save an uploaded file (from Flask request.files).
    
    Args:
        bucket: The bucket name
        file_storage: Flask FileStorage object
        filename: Optional custom filename
    
    Returns:
        dict with file info
    """
    bucket_path = get_bucket_path(bucket)
    
    # Get original filename and extension
    original_filename = file_storage.filename or 'file'
    extension = original_filename.rsplit('.', 1)[-1] if '.' in original_filename else ''
    
    # Generate new filename if not provided
    if not filename:
        filename = f"{uuid.uuid4()}"
    
    if extension:
        filename = f"{filename}.{extension}"
    
    file_path = bucket_path / filename
    
    # Save file
    file_storage.save(str(file_path))
    
    # Get file size
    file_size = file_path.stat().st_size
    
    return {
        'path': str(file_path),
        'url': f"/api/storage/{bucket}/{filename}",
        'filename': filename,
        'original_filename': original_filename,
        'bucket': bucket,
        'size': file_size,
        'created_at': datetime.utcnow().isoformat()
    }


def get_file_path(bucket: str, filename: str) -> Path:
    """Get the full path for a file in a bucket."""
    bucket_path = get_bucket_path(bucket)
    return bucket_path / filename


def file_exists(bucket: str, filename: str) -> bool:
    """Check if a file exists in a bucket."""
    return get_file_path(bucket, filename).exists()


def delete_file(bucket: str, filename: str) -> bool:
    """Delete a file from a bucket."""
    file_path = get_file_path(bucket, filename)
    if file_path.exists():
        file_path.unlink()
        return True
    return False


def list_files(bucket: str) -> list:
    """List all files in a bucket."""
    bucket_path = get_bucket_path(bucket)
    files = []
    for file_path in bucket_path.iterdir():
        if file_path.is_file():
            stat = file_path.stat()
            files.append({
                'filename': file_path.name,
                'url': f"/api/storage/{bucket}/{file_path.name}",
                'size': stat.st_size,
                'modified_at': datetime.fromtimestamp(stat.st_mtime).isoformat()
            })
    return files


def get_storage_stats() -> dict:
    """Get storage statistics."""
    stats = {
        'total_size': 0,
        'buckets': {}
    }
    
    for bucket_name, bucket_path in BUCKETS.items():
        bucket_size = 0
        file_count = 0
        
        if bucket_path.exists():
            for file_path in bucket_path.iterdir():
                if file_path.is_file():
                    bucket_size += file_path.stat().st_size
                    file_count += 1
        
        stats['buckets'][bucket_name] = {
            'size': bucket_size,
            'file_count': file_count
        }
        stats['total_size'] += bucket_size
    
    return stats


def copy_file(source_bucket: str, source_filename: str, dest_bucket: str, dest_filename: str = None) -> dict:
    """Copy a file from one bucket to another."""
    source_path = get_file_path(source_bucket, source_filename)
    
    if not source_path.exists():
        raise FileNotFoundError(f"Source file not found: {source_bucket}/{source_filename}")
    
    dest_filename = dest_filename or source_filename
    dest_path = get_file_path(dest_bucket, dest_filename)
    
    shutil.copy2(source_path, dest_path)
    
    return {
        'path': str(dest_path),
        'url': f"/api/storage/{dest_bucket}/{dest_filename}",
        'filename': dest_filename,
        'bucket': dest_bucket
    }


def move_file(source_bucket: str, source_filename: str, dest_bucket: str, dest_filename: str = None) -> dict:
    """Move a file from one bucket to another."""
    result = copy_file(source_bucket, source_filename, dest_bucket, dest_filename)
    delete_file(source_bucket, source_filename)
    return result


# Initialize storage when module is imported
init_storage()
