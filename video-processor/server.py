"""
Arena Play - Servidor API Local Completo
Servidor Flask com SQLite para toda a funcionalidade do Arena Play.
"""

# Carregar variáveis de ambiente do .env ANTES de qualquer acesso
from dotenv import load_dotenv
load_dotenv()

# Versão do servidor - incrementar quando funções críticas são adicionadas
SERVER_VERSION = "2.1.1"
SERVER_BUILD_DATE = "2026-01-13"

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
from typing import Optional, Dict, Any

# Supabase client for cloud sync
SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')

# Log de verificação de configuração Supabase na inicialização
print(f"[STARTUP] Arena Play Server v{SERVER_VERSION} ({SERVER_BUILD_DATE})")
print(f"[STARTUP] Supabase configurado: {bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)}")
if SUPABASE_URL and SUPABASE_SERVICE_KEY:
    print(f"[STARTUP] ✓ SUPABASE_URL: {SUPABASE_URL[:50]}...")
    print(f"[STARTUP] ✓ SUPABASE_SERVICE_KEY: {'*' * 20}... (configurado)")
else:
    if not SUPABASE_URL:
        print(f"[STARTUP] ⚠ SUPABASE_URL não configurado")
    if not SUPABASE_SERVICE_KEY:
        print(f"[STARTUP] ⚠ SUPABASE_SERVICE_KEY não configurado")
    print(f"[STARTUP] ⚠ Sincronização com Cloud desabilitada - configure as variáveis no .env")

