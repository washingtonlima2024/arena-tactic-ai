"""
AI Services for Arena Play.
Handles calls to OpenAI, Lovable AI, and other AI APIs.
"""

import os
import json
import base64
import requests
from typing import Optional, List, Dict, Any

# API configuration
LOVABLE_API_KEY = os.environ.get('LOVABLE_API_KEY', '')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
ELEVENLABS_API_KEY = os.environ.get('ELEVENLABS_API_KEY', '')

LOVABLE_API_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions'
OPENAI_API_URL = 'https://api.openai.com/v1'


def set_api_keys(lovable_key: str = None, openai_key: str = None, elevenlabs_key: str = None):
    """Set API keys programmatically."""
    global LOVABLE_API_KEY, OPENAI_API_KEY, ELEVENLABS_API_KEY
    if lovable_key:
        LOVABLE_API_KEY = lovable_key
    if openai_key:
        OPENAI_API_KEY = openai_key
    if elevenlabs_key:
        ELEVENLABS_API_KEY = elevenlabs_key


def call_lovable_ai(
    messages: List[Dict[str, str]],
    model: str = 'google/gemini-2.5-flash',
    temperature: float = 0.7,
    max_tokens: int = 4096
) -> Optional[str]:
    """
    Call Lovable AI Gateway.
    
    Args:
        messages: List of message dicts with 'role' and 'content'
        model: Model to use (default: gemini-2.5-flash)
        temperature: Sampling temperature
        max_tokens: Maximum tokens in response
    
    Returns:
        The AI response text or None on error
    """
    if not LOVABLE_API_KEY:
        raise ValueError("LOVABLE_API_KEY not configured")
    
    response = requests.post(
        LOVABLE_API_URL,
        headers={
            'Authorization': f'Bearer {LOVABLE_API_KEY}',
            'Content-Type': 'application/json'
        },
        json={
            'model': model,
            'messages': messages,
            'temperature': temperature,
            'max_tokens': max_tokens
        },
        timeout=120
    )
    
    if not response.ok:
        print(f"Lovable AI error: {response.status_code} - {response.text}")
        return None
    
    data = response.json()
    return data.get('choices', [{}])[0].get('message', {}).get('content')


def call_openai(
    messages: List[Dict[str, str]],
    model: str = 'gpt-4o-mini',
    temperature: float = 0.7,
    max_tokens: int = 4096
) -> Optional[str]:
    """
    Call OpenAI API.
    
    Args:
        messages: List of message dicts with 'role' and 'content'
        model: Model to use
        temperature: Sampling temperature
        max_tokens: Maximum tokens in response
    
    Returns:
        The AI response text or None on error
    """
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY not configured")
    
    response = requests.post(
        f'{OPENAI_API_URL}/chat/completions',
        headers={
            'Authorization': f'Bearer {OPENAI_API_KEY}',
            'Content-Type': 'application/json'
        },
        json={
            'model': model,
            'messages': messages,
            'temperature': temperature,
            'max_tokens': max_tokens
        },
        timeout=120
    )
    
    if not response.ok:
        print(f"OpenAI error: {response.status_code} - {response.text}")
        return None
    
    data = response.json()
    return data.get('choices', [{}])[0].get('message', {}).get('content')


def text_to_speech(text: str, voice: str = 'nova') -> Optional[bytes]:
    """
    Convert text to speech using OpenAI TTS.
    
    Args:
        text: Text to convert
        voice: Voice to use (alloy, echo, fable, onyx, nova, shimmer)
    
    Returns:
        Audio data as bytes or None on error
    """
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY not configured")
    
    # Truncate text if too long
    text = text[:4000]
    
    response = requests.post(
        f'{OPENAI_API_URL}/audio/speech',
        headers={
            'Authorization': f'Bearer {OPENAI_API_KEY}',
            'Content-Type': 'application/json'
        },
        json={
            'model': 'tts-1',
            'input': text,
            'voice': voice,
            'response_format': 'mp3'
        },
        timeout=120
    )
    
    if not response.ok:
        print(f"OpenAI TTS error: {response.status_code} - {response.text}")
        return None
    
    return response.content


