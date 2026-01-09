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
GOOGLE_API_KEY = os.environ.get('GOOGLE_GENERATIVE_AI_API_KEY', '')
OLLAMA_URL = os.environ.get('OLLAMA_URL', 'http://localhost:11434')
OLLAMA_MODEL = os.environ.get('OLLAMA_MODEL', 'llama3.2')
OLLAMA_ENABLED = os.environ.get('OLLAMA_ENABLED', 'false').lower() == 'true'

# Provider enabled flags (default all enabled if key exists)
GEMINI_ENABLED = True
OPENAI_ENABLED = True
ELEVENLABS_ENABLED = True

LOVABLE_API_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions'
OPENAI_API_URL = 'https://api.openai.com/v1'
GOOGLE_API_URL = 'https://generativelanguage.googleapis.com/v1beta'


def set_api_keys(
    lovable_key: str = None, 
    openai_key: str = None, 
    elevenlabs_key: str = None, 
    google_key: str = None,
    ollama_url: str = None,
    ollama_model: str = None,
    ollama_enabled: bool = None,
    gemini_enabled: bool = None,
    openai_enabled: bool = None,
    elevenlabs_enabled: bool = None
):
    """Set API keys programmatically."""
    global LOVABLE_API_KEY, OPENAI_API_KEY, ELEVENLABS_API_KEY, GOOGLE_API_KEY
    global OLLAMA_URL, OLLAMA_MODEL, OLLAMA_ENABLED
    global GEMINI_ENABLED, OPENAI_ENABLED, ELEVENLABS_ENABLED
    if lovable_key:
        LOVABLE_API_KEY = lovable_key
    if openai_key:
        OPENAI_API_KEY = openai_key
    if elevenlabs_key:
        ELEVENLABS_API_KEY = elevenlabs_key
    if google_key:
        GOOGLE_API_KEY = google_key
    if ollama_url:
        OLLAMA_URL = ollama_url
    if ollama_model:
        OLLAMA_MODEL = ollama_model
    if ollama_enabled is not None:
        OLLAMA_ENABLED = ollama_enabled
    if gemini_enabled is not None:
        GEMINI_ENABLED = gemini_enabled
    if openai_enabled is not None:
        OPENAI_ENABLED = openai_enabled
    if elevenlabs_enabled is not None:
        ELEVENLABS_ENABLED = elevenlabs_enabled


def call_ollama(
    messages: List[Dict[str, str]],
    model: str = None,
    temperature: float = 0.7,
    max_tokens: int = 4096
) -> Optional[str]:
    """
    Call local Ollama API.
    
    Args:
        messages: List of message dicts with 'role' and 'content'
        model: Model to use (default: from settings)
        temperature: Sampling temperature
        max_tokens: Maximum tokens in response
    
    Returns:
        The AI response text or None on error
    """
    model = model or OLLAMA_MODEL
    url = f"{OLLAMA_URL}/api/chat"
    
    try:
        response = requests.post(
            url,
            json={
                'model': model,
                'messages': messages,
                'stream': False,
                'options': {
                    'temperature': temperature,
                    'num_predict': max_tokens
                }
            },
            timeout=300
        )
        
        if not response.ok:
            print(f"Ollama error: {response.status_code} - {response.text}")
            return None
        
        data = response.json()
        return data.get('message', {}).get('content')
    except requests.exceptions.ConnectionError:
        print(f"Ollama not available at {OLLAMA_URL}")
        return None
    except Exception as e:
        print(f"Ollama request error: {e}")
        return None


def call_google_gemini(
    messages: List[Dict[str, str]],
    model: str = 'gemini-2.5-flash',
    temperature: float = 0.7,
    max_tokens: int = 4096
) -> Optional[str]:
    """
    Call Google Gemini API directly.
    
    Args:
        messages: List of message dicts with 'role' and 'content'
        model: Model to use (default: gemini-2.5-flash)
        temperature: Sampling temperature
        max_tokens: Maximum tokens in response
    
    Returns:
        The AI response text or None on error
    """
    if not GOOGLE_API_KEY:
        raise ValueError("GOOGLE_API_KEY not configured")
    
    # Map model names
    model_map = {
        'gemini-2.5-flash': 'gemini-2.0-flash',
        'gemini-2.5-pro': 'gemini-2.0-pro',
        'google/gemini-2.5-flash': 'gemini-2.0-flash',
        'google/gemini-2.5-pro': 'gemini-2.0-pro',
    }
    api_model = model_map.get(model, 'gemini-2.0-flash')
    
    # Convert messages to Gemini format
    contents = []
    system_instruction = None
    
    for msg in messages:
        role = msg.get('role', 'user')
        content = msg.get('content', '')
        
        if role == 'system':
            system_instruction = content
        else:
            gemini_role = 'user' if role == 'user' else 'model'
            contents.append({
                'role': gemini_role,
                'parts': [{'text': content}]
            })
    
    payload = {
        'contents': contents,
        'generationConfig': {
            'temperature': temperature,
            'maxOutputTokens': max_tokens,
        }
    }
    
    if system_instruction:
        payload['systemInstruction'] = {'parts': [{'text': system_instruction}]}
    
    url = f"{GOOGLE_API_URL}/models/{api_model}:generateContent?key={GOOGLE_API_KEY}"
    
    try:
        response = requests.post(url, json=payload, timeout=120)
        
        if not response.ok:
            print(f"Google Gemini error: {response.status_code} - {response.text}")
            return None
        
        data = response.json()
        candidates = data.get('candidates', [])
        if candidates:
            content = candidates[0].get('content', {})
            parts = content.get('parts', [])
            if parts:
                return parts[0].get('text', '')
        return None
    except Exception as e:
        print(f"Google Gemini request error: {e}")
        return None


