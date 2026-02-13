"""
Scoreboard OCR - Leitura de placar via EasyOCR + OpenCV (100% local, zero custo).

Funcionalidades:
1. read_scoreboard_ocr(frame) - Lê cronômetro, placar e acréscimos de um frame
2. detect_match_boundaries_ocr(video_path) - Detecta início/fim dos tempos
3. validate_event_minute_ocr(video_path, second, minute) - Confirma minuto de evento
"""

import re
import os
import base64
import subprocess
import tempfile
from typing import Dict, List, Optional, Any

import numpy as np

# Lazy-load heavy imports
_ocr_reader = None
_cv2 = None


def _get_cv2():
    global _cv2
    if _cv2 is None:
        import cv2
        _cv2 = cv2
    return _cv2


def _get_ocr_reader():
    """Initialize EasyOCR reader once (lazy loading, ~150MB first download)."""
    global _ocr_reader
    if _ocr_reader is None:
        import easyocr
        try:
            import torch
            use_gpu = torch.cuda.is_available()
        except ImportError:
            use_gpu = False
        print(f"[OCR] Inicializando EasyOCR (GPU={use_gpu})...")
        _ocr_reader = easyocr.Reader(['en'], gpu=use_gpu, verbose=False)
        print("[OCR] ✓ EasyOCR pronto")
    return _ocr_reader


def _extract_single_frame(video_path: str, timestamp_seconds: float) -> Optional[np.ndarray]:
    """Extract a single frame from video at given timestamp using FFmpeg."""
    cv2 = _get_cv2()
    
    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
        tmp_path = tmp.name
    
    try:
        cmd = [
            'ffmpeg', '-y', '-ss', str(timestamp_seconds),
            '-i', video_path,
            '-vframes', '1',
            '-q:v', '2',
            tmp_path
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=30)
        
        if result.returncode == 0 and os.path.exists(tmp_path):
            img = cv2.imread(tmp_path)
            if img is not None and img.size > 0:
                return img
    except Exception as e:
        print(f"[OCR] Erro ao extrair frame em {timestamp_seconds:.1f}s: {e}")
    finally:
        try:
            os.remove(tmp_path)
        except:
            pass
    return None


def read_scoreboard_ocr(frame: np.ndarray) -> Dict[str, Any]:
    """
    Lê o placar de um frame usando OpenCV + EasyOCR.
    
    Args:
        frame: numpy array (BGR) do frame do vídeo
    
    Returns:
        dict com game_minute, game_second, half, stoppage_time,
        score_home, score_away, scoreboard_visible, confidence
    """
    cv2 = _get_cv2()
    reader = _get_ocr_reader()
    
    h, w = frame.shape[:2]
    
    # Crop região do placar: topo 15%, centro 60%
    roi = frame[0:int(h * 0.15), int(w * 0.2):int(w * 0.8)]
    
    if roi.size == 0:
        return {'scoreboard_visible': False, 'confidence': 0.0}
    
    # Pre-processamento para OCR
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    _, binary = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    # EasyOCR lê texto
    results = reader.readtext(binary, detail=1)
    
    all_text = ' '.join([r[1] for r in results])
    
    result = {
        'scoreboard_visible': False,
        'game_minute': None,
        'game_second': None,
        'half': None,
        'stoppage_time': None,
        'score_home': None,
        'score_away': None,
        'raw_text': all_text,
        'confidence': 0.0,
    }
    
    # Regex para cronômetro: "MM:SS" ou "M:SS"
    time_match = re.search(r'(\d{1,3})\s*[:\.]\s*(\d{2})', all_text)
    # Regex para placar: "1 x 0", "1-0", "1:0"
    score_match = re.search(r'(\d+)\s*[x\-]\s*(\d+)', all_text)
    # Regex para acréscimos: "+3", "+5"
    stoppage_match = re.search(r'\+\s*(\d+)', all_text)
    
    if time_match:
        minute = int(time_match.group(1))
        second = int(time_match.group(2))
        
        # Validar: segundo < 60 e minuto < 130
        if second < 60 and minute < 130:
            result['scoreboard_visible'] = True
            result['game_minute'] = minute
            result['game_second'] = second
            result['half'] = '1st' if minute < 46 else ('2nd' if minute < 91 else 'extra')
            result['confidence'] = sum(r[2] for r in results) / len(results) if results else 0
    
    if score_match:
        sh = int(score_match.group(1))
        sa = int(score_match.group(2))
        # Validar: placar razoável (< 20)
        if sh < 20 and sa < 20:
            result['score_home'] = sh
            result['score_away'] = sa
    
    if stoppage_match:
        st = int(stoppage_match.group(1))
        if st < 20:  # Acréscimo razoável
            result['stoppage_time'] = st
    
    return result