def transcribe_audio(audio_path: str, language: str = 'pt') -> Optional[str]:
    """
    Transcribe audio using OpenAI Whisper.
    
    Args:
        audio_path: Path to audio file
        language: Language code
    
    Returns:
        Transcription text or None on error
    """
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY not configured")
    
    with open(audio_path, 'rb') as audio_file:
        response = requests.post(
            f'{OPENAI_API_URL}/audio/transcriptions',
            headers={
                'Authorization': f'Bearer {OPENAI_API_KEY}'
            },
            files={
                'file': audio_file
            },
            data={
                'model': 'whisper-1',
                'language': language,
                'response_format': 'verbose_json'
            },
            timeout=300
        )
    
    if not response.ok:
        print(f"Whisper error: {response.status_code} - {response.text}")
        return None
    
    data = response.json()
    return data.get('text')


def analyze_match_events(
    transcription: str,
    home_team: str,
    away_team: str,
    current_score: str = '0x0'
) -> List[Dict[str, Any]]:
    """
    Analyze match transcription to extract events.
    
    Args:
        transcription: Match transcription text
        home_team: Home team name
        away_team: Away team name
        current_score: Current score
    
    Returns:
        List of detected events
    """
    system_prompt = f"""Você é um analista de futebol especializado em detectar eventos em transcrições de partidas.
    
Partida: {home_team} vs {away_team}
Placar atual: {current_score}

Analise a transcrição e identifique TODOS os eventos relevantes. Para cada evento, retorne um JSON com:
- event_type: tipo do evento (goal, shot, foul, card, corner, offside, substitution, save, pass, tackle)
- description: descrição em português
- minute: minuto aproximado (se mencionado)
- team: time envolvido (home/away)
- player: nome do jogador (se mencionado)
- is_highlight: true se for um momento importante

Retorne APENAS um array JSON válido com os eventos detectados."""

    response = call_lovable_ai([
        {'role': 'system', 'content': system_prompt},
        {'role': 'user', 'content': transcription}
    ])
    
    if not response:
        return []
    
    # Try to parse JSON from response
    try:
        # Find JSON array in response
        start = response.find('[')
        end = response.rfind(']') + 1
        if start >= 0 and end > start:
            return json.loads(response[start:end])
    except json.JSONDecodeError:
        print(f"Failed to parse events JSON: {response}")
    
    return []


def generate_narration_script(
    events: List[Dict],
    home_team: str,
    away_team: str,
    home_score: int,
    away_score: int
) -> str:
    """
    Generate a narration script for match events.
    
    Args:
        events: List of match events
        home_team: Home team name
        away_team: Away team name
        home_score: Home team score
        away_score: Away team score
    
    Returns:
        Narration script text
    """
    events_text = '\n'.join([
        f"- {e.get('minute', '?')}': {e.get('event_type', 'evento')}: {e.get('description', '')}"
        for e in events
    ])
    
    prompt = f"""Crie uma narração esportiva em português brasileiro para os seguintes momentos da partida:

{home_team} {home_score} x {away_score} {away_team}

Eventos:
{events_text}

Crie uma narração empolgante no estilo de narrador brasileiro, com emoção e energia.
A narração deve ser contínua e fluida, conectando os eventos naturalmente.
Use expressões típicas de narradores brasileiros."""

    response = call_lovable_ai([
        {'role': 'system', 'content': 'Você é um narrador esportivo brasileiro famoso. Narre com emoção e paixão.'},
        {'role': 'user', 'content': prompt}
    ])
    
    return response or ''


