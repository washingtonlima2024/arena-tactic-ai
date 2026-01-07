"""
Local file storage management - organized by match.
All files for a match are grouped together in subfolders.
"""

import os
import shutil
import uuid
from pathlib import Path
from datetime import datetime

# Base storage directory
STORAGE_DIR = Path(os.path.dirname(__file__)) / 'storage'

# Subfolder types within each match folder
MATCH_SUBFOLDERS = [
    "videos",    # Main match videos (full game, halves)
    "clips",     # Event clips extracted from videos
    "images",    # Thumbnails, screenshots, tactical images
    "audio",     # Narrations, podcasts, transcription audio
    "texts",     # Transcriptions, analysis texts, summaries
    "srt",       # Subtitle files
    "json"       # Structured data exports, metadata
]

# Legacy bucket names mapped to new subfolder names
BUCKET_TO_SUBFOLDER = {
    'match-videos': 'videos',
    'event-clips': 'clips',
    'generated-audio': 'audio',
    'thumbnails': 'images',
    'smart-editor': 'videos',
    'vignettes': 'videos'
}


def init_storage():
    """Initialize the base storage directory."""
    STORAGE_DIR.mkdir(exist_ok=True)
    print(f"Storage initialized at: {STORAGE_DIR.absolute()}")


def get_match_storage_path(match_id: str) -> Path:
    """Get or create the storage path for a specific match."""
    match_path = STORAGE_DIR / match_id
    match_path.mkdir(exist_ok=True)
    
    # Create all subfolders for the match
    for subfolder in MATCH_SUBFOLDERS:
        (match_path / subfolder).mkdir(exist_ok=True)
    
    return match_path


def get_subfolder_path(match_id: str, subfolder: str) -> Path:
    """Get the path for a specific subfolder within a match."""
    # Map legacy bucket names to subfolders
    if subfolder in BUCKET_TO_SUBFOLDER:
        subfolder = BUCKET_TO_SUBFOLDER[subfolder]
    
    if subfolder not in MATCH_SUBFOLDERS:
        raise ValueError(f"Invalid subfolder: {subfolder}. Must be one of {MATCH_SUBFOLDERS}")
    
    match_path = get_match_storage_path(match_id)
    return match_path / subfolder


def get_default_extension(subfolder: str) -> str:
    """Get default file extension based on subfolder type."""
    extensions = {
        "videos": ".mp4",
        "clips": ".mp4",
        "images": ".jpg",
        "audio": ".mp3",
        "texts": ".txt",
        "srt": ".srt",
        "json": ".json"
    }
    return extensions.get(subfolder, ".bin")


def save_file(match_id: str, subfolder: str, file_data: bytes, filename: str = None, extension: str = None) -> dict:
    """
    Save file data to a match's subfolder.
    Returns metadata about the saved file.
    """
    # Map legacy bucket names
    if subfolder in BUCKET_TO_SUBFOLDER:
        subfolder = BUCKET_TO_SUBFOLDER[subfolder]
    
    folder_path = get_subfolder_path(match_id, subfolder)
    
    # Generate filename if not provided
    if not filename:
        file_id = str(uuid.uuid4())[:8]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        ext = extension or get_default_extension(subfolder)
        if not ext.startswith('.'):
            ext = '.' + ext
        filename = f"{timestamp}_{file_id}{ext}"
    elif extension and not filename.endswith(extension):
        if not extension.startswith('.'):
            extension = '.' + extension
        filename = f"{filename}{extension}"
    
    file_path = folder_path / filename
    
    with open(file_path, 'wb') as f:
        f.write(file_data)
    
    return {
        "match_id": match_id,
        "subfolder": subfolder,
        "filename": filename,
        "path": str(file_path),
        "url": f"/api/storage/{match_id}/{subfolder}/{filename}",
        "size": len(file_data),
        "created_at": datetime.now().isoformat()
    }


def save_uploaded_file(match_id: str, subfolder: str, file_storage, filename: str = None) -> dict:
    """
    Save a file from Flask FileStorage object.
    """
    # Map legacy bucket names
    if subfolder in BUCKET_TO_SUBFOLDER:
        subfolder = BUCKET_TO_SUBFOLDER[subfolder]
    
    folder_path = get_subfolder_path(match_id, subfolder)
    
    # Use original filename or generate one
    if not filename:
        original_name = file_storage.filename or "file"
        file_id = str(uuid.uuid4())[:8]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        ext = Path(original_name).suffix or get_default_extension(subfolder)
        filename = f"{timestamp}_{file_id}{ext}"
    
    file_path = folder_path / filename
    file_storage.save(str(file_path))
    
    file_size = file_path.stat().st_size
    
    return {
        "match_id": match_id,
        "subfolder": subfolder,
        "filename": filename,
        "path": str(file_path),
        "url": f"/api/storage/{match_id}/{subfolder}/{filename}",
        "size": file_size,
        "original_filename": file_storage.filename,
        "created_at": datetime.now().isoformat()
    }


def get_file_path(match_id: str, subfolder: str, filename: str) -> Path:
    """Get the full path for a specific file."""
    # Map legacy bucket names
    if subfolder in BUCKET_TO_SUBFOLDER:
        subfolder = BUCKET_TO_SUBFOLDER[subfolder]
    
    return get_subfolder_path(match_id, subfolder) / filename


def file_exists(match_id: str, subfolder: str, filename: str) -> bool:
    """Check if a file exists."""
    return get_file_path(match_id, subfolder, filename).exists()