def detect_match_boundaries_ocr(
    video_path: str,
    duration_seconds: float,
    num_samples: int = 20
) -> Dict[str, Any]:
    """
    Detecta início/fim dos tempos lendo o cronômetro do placar.
    Amostra frames ao longo do vídeo e analisa progressão.
    
    Returns:
        dict com game_start_second, halftime_timestamp_seconds,
        second_half_start_second, stoppage_time_1st/2nd, confidence
    """
    print(f"[OCR] Detectando boundaries para vídeo de {duration_seconds:.0f}s com {num_samples} amostras...")
    
    # Pontos de amostragem uniformes
    sample_points = [duration_seconds * i / (num_samples + 1) for i in range(1, num_samples + 1)]
    
    readings = []
    for sec in sample_points:
        frame = _extract_single_frame(video_path, sec)
        if frame is not None:
            reading = read_scoreboard_ocr(frame)
            reading['video_second'] = sec
            readings.append(reading)
    
    visible_readings = [r for r in readings if r['scoreboard_visible']]
    
    print(f"[OCR] {len(visible_readings)}/{len(readings)} frames com placar visível")
    
    if len(visible_readings) < 3:
        return {'confidence': 0.0, 'source': 'ocr_scoreboard', 'message': 'Poucos frames com placar visível'}
    
    boundaries = {
        'game_start_second': None,
        'halftime_timestamp_seconds': None,
        'second_half_start_second': None,
        'game_end_second': None,
        'stoppage_time_1st': None,
        'stoppage_time_2nd': None,
        'confidence': 0.0,
        'source': 'ocr_scoreboard',
        'readings_count': len(visible_readings),
        'total_samples': len(readings),
    }
    
    # 1. Encontrar início do jogo: primeiro frame com minuto <= 2
    for r in visible_readings:
        if r['game_minute'] is not None and r['game_minute'] <= 2:
            offset = r['game_minute'] * 60 + (r['game_second'] or 0)
            boundaries['game_start_second'] = max(0, r['video_second'] - offset)
            print(f"[OCR] Início detectado: video_second={r['video_second']:.0f}s, cronômetro={r['game_minute']}:{r.get('game_second', 0):02d}")
            break
    
    # 2. Detectar halftime: minuto cai de ~45+ para ~45
    for i in range(1, len(visible_readings)):
        prev = visible_readings[i - 1]
        curr = visible_readings[i]
        if (prev['game_minute'] is not None and curr['game_minute'] is not None):
            # Transição: 1T (>=40) → 2T (<=50) com queda
            if prev['game_minute'] >= 40 and curr['game_minute'] <= 50 and prev['game_minute'] > curr['game_minute']:
                boundaries['halftime_timestamp_seconds'] = prev['video_second']
                offset_2t = (curr['game_minute'] - 45) * 60 + (curr['game_second'] or 0)
                boundaries['second_half_start_second'] = curr['video_second'] - offset_2t
                print(f"[OCR] Halftime detectado: {prev['video_second']:.0f}s, 2T início: {curr['video_second']:.0f}s")
                break
    
    # 3. Acréscimos
    for r in visible_readings:
        if r['stoppage_time']:
            if r['half'] == '1st':
                boundaries['stoppage_time_1st'] = max(boundaries.get('stoppage_time_1st') or 0, r['stoppage_time'])
            elif r['half'] == '2nd':
                boundaries['stoppage_time_2nd'] = max(boundaries.get('stoppage_time_2nd') or 0, r['stoppage_time'])
    
    # 4. Placar final (último frame visível)
    last_reading = visible_readings[-1]
    if last_reading.get('score_home') is not None:
        boundaries['final_score'] = {
            'home': last_reading['score_home'],
            'away': last_reading['score_away'],
        }
    
    # Confidence baseada em frames lidos com sucesso
    boundaries['confidence'] = len(visible_readings) / len(readings)
    
    print(f"[OCR] Boundaries: start={boundaries.get('game_start_second')}, "
          f"halftime={boundaries.get('halftime_timestamp_seconds')}, "
          f"2T={boundaries.get('second_half_start_second')}, "
          f"confidence={boundaries['confidence']:.2f}")
    
    return boundaries