def generate_podcast_script(
    events: List[Dict],
    home_team: str,
    away_team: str,
    home_score: int,
    away_score: int,
    podcast_type: str = 'summary'
) -> str:
    """
    Generate a podcast script for match analysis.
    
    Args:
        events: List of match events
        home_team: Home team name
        away_team: Away team name
        home_score: Home team score
        away_score: Away team score
        podcast_type: Type of podcast (summary, tactical, debate)
    
    Returns:
        Podcast script text
    """
    events_text = '\n'.join([
        f"- {e.get('minute', '?')}': {e.get('event_type', 'evento')}: {e.get('description', '')}"
        for e in events
    ])
    
    type_prompts = {
        'summary': 'Crie um resumo narrado do jogo, destacando os principais momentos.',
        'tactical': 'Faça uma análise tática detalhada, discutindo formações, estratégias e movimentações.',
        'debate': 'Crie um debate entre dois comentaristas com opiniões diferentes sobre a partida.'
    }
    
    prompt = f"""{type_prompts.get(podcast_type, type_prompts['summary'])}

{home_team} {home_score} x {away_score} {away_team}

Eventos:
{events_text}

O podcast deve ser em português brasileiro, com linguagem natural e envolvente."""

    response = call_lovable_ai([
        {'role': 'system', 'content': 'Você é um apresentador de podcast esportivo brasileiro.'},
        {'role': 'user', 'content': prompt}
    ])
    
    return response or ''


def analyze_goal_play(
    description: str,
    scorer: str = None,
    assister: str = None,
    team: str = None
) -> Dict[str, Any]:
    """
    Analyze a goal play to generate tactical visualization data.
    
    Args:
        description: Description of the goal
        scorer: Goal scorer name
        assister: Assisting player name
        team: Team that scored
    
    Returns:
        Analysis data with play type, frames, and insights
    """
    prompt = f"""Analise esta jogada de gol e gere dados para visualização tática:

Descrição: {description}
Goleador: {scorer or 'não informado'}
Assistente: {assister or 'não informado'}
Time: {team or 'não informado'}

Retorne um JSON com:
- playType: tipo da jogada (counter_attack, set_piece, individual_skill, team_buildup, etc)
- analysis: descrição detalhada da jogada
- keyMoments: array com os momentos chave
- tacticalInsights: insights táticos sobre a jogada
- frames: array de 30 frames para animação, cada um com:
  - timestamp: 0.0 a 1.0
  - ball: {{x, y}} posição da bola (0-100)
  - players: array de jogadores com {{x, y, team}}"""

    response = call_lovable_ai([
        {'role': 'system', 'content': 'Você é um analista tático de futebol. Retorne APENAS JSON válido.'},
        {'role': 'user', 'content': prompt}
    ])
    
    if not response:
        return {'error': 'Failed to analyze goal'}
    
    try:
        start = response.find('{')
        end = response.rfind('}') + 1
        if start >= 0 and end > start:
            return json.loads(response[start:end])
    except json.JSONDecodeError:
        print(f"Failed to parse goal analysis: {response}")
    
    return {'error': 'Failed to parse analysis'}


def chatbot_response(
    message: str,
    match_context: Dict = None,
    conversation_history: List[Dict] = None
) -> str:
    """
    Generate chatbot response for Arena Play assistant.
    
    Args:
        message: User message
        match_context: Optional match context
        conversation_history: Previous conversation messages
    
    Returns:
        Chatbot response text
    """
    system_prompt = """Você é o Arena Play Assistant, um especialista em futebol brasileiro.
Você ajuda a analisar partidas, responder perguntas táticas e discutir futebol.
Seja amigável, entusiasmado e use linguagem natural em português brasileiro."""

    if match_context:
        system_prompt += f"""

Contexto da partida atual:
- {match_context.get('homeTeam', 'Time A')} {match_context.get('homeScore', 0)} x {match_context.get('awayScore', 0)} {match_context.get('awayTeam', 'Time B')}
- Competição: {match_context.get('competition', 'não informada')}
- Status: {match_context.get('status', 'não informado')}"""

    messages = [{'role': 'system', 'content': system_prompt}]
    
    if conversation_history:
        messages.extend(conversation_history[-10:])  # Keep last 10 messages
    
    messages.append({'role': 'user', 'content': message})
    
    response = call_lovable_ai(messages)
    return response or 'Desculpe, não consegui processar sua mensagem. Tente novamente.'


