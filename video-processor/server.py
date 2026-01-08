"""
Arena Play - Servidor API Local Completo
Servidor Flask com SQLite para toda a funcionalidade do Arena Play.
"""

from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
import subprocess
import os
import tempfile
import requests
import uuid
import zipfile
import base64
from pathlib import Path
from datetime import datetime

# Import local modules
from database import init_db, get_session, Session
from models import (
    Team, Match, Player, MatchEvent, Video, AnalysisJob,
    GeneratedAudio, Thumbnail, Profile, UserRole, ApiSetting,
    ChatbotConversation, StreamConfiguration, SmartEditProject,
    SmartEditClip, SmartEditRender, SmartEditSetting
)
from storage import (
    save_file, save_uploaded_file, get_file_path, file_exists,
    delete_file, list_match_files, get_storage_stats, get_match_storage_stats,
    delete_match_storage, STORAGE_DIR, MATCH_SUBFOLDERS, get_subfolder_path,
    get_clip_subfolder_path, save_clip_file, CLIP_SUBFOLDERS,
    get_video_subfolder_path, save_optimized_video, get_match_storage_path
)
import ai_services
import threading
import json as json_module

# Global conversion jobs tracker
conversion_jobs = {}

app = Flask(__name__)
CORS(app)

# Initialize database
init_db()


def load_api_keys_from_db():
    """Load API keys from database on server startup."""
    session = get_session()
    try:
        settings = session.query(ApiSetting).all()
        keys_loaded = []
        ollama_url = None
        ollama_model = None
        ollama_enabled = False
        
        for s in settings:
            if s.setting_key == 'openai_api_key' and s.setting_value:
                ai_services.set_api_keys(openai_key=s.setting_value)
                keys_loaded.append('OPENAI')
            elif s.setting_key == 'gemini_api_key' and s.setting_value:
                ai_services.set_api_keys(google_key=s.setting_value)
                keys_loaded.append('GOOGLE')
            elif s.setting_key == 'LOVABLE_API_KEY' and s.setting_value:
                ai_services.set_api_keys(lovable_key=s.setting_value)
                keys_loaded.append('LOVABLE')
            elif s.setting_key == 'ollama_url' and s.setting_value:
                ollama_url = s.setting_value
            elif s.setting_key == 'ollama_model' and s.setting_value:
                ollama_model = s.setting_value
            elif s.setting_key == 'ollama_enabled':
                ollama_enabled = s.setting_value == 'true'
        
        # Configure Ollama if settings exist
        if ollama_url or ollama_model or ollama_enabled:
            ai_services.set_api_keys(
                ollama_url=ollama_url,
                ollama_model=ollama_model,
                ollama_enabled=ollama_enabled
            )
            if ollama_enabled:
                keys_loaded.append(f'OLLAMA ({ollama_model or "llama3.2"})')
        
        if keys_loaded:
            print(f"✓ AI providers loaded: {', '.join(keys_loaded)}")
        else:
            print("⚠ No AI providers configured. Configure in Settings > API.")
    except Exception as e:
        print(f"⚠ Could not load API keys from database: {e}")
    finally:
        session.close()


# Load API keys from database
load_api_keys_from_db()

# Diretório para vinhetas locais
VIGNETTES_DIR = Path(__file__).parent / "vinhetas"
VIGNETTES_DIR.mkdir(exist_ok=True)


# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def download_video(url: str, output_path: str) -> bool:
    """Baixa um vídeo de uma URL."""
    try:
        print(f"Baixando vídeo de: {url}")
        response = requests.get(url, stream=True, timeout=300)
        response.raise_for_status()
        
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        print(f"Vídeo baixado: {output_path}")
        return True
    except Exception as e:
        print(f"Erro ao baixar vídeo: {e}")
        return False