def read_file(match_id: str, subfolder: str, filename: str) -> bytes:
    """Read file contents."""
    file_path = get_file_path(match_id, subfolder, filename)
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    
    with open(file_path, 'rb') as f:
        return f.read()


def delete_file(match_id: str, subfolder: str, filename: str) -> bool:
    """Delete a file from storage."""
    file_path = get_file_path(match_id, subfolder, filename)
    if file_path.exists():
        file_path.unlink()
        return True
    return False


def list_match_files(match_id: str, subfolder: str = None) -> list:
    """
    List all files for a match, optionally filtered by subfolder.
    """
    match_path = STORAGE_DIR / match_id
    if not match_path.exists():
        return []
    
    files = []
    
    subfolders_to_check = [subfolder] if subfolder else MATCH_SUBFOLDERS
    
    # Map legacy bucket names
    subfolders_to_check = [
        BUCKET_TO_SUBFOLDER.get(sf, sf) for sf in subfolders_to_check
    ]
    
    for sf in subfolders_to_check:
        sf_path = match_path / sf
        if not sf_path.exists():
            continue
            
        for file_path in sf_path.iterdir():
            if file_path.is_file():
                stat = file_path.stat()
                files.append({
                    "match_id": match_id,
                    "subfolder": sf,
                    "filename": file_path.name,
                    "url": f"/api/storage/{match_id}/{sf}/{file_path.name}",
                    "size": stat.st_size,
                    "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat()
                })
    
    return files


def list_all_matches() -> list:
    """List all match IDs that have storage folders."""
    if not STORAGE_DIR.exists():
        return []
    
    matches = []
    for item in STORAGE_DIR.iterdir():
        if item.is_dir():
            matches.append({
                "match_id": item.name,
                "path": str(item),
                "subfolders": [sf for sf in MATCH_SUBFOLDERS if (item / sf).exists()]
            })
    
    return matches


def get_match_storage_stats(match_id: str) -> dict:
    """Get storage statistics for a specific match."""
    match_path = STORAGE_DIR / match_id
    if not match_path.exists():
        return {"match_id": match_id, "exists": False}
    
    stats = {
        "match_id": match_id,
        "exists": True,
        "subfolders": {},
        "total_size": 0,
        "total_files": 0
    }
    
    for subfolder in MATCH_SUBFOLDERS:
        sf_path = match_path / subfolder
        if sf_path.exists():
            files = list(sf_path.iterdir())
            size = sum(f.stat().st_size for f in files if f.is_file())
            count = len([f for f in files if f.is_file()])
            
            stats["subfolders"][subfolder] = {
                "file_count": count,
                "size": size,
                "size_mb": round(size / (1024 * 1024), 2)
            }
            stats["total_size"] += size
            stats["total_files"] += count
    
    stats["total_size_mb"] = round(stats["total_size"] / (1024 * 1024), 2)
    
    return stats


def get_storage_stats() -> dict:
    """Get total storage statistics across all matches."""
    if not STORAGE_DIR.exists():
        return {"total_matches": 0, "total_size": 0, "total_files": 0}
    
    total_size = 0
    total_files = 0
    matches = []
    
    for match_dir in STORAGE_DIR.iterdir():
        if match_dir.is_dir():
            match_stats = get_match_storage_stats(match_dir.name)
            if match_stats.get("exists"):
                matches.append(match_stats)
                total_size += match_stats["total_size"]
                total_files += match_stats["total_files"]
    
    return {
        "total_matches": len(matches),
        "total_size": total_size,
        "total_size_mb": round(total_size / (1024 * 1024), 2),
        "total_size_gb": round(total_size / (1024 * 1024 * 1024), 2),
        "total_files": total_files,
        "matches": matches
    }


def copy_file(match_id: str, source_subfolder: str, source_filename: str, 
              dest_subfolder: str, dest_filename: str = None) -> dict:
    """Copy a file within the same match to a different subfolder."""
    source_path = get_file_path(match_id, source_subfolder, source_filename)
    if not source_path.exists():
        raise FileNotFoundError(f"Source file not found: {source_path}")
    
    dest_filename = dest_filename or source_filename
    dest_path = get_file_path(match_id, dest_subfolder, dest_filename)
    
    shutil.copy2(source_path, dest_path)
    
    # Map legacy bucket names for response
    dest_sf = BUCKET_TO_SUBFOLDER.get(dest_subfolder, dest_subfolder)
    
    return {
        "match_id": match_id,
        "subfolder": dest_sf,
        "filename": dest_filename,
        "url": f"/api/storage/{match_id}/{dest_sf}/{dest_filename}",
        "size": dest_path.stat().st_size,
        "copied_from": f"{source_subfolder}/{source_filename}"
    }


def move_file(match_id: str, source_subfolder: str, source_filename: str,
              dest_subfolder: str, dest_filename: str = None) -> dict:
    """Move a file within the same match to a different subfolder."""
    result = copy_file(match_id, source_subfolder, source_filename, dest_subfolder, dest_filename)
    delete_file(match_id, source_subfolder, source_filename)
    result["moved_from"] = result.pop("copied_from")
    return result


def delete_match_storage(match_id: str) -> bool:
    """Delete all storage for a match."""
    match_path = STORAGE_DIR / match_id
    if match_path.exists():
        shutil.rmtree(match_path)
        return True
    return False


def export_match_metadata(match_id: str) -> dict:
    """Export all file metadata for a match as JSON."""
    files = list_match_files(match_id)
    stats = get_match_storage_stats(match_id)
    
    return {
        "match_id": match_id,
        "exported_at": datetime.now().isoformat(),
        "stats": stats,
        "files": files
    }


# Initialize storage on import
init_storage()