def team_chatbot_response(
    message: str,
    team_name: str,
    team_type: str,
    match_context: Dict = None,
    conversation_history: List[Dict] = None
) -> str:
    """
    Generate team-specific chatbot response.
    
    Args:
        message: User message
        team_name: Team name
        team_type: home or away
        match_context: Match context
        conversation_history: Previous messages
    
    Returns:
        Chatbot response text
    """
    system_prompt = f"""Você é um torcedor fanático do {team_name}!
Você vive e respira esse time. Defenda seu time com paixão!
Use gírias de torcedor, seja emotivo e apaixonado.
Discuta a partida sempre do ponto de vista do {team_name}."""

    if match_context:
        system_prompt += f"""

Partida atual:
- {match_context.get('homeTeam', 'Time A')} {match_context.get('homeScore', 0)} x {match_context.get('awayScore', 0)} {match_context.get('awayTeam', 'Time B')}"""

    messages = [{'role': 'system', 'content': system_prompt}]
    
    if conversation_history:
        messages.extend(conversation_history[-10:])
    
    messages.append({'role': 'user', 'content': message})
    
    response = call_lovable_ai(messages)
    return response or 'Opa, deu ruim aqui! Manda de novo aí, torcedor!'


def transcribe_audio_base64(audio_base64: str, language: str = 'pt') -> Optional[str]:
    """
    Transcribe audio from base64 data using OpenAI Whisper.
    
    Args:
        audio_base64: Base64-encoded audio data
        language: Language code
    
    Returns:
        Transcription text or None on error
    """
    import tempfile
    
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY not configured")
    
    # Decode base64 and save to temp file
    audio_data = base64.b64decode(audio_base64)
    
    with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as tmp:
        tmp.write(audio_data)
        tmp_path = tmp.name
    
    try:
        return transcribe_audio(tmp_path, language)
    finally:
        import os
        os.unlink(tmp_path)


def extract_live_events(
    transcript: str,
    home_team: str,
    away_team: str,
    current_score: Dict[str, int],
    current_minute: int
) -> List[Dict[str, Any]]:
    """
    Extract live events from a match transcript.
    
    Args:
        transcript: Recent transcript text
        home_team: Home team name
        away_team: Away team name
        current_score: Dict with home and away scores
        current_minute: Current match minute
    
    Returns:
        List of detected events
    """
    if len(transcript) < 20:
        return []
    
    home_score = current_score.get('home', 0)
    away_score = current_score.get('away', 0)
    
    system_prompt = f"""Você analisa transcrições de partidas de futebol AO VIVO e detecta eventos.

Contexto:
- Partida: {home_team} {home_score} x {away_score} {away_team}
- Minuto atual: {current_minute}'

Detecte eventos mencionados na transcrição. Para cada evento retorne:
- event_type: goal, shot, foul, card, corner, offside, substitution, save
- description: descrição curta em português
- minute: minuto do evento
- team: "home" ou "away"
- player: nome do jogador se mencionado
- is_highlight: true se for momento importante

IMPORTANTE: Retorne APENAS um array JSON válido. Sem texto adicional."""

    response = call_lovable_ai([
        {'role': 'system', 'content': system_prompt},
        {'role': 'user', 'content': f"Transcrição: {transcript}"}
    ], max_tokens=2048)
    
    if not response:
        return []
    
    try:
        start = response.find('[')
        end = response.rfind(']') + 1
        if start >= 0 and end > start:
            return json.loads(response[start:end])
    except json.JSONDecodeError:
        print(f"Failed to parse live events: {response}")
    
    return []