def extract_clip(input_path: str, output_path: str, start_seconds: float, duration: float) -> bool:
    """Extrai um clip do vídeo usando FFmpeg."""
    try:
        cmd = [
            'ffmpeg', '-y',
            '-ss', str(start_seconds),
            '-i', input_path,
            '-t', str(duration),
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-preset', 'fast',
            '-crf', '23',
            '-movflags', '+faststart',
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        return result.returncode == 0 and os.path.exists(output_path)
    except Exception as e:
        print(f"Erro ao extrair clip: {e}")
        return False


def concatenate_videos(segments: list, output_path: str, tmpdir: str) -> bool:
    """Concatena múltiplos segmentos de vídeo."""
    try:
        concat_file = os.path.join(tmpdir, 'concat.txt')
        with open(concat_file, 'w') as f:
            for seg in segments:
                safe_path = seg.replace("'", "'\\''")
                f.write(f"file '{safe_path}'\n")
        
        cmd = [
            'ffmpeg', '-y',
            '-f', 'concat', '-safe', '0',
            '-i', concat_file,
            '-c:v', 'libx264', '-c:a', 'aac',
            '-preset', 'fast', '-crf', '23',
            '-movflags', '+faststart',
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        return result.returncode == 0 and os.path.exists(output_path)
    except Exception as e:
        print(f"Erro ao concatenar: {e}")
        return False


def normalize_video(input_path: str, output_path: str, target_resolution: str = "1280x720") -> bool:
    """Normaliza um vídeo para resolução consistente."""
    try:
        cmd = [
            'ffmpeg', '-y', '-i', input_path,
            '-vf', f'scale={target_resolution}:force_original_aspect_ratio=decrease,pad={target_resolution}:(ow-iw)/2:(oh-ih)/2',
            '-c:v', 'libx264', '-c:a', 'aac', '-ar', '44100',
            '-preset', 'fast', '-crf', '23',
            output_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        return result.returncode == 0
    except Exception as e:
        print(f"Erro ao normalizar: {e}")
        return False


def get_video_info(file_path: str) -> dict:
    """
    Retorna metadados completos de um vídeo via ffprobe.
    """
    import json as json_lib
    
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Arquivo não encontrado: {file_path}")
    
    try:
        cmd = [
            'ffprobe', '-v', 'quiet',
            '-print_format', 'json',
            '-show_format', '-show_streams',
            file_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode != 0:
            raise Exception(f"ffprobe falhou: {result.stderr}")
        
        data = json_lib.loads(result.stdout)
        
        # Find video stream
        video_stream = None
        for stream in data.get('streams', []):
            if stream.get('codec_type') == 'video':
                video_stream = stream
                break
        
        if not video_stream:
            raise Exception("Nenhum stream de vídeo encontrado")
        
        # Extract info
        width = int(video_stream.get('width', 0))
        height = int(video_stream.get('height', 0))
        codec = video_stream.get('codec_name', 'unknown')
        
        # Duration from format or stream
        format_info = data.get('format', {})
        duration_str = format_info.get('duration') or video_stream.get('duration', '0')
        duration_seconds = float(duration_str)
        
        # Frame rate
        fps_str = video_stream.get('r_frame_rate', '0/1')
        if '/' in fps_str:
            num, den = map(int, fps_str.split('/'))
            fps = round(num / den, 2) if den > 0 else 0
        else:
            fps = float(fps_str)
        
        # Bitrate
        bitrate = int(format_info.get('bit_rate', 0))
        bitrate_kbps = round(bitrate / 1000)
        
        # File size
        size_bytes = int(format_info.get('size', os.path.getsize(file_path)))
        size_mb = round(size_bytes / (1024 * 1024), 2)
        
        # Format size
        if size_mb >= 1024:
            size_formatted = f"{round(size_mb / 1024, 2)} GB"
        else:
            size_formatted = f"{size_mb} MB"
        
        # Format duration
        hours = int(duration_seconds // 3600)
        minutes = int((duration_seconds % 3600) // 60)
        seconds = int(duration_seconds % 60)
        if hours > 0:
            duration_formatted = f"{hours}:{minutes:02d}:{seconds:02d}"
        else:
            duration_formatted = f"{minutes}:{seconds:02d}"
        
        # Resolution label
        if height >= 2160:
            resolution_label = "4K"
        elif height >= 1440:
            resolution_label = "2K"
        elif height >= 1080:
            resolution_label = "Full HD"
        elif height >= 720:
            resolution_label = "HD"
        elif height >= 480:
            resolution_label = "SD"
        else:
            resolution_label = "Low"
        
        # Codec friendly name
        codec_names = {
            'h264': 'H.264',
            'hevc': 'H.265/HEVC',
            'h265': 'H.265/HEVC',
            'vp9': 'VP9',
            'av1': 'AV1',
            'mpeg4': 'MPEG-4',
            'mpeg2video': 'MPEG-2',
        }
        codec_name = codec_names.get(codec.lower(), codec.upper())
        
        # Check if conversion needed (height > 480)
        needs_conversion = height > 480
        
        # Estimate 480p size (rough estimate based on resolution ratio)
        if needs_conversion and height > 0:
            ratio = (480 / height) ** 2  # Area ratio
            estimated_size_480p_mb = round(size_mb * ratio * 1.2, 0)  # +20% for reencoding overhead
        else:
            estimated_size_480p_mb = size_mb
        
        return {
            'path': file_path,
            'filename': os.path.basename(file_path),
            'width': width,
            'height': height,
            'resolution': f"{width}x{height}",
            'resolution_label': resolution_label,
            'codec': codec,
            'codec_name': codec_name,
            'duration_seconds': round(duration_seconds, 2),
            'duration_formatted': duration_formatted,
            'size_bytes': size_bytes,
            'size_mb': size_mb,
            'size_formatted': size_formatted,
            'bitrate_kbps': bitrate_kbps,
            'fps': fps,
            'needs_conversion': needs_conversion,
            'estimated_size_480p_mb': estimated_size_480p_mb
        }
        
    except subprocess.TimeoutExpired:
        raise Exception("Timeout ao analisar vídeo")
    except json_module.JSONDecodeError:
        raise Exception("Falha ao parsear saída do ffprobe")


def convert_to_480p(input_path: str, output_path: str, job_id: str = None, crf: int = 28, preset: str = "medium") -> bool:
    """
    Converte vídeo para 480p otimizado.
    CRF 28 oferece boa qualidade com tamanho reduzido.
    """
    global conversion_jobs
    
    try:
        if job_id:
            conversion_jobs[job_id] = {
                'status': 'converting',
                'progress': 0,
                'input_path': input_path,
                'output_path': output_path
            }
        
        # Get video duration for progress calculation
        duration_cmd = [
            'ffprobe', '-v', 'quiet', '-print_format', 'json',
            '-show_format', input_path
        ]
        duration_result = subprocess.run(duration_cmd, capture_output=True, text=True, timeout=30)
        total_duration = 0
        if duration_result.returncode == 0:
            probe_data = json_module.loads(duration_result.stdout)
            total_duration = float(probe_data.get('format', {}).get('duration', 0))
        
        # FFmpeg command for 480p conversion
        cmd = [
            'ffmpeg', '-y', '-i', input_path,
            '-vf', 'scale=-2:480',  # Mantém aspect ratio
            '-c:v', 'libx264', '-crf', str(crf),
            '-preset', preset,
            '-c:a', 'aac', '-b:a', '128k',
            '-movflags', '+faststart',
            '-progress', 'pipe:1',  # Progress output
            output_path
        ]
        
        print(f"[convert_480p] Starting conversion: {input_path} -> {output_path}")
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True
        )
        
        # Parse progress from stdout
        for line in process.stdout:
            if line.startswith('out_time_ms='):
                try:
                    time_ms = int(line.split('=')[1])
                    time_sec = time_ms / 1000000
                    if total_duration > 0 and job_id:
                        progress = min(int((time_sec / total_duration) * 100), 99)
                        conversion_jobs[job_id]['progress'] = progress
                except:
                    pass
        
        process.wait()
        
        if process.returncode == 0 and os.path.exists(output_path):
            if job_id:
                conversion_jobs[job_id]['status'] = 'completed'
                conversion_jobs[job_id]['progress'] = 100
            
            # Get output file info
            output_size = os.path.getsize(output_path)
            input_size = os.path.getsize(input_path)
            savings = round((1 - output_size / input_size) * 100, 1)
            
            if job_id:
                conversion_jobs[job_id]['output_size'] = output_size
                conversion_jobs[job_id]['savings_percent'] = savings
            
            print(f"[convert_480p] Completed! Savings: {savings}%")
            return True
        else:
            stderr = process.stderr.read()
            print(f"[convert_480p] Failed: {stderr}")
            if job_id:
                conversion_jobs[job_id]['status'] = 'error'
                conversion_jobs[job_id]['error'] = stderr[:500]
            return False
            
    except Exception as e:
        print(f"[convert_480p] Error: {e}")
        if job_id:
            conversion_jobs[job_id]['status'] = 'error'
            conversion_jobs[job_id]['error'] = str(e)
        return False


@app.route('/api/video/info', methods=['POST'])
def video_info_endpoint():
    """Retorna metadados de um arquivo de vídeo via ffprobe."""
    data = request.json
    if not data:
        return jsonify({'error': 'JSON body required'}), 400
    
    path = data.get('path')
    if not path:
        return jsonify({'error': 'path is required'}), 400
    
    try:
        info = get_video_info(path)
        return jsonify(info)
    except FileNotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        print(f"[video/info] Error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/video/convert', methods=['POST'])
def start_video_conversion():
    """
    Inicia conversão de vídeo para 480p em background.
    Retorna um job_id para acompanhar o progresso.
    """
    data = request.json
    if not data:
        return jsonify({'error': 'JSON body required'}), 400
    
    input_path = data.get('input_path')
    match_id = data.get('match_id')
    video_type = data.get('video_type', 'full')
    
    if not input_path:
        return jsonify({'error': 'input_path is required'}), 400
    if not match_id:
        return jsonify({'error': 'match_id is required'}), 400
    
    # Validate input file
    if not os.path.exists(input_path):
        return jsonify({'error': f'File not found: {input_path}'}), 404
    
    # Generate job ID
    job_id = str(uuid.uuid4())[:8]
    
    # Create output path
    optimized_folder = get_video_subfolder_path(match_id, 'optimized')
    original_filename = os.path.basename(input_path)
    name_parts = original_filename.rsplit('.', 1)
    if len(name_parts) == 2:
        output_filename = f"{name_parts[0]}_480p.{name_parts[1]}"
    else:
        output_filename = f"{original_filename}_480p.mp4"
    
    output_path = str(optimized_folder / output_filename)
    
    # Initialize job
    conversion_jobs[job_id] = {
        'status': 'pending',
        'progress': 0,
        'match_id': match_id,
        'video_type': video_type,
        'input_path': input_path,
        'output_path': output_path,
        'output_filename': output_filename,
        'started_at': datetime.now().isoformat()
    }
    
    # Start conversion in background thread
    def run_conversion():
        convert_to_480p(input_path, output_path, job_id)
    
    thread = threading.Thread(target=run_conversion, daemon=True)
    thread.start()
    
    return jsonify({
        'job_id': job_id,
        'status': 'pending',
        'message': 'Conversion started in background'
    })


@app.route('/api/video/convert/status/<job_id>', methods=['GET'])
def get_conversion_status(job_id: str):
    """Retorna status de um job de conversão."""
    if job_id not in conversion_jobs:
        return jsonify({'error': 'Job not found'}), 404
    
    job = conversion_jobs[job_id]
    
    response = {
        'job_id': job_id,
        'status': job.get('status', 'unknown'),
        'progress': job.get('progress', 0)
    }
    
    if job.get('status') == 'completed':
        response['output_path'] = job.get('output_path')
        response['output_filename'] = job.get('output_filename')
        response['output_size'] = job.get('output_size')
        response['savings_percent'] = job.get('savings_percent')
        
        # Build URL for the converted video
        match_id = job.get('match_id')
        if match_id and job.get('output_filename'):
            response['output_url'] = f"http://localhost:5000/api/storage/{match_id}/videos/optimized/{job.get('output_filename')}"
    
    if job.get('status') == 'error':
        response['error'] = job.get('error', 'Unknown error')
    
    return jsonify(response)


# ============================================================================
# HEALTH & STATUS
# ============================================================================

@app.route('/health', methods=['GET'])
def health_check():
    """Verifica status do servidor."""
    try:
        result = subprocess.run(['ffmpeg', '-version'], capture_output=True, text=True, timeout=5)
        ffmpeg_ok = result.returncode == 0
    except:
        ffmpeg_ok = False
    
    storage_stats = get_storage_stats()
    
    return jsonify({
        'status': 'ok',
        'ffmpeg': ffmpeg_ok,
        'database': 'arena_play.db',
        'storage': storage_stats,
        'vignettes_dir': str(VIGNETTES_DIR)
    })


# ============================================================================
# STORAGE API - Organized by Match
# ============================================================================
# Structure: storage/{match_id}/{subfolder}/{filename}
# Subfolders: videos, clips, images, audio, texts, srt, json

@app.route('/api/storage/<match_id>/<subfolder>/<path:filename>', methods=['GET'])
def serve_storage_file(match_id: str, subfolder: str, filename: str):
    """Serve arquivo do storage local organizado por partida."""
    try:
        folder_path = get_subfolder_path(match_id, subfolder)
        file_path = folder_path / filename
        if not file_path.exists():
            return jsonify({'error': 'Arquivo não encontrado'}), 404
        return send_from_directory(folder_path, filename)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/storage/<match_id>', methods=['GET'])
def list_match_storage(match_id: str):
    """Lista todos os arquivos de uma partida."""
    subfolder = request.args.get('subfolder')
    files = list_match_files(match_id, subfolder)
    stats = get_match_storage_stats(match_id)
    return jsonify({'files': files, 'stats': stats})


@app.route('/api/storage/<match_id>/<subfolder>', methods=['GET'])
def list_subfolder_files(match_id: str, subfolder: str):
    """Lista arquivos de um subfolder específico."""
    files = list_match_files(match_id, subfolder)
    return jsonify({'files': files})


@app.route('/api/storage/<match_id>/<subfolder>', methods=['POST'])
def upload_to_match(match_id: str, subfolder: str):
    """Upload de arquivo para subfolder da partida."""
    if 'file' not in request.files:
        return jsonify({'error': 'Nenhum arquivo enviado'}), 400
    
    try:
        file = request.files['file']
        filename = request.form.get('filename')
        result = save_uploaded_file(match_id, subfolder, file, filename)
        return jsonify(result)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/storage/<match_id>/<subfolder>/<filename>', methods=['DELETE'])
def delete_match_file(match_id: str, subfolder: str, filename: str):
    """Remove arquivo do storage da partida."""
    try:
        if delete_file(match_id, subfolder, filename):
            return jsonify({'success': True})
        return jsonify({'error': 'Arquivo não encontrado'}), 404
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/storage/<match_id>', methods=['DELETE'])
def delete_all_match_storage(match_id: str):
    """Remove todo o storage de uma partida."""
    if delete_match_storage(match_id):
        return jsonify({'success': True})
    return jsonify({'error': 'Storage da partida não encontrado'}), 404


@app.route('/api/storage/link-local', methods=['POST'])
def link_local_file():
    """
    Vincula um arquivo local ao sistema sem fazer upload.
    O arquivo permanece no caminho original e é referenciado diretamente.
    Otimizado para ambiente local - evita transferência de dados desnecessária.
    """
    data = request.json
    local_path = data.get('local_path')
    match_id = data.get('match_id')
    subfolder = data.get('subfolder', 'videos')
    video_type = data.get('video_type', 'full')
    
    if not local_path:
        return jsonify({'error': 'Caminho local é obrigatório'}), 400
    if not match_id:
        return jsonify({'error': 'match_id é obrigatório'}), 400
    
    # Validate file exists
    file_path = Path(local_path)
    if not file_path.exists():
        return jsonify({'error': f'Arquivo não encontrado: {local_path}'}), 404
    
    if not file_path.is_file():
        return jsonify({'error': 'Caminho não é um arquivo'}), 400
    
    # Get file stats
    file_stats = file_path.stat()
    file_size = file_stats.st_size
    filename = file_path.name
    
    # Detect video duration using ffprobe
    duration_seconds = None
    try:
        result = subprocess.run([
            'ffprobe', '-v', 'quiet', '-print_format', 'json',
            '-show_format', str(file_path)
        ], capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            import json
            probe_data = json.loads(result.stdout)
            duration_seconds = int(float(probe_data.get('format', {}).get('duration', 0)))
    except Exception as e:
        print(f"[link-local] Não foi possível detectar duração: {e}")
    
    # Create symlink in match storage (optional - for easier browsing)
    try:
        match_storage = get_match_storage_path(match_id)
        subfolder_path = match_storage / subfolder
        symlink_path = subfolder_path / filename
        
        # Remove existing symlink if it exists
        if symlink_path.exists() or symlink_path.is_symlink():
            symlink_path.unlink()
        
        # Create symbolic link to original file
        symlink_path.symlink_to(file_path.absolute())
        
        # URL for the symlinked file (can be served normally)
        file_url = f"http://localhost:5000/api/storage/{match_id}/{subfolder}/{filename}"
    except Exception as e:
        # If symlink fails (Windows without admin), use direct path reference
        print(f"[link-local] Symlink falhou, usando referência direta: {e}")
        file_url = f"file://{file_path.absolute()}"
    
    # Create video record in database
    session = get_session()
    try:
        video = Video(
            match_id=match_id,
            file_url=file_url,
            file_name=filename,
            video_type=video_type,
            duration_seconds=duration_seconds,
            status='ready',
            start_minute=0 if video_type == 'first_half' else (45 if video_type == 'second_half' else 0),
            end_minute=45 if video_type == 'first_half' else (90 if video_type in ['second_half', 'full'] else None)
        )
        session.add(video)
        session.commit()
        
        return jsonify({
            'success': True,
            'video': video.to_dict(),
            'local_path': str(file_path.absolute()),
            'file_size': file_size,
            'file_size_mb': round(file_size / (1024 * 1024), 2),
            'duration_seconds': duration_seconds,
            'symlink_created': file_url.startswith('http')
        })
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


@app.route('/api/storage/browse', methods=['GET'])
def browse_local_directory():
    """
    Lista arquivos de vídeo em um diretório local.
    Usado para navegação de arquivos no frontend.
    """
    directory = request.args.get('path', os.path.expanduser('~'))
    
    try:
        dir_path = Path(directory)
        if not dir_path.exists():
            return jsonify({'error': 'Diretório não encontrado'}), 404
        
        if not dir_path.is_dir():
            return jsonify({'error': 'Caminho não é um diretório'}), 400
        
        files = []
        directories = []
        
        for item in sorted(dir_path.iterdir()):
            if item.name.startswith('.'):
                continue  # Skip hidden files
            
            if item.is_dir():
                directories.append({
                    'name': item.name,
                    'path': str(item.absolute()),
                    'type': 'directory'
                })
            elif item.is_file():
                ext = item.suffix.lower()
                if ext in ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.wmv']:
                    files.append({
                        'name': item.name,
                        'path': str(item.absolute()),
                        'type': 'video',
                        'size': item.stat().st_size,
                        'size_mb': round(item.stat().st_size / (1024 * 1024), 2)
                    })
        
        return jsonify({
            'current_path': str(dir_path.absolute()),
            'parent_path': str(dir_path.parent.absolute()) if dir_path.parent != dir_path else None,
            'directories': directories,
            'files': files
        })
    except PermissionError:
        return jsonify({'error': 'Sem permissão para acessar o diretório'}), 403
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/storage', methods=['GET'])
def get_all_storage_stats():
    """Retorna estatísticas de todo o storage."""
    return jsonify(get_storage_stats())


# ============================================================================
# TEAMS API
# ============================================================================

@app.route('/api/teams', methods=['GET'])
def get_teams():
    """Lista todos os times."""
    session = get_session()
    try:
        teams = session.query(Team).order_by(Team.name).all()
        return jsonify([t.to_dict() for t in teams])
    finally:
        session.close()


@app.route('/api/teams', methods=['POST'])
def create_team():
    """Cria um novo time."""
    data = request.json
    session = get_session()
    try:
        team = Team(
            name=data['name'],
            short_name=data.get('short_name'),
            logo_url=data.get('logo_url'),
            primary_color=data.get('primary_color', '#10b981'),
            secondary_color=data.get('secondary_color', '#ffffff')
        )
        session.add(team)
        session.commit()
        return jsonify(team.to_dict()), 201
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


@app.route('/api/teams/<team_id>', methods=['GET'])
def get_team(team_id: str):
    """Obtém um time por ID."""
    session = get_session()
    try:
        team = session.query(Team).filter_by(id=team_id).first()
        if not team:
            return jsonify({'error': 'Time não encontrado'}), 404
        return jsonify(team.to_dict())
    finally:
        session.close()


@app.route('/api/teams/<team_id>', methods=['PUT'])
def update_team(team_id: str):
    """Atualiza um time."""
    data = request.json
    session = get_session()
    try:
        team = session.query(Team).filter_by(id=team_id).first()
        if not team:
            return jsonify({'error': 'Time não encontrado'}), 404
        
        for key in ['name', 'short_name', 'logo_url', 'primary_color', 'secondary_color']:
            if key in data:
                setattr(team, key, data[key])
        
        session.commit()
        return jsonify(team.to_dict())
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


@app.route('/api/teams/<team_id>', methods=['DELETE'])
def delete_team(team_id: str):
    """Remove um time."""
    session = get_session()
    try:
        team = session.query(Team).filter_by(id=team_id).first()
        if not team:
            return jsonify({'error': 'Time não encontrado'}), 404
        
        session.delete(team)
        session.commit()
        return jsonify({'success': True})
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


# ============================================================================
# MATCHES API
# ============================================================================

@app.route('/api/matches', methods=['GET'])
def get_matches():
    """Lista todas as partidas."""
    session = get_session()
    try:
        matches = session.query(Match).order_by(Match.match_date.desc()).all()
        return jsonify([m.to_dict(include_teams=True) for m in matches])
    finally:
        session.close()


@app.route('/api/matches', methods=['POST'])
def create_match():
    """Cria uma nova partida."""
    data = request.json
    session = get_session()
    try:
        match = Match(
            home_team_id=data.get('home_team_id'),
            away_team_id=data.get('away_team_id'),
            home_score=data.get('home_score', 0),
            away_score=data.get('away_score', 0),
            competition=data.get('competition'),
            match_date=datetime.fromisoformat(data['match_date']) if data.get('match_date') else None,
            venue=data.get('venue'),
            status=data.get('status', 'pending')
        )
        session.add(match)
        session.commit()
        return jsonify(match.to_dict(include_teams=True)), 201
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


@app.route('/api/matches/<match_id>', methods=['GET'])
def get_match(match_id: str):
    """Obtém uma partida por ID com todos os detalhes."""
    session = get_session()
    try:
        match = session.query(Match).filter_by(id=match_id).first()
        if not match:
            return jsonify({'error': 'Partida não encontrada'}), 404
        
        result = match.to_dict(include_teams=True)
        result['events'] = [e.to_dict() for e in match.events]
        result['videos'] = [v.to_dict() for v in match.videos]
        return jsonify(result)
    finally:
        session.close()


@app.route('/api/matches/<match_id>', methods=['PUT'])
def update_match(match_id: str):
    """Atualiza uma partida."""
    data = request.json
    session = get_session()
    try:
        match = session.query(Match).filter_by(id=match_id).first()
        if not match:
            return jsonify({'error': 'Partida não encontrada'}), 404
        
        for key in ['home_team_id', 'away_team_id', 'home_score', 'away_score', 
                    'competition', 'venue', 'status']:
            if key in data:
                setattr(match, key, data[key])
        
        if 'match_date' in data and data['match_date']:
            match.match_date = datetime.fromisoformat(data['match_date'])
        
        session.commit()
        return jsonify(match.to_dict(include_teams=True))
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


@app.route('/api/matches/<match_id>', methods=['DELETE'])
def delete_match(match_id: str):
    """Remove uma partida e todos os dados relacionados."""
    session = get_session()
    try:
        match = session.query(Match).filter_by(id=match_id).first()
        if not match:
            return jsonify({'error': 'Partida não encontrada'}), 404
        
        session.delete(match)
        session.commit()
        return jsonify({'success': True})
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


# ============================================================================
# MATCH EVENTS API
# ============================================================================

@app.route('/api/matches/<match_id>/events', methods=['GET'])
def get_match_events(match_id: str):
    """Lista eventos de uma partida."""
    session = get_session()
    try:
        events = session.query(MatchEvent).filter_by(match_id=match_id)\
            .order_by(MatchEvent.minute, MatchEvent.second).all()
        return jsonify([e.to_dict() for e in events])
    finally:
        session.close()


@app.route('/api/matches/<match_id>/events', methods=['POST'])
def create_match_event(match_id: str):
    """Cria um evento de partida."""
    data = request.json
    session = get_session()
    try:
        event = MatchEvent(
            match_id=match_id,
            event_type=data['event_type'],
            description=data.get('description'),
            minute=data.get('minute'),
            second=data.get('second'),
            match_half=data.get('match_half'),
            player_id=data.get('player_id'),
            video_id=data.get('video_id'),
            position_x=data.get('position_x'),
            position_y=data.get('position_y'),
            is_highlight=data.get('is_highlight', False),
            metadata=data.get('metadata', {})
        )
        session.add(event)
        session.commit()
        return jsonify(event.to_dict()), 201
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


@app.route('/api/events/<event_id>', methods=['GET'])
def get_event(event_id: str):
    """Obtém um evento por ID."""
    session = get_session()
    try:
        event = session.query(MatchEvent).filter_by(id=event_id).first()
        if not event:
            return jsonify({'error': 'Evento não encontrado'}), 404
        return jsonify(event.to_dict())
    finally:
        session.close()


@app.route('/api/events/<event_id>', methods=['PUT'])
def update_event(event_id: str):
    """Atualiza um evento."""
    data = request.json
    session = get_session()
    try:
        event = session.query(MatchEvent).filter_by(id=event_id).first()
        if not event:
            return jsonify({'error': 'Evento não encontrado'}), 404
        
        for key in ['event_type', 'description', 'minute', 'second', 'match_half',
                    'player_id', 'video_id', 'position_x', 'position_y', 'is_highlight',
                    'clip_url', 'approval_status', 'metadata']:
            if key in data:
                setattr(event, key, data[key])
        
        session.commit()
        return jsonify(event.to_dict())
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


@app.route('/api/events/<event_id>', methods=['DELETE'])
def delete_event(event_id: str):
    """Remove um evento."""
    session = get_session()
    try:
        event = session.query(MatchEvent).filter_by(id=event_id).first()
        if not event:
            return jsonify({'error': 'Evento não encontrado'}), 404
        
        session.delete(event)
        session.commit()
        return jsonify({'success': True})
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


# ============================================================================
# PLAYERS API
# ============================================================================

@app.route('/api/players', methods=['GET'])
def get_players():
    """Lista todos os jogadores."""
    team_id = request.args.get('team_id')
    session = get_session()
    try:
        query = session.query(Player)
        if team_id:
            query = query.filter_by(team_id=team_id)
        players = query.order_by(Player.number).all()
        return jsonify([p.to_dict() for p in players])
    finally:
        session.close()


@app.route('/api/players', methods=['POST'])
def create_player():
    """Cria um jogador."""
    data = request.json
    session = get_session()
    try:
        player = Player(
            team_id=data.get('team_id'),
            name=data['name'],
            number=data.get('number'),
            position=data.get('position'),
            photo_url=data.get('photo_url')
        )
        session.add(player)
        session.commit()
        return jsonify(player.to_dict()), 201
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


@app.route('/api/players/<player_id>', methods=['PUT'])
def update_player(player_id: str):
    """Atualiza um jogador."""
    data = request.json
    session = get_session()
    try:
        player = session.query(Player).filter_by(id=player_id).first()
        if not player:
            return jsonify({'error': 'Jogador não encontrado'}), 404
        
        for key in ['team_id', 'name', 'number', 'position', 'photo_url']:
            if key in data:
                setattr(player, key, data[key])
        
        session.commit()
        return jsonify(player.to_dict())
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


@app.route('/api/players/<player_id>', methods=['DELETE'])
def delete_player(player_id: str):
    """Remove um jogador."""
    session = get_session()
    try:
        player = session.query(Player).filter_by(id=player_id).first()
        if not player:
            return jsonify({'error': 'Jogador não encontrado'}), 404
        
        session.delete(player)
        session.commit()
        return jsonify({'success': True})
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


# ============================================================================
# VIDEOS API
# ============================================================================

@app.route('/api/videos', methods=['GET'])
def get_videos():
    """Lista todos os vídeos."""
    match_id = request.args.get('match_id')
    session = get_session()
    try:
        query = session.query(Video)
        if match_id:
            query = query.filter_by(match_id=match_id)
        videos = query.order_by(Video.created_at.desc()).all()
        return jsonify([v.to_dict() for v in videos])
    finally:
        session.close()


@app.route('/api/videos', methods=['POST'])
def create_video():
    """Cria um registro de vídeo."""
    data = request.json
    session = get_session()
    try:
        video = Video(
            match_id=data.get('match_id'),
            file_url=data['file_url'],
            file_name=data.get('file_name'),
            video_type=data.get('video_type', 'full'),
            status=data.get('status', 'pending'),
            duration_seconds=data.get('duration_seconds'),
            start_minute=data.get('start_minute', 0),
            end_minute=data.get('end_minute')
        )
        session.add(video)
        session.commit()
        return jsonify(video.to_dict()), 201
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


@app.route('/api/videos/<video_id>', methods=['PUT'])
def update_video(video_id: str):
    """Atualiza um vídeo."""
    data = request.json
    session = get_session()
    try:
        video = session.query(Video).filter_by(id=video_id).first()
        if not video:
            return jsonify({'error': 'Vídeo não encontrado'}), 404
        
        for key in ['file_url', 'file_name', 'video_type', 'status',
                    'duration_seconds', 'start_minute', 'end_minute']:
            if key in data:
                setattr(video, key, data[key])
        
        session.commit()
        return jsonify(video.to_dict())
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


@app.route('/api/videos/<video_id>', methods=['DELETE'])
def delete_video(video_id: str):
    """Remove um vídeo."""
    session = get_session()
    try:
        video = session.query(Video).filter_by(id=video_id).first()
        if not video:
            return jsonify({'error': 'Vídeo não encontrado'}), 404
        
        session.delete(video)
        session.commit()
        return jsonify({'success': True})
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


# ============================================================================
# ANALYSIS JOBS API
# ============================================================================

@app.route('/api/analysis-jobs', methods=['GET'])
def get_analysis_jobs():
    """Lista jobs de análise."""
    match_id = request.args.get('match_id')
    status = request.args.get('status')
    session = get_session()
    try:
        query = session.query(AnalysisJob)
        if match_id:
            query = query.filter_by(match_id=match_id)
        if status:
            query = query.filter_by(status=status)
        jobs = query.order_by(AnalysisJob.created_at.desc()).all()
        return jsonify([j.to_dict() for j in jobs])
    finally:
        session.close()


@app.route('/api/analysis-jobs', methods=['POST'])
def create_analysis_job():
    """Cria um job de análise."""
    data = request.json
    session = get_session()
    try:
        job = AnalysisJob(
            match_id=data['match_id'],
            video_id=data.get('video_id'),
            status='queued'
        )
        session.add(job)
        session.commit()
        return jsonify(job.to_dict()), 201
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


@app.route('/api/analysis-jobs/<job_id>', methods=['GET'])
def get_analysis_job(job_id: str):
    """Obtém um job de análise."""
    session = get_session()
    try:
        job = session.query(AnalysisJob).filter_by(id=job_id).first()
        if not job:
            return jsonify({'error': 'Job não encontrado'}), 404
        return jsonify(job.to_dict())
    finally:
        session.close()


@app.route('/api/analysis-jobs/<job_id>', methods=['PUT'])
def update_analysis_job(job_id: str):
    """Atualiza um job de análise."""
    data = request.json
    session = get_session()
    try:
        job = session.query(AnalysisJob).filter_by(id=job_id).first()
        if not job:
            return jsonify({'error': 'Job não encontrado'}), 404
        
        for key in ['status', 'progress', 'current_step', 'result', 'error_message']:
            if key in data:
                setattr(job, key, data[key])
        
        if data.get('status') == 'processing' and not job.started_at:
            job.started_at = datetime.utcnow()
        if data.get('status') in ['completed', 'failed']:
            job.completed_at = datetime.utcnow()
        
        session.commit()
        return jsonify(job.to_dict())
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


# ============================================================================
# GENERATED AUDIO API
# ============================================================================

@app.route('/api/audio', methods=['GET'])
def get_generated_audio():
    """Lista áudios gerados."""
    match_id = request.args.get('match_id')
    audio_type = request.args.get('audio_type')
    session = get_session()
    try:
        query = session.query(GeneratedAudio)
        if match_id:
            query = query.filter_by(match_id=match_id)
        if audio_type:
            query = query.filter_by(audio_type=audio_type)
        audios = query.order_by(GeneratedAudio.created_at.desc()).all()
        return jsonify([a.to_dict() for a in audios])
    finally:
        session.close()


@app.route('/api/audio', methods=['POST'])
def create_generated_audio():
    """Cria um registro de áudio gerado."""
    data = request.json
    session = get_session()
    try:
        audio = GeneratedAudio(
            match_id=data['match_id'],
            audio_type=data['audio_type'],
            audio_url=data.get('audio_url'),
            script=data.get('script'),
            voice=data.get('voice'),
            duration_seconds=data.get('duration_seconds')
        )
        session.add(audio)
        session.commit()
        return jsonify(audio.to_dict()), 201
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


# ============================================================================
# THUMBNAILS API
# ============================================================================

@app.route('/api/thumbnails', methods=['GET'])
def get_thumbnails():
    """Lista thumbnails."""
    match_id = request.args.get('match_id')
    session = get_session()
    try:
        query = session.query(Thumbnail)
        if match_id:
            query = query.filter_by(match_id=match_id)
        thumbnails = query.order_by(Thumbnail.created_at.desc()).all()
        return jsonify([t.to_dict() for t in thumbnails])
    finally:
        session.close()


@app.route('/api/thumbnails', methods=['POST'])
def create_thumbnail():
    """Cria um thumbnail."""
    data = request.json
    session = get_session()
    try:
        thumbnail = Thumbnail(
            match_id=data['match_id'],
            event_id=data['event_id'],
            event_type=data['event_type'],
            image_url=data['image_url'],
            title=data.get('title')
        )
        session.add(thumbnail)
        session.commit()
        return jsonify(thumbnail.to_dict()), 201
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


# ============================================================================
# API SETTINGS
# ============================================================================

@app.route('/api/settings', methods=['GET'])
def get_api_settings():
    """Lista configurações de API."""
    session = get_session()
    try:
        settings = session.query(ApiSetting).all()
        return jsonify([s.to_dict() for s in settings])
    finally:
        session.close()


@app.route('/api/settings', methods=['POST'])
def upsert_api_setting():
    """Cria ou atualiza uma configuração."""
    data = request.json
    session = get_session()
    try:
        setting = session.query(ApiSetting).filter_by(setting_key=data['setting_key']).first()
        if setting:
            setting.setting_value = data.get('setting_value')
            setting.is_encrypted = data.get('is_encrypted', False)
        else:
            setting = ApiSetting(
                setting_key=data['setting_key'],
                setting_value=data.get('setting_value'),
                is_encrypted=data.get('is_encrypted', False)
            )
            session.add(setting)
        
        # Update AI services keys if applicable
        if data['setting_key'] == 'OPENAI_API_KEY':
            ai_services.set_api_keys(openai_key=data.get('setting_value'))
        elif data['setting_key'] == 'LOVABLE_API_KEY':
            ai_services.set_api_keys(lovable_key=data.get('setting_value'))
        
        session.commit()
        return jsonify(setting.to_dict())
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


# ============================================================================
# AI SERVICES ENDPOINTS
# ============================================================================

@app.route('/api/analyze-match', methods=['POST'])
def analyze_match():
    """Analisa uma partida a partir de transcrição e extrai clips automaticamente."""
    data = request.json
    match_id = data.get('matchId')
    transcription = data.get('transcription')
    home_team = data.get('homeTeam', 'Time A')
    away_team = data.get('awayTeam', 'Time B')
    half_type = data.get('halfType', 'first')  # 'first' or 'second'
    game_start_minute = data.get('gameStartMinute', 0)
    game_end_minute = data.get('gameEndMinute', 45)
    auto_clip = data.get('autoClip', True)  # Corte automático de clips
    include_subtitles = data.get('includeSubtitles', True)
    
    print(f"\n{'='*60}")
    print(f"[ANALYZE-MATCH] Nova requisição de análise")
    print(f"[ANALYZE-MATCH] Match ID: {match_id}")
    print(f"[ANALYZE-MATCH] Half Type: {half_type}")
    print(f"[ANALYZE-MATCH] Game Minutes: {game_start_minute} - {game_end_minute}")
    print(f"[ANALYZE-MATCH] Auto Clip: {auto_clip}")
    print(f"[ANALYZE-MATCH] Transcription length: {len(transcription)} chars")
    print(f"{'='*60}")
    
    if not transcription:
        return jsonify({'error': 'Transcrição é obrigatória'}), 400
    
    try:
        events = ai_services.analyze_match_events(
            transcription, home_team, away_team, game_start_minute, game_end_minute
        )
        
        # Determine match_half based on halfType
        match_half = 'first_half' if half_type == 'first' else 'second_half'
        
        # SCORE VALIDATION: Calculate scores from detected goal events
        # This ensures score accuracy matches actual goals detected
        home_score = 0
        away_score = 0
        goal_events = [e for e in events if e.get('event_type') == 'goal']
        
        for goal in goal_events:
            team = goal.get('team', 'home')
            is_own_goal = goal.get('isOwnGoal', False)
            description = (goal.get('description') or '').lower()
            
            # Determine which team scored based on 'team' field and 'isOwnGoal' flag
            if is_own_goal:
                # Own goal: point goes to the OPPOSING team
                if team == 'home':
                    away_score += 1
                    print(f"[SCORE] Gol contra do {home_team} -> +1 para {away_team}")
                else:
                    home_score += 1
                    print(f"[SCORE] Gol contra do {away_team} -> +1 para {home_team}")
            else:
                # Regular goal: point goes to the scoring team
                if team == 'home':
                    home_score += 1
                    print(f"[SCORE] Gol do {home_team} -> +1 para {home_team}")
                elif team == 'away':
                    away_score += 1
                    print(f"[SCORE] Gol do {away_team} -> +1 para {away_team}")
                else:
                    # Fallback: try to infer from description
                    if home_team.lower() in description:
                        home_score += 1
                        print(f"[SCORE] Gol inferido do {home_team} via descrição")
                    elif away_team.lower() in description:
                        away_score += 1
                        print(f"[SCORE] Gol inferido do {away_team} via descrição")
                    else:
                        # Last resort: default to home
                        home_score += 1
                        print(f"[SCORE] Gol sem time identificado, atribuído ao mandante")
        
        print(f"[ANALYZE-MATCH] ═══════════════════════════════════════")
        print(f"[ANALYZE-MATCH] PLACAR VALIDADO: {home_team} {home_score} x {away_score} {away_team}")
        print(f"[ANALYZE-MATCH] Gols detectados: {len(goal_events)}")
        print(f"[ANALYZE-MATCH] ═══════════════════════════════════════")
        
        # Save events to database and collect their IDs
        session = get_session()
        saved_events = []
        try:
            for event_data in events:
                # Adjust minute based on half type
                raw_minute = event_data.get('minute', 0)
                if half_type == 'second' and raw_minute < 45:
                    raw_minute = raw_minute + 45
                
                event = MatchEvent(
                    match_id=match_id,
                    event_type=event_data.get('event_type', 'unknown'),
                    description=event_data.get('description'),
                    minute=raw_minute,
                    second=event_data.get('second', 0),
                    match_half=match_half,
                    is_highlight=event_data.get('is_highlight', False),
                    clip_pending=True,
                    metadata={
                        'ai_generated': True, 
                        'original_minute': event_data.get('minute'),
                        'team': event_data.get('team'),
                        'isOwnGoal': event_data.get('isOwnGoal', False),
                        'player': event_data.get('player'),
                        **event_data
                    }
                )
                session.add(event)
                session.flush()
                
                saved_events.append({
                    'id': event.id,
                    'minute': raw_minute,
                    'second': event_data.get('second', 0),
                    'event_type': event_data.get('event_type', 'unknown'),
                    'description': event_data.get('description', ''),
                    'team': event_data.get('team', 'home')
                })
                        
            session.commit()
            print(f"[ANALYZE-MATCH] Saved {len(events)} events with match_half={match_half}")
        finally:
            session.close()
        
        # Auto clip extraction
        clips_extracted = []
        if auto_clip and saved_events and match_id:
            print(f"[ANALYZE-MATCH] Iniciando extração automática de clips...")
            
            # Fetch videos for this match
            session = get_session()
            try:
                videos = session.query(Video).filter_by(match_id=match_id).all()
                
                if videos:
                    # Find the appropriate video for this half
                    target_video = None
                    for v in videos:
                        video_type = v.video_type or 'full'
                        if half_type == 'first' and video_type in ['first_half', 'full']:
                            target_video = v
                            break
                        elif half_type == 'second' and video_type in ['second_half', 'full']:
                            target_video = v
                            break
                        elif video_type == 'full':
                            target_video = v
                    
                    if target_video:
                        # Resolve video path
                        video_url = target_video.file_url
                        video_path = None
                        
                        # Check if local URL
                        if video_url.startswith('/api/storage/') or 'localhost' in video_url:
                            clean_url = video_url.replace('http://localhost:5000', '').replace('http://127.0.0.1:5000', '')
                            parts = clean_url.strip('/').split('/')
                            if len(parts) >= 5 and parts[0] == 'api' and parts[1] == 'storage':
                                local_match_id = parts[2]
                                subfolder = parts[3]
                                filename = '/'.join(parts[4:])
                                video_path = get_file_path(local_match_id, subfolder, filename)
                        
                        if video_path and os.path.exists(video_path):
                            print(f"[ANALYZE-MATCH] Video encontrado: {video_path}")
                            
                            # Extract clips
                            clips = extract_event_clips_auto(
                                match_id=match_id,
                                video_path=video_path,
                                events=saved_events,
                                half_type=half_type,
                                home_team=home_team,
                                away_team=away_team,
                                include_subtitles=include_subtitles
                            )
                            
                            clips_extracted = clips
                            print(f"[ANALYZE-MATCH] {len(clips)} clips extraídos")
                            
                            # Update events with clip URLs
                            if clips:
                                session2 = get_session()
                                try:
                                    for clip in clips:
                                        # Find event by minute and event_type
                                        for saved_event in saved_events:
                                            if saved_event['minute'] == clip['event_minute'] and saved_event['event_type'] == clip['event_type']:
                                                event_obj = session2.query(MatchEvent).filter_by(id=saved_event['id']).first()
                                                if event_obj:
                                                    event_obj.clip_url = clip['url']
                                                    event_obj.clip_pending = False
                                                    print(f"[ANALYZE-MATCH] Evento {saved_event['id']} atualizado com clip_url")
                                                break
                                    session2.commit()
                                finally:
                                    session2.close()
                        else:
                            print(f"[ANALYZE-MATCH] Video não encontrado localmente: {video_url}")
                    else:
                        print(f"[ANALYZE-MATCH] Nenhum vídeo encontrado para half_type={half_type}")
                else:
                    print(f"[ANALYZE-MATCH] Nenhum vídeo cadastrado para match_id={match_id}")
            finally:
                session.close()
        
        return jsonify({
            'success': True, 
            'events': events,
            'eventsDetected': len(events),
            'homeScore': home_score,
            'awayScore': away_score,
            'matchHalf': match_half,
            'clipsExtracted': len(clips_extracted),
            'clips': clips_extracted
        })
    except Exception as e:
        print(f"[ANALYZE-MATCH] ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ============================================================================
# AUTOMATIC CLIP EXTRACTION
# ============================================================================

def add_subtitles_to_clip(
    input_path: str,
    output_path: str,
    event_description: str,
    event_minute: int,
    event_type: str,
    team_name: str = None
) -> bool:
    """
    Adiciona tarja informativa com minuto, tipo e descrição usando FFmpeg drawtext.
    """
    try:
        # Escapar caracteres especiais para FFmpeg
        description_safe = event_description.replace("'", "\\'").replace(":", "\\:")
        description_safe = description_safe[:80]  # Limitar tamanho
        
        # Texto da tarja superior: "12' | GOL"
        type_label = event_type.upper().replace('_', ' ')
        header_text = f"{event_minute}' | {type_label}"
        if team_name:
            header_text += f" - {team_name}"
        
        # Filtros drawtext para tarja superior e descrição inferior
        filter_str = (
            f"drawtext=text='{header_text}':"
            f"fontsize=28:fontcolor=white:"
            f"x=(w-text_w)/2:y=30:"
            f"box=1:boxcolor=black@0.7:boxborderw=10,"
            f"drawtext=text='{description_safe}':"
            f"fontsize=20:fontcolor=white:"
            f"x=(w-text_w)/2:y=h-50:"
            f"box=1:boxcolor=black@0.7:boxborderw=8"
        )
        
        cmd = [
            'ffmpeg', '-y', '-i', input_path,
            '-vf', filter_str,
            '-c:v', 'libx264', '-c:a', 'copy',
            '-preset', 'fast', '-crf', '23',
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        
        if result.returncode == 0:
            print(f"[SUBTITLE] ✓ Legendas adicionadas: {output_path}")
            return True
        else:
            print(f"[SUBTITLE] ✗ Erro FFmpeg: {result.stderr[:200]}")
            return False
            
    except Exception as e:
        print(f"[SUBTITLE] Erro: {e}")
        return False


def extract_event_clips_auto(
    match_id: str, 
    video_path: str, 
    events: list, 
    half_type: str,
    home_team: str = None,
    away_team: str = None,
    pre_buffer: float = 3.0,
    post_buffer: float = 7.0,
    include_subtitles: bool = True
) -> list:
    """
    Extract clips for all events automatically.
    
    Args:
        match_id: Match ID
        video_path: Path to the video file
        events: List of event dicts with minute, second, event_type
        half_type: 'first' or 'second'
        home_team: Home team name for labeling
        away_team: Away team name for labeling
        pre_buffer: Seconds before the event
        post_buffer: Seconds after the event
    
    Returns:
        List of extracted clip info dicts
    """
    extracted = []
    duration = pre_buffer + post_buffer
    
    for event in events:
        try:
            minute = event.get('minute', 0)
            second = event.get('second', 0)
            event_type = event.get('event_type', 'event')
            description = event.get('description', '')
            
            # Calculate start time in video (with pre-buffer)
            total_seconds = (minute * 60) + second
            start_seconds = max(0, total_seconds - pre_buffer)
            
            # Determine team for filename
            team_short = None
            if home_team and home_team.lower() in description.lower():
                team_short = home_team[:3].upper()
            elif away_team and away_team.lower() in description.lower():
                team_short = away_team[:3].upper()
            
            # Generate clip filename
            filename = f"{minute:02d}min-{event_type}"
            if team_short:
                filename += f"-{team_short}"
            filename += ".mp4"
            
            # Get clip subfolder path
            clip_folder = get_clip_subfolder_path(match_id, half_type)
            clip_path = str(clip_folder / filename)
            
            # Extract clip using FFmpeg
            cmd = [
                'ffmpeg', '-y',
                '-ss', str(start_seconds),
                '-i', video_path,
                '-t', str(duration),
                '-c:v', 'libx264',
                '-c:a', 'aac',
                '-preset', 'fast',
                '-crf', '23',
                '-movflags', '+faststart',
                clip_path
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            
            if result.returncode == 0 and os.path.exists(clip_path):
                # Aplicar legendas se habilitado
                if include_subtitles:
                    subtitled_path = clip_path.replace('.mp4', '_sub.mp4')
                    team_name = None
                    if home_team and home_team.lower() in description.lower():
                        team_name = home_team
                    elif away_team and away_team.lower() in description.lower():
                        team_name = away_team
                    
                    if add_subtitles_to_clip(
                        clip_path, subtitled_path,
                        description, minute, event_type, team_name
                    ):
                        # Substituir original pelo legendado
                        os.replace(subtitled_path, clip_path)
                        print(f"[CLIP] ✓ Legendas aplicadas: {filename}")
                
                # Normalize half type for URL
                half_normalized = 'first_half' if half_type == 'first' else 'second_half'
                clip_url = f"http://localhost:5000/api/storage/{match_id}/clips/{half_normalized}/{filename}"
                
                extracted.append({
                    'event_minute': minute,
                    'event_type': event_type,
                    'filename': filename,
                    'path': clip_path,
                    'url': clip_url,
                    'half_type': half_normalized,
                    'description': description
                })
                print(f"[CLIP] ✓ Extracted: {filename}")
            else:
                print(f"[CLIP] ✗ Failed to extract clip for minute {minute}")
                
        except Exception as e:
            print(f"[CLIP] Error extracting clip: {e}")
            continue
    
    return extracted


@app.route('/api/process-match', methods=['POST'])
def process_match_complete():
    """
    Pipeline completo de processamento de partida.
    
    Executa automaticamente:
    1. Transcrição de cada vídeo
    2. Geração de SRT
    3. Análise IA para eventos
    4. Extração automática de clips
    5. Salvamento organizado por tempo
    
    Input JSON:
    - matchId: ID da partida
    - videos: Lista de vídeos [{url, videoType, startMinute, endMinute}]
    - homeTeam, awayTeam: Nomes dos times
    - autoClip: Se deve cortar clips automaticamente (default: True)
    - autoTactical: Se deve gerar análise tática (default: True)
    """
    data = request.json
    match_id = data.get('matchId')
    videos = data.get('videos', [])
    home_team = data.get('homeTeam', 'Time Casa')
    away_team = data.get('awayTeam', 'Time Fora')
    auto_clip = data.get('autoClip', True)
    auto_tactical = data.get('autoTactical', True)
    
    print(f"\n{'='*60}")
    print(f"[PROCESS-MATCH] Pipeline completo iniciado")
    print(f"[PROCESS-MATCH] Match ID: {match_id}")
    print(f"[PROCESS-MATCH] Videos: {len(videos)}")
    print(f"[PROCESS-MATCH] Teams: {home_team} vs {away_team}")
    print(f"[PROCESS-MATCH] Auto Clip: {auto_clip}, Auto Tactical: {auto_tactical}")
    print(f"{'='*60}")
    
    if not match_id:
        return jsonify({'error': 'matchId é obrigatório'}), 400
    
    if not videos:
        return jsonify({'error': 'Pelo menos um vídeo é obrigatório'}), 400
    
    results = {
        'matchId': match_id,
        'videos': [],
        'totalEvents': 0,
        'totalClips': 0,
        'homeScore': 0,
        'awayScore': 0,
        'errors': []
    }
    
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            for video_info in videos:
                video_url = video_info.get('url')
                video_type = video_info.get('videoType', 'full')
                start_minute = video_info.get('startMinute', 0)
                end_minute = video_info.get('endMinute', 45 if video_type == 'first_half' else 90)
                
                half_type = 'first' if start_minute < 45 else 'second'
                
                print(f"\n[PROCESS-MATCH] Processando vídeo: {video_type}")
                print(f"[PROCESS-MATCH] URL: {video_url[:50]}...")
                print(f"[PROCESS-MATCH] Minutos: {start_minute} - {end_minute}")
                
                video_result = {
                    'videoType': video_type,
                    'startMinute': start_minute,
                    'endMinute': end_minute,
                    'transcription': None,
                    'srt': None,
                    'events': [],
                    'clips': [],
                    'error': None
                }
                
                # Step 1: Download video
                video_path = os.path.join(tmpdir, f'video_{video_type}.mp4')
                
                # Check if local URL
                if video_url.startswith('/api/storage/') or 'localhost' in video_url:
                    # Resolve local path
                    clean_url = video_url.replace('http://localhost:5000', '').replace('http://127.0.0.1:5000', '')
                    parts = clean_url.strip('/').split('/')
                    if len(parts) >= 5 and parts[0] == 'api' and parts[1] == 'storage':
                        local_match_id = parts[2]
                        subfolder = parts[3]
                        filename = '/'.join(parts[4:])
                        local_path = get_file_path(local_match_id, subfolder, filename)
                        if local_path and os.path.exists(local_path):
                            import shutil
                            shutil.copy(local_path, video_path)
                            print(f"[PROCESS-MATCH] Vídeo local copiado: {local_path}")
                        else:
                            video_result['error'] = f"Arquivo local não encontrado: {local_path}"
                            results['errors'].append(video_result['error'])
                            results['videos'].append(video_result)
                            continue
                else:
                    # Download external URL
                    if not download_video(video_url, video_path):
                        video_result['error'] = "Falha ao baixar vídeo"
                        results['errors'].append(video_result['error'])
                        results['videos'].append(video_result)
                        continue
                
                # Step 2: Transcribe video
                print(f"[PROCESS-MATCH] Transcrevendo vídeo...")
                transcription_result = ai_services.transcribe_large_video(video_url, match_id)
                
                if not transcription_result.get('success'):
                    video_result['error'] = f"Falha na transcrição: {transcription_result.get('error')}"
                    results['errors'].append(video_result['error'])
                    results['videos'].append(video_result)
                    continue
                
                transcription = transcription_result.get('text', '')
                srt_content = transcription_result.get('srtContent', '')
                
                video_result['transcription'] = transcription[:500] + '...' if len(transcription) > 500 else transcription
                video_result['srt'] = srt_content[:500] + '...' if len(srt_content) > 500 else srt_content
                
                # Save SRT file
                if srt_content:
                    srt_filename = f"{video_type}.srt"
                    srt_path = get_subfolder_path(match_id, 'srt') / srt_filename
                    with open(srt_path, 'w', encoding='utf-8') as f:
                        f.write(srt_content)
                    print(f"[PROCESS-MATCH] SRT salvo: {srt_path}")
                
                # Step 3: Analyze transcription with AI
                print(f"[PROCESS-MATCH] Analisando transcrição com IA...")
                events = ai_services.analyze_match_events(
                    transcription, home_team, away_team, start_minute, end_minute
                )
                
                if not events:
                    print(f"[PROCESS-MATCH] Nenhum evento detectado")
                    video_result['events'] = []
                else:
                    print(f"[PROCESS-MATCH] {len(events)} eventos detectados")
                    
                    # Determine match_half
                    match_half = 'first_half' if half_type == 'first' else 'second_half'
                    
                    # Count goals
                    for event in events:
                        if event.get('event_type') == 'goal':
                            desc = (event.get('description') or '').lower()
                            if home_team.lower() in desc:
                                results['homeScore'] += 1
                            elif away_team.lower() in desc:
                                results['awayScore'] += 1
                            else:
                                results['homeScore'] += 1  # fallback
                    
                    # Save events to database
                    session = get_session()
                    try:
                        for event_data in events:
                            raw_minute = event_data.get('minute', 0)
                            if half_type == 'second' and raw_minute < 45:
                                raw_minute = raw_minute + 45
                            
                            event = MatchEvent(
                                match_id=match_id,
                                event_type=event_data.get('event_type', 'unknown'),
                                description=event_data.get('description'),
                                minute=raw_minute,
                                match_half=match_half,
                                is_highlight=event_data.get('is_highlight', False),
                                metadata={'ai_generated': True, 'pipeline': 'process-match', **event_data}
                            )
                            session.add(event)
                        session.commit()
                        print(f"[PROCESS-MATCH] Eventos salvos no banco")
                    finally:
                        session.close()
                    
                    video_result['events'] = events
                    results['totalEvents'] += len(events)
                    
                    # Step 4: Extract clips automatically
                    if auto_clip and events:
                        print(f"[PROCESS-MATCH] Extraindo clips automaticamente...")
                        clips = extract_event_clips_auto(
                            match_id=match_id,
                            video_path=video_path,
                            events=events,
                            half_type=half_type,
                            home_team=home_team,
                            away_team=away_team
                        )
                        video_result['clips'] = clips
                        results['totalClips'] += len(clips)
                        print(f"[PROCESS-MATCH] {len(clips)} clips extraídos")
                
                results['videos'].append(video_result)
            
            # Step 5: Generate tactical analysis (if enabled)
            if auto_tactical and results['totalEvents'] > 0:
                print(f"[PROCESS-MATCH] Gerando análise tática...")
                try:
                    all_events = []
                    for v in results['videos']:
                        all_events.extend(v.get('events', []))
                    
                    tactical = ai_services.generate_tactical_summary(
                        all_events, home_team, away_team,
                        results['homeScore'], results['awayScore']
                    )
                    
                    if tactical:
                        # Save tactical analysis to JSON
                        json_path = get_subfolder_path(match_id, 'json') / 'tactical_analysis.json'
                        with open(json_path, 'w', encoding='utf-8') as f:
                            json.dump(tactical, f, ensure_ascii=False, indent=2)
                        print(f"[PROCESS-MATCH] Análise tática salva: {json_path}")
                        results['tacticalAnalysis'] = tactical
                except Exception as e:
                    print(f"[PROCESS-MATCH] Erro na análise tática: {e}")
                    results['errors'].append(f"Tactical analysis failed: {str(e)}")
            
            # Update match status
            session = get_session()
            try:
                match = session.query(Match).filter_by(id=match_id).first()
                if match:
                    match.home_score = (match.home_score or 0) + results['homeScore']
                    match.away_score = (match.away_score or 0) + results['awayScore']
                    match.status = 'completed'
                    session.commit()
                    print(f"[PROCESS-MATCH] Match atualizado: {match.home_score} x {match.away_score}")
            finally:
                session.close()
        
        results['success'] = True
        print(f"\n[PROCESS-MATCH] Pipeline concluído com sucesso!")
        print(f"[PROCESS-MATCH] Total eventos: {results['totalEvents']}")
        print(f"[PROCESS-MATCH] Total clips: {results['totalClips']}")
        print(f"[PROCESS-MATCH] Placar: {results['homeScore']} x {results['awayScore']}")
        
        return jsonify(results)
        
    except Exception as e:
        print(f"[PROCESS-MATCH] ERRO: {str(e)}")
        import traceback
        traceback.print_exc()
        results['success'] = False
        results['error'] = str(e)
        return jsonify(results), 500


@app.route('/api/clips/<match_id>', methods=['GET'])
def list_match_clips(match_id: str):
    """
    List all clips for a match, organized by half.
    
    Returns structure:
    {
      "first_half": [...clips],
      "second_half": [...clips],
      "full": [...clips],
      "extra": [...clips]
    }
    """
    from storage import CLIP_SUBFOLDERS
    
    result = {}
    
    for half in CLIP_SUBFOLDERS:
        try:
            clip_folder = get_clip_subfolder_path(match_id, half)
            if clip_folder.exists():
                clips = []
                for file_path in clip_folder.iterdir():
                    if file_path.is_file() and file_path.suffix.lower() in ['.mp4', '.webm', '.mov']:
                        stat = file_path.stat()
                        clips.append({
                            'filename': file_path.name,
                            'url': f"/api/storage/{match_id}/clips/{half}/{file_path.name}",
                            'size': stat.st_size,
                            'modified_at': datetime.fromtimestamp(stat.st_mtime).isoformat()
                        })
                result[half] = clips
            else:
                result[half] = []
        except Exception as e:
            print(f"Error listing clips for {half}: {e}")
            result[half] = []
    
    return jsonify(result)


@app.route('/api/storage/<match_id>/clips/<half_type>/<path:filename>', methods=['GET'])
def serve_clip_file(match_id: str, half_type: str, filename: str):
    """Serve a clip file from the half-organized structure."""
    try:
        clip_folder = get_clip_subfolder_path(match_id, half_type)
        file_path = clip_folder / filename
        if not file_path.exists():
            return jsonify({'error': 'Clip não encontrado'}), 404
        return send_from_directory(clip_folder, filename)
    except Exception as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        print(f"[ANALYZE-MATCH] ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/generate-narration', methods=['POST'])
def generate_narration():
    """Gera narração para uma partida."""
    data = request.json
    match_id = data.get('matchId')
    events = data.get('events', [])
    home_team = data.get('homeTeam', 'Time A')
    away_team = data.get('awayTeam', 'Time B')
    home_score = data.get('homeScore', 0)
    away_score = data.get('awayScore', 0)
    voice = data.get('voice', 'nova')
    
    try:
        # Generate script
        script = ai_services.generate_narration_script(
            events, home_team, away_team, home_score, away_score
        )
        
        if not script:
            return jsonify({'error': 'Falha ao gerar script'}), 500
        
        # Generate audio
        audio_bytes = ai_services.text_to_speech(script, voice)
        
        if audio_bytes:
            # Save to storage
            result = save_file('generated-audio', audio_bytes, f'narration_{match_id}', 'mp3')
            audio_url = result['url']
            
            # Save to database
            session = get_session()
            try:
                audio = GeneratedAudio(
                    match_id=match_id,
                    audio_type='narration',
                    audio_url=audio_url,
                    script=script,
                    voice=voice
                )
                session.add(audio)
                session.commit()
            finally:
                session.close()
        else:
            audio_url = None
        
        return jsonify({
            'script': script,
            'audioUrl': audio_url,
            'voice': voice
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/generate-podcast', methods=['POST'])
def generate_podcast():
    """Gera podcast para uma partida."""
    data = request.json
    match_id = data.get('matchId')
    events = data.get('events', [])
    home_team = data.get('homeTeam', 'Time A')
    away_team = data.get('awayTeam', 'Time B')
    home_score = data.get('homeScore', 0)
    away_score = data.get('awayScore', 0)
    podcast_type = data.get('podcastType', 'summary')
    voice = data.get('voice', 'alloy')
    
    try:
        script = ai_services.generate_podcast_script(
            events, home_team, away_team, home_score, away_score, podcast_type
        )
        
        if not script:
            return jsonify({'error': 'Falha ao gerar script'}), 500
        
        audio_bytes = ai_services.text_to_speech(script, voice)
        
        if audio_bytes:
            result = save_file('generated-audio', audio_bytes, f'podcast_{podcast_type}_{match_id}', 'mp3')
            audio_url = result['url']
            
            session = get_session()
            try:
                audio = GeneratedAudio(
                    match_id=match_id,
                    audio_type=f'podcast_{podcast_type}',
                    audio_url=audio_url,
                    script=script,
                    voice=voice
                )
                session.add(audio)
                session.commit()
            finally:
                session.close()
        else:
            audio_url = None
        
        return jsonify({
            'script': script,
            'audioUrl': audio_url,
            'podcastType': podcast_type,
            'voice': voice
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/chatbot', methods=['POST'])
def chatbot():
    """Arena chatbot endpoint."""
    data = request.json
    message = data.get('message')
    match_context = data.get('matchContext')
    conversation_history = data.get('conversationHistory', [])
    
    if not message:
        return jsonify({'error': 'Mensagem é obrigatória'}), 400
    
    try:
        response = ai_services.chatbot_response(message, match_context, conversation_history)
        
        # Generate TTS if requested
        audio_content = None
        if data.get('withAudio'):
            audio_bytes = ai_services.text_to_speech(response, 'nova')
            if audio_bytes:
                audio_content = base64.b64encode(audio_bytes).decode('utf-8')
        
        return jsonify({
            'text': response,
            'audioContent': audio_content
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/team-chatbot', methods=['POST'])
def team_chatbot():
    """Team-specific chatbot endpoint."""
    data = request.json
    message = data.get('message')
    team_name = data.get('teamName')
    team_type = data.get('teamType')
    match_context = data.get('matchContext')
    conversation_history = data.get('conversationHistory', [])
    
    if not message or not team_name:
        return jsonify({'error': 'Mensagem e teamName são obrigatórios'}), 400
    
    try:
        response = ai_services.team_chatbot_response(
            message, team_name, team_type, match_context, conversation_history
        )
        
        audio_content = None
        if data.get('withAudio'):
            audio_bytes = ai_services.text_to_speech(response, 'echo')
            if audio_bytes:
                audio_content = base64.b64encode(audio_bytes).decode('utf-8')
        
        return jsonify({
            'text': response,
            'audioContent': audio_content
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/tts', methods=['POST'])
def text_to_speech_endpoint():
    """Text-to-speech endpoint."""
    data = request.json
    text = data.get('text')
    voice = data.get('voice', 'nova')
    
    if not text:
        return jsonify({'error': 'Texto é obrigatório'}), 400
    
    try:
        audio_bytes = ai_services.text_to_speech(text, voice)
        if audio_bytes:
            audio_content = base64.b64encode(audio_bytes).decode('utf-8')
            return jsonify({'audioContent': audio_content})
        return jsonify({'error': 'Falha ao gerar áudio'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/transcribe', methods=['POST'])
def transcribe():
    """Transcribe audio endpoint."""
    if 'file' not in request.files:
        return jsonify({'error': 'Arquivo é obrigatório'}), 400
    
    file = request.files['file']
    language = request.form.get('language', 'pt')
    
    with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as tmp:
        file.save(tmp.name)
        try:
            text = ai_services.transcribe_audio(tmp.name, language)
            return jsonify({'text': text})
        finally:
            os.unlink(tmp.name)


@app.route('/api/analyze-goal-play', methods=['POST'])
def analyze_goal_play():
    """Analyze goal play for tactical visualization."""
    data = request.json
    
    try:
        result = ai_services.analyze_goal_play(
            data.get('description', ''),
            data.get('scorer'),
            data.get('assister'),
            data.get('team')
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/transcribe-audio', methods=['POST'])
def transcribe_audio_endpoint():
    """Transcribe audio from base64 data."""
    data = request.json
    audio = data.get('audio')
    language = data.get('language', 'pt')
    
    if not audio:
        return jsonify({'error': 'Audio data é obrigatório'}), 400
    
    try:
        text = ai_services.transcribe_audio_base64(audio, language)
        return jsonify({'text': text})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/transcribe-large-video', methods=['POST'])
def transcribe_large_video_endpoint():
    """Transcribe a large video file."""
    data = request.json
    video_url = data.get('videoUrl')
    match_id = data.get('matchId')
    
    print(f"\n{'='*60}")
    print(f"[TRANSCRIBE] Nova requisição de transcrição")
    print(f"[TRANSCRIBE] Match ID: {match_id}")
    print(f"[TRANSCRIBE] Video URL: {video_url}")
    print(f"{'='*60}")
    
    if not video_url:
        print("[TRANSCRIBE] ERRO: videoUrl não fornecida")
        return jsonify({'error': 'videoUrl é obrigatório'}), 400
    
    try:
        print("[TRANSCRIBE] Iniciando transcrição via ai_services...")
        result = ai_services.transcribe_large_video(video_url, match_id)
        
        if result.get('success'):
            text_preview = result.get('text', '')[:200]
            print(f"[TRANSCRIBE] SUCESSO! Preview do texto: {text_preview}...")
            print(f"[TRANSCRIBE] Tamanho do SRT: {len(result.get('srtContent', ''))} chars")
        else:
            print(f"[TRANSCRIBE] Falha: {result.get('error')}")
        
        return jsonify(result)
    except Exception as e:
        print(f"[TRANSCRIBE] EXCEÇÃO: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/extract-live-events', methods=['POST'])
def extract_live_events_endpoint():
    """Extract live events from transcript."""
    data = request.json
    transcript = data.get('transcript', '')
    home_team = data.get('homeTeam', 'Time A')
    away_team = data.get('awayTeam', 'Time B')
    current_score = data.get('currentScore', {'home': 0, 'away': 0})
    current_minute = data.get('currentMinute', 0)
    
    if not transcript or len(transcript) < 20:
        return jsonify({'events': []})
    
    try:
        events = ai_services.extract_live_events(
            transcript, home_team, away_team, current_score, current_minute
        )
        return jsonify({'events': events})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/detect-players', methods=['POST'])
def detect_players_endpoint():
    """Detect players in a video frame."""
    data = request.json
    image_base64 = data.get('imageBase64')
    image_url = data.get('imageUrl')
    frame_timestamp = data.get('frameTimestamp', 0)
    
    if not image_base64 and not image_url:
        return jsonify({'error': 'imageBase64 ou imageUrl é obrigatório'}), 400
    
    try:
        result = ai_services.detect_players_in_frame(
            image_data=image_base64,
            image_url=image_url,
            frame_timestamp=frame_timestamp
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/generate-thumbnail', methods=['POST'])
def generate_thumbnail_endpoint():
    """Generate a thumbnail image using AI."""
    data = request.json
    prompt = data.get('prompt')
    event_id = data.get('eventId')
    match_id = data.get('matchId')
    
    if not prompt:
        return jsonify({'error': 'prompt é obrigatório'}), 400
    
    try:
        result = ai_services.generate_thumbnail_image(prompt, event_id, match_id)
        
        if result.get('error'):
            return jsonify(result), 500
        
        # If we got image data, save to storage
        if result.get('imageData') and match_id:
            image_data = result['imageData']
            
            # Extract base64 data if it's a data URL
            if image_data.startswith('data:'):
                _, base64_data = image_data.split(',', 1)
            else:
                base64_data = image_data
            
            image_bytes = base64.b64decode(base64_data)
            filename = f"thumbnail_{event_id or 'gen'}_{uuid.uuid4().hex[:8]}.png"
            
            # Save to match storage
            from storage import save_file
            file_result = save_file(match_id, 'images', image_bytes, filename)
            result['imageUrl'] = file_result['url']
            
            # Save to database
            if event_id:
                session = get_session()
                try:
                    thumbnail = Thumbnail(
                        match_id=match_id,
                        event_id=event_id,
                        event_type=data.get('eventType', 'goal'),
                        image_url=result['imageUrl'],
                        title=data.get('title')
                    )
                    session.add(thumbnail)
                    session.commit()
                    result['thumbnailId'] = thumbnail.id
                finally:
                    session.close()
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================================================
# VIDEO PROCESSING ENDPOINTS
# ============================================================================

@app.route('/extract-clip', methods=['POST'])
def extract_clip_endpoint():
    """Extrai um clip de vídeo com corte preciso."""
    data = request.json
    video_url = data.get('videoUrl')
    start_seconds = float(data.get('startSeconds', 0))
    duration = float(data.get('durationSeconds', 8))
    filename = data.get('filename', 'clip.mp4')
    include_vignettes = data.get('includeVignettes', False)
    opening_vignette = data.get('openingVignette')
    closing_vignette = data.get('closingVignette')
    
    if not video_url:
        return jsonify({'error': 'videoUrl é obrigatório'}), 400
    
    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, 'input.mp4')
        if not download_video(video_url, input_path):
            return jsonify({'error': 'Falha ao baixar o vídeo'}), 500
        
        clip_path = os.path.join(tmpdir, 'clip.mp4')
        if not extract_clip(input_path, clip_path, start_seconds, duration):
            return jsonify({'error': 'Falha ao extrair clip'}), 500
        
        final_path = clip_path
        
        if include_vignettes:
            segments = []
            
            if opening_vignette:
                opening_path = VIGNETTES_DIR / opening_vignette
                if opening_path.exists():
                    normalized_opening = os.path.join(tmpdir, 'opening_normalized.mp4')
                    if normalize_video(str(opening_path), normalized_opening):
                        segments.append(normalized_opening)
            
            normalized_clip = os.path.join(tmpdir, 'clip_normalized.mp4')
            if normalize_video(clip_path, normalized_clip):
                segments.append(normalized_clip)
            else:
                segments.append(clip_path)
            
            if closing_vignette:
                closing_path = VIGNETTES_DIR / closing_vignette
                if closing_path.exists():
                    normalized_closing = os.path.join(tmpdir, 'closing_normalized.mp4')
                    if normalize_video(str(closing_path), normalized_closing):
                        segments.append(normalized_closing)
            
            if len(segments) > 1:
                final_with_vignettes = os.path.join(tmpdir, 'final.mp4')
                if concatenate_videos(segments, final_with_vignettes, tmpdir):
                    final_path = final_with_vignettes
        
        return send_file(
            final_path,
            as_attachment=True,
            download_name=filename,
            mimetype='video/mp4'
        )


@app.route('/extract-batch', methods=['POST'])
def extract_batch_endpoint():
    """Extrai múltiplos clips de um vídeo."""
    data = request.json
    video_url = data.get('videoUrl')
    clips = data.get('clips', [])
    include_vignettes = data.get('includeVignettes', False)
    opening_vignette = data.get('openingVignette')
    closing_vignette = data.get('closingVignette')
    
    if not video_url or not clips:
        return jsonify({'error': 'videoUrl e clips são obrigatórios'}), 400
    
    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, 'input.mp4')
        if not download_video(video_url, input_path):
            return jsonify({'error': 'Falha ao baixar o vídeo'}), 500
        
        extracted_clips = []
        
        for i, clip in enumerate(clips):
            start_seconds = float(clip.get('startSeconds', 0))
            duration = float(clip.get('durationSeconds', 8))
            title = clip.get('title', f'clip_{i}')
            event_id = clip.get('eventId', str(uuid.uuid4()))
            
            clip_path = os.path.join(tmpdir, f'clip_{i}.mp4')
            
            if extract_clip(input_path, clip_path, start_seconds, duration):
                final_path = clip_path
                
                if include_vignettes:
                    segments = []
                    
                    if opening_vignette:
                        opening_path = VIGNETTES_DIR / opening_vignette
                        if opening_path.exists():
                            normalized = os.path.join(tmpdir, f'opening_{i}.mp4')
                            if normalize_video(str(opening_path), normalized):
                                segments.append(normalized)
                    
                    normalized_clip = os.path.join(tmpdir, f'clip_{i}_norm.mp4')
                    if normalize_video(clip_path, normalized_clip):
                        segments.append(normalized_clip)
                    else:
                        segments.append(clip_path)
                    
                    if closing_vignette:
                        closing_path = VIGNETTES_DIR / closing_vignette
                        if closing_path.exists():
                            normalized = os.path.join(tmpdir, f'closing_{i}.mp4')
                            if normalize_video(str(closing_path), normalized):
                                segments.append(normalized)
                    
                    if len(segments) > 1:
                        final_with_vignettes = os.path.join(tmpdir, f'final_{i}.mp4')
                        if concatenate_videos(segments, final_with_vignettes, tmpdir):
                            final_path = final_with_vignettes
                
                extracted_clips.append({
                    'eventId': event_id,
                    'title': title,
                    'path': final_path
                })
        
        if not extracted_clips:
            return jsonify({'error': 'Nenhum clip foi extraído com sucesso'}), 500
        
        zip_path = os.path.join(tmpdir, 'clips.zip')
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for i, clip in enumerate(extracted_clips):
                safe_title = "".join(c for c in clip['title'] if c.isalnum() or c in (' ', '-', '_')).strip()
                arcname = f"{i+1:02d}-{safe_title}.mp4"
                zipf.write(clip['path'], arcname)
        
        return send_file(
            zip_path,
            as_attachment=True,
            download_name='clips.zip',
            mimetype='application/zip'
        )


@app.route('/vignettes', methods=['GET'])
def list_vignettes():
    """Lista vinhetas disponíveis."""
    vignettes = []
    for f in VIGNETTES_DIR.glob('*.mp4'):
        vignettes.append({
            'name': f.name,
            'size': f.stat().st_size
        })
    return jsonify({'vignettes': vignettes})


@app.route('/vignettes/<name>', methods=['DELETE'])
def delete_vignette(name: str):
    """Remove uma vinheta."""
    vignette_path = VIGNETTES_DIR / name
    if vignette_path.exists():
        vignette_path.unlink()
        return jsonify({'success': True})
    return jsonify({'error': 'Vinheta não encontrada'}), 404


# ============================================================================
# SEARCH API
# ============================================================================

@app.route('/api/search', methods=['GET'])
def global_search():
    """Busca global em todas as entidades."""
    query = request.args.get('q', '').lower()
    if len(query) < 2:
        return jsonify([])
    
    results = []
    session = get_session()
    try:
        # Search teams
        teams = session.query(Team).filter(Team.name.ilike(f'%{query}%')).limit(5).all()
        for t in teams:
            results.append({
                'id': t.id,
                'type': 'team',
                'title': t.name,
                'subtitle': t.short_name,
                'path': f'/settings?tab=teams&team={t.id}'
            })
        
        # Search matches
        matches = session.query(Match).join(Team, Match.home_team_id == Team.id)\
            .filter(Team.name.ilike(f'%{query}%')).limit(5).all()
        for m in matches:
            results.append({
                'id': m.id,
                'type': 'match',
                'title': f'{m.home_team.name if m.home_team else "?"} vs {m.away_team.name if m.away_team else "?"}',
                'subtitle': m.competition,
                'path': f'/events?match={m.id}'
            })
        
        # Search players
        players = session.query(Player).filter(Player.name.ilike(f'%{query}%')).limit(5).all()
        for p in players:
            results.append({
                'id': p.id,
                'type': 'player',
                'title': p.name,
                'subtitle': f'#{p.number}' if p.number else p.position,
                'path': f'/settings?tab=players&player={p.id}'
            })
        
        return jsonify(results[:10])
    finally:
        session.close()


# ============================================================================
# MAIN
# ============================================================================

if __name__ == '__main__':
    print("=" * 60)
    print("Arena Play - Servidor API Local")
    print("=" * 60)
    print(f"Database: arena_play.db")
    print(f"Storage: {STORAGE_DIR}")
    print(f"Vinhetas: {VIGNETTES_DIR}")
    print("=" * 60)
    print("Endpoints principais:")
    print("  GET  /health              - Status do servidor")
    print("  GET  /api/teams           - Listar times")
    print("  GET  /api/matches         - Listar partidas")
    print("  GET  /api/matches/<id>    - Detalhes da partida")
    print("  POST /api/analyze-match   - Analisar partida")
    print("  POST /api/chatbot         - Chatbot Arena")
    print("  POST /extract-clip        - Extrair clip")
    print("  POST /extract-batch       - Extrair múltiplos clips")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=True)