# Import local modules
from database import init_db, get_session, Session
from models import (
    Team, Match, Player, MatchEvent, Video, AnalysisJob,
    GeneratedAudio, Thumbnail, Profile, UserRole, ApiSetting,
    ChatbotConversation, StreamConfiguration, SmartEditProject,
    SmartEditClip, SmartEditRender, SmartEditSetting,
    Organization, SubscriptionPlan, OrganizationMember, CreditTransaction
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
import re

# Global jobs trackers
download_jobs = {}  # Para jobs de download por URL
conversion_jobs = {}

app = Flask(__name__)
CORS(app)

# Initialize database
init_db()

# Run automatic migrations
from migrate_db import run_migrations
run_migrations()


def _normalize_setting_key(key: str) -> str:
    """Normalize setting keys to a canonical form for storage and lookup."""
    if not key:
        return ''
    k = key.strip()
    # Legacy uppercase keys
    legacy_map = {
        'OPENAI_API_KEY': 'openai_api_key',
        'GOOGLE_API_KEY': 'gemini_api_key',
        'GEMINI_API_KEY': 'gemini_api_key',
        'ELEVENLABS_API_KEY': 'elevenlabs_api_key',
        'LOVABLE_API_KEY': 'lovable_api_key',
        'OLLAMA_URL': 'ollama_url',
        'OLLAMA_MODEL': 'ollama_model',
        'OLLAMA_ENABLED': 'ollama_enabled',
    }
    return legacy_map.get(k, k.lower())


def _bool_from_setting(value: str, default: bool = False) -> bool:
    if value is None:
        return default
    v = str(value).strip().lower()
    if v in ('true', '1', 'yes', 'y', 'on'):
        return True
    if v in ('false', '0', 'no', 'n', 'off'):
        return False
    return default


def load_api_keys_from_db():
    """Load API keys and provider flags from database on server startup."""
    session = get_session()
    try:
        settings = session.query(ApiSetting).all()

        values = {}
        for s in settings:
            k = _normalize_setting_key(s.setting_key)
            values[k] = s.setting_value

        keys_loaded = []
        # Provider enabled flags (default True for backward compatibility)
        gemini_enabled = _bool_from_setting(values.get('gemini_enabled'), True)
        openai_enabled = _bool_from_setting(values.get('openai_enabled'), True)
        elevenlabs_enabled = _bool_from_setting(values.get('elevenlabs_enabled'), True)
        
        # Local Whisper settings (FREE transcription)
        local_whisper_enabled = _bool_from_setting(values.get('local_whisper_enabled'), False)
        local_whisper_model = values.get('local_whisper_model') or 'base'

        # Prefer DB values, fallback to environment variables if DB is missing
        openai_key = values.get('openai_api_key') or os.environ.get('OPENAI_API_KEY', '')
        gemini_key = values.get('gemini_api_key') or os.environ.get('GOOGLE_GENERATIVE_AI_API_KEY', '') or os.environ.get('GOOGLE_API_KEY', '')
        elevenlabs_key = values.get('elevenlabs_api_key') or os.environ.get('ELEVENLABS_API_KEY', '')
        lovable_key = values.get('lovable_api_key') or os.environ.get('LOVABLE_API_KEY', '')

        if openai_key:
            ai_services.set_api_keys(openai_key=openai_key)
            keys_loaded.append('OPENAI')
        if gemini_key:
            ai_services.set_api_keys(google_key=gemini_key)
            keys_loaded.append('GEMINI')
        if elevenlabs_key:
            ai_services.set_api_keys(elevenlabs_key=elevenlabs_key)
            keys_loaded.append('ELEVENLABS')
        if lovable_key:
            ai_services.set_api_keys(lovable_key=lovable_key)
            keys_loaded.append('LOVABLE')

        # Ollama optional settings
        ollama_url = values.get('ollama_url')
        ollama_model = values.get('ollama_model')
        ollama_enabled = _bool_from_setting(values.get('ollama_enabled'), False)

        if ollama_url or ollama_model or ollama_enabled:
            ai_services.set_api_keys(
                ollama_url=ollama_url,
                ollama_model=ollama_model,
                ollama_enabled=ollama_enabled
            )
            if ollama_enabled:
                keys_loaded.append(f'OLLAMA ({ollama_model or "llama3.2"})')

        # Apply provider enabled flags
        ai_services.set_api_keys(
            gemini_enabled=gemini_enabled,
            openai_enabled=openai_enabled,
            elevenlabs_enabled=elevenlabs_enabled,
            local_whisper_enabled=local_whisper_enabled,
            local_whisper_model=local_whisper_model
        )
        
        # Log Local Whisper status
        if local_whisper_enabled:
            keys_loaded.append(f'LOCAL_WHISPER ({local_whisper_model})')

        if keys_loaded:
            status_parts = []
            for k in keys_loaded:
                if k == 'ELEVENLABS':
                    status_parts.append(f"ELEVENLABS {'✓' if elevenlabs_enabled else '✗'}")
                elif k == 'GEMINI':
                    status_parts.append(f"GEMINI {'✓' if gemini_enabled else '✗'}")
                elif k == 'OPENAI':
                    status_parts.append(f"OPENAI {'✓' if openai_enabled else '✗'}")
                elif k.startswith('LOCAL_WHISPER'):
                    status_parts.append(f"🆓 {k}")
                else:
                    status_parts.append(k)
            print(f"✓ AI providers: {', '.join(status_parts)}")
        else:
            print("⚠ No AI providers configured. Configure in Settings > API.")
    except Exception as e:
        print(f"⚠ Could not load API keys from database: {e}")
    finally:
        session.close()


# Load API keys from database
load_api_keys_from_db()


# ═══════════════════════════════════════════════════════════════════════════
# SUPABASE CLOUD SYNC FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════

def get_supabase_headers() -> Dict[str, str]:
    """Get headers for Supabase API requests."""
    return {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }


def sync_match_to_supabase(match_id: str) -> Dict[str, Any]:
    """
    Sync a match and its events from local SQLite to Supabase Cloud.
    This ensures data is visible in the frontend.
    
    Args:
        match_id: The match ID to sync
    
    Returns:
        Dict with sync results
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print(f"[SUPABASE-SYNC] ⚠ Supabase not configured, skipping sync")
        return {'success': False, 'error': 'Supabase not configured'}
    
    session = get_session()
    result = {
        'success': False,
        'match_synced': False,
        'events_synced': 0,
        'videos_synced': 0,
        'errors': []
    }
    
    try:
        # Get match from local database
        match = session.query(Match).filter_by(id=match_id).first()
        if not match:
            result['error'] = f'Match {match_id} not found in local database'
            return result
        
        print(f"[SUPABASE-SYNC] Syncing match {match_id}...")
        
        # Prepare match data for Supabase
        match_data = {
            'id': match.id,
            'home_team_id': match.home_team_id,
            'away_team_id': match.away_team_id,
            'home_score': match.home_score,
            'away_score': match.away_score,
            'match_date': match.match_date.isoformat() if match.match_date else None,
            'competition': match.competition,
            'venue': match.venue,
            'status': match.status or 'analyzed',
        }
        
        # Upsert match to Supabase
        headers = get_supabase_headers()
        headers['Prefer'] = 'resolution=merge-duplicates,return=representation'
        
        response = requests.post(
            f'{SUPABASE_URL}/rest/v1/matches',
            json=match_data,
            headers=headers,
            timeout=30
        )
        
        if response.status_code in [200, 201]:
            result['match_synced'] = True
            print(f"[SUPABASE-SYNC] ✓ Match synced to Supabase")
        else:
            error_msg = f"Failed to sync match: {response.status_code} - {response.text[:200]}"
            result['errors'].append(error_msg)
            print(f"[SUPABASE-SYNC] ✗ {error_msg}")
        
        # Sync events
        events = session.query(MatchEvent).filter_by(match_id=match_id).all()
        if events:
            events_data = []
            for event in events:
                event_dict = {
                    'id': event.id,
                    'match_id': event.match_id,
                    'event_type': event.event_type,
                    'minute': event.minute,
                    'second': event.second,
                    'description': event.description,
                    'match_half': event.match_half,
                    'is_highlight': event.is_highlight,
                    'clip_url': event.clip_url,
                    'clip_pending': event.clip_pending,
                    'metadata': event.event_metadata
                }
                events_data.append(event_dict)
            
            # Upsert events to Supabase
            response = requests.post(
                f'{SUPABASE_URL}/rest/v1/match_events',
                json=events_data,
                headers=headers,
                timeout=60
            )
            
            if response.status_code in [200, 201]:
                result['events_synced'] = len(events_data)
                print(f"[SUPABASE-SYNC] ✓ {len(events_data)} events synced to Supabase")
            else:
                error_msg = f"Failed to sync events: {response.status_code} - {response.text[:200]}"
                result['errors'].append(error_msg)
                print(f"[SUPABASE-SYNC] ✗ {error_msg}")
        
        # Sync videos
        videos = session.query(Video).filter_by(match_id=match_id).all()
        if videos:
            videos_data = []
            for video in videos:
                video_dict = {
                    'id': video.id,
                    'match_id': video.match_id,
                    'file_url': video.file_url,
                    'file_name': video.file_name,
                    'video_type': video.video_type,
                    'duration_seconds': video.duration_seconds,
                    'start_minute': video.start_minute,
                    'end_minute': video.end_minute,
                    'status': video.status
                }
                videos_data.append(video_dict)
            
            response = requests.post(
                f'{SUPABASE_URL}/rest/v1/videos',
                json=videos_data,
                headers=headers,
                timeout=30
            )
            
            if response.status_code in [200, 201]:
                result['videos_synced'] = len(videos_data)
                print(f"[SUPABASE-SYNC] ✓ {len(videos_data)} videos synced to Supabase")
            else:
                error_msg = f"Failed to sync videos: {response.status_code} - {response.text[:200]}"
                result['errors'].append(error_msg)
                print(f"[SUPABASE-SYNC] ✗ {error_msg}")
        
        result['success'] = result['match_synced']
        return result
        
    except Exception as e:
        error_msg = f"Sync error: {str(e)}"
        result['errors'].append(error_msg)
        print(f"[SUPABASE-SYNC] ✗ {error_msg}")
        return result
    finally:
        session.close()


def verify_match_exists_in_supabase(match_id: str) -> bool:
    """Check if a match exists in Supabase Cloud."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return False
    
    try:
        response = requests.get(
            f'{SUPABASE_URL}/rest/v1/matches?id=eq.{match_id}&select=id',
            headers=get_supabase_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            return len(data) > 0
        return False
    except Exception as e:
        print(f"[SUPABASE-CHECK] Error checking match: {e}")
        return False


@app.route('/api/sync-to-supabase/<match_id>', methods=['POST'])
def sync_to_supabase_endpoint(match_id: str):
    """Manually sync a match to Supabase Cloud."""
    result = sync_match_to_supabase(match_id)
    if result.get('success'):
        return jsonify(result)
    else:
        return jsonify(result), 400


def ensure_teams_in_supabase(home_team_id: Optional[str], away_team_id: Optional[str], session) -> bool:
    """
    Ensure both teams exist in Supabase before creating a match.
    This prevents foreign key errors when syncing matches.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print(f"[TEAM-SYNC] ⚠ Supabase not configured")
        return False
    
    headers = get_supabase_headers()
    headers['Prefer'] = 'resolution=merge-duplicates,return=representation'
    
    synced = 0
    for team_id in [home_team_id, away_team_id]:
        if not team_id:
            continue
            
        # Get team from local DB
        team = session.query(Team).filter_by(id=team_id).first()
        if not team:
            print(f"[TEAM-SYNC] ⚠ Team {team_id} not found locally")
            continue
        
        team_data = {
            'id': team.id,
            'name': team.name,
            'short_name': team.short_name,
            'primary_color': team.primary_color,
            'secondary_color': team.secondary_color,
            'logo_url': team.logo_url
        }
        
        try:
            response = requests.post(
                f'{SUPABASE_URL}/rest/v1/teams',
                json=team_data,
                headers=headers,
                timeout=15
            )
            if response.status_code in [200, 201, 409]:  # 409 = already exists (conflict)
                synced += 1
                print(f"[TEAM-SYNC] ✓ Team '{team.name}' synced to Supabase")
            else:
                print(f"[TEAM-SYNC] ⚠ Failed to sync team '{team.name}': {response.status_code} - {response.text[:100]}")
        except Exception as e:
            print(f"[TEAM-SYNC] ⚠ Error syncing team: {e}")
    
    return synced > 0


def sync_new_match_to_supabase(match_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Sync a newly created match to Supabase Cloud immediately.
    This is a lightweight sync that only syncs the match record (no events/videos).
    
    Args:
        match_data: Dictionary with match data from to_dict()
    
    Returns:
        Dict with success status
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print(f"[SUPABASE-SYNC] ⚠ Supabase not configured")
        return {'success': False, 'error': 'Supabase not configured'}
    
    try:
        headers = get_supabase_headers()
        headers['Prefer'] = 'resolution=merge-duplicates,return=representation'
        
        # Prepare match data - only include fields that exist in Supabase schema
        supabase_match = {
            'id': match_data['id'],
            'home_team_id': match_data.get('home_team_id'),
            'away_team_id': match_data.get('away_team_id'),
            'home_score': match_data.get('home_score', 0),
            'away_score': match_data.get('away_score', 0),
            'match_date': match_data.get('match_date'),
            'competition': match_data.get('competition'),
            'venue': match_data.get('venue'),
            'status': match_data.get('status', 'pending'),
        }
        
        print(f"[SUPABASE-SYNC] Creating match in Supabase: {match_data['id']}")
        
        response = requests.post(
            f'{SUPABASE_URL}/rest/v1/matches',
            json=supabase_match,
            headers=headers,
            timeout=30
        )
        
        if response.status_code in [200, 201]:
            print(f"[SUPABASE-SYNC] ✓ Match created in Supabase")
            return {'success': True}
        elif response.status_code == 409:
            print(f"[SUPABASE-SYNC] ✓ Match already exists in Supabase")
            return {'success': True, 'already_exists': True}
        else:
            error_msg = f"Failed to create match: {response.status_code} - {response.text[:200]}"
            print(f"[SUPABASE-SYNC] ✗ {error_msg}")
            return {'success': False, 'error': error_msg}
            
    except Exception as e:
        error_msg = f"Sync error: {str(e)}"
        print(f"[SUPABASE-SYNC] ✗ {error_msg}")
        return {'success': False, 'error': error_msg}


@app.route('/api/matches/<match_id>/ensure-supabase', methods=['POST'])
def ensure_match_in_supabase(match_id: str):
    """
    Ensure a match exists in Supabase Cloud.
    Syncs teams, match, events and videos.
    """
    session = get_session()
    try:
        match = session.query(Match).filter_by(id=match_id).first()
        if not match:
            return jsonify({'error': 'Match not found locally'}), 404
        
        # Sync teams first to avoid FK errors
        teams_synced = ensure_teams_in_supabase(match.home_team_id, match.away_team_id, session)
        
        # Full sync of match with events and videos
        result = sync_match_to_supabase(match_id)
        result['teams_synced'] = teams_synced
        
        if result.get('success'):
            return jsonify(result)
        else:
            return jsonify(result), 400
    finally:
        session.close()


# Diretório para vinhetas locais
VIGNETTES_DIR = Path(__file__).parent / "vinhetas"
VIGNETTES_DIR.mkdir(exist_ok=True)


# ═══════════════════════════════════════════════════════════════════
# CONFIGURAÇÃO DE DURAÇÃO DE CLIPS POR CATEGORIA
# ═══════════════════════════════════════════════════════════════════
# Tempos em segundos: pre_buffer (antes do evento) + post_buffer (depois)
EVENT_CLIP_CONFIG = {
    # Eventos de alta importância - contexto longo
    'goal': {'pre_buffer': 20, 'post_buffer': 15},  # 35s total - jogada completa
    'penalty': {'pre_buffer': 15, 'post_buffer': 20},  # 35s - inclui cobrança
    'red_card': {'pre_buffer': 15, 'post_buffer': 10},  # 25s
    
    # Eventos de média importância - contexto médio
    'shot_on_target': {'pre_buffer': 12, 'post_buffer': 8},  # 20s
    'shot': {'pre_buffer': 10, 'post_buffer': 8},  # 18s
    'save': {'pre_buffer': 12, 'post_buffer': 8},  # 20s
    'yellow_card': {'pre_buffer': 10, 'post_buffer': 8},  # 18s
    'corner': {'pre_buffer': 8, 'post_buffer': 15},  # 23s - cruzamento + finalização
    'free_kick': {'pre_buffer': 8, 'post_buffer': 15},  # 23s
    
    # Eventos de menor duração - contexto curto
    'foul': {'pre_buffer': 8, 'post_buffer': 5},  # 13s
    'offside': {'pre_buffer': 8, 'post_buffer': 5},  # 13s
    'substitution': {'pre_buffer': 5, 'post_buffer': 5},  # 10s
    'clearance': {'pre_buffer': 6, 'post_buffer': 4},  # 10s
    'tackle': {'pre_buffer': 6, 'post_buffer': 4},  # 10s
    'interception': {'pre_buffer': 6, 'post_buffer': 4},  # 10s
    'pass': {'pre_buffer': 5, 'post_buffer': 5},  # 10s
    'cross': {'pre_buffer': 6, 'post_buffer': 6},  # 12s
    
    # Eventos táticos
    'high_press': {'pre_buffer': 10, 'post_buffer': 10},  # 20s
    'transition': {'pre_buffer': 8, 'post_buffer': 12},  # 20s
    'buildup': {'pre_buffer': 10, 'post_buffer': 10},  # 20s
    
    # Padrão para eventos não mapeados
    'default': {'pre_buffer': 15, 'post_buffer': 15}  # 30s
}


def get_event_clip_timings(event_type: str) -> tuple:
    """
    Retorna (pre_buffer, post_buffer) para o tipo de evento.
    
    Args:
        event_type: Tipo do evento (goal, shot, foul, etc.)
    
    Returns:
        Tuple com (segundos_antes, segundos_depois)
    """
    config = EVENT_CLIP_CONFIG.get(event_type, EVENT_CLIP_CONFIG['default'])
    return config['pre_buffer'], config['post_buffer']


def get_event_clip_config_all():
    """Retorna toda a configuração de tempos para o frontend."""
    return EVENT_CLIP_CONFIG


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


def split_video(input_path: str, num_parts: int, output_dir: str) -> list:
    """
    Divide um vídeo em N partes iguais.
    Usa stream copy (sem re-codificação) para velocidade máxima.
    
    Args:
        input_path: Caminho do vídeo original
        num_parts: Número de partes para dividir
        output_dir: Diretório para salvar as partes
    
    Returns:
        Lista de dicts com informações de cada parte:
        [{'path': str, 'start': float, 'end': float, 'duration': float, 'part': int}]
    """
    try:
        import json as json_lib
        
        # Get video duration
        probe_cmd = [
            'ffprobe', '-v', 'quiet', '-print_format', 'json',
            '-show_format', input_path
        ]
        probe_result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
        if probe_result.returncode != 0:
            print(f"[SPLIT] Erro ao obter duração do vídeo")
            return []
        
        probe_data = json_lib.loads(probe_result.stdout)
        total_duration = float(probe_data.get('format', {}).get('duration', 0))
        
        if total_duration <= 0:
            print(f"[SPLIT] Duração inválida: {total_duration}")
            return []
        
        part_duration = total_duration / num_parts
        parts = []
        
        print(f"[SPLIT] Dividindo vídeo de {total_duration:.1f}s em {num_parts} partes de ~{part_duration:.1f}s (stream copy)")
        
        for i in range(num_parts):
            start_time = i * part_duration
            end_time = min((i + 1) * part_duration, total_duration)
            part_filename = f"part_{i+1}_of_{num_parts}.mp4"
            part_path = os.path.join(output_dir, part_filename)
            
            # Use stream copy (MUITO mais rápido - sem re-codificação)
            # -c copy copia os streams sem processar
            # -avoid_negative_ts make_zero corrige timestamps negativos
            cmd = [
                'ffmpeg', '-y',
                '-ss', str(start_time),
                '-i', input_path,
                '-t', str(part_duration),
                '-c', 'copy',  # Stream copy - sem re-codificação!
                '-avoid_negative_ts', 'make_zero',
                '-movflags', '+faststart',
                part_path
            ]
            
            print(f"[SPLIT] Processando parte {i+1}/{num_parts}...")
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
            
            if result.returncode == 0 and os.path.exists(part_path):
                part_size = os.path.getsize(part_path)
                parts.append({
                    'path': part_path,
                    'start': start_time,
                    'end': end_time,
                    'duration': end_time - start_time,
                    'part': i + 1,
                    'total_parts': num_parts,
                    'size_mb': round(part_size / (1024 * 1024), 2)
                })
                print(f"[SPLIT] ✓ Parte {i+1}/{num_parts}: {start_time:.1f}s - {end_time:.1f}s ({parts[-1]['size_mb']}MB)")
            else:
                # Fallback: se stream copy falhar, tenta re-codificar
                print(f"[SPLIT] ⚠ Stream copy falhou para parte {i+1}, tentando re-codificação...")
                cmd_reencode = [
                    'ffmpeg', '-y',
                    '-ss', str(start_time),
                    '-i', input_path,
                    '-t', str(part_duration),
                    '-c:v', 'libx264',
                    '-c:a', 'aac',
                    '-preset', 'ultrafast',  # Preset mais rápido
                    '-crf', '23',
                    '-movflags', '+faststart',
                    part_path
                ]
                result = subprocess.run(cmd_reencode, capture_output=True, text=True, timeout=600)
                
                if result.returncode == 0 and os.path.exists(part_path):
                    part_size = os.path.getsize(part_path)
                    parts.append({
                        'path': part_path,
                        'start': start_time,
                        'end': end_time,
                        'duration': end_time - start_time,
                        'part': i + 1,
                        'total_parts': num_parts,
                        'size_mb': round(part_size / (1024 * 1024), 2)
                    })
                    print(f"[SPLIT] ✓ Parte {i+1}/{num_parts} (re-cod): {parts[-1]['size_mb']}MB")
                else:
                    print(f"[SPLIT] ✗ Falha na parte {i+1}: {result.stderr[:200] if result.stderr else 'Unknown error'}")
        
        return parts
    except Exception as e:
        print(f"[SPLIT] Erro: {e}")
        return []


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
    """Verifica status do servidor. Modo light=true para resposta rápida."""
    from database import get_database_path, get_base_dir
    
    light_mode = request.args.get('light', 'false').lower() == 'true'
    
    try:
        result = subprocess.run(['ffmpeg', '-version'], capture_output=True, text=True, timeout=5)
        ffmpeg_ok = result.returncode == 0
    except:
        ffmpeg_ok = False
    
    # Verificar funções críticas carregadas
    critical_functions = {
        '_transcribe_with_gemini': hasattr(ai_services, '_transcribe_with_gemini'),
        'transcribe_large_video': hasattr(ai_services, 'transcribe_large_video'),
        'analyze_match_events': hasattr(ai_services, 'analyze_match_events'),
    }
    
    all_functions_loaded = all(critical_functions.values())
    
    response_data = {
        'status': 'ok',
        'version': SERVER_VERSION,
        'build_date': SERVER_BUILD_DATE,
        'ffmpeg': ffmpeg_ok,
        'functions_loaded': all_functions_loaded,
        'critical_functions': critical_functions,
        'paths': {
            'base_dir': get_base_dir(),
            'database': get_database_path(),
            'storage': str(STORAGE_DIR.absolute()),
            'vignettes': str(VIGNETTES_DIR.absolute()),
            'working_dir': str(Path.cwd())
        },
        'providers': {
            'gemini': bool(ai_services.GOOGLE_API_KEY) and ai_services.GEMINI_ENABLED,
            'openai': bool(ai_services.OPENAI_API_KEY) and ai_services.OPENAI_ENABLED,
            'elevenlabs': bool(ai_services.ELEVENLABS_API_KEY) and ai_services.ELEVENLABS_ENABLED,
            'lovable': bool(ai_services.LOVABLE_API_KEY),
            'ollama': ai_services.OLLAMA_ENABLED
        }
    }
    
    # Aviso se servidor desatualizado
    if not all_functions_loaded:
        missing = [k for k, v in critical_functions.items() if not v]
        response_data['warning'] = f"Servidor desatualizado! Funções não carregadas: {', '.join(missing)}. Reinicie o servidor."
    
    # Só inclui estatísticas completas do storage se não for modo light
    if not light_mode:
        response_data['storage'] = get_storage_stats()
    
    return jsonify(response_data)


@app.route('/api/detect-ngrok', methods=['GET'])
def detect_ngrok():
    """
    Detecta automaticamente a URL do túnel ngrok ativo.
    O ngrok expõe uma API local em http://127.0.0.1:4040/api/tunnels
    quando está rodando.
    """
    try:
        # Tenta acessar a API local do ngrok
        response = requests.get('http://127.0.0.1:4040/api/tunnels', timeout=2)
        
        if response.status_code == 200:
            data = response.json()
            tunnels = data.get('tunnels', [])
            
            # Procura por túneis HTTPS (preferido) ou HTTP
            https_tunnel = None
            http_tunnel = None
            
            for tunnel in tunnels:
                public_url = tunnel.get('public_url', '')
                if public_url.startswith('https://'):
                    https_tunnel = public_url
                elif public_url.startswith('http://'):
                    http_tunnel = public_url
            
            # Prefere HTTPS sobre HTTP
            detected_url = https_tunnel or http_tunnel
            
            if detected_url:
                return jsonify({
                    'success': True,
                    'url': detected_url,
                    'tunnels': len(tunnels),
                    'message': f'Túnel ngrok detectado: {detected_url}'
                })
            else:
                return jsonify({
                    'success': False,
                    'error': 'Nenhum túnel ativo encontrado',
                    'tunnels': len(tunnels)
                })
        else:
            return jsonify({
                'success': False,
                'error': f'Ngrok API retornou status {response.status_code}'
            })
            
    except requests.exceptions.ConnectionError:
        return jsonify({
            'success': False,
            'error': 'Ngrok não está rodando. Inicie com: ngrok http 5000'
        })
    except requests.exceptions.Timeout:
        return jsonify({
            'success': False,
            'error': 'Timeout ao conectar com ngrok API'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Erro ao detectar ngrok: {str(e)}'
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
    """Upload de arquivo para subfolder da partida. Se for vídeo, cria registro automático no banco."""
    if 'file' not in request.files:
        return jsonify({'error': 'Nenhum arquivo enviado'}), 400
    
    try:
        file = request.files['file']
        filename = request.form.get('filename')
        video_type = request.form.get('video_type', 'full')
        result = save_uploaded_file(match_id, subfolder, file, filename)
        
        # SE subfolder é 'videos', criar registro automático no banco
        if subfolder == 'videos':
            session = get_session()
            try:
                # Verificar se já existe registro para este arquivo
                existing = session.query(Video).filter_by(
                    match_id=match_id, 
                    file_name=result['filename']
                ).first()
                
                if not existing:
                    # Detectar duração do vídeo
                    file_path = get_match_storage_path(match_id) / subfolder / result['filename']
                    duration_seconds = None
                    try:
                        probe = subprocess.run([
                            'ffprobe', '-v', 'quiet', '-print_format', 'json',
                            '-show_format', str(file_path)
                        ], capture_output=True, text=True, timeout=30)
                        if probe.returncode == 0:
                            probe_data = json_module.loads(probe.stdout)
                            duration_seconds = int(float(probe_data.get('format', {}).get('duration', 0)))
                    except Exception as e:
                        print(f"[upload] Aviso ao detectar duração: {e}")
                    
                    video = Video(
                        match_id=match_id,
                        file_url=result['url'],
                        file_name=result['filename'],
                        video_type=video_type,
                        duration_seconds=duration_seconds,
                        status='ready',
                        start_minute=0 if video_type in ['first_half', 'full'] else 45,
                        end_minute=45 if video_type == 'first_half' else 90
                    )
                    session.add(video)
                    session.commit()
                    result['video'] = video.to_dict()
                    print(f"[upload] Registro de vídeo criado: {result['filename']}")
                else:
                    result['video'] = existing.to_dict()
                    print(f"[upload] Vídeo já registrado: {result['filename']}")
            except Exception as e:
                session.rollback()
                print(f"[upload] Aviso: não criou registro de vídeo: {e}")
            finally:
                session.close()
        
        return jsonify(result)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/videos/sync/<match_id>', methods=['POST'])
def sync_videos_from_storage(match_id: str):
    """
    Sincroniza arquivos de vídeo existentes no storage com registros no banco.
    Útil para recuperar vídeos que foram uploadados mas não registrados.
    """
    storage_path = get_match_storage_path(match_id) / 'videos'
    
    if not storage_path.exists():
        return jsonify({'error': 'Pasta de vídeos não encontrada', 'synced': 0, 'videos': []}), 200
    
    session = get_session()
    synced = []
    
    try:
        # Listar vídeos existentes no banco
        existing = session.query(Video).filter_by(match_id=match_id).all()
        existing_files = {v.file_name for v in existing if v.file_name}
        
        # Verificar arquivos no disco
        video_extensions = {'.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'}
        
        for file_path in storage_path.iterdir():
            if file_path.is_file() and file_path.suffix.lower() in video_extensions:
                filename = file_path.name
                
                if filename not in existing_files:
                    # Detectar tipo de vídeo pelo nome
                    video_type = 'full'
                    lower_name = filename.lower()
                    if '1' in lower_name or 'first' in lower_name or 'primeiro' in lower_name:
                        video_type = 'first_half'
                    elif '2' in lower_name or 'second' in lower_name or 'segundo' in lower_name:
                        video_type = 'second_half'
                    
                    # Detectar duração
                    duration_seconds = None
                    try:
                        probe = subprocess.run([
                            'ffprobe', '-v', 'quiet', '-print_format', 'json',
                            '-show_format', str(file_path)
                        ], capture_output=True, text=True, timeout=30)
                        if probe.returncode == 0:
                            probe_data = json_module.loads(probe.stdout)
                            duration_seconds = int(float(probe_data.get('format', {}).get('duration', 0)))
                    except Exception:
                        pass
                    
                    # Criar registro
                    file_url = f"http://localhost:5000/api/storage/{match_id}/videos/{filename}"
                    video = Video(
                        match_id=match_id,
                        file_url=file_url,
                        file_name=filename,
                        video_type=video_type,
                        duration_seconds=duration_seconds,
                        status='ready',
                        start_minute=0 if video_type in ['first_half', 'full'] else 45,
                        end_minute=45 if video_type == 'first_half' else 90
                    )
                    session.add(video)
                    synced.append(video.to_dict())
                    print(f"[sync] Vídeo sincronizado: {filename} ({video_type})")
        
        session.commit()
        
        return jsonify({
            'success': True,
            'synced': len(synced),
            'videos': synced,
            'message': f'{len(synced)} vídeo(s) sincronizado(s) com o banco de dados'
        })
        
    except Exception as e:
        session.rollback()
        print(f"[sync] Erro: {e}")
        return jsonify({'error': str(e), 'synced': 0, 'videos': []}), 500
    finally:
        session.close()


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
        ], capture_output=True, text=True, timeout=10)
        
        if result.returncode == 0:
            import json
            probe_data = json.loads(result.stdout)
            duration_seconds = int(float(probe_data.get('format', {}).get('duration', 0)))
    except Exception as e:
        print(f"[link-local] Não foi possível detectar duração: {e}")
    
    # ═══════════════════════════════════════════════════════════════════════
    # AUTO-CLASSIFY VIDEO TYPE BASED ON DURATION
    # ═══════════════════════════════════════════════════════════════════════
    original_video_type = video_type
    if duration_seconds:
        duration_minutes = duration_seconds / 60
        
        if duration_minutes < 15:
            # Very short video = clip/excerpt, not a half
            if video_type in ['first_half', 'second_half', 'full']:
                print(f"[link-local] ⚠ Duração curta ({duration_minutes:.1f}min), reclassificando de '{video_type}' para 'clip'")
                video_type = 'clip'
        elif duration_minutes < 40 and video_type == 'full':
            # Medium-length video marked as full - probably just one half or segment
            print(f"[link-local] ⚠ Duração média ({duration_minutes:.1f}min) marcada como 'full' - tratando como segmento único")
            # Keep as 'full' but adjust start/end minutes below
        
        print(f"[link-local] Vídeo classificado: {video_type} ({duration_minutes:.1f}min)")
    
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
    
    # Create video record in database (or return existing)
    session = get_session()
    try:
        # Check if video already exists for this match with same filename
        existing_video = session.query(Video).filter_by(
            match_id=match_id,
            file_name=filename
        ).first()
        
        if existing_video:
            print(f"[link-local] Vídeo já registrado: {filename}")
            return jsonify({
                'success': True,
                'video': existing_video.to_dict(),
                'local_path': str(file_path.absolute()),
                'file_size': file_size,
                'file_size_mb': round(file_size / (1024 * 1024), 2),
                'duration_seconds': existing_video.duration_seconds or duration_seconds,
                'symlink_created': file_url.startswith('http'),
                'already_exists': True
            })
        
        # Calculate start/end minutes based on video type and duration
        if video_type == 'clip':
            # For clips, use actual duration
            start_minute = 0
            end_minute = max(1, int((duration_seconds or 60) / 60) + 1)
        elif video_type == 'first_half':
            start_minute = 0
            end_minute = 45
        elif video_type == 'second_half':
            start_minute = 45
            end_minute = 90
        elif video_type == 'full':
            start_minute = 0
            # For short "full" videos, use actual duration
            if duration_seconds and duration_seconds < 40 * 60:
                end_minute = max(1, int(duration_seconds / 60) + 1)
            else:
                end_minute = 90
        else:
            start_minute = 0
            end_minute = max(1, int((duration_seconds or 60) / 60) + 1) if duration_seconds else None
        
        # Create new video record
        video = Video(
            match_id=match_id,
            file_url=file_url,
            file_name=filename,
            video_type=video_type,
            duration_seconds=duration_seconds,
            status='ready',
            start_minute=start_minute,
            end_minute=end_minute
        )
        session.add(video)
        session.commit()
        
        print(f"[link-local] ✓ Novo vídeo registrado: {filename} (ID: {video.id})")
        
        return jsonify({
            'success': True,
            'video': video.to_dict(),
            'local_path': str(file_path.absolute()),
            'file_size': file_size,
            'file_size_mb': round(file_size / (1024 * 1024), 2),
            'duration_seconds': duration_seconds,
            'symlink_created': file_url.startswith('http'),
            'already_exists': False
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
    """Cria uma nova partida e sincroniza automaticamente com Supabase Cloud."""
    data = request.json
    session = get_session()
    try:
        # First ensure teams exist in Supabase (to avoid FK errors)
        home_team_id = data.get('home_team_id')
        away_team_id = data.get('away_team_id')
        
        if home_team_id or away_team_id:
            ensure_teams_in_supabase(home_team_id, away_team_id, session)
        
        # Create match locally
        match = Match(
            home_team_id=home_team_id,
            away_team_id=away_team_id,
            home_score=data.get('home_score', 0),
            away_score=data.get('away_score', 0),
            competition=data.get('competition'),
            match_date=datetime.fromisoformat(data['match_date']) if data.get('match_date') else None,
            venue=data.get('venue'),
            status=data.get('status', 'pending')
        )
        session.add(match)
        session.commit()
        
        match_dict = match.to_dict(include_teams=True)
        
        # Immediately sync to Supabase Cloud
        sync_result = sync_new_match_to_supabase(match_dict)
        match_dict['supabase_synced'] = sync_result.get('success', False)
        
        if sync_result.get('success'):
            print(f"[CREATE-MATCH] ✓ Match {match.id} created and synced to Supabase")
        else:
            print(f"[CREATE-MATCH] ⚠ Match {match.id} created but Supabase sync failed: {sync_result.get('error')}")
        
        return jsonify(match_dict), 201
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
    """Remove uma partida e todos os dados relacionados (cascade delete)."""
    session = get_session()
    try:
        match = session.query(Match).filter_by(id=match_id).first()
        if not match:
            # Even if match doesn't exist, try to clean up orphan records
            print(f"[delete_match] Match {match_id} not found, cleaning up orphan records...")
            deleted_counts = cleanup_orphan_records_for_match(session, match_id)
            storage_deleted = delete_match_storage(match_id)
            deleted_counts['storage_deleted'] = storage_deleted
            session.commit()
            
            if any(v > 0 for k, v in deleted_counts.items() if k != 'storage_deleted'):
                return jsonify({
                    'success': True,
                    'deleted': deleted_counts,
                    'message': f'Registros órfãos removidos (partida já não existia)'
                })
            return jsonify({'error': 'Partida não encontrada'}), 404
        
        deleted_counts = {}
        
        # 1. Delete match events (explicit delete to ensure cleanup)
        events_deleted = session.query(MatchEvent).filter_by(match_id=match_id).delete(synchronize_session='fetch')
        deleted_counts['events'] = events_deleted
        print(f"[delete_match] Deleted {events_deleted} events for match {match_id}")
        
        # 2. Delete videos
        videos_deleted = session.query(Video).filter_by(match_id=match_id).delete(synchronize_session='fetch')
        deleted_counts['videos'] = videos_deleted
        
        # 3. Delete generated audio
        audio_deleted = session.query(GeneratedAudio).filter_by(match_id=match_id).delete(synchronize_session='fetch')
        deleted_counts['audio'] = audio_deleted
        
        # 4. Delete thumbnails
        thumbnails_deleted = session.query(Thumbnail).filter_by(match_id=match_id).delete(synchronize_session='fetch')
        deleted_counts['thumbnails'] = thumbnails_deleted
        
        # 5. Delete analysis jobs
        jobs_deleted = session.query(AnalysisJob).filter_by(match_id=match_id).delete(synchronize_session='fetch')
        deleted_counts['analysis_jobs'] = jobs_deleted
        
        # 6. Delete chatbot conversations
        conversations_deleted = session.query(ChatbotConversation).filter_by(match_id=match_id).delete(synchronize_session='fetch')
        deleted_counts['conversations'] = conversations_deleted
        
        # 7. Delete stream configurations
        stream_configs_deleted = session.query(StreamConfiguration).filter_by(match_id=match_id).delete(synchronize_session='fetch')
        deleted_counts['stream_configs'] = stream_configs_deleted
        
        # 8. Delete transcription jobs
        try:
            transcription_jobs_deleted = session.query(TranscriptionJob).filter_by(match_id=match_id).delete(synchronize_session='fetch')
            deleted_counts['transcription_jobs'] = transcription_jobs_deleted
        except Exception as e:
            print(f"[delete_match] Error deleting transcription jobs: {e}")
            deleted_counts['transcription_jobs'] = 0
        
        # 9. Delete the match itself
        session.delete(match)
        session.commit()
        
        # 10. Delete all storage files for this match
        storage_deleted = delete_match_storage(match_id)
        deleted_counts['storage_deleted'] = storage_deleted
        
        print(f"[delete_match] ✓ Match {match_id} deleted with: {deleted_counts}")
        
        return jsonify({
            'success': True,
            'deleted': deleted_counts,
            'message': f'Partida e todos os dados relacionados foram removidos'
        })
    except Exception as e:
        session.rollback()
        print(f"[delete_match] Error deleting match {match_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


def cleanup_orphan_records_for_match(session, match_id: str) -> dict:
    """Clean up orphan records for a match that may not exist."""
    deleted_counts = {}
    
    try:
        deleted_counts['events'] = session.query(MatchEvent).filter_by(match_id=match_id).delete(synchronize_session='fetch')
        deleted_counts['videos'] = session.query(Video).filter_by(match_id=match_id).delete(synchronize_session='fetch')
        deleted_counts['audio'] = session.query(GeneratedAudio).filter_by(match_id=match_id).delete(synchronize_session='fetch')
        deleted_counts['thumbnails'] = session.query(Thumbnail).filter_by(match_id=match_id).delete(synchronize_session='fetch')
        deleted_counts['analysis_jobs'] = session.query(AnalysisJob).filter_by(match_id=match_id).delete(synchronize_session='fetch')
        deleted_counts['conversations'] = session.query(ChatbotConversation).filter_by(match_id=match_id).delete(synchronize_session='fetch')
        deleted_counts['stream_configs'] = session.query(StreamConfiguration).filter_by(match_id=match_id).delete(synchronize_session='fetch')
        
        try:
            deleted_counts['transcription_jobs'] = session.query(TranscriptionJob).filter_by(match_id=match_id).delete(synchronize_session='fetch')
        except:
            deleted_counts['transcription_jobs'] = 0
            
    except Exception as e:
        print(f"[cleanup_orphan_records] Error: {e}")
        
    return deleted_counts


@app.route('/api/maintenance/cleanup-orphans', methods=['POST'])
def cleanup_all_orphan_records():
    """Clean up all orphan records in the database (events without valid match)."""
    session = get_session()
    try:
        # Get all valid match IDs
        valid_match_ids = [m.id for m in session.query(Match.id).all()]
        print(f"[cleanup_orphans] Found {len(valid_match_ids)} valid matches")
        
        deleted_counts = {}
        
        # Delete orphan events
        if valid_match_ids:
            orphan_events = session.query(MatchEvent).filter(~MatchEvent.match_id.in_(valid_match_ids)).delete(synchronize_session='fetch')
        else:
            orphan_events = session.query(MatchEvent).delete(synchronize_session='fetch')
        deleted_counts['orphan_events'] = orphan_events
        
        # Delete orphan videos
        if valid_match_ids:
            orphan_videos = session.query(Video).filter(~Video.match_id.in_(valid_match_ids)).delete(synchronize_session='fetch')
        else:
            orphan_videos = session.query(Video).delete(synchronize_session='fetch')
        deleted_counts['orphan_videos'] = orphan_videos
        
        # Delete orphan analysis jobs
        if valid_match_ids:
            orphan_jobs = session.query(AnalysisJob).filter(~AnalysisJob.match_id.in_(valid_match_ids)).delete(synchronize_session='fetch')
        else:
            orphan_jobs = session.query(AnalysisJob).delete(synchronize_session='fetch')
        deleted_counts['orphan_analysis_jobs'] = orphan_jobs
        
        session.commit()
        
        print(f"[cleanup_orphans] ✓ Cleaned up: {deleted_counts}")
        
        return jsonify({
            'success': True,
            'deleted': deleted_counts,
            'message': 'Registros órfãos removidos com sucesso'
        })
    except Exception as e:
        session.rollback()
        print(f"[cleanup_orphans] Error: {e}")
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


@app.route('/api/matches/<match_id>/events', methods=['DELETE'])
def clear_match_events(match_id: str):
    """Remove todos os eventos de uma partida."""
    session = get_session()
    try:
        deleted_count = session.query(MatchEvent).filter_by(match_id=match_id).delete()
        session.commit()
        print(f"[CLEAR-EVENTS] ✓ {deleted_count} eventos removidos da partida {match_id}")
        return jsonify({'success': True, 'deleted_count': deleted_count})
    except Exception as e:
        session.rollback()
        print(f"[CLEAR-EVENTS] ❌ Erro: {e}")
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


@app.route('/api/videos/<video_id>', methods=['GET'])
def get_video(video_id: str):
    """Busca um vídeo específico pelo ID."""
    session = get_session()
    try:
        video = session.query(Video).filter_by(id=video_id).first()
        if not video:
            return jsonify({'error': 'Vídeo não encontrado'}), 404
        return jsonify(video.to_dict())
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
        
        # Log para diagnóstico
        if match_id:
            print(f"[THUMBNAILS] GET match_id={match_id}: {len(thumbnails)} encontradas")
            if len(thumbnails) == 0:
                # Verificar se existem eventos com clips para esta partida
                events_with_clips = session.query(MatchEvent).filter(
                    MatchEvent.match_id == match_id,
                    MatchEvent.clip_url.isnot(None)
                ).count()
                print(f"[THUMBNAILS] ⚠ Nenhuma thumbnail, mas {events_with_clips} eventos têm clips")
        else:
            print(f"[THUMBNAILS] GET all: {len(thumbnails)} encontradas")
        
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


@app.route('/api/matches/<match_id>/regenerate-thumbnails', methods=['POST'])
def regenerate_match_thumbnails(match_id):
    """
    Regenera thumbnails para todos os eventos de uma partida que têm clips.
    Útil quando thumbnails não foram geradas automaticamente.
    """
    print(f"\n[REGEN-THUMBNAILS] Iniciando para partida {match_id}")
    
    session = get_session()
    try:
        # Buscar todos os eventos com clip_url
        events = session.query(MatchEvent).filter(
            MatchEvent.match_id == match_id,
            MatchEvent.clip_url.isnot(None),
            MatchEvent.clip_url != ''
        ).all()
        
        if not events:
            return jsonify({
                'success': False,
                'message': 'Nenhum evento com clip encontrado',
                'events_count': 0
            })
        
        print(f"[REGEN-THUMBNAILS] Encontrados {len(events)} eventos com clips")
        
        generated = 0
        errors = 0
        results = []
        
        for event in events:
            try:
                clip_url = event.clip_url
                
                # Converter URL para path local
                if '/api/storage/' in clip_url:
                    relative_path = clip_url.split('/api/storage/')[-1]
                    parts = relative_path.strip('/').split('/')
                    if len(parts) >= 3:
                        local_match_id = parts[0]
                        subfolder = parts[1]
                        filename = '/'.join(parts[2:])
                        clip_path = get_file_path(local_match_id, subfolder, filename)
                        
                        if clip_path and os.path.exists(clip_path):
                            thumb_url = generate_thumbnail_from_clip(
                                clip_path=clip_path,
                                match_id=match_id,
                                event_id=event.id,
                                event_type=event.event_type,
                                minute=event.minute or 0
                            )
                            
                            if thumb_url:
                                generated += 1
                                results.append({
                                    'event_id': event.id,
                                    'event_type': event.event_type,
                                    'minute': event.minute,
                                    'thumbnail_url': thumb_url,
                                    'status': 'success'
                                })
                            else:
                                errors += 1
                                results.append({
                                    'event_id': event.id,
                                    'event_type': event.event_type,
                                    'minute': event.minute,
                                    'status': 'failed',
                                    'error': 'FFmpeg failed to extract frame'
                                })
                        else:
                            errors += 1
                            results.append({
                                'event_id': event.id,
                                'event_type': event.event_type,
                                'minute': event.minute,
                                'status': 'failed',
                                'error': f'Clip not found: {clip_path}'
                            })
                    else:
                        errors += 1
                        results.append({
                            'event_id': event.id,
                            'status': 'failed',
                            'error': 'Invalid clip URL format'
                        })
                else:
                    errors += 1
                    results.append({
                        'event_id': event.id,
                        'status': 'skipped',
                        'error': 'Non-local clip URL'
                    })
                    
            except Exception as e:
                errors += 1
                results.append({
                    'event_id': event.id,
                    'status': 'error',
                    'error': str(e)
                })
        
        print(f"[REGEN-THUMBNAILS] Concluído: {generated} geradas, {errors} erros")
        
        return jsonify({
            'success': True,
            'message': f'{generated} thumbnails geradas, {errors} erros',
            'generated': generated,
            'errors': errors,
            'total_events': len(events),
            'results': results
        })
        
    except Exception as e:
        print(f"[REGEN-THUMBNAILS] Erro: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500
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
        
        # Update AI services keys if applicable - handle all API key types
        key_lower = data['setting_key'].lower()
        value = data.get('setting_value')
        
        if key_lower in ('openai_api_key', 'openai_key'):
            ai_services.set_api_keys(openai_key=value)
            print(f"[Settings] ✓ OpenAI API key atualizada")
        elif key_lower in ('lovable_api_key', 'lovable_key'):
            ai_services.set_api_keys(lovable_key=value)
            print(f"[Settings] ✓ Lovable API key atualizada")
        elif key_lower in ('gemini_api_key', 'google_generative_ai_api_key', 'google_api_key'):
            ai_services.set_api_keys(google_key=value)
            print(f"[Settings] ✓ Gemini API key atualizada")
        elif key_lower in ('elevenlabs_api_key', 'elevenlabs_key'):
            ai_services.set_api_keys(elevenlabs_key=value)
            print(f"[Settings] ✓ ElevenLabs API key atualizada")
        elif key_lower == 'gemini_enabled':
            ai_services.set_api_keys(gemini_enabled=value == 'true')
            print(f"[Settings] ✓ Gemini enabled: {value}")
        elif key_lower == 'openai_enabled':
            ai_services.set_api_keys(openai_enabled=value == 'true')
            print(f"[Settings] ✓ OpenAI enabled: {value}")
        elif key_lower == 'elevenlabs_enabled':
            ai_services.set_api_keys(elevenlabs_enabled=value == 'true')
            print(f"[Settings] ✓ ElevenLabs enabled: {value}")
        elif key_lower == 'ollama_enabled':
            ai_services.set_api_keys(ollama_enabled=value == 'true')
            print(f"[Settings] ✓ Ollama enabled: {value}")
        elif key_lower == 'ollama_url':
            ai_services.set_api_keys(ollama_url=value)
            print(f"[Settings] ✓ Ollama URL atualizada")
        elif key_lower == 'ollama_model':
            ai_services.set_api_keys(ollama_model=value)
            print(f"[Settings] ✓ Ollama model atualizado")
        elif key_lower == 'local_whisper_enabled':
            ai_services.set_api_keys(local_whisper_enabled=value == 'true')
            print(f"[Settings] 🆓 Local Whisper enabled: {value}")
        elif key_lower == 'local_whisper_model':
            ai_services.set_api_keys(local_whisper_model=value)
            print(f"[Settings] 🆓 Local Whisper model: {value}")
        
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

@app.route('/api/ai-status', methods=['GET'])
def ai_status():
    """Retorna status dos provedores de IA configurados."""
    lovable_configured = bool(ai_services.LOVABLE_API_KEY)
    gemini_key_set = bool(ai_services.GOOGLE_API_KEY)
    gemini_enabled = ai_services.GEMINI_ENABLED
    gemini_configured = gemini_key_set and gemini_enabled
    openai_key_set = bool(ai_services.OPENAI_API_KEY)
    openai_enabled = ai_services.OPENAI_ENABLED
    openai_configured = openai_key_set and openai_enabled
    elevenlabs_key_set = bool(ai_services.ELEVENLABS_API_KEY)
    elevenlabs_enabled = ai_services.ELEVENLABS_ENABLED
    elevenlabs_configured = elevenlabs_key_set and elevenlabs_enabled
    ollama_configured = ai_services.OLLAMA_ENABLED
    
# Local Whisper (FREE transcription) - auto-detect library
    local_whisper_installed = ai_services._FASTER_WHISPER_AVAILABLE
    local_whisper_enabled = ai_services.LOCAL_WHISPER_ENABLED
    local_whisper_model = ai_services.LOCAL_WHISPER_MODEL
    
    # Try to detect GPU availability
    gpu_available = False
    try:
        import torch
        gpu_available = torch.cuda.is_available()
    except:
        pass
    
    any_analysis = lovable_configured or gemini_configured or openai_configured or ollama_configured
    # Local Whisper is the ONLY transcription method now
    any_transcription = local_whisper_enabled
    
    # Log para debug
    whisper_status = f"✓ Instalado ({local_whisper_model})" if local_whisper_installed else "✗ Não instalado"
    print(f"[AI-STATUS] 🆓 Whisper Local: {whisper_status}, GPU: {gpu_available}")
    if not local_whisper_installed:
        print(f"[AI-STATUS] ⚠ Para transcrição, instale: pip install faster-whisper==1.1.0")
    
    return jsonify({
        'lovable': lovable_configured,
        'gemini': gemini_configured,
        'openai': openai_configured,
        'elevenlabs': elevenlabs_configured,
        'ollama': ollama_configured,
        'localWhisper': local_whisper_enabled,
        'anyConfigured': any_analysis,
        'anyTranscription': any_transcription,
        'anyAnalysis': any_analysis,
        'providers': {
            'lovable': {
                'configured': lovable_configured,
                'enabled': True,
                'keySet': lovable_configured
            },
            'gemini': {
                'configured': gemini_configured,
                'enabled': gemini_enabled,
                'keySet': gemini_key_set
            },
            'openai': {
                'configured': openai_configured,
                'enabled': openai_enabled,
                'keySet': openai_key_set
            },
            'elevenlabs': {
                'configured': elevenlabs_configured,
                'enabled': elevenlabs_enabled,
                'keySet': elevenlabs_key_set
            },
            'ollama': {
                'configured': ollama_configured,
                'url': ai_services.OLLAMA_URL if ollama_configured else None,
                'model': ai_services.OLLAMA_MODEL if ollama_configured else None
            },
            'localWhisper': {
                'installed': local_whisper_installed,
                'configured': local_whisper_enabled,
                'enabled': local_whisper_enabled,
                'model': local_whisper_model if local_whisper_enabled else None,
                'gpuAvailable': gpu_available,
                'free': True,
                'installCommand': 'pip install faster-whisper==1.1.0' if not local_whisper_installed else None
            }
        },
        'message': (
            '⚠️ Instale o Whisper Local: pip install faster-whisper==1.1.0' 
            if not local_whisper_installed 
            else f"🆓 Transcrição: Whisper Local ({local_whisper_model}), GPU: {'✓' if gpu_available else 'CPU'}"
        )
    })


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
    skip_validation = data.get('skipValidation', False)  # Allow bypassing validation
    
    print(f"\n{'='*60}")
    print(f"[ANALYZE-MATCH] Nova requisição de análise")
    print(f"[ANALYZE-MATCH] Match ID: {match_id}")
    print(f"[ANALYZE-MATCH] Half Type: {half_type}")
    print(f"[ANALYZE-MATCH] Game Minutes: {game_start_minute} - {game_end_minute}")
    print(f"[ANALYZE-MATCH] Auto Clip: {auto_clip}")
    print(f"[ANALYZE-MATCH] Transcription length: {len(transcription) if transcription else 0} chars")
    print(f"{'='*60}")
    
    # ═══════════════════════════════════════════════════════════════
    # PRE-ANALYSIS VALIDATION
    # ═══════════════════════════════════════════════════════════════
    if not match_id:
        return jsonify({'error': 'Match ID é obrigatório', 'validation': 'match_id_missing'}), 400
    
    if not transcription:
        return jsonify({'error': 'Transcrição é obrigatória', 'validation': 'transcription_missing'}), 400
    
    if len(transcription) < 100:
        return jsonify({
            'error': 'Transcrição muito curta para análise', 
            'validation': 'transcription_too_short',
            'length': len(transcription)
        }), 400
    
    # Check if match exists in local database
    session_check = get_session()
    try:
        match_exists = session_check.query(Match).filter_by(id=match_id).first()
        if not match_exists:
            print(f"[ANALYZE-MATCH] ⚠ Match {match_id} não existe no banco local, criando...")
            # Auto-create match if it doesn't exist
            new_match = Match(
                id=match_id,
                status='analyzing'
            )
            session_check.add(new_match)
            session_check.commit()
            print(f"[ANALYZE-MATCH] ✓ Match {match_id} criado automaticamente")
    except Exception as check_err:
        print(f"[ANALYZE-MATCH] ⚠ Erro ao verificar match: {check_err}")
        session_check.rollback()
    finally:
        session_check.close()
    
    # Check AI providers
    ai_status = ai_services.get_ai_status()
    if not ai_status.get('anyAnalysis', False):
        return jsonify({
            'error': 'Nenhum provedor de IA configurado para análise',
            'validation': 'no_ai_provider',
            'providers': ai_status
        }), 400
    
    print(f"[ANALYZE-MATCH] ✓ Validações pré-análise OK")
    print(f"[ANALYZE-MATCH] AI Providers: {ai_status}")
    
    # ═══════════════════════════════════════════════════════════════
    # TRANSCRIPTION VALIDATION - Detect team contamination
    # ═══════════════════════════════════════════════════════════════
    if not skip_validation:
        validation = ai_services.validate_transcription_teams(transcription, home_team, away_team)
        
        if validation['hasContamination']:
            print(f"[ANALYZE-MATCH] ⚠️ CONTAMINAÇÃO DETECTADA!")
            print(f"[ANALYZE-MATCH] Times esperados: {home_team} vs {away_team}")
            print(f"[ANALYZE-MATCH] Times encontrados: {validation['detectedTeams']}")
            print(f"[ANALYZE-MATCH] Times inesperados: {validation['unexpectedTeams']}")
            return jsonify({
                'error': 'Transcrição parece ser de outra partida',
                'validation': validation,
                'message': f"Transcrição menciona {', '.join(validation['unexpectedTeams'])} mas partida é {home_team} vs {away_team}"
            }), 400
        
        if not validation['isValid']:
            print(f"[ANALYZE-MATCH] ⚠️ AVISO: Nenhum dos times encontrado na transcrição")
            print(f"[ANALYZE-MATCH] Times esperados: {home_team} vs {away_team}")
            print(f"[ANALYZE-MATCH] Times detectados: {validation['detectedTeams']}")
            # Log warning but continue - user may have confirmed
    
    try:
        events = ai_services.analyze_match_events(
            transcription, home_team, away_team, game_start_minute, game_end_minute
        )
        
        # Determine match_half based on halfType
        match_half = 'first_half' if half_type == 'first' else 'second_half'
        
        # Define segment_start_minute EARLY for video second calculation
        # This ensures the variable is available throughout the analysis
        segment_start_minute = game_start_minute if half_type == 'first' else 45
        
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
        
        # Save transcription to file for debugging
        try:
            transcription_file = f'{match_half}_transcription.txt'
            from storage import save_file
            save_file(match_id, 'texts', transcription_file, transcription.encode('utf-8'))
            print(f"[ANALYZE-MATCH] ✓ Transcrição salva: {transcription_file}")
        except Exception as e:
            print(f"[ANALYZE-MATCH] ⚠️ Erro ao salvar transcrição: {e}")
        
        # Log transcription preview for debugging
        print(f"[ANALYZE-MATCH] ═══════════════════════════════════════")
        print(f"[ANALYZE-MATCH] TRANSCRIÇÃO PREVIEW ({len(transcription)} chars):")
        print(f"[ANALYZE-MATCH] {transcription[:500]}...")
        print(f"[ANALYZE-MATCH] ═══════════════════════════════════════")
        
        # Save events to database and collect their IDs
        session = get_session()
        saved_events = []
        
        # segment_start_minute already defined above after match_half
        # IMPORTANT: Delete existing events for this half to avoid duplicates
        try:
            deleted_count = session.query(MatchEvent).filter_by(
                match_id=match_id,
                match_half=match_half
            ).delete()
            session.commit()
            if deleted_count > 0:
                print(f"[ANALYZE-MATCH] ✓ {deleted_count} eventos anteriores do {match_half} removidos")
        except Exception as del_err:
            print(f"[ANALYZE-MATCH] ⚠️ Erro ao remover eventos antigos: {del_err}")
            session.rollback()
        try:
            for event_data in events:
                # Validate and ensure 'second' exists (CRITICAL for precise clips)
                if 'second' not in event_data or event_data.get('second') is None:
                    event_data['second'] = 0
                    print(f"[ANALYZE-MATCH] ⚠ Evento sem 'second', usando 0: {event_data.get('description', '')[:30]}")
                
                # Validate second range (0-59)
                event_second = event_data.get('second', 0)
                if event_second < 0 or event_second > 59:
                    event_second = max(0, min(59, event_second))
                    event_data['second'] = event_second
                    print(f"[ANALYZE-MATCH] ⚠ 'second' fora do range, corrigido para {event_second}")
                
                # Adjust minute based on half type
                raw_minute = event_data.get('minute', 0)
                if half_type == 'second' and raw_minute < 45:
                    raw_minute = raw_minute + 45
                
                # Calculate videoSecond for precise clip extraction
                original_minute = event_data.get('minute', 0)
                # videoSecond is the position in the video file (relative to segment start)
                video_second = (original_minute - segment_start_minute) * 60 + event_second
                print(f"[ANALYZE-MATCH] ⏱️ Evento {event_data.get('event_type')}: {original_minute}:{event_second:02d} → videoSecond={video_second}")
                
                event = MatchEvent(
                    match_id=match_id,
                    event_type=event_data.get('event_type', 'unknown'),
                    description=event_data.get('description'),
                    minute=raw_minute,
                    second=event_second,
                    match_half=match_half,
                    is_highlight=event_data.get('is_highlight', False),
                    event_metadata={
                        'ai_generated': True, 
                        'original_minute': original_minute,
                        'team': event_data.get('team'),
                        'isOwnGoal': event_data.get('isOwnGoal', False),
                        'player': event_data.get('player'),
                        'videoSecond': video_second,  # Precise position in video
                        **event_data
                    }
                )
                # Set clip_pending after creation to avoid SQLAlchemy keyword arg issues
                event.clip_pending = True
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
                        
                        # Check if local URL - aceita qualquer URL que contenha /api/storage/
                        # Isso permite tunnels (cloudflare, ngrok), IPs externos, etc.
                        if '/api/storage/' in video_url or video_url.startswith('/api/storage/'):
                            # Extrair path relativo a partir de /api/storage/
                            if '/api/storage/' in video_url:
                                relative_path = video_url.split('/api/storage/')[-1]
                            else:
                                relative_path = video_url.replace('/api/storage/', '', 1)
                            
                            parts = relative_path.strip('/').split('/')
                            if len(parts) >= 3:
                                local_match_id = parts[0]
                                subfolder = parts[1]
                                filename = '/'.join(parts[2:])
                                video_path = get_file_path(local_match_id, subfolder, filename)
                                print(f"[ANALYZE-MATCH] Resolved video path: {video_path} (from URL: {video_url[:80]}...)")
                        
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
        
        # ═══════════════════════════════════════════════════════════════════
        # CRITICAL: Update match status to 'analyzed' and ACCUMULATE scores
        # ═══════════════════════════════════════════════════════════════════
        session_update = get_session()
        try:
            match = session_update.query(Match).filter_by(id=match_id).first()
            if match:
                # Store previous scores for logging
                prev_home = match.home_score or 0
                prev_away = match.away_score or 0
                
                # ACCUMULATE scores based on half type
                if half_type == 'first':
                    # First half: set initial scores
                    match.home_score = home_score
                    match.away_score = away_score
                    print(f"[ANALYZE-MATCH] 1º tempo - Placar definido: {home_score}x{away_score}")
                else:
                    # Second half: ACCUMULATE to existing scores
                    match.home_score = prev_home + home_score
                    match.away_score = prev_away + away_score
                    print(f"[ANALYZE-MATCH] 2º tempo - Placar anterior: {prev_home}x{prev_away}")
                    print(f"[ANALYZE-MATCH] 2º tempo - Gols detectados: +{home_score} home, +{away_score} away")
                    print(f"[ANALYZE-MATCH] 2º tempo - Placar acumulado: {match.home_score}x{match.away_score}")
                
                # Update status to 'analyzed' so it appears in the Events/Dashboard pages
                match.status = 'analyzed'
                session_update.commit()
                print(f"[ANALYZE-MATCH] ✓ Match status updated to 'analyzed', placar final: {match.home_score}x{match.away_score}")
        except Exception as status_err:
            print(f"[ANALYZE-MATCH] ⚠️ Error updating match status: {status_err}")
            session_update.rollback()
        finally:
            session_update.close()
        
        # ═══════════════════════════════════════════════════════════════════
        # SYNC TO SUPABASE CLOUD
        # ═══════════════════════════════════════════════════════════════════
        sync_result = sync_match_to_supabase(match_id)
        if sync_result.get('success'):
            print(f"[ANALYZE-MATCH] ✓ Synced to Supabase: {sync_result.get('events_synced')} events")
        else:
            print(f"[ANALYZE-MATCH] ⚠ Supabase sync failed: {sync_result.get('error', 'Unknown error')}")
        
        return jsonify({
            'success': True, 
            'events': events,
            'eventsDetected': len(events),
            'homeScore': home_score,
            'awayScore': away_score,
            'matchHalf': match_half,
            'clipsExtracted': len(clips_extracted),
            'clips': clips_extracted,
            'matchStatus': 'analyzed',
            'supabaseSync': sync_result.get('success', False)
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


def get_video_duration_seconds(video_path: str) -> float:
    """Get video duration in seconds using FFprobe."""
    try:
        cmd = [
            'ffprobe', '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip())
    except Exception as e:
        print(f"[CLIP] ⚠ Error getting video duration: {e}")
    return 0.0


def generate_thumbnail_from_clip(
    clip_path: str,
    match_id: str,
    event_id: str = None,
    event_type: str = 'event',
    minute: int = 0
) -> str:
    """
    Extract a frame from a clip to use as thumbnail.
    
    Args:
        clip_path: Path to the clip video file
        match_id: Match ID for storage
        event_id: Optional event ID
        event_type: Type of event for naming
        minute: Event minute for naming
    
    Returns:
        URL of the generated thumbnail or None
    """
    print(f"[THUMBNAIL] Iniciando geração - clip: {clip_path}, match: {match_id}, event_id: {event_id}, type: {event_type}, min: {minute}")
    
    try:
        if not os.path.exists(clip_path):
            print(f"[THUMBNAIL] ⚠ Clip não existe: {clip_path}")
            return None
        
        # Get clip duration
        clip_duration = get_video_duration_seconds(clip_path)
        if clip_duration <= 0:
            clip_duration = 5.0  # Default to 5 seconds
            print(f"[THUMBNAIL] Usando duração padrão: {clip_duration}s")
        else:
            print(f"[THUMBNAIL] Duração do clip: {clip_duration}s")
        
        # Extract frame at the middle of the clip (where the event likely is)
        # For a 10s clip, extract at 5s mark
        frame_time = clip_duration / 2
        
        # Generate thumbnail filename
        thumb_filename = f"thumb_{minute:02d}min-{event_type}"
        if event_id:
            thumb_filename += f"-{event_id[:8]}"
        thumb_filename += ".jpg"
        
        # Get images folder path
        images_folder = get_subfolder_path(match_id, 'images')
        thumb_path = str(images_folder / thumb_filename)
        print(f"[THUMBNAIL] Salvando em: {thumb_path}")
        
        # Extract frame using FFmpeg
        cmd = [
            'ffmpeg', '-y',
            '-ss', str(frame_time),
            '-i', clip_path,
            '-vframes', '1',
            '-q:v', '2',  # High quality JPEG
            '-vf', 'scale=640:-1',  # Resize to 640px width, maintain aspect
            thumb_path
        ]
        
        print(f"[THUMBNAIL] Executando FFmpeg: {' '.join(cmd[:6])}...")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0 and os.path.exists(thumb_path):
            thumb_size = os.path.getsize(thumb_path)
            print(f"[THUMBNAIL] Arquivo gerado: {thumb_size/1024:.1f}KB")
            
            if thumb_size > 1000:  # At least 1KB
                thumb_url = f"http://localhost:5000/api/storage/{match_id}/images/{thumb_filename}"
                
                # Save to database if event_id is provided
                if event_id:
                    try:
                        session = get_session()
                        
                        # Verificar se já existe thumbnail para este evento
                        existing = session.query(Thumbnail).filter_by(event_id=event_id).first()
                        if existing:
                            print(f"[THUMBNAIL] Atualizando thumbnail existente para evento {event_id}")
                            existing.image_url = thumb_url
                            existing.event_type = event_type
                            existing.title = f"{event_type} - {minute}'"
                        else:
                            print(f"[THUMBNAIL] Criando novo thumbnail para evento {event_id}")
                            thumbnail = Thumbnail(
                                match_id=match_id,
                                event_id=event_id,
                                event_type=event_type,
                                image_url=thumb_url,
                                title=f"{event_type} - {minute}'"
                            )
                            session.add(thumbnail)
                        
                        session.commit()
                        print(f"[THUMBNAIL] ✓ Salvo no banco: {thumb_url}")
                        session.close()
                    except Exception as db_err:
                        print(f"[THUMBNAIL] ⚠ Erro ao salvar no banco: {db_err}")
                        import traceback
                        traceback.print_exc()
                else:
                    print(f"[THUMBNAIL] ⚠ event_id não fornecido, thumbnail não salvo no banco")
                
                print(f"[THUMBNAIL] ✓ Gerada com sucesso: {thumb_url}")
                return thumb_url
            else:
                print(f"[THUMBNAIL] ⚠ Thumbnail muito pequena ({thumb_size} bytes), removendo")
                os.remove(thumb_path)
        else:
            stderr_msg = result.stderr[:300] if result.stderr else 'Unknown error'
            print(f"[THUMBNAIL] ⚠ FFmpeg falhou (code {result.returncode}): {stderr_msg}")
        
        return None
        
    except subprocess.TimeoutExpired:
        print(f"[THUMBNAIL] ⚠ Timeout ao gerar thumbnail")
        return None
    except Exception as e:
        print(f"[THUMBNAIL] Erro: {e}")
        import traceback
        traceback.print_exc()
        return None


def extract_event_clips_auto(
    match_id: str, 
    video_path: str, 
    events: list, 
    half_type: str,
    home_team: str = None,
    away_team: str = None,
    pre_buffer: float = None,  # Agora opcional - usa categoria se None
    post_buffer: float = None,  # Agora opcional - usa categoria se None
    include_subtitles: bool = True,
    segment_start_minute: int = 0,
    use_category_timings: bool = True  # Usar tempos por categoria de evento
) -> list:
    """
    Extract clips for all events automatically with category-based timing.
    
    Args:
        match_id: Match ID
        video_path: Path to the video file
        events: List of event dicts with minute, second, event_type
        half_type: 'first' or 'second'
        home_team: Home team name for labeling
        away_team: Away team name for labeling
        pre_buffer: Override seconds before event (None = use category timing)
        post_buffer: Override seconds after event (None = use category timing)
        include_subtitles: Whether to add subtitles to clips
        segment_start_minute: The match minute where this video segment starts
        use_category_timings: If True, use EVENT_CLIP_CONFIG for each event type
    
    Returns:
        List of extracted clip info dicts
    """
    extracted = []
    
    # ═══════════════════════════════════════════════════════════════
    # FILTRAR EVENTOS DUPLICADOS ANTES DE PROCESSAR
    # ═══════════════════════════════════════════════════════════════
    def filter_duplicate_events(events_list: list, min_gap_seconds: int = 30) -> list:
        """Remove eventos muito próximos para evitar clips repetidos."""
        if not events_list or len(events_list) < 2:
            return events_list
        
        # Ordenar por timestamp
        sorted_events = sorted(events_list, key=lambda e: e.get('minute', 0) * 60 + e.get('second', 0))
        
        # Prioridade por tipo de evento (maior = mais importante)
        priority = {'goal': 10, 'penalty': 9, 'red_card': 8, 'yellow_card': 7, 'save': 6, 'shot': 5, 'foul': 4}
        
        filtered = [sorted_events[0]]
        for event in sorted_events[1:]:
            last_event = filtered[-1]
            last_time = last_event.get('minute', 0) * 60 + last_event.get('second', 0)
            current_time = event.get('minute', 0) * 60 + event.get('second', 0)
            
            if current_time - last_time >= min_gap_seconds:
                filtered.append(event)
            else:
                # Se for um evento mais importante, substituir
                event_priority = priority.get(event.get('event_type'), 0)
                last_priority = priority.get(last_event.get('event_type'), 0)
                if event_priority > last_priority:
                    print(f"[CLIP] Substituindo {last_event.get('event_type')} por {event.get('event_type')} (mais relevante)")
                    filtered[-1] = event
                else:
                    print(f"[CLIP] Ignorando {event.get('event_type')} duplicado (< {min_gap_seconds}s de {last_event.get('event_type')})")
        
        if len(events_list) != len(filtered):
            print(f"[CLIP] Filtrados {len(events_list) - len(filtered)} eventos duplicados ({len(events_list)} -> {len(filtered)})")
        
        return filtered
    
    # Aplicar filtro de duplicatas
    events = filter_duplicate_events(events, min_gap_seconds=30)
    
    # Resolve symlink if video_path is a symlink
    if os.path.islink(video_path):
        resolved_path = os.path.realpath(video_path)
        print(f"[CLIP] Resolved symlink: {video_path} -> {resolved_path}")
        video_path = resolved_path
    
    # Verify video file exists
    if not os.path.exists(video_path):
        print(f"[CLIP] ⚠ Video file not found: {video_path}")
        return extracted
    
    # Get actual video duration for validation
    video_duration = get_video_duration_seconds(video_path)
    if video_duration > 0:
        print(f"[CLIP] Video duration: {video_duration:.1f}s ({video_duration/60:.1f}min), segment_start_minute: {segment_start_minute}")
    else:
        print(f"[CLIP] ⚠ Could not determine video duration, proceeding without validation")
    
    for event in events:
        try:
            minute = event.get('minute', 0)
            second = event.get('second', 0)
            event_type = event.get('event_type', 'event')
            description = event.get('description', '')
            
            # Determinar buffers: prioridade para override > categoria > padrão
            if pre_buffer is not None and post_buffer is not None:
                actual_pre = pre_buffer
                actual_post = post_buffer
            elif use_category_timings:
                actual_pre, actual_post = get_event_clip_timings(event_type)
                print(f"[CLIP] Using category timing for {event_type}: {actual_pre}s before, {actual_post}s after ({actual_pre + actual_post}s total)")
            else:
                actual_pre, actual_post = 15.0, 15.0  # Padrão 30s
            
            duration = actual_pre + actual_post
            
            # Adjust minute relative to segment start (for clips/segments)
            # If segment starts at minute 38 and event is at minute 39, video_minute = 1
            video_minute = minute - segment_start_minute
            
            # Check if event has precise videoSecond from transcription
            metadata = event.get('metadata', {}) or {}
            stored_video_second = metadata.get('videoSecond')
            
            # Calculate start time in video (with pre-buffer)
            if stored_video_second is not None and stored_video_second >= 0:
                # Use exact video position from transcription
                total_seconds = stored_video_second
                print(f"[CLIP DEBUG] Evento: {event_type} min {minute}:{second}")
                print(f"[CLIP DEBUG] Using videoSecond from metadata: {total_seconds}s")
            else:
                # Fallback: calculate based on minute/second
                total_seconds = (video_minute * 60) + second
                print(f"[CLIP DEBUG] Evento: {event_type} min {minute}:{second}")
                print(f"[CLIP DEBUG] Calculated from minute/second: video_minute={video_minute}, total_seconds={total_seconds}s")
            
            # ═══════════════════════════════════════════════════════════════
            # VALIDAÇÃO DE SANIDADE DOS TIMESTAMPS
            # ═══════════════════════════════════════════════════════════════
            if total_seconds < 0:
                print(f"[CLIP] ⚠ ERRO: total_seconds negativo ({total_seconds}), corrigindo para 0")
                total_seconds = 0
            
            if video_duration > 0 and total_seconds > video_duration:
                print(f"[CLIP] ⚠ ERRO: evento em {total_seconds}s ultrapassa vídeo de {video_duration}s, pulando")
                continue
            
            start_seconds = max(0, total_seconds - actual_pre)
            print(f"[CLIP DEBUG] start_seconds (com buffer -{actual_pre}s): {start_seconds}s, duration: {duration}s")
            
            # Validate: skip if start time is beyond video duration
            if video_duration > 0 and start_seconds >= video_duration:
                print(f"[CLIP] ⚠ Event at min {minute} (video_min {video_minute}) is beyond video duration ({video_duration/60:.1f}min), skipping")
                continue
            
            # Validate: adjust duration if it would exceed video length
            MIN_CLIP_DURATION = 10.0  # Minimum seconds for a useful clip
            actual_duration = duration
            if video_duration > 0 and (start_seconds + duration) > video_duration:
                actual_duration = video_duration - start_seconds
                if actual_duration < 2:  # Less than 2 seconds is not useful
                    print(f"[CLIP] ⚠ Event at min {minute} would result in clip < 2s, skipping")
                    continue
                print(f"[CLIP] Adjusting clip duration to {actual_duration:.1f}s (end of video)")
            
            # Ensure minimum clip duration of 10 seconds
            if actual_duration < MIN_CLIP_DURATION:
                # Try to expand backwards if we hit end of video
                if start_seconds > 0:
                    expansion = min(start_seconds, MIN_CLIP_DURATION - actual_duration)
                    start_seconds -= expansion
                    actual_duration += expansion
                    print(f"[CLIP] Expanded start by {expansion:.1f}s to reach {MIN_CLIP_DURATION}s minimum")
            
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
                '-t', str(actual_duration),
                '-c:v', 'libx264',
                '-c:a', 'aac',
                '-preset', 'fast',
                '-crf', '23',
                '-movflags', '+faststart',
                clip_path
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            
            if result.returncode == 0 and os.path.exists(clip_path):
                # ═══════════════════════════════════════════════════════════════
                # VERIFICAÇÃO DE INTEGRIDADE DO CLIP
                # ═══════════════════════════════════════════════════════════════
                file_size = os.path.getsize(clip_path)
                
                # Validar tamanho mínimo - clips < 50KB provavelmente corrompidos
                if file_size < 50000:  # 50KB minimum
                    print(f"[CLIP] ⚠ Clip muito pequeno ({file_size/1024:.1f}KB), removendo: {filename}")
                    os.remove(clip_path)
                    continue
                
                # Verificar duração real do clip gerado
                actual_clip_duration = get_video_duration_seconds(clip_path)
                if actual_clip_duration > 0:
                    expected_min = actual_duration * 0.7  # Tolerância de 30%
                    if actual_clip_duration < expected_min:
                        print(f"[CLIP] ⚠ Duração incorreta ({actual_clip_duration:.1f}s vs {actual_duration:.1f}s esperado), regenerando")
                        os.remove(clip_path)
                        continue
                    print(f"[CLIP] ✓ Duração verificada: {actual_clip_duration:.1f}s (esperado: {actual_duration:.1f}s)")
                
                # Aplicar legendas SEMPRE (garantir que todos os clips tenham legendas)
                subtitled_path = clip_path.replace('.mp4', '_sub.mp4')
                
                # Determinar team name
                team_name = None
                if home_team and (home_team.lower() in description.lower() or 
                                   any(w in description.lower() for w in home_team.lower().split()[:2])):
                    team_name = home_team
                elif away_team and (away_team.lower() in description.lower() or
                                     any(w in description.lower() for w in away_team.lower().split()[:2])):
                    team_name = away_team
                
                # Adicionar legenda com tipo do evento traduzido (fallback se não tiver descrição)
                EVENT_TYPE_LABELS = {
                    'goal': 'GOL', 'shot': 'CHUTE', 'shot_on_target': 'CHUTE NO GOL',
                    'foul': 'FALTA', 'corner': 'ESCANTEIO', 'offside': 'IMPEDIMENTO',
                    'yellow_card': 'CARTÃO AMARELO', 'red_card': 'CARTÃO VERMELHO',
                    'substitution': 'SUBSTITUIÇÃO', 'penalty': 'PÊNALTI',
                    'free_kick': 'TIRO LIVRE', 'save': 'DEFESA', 'clearance': 'CORTE',
                    'tackle': 'DESARME', 'pass': 'PASSE', 'cross': 'CRUZAMENTO',
                    'interception': 'INTERCEPTAÇÃO', 'high_press': 'PRESSÃO ALTA',
                    'transition': 'TRANSIÇÃO', 'buildup': 'CONSTRUÇÃO'
                }
                event_label = EVENT_TYPE_LABELS.get(event_type, event_type.upper())
                subtitle_text = description if description else event_label
                
                if add_subtitles_to_clip(
                    clip_path, subtitled_path,
                    subtitle_text, minute, event_type, team_name
                ):
                    # Substituir original pelo legendado
                    os.replace(subtitled_path, clip_path)
                    print(f"[CLIP] ✓ Legendas aplicadas: {filename}")
                else:
                    print(f"[CLIP] ⚠ Legendas falharam, mantendo clip original: {filename}")
                
                # Normalize half type for URL
                half_normalized = 'first_half' if half_type == 'first' else 'second_half'
                clip_url = f"http://localhost:5000/api/storage/{match_id}/clips/{half_normalized}/{filename}"
                
                clip_info = {
                    'event_id': event.get('id'),  # Include event ID for database update
                    'event_minute': minute,
                    'event_type': event_type,
                    'filename': filename,
                    'path': clip_path,
                    'url': clip_url,
                    'half_type': half_normalized,
                    'description': description
                }
                extracted.append(clip_info)
                print(f"[CLIP] ✓ Extracted: {filename} ({file_size/1024:.1f}KB)")
                
                # ═══════════════════════════════════════════════════════════
                # AUTO-GENERATE THUMBNAIL FROM CLIP
                # ═══════════════════════════════════════════════════════════
                thumbnail_url = None
                try:
                    thumbnail_url = generate_thumbnail_from_clip(
                        clip_path=clip_path,
                        match_id=match_id,
                        event_id=event.get('id'),
                        event_type=event_type,
                        minute=minute
                    )
                    if thumbnail_url:
                        clip_info['thumbnail_url'] = thumbnail_url
                        print(f"[CLIP] ✓ Thumbnail gerada: {thumbnail_url}")
                except Exception as thumb_err:
                    print(f"[CLIP] ⚠ Erro ao gerar thumbnail: {thumb_err}")
                
                # Update event clip_url in database if event_id is present
                event_id = event.get('id')
                if event_id:
                    session = get_session()
                    try:
                        db_event = session.query(MatchEvent).filter_by(id=event_id).first()
                        if db_event:
                            db_event.clip_url = clip_url
                            db_event.clip_pending = False
                            session.commit()
                            print(f"[CLIP] ✓ Updated clip_url for event {event_id}")
                    except Exception as db_err:
                        print(f"[CLIP] ⚠ Error updating event: {db_err}")
                    finally:
                        session.close()
            else:
                print(f"[CLIP] ✗ Failed to extract clip for minute {minute}: {result.stderr[:200] if result.stderr else 'Unknown error'}")
                
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
    return _process_match_pipeline(request.json, full_pipeline=False)


@app.route('/api/process-match-full', methods=['POST'])
def process_match_full_pipeline():
    """
    Pipeline COMPLETO e UNIFICADO de processamento de partida.
    
    Executa TODO o fluxo Arena Play:
    
    FASE 1 - INGESTÃO:
    ├── 1.1 Download/localização dos vídeos MP4
    ├── 1.2 Extração de áudio (FFmpeg)
    └── 1.3 Transcrição automática (ElevenLabs/Whisper/Gemini)
    
    FASE 2 - LEGENDAS:
    ├── 2.1 Geração de SRT com timestamps
    └── 2.2 Salvamento em /srt/
    
    FASE 3 - ANÁLISE IA:
    ├── 3.1 Detecção de eventos (15-30+ por tempo)
    ├── 3.2 Validação de gols
    └── 3.3 Salvamento no banco de dados
    
    FASE 4 - CLIPS:
    ├── 4.1 Extração automática de cada evento
    ├── 4.2 Aplicação de tarja + legenda (branding)
    └── 4.3 Organização em /clips/first_half/ e /clips/second_half/
    
    FASE 5 - ANÁLISE TÁTICA:
    ├── 5.1 Resumo tático completo
    ├── 5.2 Estatísticas detalhadas
    └── 5.3 Salvamento em /json/tactical_analysis.json
    
    FASE 6 - ORGANIZAÇÃO:
    ├── 6.1 Atualização do placar no banco
    ├── 6.2 Indexação de eventos por categoria
    └── 6.3 Geração de resumo da partida
    
    Input JSON:
    {
        "matchId": "uuid",
        "videos": [
            {"url": "...", "videoType": "first_half|second_half|full", "startMinute": 0, "endMinute": 45}
        ],
        "homeTeam": "Time Casa",
        "awayTeam": "Time Visitante",
        "options": {
            "autoClip": true,
            "autoTactical": true,
            "autoSrt": true,
            "includeSubtitles": true,
            "generateSummary": true,
            "categorizeEvents": true
        }
    }
    
    Returns:
    {
        "success": true,
        "matchId": "uuid",
        "phases": {
            "ingestion": {...},
            "subtitles": {...},
            "analysis": {...},
            "clips": {...},
            "tactical": {...},
            "organization": {...}
        },
        "summary": {...},
        "statistics": {...},
        "files": {...}
    }
    """
    return _process_match_pipeline(request.json, full_pipeline=True)


def _process_match_pipeline(data: dict, full_pipeline: bool = False):
    """
    Core pipeline processor for match analysis.
    
    Args:
        data: Request JSON data
        full_pipeline: If True, runs all phases including advanced analytics
    """
    match_id = data.get('matchId')
    videos = data.get('videos', [])
    home_team = data.get('homeTeam', 'Time Casa')
    away_team = data.get('awayTeam', 'Time Fora')
    
    # Options with defaults
    options = data.get('options', {})
    auto_clip = options.get('autoClip', data.get('autoClip', True))
    auto_tactical = options.get('autoTactical', data.get('autoTactical', True))
    auto_srt = options.get('autoSrt', True)
    include_subtitles = options.get('includeSubtitles', True)
    generate_summary = options.get('generateSummary', full_pipeline)
    categorize_events = options.get('categorizeEvents', full_pipeline)
    
    print(f"\n{'='*70}")
    print(f"[PIPELINE] {'FULL' if full_pipeline else 'STANDARD'} Pipeline Iniciado")
    print(f"[PIPELINE] Match ID: {match_id}")
    print(f"[PIPELINE] Videos: {len(videos)}")
    print(f"[PIPELINE] Teams: {home_team} vs {away_team}")
    print(f"[PIPELINE] Options: clip={auto_clip}, tactical={auto_tactical}, srt={auto_srt}")
    print(f"{'='*70}")
    
    if not match_id:
        return jsonify({'error': 'matchId é obrigatório'}), 400
    
    if not videos:
        return jsonify({'error': 'Pelo menos um vídeo é obrigatório'}), 400
    
    # Initialize result structure
    results = {
        'success': False,
        'matchId': match_id,
        'phases': {
            'ingestion': {'status': 'pending', 'videos': []},
            'subtitles': {'status': 'pending', 'files': []},
            'analysis': {'status': 'pending', 'events': [], 'eventsCount': 0},
            'clips': {'status': 'pending', 'clips': [], 'clipsCount': 0},
            'tactical': {'status': 'pending', 'analysis': None},
            'organization': {'status': 'pending', 'files': {}}
        },
        'summary': {},
        'statistics': {
            'totalEvents': 0,
            'totalClips': 0,
            'homeScore': 0,
            'awayScore': 0,
            'eventsByType': {},
            'eventsByHalf': {'first_half': 0, 'second_half': 0}
        },
        'files': {
            'videos': [],
            'clips': [],
            'srt': [],
            'texts': [],
            'json': [],
            'audio': []
        },
        'errors': [],
        'warnings': []
    }
    
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            all_events = []
            all_clips = []
            
            # ════════════════════════════════════════════════════════════════
            # FASE 1: INGESTÃO - Download e preparação dos vídeos
            # ════════════════════════════════════════════════════════════════
            print(f"\n[PIPELINE] ═══ FASE 1: INGESTÃO ═══")
            results['phases']['ingestion']['status'] = 'processing'
            
            for idx, video_info in enumerate(videos):
                video_url = video_info.get('url')
                video_type = video_info.get('videoType', 'full')
                start_minute = video_info.get('startMinute', 0)
                end_minute = video_info.get('endMinute', 45 if video_type == 'first_half' else 90)
                
                half_type = 'first' if start_minute < 45 else 'second'
                match_half = 'first_half' if half_type == 'first' else 'second_half'
                
                print(f"\n[PIPELINE] Processando vídeo {idx+1}/{len(videos)}: {video_type}")
                print(f"[PIPELINE] URL: {video_url[:60]}..." if len(video_url) > 60 else f"[PIPELINE] URL: {video_url}")
                print(f"[PIPELINE] Minutos: {start_minute}' - {end_minute}'")
                
                video_result = {
                    'videoType': video_type,
                    'halfType': half_type,
                    'matchHalf': match_half,
                    'startMinute': start_minute,
                    'endMinute': end_minute,
                    'transcription': None,
                    'srt': None,
                    'events': [],
                    'clips': [],
                    'status': 'processing'
                }
                
                # Download/locate video
                video_path = os.path.join(tmpdir, f'video_{video_type}_{idx}.mp4')
                local_video_path = None
                
                if video_url.startswith('/api/storage/') or 'localhost' in video_url:
                    # Resolve local path
                    clean_url = video_url.replace('http://localhost:5000', '').replace('http://127.0.0.1:5000', '')
                    parts = clean_url.strip('/').split('/')
                    if len(parts) >= 5 and parts[0] == 'api' and parts[1] == 'storage':
                        local_match_id = parts[2]
                        subfolder = parts[3]
                        filename = '/'.join(parts[4:])
                        local_path = get_file_path(local_match_id, subfolder, filename)
                        
                        # Resolve symlinks
                        if local_path and os.path.islink(str(local_path)):
                            local_path = Path(os.path.realpath(str(local_path)))
                        
                        if local_path and os.path.exists(local_path):
                            import shutil
                            shutil.copy(local_path, video_path)
                            local_video_path = str(local_path)
                            print(f"[PIPELINE] ✓ Vídeo local copiado: {local_path}")
                        else:
                            video_result['status'] = 'error'
                            video_result['error'] = f"Arquivo local não encontrado: {local_path}"
                            results['errors'].append(video_result['error'])
                            results['phases']['ingestion']['videos'].append(video_result)
                            continue
                else:
                    # Download external URL
                    print(f"[PIPELINE] Baixando vídeo externo...")
                    if not download_video(video_url, video_path):
                        video_result['status'] = 'error'
                        video_result['error'] = "Falha ao baixar vídeo"
                        results['errors'].append(video_result['error'])
                        results['phases']['ingestion']['videos'].append(video_result)
                        continue
                
                video_result['localPath'] = local_video_path or video_path
                results['phases']['ingestion']['videos'].append(video_result)
                
                # ════════════════════════════════════════════════════════════
                # FASE 2: TRANSCRIÇÃO E SRT
                # ════════════════════════════════════════════════════════════
                print(f"\n[PIPELINE] ═══ FASE 2: TRANSCRIÇÃO ({video_type}) ═══")
                results['phases']['subtitles']['status'] = 'processing'
                
                # Determine half_type from video_type
                pipeline_half_type = 'first' if video_type == 'first_half' else ('second' if video_type == 'second_half' else None)
                transcription_result = ai_services.transcribe_large_video(video_url, match_id, half_type=pipeline_half_type)
                
                if not transcription_result.get('success'):
                    error_msg = f"Falha na transcrição: {transcription_result.get('error')}"
                    video_result['error'] = error_msg
                    results['warnings'].append(error_msg)
                    print(f"[PIPELINE] ⚠ {error_msg}")
                    continue
                
                transcription = transcription_result.get('text', '')
                srt_content = transcription_result.get('srtContent', '')
                provider = transcription_result.get('provider', 'unknown')
                
                print(f"[PIPELINE] ✓ Transcrição: {len(transcription)} chars (provider: {provider})")
                
                video_result['transcription'] = transcription
                video_result['transcriptionLength'] = len(transcription)
                video_result['provider'] = provider
                
                # Save SRT file
                if auto_srt and srt_content:
                    srt_filename = f"{video_type}.srt"
                    srt_path = get_subfolder_path(match_id, 'srt') / srt_filename
                    with open(srt_path, 'w', encoding='utf-8') as f:
                        f.write(srt_content)
                    print(f"[PIPELINE] ✓ SRT salvo: {srt_filename}")
                    results['files']['srt'].append(srt_filename)
                    results['phases']['subtitles']['files'].append({
                        'filename': srt_filename,
                        'path': str(srt_path),
                        'url': f"/api/storage/{match_id}/srt/{srt_filename}"
                    })
                
                # Save transcription text
                txt_filename = f"{video_type}_transcription.txt"
                txt_path = get_subfolder_path(match_id, 'texts') / txt_filename
                with open(txt_path, 'w', encoding='utf-8') as f:
                    f.write(transcription)
                print(f"[PIPELINE] ✓ TXT salvo: {txt_filename}")
                results['files']['texts'].append(txt_filename)
                
                # ════════════════════════════════════════════════════════════
                # FASE 3: ANÁLISE IA - DETECÇÃO DE EVENTOS
                # ════════════════════════════════════════════════════════════
                print(f"\n[PIPELINE] ═══ FASE 3: ANÁLISE IA ({video_type}) ═══")
                results['phases']['analysis']['status'] = 'processing'
                
                # Delete existing events for this half to avoid duplicates
                session = get_session()
                try:
                    deleted = session.query(MatchEvent).filter_by(
                        match_id=match_id,
                        match_half=match_half
                    ).delete()
                    session.commit()
                    if deleted > 0:
                        print(f"[PIPELINE] ✓ {deleted} eventos anteriores removidos")
                except Exception as e:
                    session.rollback()
                    print(f"[PIPELINE] ⚠ Erro ao limpar eventos: {e}")
                finally:
                    session.close()
                
                # Analyze transcription
                events = ai_services.analyze_match_events(
                    transcription, home_team, away_team, start_minute, end_minute
                )
                
                if not events:
                    results['warnings'].append(f"Nenhum evento detectado para {video_type}")
                    print(f"[PIPELINE] ⚠ Nenhum evento detectado")
                else:
                    print(f"[PIPELINE] ✓ {len(events)} eventos detectados")
                    
                    # Validate goal detection
                    validation = ai_services.validate_goal_detection(transcription, events)
                    if validation.get('warning'):
                        results['warnings'].append(validation['warning'])
                    
                    # Calculate scores from goals
                    for event in events:
                        if event.get('event_type') == 'goal':
                            team = event.get('team', 'home')
                            is_own_goal = event.get('isOwnGoal', False)
                            
                            if is_own_goal:
                                if team == 'home':
                                    results['statistics']['awayScore'] += 1
                                else:
                                    results['statistics']['homeScore'] += 1
                            else:
                                if team == 'home':
                                    results['statistics']['homeScore'] += 1
                                else:
                                    results['statistics']['awayScore'] += 1
                        
                        # Count by type
                        event_type = event.get('event_type', 'unknown')
                        results['statistics']['eventsByType'][event_type] = \
                            results['statistics']['eventsByType'].get(event_type, 0) + 1
                    
                    # Save events to database
                    saved_events = []
                    session = get_session()
                    try:
                        for event_data in events:
                            raw_minute = event_data.get('minute', 0)
                            
                            # Adjust minute for second half
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
                                event_metadata={
                                    'ai_generated': True,
                                    'pipeline': 'full' if full_pipeline else 'standard',
                                    'original_minute': event_data.get('minute'),
                                    'team': event_data.get('team'),
                                    'isOwnGoal': event_data.get('isOwnGoal', False),
                                    'player': event_data.get('player'),
                                    **event_data
                                }
                            )
                            event.clip_pending = True
                            session.add(event)
                            session.flush()
                            
                            # Calcular videoSecond preciso para extração de clips
                            start_minute = 0 if half_type == 'first' else 45
                            video_second = (raw_minute - start_minute) * 60 + event_data.get('second', 0)
                            
                            saved_event = {
                                'id': event.id,
                                'minute': raw_minute,
                                'second': event_data.get('second', 0),
                                'event_type': event_data.get('event_type'),
                                'description': event_data.get('description', ''),
                                'team': event_data.get('team', 'home'),
                                'is_highlight': event_data.get('is_highlight', False),
                                'metadata': {
                                    'videoSecond': video_second,
                                    'eventMs': video_second * 1000,
                                    'half': match_half
                                }
                            }
                            saved_events.append(saved_event)
                        
                        session.commit()
                        print(f"[PIPELINE] ✓ {len(saved_events)} eventos salvos no banco")
                    finally:
                        session.close()
                    
                    video_result['events'] = saved_events
                    all_events.extend(saved_events)
                    results['statistics']['totalEvents'] += len(saved_events)
                    results['statistics']['eventsByHalf'][match_half] += len(saved_events)
                    
                    # ════════════════════════════════════════════════════════
                    # FASE 4: EXTRAÇÃO DE CLIPS
                    # ════════════════════════════════════════════════════════
                    if auto_clip and saved_events:
                        print(f"\n[PIPELINE] ═══ FASE 4: CLIPS ({video_type}) ═══")
                        results['phases']['clips']['status'] = 'processing'
                        
                        # Use local video path for clip extraction
                        clip_video_path = local_video_path or video_path
                        
                        if os.path.exists(clip_video_path):
                            clips = extract_event_clips_auto(
                                match_id=match_id,
                                video_path=clip_video_path,
                                events=saved_events,
                                half_type=half_type,
                                home_team=home_team,
                                away_team=away_team,
                                include_subtitles=include_subtitles
                            )
                            
                            video_result['clips'] = clips
                            all_clips.extend(clips)
                            results['statistics']['totalClips'] += len(clips)
                            results['files']['clips'].extend([c['filename'] for c in clips])
                            
                            print(f"[PIPELINE] ✓ {len(clips)} clips extraídos")
                        else:
                            results['warnings'].append(f"Vídeo não encontrado para clips: {clip_video_path}")
                
                video_result['status'] = 'completed'
            
            # Update ingestion status
            results['phases']['ingestion']['status'] = 'completed'
            results['phases']['subtitles']['status'] = 'completed'
            results['phases']['analysis']['status'] = 'completed'
            results['phases']['analysis']['events'] = all_events
            results['phases']['analysis']['eventsCount'] = len(all_events)
            results['phases']['clips']['status'] = 'completed'
            results['phases']['clips']['clips'] = all_clips
            results['phases']['clips']['clipsCount'] = len(all_clips)
            
            # ════════════════════════════════════════════════════════════════
            # FASE 5: ANÁLISE TÁTICA
            # ════════════════════════════════════════════════════════════════
            if auto_tactical and all_events:
                print(f"\n[PIPELINE] ═══ FASE 5: ANÁLISE TÁTICA ═══")
                results['phases']['tactical']['status'] = 'processing'
                
                try:
                    tactical = ai_services.generate_tactical_summary(
                        all_events, home_team, away_team,
                        results['statistics']['homeScore'],
                        results['statistics']['awayScore']
                    )
                    
                    if tactical:
                        # Save tactical analysis to JSON
                        json_filename = 'tactical_analysis.json'
                        json_path = get_subfolder_path(match_id, 'json') / json_filename
                        with open(json_path, 'w', encoding='utf-8') as f:
                            json_module.dump(tactical, f, ensure_ascii=False, indent=2)
                        
                        results['phases']['tactical']['analysis'] = tactical
                        results['phases']['tactical']['status'] = 'completed'
                        results['files']['json'].append(json_filename)
                        print(f"[PIPELINE] ✓ Análise tática salva")
                        
                except Exception as e:
                    results['phases']['tactical']['status'] = 'error'
                    results['phases']['tactical']['error'] = str(e)
                    results['errors'].append(f"Análise tática falhou: {e}")
                    print(f"[PIPELINE] ⚠ Erro na análise tática: {e}")
            
            # ════════════════════════════════════════════════════════════════
            # FASE 6: ORGANIZAÇÃO FINAL
            # ════════════════════════════════════════════════════════════════
            print(f"\n[PIPELINE] ═══ FASE 6: ORGANIZAÇÃO ═══")
            results['phases']['organization']['status'] = 'processing'
            
            # Update match record
            session = get_session()
            try:
                match = session.query(Match).filter_by(id=match_id).first()
                if match:
                    match.home_score = results['statistics']['homeScore']
                    match.away_score = results['statistics']['awayScore']
                    match.status = 'analyzed'
                    session.commit()
                    print(f"[PIPELINE] ✓ Placar atualizado: {match.home_score} x {match.away_score}")
            finally:
                session.close()
            
            # Categorize events by type (if full pipeline)
            if categorize_events and all_events:
                categories = {}
                for event in all_events:
                    event_type = event.get('event_type', 'unknown')
                    if event_type not in categories:
                        categories[event_type] = []
                    categories[event_type].append(event)
                
                # Save categorized events
                categories_path = get_subfolder_path(match_id, 'json') / 'events_by_category.json'
                with open(categories_path, 'w', encoding='utf-8') as f:
                    json_module.dump(categories, f, ensure_ascii=False, indent=2)
                results['files']['json'].append('events_by_category.json')
                print(f"[PIPELINE] ✓ Eventos categorizados salvos")
            
            # Generate match summary (if full pipeline)
            if generate_summary and all_events:
                summary = {
                    'matchId': match_id,
                    'homeTeam': home_team,
                    'awayTeam': away_team,
                    'homeScore': results['statistics']['homeScore'],
                    'awayScore': results['statistics']['awayScore'],
                    'totalEvents': results['statistics']['totalEvents'],
                    'totalClips': results['statistics']['totalClips'],
                    'eventsByType': results['statistics']['eventsByType'],
                    'eventsByHalf': results['statistics']['eventsByHalf'],
                    'highlights': [e for e in all_events if e.get('is_highlight')],
                    'goals': [e for e in all_events if e.get('event_type') == 'goal'],
                    'cards': [e for e in all_events if e.get('event_type') in ['yellow_card', 'red_card']],
                    'processedAt': datetime.now().isoformat()
                }
                
                # Save summary
                summary_path = get_subfolder_path(match_id, 'json') / 'match_summary.json'
                with open(summary_path, 'w', encoding='utf-8') as f:
                    json_module.dump(summary, f, ensure_ascii=False, indent=2)
                results['summary'] = summary
                results['files']['json'].append('match_summary.json')
                print(f"[PIPELINE] ✓ Resumo da partida salvo")
            
            # List all generated files
            results['phases']['organization']['files'] = {
                'srt': results['files']['srt'],
                'texts': results['files']['texts'],
                'clips': results['files']['clips'],
                'json': results['files']['json']
            }
            results['phases']['organization']['status'] = 'completed'
            
            # Final success
            results['success'] = True
            
            print(f"\n{'='*70}")
            print(f"[PIPELINE] ✅ PIPELINE CONCLUÍDO COM SUCESSO!")
            print(f"[PIPELINE] Eventos: {results['statistics']['totalEvents']}")
            print(f"[PIPELINE] Clips: {results['statistics']['totalClips']}")
            print(f"[PIPELINE] Placar: {home_team} {results['statistics']['homeScore']} x {results['statistics']['awayScore']} {away_team}")
            print(f"[PIPELINE] Warnings: {len(results['warnings'])}")
            print(f"[PIPELINE] Errors: {len(results['errors'])}")
            print(f"{'='*70}\n")
            
            return jsonify(results)
            
    except Exception as e:
        print(f"\n[PIPELINE] ❌ ERRO CRÍTICO: {str(e)}")
        import traceback
        traceback.print_exc()
        
        results['success'] = False
        results['error'] = str(e)
        results['phases']['organization']['status'] = 'error'
        
        return jsonify(results), 500


@app.route('/api/matches/<match_id>/files', methods=['GET'])
def list_match_all_files(match_id: str):
    """
    List ALL files for a match, organized by subfolder.
    
    Returns complete inventory of generated files:
    {
        "matchId": "uuid",
        "folders": {
            "videos": [...],
            "clips": {"first_half": [...], "second_half": [...], ...},
            "srt": [...],
            "texts": [...],
            "json": [...],
            "audio": [...],
            "images": [...]
        },
        "statistics": {
            "totalFiles": 42,
            "totalSizeMB": 1234.5
        }
    }
    """
    from storage import MATCH_SUBFOLDERS, CLIP_SUBFOLDERS, get_match_storage_path
    
    result = {
        'matchId': match_id,
        'folders': {},
        'statistics': {
            'totalFiles': 0,
            'totalSizeBytes': 0
        }
    }
    
    match_path = get_match_storage_path(match_id)
    if not match_path.exists():
        return jsonify({'error': 'Match storage not found', 'matchId': match_id}), 404
    
    for subfolder in MATCH_SUBFOLDERS:
        subfolder_path = match_path / subfolder
        
        if subfolder == 'clips':
            # Special handling for clips (organized by half)
            clips_by_half = {}
            for half in CLIP_SUBFOLDERS:
                half_path = subfolder_path / half
                if half_path.exists():
                    files = []
                    for file_path in half_path.iterdir():
                        if file_path.is_file():
                            stat = file_path.stat()
                            files.append({
                                'filename': file_path.name,
                                'url': f"/api/storage/{match_id}/clips/{half}/{file_path.name}",
                                'size': stat.st_size,
                                'sizeMB': round(stat.st_size / (1024*1024), 2),
                                'modifiedAt': datetime.fromtimestamp(stat.st_mtime).isoformat()
                            })
                            result['statistics']['totalFiles'] += 1
                            result['statistics']['totalSizeBytes'] += stat.st_size
                    clips_by_half[half] = sorted(files, key=lambda x: x['filename'])
                else:
                    clips_by_half[half] = []
            result['folders']['clips'] = clips_by_half
            
        elif subfolder == 'videos':
            # Special handling for videos (original and optimized)
            videos = {'original': [], 'optimized': []}
            for video_type in ['original', 'optimized']:
                type_path = subfolder_path / video_type
                if type_path.exists():
                    for file_path in type_path.iterdir():
                        if file_path.is_file():
                            stat = file_path.stat()
                            videos[video_type].append({
                                'filename': file_path.name,
                                'url': f"/api/storage/{match_id}/videos/{video_type}/{file_path.name}",
                                'size': stat.st_size,
                                'sizeMB': round(stat.st_size / (1024*1024), 2),
                                'modifiedAt': datetime.fromtimestamp(stat.st_mtime).isoformat()
                            })
                            result['statistics']['totalFiles'] += 1
                            result['statistics']['totalSizeBytes'] += stat.st_size
            result['folders']['videos'] = videos
            
        else:
            # Standard folder listing
            if subfolder_path.exists():
                files = []
                for file_path in subfolder_path.iterdir():
                    if file_path.is_file():
                        stat = file_path.stat()
                        files.append({
                            'filename': file_path.name,
                            'url': f"/api/storage/{match_id}/{subfolder}/{file_path.name}",
                            'size': stat.st_size,
                            'sizeMB': round(stat.st_size / (1024*1024), 2),
                            'modifiedAt': datetime.fromtimestamp(stat.st_mtime).isoformat()
                        })
                        result['statistics']['totalFiles'] += 1
                        result['statistics']['totalSizeBytes'] += stat.st_size
                result['folders'][subfolder] = sorted(files, key=lambda x: x['filename'])
            else:
                result['folders'][subfolder] = []
    
    result['statistics']['totalSizeMB'] = round(result['statistics']['totalSizeBytes'] / (1024*1024), 2)
    result['statistics']['totalSizeGB'] = round(result['statistics']['totalSizeBytes'] / (1024*1024*1024), 3)
    
    return jsonify(result)


@app.route('/api/matches/<match_id>/summary', methods=['GET'])
def get_match_summary(match_id: str):
    """
    Get match summary including events, clips, and analysis.
    """
    session = get_session()
    try:
        # Get match
        match = session.query(Match).filter_by(id=match_id).first()
        if not match:
            return jsonify({'error': 'Match not found'}), 404
        
        match_data = match.to_dict()
        
        # Get teams
        if match.home_team_id:
            home_team = session.query(Team).filter_by(id=match.home_team_id).first()
            if home_team:
                match_data['homeTeam'] = home_team.to_dict()
        
        if match.away_team_id:
            away_team = session.query(Team).filter_by(id=match.away_team_id).first()
            if away_team:
                match_data['awayTeam'] = away_team.to_dict()
        
        # Get events
        events = session.query(MatchEvent).filter_by(match_id=match_id).order_by(MatchEvent.minute).all()
        events_data = [e.to_dict() for e in events]
        
        # Count by type
        events_by_type = {}
        events_by_half = {'first_half': 0, 'second_half': 0}
        highlights = []
        goals = []
        
        for event in events_data:
            event_type = event.get('event_type', 'unknown')
            events_by_type[event_type] = events_by_type.get(event_type, 0) + 1
            
            match_half = event.get('match_half', 'first_half')
            if match_half in events_by_half:
                events_by_half[match_half] += 1
            
            if event.get('is_highlight'):
                highlights.append(event)
            
            if event_type == 'goal':
                goals.append(event)
        
        # Get clips
        clips_result = {}
        from storage import CLIP_SUBFOLDERS
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
                                'size': stat.st_size
                            })
                    clips_result[half] = clips
                else:
                    clips_result[half] = []
            except:
                clips_result[half] = []
        
        # Load tactical analysis if exists
        tactical_analysis = None
        try:
            json_path = get_subfolder_path(match_id, 'json') / 'tactical_analysis.json'
            if json_path.exists():
                with open(json_path, 'r', encoding='utf-8') as f:
                    tactical_analysis = json_module.load(f)
        except:
            pass
        
        return jsonify({
            'match': match_data,
            'events': events_data,
            'clips': clips_result,
            'tacticalAnalysis': tactical_analysis,
            'statistics': {
                'totalEvents': len(events_data),
                'totalClips': sum(len(c) for c in clips_result.values()),
                'eventsByType': events_by_type,
                'eventsByHalf': events_by_half,
                'highlights': highlights,
                'goals': goals
            }
        })
        
    finally:
        session.close()


@app.route('/api/clips/<match_id>', methods=['GET'])
def list_match_clips(match_id: str):
    """
    List all clips for a match, organized by half.
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
            # Save to storage - save_file(match_id, subfolder, file_data, filename, extension)
            result = save_file(match_id, 'generated-audio', audio_bytes, f'narration_{match_id}', 'mp3')
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
            # save_file(match_id, subfolder, file_data, filename, extension)
            result = save_file(match_id, 'generated-audio', audio_bytes, f'podcast_{podcast_type}', 'mp3')
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




def _status_from_ai_error(err: str) -> int:
    """Best effort mapping from upstream AI errors to HTTP status codes."""
    if not err:
        return 500
    e = str(err).lower()
    if 'invalid_api_key' in e or 'incorrect api key' in e or 'unauthorized' in e or ' 401' in e or '401' in e:
        return 401
    if 'insufficient permissions' in e or 'missing scopes' in e or 'forbidden' in e or ' 403' in e or '403' in e:
        return 403
    if 'not found' in e or ' 404' in e or '404' in e:
        return 404
    if 'timeout' in e or 'timed out' in e or 'gateway' in e:
        return 504
    return 500
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


@app.route('/api/storage/transfer-command/<match_id>', methods=['GET'])
def get_transfer_commands(match_id: str):
    """
    Gera comandos prontos para transferência direta de arquivos para a pasta da partida.
    Suporta múltiplos sistemas operacionais e métodos de transferência.
    Ideal para vídeos grandes que excedem o limite de upload do navegador.
    """
    import socket
    
    # Criar pasta de destino se não existir
    match_storage = get_match_storage_path(match_id)
    videos_path = match_storage / "videos"
    videos_path.mkdir(parents=True, exist_ok=True)
    
    # Detectar hostname e IP
    hostname = socket.gethostname()
    try:
        local_ip = socket.gethostbyname(hostname)
    except:
        local_ip = "IP_DO_SERVIDOR"
    
    # Caminho absoluto do destino
    dest_path = str(videos_path.absolute())
    
    # Usuário do sistema
    import getpass
    username = getpass.getuser()
    
    commands = {
        "match_id": match_id,
        "destination_path": dest_path,
        "hostname": hostname,
        "ip": local_ip,
        "commands": {
            "scp": {
                "description": "Linux/Mac - Cópia segura via SSH",
                "single_file": f"scp /caminho/do/video.mp4 {username}@{local_ip}:{dest_path}/",
                "multiple_files": f"scp /caminho/*.mp4 {username}@{local_ip}:{dest_path}/",
                "folder": f"scp -r /caminho/pasta/ {username}@{local_ip}:{dest_path}/"
            },
            "rsync": {
                "description": "Linux/Mac - Sincronização inteligente (com resume automático)",
                "single_file": f"rsync -avP /caminho/do/video.mp4 {username}@{local_ip}:{dest_path}/",
                "folder": f"rsync -avP /caminho/pasta/*.mp4 {username}@{local_ip}:{dest_path}/"
            },
            "windows_network": {
                "description": "Windows - Cópia via rede compartilhada",
                "copy": f'copy "C:\\caminho\\video.mp4" "\\\\{hostname}\\arena-storage\\{match_id}\\videos\\"',
                "xcopy": f'xcopy "C:\\caminho\\*.mp4" "\\\\{hostname}\\arena-storage\\{match_id}\\videos\\" /Y'
            },
            "curl": {
                "description": "Upload via HTTP (qualquer sistema operacional)",
                "command": f"curl -X POST -F 'file=@/caminho/do/video.mp4' -F 'video_type=full' http://{local_ip}:5000/api/storage/{match_id}/videos/upload"
            },
            "powershell": {
                "description": "Windows PowerShell - Cópia remota",
                "command": f'Copy-Item -Path "C:\\caminho\\video.mp4" -Destination "\\\\{hostname}\\arena-storage\\{match_id}\\videos\\"'
            }
        },
        "sync_after": f"POST http://{local_ip}:5000/api/videos/sync/{match_id}",
        "notes": [
            "Substitua '/caminho/do/video.mp4' pelo caminho real do arquivo",
            f"Para SCP/Rsync, o usuário padrão é '{username}'",
            "Após a transferência, clique em 'Sincronizar Vídeos' na interface",
            "O método cURL funciona em qualquer sistema com cURL instalado",
            "Rsync permite retomar transferências interrompidas"
        ]
    }
    
    return jsonify(commands)


@app.route('/api/storage/<match_id>/videos/upload', methods=['POST'])
def upload_video_direct(match_id: str):
    """
    Upload direto de vídeo via HTTP multipart.
    Alternativa ao link-local quando o arquivo não está na mesma máquina.
    
    Aceita:
    - file: Arquivo de vídeo (multipart/form-data)
    - video_type: Tipo do vídeo (full, first_half, second_half)
    
    Retorna informações do vídeo registrado no banco.
    """
    if 'file' not in request.files:
        return jsonify({'error': 'Nenhum arquivo enviado'}), 400
    
    file = request.files['file']
    video_type = request.form.get('video_type', 'full')
    
    if not file.filename:
        return jsonify({'error': 'Nome de arquivo vazio'}), 400
    
    try:
        # Salvar arquivo na pasta de vídeos
        result = save_uploaded_file(match_id, 'videos', file)
        
        file_path = Path(result['path'])
        
        # Detectar duração usando ffprobe
        duration_seconds = None
        try:
            probe_result = subprocess.run([
                'ffprobe', '-v', 'quiet', '-print_format', 'json',
                '-show_format', str(file_path)
            ], capture_output=True, text=True, timeout=30)
            
            if probe_result.returncode == 0:
                probe_data = json_module.loads(probe_result.stdout)
                duration_seconds = int(float(probe_data.get('format', {}).get('duration', 0)))
        except Exception as e:
            print(f"[upload-video] Erro ao detectar duração: {e}")
        
        # Criar registro no banco
        session = get_session()
        try:
            # Determinar minutos de início e fim
            start_minute = 0 if video_type == 'first_half' else (45 if video_type == 'second_half' else 0)
            end_minute = 45 if video_type == 'first_half' else (90 if video_type in ['second_half', 'full'] else None)
            
            video = Video(
                match_id=match_id,
                file_url=result['url'],
                file_name=result['filename'],
                video_type=video_type,
                duration_seconds=duration_seconds,
                status='ready',
                start_minute=start_minute,
                end_minute=end_minute
            )
            session.add(video)
            session.commit()
            
            video_dict = video.to_dict()
            
            return jsonify({
                'success': True,
                'video': video_dict,
                'file_path': result['path'],
                'file_size': result['size'],
                'file_size_mb': round(result['size'] / (1024 * 1024), 2),
                'duration_seconds': duration_seconds
            })
        except Exception as e:
            session.rollback()
            return jsonify({'error': str(e)}), 400
        finally:
            session.close()
            
    except Exception as e:
        print(f"[upload-video] Erro: {e}")
        import traceback
        traceback.print_exc()
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
    """Transcribe a large video file. Saves audio and SRT to match folder."""
    data = request.json
    video_url = data.get('videoUrl')
    match_id = data.get('matchId')
    half_type = data.get('halfType')  # 'first', 'second', or None
    
    print(f"\n{'='*60}")
    print(f"[TRANSCRIBE] Nova requisição de transcrição")
    print(f"[TRANSCRIBE] Match ID: {match_id}")
    print(f"[TRANSCRIBE] Half Type: {half_type}")
    print(f"[TRANSCRIBE] Video URL: {video_url}")
    print(f"{'='*60}")
    
    if not video_url:
        print("[TRANSCRIBE] ERRO: videoUrl não fornecida")
        return jsonify({'error': 'videoUrl é obrigatório'}), 400
    
    try:
        print("[TRANSCRIBE] Iniciando transcrição via ai_services...")
        result = ai_services.transcribe_large_video(video_url, match_id, half_type=half_type)
        
        if result.get('success'):
            text_preview = result.get('text', '')[:200]
            print(f"[TRANSCRIBE] SUCESSO! Preview do texto: {text_preview}...")
            print(f"[TRANSCRIBE] Tamanho do SRT: {len(result.get('srtContent', ''))} chars")
            if result.get('audioPath'):
                print(f"[TRANSCRIBE] Áudio salvo: {result.get('audioPath')}")
            if result.get('srtPath'):
                print(f"[TRANSCRIBE] SRT salvo: {result.get('srtPath')}")
        else:
            print(f"[TRANSCRIBE] Falha: {result.get('error')}")
        
        if result.get('success'):
            return jsonify(result), 200
        status = _status_from_ai_error(result.get('error') or result.get('detail') or '')
        return jsonify(result), status
    except Exception as e:
        print(f"[TRANSCRIBE] EXCEÇÃO: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/transcribe-split-video', methods=['POST'])
def transcribe_split_video_endpoint():
    """
    Transcribe a video by first splitting it into parts.
    
    This is especially useful for very large videos (>500MB) where
    splitting before transcription improves reliability.
    
    Input JSON:
    - videoUrl: URL or local path to the video
    - matchId: Match ID
    - numParts: Number of parts to split into (default: 2)
    - halfType: 'first' or 'second' (for minute offset calculation)
    - halfDuration: Duration of this half in minutes (default: 45)
    
    Returns combined transcription from all parts with adjusted timestamps.
    """
    data = request.json
    video_url = data.get('videoUrl')
    match_id = data.get('matchId')
    num_parts = data.get('numParts', 2)
    half_type = data.get('halfType', 'first')
    half_duration = data.get('halfDuration', 45)
    
    print(f"\n{'='*60}")
    print(f"[SPLIT-TRANSCRIBE] Nova requisição de transcrição com divisão")
    print(f"[SPLIT-TRANSCRIBE] Match ID: {match_id}")
    print(f"[SPLIT-TRANSCRIBE] Video URL: {video_url}")
    print(f"[SPLIT-TRANSCRIBE] Num Parts: {num_parts}")
    print(f"[SPLIT-TRANSCRIBE] Half Type: {half_type}")
    print(f"{'='*60}")
    
    if not video_url:
        return jsonify({'error': 'videoUrl é obrigatório'}), 400
    
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            video_path = os.path.join(tmpdir, 'original_video.mp4')
            
            # Resolve local URL or download external
            if video_url.startswith('/api/storage/') or 'localhost' in video_url:
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
                        print(f"[SPLIT-TRANSCRIBE] Vídeo local copiado: {local_path}")
                    else:
                        return jsonify({'error': f'Arquivo local não encontrado: {local_path}'}), 400
                else:
                    return jsonify({'error': f'Formato de URL local inválido'}), 400
            else:
                print(f"[SPLIT-TRANSCRIBE] Baixando vídeo externo...")
                if not download_video(video_url, video_path):
                    return jsonify({'error': 'Falha ao baixar vídeo'}), 400
            
            # Split video into parts
            print(f"[SPLIT-TRANSCRIBE] Dividindo vídeo em {num_parts} partes...")
            video_parts = split_video(video_path, num_parts, tmpdir)
            
            if not video_parts:
                return jsonify({'error': 'Falha ao dividir vídeo'}), 400
            
            print(f"[SPLIT-TRANSCRIBE] ✓ {len(video_parts)} partes criadas")
            
            # Transcribe each part
            all_transcriptions = []
            all_srt_lines = []
            srt_index = 1
            total_text = []
            
            # Calculate minute offset for this half
            minute_offset = 0 if half_type == 'first' else 45
            
            for part_info in video_parts:
                part_path = part_info['path']
                part_num = part_info['part']
                part_start = part_info['start']
                
                # Convert start seconds to approximate game minute
                part_start_minute = minute_offset + (part_start / 60)
                
                print(f"[SPLIT-TRANSCRIBE] Transcrevendo parte {part_num}/{num_parts} (início: {part_start_minute:.1f}')...")
                
                # Use ai_services to transcribe with explicit path
                result = ai_services.transcribe_large_video(
                    f"file://{part_path}",  # Use file:// prefix for local files
                    match_id
                )
                
                # Fallback: Direct transcription if file:// not supported
                if not result.get('success') or not result.get('text'):
                    print(f"[SPLIT-TRANSCRIBE] Tentando transcrição direta da parte {part_num}...")
                    result = _transcribe_video_part_direct(part_path, part_start, minute_offset)
                
                if result.get('success') and result.get('text'):
                    part_text = result.get('text', '')
                    total_text.append(f"[{int(part_start_minute)}'-{int(part_start_minute + half_duration/num_parts)}'] {part_text}")
                    
                    # Adjust SRT timestamps
                    if result.get('srtContent'):
                        adjusted_srt = _adjust_srt_timestamps(
                            result['srtContent'], 
                            part_start,
                            srt_index
                        )
                        all_srt_lines.append(adjusted_srt['content'])
                        srt_index = adjusted_srt['next_index']
                    
                    print(f"[SPLIT-TRANSCRIBE] ✓ Parte {part_num}: {len(part_text)} caracteres")
                    all_transcriptions.append({
                        'part': part_num,
                        'text': part_text,
                        'startMinute': part_start_minute
                    })
                else:
                    print(f"[SPLIT-TRANSCRIBE] ✗ Parte {part_num} falhou: {result.get('error', 'Unknown')}")
            
            if not all_transcriptions:
                return jsonify({'error': 'Nenhuma parte foi transcrita com sucesso'}), 500
            
            # Combine results
            combined_text = '\n\n'.join(total_text)
            combined_srt = '\n'.join(all_srt_lines)
            
            print(f"[SPLIT-TRANSCRIBE] ✓ Transcrição combinada: {len(combined_text)} caracteres")
            
            return jsonify({
                'success': True,
                'text': combined_text,
                'srtContent': combined_srt,
                'partsTranscribed': len(all_transcriptions),
                'totalParts': num_parts,
                'parts': all_transcriptions,
                'matchId': match_id,
                'halfType': half_type
            })
            
    except Exception as e:
        print(f"[SPLIT-TRANSCRIBE] EXCEÇÃO: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def _transcribe_video_part_direct(video_path: str, time_offset: float, minute_offset: float) -> dict:
    """
    Transcribe a video part directly using FFmpeg + Whisper.
    Used as fallback when the main transcription method fails.
    """
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            audio_path = os.path.join(tmpdir, 'audio.mp3')
            
            # Extract audio
            cmd = [
                'ffmpeg', '-y', '-i', video_path,
                '-vn', '-acodec', 'libmp3lame', '-ab', '128k',
                audio_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            
            if result.returncode != 0 or not os.path.exists(audio_path):
                return {'success': False, 'error': 'Failed to extract audio'}
            
            # Transcribe with Whisper
            transcription_result = ai_services._transcribe_audio_file(audio_path, None)
            
            if transcription_result.get('success'):
                # Adjust timestamps by time_offset
                text = transcription_result.get('text', '')
                srt = transcription_result.get('srtContent', '')
                
                return {
                    'success': True,
                    'text': text,
                    'srtContent': srt,
                    'timeOffset': time_offset
                }
            
            return transcription_result
            
    except Exception as e:
        return {'success': False, 'error': str(e)}


def _adjust_srt_timestamps(srt_content: str, time_offset: float, start_index: int) -> dict:
    """
    Adjust SRT timestamps by a time offset and reindex entries.
    
    Args:
        srt_content: Original SRT content
        time_offset: Seconds to add to all timestamps
        start_index: Starting index for renumbering
    
    Returns:
        Dict with 'content' (adjusted SRT) and 'next_index'
    """
    import re
    
    lines = srt_content.strip().split('\n')
    adjusted_lines = []
    current_index = start_index
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # Skip empty lines
        if not line:
            i += 1
            continue
        
        # Check if this is an index number
        if line.isdigit():
            # Replace with new index
            adjusted_lines.append(str(current_index))
            current_index += 1
            i += 1
            
            # Next line should be timestamp
            if i < len(lines):
                timestamp_line = lines[i].strip()
                # Parse and adjust timestamp
                timestamp_match = re.match(
                    r'(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})',
                    timestamp_line
                )
                if timestamp_match:
                    start_h, start_m, start_s, start_ms = map(int, timestamp_match.groups()[:4])
                    end_h, end_m, end_s, end_ms = map(int, timestamp_match.groups()[4:])
                    
                    # Convert to seconds, add offset, convert back
                    start_total = start_h * 3600 + start_m * 60 + start_s + start_ms / 1000 + time_offset
                    end_total = end_h * 3600 + end_m * 60 + end_s + end_ms / 1000 + time_offset
                    
                    new_timestamp = f"{_format_srt_time(start_total)} --> {_format_srt_time(end_total)}"
                    adjusted_lines.append(new_timestamp)
                else:
                    adjusted_lines.append(timestamp_line)
                i += 1
                
                # Read subtitle text until empty line or end
                while i < len(lines) and lines[i].strip():
                    adjusted_lines.append(lines[i])
                    i += 1
                
                adjusted_lines.append('')  # Add blank line between entries
        else:
            i += 1
    
    return {
        'content': '\n'.join(adjusted_lines),
        'next_index': current_index
    }


def _format_srt_time(seconds: float) -> str:
    """Format seconds to SRT timestamp format."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"



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
        if result.get('success'):
            return jsonify(result), 200
        status = _status_from_ai_error(result.get('error') or result.get('detail') or '')
        return jsonify(result), status
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
# ASYNC PROCESSING PIPELINE
# ============================================================================

from concurrent.futures import ThreadPoolExecutor, as_completed
import time as time_module

# Global job tracker for async processing
async_processing_jobs = {}

def _update_async_job(job_id: str, status: str, progress: int, message: str = '', 
                      stage: str = None, parts_completed: int = None, 
                      total_parts: int = None, parts_status: list = None,
                      error: str = None, events_detected: int = None, clips_generated: int = None):
    """Update async job status in database and memory."""
    session = get_session()
    try:
        job = session.query(AnalysisJob).filter_by(id=job_id).first()
        if job:
            job.status = status
            job.progress = progress
            job.progress_message = message
            if stage:
                job.stage = stage
            if parts_completed is not None:
                job.parts_completed = parts_completed
            if total_parts is not None:
                job.total_parts = total_parts
            if parts_status is not None:
                job.parts_status = parts_status
            if error:
                job.error_message = error
            if status == 'complete':
                job.completed_at = datetime.utcnow()
            session.commit()
            
        # Also update in-memory tracker
        if job_id in async_processing_jobs:
            async_processing_jobs[job_id].update({
                'status': status,
                'progress': progress,
                'progressMessage': message,
                'stage': stage or async_processing_jobs[job_id].get('stage'),
                'partsCompleted': parts_completed if parts_completed is not None else async_processing_jobs[job_id].get('partsCompleted', 0),
                'totalParts': total_parts if total_parts is not None else async_processing_jobs[job_id].get('totalParts', 0),
                'partsStatus': parts_status if parts_status is not None else async_processing_jobs[job_id].get('partsStatus', []),
                'error': error,
                'eventsDetected': events_detected if events_detected is not None else async_processing_jobs[job_id].get('eventsDetected'),
                'clipsGenerated': clips_generated if clips_generated is not None else async_processing_jobs[job_id].get('clipsGenerated'),
            })
    except Exception as e:
        print(f"[ASYNC-UPDATE] Error updating job {job_id}: {e}")
    finally:
        session.close()


def _split_video_parallel(video_path: str, num_parts: int, output_dir: str, half_type: str):
    """Split a video into parts - used by ThreadPoolExecutor."""
    try:
        parts = split_video(video_path, num_parts, output_dir)
        return {
            'success': True,
            'halfType': half_type,
            'parts': parts
        }
    except Exception as e:
        return {
            'success': False,
            'halfType': half_type,
            'error': str(e)
        }


def _transcribe_part_parallel(part_info: dict, half_type: str, match_id: str, minute_offset: float):
    """Transcribe a single video part - used by ThreadPoolExecutor."""
    try:
        part_path = part_info['path']
        part_num = part_info['part']
        part_start = part_info['start']
        part_duration = part_info['duration']
        
        # Calculate game minute
        part_start_minute = minute_offset + (part_start / 60)
        
        print(f"[ASYNC-TRANSCRIBE] Part {part_num} (half={half_type}): transcribing...")
        
        # Use direct transcription for local files
        result = _transcribe_video_part_direct(part_path, part_start, minute_offset)
        
        if result.get('success') and result.get('text'):
            return {
                'success': True,
                'part': part_num,
                'halfType': half_type,
                'text': result.get('text', ''),
                'srtContent': result.get('srtContent', ''),
                'startMinute': part_start_minute,
                'duration': part_duration
            }
        else:
            return {
                'success': False,
                'part': part_num,
                'halfType': half_type,
                'error': result.get('error', 'Unknown error')
            }
    except Exception as e:
        return {
            'success': False,
            'part': part_info.get('part', 0),
            'halfType': half_type,
            'error': str(e)
        }


def _process_match_pipeline(job_id: str, data: dict):
    """
    Main async processing pipeline.
    Runs in a background thread to process an entire match.
    """
    match_id = data.get('matchId')
    videos = data.get('videos', [])
    home_team = data.get('homeTeam', 'Time A')
    away_team = data.get('awayTeam', 'Time B')
    auto_clip = data.get('autoClip', True)
    
    start_time = time_module.time()
    
    print(f"\n{'='*60}")
    print(f"[ASYNC-PIPELINE] Starting job {job_id}")
    print(f"[ASYNC-PIPELINE] Match: {match_id}")
    print(f"[ASYNC-PIPELINE] Videos: {len(videos)}")
    print(f"{'='*60}")
    
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            # ========== PHASE 1: PREPARATION (5%) ==========
            _update_async_job(job_id, 'preparing', 5, 'Preparando arquivos...', 'preparing')
            
            # Organize videos by half
            first_half_videos = [v for v in videos if v.get('halfType') == 'first']
            second_half_videos = [v for v in videos if v.get('halfType') == 'second']
            
            # Calculate parts needed based on size
            def calc_parts(videos_list):
                if not videos_list:
                    return 0, []
                total_mb = sum(v.get('sizeMB', 500) for v in videos_list)
                parts = 4 if total_mb > 800 else 2 if total_mb > 300 else 1
                return parts, videos_list
            
            first_parts_count, _ = calc_parts(first_half_videos)
            second_parts_count, _ = calc_parts(second_half_videos)
            total_parts = first_parts_count + second_parts_count
            
            # Initialize parts status
            parts_status = []
            for i in range(first_parts_count):
                parts_status.append({'part': i + 1, 'halfType': 'first', 'status': 'pending', 'progress': 0})
            for i in range(second_parts_count):
                parts_status.append({'part': i + 1, 'halfType': 'second', 'status': 'pending', 'progress': 0})
            
            _update_async_job(job_id, 'preparing', 10, f'Preparando {total_parts} partes...', 
                            'preparing', 0, total_parts, parts_status)
            
            # Download/copy videos
            video_paths = {}
            for i, video in enumerate(videos):
                half_type = video.get('halfType', 'first')
                video_url = video.get('url', '')
                video_path = os.path.join(tmpdir, f'video_{half_type}_{i}.mp4')
                
                # Resolve local path or download
                if video_url.startswith('/api/storage/') or 'localhost' in video_url:
                    clean_url = video_url.replace('http://localhost:5000', '').replace('http://127.0.0.1:5000', '')
                    parts = clean_url.strip('/').split('/')
                    if len(parts) >= 5 and parts[0] == 'api' and parts[1] == 'storage':
                        local_match_id = parts[2]
                        subfolder = parts[3]
                        filename = '/'.join(parts[4:])
                        local_path = get_file_path(local_match_id, subfolder, filename)
                        if local_path and os.path.exists(local_path):
                            # Create symlink instead of copy for speed
                            os.symlink(local_path, video_path)
                            print(f"[ASYNC-PIPELINE] Linked local file: {local_path}")
                            video_paths[half_type] = video_path
                        else:
                            raise Exception(f"Arquivo local não encontrado: {local_path}")
                else:
                    if download_video(video_url, video_path):
                        video_paths[half_type] = video_path
                    else:
                        raise Exception(f"Falha ao baixar vídeo: {video_url[:50]}")
            
            if not video_paths:
                raise Exception("Nenhum vídeo válido encontrado")
            
            # ========== PHASE 2: PARALLEL SPLITTING (15%) ==========
            _update_async_job(job_id, 'splitting', 15, 'Dividindo vídeos...', 'splitting')
            
            all_video_parts = []
            
            with ThreadPoolExecutor(max_workers=2) as executor:
                split_futures = {}
                
                for half_type, video_path in video_paths.items():
                    num_parts = first_parts_count if half_type == 'first' else second_parts_count
                    if num_parts > 1:
                        output_dir = os.path.join(tmpdir, f'parts_{half_type}')
                        os.makedirs(output_dir, exist_ok=True)
                        
                        future = executor.submit(_split_video_parallel, video_path, num_parts, output_dir, half_type)
                        split_futures[future] = half_type
                    else:
                        # No splitting needed - use original
                        all_video_parts.append({
                            'halfType': half_type,
                            'parts': [{'path': video_path, 'part': 1, 'start': 0, 'duration': 2700}]
                        })
                
                for future in as_completed(split_futures):
                    half_type = split_futures[future]
                    result = future.result()
                    if result['success']:
                        all_video_parts.append({
                            'halfType': half_type,
                            'parts': result['parts']
                        })
                        print(f"[ASYNC-PIPELINE] ✓ Split {half_type}: {len(result['parts'])} parts")
                    else:
                        raise Exception(f"Falha ao dividir {half_type}: {result.get('error')}")
            
            _update_async_job(job_id, 'splitting', 20, 'Divisão concluída', 'splitting')
            
            # ========== PHASE 3: PARALLEL TRANSCRIPTION (60%) ==========
            _update_async_job(job_id, 'transcribing', 20, 'Transcrevendo...', 'transcribing')
            
            transcription_results = {'first': [], 'second': []}
            completed_parts = 0
            
            # Flatten all parts for parallel processing
            all_parts_flat = []
            for video_group in all_video_parts:
                half_type = video_group['halfType']
                minute_offset = 0 if half_type == 'first' else 45
                for part_info in video_group['parts']:
                    all_parts_flat.append({
                        'partInfo': part_info,
                        'halfType': half_type,
                        'minuteOffset': minute_offset
                    })
            
            # Process in parallel (limit to 4 workers to not overload Whisper)
            with ThreadPoolExecutor(max_workers=4) as executor:
                transcribe_futures = {}
                
                for item in all_parts_flat:
                    future = executor.submit(
                        _transcribe_part_parallel,
                        item['partInfo'],
                        item['halfType'],
                        match_id,
                        item['minuteOffset']
                    )
                    transcribe_futures[future] = item
                
                for future in as_completed(transcribe_futures):
                    item = transcribe_futures[future]
                    result = future.result()
                    completed_parts += 1
                    
                    # Update part status
                    part_key = (item['halfType'], item['partInfo']['part'])
                    for ps in parts_status:
                        if ps['halfType'] == item['halfType'] and ps['part'] == item['partInfo']['part']:
                            ps['status'] = 'done' if result['success'] else 'error'
                            ps['progress'] = 100
                            break
                    
                    # Calculate progress (20% to 80%)
                    progress = 20 + int((completed_parts / len(all_parts_flat)) * 60)
                    
                    if result['success']:
                        transcription_results[item['halfType']].append(result)
                        print(f"[ASYNC-PIPELINE] ✓ Transcribed {item['halfType']} part {result['part']}: {len(result['text'])} chars")
                        _update_async_job(job_id, 'transcribing', progress, 
                                        f'Parte {completed_parts}/{len(all_parts_flat)} transcrita',
                                        'transcribing', completed_parts, total_parts, parts_status)
                    else:
                        print(f"[ASYNC-PIPELINE] ✗ Failed {item['halfType']} part: {result.get('error')}")
            
            # Combine transcriptions
            first_half_text = '\n\n'.join([r['text'] for r in sorted(transcription_results['first'], key=lambda x: x['part'])])
            second_half_text = '\n\n'.join([r['text'] for r in sorted(transcription_results['second'], key=lambda x: x['part'])])
            
            if not first_half_text and not second_half_text:
                raise Exception("Nenhuma transcrição foi gerada")
            
            # Save transcription text files
            if first_half_text:
                txt_path = get_subfolder_path(match_id, 'texts') / 'first_half_transcription.txt'
                with open(txt_path, 'w', encoding='utf-8') as f:
                    f.write(first_half_text)
                print(f"[ASYNC-PIPELINE] ✓ Transcrição 1º tempo salva: {txt_path}")
            
            if second_half_text:
                txt_path = get_subfolder_path(match_id, 'texts') / 'second_half_transcription.txt'
                with open(txt_path, 'w', encoding='utf-8') as f:
                    f.write(second_half_text)
                print(f"[ASYNC-PIPELINE] ✓ Transcrição 2º tempo salva: {txt_path}")
            
            # ========== PHASE 4: AI ANALYSIS (10%) ==========
            _update_async_job(job_id, 'analyzing', 80, 'Analisando com IA...', 'analyzing')
            
            total_events = 0
            
            # Analyze first half
            if first_half_text:
                print(f"[ASYNC-PIPELINE] Analyzing first half...")
                events = ai_services.analyze_match_events(first_half_text, home_team, away_team, 0, 45)
                if events:
                    # Save events
                    session = get_session()
                    try:
                        for event_data in events:
                            event = MatchEvent(
                                match_id=match_id,
                                event_type=event_data.get('event_type', 'unknown'),
                                description=event_data.get('description'),
                                minute=event_data.get('minute', 0),
                                match_half='first_half',
                                is_highlight=event_data.get('is_highlight', False),
                                metadata={'ai_generated': True, 'pipeline': 'async', **event_data}
                            )
                            session.add(event)
                        session.commit()
                        total_events += len(events)
                        print(f"[ASYNC-PIPELINE] ✓ First half: {len(events)} events saved")
                    finally:
                        session.close()
            
            # Analyze second half
            if second_half_text:
                print(f"[ASYNC-PIPELINE] Analyzing second half...")
                events = ai_services.analyze_match_events(second_half_text, home_team, away_team, 45, 90)
                if events:
                    session = get_session()
                    try:
                        for event_data in events:
                            raw_minute = event_data.get('minute', 45)
                            if raw_minute < 45:
                                raw_minute += 45
                            event = MatchEvent(
                                match_id=match_id,
                                event_type=event_data.get('event_type', 'unknown'),
                                description=event_data.get('description'),
                                minute=raw_minute,
                                match_half='second_half',
                                is_highlight=event_data.get('is_highlight', False),
                                metadata={'ai_generated': True, 'pipeline': 'async', **event_data}
                            )
                            session.add(event)
                        session.commit()
                        total_events += len(events)
                        print(f"[ASYNC-PIPELINE] ✓ Second half: {len(events)} events saved")
                    finally:
                        session.close()
            
            _update_async_job(job_id, 'analyzing', 90, f'{total_events} eventos detectados', 
                            'analyzing', events_detected=total_events)
            
            # ========== PHASE 5: AUTO CLIPS (10%) ==========
            total_clips = 0
            if auto_clip and total_events > 0:
                _update_async_job(job_id, 'clipping', 90, 'Gerando clips...', 'clipping')
                
                # Get all events for clipping
                session = get_session()
                try:
                    all_events = session.query(MatchEvent).filter_by(match_id=match_id).all()
                    events_data = [e.to_dict() for e in all_events]
                    
                    # Extract clips for each half
                    for half_type, video_path in video_paths.items():
                        half_events = [e for e in events_data if e['match_half'] == f'{half_type}_half']
                        if half_events and os.path.exists(video_path):
                            try:
                                clips = extract_event_clips_auto(
                                    match_id=match_id,
                                    video_path=video_path if not os.path.islink(video_path) else os.readlink(video_path),
                                    events=half_events,
                                    half_type=half_type,
                                    home_team=home_team,
                                    away_team=away_team
                                )
                                total_clips += len(clips)
                                print(f"[ASYNC-PIPELINE] ✓ Clips {half_type}: {len(clips)}")
                            except Exception as e:
                                print(f"[ASYNC-PIPELINE] ⚠ Clip extraction error: {e}")
                finally:
                    session.close()
            
            # ========== COMPLETE ==========
            elapsed = time_module.time() - start_time
            print(f"\n{'='*60}")
            print(f"[ASYNC-PIPELINE] ✓ COMPLETE in {elapsed:.1f}s")
            print(f"[ASYNC-PIPELINE] Events: {total_events}, Clips: {total_clips}")
            print(f"{'='*60}")
            
            _update_async_job(job_id, 'complete', 100, 
                            f'Concluído: {total_events} eventos, {total_clips} clips',
                            'complete', total_parts, total_parts, parts_status,
                            events_detected=total_events, clips_generated=total_clips)
            
            # Update match status
            session = get_session()
            try:
                match = session.query(Match).filter_by(id=match_id).first()
                if match:
                    match.status = 'completed'
                    session.commit()
            finally:
                session.close()
            
    except Exception as e:
        print(f"[ASYNC-PIPELINE] ✗ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        _update_async_job(job_id, 'error', 0, str(e), 'error', error=str(e))


@app.route('/api/process-match-async', methods=['POST'])
def process_match_async():
    """
    Start async processing of a full match.
    Returns immediately with job_id for status polling.
    """
    data = request.json
    match_id = data.get('matchId')
    videos = data.get('videos', [])
    
    if not match_id:
        return jsonify({'error': 'matchId é obrigatório'}), 400
    
    if not videos:
        return jsonify({'error': 'Pelo menos um vídeo é obrigatório'}), 400
    
    # Create job in database
    job_id = str(uuid.uuid4())
    session = get_session()
    try:
        job = AnalysisJob(
            id=job_id,
            match_id=match_id,
            status='queued',
            stage='queued',
            progress=0,
            progress_message='Na fila de processamento...',
            started_at=datetime.utcnow()
        )
        session.add(job)
        session.commit()
    finally:
        session.close()
    
    # Initialize in-memory tracker
    async_processing_jobs[job_id] = {
        'jobId': job_id,
        'status': 'queued',
        'stage': 'queued',
        'progress': 0,
        'progressMessage': 'Iniciando...',
        'partsCompleted': 0,
        'totalParts': 0,
        'partsStatus': []
    }
    
    # Start background processing thread
    thread = threading.Thread(
        target=_process_match_pipeline,
        args=(job_id, data),
        daemon=True
    )
    thread.start()
    
    print(f"[ASYNC] Started job {job_id} for match {match_id}")
    
    return jsonify({
        'jobId': job_id,
        'status': 'queued',
        'message': 'Processamento iniciado em background'
    })


@app.route('/api/process-match-async/status/<job_id>', methods=['GET'])
def get_async_job_status(job_id):
    """Get detailed status of an async processing job."""
    # Check in-memory cache first (faster)
    if job_id in async_processing_jobs:
        return jsonify(async_processing_jobs[job_id])
    
    # Fallback to database
    session = get_session()
    try:
        job = session.query(AnalysisJob).filter_by(id=job_id).first()
        if not job:
            return jsonify({'error': 'Job não encontrado'}), 404
        
        return jsonify({
            'jobId': job.id,
            'status': job.status,
            'stage': job.stage or job.status,
            'progress': job.progress or 0,
            'progressMessage': job.progress_message or '',
            'partsCompleted': job.parts_completed or 0,
            'totalParts': job.total_parts or 0,
            'partsStatus': job.parts_status or [],
            'error': job.error_message
        })
    finally:
        session.close()


@app.route('/api/process-match-async/<job_id>', methods=['DELETE'])
def cancel_async_job(job_id):
    """Cancel an async processing job."""
    # Update status to cancelled
    session = get_session()
    try:
        job = session.query(AnalysisJob).filter_by(id=job_id).first()
        if job:
            job.status = 'error'
            job.error_message = 'Cancelado pelo usuário'
            session.commit()
        
        # Remove from in-memory tracker
        if job_id in async_processing_jobs:
            async_processing_jobs[job_id]['status'] = 'error'
            async_processing_jobs[job_id]['error'] = 'Cancelado pelo usuário'
        
        return jsonify({'success': True, 'message': 'Job cancelado'})
    finally:
        session.close()


# ============================================================================
# STORAGE CLEANUP
# ============================================================================

@app.route('/api/storage/cleanup-temp', methods=['POST', 'DELETE'])
def cleanup_temp_folders():
    """Remove all temp-* folders from storage directory."""
    try:
        if not os.path.exists(STORAGE_DIR):
            return jsonify({
                'success': True,
                'message': 'Storage directory does not exist',
                'deleted': [],
                'total_freed_mb': 0
            })
        
        deleted_folders = []
        total_freed_bytes = 0
        
        # Find all temp-* folders
        for item in os.listdir(STORAGE_DIR):
            if item.startswith('temp-') or item.startswith('temp_'):
                folder_path = os.path.join(STORAGE_DIR, item)
                if os.path.isdir(folder_path):
                    # Calculate folder size before deletion
                    folder_size = 0
                    for root, dirs, files in os.walk(folder_path):
                        for f in files:
                            try:
                                folder_size += os.path.getsize(os.path.join(root, f))
                            except:
                                pass
                    
                    # Delete the folder
                    try:
                        import shutil
                        shutil.rmtree(folder_path)
                        deleted_folders.append({
                            'name': item,
                            'size_mb': round(folder_size / (1024 * 1024), 2)
                        })
                        total_freed_bytes += folder_size
                        print(f"[CLEANUP] ✓ Deleted: {item} ({folder_size / (1024 * 1024):.2f} MB)")
                    except Exception as e:
                        print(f"[CLEANUP] ✗ Failed to delete {item}: {e}")
        
        total_freed_mb = round(total_freed_bytes / (1024 * 1024), 2)
        
        return jsonify({
            'success': True,
            'message': f'Deleted {len(deleted_folders)} temp folder(s)',
            'deleted': deleted_folders,
            'total_freed_mb': total_freed_mb
        })
    
    except Exception as e:
        print(f"[CLEANUP] Error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/storage/temp-folders', methods=['GET'])
def list_temp_folders():
    """List all temp-* folders in storage directory."""
    try:
        if not os.path.exists(STORAGE_DIR):
            return jsonify({'folders': [], 'total_size_mb': 0})
        
        temp_folders = []
        total_size = 0
        
        for item in os.listdir(STORAGE_DIR):
            if item.startswith('temp-') or item.startswith('temp_'):
                folder_path = os.path.join(STORAGE_DIR, item)
                if os.path.isdir(folder_path):
                    # Calculate folder size
                    folder_size = 0
                    file_count = 0
                    for root, dirs, files in os.walk(folder_path):
                        for f in files:
                            try:
                                folder_size += os.path.getsize(os.path.join(root, f))
                                file_count += 1
                            except:
                                pass
                    
                    temp_folders.append({
                        'name': item,
                        'path': folder_path,
                        'size_mb': round(folder_size / (1024 * 1024), 2),
                        'file_count': file_count
                    })
                    total_size += folder_size
        
        return jsonify({
            'folders': temp_folders,
            'total_size_mb': round(total_size / (1024 * 1024), 2),
            'count': len(temp_folders)
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================================================
# URL DOWNLOAD SYSTEM
# ============================================================================

def convert_to_direct_url(url: str) -> str:
    """Converte URLs de Google Drive, Dropbox, etc. para links diretos."""
    
    # Google Drive: /file/d/{ID}/view → /uc?export=download&id={ID}
    if 'drive.google.com' in url:
        match = re.search(r'/file/d/([a-zA-Z0-9_-]+)', url)
        if match:
            file_id = match.group(1)
            return f'https://drive.google.com/uc?export=download&id={file_id}&confirm=t'
    
    # Dropbox: ?dl=0 → ?dl=1
    if 'dropbox.com' in url:
        return url.replace('?dl=0', '?dl=1').replace('&dl=0', '&dl=1')
    
    # OneDrive: convert to direct download
    if 'onedrive.live.com' in url or '1drv.ms' in url:
        # Replace 'embed' or 'view' with 'download'
        return url.replace('embed', 'download').replace('view.aspx', 'download.aspx')
    
    return url


def download_video_with_progress(url: str, output_path: str, job_id: str, match_id: str, video_type: str):
    """Baixa vídeo com tracking de progresso."""
    try:
        # Converter URLs de serviços de nuvem para links diretos
        direct_url = convert_to_direct_url(url)
        print(f"[download-url] Job {job_id}: Baixando de {direct_url[:80]}...")
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        response = requests.get(direct_url, stream=True, timeout=60, headers=headers)
        response.raise_for_status()
        
        total_size = int(response.headers.get('content-length', 0))
        download_jobs[job_id]['total_bytes'] = total_size
        
        downloaded = 0
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=1024*1024):  # 1MB chunks
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    
                    # Atualizar progresso
                    if total_size > 0:
                        progress = int((downloaded / total_size) * 100)
                        download_jobs[job_id]['progress'] = progress
                    download_jobs[job_id]['bytes_downloaded'] = downloaded
        
        print(f"[download-url] Job {job_id}: Download completo ({downloaded / (1024*1024):.1f} MB)")
        
        # Verificar se o arquivo foi baixado
        if not os.path.exists(output_path) or os.path.getsize(output_path) < 1000:
            raise Exception("Arquivo baixado inválido ou vazio")
        
        # Detectar duração via ffprobe
        duration = None
        try:
            result = subprocess.run([
                'ffprobe', '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                output_path
            ], capture_output=True, text=True, timeout=30)
            if result.returncode == 0 and result.stdout.strip():
                duration = int(float(result.stdout.strip()))
        except Exception as e:
            print(f"[download-url] Não foi possível detectar duração: {e}")
        
        # Registrar vídeo no banco
        session = get_session()
        try:
            # Gerar URL de acesso
            base_url = get_base_url()
            filename = os.path.basename(output_path)
            file_url = f"{base_url}/api/storage/{match_id}/videos/{filename}"
            
            video = Video(
                match_id=match_id,
                file_url=file_url,
                file_name=filename,
                video_type=video_type,
                duration_seconds=duration,
                status='completed'
            )
            session.add(video)
            session.commit()
            
            download_jobs[job_id]['status'] = 'completed'
            download_jobs[job_id]['progress'] = 100
            download_jobs[job_id]['video'] = video.to_dict()
            download_jobs[job_id]['completed_at'] = datetime.now().isoformat()
            
            print(f"[download-url] Job {job_id}: Vídeo registrado no banco com ID {video.id}")
            
        finally:
            session.close()
            
    except Exception as e:
        download_jobs[job_id]['status'] = 'failed'
        download_jobs[job_id]['error'] = str(e)
        download_jobs[job_id]['completed_at'] = datetime.now().isoformat()
        print(f"[download-url] Job {job_id}: Erro: {e}")


@app.route('/api/storage/<match_id>/videos/download-url', methods=['POST'])
def download_video_from_url_endpoint(match_id: str):
    """
    Baixa um vídeo de uma URL diretamente para o storage da partida.
    Executa em background com acompanhamento de progresso.
    """
    data = request.json or {}
    url = data.get('url')
    video_type = data.get('video_type', 'full')
    filename = data.get('filename')
    
    # Validações
    if not url:
        return jsonify({'error': 'URL é obrigatória'}), 400
    
    # Gerar job_id para acompanhamento
    job_id = str(uuid.uuid4())[:8]
    
    # Detectar nome do arquivo da URL se não fornecido
    if not filename:
        from urllib.parse import urlparse, unquote
        parsed = urlparse(url)
        path_filename = unquote(parsed.path.split('/')[-1])
        if path_filename and '.' in path_filename:
            filename = path_filename
        else:
            filename = f'video_{job_id}.mp4'
    
    # Garantir extensão de vídeo
    valid_extensions = ('.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v')
    if not any(filename.lower().endswith(ext) for ext in valid_extensions):
        filename += '.mp4'
    
    # Caminho de destino
    videos_folder = get_video_subfolder_path(match_id, 'videos')
    output_path = str(videos_folder / filename)
    
    # Inicializar job de download
    download_jobs[job_id] = {
        'status': 'downloading',
        'progress': 0,
        'match_id': match_id,
        'url': url,
        'filename': filename,
        'output_path': output_path,
        'video_type': video_type,
        'started_at': datetime.now().isoformat(),
        'bytes_downloaded': 0,
        'total_bytes': None,
        'error': None,
        'video': None,
        'completed_at': None
    }
    
    # Executar download em background
    thread = threading.Thread(
        target=download_video_with_progress, 
        args=(url, output_path, job_id, match_id, video_type),
        daemon=True
    )
    thread.start()
    
    print(f"[download-url] Job {job_id} iniciado para partida {match_id}")
    
    return jsonify({
        'job_id': job_id,
        'status': 'downloading',
        'filename': filename,
        'message': 'Download iniciado em background'
    })


@app.route('/api/storage/download-status/<job_id>', methods=['GET'])
def get_download_status(job_id: str):
    """Retorna status de um job de download."""
    if job_id not in download_jobs:
        return jsonify({'error': 'Job não encontrado'}), 404
    
    job = download_jobs[job_id]
    return jsonify({
        'job_id': job_id,
        'status': job['status'],
        'progress': job['progress'],
        'bytes_downloaded': job['bytes_downloaded'],
        'total_bytes': job['total_bytes'],
        'filename': job['filename'],
        'error': job.get('error'),
        'video': job.get('video'),
        'started_at': job.get('started_at'),
        'completed_at': job.get('completed_at')
    })


@app.route('/api/storage/download-jobs', methods=['GET'])
def list_download_jobs():
    """Lista todos os jobs de download."""
    match_id = request.args.get('match_id')
    
    jobs_list = []
    for job_id, job in download_jobs.items():
        if match_id and job.get('match_id') != match_id:
            continue
        jobs_list.append({
            'job_id': job_id,
            'status': job['status'],
            'progress': job['progress'],
            'filename': job['filename'],
            'match_id': job.get('match_id'),
            'started_at': job.get('started_at'),
            'completed_at': job.get('completed_at')
        })
    
    return jsonify({
        'jobs': jobs_list,
        'count': len(jobs_list)
        })


@app.route('/api/detect-cloudflare', methods=['GET'])
def detect_cloudflare():
    """
    Detecta automaticamente a URL do túnel Cloudflare ativo.
    O cloudflared expõe métricas em http://127.0.0.1:33880/metrics ou 
    podemos checar as conexões ativas via arquivo de log ou API.
    
    Como fallback, tentamos detectar a URL do túnel via conexões de rede.
    """
    try:
        # Método 1: Tentar verificar se o processo cloudflared está rodando
        # e capturar a URL do log ou da saída
        import subprocess
        
        # Tenta encontrar a URL do túnel via processo cloudflared
        try:
            # No Windows
            result = subprocess.run(
                ['tasklist', '/FI', 'IMAGENAME eq cloudflared.exe'],
                capture_output=True,
                text=True,
                timeout=5
            )
            cloudflared_running = 'cloudflared.exe' in result.stdout
        except:
            # No Linux/Mac
            try:
                result = subprocess.run(
                    ['pgrep', '-f', 'cloudflared'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                cloudflared_running = len(result.stdout.strip()) > 0
            except:
                cloudflared_running = False
        
        if not cloudflared_running:
            return jsonify({
                'success': False,
                'error': 'Cloudflared não está rodando. Inicie com: cloudflared tunnel --url http://localhost:5000'
            })
        
        # Método 2: Tentar ler a URL do arquivo de conexão temporário
        # O cloudflared cria arquivos em ~/.cloudflared/ ou no diretório atual
        possible_paths = [
            os.path.expanduser('~/.cloudflared/'),
            os.path.join(os.getcwd(), '.cloudflared/'),
            tempfile.gettempdir()
        ]
        
        tunnel_url = None
        
        # Método 3: Tentar acessar as métricas do cloudflared (porta padrão 33880)
        try:
            metrics_response = requests.get('http://127.0.0.1:33880/ready', timeout=2)
            if metrics_response.status_code == 200:
                # cloudflared está pronto, mas não temos a URL diretamente das métricas
                pass
        except:
            pass
        
        # Método 4: Fazer uma requisição de teste para o próprio servidor e ver o header
        # Isso não funciona bem para auto-detecção
        
        # Por enquanto, retornamos que o cloudflared está rodando mas não conseguimos detectar a URL
        # O usuário precisa copiar a URL manualmente da saída do cloudflared
        return jsonify({
            'success': False,
            'running': True,
            'error': 'Cloudflared detectado, mas a URL não pode ser obtida automaticamente. '
                     'Copie a URL exibida no terminal onde o cloudflared está rodando '
                     '(formato: https://xxxxx.trycloudflare.com)',
            'hint': 'Execute: cloudflared tunnel --url http://localhost:5000 e copie a URL gerada'
        })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Erro ao detectar cloudflared: {str(e)}'
        })

# ============================================================================
# UNIFIED SETTINGS ENDPOINT
# ============================================================================

@app.route('/api/settings', methods=['GET'])
def get_all_settings():
    """Retorna todas as configurações para o frontend de forma unificada."""
    from database import get_database_path, get_base_dir
    
    # Provider status
    gemini_configured = bool(ai_services.GOOGLE_API_KEY) and ai_services.GEMINI_ENABLED
    openai_configured = bool(ai_services.OPENAI_API_KEY) and ai_services.OPENAI_ENABLED
    elevenlabs_configured = bool(ai_services.ELEVENLABS_API_KEY) and ai_services.ELEVENLABS_ENABLED
    lovable_configured = bool(ai_services.LOVABLE_API_KEY)
    ollama_configured = ai_services.OLLAMA_ENABLED
    
    # Capabilities
    has_transcription = elevenlabs_configured or openai_configured or gemini_configured or lovable_configured
    has_analysis = lovable_configured or gemini_configured or openai_configured or ollama_configured
    
    return jsonify({
        'providers': {
            'gemini': {
                'enabled': ai_services.GEMINI_ENABLED,
                'configured': gemini_configured,
                'keySet': bool(ai_services.GOOGLE_API_KEY),
                'keyPreview': (ai_services.GOOGLE_API_KEY[:8] + '...') if ai_services.GOOGLE_API_KEY else None
            },
            'openai': {
                'enabled': ai_services.OPENAI_ENABLED,
                'configured': openai_configured,
                'keySet': bool(ai_services.OPENAI_API_KEY),
                'keyPreview': (ai_services.OPENAI_API_KEY[:8] + '...') if ai_services.OPENAI_API_KEY else None
            },
            'elevenlabs': {
                'enabled': ai_services.ELEVENLABS_ENABLED,
                'configured': elevenlabs_configured,
                'keySet': bool(ai_services.ELEVENLABS_API_KEY)
            },
            'lovable': {
                'enabled': True,
                'configured': lovable_configured,
                'keySet': lovable_configured
            },
            'ollama': {
                'enabled': ai_services.OLLAMA_ENABLED,
                'configured': ollama_configured,
                'url': ai_services.OLLAMA_URL if ollama_configured else None,
                'model': ai_services.OLLAMA_MODEL if ollama_configured else None
            }
        },
        'capabilities': {
            'transcription': has_transcription,
            'analysis': has_analysis,
            'tts': openai_configured,
            'vision': gemini_configured or openai_configured
        },
        'storage': {
            'baseDir': get_base_dir(),
            'database': get_database_path(),
            'storageDir': str(STORAGE_DIR.absolute())
        }
    })


# ============================================================================
# TRANSCRIPTION JOBS ENDPOINTS  
# ============================================================================

# In-memory transcription jobs (for fast access, DB for persistence)
transcription_jobs = {}


@app.route('/api/transcription-jobs', methods=['POST'])
def create_transcription_job():
    """Cria um novo job de transcrição assíncrono."""
    from models import TranscriptionJob
    
    data = request.json or {}
    match_id = data.get('match_id')
    video_id = data.get('video_id')
    video_path = data.get('video_path')
    
    if not match_id or not video_path:
        return jsonify({'error': 'match_id and video_path are required'}), 400
    
    session = get_session()
    try:
        # Create job in database
        job = TranscriptionJob(
            match_id=match_id,
            video_id=video_id,
            video_path=video_path,
            status='queued',
            progress=0,
            current_step='Aguardando na fila...'
        )
        session.add(job)
        session.commit()
        
        job_data = job.to_dict()
        job_id = job.id
        
        # Store in memory for fast access
        transcription_jobs[job_id] = {
            'id': job_id,
            'status': 'queued',
            'progress': 0,
            'current_step': 'Aguardando na fila...',
            'match_id': match_id,
            'video_id': video_id,
            'video_path': video_path
        }
        
        # Start processing in background thread
        def process_job():
            _process_transcription_job(job_id, match_id, video_path)
        
        thread = threading.Thread(target=process_job, daemon=True)
        thread.start()
        
        return jsonify(job_data), 201
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        session.close()


@app.route('/api/transcription-jobs/<job_id>', methods=['GET'])
def get_transcription_job(job_id: str):
    """Retorna status de um job de transcrição."""
    from models import TranscriptionJob
    
    # First check in-memory for fast response
    if job_id in transcription_jobs:
        return jsonify(transcription_jobs[job_id])
    
    # Fallback to database
    session = get_session()
    try:
        job = session.query(TranscriptionJob).filter_by(id=job_id).first()
        if not job:
            return jsonify({'error': 'Job not found'}), 404
        return jsonify(job.to_dict())
    finally:
        session.close()


def _process_transcription_job(job_id: str, match_id: str, video_path: str):
    """Processa um job de transcrição em background."""
    from models import TranscriptionJob
    import time
    
    def update_job(status=None, progress=None, current_step=None, **kwargs):
        if job_id in transcription_jobs:
            if status:
                transcription_jobs[job_id]['status'] = status
            if progress is not None:
                transcription_jobs[job_id]['progress'] = progress
            if current_step:
                transcription_jobs[job_id]['current_step'] = current_step
            transcription_jobs[job_id].update(kwargs)
        
        # Update database
        session = get_session()
        try:
            job = session.query(TranscriptionJob).filter_by(id=job_id).first()
            if job:
                if status:
                    job.status = status
                if progress is not None:
                    job.progress = progress
                if current_step:
                    job.current_step = current_step
                for key, value in kwargs.items():
                    if hasattr(job, key):
                        setattr(job, key, value)
                session.commit()
        except Exception as e:
            print(f"[TranscriptionJob] Error updating job: {e}")
            session.rollback()
        finally:
            session.close()
    
    try:
        update_job(status='processing', progress=5, current_step='Iniciando transcrição...', started_at=datetime.now().isoformat())
        
        # Check if file exists
        if not os.path.exists(video_path):
            update_job(status='failed', error_message=f'Arquivo não encontrado: {video_path}')
            return
        
        update_job(progress=10, current_step='Extraindo áudio...')
        
        # Use ai_services to transcribe
        result = ai_services.transcribe_audio_from_video(video_path, match_id=match_id)
        
        if result.get('success'):
            update_job(
                status='completed',
                progress=100,
                current_step='Transcrição concluída!',
                srt_content=result.get('srtContent'),
                plain_text=result.get('text'),
                provider_used=result.get('provider', 'unknown'),
                completed_at=datetime.now().isoformat()
            )
            
            # Save to storage
            if result.get('srtContent'):
                save_file(match_id, 'srt', result['srtContent'].encode('utf-8'), 'transcription.srt')
            if result.get('text'):
                save_file(match_id, 'texts', result['text'].encode('utf-8'), 'transcription.txt')
        else:
            update_job(
                status='failed',
                error_message=result.get('error', 'Erro desconhecido na transcrição')
            )
    except Exception as e:
        print(f"[TranscriptionJob] Exception: {e}")
        update_job(status='failed', error_message=str(e))


# ============================================================================
# FINALIZE LIVE MATCH CLIPS
# ============================================================================

@app.route('/api/finalize-live-clips', methods=['POST'])
def finalize_live_clips():
    """
    Finaliza clips de uma partida ao vivo.
    
    Este endpoint:
    1. Busca todos os eventos da partida que não têm clip
    2. Vincula os eventos ao vídeo final
    3. Extrai clips de cada evento usando o vídeo salvo
    
    Input JSON:
    - matchId: ID da partida
    - videoId: ID do vídeo final
    """
    data = request.json or {}
    match_id = data.get('matchId')
    video_id = data.get('videoId')
    
    if not match_id:
        return jsonify({'success': False, 'error': 'matchId is required'}), 400
    
    session = get_session()
    errors = []
    events_linked = 0
    clips_generated = 0
    
    try:
        # Get the video
        video = None
        if video_id:
            video = session.query(Video).filter_by(id=video_id).first()
        
        if not video:
            # Try to find the video for this match
            video = session.query(Video).filter_by(
                match_id=match_id
            ).filter(
                Video.status == 'completed',
                Video.file_url.isnot(None)
            ).first()
        
        if not video:
            return jsonify({
                'success': False, 
                'error': 'No completed video found for this match'
            }), 404
        
        # Get all events for this match
        events = session.query(MatchEvent).filter_by(match_id=match_id).all()
        
        if not events:
            return jsonify({
                'success': True,
                'eventsLinked': 0,
                'clipsGenerated': 0,
                'errors': ['No events found for this match']
            })
        
        # Get video path
        video_path = None
        if video.file_url:
            # Try local path first
            if video.file_url.startswith('/') and os.path.exists(video.file_url):
                video_path = video.file_url
            elif '/api/storage/' in video.file_url:
                # Extract path from URL
                parts = video.file_url.split('/api/storage/')
                if len(parts) > 1:
                    rel_path = parts[1]
                    video_path = str(STORAGE_DIR / rel_path)
            
            # Resolve symlinks
            if video_path and os.path.islink(video_path):
                video_path = os.path.realpath(video_path)
        
        if not video_path or not os.path.exists(video_path):
            return jsonify({
                'success': False,
                'error': f'Video file not found: {video.file_url}'
            }), 404
        
        # Get match info
        match = session.query(Match).filter_by(id=match_id).first()
        home_team = None
        away_team = None
        
        if match:
            if match.home_team:
                home_team = match.home_team.name
            if match.away_team:
                away_team = match.away_team.name
        
        # Prepare events for clip extraction
        events_to_clip = []
        for event in events:
            # Link event to video if not linked
            if not event.video_id:
                event.video_id = video.id
                events_linked += 1
            
            # Check if clip already exists
            if event.clip_url and not event.clip_pending:
                continue
            
            # Prepare event data for extraction
            metadata = event.metadata or {}
            event_data = {
                'id': event.id,
                'minute': event.minute or 0,
                'second': event.second or 0,
                'event_type': event.event_type,
                'description': event.description or '',
                'eventMs': metadata.get('eventMs'),
                'videoSecond': metadata.get('videoSecond'),
                'recordingTimestamp': metadata.get('eventMs', (event.minute or 0) * 60 + (event.second or 0) * 1000) / 1000
            }
            events_to_clip.append(event_data)
        
        session.commit()
        
        # Sort events by time
        events_to_clip.sort(key=lambda e: e.get('recordingTimestamp', 0))
        
        print(f"[LiveClips] Processing {len(events_to_clip)} events for clips")
        
        # Extract clips
        for event_data in events_to_clip:
            try:
                event_id = event_data['id']
                minute = event_data['minute']
                second = event_data['second']
                event_type = event_data['event_type']
                description = event_data['description']
                
                # Calculate start time (use recordingTimestamp if available)
                recording_ts = event_data.get('recordingTimestamp', minute * 60 + second)
                start_seconds = max(0, recording_ts - 3.0)  # 3 second pre-buffer
                duration = 10.0  # 3s before + 7s after
                
                # Determine half type
                half_type = 'first_half' if minute < 45 else 'second_half'
                
                # Generate filename
                team_short = None
                if home_team and home_team.lower() in description.lower():
                    team_short = home_team[:3].upper()
                elif away_team and away_team.lower() in description.lower():
                    team_short = away_team[:3].upper()
                
                filename = f"{minute:02d}min-{event_type}"
                if team_short:
                    filename += f"-{team_short}"
                filename += ".mp4"
                
                # Get clip path
                clip_folder = get_clip_subfolder_path(match_id, half_type.replace('_half', ''))
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
                    # Apply subtitles if possible
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
                        os.replace(subtitled_path, clip_path)
                    
                    # Generate clip URL
                    clip_url = f"http://localhost:5000/api/storage/{match_id}/clips/{half_type}/{filename}"
                    
                    # Update event in database
                    db_event = session.query(MatchEvent).filter_by(id=event_id).first()
                    if db_event:
                        db_event.clip_url = clip_url
                        db_event.clip_pending = False
                        session.commit()
                    
                    clips_generated += 1
                    print(f"[LiveClips] ✓ Generated clip: {filename}")
                else:
                    errors.append(f"Failed to extract clip for event {event_id}: {result.stderr[:200] if result.stderr else 'unknown error'}")
                    
            except Exception as e:
                errors.append(f"Error processing event: {str(e)}")
                continue
        
        return jsonify({
            'success': True,
            'eventsLinked': events_linked,
            'clipsGenerated': clips_generated,
            'errors': errors
        })
        
    except Exception as e:
        print(f"[LiveClips] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e),
            'eventsLinked': events_linked,
            'clipsGenerated': clips_generated,
            'errors': errors
        }), 500
    finally:
        session.close()


# ============================================================================
# ANALYZE LIVE MATCH - Full Pipeline Post-Live
# ============================================================================

@app.route('/api/analyze-live-match', methods=['POST'])
def analyze_live_match():
    """
    Pipeline completo de análise pós-transmissão ao vivo.
    
    Este endpoint executa o fluxo Arena Play completo:
    1. Transcreve o vídeo gravado usando IA
    2. Analisa a transcrição para detectar eventos (gols, cartões, faltas, etc.)
    3. Gera clips de vídeo para cada evento detectado
    4. Atualiza o placar e status da partida
    
    Input JSON:
    - matchId: ID da partida
    - videoId: ID do vídeo final
    - homeTeam: Nome do time da casa
    - awayTeam: Nome do time visitante
    
    Returns:
    {
        "success": true,
        "eventsDetected": 25,
        "clipsGenerated": 25,
        "homeScore": 2,
        "awayScore": 1,
        "transcription": "...",
        "errors": []
    }
    """
    data = request.json or {}
    match_id = data.get('matchId')
    video_id = data.get('videoId')
    home_team = data.get('homeTeam', 'Time Casa')
    away_team = data.get('awayTeam', 'Time Fora')
    
    if not match_id:
        return jsonify({'success': False, 'error': 'matchId is required'}), 400
    
    session = get_session()
    errors = []
    events_detected = 0
    clips_generated = 0
    home_score = 0
    away_score = 0
    transcription = None
    
    print(f"\n{'='*70}")
    print(f"[LIVE-ANALYSIS] Pipeline de Análise Pós-Live Iniciado")
    print(f"[LIVE-ANALYSIS] Match ID: {match_id}")
    print(f"[LIVE-ANALYSIS] Video ID: {video_id}")
    print(f"[LIVE-ANALYSIS] Teams: {home_team} vs {away_team}")
    print(f"{'='*70}\n")
    
    try:
        # Get the video
        video = None
        if video_id:
            video = session.query(Video).filter_by(id=video_id).first()
        
        if not video:
            # Try to find the video for this match
            video = session.query(Video).filter_by(
                match_id=match_id
            ).filter(
                Video.status == 'completed',
                Video.file_url.isnot(None)
            ).order_by(Video.created_at.desc()).first()
        
        if not video:
            return jsonify({
                'success': False, 
                'error': 'No completed video found for this match'
            }), 404
        
        # Get video path
        video_path = None
        if video.file_url:
            if video.file_url.startswith('/') and os.path.exists(video.file_url):
                video_path = video.file_url
            elif '/api/storage/' in video.file_url:
                parts = video.file_url.split('/api/storage/')
                if len(parts) > 1:
                    rel_path = parts[1]
                    video_path = str(STORAGE_DIR / rel_path)
            
            if video_path and os.path.islink(video_path):
                video_path = os.path.realpath(video_path)
        
        if not video_path or not os.path.exists(video_path):
            return jsonify({
                'success': False,
                'error': f'Video file not found at path: {video_path}'
            }), 404
        
        print(f"[LIVE-ANALYSIS] Video path: {video_path}")
        
        # ════════════════════════════════════════════════════════════════
        # FASE 1: TRANSCRIÇÃO
        # ════════════════════════════════════════════════════════════════
        print(f"\n[LIVE-ANALYSIS] ═══ FASE 1: TRANSCRIÇÃO ═══")
        
        transcription_result = ai_services.transcribe_audio_from_video(
            video_path, 
            match_id=match_id
        )
        
        if not transcription_result.get('success'):
            errors.append(f"Transcription failed: {transcription_result.get('error', 'Unknown error')}")
            return jsonify({
                'success': False,
                'error': 'Transcription failed',
                'eventsDetected': 0,
                'clipsGenerated': 0,
                'homeScore': 0,
                'awayScore': 0,
                'errors': errors
            }), 500
        
        transcription = transcription_result.get('text', '')
        srt_content = transcription_result.get('srtContent', '')
        
        print(f"[LIVE-ANALYSIS] Transcription complete: {len(transcription)} characters")
        
        # Save transcription files
        if transcription:
            save_file(match_id, 'texts', transcription.encode('utf-8'), 'live_transcription.txt')
        if srt_content:
            save_file(match_id, 'srt', srt_content.encode('utf-8'), 'live_transcription.srt')
        
        # ════════════════════════════════════════════════════════════════
        # FASE 2: ANÁLISE DE EVENTOS
        # ════════════════════════════════════════════════════════════════
        print(f"\n[LIVE-ANALYSIS] ═══ FASE 2: ANÁLISE DE EVENTOS ═══")
        
        # Get video duration for time range
        duration_seconds = video.duration_seconds or 5400  # 90 min default
        
        # Clear only auto-detected events, preserve manual events
        manual_sources = ['manual', 'live-manual', 'live-approved']
        existing_events = session.query(MatchEvent).filter_by(match_id=match_id).all()
        preserved_count = 0
        deleted_count = 0
        for ev in existing_events:
            metadata = ev.metadata or {}
            source = metadata.get('source', '') if isinstance(metadata, dict) else ''
            # Preserve manual events, delete only auto-detected
            if source in manual_sources:
                preserved_count += 1
            else:
                session.delete(ev)
                deleted_count += 1
        session.commit()
        print(f"[LIVE-ANALYSIS] Deleted {deleted_count} auto-detected events, preserved {preserved_count} manual events")
        
        # Analyze transcription
        analysis_result = ai_services.analyze_match_transcription(
            transcription=transcription,
            home_team=home_team,
            away_team=away_team,
            start_minute=0,
            end_minute=90
        )
        
        if not analysis_result.get('success'):
            errors.append(f"Analysis failed: {analysis_result.get('error', 'Unknown error')}")
            return jsonify({
                'success': False,
                'error': 'Analysis failed',
                'eventsDetected': 0,
                'clipsGenerated': 0,
                'homeScore': 0,
                'awayScore': 0,
                'transcription': transcription[:1000] if transcription else None,
                'errors': errors
            }), 500
        
        events = analysis_result.get('events', [])
        home_score = analysis_result.get('homeScore', 0)
        away_score = analysis_result.get('awayScore', 0)
        events_detected = len(events)
        
        print(f"[LIVE-ANALYSIS] Events detected: {events_detected}")
        print(f"[LIVE-ANALYSIS] Score: {home_team} {home_score} x {away_score} {away_team}")
        
        # ════════════════════════════════════════════════════════════════
        # FASE 3: INSERIR EVENTOS NO BANCO
        # ════════════════════════════════════════════════════════════════
        print(f"\n[LIVE-ANALYSIS] ═══ FASE 3: INSERINDO EVENTOS ═══")
        
        for event in events:
            minute = event.get('minute', 0)
            match_half = 'first_half' if minute < 45 else 'second_half'
            
            db_event = MatchEvent(
                match_id=match_id,
                video_id=video.id,
                event_type=event.get('type', 'unknown'),
                minute=minute,
                second=event.get('second', 0),
                description=event.get('description', ''),
                match_half=match_half,
                clip_pending=True,
                is_highlight=event.get('type') in ['goal', 'red_card', 'penalty'],
                metadata=event.get('metadata', {})
            )
            session.add(db_event)
        
        session.commit()
        print(f"[LIVE-ANALYSIS] Inserted {events_detected} events")
        
        # Link orphan events (without video_id) to the final video
        orphan_events = session.query(MatchEvent).filter_by(
            match_id=match_id, 
            video_id=None
        ).all()
        for ev in orphan_events:
            ev.video_id = video.id
        if orphan_events:
            session.commit()
            print(f"[LIVE-ANALYSIS] Linked {len(orphan_events)} orphan events to video {video.id[:8]}")
        
        # ════════════════════════════════════════════════════════════════
        # FASE 4: GERAR CLIPS
        # ════════════════════════════════════════════════════════════════
        print(f"\n[LIVE-ANALYSIS] ═══ FASE 4: GERANDO CLIPS ═══")
        
        # Get ALL events with clip_pending=True (includes preserved manual events)
        db_events = session.query(MatchEvent).filter_by(
            match_id=match_id,
            clip_pending=True
        ).all()
        print(f"[LIVE-ANALYSIS] Found {len(db_events)} events needing clips")
        
        for db_event in db_events:
            try:
                minute = db_event.minute or 0
                second = db_event.second or 0
                
                # Calculate timestamp in seconds
                # For live recordings, use absolute time from start
                event_seconds = minute * 60 + second
                start_seconds = max(0, event_seconds - 3.0)  # 3 second pre-buffer
                duration = 10.0
                
                half_type = db_event.match_half or ('first_half' if minute < 45 else 'second_half')
                
                # Generate filename
                team_short = None
                if home_team and home_team.lower() in (db_event.description or '').lower():
                    team_short = home_team[:3].upper()
                elif away_team and away_team.lower() in (db_event.description or '').lower():
                    team_short = away_team[:3].upper()
                
                filename = f"{minute:02d}min-{db_event.event_type}"
                if team_short:
                    filename += f"-{team_short}"
                filename += f"-{db_event.id[:8]}.mp4"
                
                # Get clip path
                clip_folder = get_clip_subfolder_path(match_id, half_type.replace('_half', ''))
                clip_path = str(clip_folder / filename)
                
                # Extract clip
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
                    # Apply subtitles
                    subtitled_path = clip_path.replace('.mp4', '_sub.mp4')
                    team_name = None
                    if home_team and home_team.lower() in (db_event.description or '').lower():
                        team_name = home_team
                    elif away_team and away_team.lower() in (db_event.description or '').lower():
                        team_name = away_team
                    
                    if add_subtitles_to_clip(
                        clip_path, subtitled_path,
                        db_event.description or '', minute, db_event.event_type, team_name
                    ):
                        os.replace(subtitled_path, clip_path)
                    
                    # Update event with clip URL
                    clip_url = f"http://localhost:5000/api/storage/{match_id}/clips/{half_type.replace('_half', '')}/{filename}"
                    db_event.clip_url = clip_url
                    db_event.clip_pending = False
                    session.commit()
                    
                    clips_generated += 1
                    print(f"[LIVE-ANALYSIS] ✓ Clip: {filename}")
                else:
                    errors.append(f"Failed to generate clip for event {db_event.id[:8]}")
                    
            except Exception as e:
                errors.append(f"Clip error: {str(e)}")
                continue
        
        # ════════════════════════════════════════════════════════════════
        # FASE 5: ATUALIZAR PARTIDA
        # ════════════════════════════════════════════════════════════════
        print(f"\n[LIVE-ANALYSIS] ═══ FASE 5: ATUALIZANDO PARTIDA ═══")
        
        match = session.query(Match).filter_by(id=match_id).first()
        if match:
            match.home_score = home_score
            match.away_score = away_score
            match.status = 'analyzed'
            match.updated_at = datetime.now().isoformat()
            session.commit()
            print(f"[LIVE-ANALYSIS] Match updated: {home_score} x {away_score}, status=analyzed")
        
        # Create/update analysis job
        analysis_job = session.query(AnalysisJob).filter_by(match_id=match_id).first()
        if not analysis_job:
            analysis_job = AnalysisJob(match_id=match_id)
            session.add(analysis_job)
        
        analysis_job.status = 'completed'
        analysis_job.progress = 100
        analysis_job.current_step = 'Análise pós-live concluída'
        analysis_job.completed_at = datetime.now().isoformat()
        analysis_job.result = {
            'eventsDetected': events_detected,
            'clipsGenerated': clips_generated,
            'homeScore': home_score,
            'awayScore': away_score,
            'source': 'live_analysis',
            'transcriptionLength': len(transcription) if transcription else 0
        }
        session.commit()
        
        print(f"\n{'='*70}")
        print(f"[LIVE-ANALYSIS] ✓ Pipeline Concluído!")
        print(f"[LIVE-ANALYSIS] Eventos: {events_detected} | Clips: {clips_generated}")
        print(f"[LIVE-ANALYSIS] Placar: {home_team} {home_score} x {away_score} {away_team}")
        print(f"{'='*70}\n")
        
        return jsonify({
            'success': True,
            'eventsDetected': events_detected,
            'clipsGenerated': clips_generated,
            'homeScore': home_score,
            'awayScore': away_score,
            'transcription': transcription[:2000] if transcription else None,
            'errors': errors
        })
        
    except Exception as e:
        print(f"[LIVE-ANALYSIS] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e),
            'eventsDetected': events_detected,
            'clipsGenerated': clips_generated,
            'homeScore': home_score,
            'awayScore': away_score,
            'errors': errors
        }), 500
    finally:
        session.close()


# ============================================================================
# ADMIN API ENDPOINTS
# ============================================================================

# ============== Organizations ==============
@app.route('/api/admin/organizations', methods=['GET'])
def get_organizations():
    """List all organizations."""
    session = get_session()
    try:
        orgs = session.query(Organization).order_by(Organization.created_at.desc()).all()
        return jsonify([org.to_dict() for org in orgs])
    finally:
        session.close()


@app.route('/api/admin/organizations', methods=['POST'])
def create_organization():
    """Create a new organization."""
    session = get_session()
    try:
        data = request.get_json()
        
        org = Organization(
            name=data['name'],
            slug=data['slug'],
            logo_url=data.get('logo_url'),
            owner_id=data.get('owner_id'),
            plan_id=data.get('plan_id'),
            credits_balance=data.get('credits_balance', 0),
            credits_monthly_quota=data.get('credits_monthly_quota', 50),
            storage_limit_bytes=data.get('storage_limit_bytes', 5368709120),
            is_active=data.get('is_active', True)
        )
        
        session.add(org)
        session.commit()
        
        return jsonify(org.to_dict()), 201
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


@app.route('/api/admin/organizations/<org_id>', methods=['PUT'])
def update_organization(org_id):
    """Update an organization."""
    session = get_session()
    try:
        org = session.query(Organization).filter_by(id=org_id).first()
        if not org:
            return jsonify({'error': 'Organization not found'}), 404
        
        data = request.get_json()
        
        for key in ['name', 'slug', 'logo_url', 'owner_id', 'plan_id', 
                    'credits_balance', 'credits_monthly_quota', 'storage_used_bytes',
                    'storage_limit_bytes', 'is_active', 'stripe_customer_id', 
                    'stripe_subscription_id']:
            if key in data:
                setattr(org, key, data[key])
        
        org.updated_at = datetime.utcnow()
        session.commit()
        
        return jsonify(org.to_dict())
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


@app.route('/api/admin/organizations/<org_id>', methods=['DELETE'])
def delete_organization(org_id):
    """Delete an organization."""
    session = get_session()
    try:
        org = session.query(Organization).filter_by(id=org_id).first()
        if not org:
            return jsonify({'error': 'Organization not found'}), 404
        
        session.delete(org)
        session.commit()
        
        return jsonify({'success': True, 'message': 'Organization deleted'})
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


# ============== Subscription Plans ==============
@app.route('/api/admin/subscription-plans', methods=['GET'])
def get_subscription_plans():
    """List all subscription plans."""
    session = get_session()
    try:
        plans = session.query(SubscriptionPlan).order_by(SubscriptionPlan.sort_order).all()
        return jsonify([plan.to_dict() for plan in plans])
    finally:
        session.close()


@app.route('/api/admin/subscription-plans', methods=['POST'])
def create_subscription_plan():
    """Create a new subscription plan."""
    session = get_session()
    try:
        data = request.get_json()
        
        # Get next sort order
        max_order = session.query(SubscriptionPlan).count()
        
        plan = SubscriptionPlan(
            name=data['name'],
            slug=data['slug'],
            price_monthly=data.get('price_monthly', 0),
            price_yearly=data.get('price_yearly'),
            credits_per_month=data.get('credits_per_month', 50),
            max_users=data.get('max_users', 1),
            max_matches_per_month=data.get('max_matches_per_month'),
            storage_limit_bytes=data.get('storage_limit_bytes', 5368709120),
            features=data.get('features', []),
            stripe_price_id_monthly=data.get('stripe_price_id_monthly'),
            stripe_price_id_yearly=data.get('stripe_price_id_yearly'),
            is_active=data.get('is_active', True),
            sort_order=max_order + 1
        )
        
        session.add(plan)
        session.commit()
        
        return jsonify(plan.to_dict()), 201
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


@app.route('/api/admin/subscription-plans/<plan_id>', methods=['PUT'])
def update_subscription_plan(plan_id):
    """Update a subscription plan."""
    session = get_session()
    try:
        plan = session.query(SubscriptionPlan).filter_by(id=plan_id).first()
        if not plan:
            return jsonify({'error': 'Plan not found'}), 404
        
        data = request.get_json()
        
        for key in ['name', 'slug', 'price_monthly', 'price_yearly', 'credits_per_month',
                    'max_users', 'max_matches_per_month', 'storage_limit_bytes', 'features',
                    'stripe_price_id_monthly', 'stripe_price_id_yearly', 'is_active', 'sort_order']:
            if key in data:
                setattr(plan, key, data[key])
        
        session.commit()
        
        return jsonify(plan.to_dict())
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


# ============== Admin Users ==============
@app.route('/api/admin/users', methods=['GET'])
def get_admin_users():
    """List all users with their profiles and roles."""
    session = get_session()
    try:
        profiles = session.query(Profile).order_by(Profile.created_at.desc()).all()
        roles = session.query(UserRole).all()
        
        # Create role lookup
        role_map = {r.user_id: r.role for r in roles}
        
        users = []
        for profile in profiles:
            user_dict = profile.to_dict()
            user_dict['role'] = role_map.get(profile.user_id, 'user')
            users.append(user_dict)
        
        return jsonify(users)
    finally:
        session.close()


@app.route('/api/admin/users/<user_id>/role', methods=['PUT'])
def update_user_role(user_id):
    """Update a user's role."""
    session = get_session()
    try:
        data = request.get_json()
        new_role = data.get('role', 'user')
        
        # Find existing role
        role = session.query(UserRole).filter_by(user_id=user_id).first()
        
        if role:
            role.role = new_role
        else:
            role = UserRole(user_id=user_id, role=new_role)
            session.add(role)
        
        session.commit()
        
        return jsonify({'success': True, 'user_id': user_id, 'role': new_role})
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


@app.route('/api/admin/users/<user_id>/organization', methods=['PUT'])
def update_user_organization(user_id):
    """Update a user's organization."""
    session = get_session()
    try:
        data = request.get_json()
        org_id = data.get('organization_id')
        
        # Update profile
        profile = session.query(Profile).filter_by(user_id=user_id).first()
        if not profile:
            return jsonify({'error': 'User profile not found'}), 404
        
        # Note: Profile model doesn't have organization_id yet, but we handle it
        # For now, store in a separate membership
        if org_id:
            # Check if membership exists
            member = session.query(OrganizationMember).filter_by(
                user_id=user_id, 
                organization_id=org_id
            ).first()
            
            if not member:
                member = OrganizationMember(
                    user_id=user_id,
                    organization_id=org_id,
                    role='member',
                    accepted_at=datetime.utcnow()
                )
                session.add(member)
        
        session.commit()
        
        return jsonify({'success': True, 'user_id': user_id, 'organization_id': org_id})
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


@app.route('/api/admin/users/<user_id>/profile', methods=['PUT'])
def update_user_profile(user_id):
    """Update a user's profile data."""
    session = get_session()
    try:
        data = request.get_json()
        
        profile = session.query(Profile).filter_by(user_id=user_id).first()
        if not profile:
            return jsonify({'error': 'User profile not found'}), 404
        
        # Update all profile fields
        for key in ['display_name', 'phone', 'cpf_cnpj', 'address_cep', 'address_street',
                    'address_number', 'address_complement', 'address_neighborhood',
                    'address_city', 'address_state', 'credits_balance', 'credits_monthly_quota',
                    'organization_id']:
            if key in data:
                setattr(profile, key, data[key])
        
        profile.updated_at = datetime.utcnow()
        session.commit()
        
        return jsonify(profile.to_dict())
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()
# ============== Credit Transactions ==============
@app.route('/api/admin/credit-transactions', methods=['GET'])
def get_credit_transactions():
    """List all credit transactions."""
    session = get_session()
    try:
        limit = request.args.get('limit', 100, type=int)
        transactions = session.query(CreditTransaction).order_by(
            CreditTransaction.created_at.desc()
        ).limit(limit).all()
        
        return jsonify([tx.to_dict() for tx in transactions])
    finally:
        session.close()


@app.route('/api/admin/credit-transactions', methods=['POST'])
def create_credit_transaction():
    """Create a new credit transaction (add/remove credits)."""
    session = get_session()
    try:
        data = request.get_json()
        
        org_id = data['organization_id']
        amount = data['amount']
        tx_type = data['transaction_type']
        
        # Get organization
        org = session.query(Organization).filter_by(id=org_id).first()
        if not org:
            return jsonify({'error': 'Organization not found'}), 404
        
        # Calculate new balance
        new_balance = (org.credits_balance or 0) + amount
        
        # Create transaction
        tx = CreditTransaction(
            organization_id=org_id,
            amount=amount,
            balance_after=new_balance,
            transaction_type=tx_type,
            description=data.get('description'),
            match_id=data.get('match_id'),
            created_by=data.get('created_by')
        )
        
        session.add(tx)
        
        # Update organization balance
        org.credits_balance = new_balance
        org.updated_at = datetime.utcnow()
        
        session.commit()
        
        return jsonify(tx.to_dict()), 201
    except Exception as e:
        session.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        session.close()


# ============== Admin Stats ==============
@app.route('/api/admin/stats', methods=['GET'])
def get_admin_stats():
    """Get admin dashboard statistics."""
    session = get_session()
    try:
        from datetime import timedelta
        
        now = datetime.utcnow()
        start_of_month = datetime(now.year, now.month, 1)
        
        # Organizations count
        total_orgs = session.query(Organization).count()
        new_orgs = session.query(Organization).filter(
            Organization.created_at >= start_of_month
        ).count()
        
        # Users count
        total_users = session.query(Profile).count()
        new_users = session.query(Profile).filter(
            Profile.created_at >= start_of_month
        ).count()
        
        # Credit usage
        all_usage = session.query(CreditTransaction).filter(
            CreditTransaction.transaction_type == 'usage'
        ).all()
        
        total_credits_used = sum(abs(tx.amount) for tx in all_usage)
        credits_this_month = sum(
            abs(tx.amount) for tx in all_usage 
            if tx.created_at >= start_of_month
        )
        
        # Recent activity
        recent_profiles = session.query(Profile).order_by(
            Profile.created_at.desc()
        ).limit(10).all()
        
        recent_activity = [{
            'type': 'signup',
            'description': f"{p.display_name or p.email or 'Usuário'} se cadastrou",
            'time': p.created_at.strftime('%d/%m/%Y %H:%M') if p.created_at else ''
        } for p in recent_profiles]
        
        return jsonify({
            'totalOrganizations': total_orgs,
            'newOrganizationsThisMonth': new_orgs,
            'totalUsers': total_users,
            'newUsersThisMonth': new_users,
            'totalCreditsUsed': total_credits_used,
            'creditsUsedThisMonth': credits_this_month,
            'monthlyRevenue': 0,
            'revenueGrowth': 0,
            'recentActivity': recent_activity
        })
    finally:
        session.close()


# ═══════════════════════════════════════════════════════════════════
# ENDPOINT: REGENERAR CLIPS COM NOVOS TEMPOS
# ═══════════════════════════════════════════════════════════════════
@app.route('/api/matches/<match_id>/regenerate-clips', methods=['POST'])
def regenerate_match_clips(match_id):
    """
    Regenera todos os clips de uma partida com as novas configurações de tempo.
    
    Options:
    - event_types: Lista de tipos de evento para regenerar (null = todos)
    - force_subtitles: Forçar legendas mesmo em clips existentes
    - use_category_timings: Usar tempos específicos por categoria
    """
    data = request.json or {}
    event_types = data.get('event_types')  # ['goal', 'save'] ou None para todos
    force_subtitles = data.get('force_subtitles', True)
    use_category_timings = data.get('use_category_timings', True)
    
    session = get_session()
    try:
        # Verificar se a partida existe
        match = session.query(Match).filter_by(id=match_id).first()
        if not match:
            return jsonify({'error': 'Match not found'}), 404
        
        # Buscar nomes dos times
        home_team_name = None
        away_team_name = None
        if match.home_team_id:
            home_team = session.query(Team).filter_by(id=match.home_team_id).first()
            home_team_name = home_team.name if home_team else None
        if match.away_team_id:
            away_team = session.query(Team).filter_by(id=match.away_team_id).first()
            away_team_name = away_team.name if away_team else None
        
        # Buscar eventos para regenerar
        events_query = session.query(MatchEvent).filter_by(match_id=match_id)
        if event_types:
            events_query = events_query.filter(MatchEvent.event_type.in_(event_types))
        events = events_query.all()
        
        if not events:
            return jsonify({'error': 'No events found to regenerate'}), 404
        
        # Buscar vídeos da partida
        videos = session.query(Video).filter_by(match_id=match_id).all()
        if not videos:
            return jsonify({'error': 'No videos found for this match'}), 404
        
        # Organizar vídeos por tipo (first_half, second_half, full)
        videos_by_type = {}
        for v in videos:
            vtype = v.video_type or 'full'
            if vtype not in videos_by_type:
                videos_by_type[vtype] = []
            videos_by_type[vtype].append(v)
        
        regenerated = 0
        failed = 0
        timings_used = {}
        
        # Agrupar eventos por tempo para regeneração
        events_first = [e for e in events if e.match_half == 'first' or (e.minute or 0) <= 45]
        events_second = [e for e in events if e.match_half == 'second' or (e.minute or 0) > 45]
        
        # Processar primeiro tempo
        if events_first and ('first_half' in videos_by_type or 'full' in videos_by_type):
            video = videos_by_type.get('first_half', videos_by_type.get('full', [None]))[0]
            if video:
                video_path = None
                # Resolver caminho do vídeo
                from storage import get_video_subfolder_path
                video_folder = get_video_subfolder_path(match_id, 'first_half')
                for ext in ['.mp4', '.mov', '.webm', '.mkv']:
                    for f in video_folder.glob(f'*{ext}'):
                        video_path = str(f)
                        break
                    if video_path:
                        break
                
                if video_path and os.path.exists(video_path):
                    events_dicts = []
                    for e in events_first:
                        evt = {
                            'id': e.id,
                            'minute': e.minute or 0,
                            'second': e.second or 0,
                            'event_type': e.event_type,
                            'description': e.description,
                            'metadata': e.metadata or {}
                        }
                        events_dicts.append(evt)
                        
                        # Registrar timings usados
                        pre, post = get_event_clip_timings(e.event_type)
                        if e.event_type not in timings_used:
                            timings_used[e.event_type] = {'pre': pre, 'post': post, 'total': pre + post}
                    
                    clips = extract_event_clips_auto(
                        match_id=match_id,
                        video_path=video_path,
                        events=events_dicts,
                        half_type='first',
                        home_team=home_team_name,
                        away_team=away_team_name,
                        use_category_timings=use_category_timings
                    )
                    regenerated += len(clips)
                    failed += len(events_dicts) - len(clips)
        
        # Processar segundo tempo
        if events_second and ('second_half' in videos_by_type or 'full' in videos_by_type):
            video = videos_by_type.get('second_half', videos_by_type.get('full', [None]))[0]
            if video:
                video_path = None
                from storage import get_video_subfolder_path
                video_folder = get_video_subfolder_path(match_id, 'second_half')
                for ext in ['.mp4', '.mov', '.webm', '.mkv']:
                    for f in video_folder.glob(f'*{ext}'):
                        video_path = str(f)
                        break
                    if video_path:
                        break
                
                if video_path and os.path.exists(video_path):
                    events_dicts = []
                    for e in events_second:
                        evt = {
                            'id': e.id,
                            'minute': e.minute or 0,
                            'second': e.second or 0,
                            'event_type': e.event_type,
                            'description': e.description,
                            'metadata': e.metadata or {}
                        }
                        events_dicts.append(evt)
                        
                        pre, post = get_event_clip_timings(e.event_type)
                        if e.event_type not in timings_used:
                            timings_used[e.event_type] = {'pre': pre, 'post': post, 'total': pre + post}
                    
                    clips = extract_event_clips_auto(
                        match_id=match_id,
                        video_path=video_path,
                        events=events_dicts,
                        half_type='second',
                        home_team=home_team_name,
                        away_team=away_team_name,
                        segment_start_minute=45,
                        use_category_timings=use_category_timings
                    )
                    regenerated += len(clips)
                    failed += len(events_dicts) - len(clips)
        
        return jsonify({
            'success': True,
            'regenerated': regenerated,
            'failed': failed,
            'total_events': len(events),
            'timings_used': timings_used,
            'message': f'{regenerated} clips regenerados com novos tempos por categoria'
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    finally:
        session.close()


@app.route('/api/clip-config', methods=['GET'])
def get_clip_config():
    """Retorna a configuração de tempos de clips por categoria."""
    return jsonify({
        'config': EVENT_CLIP_CONFIG,
        'description': 'Tempos de clip em segundos: pre_buffer (antes) + post_buffer (depois)'
    })


# ============================================================================
# MAIN
# ============================================================================

# ═══════════════════════════════════════════════════════════════════════════
# ENDPOINT DE DIAGNÓSTICO DE CLIPS
# ═══════════════════════════════════════════════════════════════════════════
@app.route('/api/matches/<match_id>/diagnose-clips', methods=['GET'])
def diagnose_match_clips(match_id):
    """
    Diagnostica problemas nos clips de uma partida.
    
    Retorna:
    - Eventos sem clips
    - Clips com timestamps suspeitos
    - Clips duplicados
    - Clips corrompidos
    """
    issues = {
        'events_without_clips': [],
        'suspicious_timestamps': [],
        'duplicate_clips': [],
        'corrupted_clips': [],
        'valid_clips': [],
        'recommendations': [],
        'summary': {}
    }
    
    session = get_session()
    try:
        # Buscar todos os eventos da partida
        events = session.query(MatchEvent).filter_by(match_id=match_id).all()
        
        event_times = []
        for event in events:
            event_dict = event.to_dict()
            event_time = event.minute * 60 + (event.second or 0)
            
            # Verificar se tem clip
            if not event.clip_url:
                issues['events_without_clips'].append({
                    'id': event.id,
                    'event_type': event.event_type,
                    'minute': event.minute,
                    'description': event.description[:50] if event.description else None
                })
            else:
                # Verificar se o arquivo existe localmente
                clip_filename = event.clip_url.split('/')[-1] if event.clip_url else None
                if clip_filename:
                    half_type = 'first_half' if event.match_half == 'first' else 'second_half'
                    clip_folder = get_clip_subfolder_path(match_id, half_type.replace('_half', ''))
                    clip_path = clip_folder / clip_filename
                    
                    if os.path.exists(clip_path):
                        file_size = os.path.getsize(clip_path)
                        duration = get_video_duration_seconds(str(clip_path))
                        
                        if file_size < 50000:  # < 50KB
                            issues['corrupted_clips'].append({
                                'id': event.id,
                                'event_type': event.event_type,
                                'minute': event.minute,
                                'file_size_kb': file_size / 1024,
                                'issue': 'arquivo muito pequeno'
                            })
                        elif duration < 5:  # < 5 segundos
                            issues['corrupted_clips'].append({
                                'id': event.id,
                                'event_type': event.event_type,
                                'minute': event.minute,
                                'duration': duration,
                                'issue': 'duração muito curta'
                            })
                        else:
                            issues['valid_clips'].append({
                                'id': event.id,
                                'event_type': event.event_type,
                                'minute': event.minute,
                                'file_size_kb': round(file_size / 1024, 1),
                                'duration': round(duration, 1)
                            })
            
            # Verificar duplicatas (eventos muito próximos)
            for prev_time, prev_event in event_times:
                if abs(event_time - prev_time) < 30:  # < 30 segundos
                    issues['duplicate_clips'].append({
                        'event_1': {'id': prev_event.id, 'type': prev_event.event_type, 'minute': prev_event.minute},
                        'event_2': {'id': event.id, 'type': event.event_type, 'minute': event.minute},
                        'gap_seconds': abs(event_time - prev_time)
                    })
            
            event_times.append((event_time, event))
            
            # Verificar timestamps suspeitos
            metadata = event.event_metadata or {}
            video_second = metadata.get('videoSecond')
            if video_second is not None:
                expected_second = (event.minute - (0 if event.match_half == 'first' else 45)) * 60 + (event.second or 0)
                if abs(video_second - expected_second) > 60:  # Diferença > 1 minuto
                    issues['suspicious_timestamps'].append({
                        'id': event.id,
                        'event_type': event.event_type,
                        'minute': event.minute,
                        'videoSecond': video_second,
                        'expected_second': expected_second,
                        'difference': abs(video_second - expected_second)
                    })
        
        # Gerar recomendações
        if issues['events_without_clips']:
            issues['recommendations'].append(
                f"Regenerar clips: {len(issues['events_without_clips'])} eventos sem clip. "
                f"Use POST /api/matches/{match_id}/regenerate-clips"
            )
        
        if issues['corrupted_clips']:
            issues['recommendations'].append(
                f"Corrigir clips corrompidos: {len(issues['corrupted_clips'])} clips com problemas"
            )
        
        if issues['duplicate_clips']:
            issues['recommendations'].append(
                f"Revisar duplicatas: {len(issues['duplicate_clips'])} pares de eventos muito próximos"
            )
        
        if issues['suspicious_timestamps']:
            issues['recommendations'].append(
                f"Verificar timestamps: {len(issues['suspicious_timestamps'])} eventos com videoSecond inconsistente"
            )
        
        # Resumo
        issues['summary'] = {
            'total_events': len(events),
            'valid_clips': len(issues['valid_clips']),
            'missing_clips': len(issues['events_without_clips']),
            'corrupted_clips': len(issues['corrupted_clips']),
            'duplicates': len(issues['duplicate_clips']),
            'suspicious_timestamps': len(issues['suspicious_timestamps']),
            'health_score': round(len(issues['valid_clips']) / max(len(events), 1) * 100, 1)
        }
        
        return jsonify(issues)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        session.close()


def print_startup_status():
    """Imprime status detalhado no startup."""
    from database import get_database_path, get_base_dir
    
    print("\n" + "=" * 60)
    print("Arena Play - Servidor API Local")
    print("=" * 60)
    
    print("\n[Caminhos]")
    print(f"  Base Dir:   {get_base_dir()}")
    print(f"  Database:   {get_database_path()}")
    print(f"  Storage:    {STORAGE_DIR.absolute()}")
    print(f"  Vinhetas:   {VIGNETTES_DIR.absolute()}")
    
    print("\n[Provedores de IA]")
    print(f"  Gemini:     {'✓ Ativo' if ai_services.GOOGLE_API_KEY and ai_services.GEMINI_ENABLED else '✗ Inativo'}")
    print(f"  OpenAI:     {'✓ Ativo' if ai_services.OPENAI_API_KEY and ai_services.OPENAI_ENABLED else '✗ Inativo'}")
    print(f"  ElevenLabs: {'✓ Ativo' if ai_services.ELEVENLABS_API_KEY and ai_services.ELEVENLABS_ENABLED else '✗ Inativo'}")
    print(f"  Lovable:    {'✓ Ativo' if ai_services.LOVABLE_API_KEY else '✗ Inativo'}")
    print(f"  Ollama:     {'✓ Ativo (' + ai_services.OLLAMA_MODEL + ')' if ai_services.OLLAMA_ENABLED else '✗ Inativo'}")
    
    # Capabilities
    has_transcription = any([
        ai_services.ELEVENLABS_API_KEY and ai_services.ELEVENLABS_ENABLED,
        ai_services.OPENAI_API_KEY and ai_services.OPENAI_ENABLED,
        ai_services.GOOGLE_API_KEY and ai_services.GEMINI_ENABLED,
        ai_services.LOVABLE_API_KEY
    ])
    has_analysis = any([
        ai_services.GOOGLE_API_KEY and ai_services.GEMINI_ENABLED,
        ai_services.OPENAI_API_KEY and ai_services.OPENAI_ENABLED,
        ai_services.LOVABLE_API_KEY,
        ai_services.OLLAMA_ENABLED
    ])
    
    print("\n[Capacidades]")
    print(f"  Transcrição: {'✓' if has_transcription else '✗ NENHUM PROVIDER CONFIGURADO'}")
    print(f"  Análise:     {'✓' if has_analysis else '✗ NENHUM PROVIDER CONFIGURADO'}")
    
    print("\n" + "=" * 60)
    print("Endpoints principais:")
    print("  GET  /health                          - Status do servidor")
    print("  GET  /api/settings                    - Configurações unificadas")
    print("  GET  /api/teams                       - Listar times")
    print("  GET  /api/matches                     - Listar partidas")
    print("  POST /api/transcription-jobs          - Criar job de transcrição")
    print("  GET  /api/transcription-jobs/<id>     - Status do job")
    print("  POST /api/analyze-match               - Analisar partida")
    print("  POST /api/analyze-live-match          - Analisar partida ao vivo (pós-gravação)")
    print("=" * 60 + "\n")


if __name__ == '__main__':
    print_startup_status()
    app.run(host='0.0.0.0', port=5000, debug=True)