def detect_players_in_frame(
    image_data: str = None,
    image_url: str = None,
    frame_timestamp: float = 0
) -> Dict[str, Any]:
    """
    Detect players in a video frame using vision model.
    
    Args:
        image_data: Base64-encoded image
        image_url: URL to image
        frame_timestamp: Timestamp of the frame
    
    Returns:
        Detection results with players, ball, etc.
    """
    if not LOVABLE_API_KEY:
        raise ValueError("LOVABLE_API_KEY not configured")
    
    # Build the content with image
    content = []
    content.append({
        "type": "text",
        "text": """Analise esta imagem de partida de futebol e detecte:

1. Jogadores visíveis (posição x,y em %, cor do uniforme, número se visível)
2. Bola (posição x,y em %)
3. Árbitros (posição x,y)
4. Área do campo visível

Retorne JSON com:
{
  "players": [{"x": 0-100, "y": 0-100, "team": "home/away/unknown", "number": null, "confidence": 0-1}],
  "ball": {"x": 0-100, "y": 0-100, "confidence": 0-1} ou null,
  "referees": [{"x": 0-100, "y": 0-100}],
  "fieldArea": "attacking/midfield/defending",
  "homeTeamColor": "#hexcolor",
  "awayTeamColor": "#hexcolor"
}"""
    })
    
    if image_data:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}
        })
    elif image_url:
        content.append({
            "type": "image_url",
            "image_url": {"url": image_url}
        })
    else:
        return {"error": "No image provided"}
    
    response = requests.post(
        LOVABLE_API_URL,
        headers={
            'Authorization': f'Bearer {LOVABLE_API_KEY}',
            'Content-Type': 'application/json'
        },
        json={
            'model': 'google/gemini-2.5-flash',
            'messages': [{'role': 'user', 'content': content}],
            'max_tokens': 2048
        },
        timeout=60
    )
    
    if not response.ok:
        print(f"Detection error: {response.status_code}")
        return {"error": f"API error: {response.status_code}"}
    
    data = response.json()
    result_text = data.get('choices', [{}])[0].get('message', {}).get('content', '')
    
    try:
        start = result_text.find('{')
        end = result_text.rfind('}') + 1
        if start >= 0 and end > start:
            result = json.loads(result_text[start:end])
            result['frameTimestamp'] = frame_timestamp
            return result
    except json.JSONDecodeError:
        print(f"Failed to parse detection: {result_text}")
    
    return {"error": "Failed to parse detection results"}


def generate_thumbnail_image(
    prompt: str,
    event_id: str = None,
    match_id: str = None
) -> Dict[str, Any]:
    """
    Generate a thumbnail image using AI.
    
    Args:
        prompt: Description for the image
        event_id: Related event ID
        match_id: Related match ID
    
    Returns:
        Dict with image data or error
    """
    if not LOVABLE_API_KEY:
        raise ValueError("LOVABLE_API_KEY not configured")
    
    response = requests.post(
        LOVABLE_API_URL,
        headers={
            'Authorization': f'Bearer {LOVABLE_API_KEY}',
            'Content-Type': 'application/json'
        },
        json={
            'model': 'google/gemini-2.5-flash-image-preview',
            'messages': [
                {
                    'role': 'user',
                    'content': f"Generate a high-quality thumbnail image: {prompt}. Style: sports, dynamic, vibrant colors."
                }
            ],
            'modalities': ['image', 'text']
        },
        timeout=120
    )
    
    if not response.ok:
        if response.status_code == 429:
            return {"error": "Rate limit exceeded"}
        if response.status_code == 402:
            return {"error": "Insufficient credits"}
        return {"error": f"API error: {response.status_code}"}
    
    data = response.json()
    
    # Extract image from response
    images = data.get('choices', [{}])[0].get('message', {}).get('images', [])
    if images:
        image_url = images[0].get('image_url', {}).get('url', '')
        return {
            "success": True,
            "imageData": image_url,
            "eventId": event_id,
            "matchId": match_id
        }
    
    return {"error": "No image generated"}