def call_ai(
    messages: List[Dict[str, str]],
    model: str = 'gemini-2.5-flash',
    temperature: float = 0.7,
    max_tokens: int = 4096
) -> Optional[str]:
    """
    Universal AI caller - tries Ollama (if enabled), then Lovable AI, then Google Gemini, then OpenAI.
    
    Args:
        messages: List of message dicts
        model: Model to use
        temperature: Sampling temperature
        max_tokens: Maximum tokens
    
    Returns:
        AI response text or None
    """
    # Try Ollama first if enabled (local, free)
    if OLLAMA_ENABLED:
        try:
            result = call_ollama(messages, model=OLLAMA_MODEL, temperature=temperature, max_tokens=max_tokens)
            if result:
                print(f"[AI] Using Ollama ({OLLAMA_MODEL})")
                return result
        except Exception as e:
            print(f"Ollama failed, trying cloud APIs: {e}")
    
    # Try Lovable AI (if key available)
    if LOVABLE_API_KEY:
        try:
            result = call_lovable_ai(messages, model, temperature, max_tokens)
            if result:
                return result
        except Exception as e:
            print(f"Lovable AI failed, trying fallback: {e}")
    
    # Try Google Gemini directly (if enabled)
    if GEMINI_ENABLED and GOOGLE_API_KEY:
        try:
            result = call_google_gemini(messages, model, temperature, max_tokens)
            if result:
                return result
        except Exception as e:
            print(f"Google Gemini failed, trying OpenAI: {e}")
    
    # Fallback to OpenAI (if enabled)
    if OPENAI_ENABLED and OPENAI_API_KEY:
        try:
            return call_openai(messages, 'gpt-4o-mini', temperature, max_tokens)
        except Exception as e:
            print(f"OpenAI also failed: {e}")
    
    raise ValueError("No AI API configured. Enable Ollama or configure API keys in Settings > API.")


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


