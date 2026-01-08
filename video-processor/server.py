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
    delete_match_storage, STORAGE_DIR, MATCH_SUBFOLDERS, get_subfolder_path
)
import ai_services

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
        if keys_loaded:
            print(f"✓ API keys loaded from database: {', '.join(keys_loaded)}")
        else:
            print("⚠ No API keys found in database. Configure in Settings.")
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
    """Analisa uma partida a partir de transcrição."""
    data = request.json
    match_id = data.get('matchId')
    transcription = data.get('transcription')
    home_team = data.get('homeTeam', 'Time A')
    away_team = data.get('awayTeam', 'Time B')
    
    if not transcription:
        return jsonify({'error': 'Transcrição é obrigatória'}), 400
    
    try:
        events = ai_services.analyze_match_events(
            transcription, home_team, away_team
        )
        
        # Save events to database
        session = get_session()
        try:
            for event_data in events:
                event = MatchEvent(
                    match_id=match_id,
                    event_type=event_data.get('event_type', 'unknown'),
                    description=event_data.get('description'),
                    minute=event_data.get('minute'),
                    is_highlight=event_data.get('is_highlight', False),
                    metadata={'ai_generated': True, **event_data}
                )
                session.add(event)
            session.commit()
        finally:
            session.close()
        
        return jsonify({'success': True, 'events': events})
    except Exception as e:
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