def transcribe_large_video(
    video_url: str,
    match_id: str = None
) -> Dict[str, Any]:
    """
    Transcribe a large video file.
    
    Args:
        video_url: URL to the video file (can be local /api/storage/ path or external URL)
        match_id: Related match ID
    
    Returns:
        Dict with transcription and SRT content
    """
    import subprocess
    import tempfile
    from storage import get_file_path, STORAGE_DIR
    
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY not configured")
    
    print(f"[Transcribe] Iniciando transcrição para: {video_url}")
    
    # Download video
    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = os.path.join(tmpdir, 'video.mp4')
        audio_path = os.path.join(tmpdir, 'audio.mp3')
        
        # Check if it's a local URL and resolve to disk path
        is_local = False
        if video_url.startswith('/api/storage/') or 'localhost' in video_url:
            is_local = True
            # Parse: /api/storage/{match_id}/{subfolder}/{filename} or http://localhost:5000/api/storage/...
            clean_url = video_url.replace('http://localhost:5000', '').replace('http://127.0.0.1:5000', '')
            parts = clean_url.strip('/').split('/')
            # Expected: ['api', 'storage', match_id, subfolder, filename...]
            if len(parts) >= 5 and parts[0] == 'api' and parts[1] == 'storage':
                local_match_id = parts[2]
                subfolder = parts[3]
                filename = '/'.join(parts[4:])
                local_path = get_file_path(local_match_id, subfolder, filename)
                print(f"[Transcribe] URL local detectada -> Caminho: {local_path}")
                
                if local_path and os.path.exists(local_path):
                    # Copy local file to temp directory
                    import shutil
                    shutil.copy(local_path, video_path)
                    print(f"[Transcribe] Arquivo local copiado para: {video_path}")
                else:
                    return {"error": f"Local file not found: {local_path}"}
            else:
                return {"error": f"Invalid local URL format: {video_url}"}
        else:
            # External URL - download normally
            print(f"[Transcribe] URL externa, baixando...")
            try:
                response = requests.get(video_url, stream=True, timeout=300)
                response.raise_for_status()
                with open(video_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                print(f"[Transcribe] Download concluído: {video_path}")
            except Exception as e:
                return {"error": f"Failed to download video: {str(e)}"}
        
        # Extract audio with ffmpeg
        try:
            cmd = [
                'ffmpeg', '-y', '-i', video_path,
                '-vn', '-acodec', 'libmp3lame', '-ab', '128k',
                audio_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if result.returncode != 0:
                return {"error": f"FFmpeg error: {result.stderr}"}
        except Exception as e:
            return {"error": f"Failed to extract audio: {str(e)}"}
        
        # Transcribe with Whisper (verbose format for timestamps)
        with open(audio_path, 'rb') as audio_file:
            response = requests.post(
                f'{OPENAI_API_URL}/audio/transcriptions',
                headers={'Authorization': f'Bearer {OPENAI_API_KEY}'},
                files={'file': audio_file},
                data={
                    'model': 'whisper-1',
                    'language': 'pt',
                    'response_format': 'verbose_json'
                },
                timeout=600
            )
        
        if not response.ok:
            return {"error": f"Whisper error: {response.status_code}"}
        
        data = response.json()
        text = data.get('text', '')
        segments = data.get('segments', [])
        
        # Generate SRT content
        srt_lines = []
        for i, seg in enumerate(segments, 1):
            start = _format_srt_time(seg.get('start', 0))
            end = _format_srt_time(seg.get('end', 0))
            text_seg = seg.get('text', '').strip()
            srt_lines.append(f"{i}\n{start} --> {end}\n{text_seg}\n")
        
        srt_content = '\n'.join(srt_lines)
        
        return {
            "success": True,
            "text": text,
            "srtContent": srt_content,
            "segments": segments,
            "matchId": match_id
        }


def _format_srt_time(seconds: float) -> str:
    """Format seconds to SRT timestamp format."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"