def _transcribe_with_elevenlabs(audio_path: str, match_id: str = None) -> Dict[str, Any]:
    """
    Transcribe audio using ElevenLabs Scribe API (scribe_v1).
    
    Supports files up to ~1GB, better quality for Portuguese.
    
    Args:
        audio_path: Path to audio file
        match_id: Optional match ID for metadata
    
    Returns:
        Dict with 'success', 'text', 'srtContent', 'segments'
    """
    if not ELEVENLABS_API_KEY:
        return {"error": "ELEVENLABS_API_KEY not configured", "success": False}
    
    try:
        audio_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
        print(f"[ElevenLabs] Transcrevendo {audio_size_mb:.1f}MB com Scribe v1...")
        
        with open(audio_path, 'rb') as audio_file:
            response = requests.post(
                'https://api.elevenlabs.io/v1/speech-to-text',
                headers={
                    'xi-api-key': ELEVENLABS_API_KEY
                },
                files={
                    'file': ('audio.mp3', audio_file, 'audio/mpeg')
                },
                data={
                    'model_id': 'scribe_v1',
                    'language_code': 'por',
                    'diarize': 'false',
                    'tag_audio_events': 'false'
                },
                timeout=900  # 15 minutes for large files
            )
        
        if not response.ok:
            error_text = response.text[:500] if response.text else 'Unknown error'
            print(f"[ElevenLabs] Erro {response.status_code}: {error_text}")
            return {"error": f"ElevenLabs error: {response.status_code}", "success": False}
        
        data = response.json()
        text = data.get('text', '')
        words = data.get('words', [])
        
        if not text:
            return {"error": "ElevenLabs returned empty transcription", "success": False}
        
        # Convert words to SRT format
        srt_lines = []
        segment_size = 10  # Words per subtitle line
        
        for i in range(0, len(words), segment_size):
            chunk_words = words[i:i+segment_size]
            if not chunk_words:
                continue
            
            start_time = chunk_words[0].get('start', 0)
            end_time = chunk_words[-1].get('end', start_time + 1)
            chunk_text = ' '.join(w.get('text', '') for w in chunk_words).strip()
            
            if chunk_text:
                idx = (i // segment_size) + 1
                start_str = _format_srt_time(start_time)
                end_str = _format_srt_time(end_time)
                srt_lines.append(f"{idx}\n{start_str} --> {end_str}\n{chunk_text}\n")
        
        srt_content = '\n'.join(srt_lines)
        
        # Build segments array for compatibility
        segments = []
        for i in range(0, len(words), segment_size):
            chunk_words = words[i:i+segment_size]
            if not chunk_words:
                continue
            segments.append({
                'start': chunk_words[0].get('start', 0),
                'end': chunk_words[-1].get('end', 0),
                'text': ' '.join(w.get('text', '') for w in chunk_words).strip()
            })
        
        print(f"[ElevenLabs] ✓ Transcrição completa: {len(text)} chars, {len(segments)} segmentos")
        
        return {
            "success": True,
            "text": text,
            "srtContent": srt_content,
            "segments": segments,
            "matchId": match_id,
            "provider": "elevenlabs"
        }
        
    except requests.exceptions.Timeout:
        print(f"[ElevenLabs] Timeout na transcrição")
        return {"error": "ElevenLabs timeout", "success": False}
    except Exception as e:
        print(f"[ElevenLabs] Erro: {e}")
        return {"error": f"ElevenLabs error: {str(e)}", "success": False}


def analyze_match_events(
    transcription: str,
    home_team: str,
    away_team: str,
    game_start_minute: int = 0,
    game_end_minute: int = 45,
    max_retries: int = 3
) -> List[Dict[str, Any]]:
    """
    Analyze match transcription to extract events using advanced few-shot prompting.
    
    Args:
        transcription: Match transcription text
        home_team: Home team name
        away_team: Away team name
        game_start_minute: Start minute of the game segment
        game_end_minute: End minute of the game segment
        max_retries: Maximum retry attempts on failure
    
    Returns:
        List of detected events with validated scores
    """
    import time
    
    half_desc = "1º Tempo (0-45 min)" if game_start_minute < 45 else "2º Tempo (45-90 min)"
    match_half = 'first' if game_start_minute < 45 else 'second'
    
    # System prompt SYNCHRONIZED with Edge Function (analyze-match/index.ts)
    system_prompt = f"""Você é um NARRADOR VETERANO de futebol brasileiro com 30 anos de experiência.
Sua missão CRÍTICA é extrair ABSOLUTAMENTE TODOS os eventos da narração, especialmente GOLS.

⚽⚽⚽ REGRA NÚMERO 1 - NUNCA PERCA UM GOL! ⚽⚽⚽

Quando o narrador gritar "GOOOL!", "GOLAÇO!", "É GOL!", "PRA DENTRO!" ou qualquer variação:
→ VOCÊ DEVE CRIAR UM EVENTO DE GOL IMEDIATAMENTE!

═══════════════════════════════════════════════════════════════
PALAVRAS-CHAVE PARA GOLS (NUNCA IGNORE):
═══════════════════════════════════════════════════════════════
- "GOOOL", "GOOOOL", "GOL", "GOLAÇO" → É GOL!
- "PRA DENTRO", "ENTROU", "MANDOU PRA REDE" → É GOL!
- "BOLA NO FUNDO DA REDE", "ESTUFOU A REDE" → É GOL!
- "ABRE O PLACAR", "AMPLIA", "EMPATA", "VIRA O JOGO" → É GOL!
- "PRIMEIRO GOL", "SEGUNDO GOL", "TERCEIRO GOL" → É GOL!
- "GOL CONTRA", "PRÓPRIO GOL" → É GOL COM isOwnGoal: true!

═══════════════════════════════════════════════════════════════
EXEMPLOS DE EXTRAÇÃO (FEW-SHOT LEARNING):
═══════════════════════════════════════════════════════════════

EXEMPLO 1 - GOL NORMAL:
Narração: "GOOOOOL do Brasil! Neymar chuta e a bola entra!"
→ {{"minute": 23, "event_type": "goal", "team": "home", "description": "GOOOOL! Neymar marca!", "isOwnGoal": false, "is_highlight": true}}

EXEMPLO 2 - GOL COM EMOÇÃO:
Narração: "PRA DENTRO! É GOLAÇO! Que pintura!"
→ {{"minute": 35, "event_type": "goal", "team": "home", "description": "GOLAÇO! Pintura de gol!", "isOwnGoal": false, "is_highlight": true}}

EXEMPLO 3 - GOL CONTRA:
Narração: "Que azar! Gol contra! O zagueiro mandou contra!"
→ {{"minute": 40, "event_type": "goal", "team": "home", "description": "GOL CONTRA! Zagueiro falha!", "isOwnGoal": true, "is_highlight": true}}

EXEMPLO 4 - CARTÃO AMARELO:
Narração: "Cartão amarelo para o lateral"
→ {{"minute": 28, "event_type": "yellow_card", "team": "away", "description": "Amarelo para o lateral", "is_highlight": true}}

EXEMPLO 5 - DEFESA DIFÍCIL:
Narração: "Que defesa! O goleiro salva!"
→ {{"minute": 15, "event_type": "save", "team": "away", "description": "Defesa espetacular!", "is_highlight": false}}

EXEMPLO 6 - CHANCE PERDIDA:
Narração: "Quase! Passou perto da trave!"
→ {{"minute": 32, "event_type": "chance", "team": "home", "description": "Bola raspando a trave!", "is_highlight": true}}

═══════════════════════════════════════════════════════════════
REGRAS CRÍTICAS:
═══════════════════════════════════════════════════════════════

1. ⚽ GOLS SÃO PRIORIDADE MÁXIMA - Se tem "GOL" na narração, CRIE O EVENTO!
2. Cada vez que o narrador menciona um gol, CONTE COMO +1 NO PLACAR
3. GOLS CONTRA: isOwnGoal=true quando marcam em seu próprio gol
4. TIME CORRETO: Analise contexto para saber quem atacava
5. MINUTOS: Devem estar entre {game_start_minute} e {game_end_minute}
6. DESCRIÇÕES: Máximo 60 caracteres, capture a EMOÇÃO!

TIPOS DE EVENTOS:
goal, shot, save, foul, yellow_card, red_card, corner, offside, substitution, chance, penalty

TIMES DA PARTIDA:
- HOME (casa): {home_team}
- AWAY (visitante): {away_team}
- Período: {half_desc}

FORMATO DE SAÍDA: Retorne APENAS um array JSON válido, sem explicações."""

    user_prompt = f"""⚽⚽⚽ MISSÃO CRÍTICA: ENCONTRAR TODOS OS GOLS! ⚽⚽⚽

═══════════════════════════════════════════════════════════════
PARTIDA: {home_team} (casa) vs {away_team} (visitante)
PERÍODO: {half_desc} (minutos {game_start_minute}' a {game_end_minute}')
═══════════════════════════════════════════════════════════════

INSTRUÇÕES (SIGA EXATAMENTE):

1️⃣ PRIMEIRO: Leia TODA a transcrição abaixo
2️⃣ SEGUNDO: PROCURE por TODAS as palavras: GOL, GOOOL, GOLAÇO, ENTROU, PRA DENTRO
3️⃣ TERCEIRO: Para CADA gol encontrado, crie um evento com event_type: "goal"
4️⃣ QUARTO: Identifique cartões, faltas, chances, defesas
5️⃣ QUINTO: Retorne o array JSON com todos os eventos

═══════════════════════════════════════════════════════════════
TRANSCRIÇÃO COMPLETA (LEIA COM ATENÇÃO):
═══════════════════════════════════════════════════════════════

{transcription}

═══════════════════════════════════════════════════════════════
⚽ CHECKLIST DE VALIDAÇÃO (ANTES DE RESPONDER):
═══════════════════════════════════════════════════════════════
□ Quantas vezes aparece "GOL" na transcrição? → Deve haver o mesmo número de eventos de gol
□ Cada gol tem team: "home" ou "away" correto?
□ Gols contra têm isOwnGoal: true?

LEMBRE-SE:
- Gols de {home_team} → team: "home"
- Gols de {away_team} → team: "away"
- Gol contra de {home_team} → team: "home", isOwnGoal: true
- Gol contra de {away_team} → team: "away", isOwnGoal: true

RETORNE APENAS O ARRAY JSON, SEM TEXTO ADICIONAL.
═══════════════════════════════════════════════════════════════"""

    events = []
    last_error = None
    
    for attempt in range(max_retries):
        try:
            print(f"[AI] Análise tentativa {attempt + 1}/{max_retries}")
            
            # Use gemini-2.5-flash (faster and consistent with Edge Function)
            response = call_ai([
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt}
            ], model='google/gemini-2.5-flash', max_tokens=8192)
            
            if not response:
                last_error = "Empty response from AI"
                time.sleep(2)
                continue
            
            # Parse JSON from response
            start = response.find('[')
            end = response.rfind(']') + 1
            if start >= 0 and end > start:
                events = json.loads(response[start:end])
                print(f"[AI] ✓ Parsed {len(events)} events from response")
                
                # Validate and enrich events
                validated_events = []
                for event in events:
                    # Ensure required fields
                    event['event_type'] = event.get('event_type', 'unknown')
                    event['minute'] = max(game_start_minute, min(game_end_minute, event.get('minute', game_start_minute)))
                    event['team'] = event.get('team', 'home')
                    event['description'] = event.get('description', '')[:200]
                    event['is_highlight'] = event.get('is_highlight', event['event_type'] in ['goal', 'yellow_card', 'red_card', 'penalty'])
                    event['isOwnGoal'] = event.get('isOwnGoal', False)
                    validated_events.append(event)
                
                return validated_events
            else:
                last_error = f"No JSON array found in response: {response[:200]}"
                
        except json.JSONDecodeError as e:
            last_error = f"JSON parse error: {e}"
            print(f"[AI] JSON parse failed: {e}")
        except Exception as e:
            last_error = str(e)
            print(f"[AI] Error: {e}")
        
        if attempt < max_retries - 1:
            time.sleep(2 * (attempt + 1))  # Exponential backoff
    
    print(f"[AI] All {max_retries} attempts failed. Last error: {last_error}")
    return []