def validate_event_minute_ocr(
    video_path: str,
    event_video_second: float,
    claimed_minute: int,
) -> Dict[str, Any]:
    """
    Valida o minuto de um evento lendo o cronômetro no frame exato.
    
    Args:
        video_path: Caminho do vídeo
        event_video_second: Segundo do vídeo onde o evento ocorre
        claimed_minute: Minuto alegado pelo sistema/transcrição
    
    Returns:
        dict com corrected, minute, ocr_minute, divergence, confidence
    """
    # Extrair 3 frames ao redor do evento (±2s)
    timestamps = [
        max(0, event_video_second - 2),
        event_video_second,
        event_video_second + 2
    ]
    
    best_reading = None
    for ts in timestamps:
        frame = _extract_single_frame(video_path, ts)
        if frame is not None:
            reading = read_scoreboard_ocr(frame)
            if reading['scoreboard_visible']:
                if not best_reading or reading['confidence'] > best_reading['confidence']:
                    best_reading = reading
    
    if not best_reading:
        return {
            'corrected': False,
            'minute': claimed_minute,
            'ocr_minute': None,
            'divergence': None,
            'confidence': 0.0,
            'source': 'ocr_scoreboard',
        }
    
    ocr_minute = best_reading['game_minute']
    divergence = abs(ocr_minute - claimed_minute)
    
    result = {
        'corrected': divergence > 2,
        'minute': ocr_minute if divergence > 2 else claimed_minute,
        'second': best_reading.get('game_second', 0),
        'ocr_minute': ocr_minute,
        'claimed_minute': claimed_minute,
        'divergence': divergence,
        'confidence': best_reading['confidence'],
        'source': 'ocr_scoreboard',
        'raw_text': best_reading.get('raw_text', ''),
    }
    
    if result['corrected']:
        print(f"[OCR] ⚠ Minuto corrigido: {claimed_minute}' → {ocr_minute}' (divergência={divergence})")
    else:
        print(f"[OCR] ✓ Minuto confirmado: {claimed_minute}' (OCR={ocr_minute}', divergência={divergence})")
    
    return result


def validate_events_batch_ocr(
    video_path: str,
    events: List[Dict],
    video_start_minute: int = 0,
) -> List[Dict]:
    """
    Valida minutos de múltiplos eventos em lote.
    
    Args:
        video_path: Caminho do vídeo
        events: Lista de eventos com 'minute', 'second', 'metadata.videoSecond'
        video_start_minute: Minuto de início do vídeo
    
    Returns:
        Lista de resultados de validação por evento
    """
    results = []
    
    for event in events:
        claimed_minute = event.get('minute', 0)
        video_second = None
        
        # Tentar obter videoSecond do metadata
        metadata = event.get('metadata', {}) or {}
        if isinstance(metadata, dict):
            video_second = metadata.get('videoSecond')
        
        # Se não tem videoSecond, calcular a partir do minuto
        if video_second is None:
            video_second = (claimed_minute - video_start_minute) * 60 + (event.get('second', 0) or 0)
        
        validation = validate_event_minute_ocr(video_path, video_second, claimed_minute)
        validation['event_id'] = event.get('id')
        validation['event_type'] = event.get('event_type')
        results.append(validation)
    
    confirmed = sum(1 for r in results if not r['corrected'] and r['confidence'] > 0)
    corrected = sum(1 for r in results if r['corrected'])
    unreadable = sum(1 for r in results if r['confidence'] == 0)
    
    print(f"[OCR] Validação em lote: {confirmed} confirmados, {corrected} corrigidos, {unreadable} ilegíveis")
    
    return results
