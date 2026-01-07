"""
Arena Play - Servidor de Processamento de Vídeo
Servidor Flask local para corte de vídeos e adição de vinhetas usando FFmpeg.
"""

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import subprocess
import os
import tempfile
import requests
import uuid
from pathlib import Path

app = Flask(__name__)
CORS(app)

# Diretório para vinhetas locais
VIGNETTES_DIR = Path(__file__).parent / "vinhetas"
VIGNETTES_DIR.mkdir(exist_ok=True)


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
    """Extrai um clip do vídeo usando FFmpeg com seek rápido."""
    try:
        cmd = [
            'ffmpeg', '-y',
            '-ss', str(start_seconds),  # Seek antes do input (mais rápido)
            '-i', input_path,
            '-t', str(duration),
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-preset', 'fast',
            '-crf', '23',
            '-movflags', '+faststart',
            output_path
        ]
        
        print(f"Executando: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        
        if result.returncode != 0:
            print(f"FFmpeg stderr: {result.stderr}")
            return False
            
        return os.path.exists(output_path)
    except subprocess.TimeoutExpired:
        print("FFmpeg timeout")
        return False
    except Exception as e:
        print(f"Erro ao extrair clip: {e}")
        return False


def concatenate_videos(segments: list, output_path: str, tmpdir: str) -> bool:
    """Concatena múltiplos segmentos de vídeo usando FFmpeg concat demuxer."""
    try:
        # Criar arquivo de concat
        concat_file = os.path.join(tmpdir, 'concat.txt')
        with open(concat_file, 'w') as f:
            for seg in segments:
                # Escapar caracteres especiais no path
                safe_path = seg.replace("'", "'\\''")
                f.write(f"file '{safe_path}'\n")
        
        # Re-encodar para garantir compatibilidade
        cmd = [
            'ffmpeg', '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', concat_file,
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-preset', 'fast',
            '-crf', '23',
            '-movflags', '+faststart',
            output_path
        ]
        
        print(f"Concatenando: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        if result.returncode != 0:
            print(f"FFmpeg concat stderr: {result.stderr}")
            return False
            
        return os.path.exists(output_path)
    except Exception as e:
        print(f"Erro ao concatenar: {e}")
        return False


def normalize_video(input_path: str, output_path: str, target_resolution: str = "1280x720") -> bool:
    """Normaliza um vídeo para resolução e formato consistentes."""
    try:
        cmd = [
            'ffmpeg', '-y',
            '-i', input_path,
            '-vf', f'scale={target_resolution}:force_original_aspect_ratio=decrease,pad={target_resolution}:(ow-iw)/2:(oh-ih)/2',
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-ar', '44100',
            '-preset', 'fast',
            '-crf', '23',
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        return result.returncode == 0
    except Exception as e:
        print(f"Erro ao normalizar: {e}")
        return False


@app.route('/health', methods=['GET'])
def health_check():
    """Verifica se o servidor está funcionando."""
    # Verificar se FFmpeg está disponível
    try:
        result = subprocess.run(['ffmpeg', '-version'], capture_output=True, text=True, timeout=5)
        ffmpeg_ok = result.returncode == 0
    except:
        ffmpeg_ok = False
    
    return jsonify({
        'status': 'ok',
        'ffmpeg': ffmpeg_ok,
        'vignettes_dir': str(VIGNETTES_DIR),
        'vignettes_available': list(VIGNETTES_DIR.glob('*.mp4'))
    })


@app.route('/extract-clip', methods=['POST'])
def extract_clip_endpoint():
    """
    Extrai um clip de vídeo com corte preciso.
    
    Body JSON:
    {
        "videoUrl": "https://...",
        "startSeconds": 45.5,
        "durationSeconds": 8,
        "filename": "clip.mp4",
        "includeVignettes": false,
        "openingVignette": "abertura.mp4",
        "closingVignette": "encerramento.mp4"
    }
    """
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
        # 1. Baixar vídeo original
        input_path = os.path.join(tmpdir, 'input.mp4')
        if not download_video(video_url, input_path):
            return jsonify({'error': 'Falha ao baixar o vídeo'}), 500
        
        # 2. Extrair clip
        clip_path = os.path.join(tmpdir, 'clip.mp4')
        if not extract_clip(input_path, clip_path, start_seconds, duration):
            return jsonify({'error': 'Falha ao extrair clip'}), 500
        
        final_path = clip_path
        
        # 3. Adicionar vinhetas se solicitado
        if include_vignettes:
            segments = []
            
            # Vinheta de abertura
            if opening_vignette:
                opening_path = VIGNETTES_DIR / opening_vignette
                if opening_path.exists():
                    # Normalizar vinheta para mesma resolução
                    normalized_opening = os.path.join(tmpdir, 'opening_normalized.mp4')
                    if normalize_video(str(opening_path), normalized_opening):
                        segments.append(normalized_opening)
            
            # Normalizar clip principal
            normalized_clip = os.path.join(tmpdir, 'clip_normalized.mp4')
            if normalize_video(clip_path, normalized_clip):
                segments.append(normalized_clip)
            else:
                segments.append(clip_path)
            
            # Vinheta de encerramento
            if closing_vignette:
                closing_path = VIGNETTES_DIR / closing_vignette
                if closing_path.exists():
                    normalized_closing = os.path.join(tmpdir, 'closing_normalized.mp4')
                    if normalize_video(str(closing_path), normalized_closing):
                        segments.append(normalized_closing)
            
            # Concatenar se há múltiplos segmentos
            if len(segments) > 1:
                final_with_vignettes = os.path.join(tmpdir, 'final.mp4')
                if concatenate_videos(segments, final_with_vignettes, tmpdir):
                    final_path = final_with_vignettes
        
        # 4. Retornar arquivo para download
        return send_file(
            final_path,
            as_attachment=True,
            download_name=filename,
            mimetype='video/mp4'
        )


@app.route('/extract-batch', methods=['POST'])
def extract_batch_endpoint():
    """
    Extrai múltiplos clips de um vídeo.
    
    Body JSON:
    {
        "videoUrl": "https://...",
        "clips": [
            {"eventId": "xxx", "startSeconds": 45, "durationSeconds": 8, "title": "Gol"},
            {"eventId": "yyy", "startSeconds": 120, "durationSeconds": 8, "title": "Falta"}
        ],
        "includeVignettes": false
    }
    """
    import zipfile
    
    data = request.json
    video_url = data.get('videoUrl')
    clips = data.get('clips', [])
    include_vignettes = data.get('includeVignettes', False)
    opening_vignette = data.get('openingVignette')
    closing_vignette = data.get('closingVignette')
    
    if not video_url or not clips:
        return jsonify({'error': 'videoUrl e clips são obrigatórios'}), 400
    
    with tempfile.TemporaryDirectory() as tmpdir:
        # 1. Baixar vídeo uma única vez
        input_path = os.path.join(tmpdir, 'input.mp4')
        if not download_video(video_url, input_path):
            return jsonify({'error': 'Falha ao baixar o vídeo'}), 500
        
        extracted_clips = []
        
        # 2. Extrair cada clip
        for i, clip in enumerate(clips):
            start_seconds = float(clip.get('startSeconds', 0))
            duration = float(clip.get('durationSeconds', 8))
            title = clip.get('title', f'clip_{i}')
            event_id = clip.get('eventId', str(uuid.uuid4()))
            
            clip_path = os.path.join(tmpdir, f'clip_{i}.mp4')
            
            if extract_clip(input_path, clip_path, start_seconds, duration):
                final_path = clip_path
                
                # Adicionar vinhetas se solicitado
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
        
        # 3. Criar ZIP com todos os clips
        zip_path = os.path.join(tmpdir, 'clips.zip')
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for i, clip in enumerate(extracted_clips):
                # Nome do arquivo: ordem-titulo.mp4
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


if __name__ == '__main__':
    print("=" * 50)
    print("Arena Play - Servidor de Processamento de Vídeo")
    print("=" * 50)
    print(f"Diretório de vinhetas: {VIGNETTES_DIR}")
    print("Endpoints disponíveis:")
    print("  GET  /health         - Status do servidor")
    print("  POST /extract-clip   - Extrair clip único")
    print("  POST /extract-batch  - Extrair múltiplos clips")
    print("  GET  /vignettes      - Listar vinhetas")
    print("=" * 50)
    app.run(host='0.0.0.0', port=5000, debug=True)