def validate_goal_detection(transcription: str, detected_events: List[Dict]) -> Dict:
    """
    Valida se todos os gols mencionados na transcrição foram detectados pela IA.
    Retorna um relatório de validação com alertas se houver discrepâncias.
    """
    # Palavras-chave que indicam gols na transcrição
    goal_keywords = [
        'GOOOL', 'GOLAÇO', 'GOL!', 'É GOL', 'PRA DENTRO', 'ENTROU',
        'PRIMEIRO GOL', 'SEGUNDO GOL', 'TERCEIRO GOL', 'QUARTO GOL',
        'QUINTO GOL', 'GOL DE', 'GOL DO', 'GOOOOL', 'GOLAAAAÇO',
        'ABRIU O PLACAR', 'EMPATA O JOGO', 'VIROU O JOGO', 'GOL CONTRA'
    ]
    
    transcription_upper = transcription.upper()
    
    # Contar menções de gol (evitando contagem dupla)
    goal_mentions = 0
    for kw in goal_keywords:
        count = transcription_upper.count(kw)
        if count > 0:
            goal_mentions += count
            print(f"[VALIDATION] Keyword '{kw}' encontrada {count}x na transcrição")
    
    # Filtrar para evitar falsos positivos (algumas palavras aparecem juntas)
    # Ex: "GOOOL" e "É GOL" podem se referir ao mesmo gol
    estimated_goals = min(goal_mentions, 10)  # Cap em 10 para evitar falsos positivos extremos
    
    # Contar gols detectados pela IA
    detected_goals = len([e for e in detected_events if e.get('event_type') == 'goal'])
    
    validation_result = {
        'goal_keywords_found': goal_mentions,
        'estimated_goals': estimated_goals,
        'detected_goals': detected_goals,
        'discrepancy': estimated_goals - detected_goals if estimated_goals > detected_goals else 0,
        'warning': None
    }
    
    # Alertar se houver discrepância significativa
    if estimated_goals > detected_goals:
        warning = f"⚠️ ALERTA DE VALIDAÇÃO: {goal_mentions} menções de gol na transcrição, " \
                  f"mas apenas {detected_goals} gols detectados pela IA. " \
                  f"Possível perda de {estimated_goals - detected_goals} gol(s)!"
        print(warning)
        validation_result['warning'] = warning
    else:
        print(f"[VALIDATION] ✓ Validação OK: {detected_goals} gols detectados, " \
              f"{goal_mentions} menções na transcrição")
    
    return validation_result


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

    response = call_ai([
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

    response = call_ai([
        {'role': 'system', 'content': 'Você é um apresentador de podcast esportivo brasileiro.'},
        {'role': 'user', 'content': prompt}
    ])
    
    return response or ''


def generate_tactical_summary(
    events: List[Dict],
    home_team: str,
    away_team: str,
    home_score: int,
    away_score: int
) -> Dict[str, Any]:
    """
    Generate comprehensive tactical analysis summary from match events.
    
    Args:
        events: List of match events
        home_team: Home team name
        away_team: Away team name
        home_score: Final home score
        away_score: Final away score
    
    Returns:
        Dict with tactical analysis data for dashboard
    """
    # Aggregate event statistics
    event_counts = {}
    for event in events:
        event_type = event.get('event_type', 'unknown')
        event_counts[event_type] = event_counts.get(event_type, 0) + 1
    
    # Create events summary text
    events_text = '\n'.join([
        f"- {e.get('minute', '?')}': {e.get('event_type', 'evento')}: {e.get('description', '')}"
        for e in events[:50]  # Limit to 50 events for prompt
    ])
    
    system_prompt = f"""Você é um analista tático de futebol profissional.
Analise a partida e gere um relatório tático completo.

Partida: {home_team} {home_score} x {away_score} {away_team}

Estatísticas de eventos detectados:
{json.dumps(event_counts, indent=2)}

Retorne APENAS um JSON válido com a seguinte estrutura:
{{
  "matchSummary": "Resumo geral da partida em 2-3 frases",
  "possession": {{"home": 50, "away": 50}},
  "keyMoments": [
    {{"minute": 0, "description": "Momento chave", "impact": "high/medium/low"}}
  ],
  "tacticalPatterns": [
    "Padrão tático 1",
    "Padrão tático 2"
  ],
  "homeTeamAnalysis": {{
    "strengths": ["Ponto forte 1"],
    "weaknesses": ["Ponto fraco 1"],
    "style": "Estilo de jogo"
  }},
  "awayTeamAnalysis": {{
    "strengths": ["Ponto forte 1"],
    "weaknesses": ["Ponto fraco 1"],
    "style": "Estilo de jogo"
  }},
  "intensityByPeriod": [
    {{"period": "0-15", "intensity": 70}},
    {{"period": "16-30", "intensity": 65}},
    {{"period": "31-45", "intensity": 80}},
    {{"period": "46-60", "intensity": 75}},
    {{"period": "61-75", "intensity": 85}},
    {{"period": "76-90", "intensity": 90}}
  ],
  "statistics": {{
    "goals": {home_score + away_score},
    "shots": 0,
    "fouls": 0,
    "cards": 0,
    "corners": 0
  }}
}}"""

    response = call_ai([
        {'role': 'system', 'content': system_prompt},
        {'role': 'user', 'content': f"Eventos da partida:\n{events_text}"}
    ], max_tokens=4096)
    
    if not response:
        return {
            'matchSummary': f'{home_team} {home_score} x {away_score} {away_team}',
            'possession': {'home': 50, 'away': 50},
            'keyMoments': [],
            'tacticalPatterns': [],
            'homeTeamAnalysis': {'strengths': [], 'weaknesses': [], 'style': 'Não analisado'},
            'awayTeamAnalysis': {'strengths': [], 'weaknesses': [], 'style': 'Não analisado'},
            'intensityByPeriod': [],
            'statistics': event_counts
        }
    
    try:
        start = response.find('{')
        end = response.rfind('}') + 1
        if start >= 0 and end > start:
            result = json.loads(response[start:end])
            # Merge event counts into statistics
            result['statistics'] = {**event_counts, **result.get('statistics', {})}
            result['homeTeam'] = home_team
            result['awayTeam'] = away_team
            result['homeScore'] = home_score
            result['awayScore'] = away_score
            return result
    except json.JSONDecodeError:
        print(f"Failed to parse tactical summary: {response}")
    
    return {
        'matchSummary': f'{home_team} {home_score} x {away_score} {away_team}',
        'possession': {'home': 50, 'away': 50},
        'statistics': event_counts
    }


def analyze_goal_play_data(
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

    response = call_ai([
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
    
    response = call_ai(messages)
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
    
    response = call_ai(messages)
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

    response = call_ai([
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
    if not LOVABLE_API_KEY and not GOOGLE_API_KEY:
        raise ValueError("LOVABLE_API_KEY or GOOGLE_API_KEY not configured")
    
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
    
    # Try Lovable AI first
    if LOVABLE_API_KEY:
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
    elif GOOGLE_API_KEY:
        # Use Google Gemini directly for vision
        parts = [{"text": content[0]["text"]}]
        if image_data:
            parts.append({"inline_data": {"mime_type": "image/jpeg", "data": image_data}})
        
        response = requests.post(
            f"{GOOGLE_API_URL}/models/gemini-2.0-flash:generateContent?key={GOOGLE_API_KEY}",
            json={
                'contents': [{'role': 'user', 'parts': parts}],
                'generationConfig': {'maxOutputTokens': 2048}
            },
            timeout=60
        )
    else:
        return {"error": "No API key configured"}
    
    if not response.ok:
        print(f"Detection error: {response.status_code}")
        return {"error": f"API error: {response.status_code}"}
    
    data = response.json()
    
    # Parse response based on API used
    if LOVABLE_API_KEY:
        result_text = data.get('choices', [{}])[0].get('message', {}).get('content', '')
    else:
        # Google Gemini format
        candidates = data.get('candidates', [])
        if candidates:
            parts = candidates[0].get('content', {}).get('parts', [])
            result_text = parts[0].get('text', '') if parts else ''
        else:
            result_text = ''
    
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


def _transcribe_with_gemini(audio_path: str, match_id: str = None) -> Dict[str, Any]:
    """
    Transcribe audio using Google Gemini via Lovable AI Gateway.
    
    Works for files up to ~20MB. Converts audio to base64 and sends
    to the Gemini model for transcription.
    """
    import base64
    
    # Use Lovable API or direct Google API
    api_key = LOVABLE_API_KEY or GOOGLE_API_KEY
    if not api_key:
        return {"error": "Nenhuma chave de API Gemini configurada", "success": False}
    
    # Check file size (max 20MB for inline data)
    audio_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
    if audio_size_mb > 20:
        return {"error": f"Arquivo muito grande para Gemini: {audio_size_mb:.1f}MB (máx 20MB)", "success": False}
    
    try:
        # Read and encode audio
        with open(audio_path, 'rb') as f:
            audio_base64 = base64.b64encode(f.read()).decode('utf-8')
        
        # Determine file extension for mime type
        ext = os.path.splitext(audio_path)[1].lower()
        mime_types = {
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.m4a': 'audio/mp4',
            '.ogg': 'audio/ogg',
            '.flac': 'audio/flac'
        }
        mime_type = mime_types.get(ext, 'audio/mpeg')
        
        # Use Lovable AI Gateway if available
        if LOVABLE_API_KEY:
            response = requests.post(
                LOVABLE_API_URL,
                headers={
                    'Authorization': f'Bearer {LOVABLE_API_KEY}',
                    'Content-Type': 'application/json'
                },
                json={
                    'model': 'google/gemini-2.5-flash',
                    'messages': [{
                        'role': 'user',
                        'content': [
                            {
                                'type': 'input_audio',
                                'input_audio': {
                                    'data': audio_base64,
                                    'format': ext.replace('.', '') or 'mp3'
                                }
                            },
                            {
                                'type': 'text',
                                'text': '''Transcreva este áudio em português brasileiro. 
Retorne APENAS a transcrição completa do texto falado, sem comentários ou explicações adicionais.
Se houver múltiplos falantes, separe as falas com quebras de linha.'''
                            }
                        ]
                    }]
                },
                timeout=600
            )
        else:
            # Use Google Generative AI API directly
            response = requests.post(
                f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GOOGLE_API_KEY}',
                headers={'Content-Type': 'application/json'},
                json={
                    'contents': [{
                        'parts': [
                            {
                                'inline_data': {
                                    'mime_type': mime_type,
                                    'data': audio_base64
                                }
                            },
                            {
                                'text': '''Transcreva este áudio em português brasileiro.
Retorne APENAS a transcrição completa do texto falado, sem comentários ou explicações adicionais.
Se houver múltiplos falantes, separe as falas com quebras de linha.'''
                            }
                        ]
                    }]
                },
                timeout=600
            )
        
        if not response.ok:
            return {"error": f"Gemini transcription error: {response.status_code} - {response.text[:200]}", "success": False}
        
        data = response.json()
        
        # Extract text based on API used
        if LOVABLE_API_KEY:
            text = data.get('choices', [{}])[0].get('message', {}).get('content', '')
        else:
            text = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
        
        if not text:
            return {"error": "Gemini não retornou transcrição", "success": False}
        
        # Generate simple SRT (without precise timestamps)
        srt_lines = []
        paragraphs = [p.strip() for p in text.split('\n') if p.strip()]
        for i, para in enumerate(paragraphs, 1):
            start_sec = i * 5
            end_sec = (i + 1) * 5
            start = _format_srt_time(start_sec)
            end = _format_srt_time(end_sec)
            srt_lines.append(f"{i}\n{start} --> {end}\n{para}\n")
        
        srt_content = '\n'.join(srt_lines)
        
        return {
            "success": True,
            "text": text,
            "srtContent": srt_content,
            "matchId": match_id,
            "provider": "gemini"
        }
        
    except Exception as e:
        return {"error": f"Gemini transcription exception: {str(e)}", "success": False}


    video_url: str,
    match_id: str = None,
    max_chunk_size_mb: int = 20
) -> Dict[str, Any]:
    """
    Transcribe a large video file with multi-chunk support.
    
    For videos > 24MB, splits audio into chunks and transcribes each separately,
    then combines the results. This ensures complete transcription coverage.
    
    Args:
        video_url: URL to the video file (can be local /api/storage/ path or external URL)
        match_id: Related match ID
        max_chunk_size_mb: Maximum size per chunk in MB (default: 20MB)
    
    Returns:
        Dict with transcription and SRT content
    """
    import subprocess
    import tempfile
    import math
    from storage import get_file_path, STORAGE_DIR
    
    # Check if any transcription API is available and enabled
    elevenlabs_available = ELEVENLABS_API_KEY and ELEVENLABS_ENABLED
    openai_available = OPENAI_API_KEY and OPENAI_ENABLED
    gemini_available = (GOOGLE_API_KEY or LOVABLE_API_KEY) and GEMINI_ENABLED
    
    if not elevenlabs_available and not openai_available and not gemini_available:
        raise ValueError("Nenhuma API de transcrição ativa. Ative ElevenLabs, OpenAI ou Gemini em Configurações > API.")
    
    print(f"[Transcribe] Iniciando transcrição para: {video_url}")
    print(f"[Transcribe] APIs ativas: ElevenLabs={'✓' if elevenlabs_available else '✗'}, Whisper={'✓' if openai_available else '✗'}, Gemini={'✓' if gemini_available else '✗'}")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = os.path.join(tmpdir, 'video.mp4')
        audio_path = os.path.join(tmpdir, 'audio.mp3')
        
        # Check if it's a local URL and resolve to disk path
        is_local = False
        if video_url.startswith('/api/storage/') or 'localhost' in video_url:
            is_local = True
            clean_url = video_url.replace('http://localhost:5000', '').replace('http://127.0.0.1:5000', '')
            parts = clean_url.strip('/').split('/')
            if len(parts) >= 5 and parts[0] == 'api' and parts[1] == 'storage':
                local_match_id = parts[2]
                subfolder = parts[3]
                filename = '/'.join(parts[4:])
                local_path = get_file_path(local_match_id, subfolder, filename)
                print(f"[Transcribe] URL local detectada -> Caminho: {local_path}")
                
                if local_path and os.path.exists(local_path):
                    import shutil
                    shutil.copy(local_path, video_path)
                    print(f"[Transcribe] Arquivo local copiado para: {video_path}")
                else:
                    return {"error": f"Local file not found: {local_path}"}
            else:
                return {"error": f"Invalid local URL format: {video_url}"}
        else:
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
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            if result.returncode != 0:
                return {"error": f"FFmpeg error: {result.stderr}"}
        except Exception as e:
            return {"error": f"Failed to extract audio: {str(e)}"}
        
        # Check audio file size
        audio_size_bytes = os.path.getsize(audio_path)
        audio_size_mb = audio_size_bytes / (1024 * 1024)
        print(f"[Transcribe] Tamanho do áudio: {audio_size_mb:.2f} MB")
        
        # Try ElevenLabs first (supports larger files) - only if enabled
        if elevenlabs_available:
            print(f"[Transcribe] Tentando ElevenLabs Scribe...")
            result = _transcribe_with_elevenlabs(audio_path, match_id)
            if result.get('success'):
                print(f"[Transcribe] ✓ ElevenLabs sucesso!")
                return result
            else:
                print(f"[Transcribe] ⚠ ElevenLabs falhou: {result.get('error', 'Unknown')}")
        
        # Fallback to Whisper - only if enabled
        if openai_available:
            print(f"[Transcribe] Usando Whisper como fallback...")
            
            # Whisper API limit is ~25MB, use 24MB as safe threshold
            if audio_size_mb <= 24:
                # Direct transcription for small files
                print(f"[Transcribe] Arquivo pequeno, transcrição direta...")
                result = _transcribe_audio_file(audio_path, match_id)
                if result.get('success'):
                    return result
                print(f"[Transcribe] ⚠ Whisper falhou: {result.get('error', 'Unknown')}")
            else:
                # Multi-chunk transcription for large files
                print(f"[Transcribe] Arquivo grande ({audio_size_mb:.2f} MB), usando multi-chunk...")
                result = _transcribe_multi_chunk(audio_path, tmpdir, match_id, max_chunk_size_mb)
                if result.get('success'):
                    return result
                print(f"[Transcribe] ⚠ Whisper multi-chunk falhou: {result.get('error', 'Unknown')}")
        
        # Fallback to Gemini - only if enabled and file is small enough
        if gemini_available and audio_size_mb <= 20:
            print(f"[Transcribe] Tentando Gemini como fallback...")
            result = _transcribe_with_gemini(audio_path, match_id)
            if result.get('success'):
                print(f"[Transcribe] ✓ Gemini sucesso!")
                return result
            print(f"[Transcribe] ⚠ Gemini falhou: {result.get('error', 'Unknown')}")
        
        return {"error": "Todas as APIs de transcrição falharam"}


def _transcribe_audio_file(audio_path: str, match_id: str = None) -> Dict[str, Any]:
    """Transcribe a single audio file using Whisper API."""
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
        return {"error": f"Whisper error: {response.status_code} - {response.text}"}
    
    data = response.json()
    text = data.get('text', '')
    segments = data.get('segments', [])
    
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


def _transcribe_multi_chunk(
    audio_path: str, 
    tmpdir: str, 
    match_id: str = None,
    max_chunk_size_mb: int = 20
) -> Dict[str, Any]:
    """
    Transcribe large audio by splitting into chunks.
    
    Splits the audio into ~20MB chunks, transcribes each separately,
    and combines the results maintaining proper timing.
    """
    import subprocess
    import math
    
    # Get audio duration
    probe_cmd = [
        'ffprobe', '-v', 'quiet', '-print_format', 'json',
        '-show_format', audio_path
    ]
    probe_result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
    if probe_result.returncode != 0:
        return {"error": "Failed to probe audio duration"}
    
    probe_data = json.loads(probe_result.stdout)
    total_duration = float(probe_data.get('format', {}).get('duration', 0))
    audio_size_bytes = os.path.getsize(audio_path)
    audio_size_mb = audio_size_bytes / (1024 * 1024)
    
    # Calculate number of chunks needed
    num_chunks = math.ceil(audio_size_mb / max_chunk_size_mb)
    chunk_duration = total_duration / num_chunks
    
    print(f"[Transcribe] Dividindo em {num_chunks} chunks de ~{chunk_duration:.1f}s cada")
    
    all_text = []
    all_segments = []
    srt_index = 1
    srt_lines = []
    
    for i in range(num_chunks):
        start_time = i * chunk_duration
        chunk_path = os.path.join(tmpdir, f'chunk_{i}.mp3')
        
        # Extract chunk
        chunk_cmd = [
            'ffmpeg', '-y',
            '-ss', str(start_time),
            '-i', audio_path,
            '-t', str(chunk_duration),
            '-acodec', 'libmp3lame', '-ab', '128k',
            chunk_path
        ]
        
        chunk_result = subprocess.run(chunk_cmd, capture_output=True, text=True, timeout=120)
        if chunk_result.returncode != 0:
            print(f"[Transcribe] Falha ao extrair chunk {i}: {chunk_result.stderr}")
            continue
        
        if not os.path.exists(chunk_path) or os.path.getsize(chunk_path) < 1000:
            print(f"[Transcribe] Chunk {i} muito pequeno ou inexistente, pulando...")
            continue
        
        print(f"[Transcribe] Transcrevendo chunk {i+1}/{num_chunks} (início: {start_time:.1f}s)...")
        
        # Transcribe chunk
        try:
            with open(chunk_path, 'rb') as chunk_file:
                response = requests.post(
                    f'{OPENAI_API_URL}/audio/transcriptions',
                    headers={'Authorization': f'Bearer {OPENAI_API_KEY}'},
                    files={'file': chunk_file},
                    data={
                        'model': 'whisper-1',
                        'language': 'pt',
                        'response_format': 'verbose_json'
                    },
                    timeout=300
                )
            
            if not response.ok:
                print(f"[Transcribe] Whisper error chunk {i}: {response.status_code}")
                continue
            
            chunk_data = response.json()
            chunk_text = chunk_data.get('text', '')
            chunk_segments = chunk_data.get('segments', [])
            
            all_text.append(chunk_text)
            
            # Adjust timestamps for this chunk's position
            for seg in chunk_segments:
                adjusted_start = seg.get('start', 0) + start_time
                adjusted_end = seg.get('end', 0) + start_time
                
                adjusted_seg = {**seg, 'start': adjusted_start, 'end': adjusted_end}
                all_segments.append(adjusted_seg)
                
                # Build SRT
                start_str = _format_srt_time(adjusted_start)
                end_str = _format_srt_time(adjusted_end)
                text_seg = seg.get('text', '').strip()
                srt_lines.append(f"{srt_index}\n{start_str} --> {end_str}\n{text_seg}\n")
                srt_index += 1
            
            print(f"[Transcribe] ✓ Chunk {i+1}: {len(chunk_segments)} segmentos, {len(chunk_text)} chars")
            
        except Exception as e:
            print(f"[Transcribe] Erro no chunk {i}: {e}")
            continue
        
        # Clean up chunk file
        try:
            os.remove(chunk_path)
        except:
            pass
    
    if not all_text:
        return {"error": "Failed to transcribe any chunks"}
    
    combined_text = ' '.join(all_text)
    srt_content = '\n'.join(srt_lines)
    
    print(f"[Transcribe] ✓ Multi-chunk completo: {len(all_segments)} segmentos, {len(combined_text)} chars")
    
    return {
        "success": True,
        "text": combined_text,
        "srtContent": srt_content,
        "segments": all_segments,
        "matchId": match_id,
        "chunksProcessed": num_chunks
    }


def _format_srt_time(seconds: float) -> str:
    """Format seconds to SRT timestamp format."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"
