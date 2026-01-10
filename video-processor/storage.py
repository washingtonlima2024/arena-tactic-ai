"""
Local file storage management - organized by match.
All files for a match are grouped together in subfolders.
Uses BASE_DIR environment variable for predictable paths.
"""

import os
import shutil
import uuid
from pathlib import Path
from datetime import datetime

# Base directory from environment or current file location
BASE_DIR = Path(os.environ.get('ARENA_BASE_DIR', os.path.dirname(__file__)))

# Base storage directory - uses BASE_DIR for predictability
STORAGE_DIR = Path(os.environ.get('ARENA_STORAGE_DIR', BASE_DIR / 'storage'))

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

# Video sub-subfolders for original and optimized versions
VIDEO_SUBFOLDERS = [
    "original",   # Original or symlinked files
    "optimized"   # Converted 480p versions
]

# Clip sub-subfolders for organization by half
CLIP_SUBFOLDERS = [
    "first_half",    # Clips from 1st half
    "second_half",   # Clips from 2nd half
    "full",          # Clips from full match
    "extra"          # Clips from extra time or other segments
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
    
    # Create clip sub-subfolders for organization by half
    clips_path = match_path / "clips"
    for clip_subfolder in CLIP_SUBFOLDERS:
        (clips_path / clip_subfolder).mkdir(exist_ok=True)
    
    # Create video sub-subfolders for original/optimized
    videos_path = match_path / "videos"
    for video_subfolder in VIDEO_SUBFOLDERS:
        (videos_path / video_subfolder).mkdir(exist_ok=True)
    
    return match_path


def get_clip_subfolder_path(match_id: str, half_type: str) -> Path:
    """
    Get the path for clips organized by half type.
    
    Args:
        match_id: The match ID
        half_type: One of 'first_half', 'second_half', 'first', 'second', 'full', 'extra'
    
    Returns:
        Path to the clip subfolder
    """
    # Normalize half_type
    half_map = {
        'first': 'first_half',
        'second': 'second_half',
        'first_half': 'first_half',
        'second_half': 'second_half',
        'full': 'full',
        'extra': 'extra'
    }
    normalized_half = half_map.get(half_type, 'full')
    
    match_path = get_match_storage_path(match_id)
    clips_path = match_path / "clips" / normalized_half
    clips_path.mkdir(parents=True, exist_ok=True)
    
    return clips_path


def save_clip_file(
    match_id: str, 
    half_type: str, 
    file_data: bytes, 
    filename: str = None,
    event_minute: int = None,
    event_type: str = None,
    team_short: str = None
) -> dict:
    """
    Save a clip file to the appropriate half subfolder.
    
    Args:
        match_id: The match ID
        half_type: 'first_half', 'second_half', 'full', or 'extra'
        file_data: Raw bytes of the clip
        filename: Optional filename (auto-generated if not provided)
        event_minute: Optional minute for filename generation
        event_type: Optional event type for filename generation
        team_short: Optional team short name for filename generation
    
    Returns:
        Dict with file metadata
    """
    clip_folder = get_clip_subfolder_path(match_id, half_type)
    
    # Generate standardized filename if not provided
    if not filename:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_id = str(uuid.uuid4())[:8]
        
        if event_minute is not None and event_type:
            # Standardized format: {minute}min-{type}-{team}.mp4
            team_suffix = f"-{team_short}" if team_short else ""
            filename = f"{event_minute:02d}min-{event_type}{team_suffix}.mp4"
        else:
            filename = f"{timestamp}_{file_id}.mp4"
    
    # Ensure unique filename if it already exists
    file_path = clip_folder / filename
    counter = 1
    while file_path.exists():
        name_parts = filename.rsplit('.', 1)
        if len(name_parts) == 2:
            filename = f"{name_parts[0]}_{counter}.{name_parts[1]}"
        else:
            filename = f"{filename}_{counter}"
        file_path = clip_folder / filename
        counter += 1
    
    # Write the file
    with open(file_path, 'wb') as f:
        f.write(file_data)
    
    # Normalize half type for URL
    half_map = {'first': 'first_half', 'second': 'second_half'}
    normalized_half = half_map.get(half_type, half_type)
    
    return {
        "match_id": match_id,
        "subfolder": f"clips/{normalized_half}",
        "half_type": normalized_half,
        "filename": filename,
        "path": str(file_path),
        "url": f"http://localhost:5000/api/storage/{match_id}/clips/{normalized_half}/{filename}",
        "size": len(file_data),
        "created_at": datetime.now().isoformat()
    }


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
        "url": f"http://localhost:5000/api/storage/{match_id}/{subfolder}/{filename}",
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
        "url": f"http://localhost:5000/api/storage/{match_id}/{subfolder}/{filename}",
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


def get_video_subfolder_path(match_id: str, video_type: str) -> Path:
    """
    Get the path for videos organized by type (original or optimized).
    
    Args:
        match_id: The match ID
        video_type: 'original' or 'optimized'
    
    Returns:
        Path to the video subfolder
    """
    if video_type not in VIDEO_SUBFOLDERS:
        video_type = 'original'  # Default to original
    
    match_path = get_match_storage_path(match_id)
    video_path = match_path / "videos" / video_type
    video_path.mkdir(parents=True, exist_ok=True)
    
    return video_path


def save_optimized_video(
    match_id: str,
    file_data: bytes,
    original_filename: str,
    video_type: str = 'full'
) -> dict:
    """
    Save an optimized (480p) video file.
    
    Args:
        match_id: The match ID
        file_data: Raw bytes of the video
        original_filename: Original filename (will be modified for optimized)
        video_type: 'full', 'first_half', 'second_half'
    
    Returns:
        Dict with file metadata
    """
    optimized_folder = get_video_subfolder_path(match_id, 'optimized')
    
    # Generate filename based on original with _480p suffix
    name_parts = original_filename.rsplit('.', 1)
    if len(name_parts) == 2:
        filename = f"{name_parts[0]}_480p.{name_parts[1]}"
    else:
        filename = f"{original_filename}_480p.mp4"
    
    file_path = optimized_folder / filename
    
    # Ensure unique filename
    counter = 1
    while file_path.exists():
        if len(name_parts) == 2:
            filename = f"{name_parts[0]}_480p_{counter}.{name_parts[1]}"
        else:
            filename = f"{original_filename}_480p_{counter}.mp4"
        file_path = optimized_folder / filename
        counter += 1
    
    # Write the file
    with open(file_path, 'wb') as f:
        f.write(file_data)
    
    return {
        "match_id": match_id,
        "subfolder": "videos/optimized",
        "filename": filename,
        "path": str(file_path),
        "url": f"http://localhost:5000/api/storage/{match_id}/videos/optimized/{filename}",
        "size": len(file_data),
        "video_type": video_type,
        "original_filename": original_filename,
        "created_at": datetime.now().isoformat()
    }


# Initialize storage on import
init_storage()
