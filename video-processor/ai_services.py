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
