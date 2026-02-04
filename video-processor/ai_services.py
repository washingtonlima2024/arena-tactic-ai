"""
AI Services for Arena Play.
Handles calls to OpenAI, Lovable AI, and other AI APIs.
"""

import os
import json
import json as json_module
import base64
import requests
import re
import subprocess
from typing import Optional, List, Dict, Any, Tuple
from pathlib import Path
from datetime import datetime

# Carregar variáveis de ambiente do .env
from dotenv import load_dotenv
load_dotenv()

# Known Brazilian and international teams for transcription validation
KNOWN_TEAMS = [
    # Série A
    'flamengo', 'corinthians', 'palmeiras', 'são paulo', 'santos',
    'grêmio', 'internacional', 'cruzeiro', 'atlético mineiro', 'atlético-mg',
    'vasco', 'botafogo', 'fluminense', 'bahia', 'fortaleza',
    # Série B / Regionais
    'sport', 'sport recife', 'sport club do recife',
    'novorizontino', 'novo horizontino', 'grêmio novorizontino',
    'guarani', 'ponte preta', 'coritiba', 'goiás', 'vitória', 'ceará', 
    'américa mineiro', 'chapecoense', 'avaí', 'figueirense', 'juventude', 
    'sampaio corrêa', 'csa', 'crb', 'náutico', 'santa cruz',
    # Seleções
    'brasil', 'argentina', 'uruguai', 'chile', 'paraguai', 'colômbia',
    'alemanha', 'frança', 'espanha', 'itália', 'portugal', 'inglaterra',
    'seleção brasileira', 'seleção argentina'
]

# Team aliases for better matching (nicknames, variations)
TEAM_ALIASES = {
    'sport': ['sport recife', 'leão', 'leão da ilha', 'rubro-negro recifense', 'sport club'],
    'novorizontino': ['novo horizontino', 'tigre', 'novori', 'grêmio novorizontino', 'auriverde'],
    'flamengo': ['mengão', 'rubro-negro', 'urubu', 'fla'],
    'corinthians': ['timão', 'coringão', 'alvinegro paulista'],
    'palmeiras': ['verdão', 'alviverde', 'porco'],
    'são paulo': ['tricolor paulista', 'soberano', 'spfc'],
    'santos': ['peixe', 'alvinegro praiano'],
    'grêmio': ['tricolor gaúcho', 'imortal'],
    'internacional': ['colorado', 'inter'],
    'cruzeiro': ['raposa', 'cabuloso'],
    'atlético mineiro': ['galo', 'atlético-mg', 'atletico-mg'],
    'vasco': ['gigante da colina', 'vascão', 'cruzmaltino'],
    'botafogo': ['fogão', 'glorioso', 'estrela solitária'],
    'fluminense': ['tricolor carioca', 'flu', 'pó de arroz'],
    'bahia': ['tricolor baiano', 'tricolor de aço', 'esquadrão'],
    'fortaleza': ['leão do pici', 'tricolor de aço'],
}

# ═══════════════════════════════════════════════════════════════════════════
# ANTI-EXTERNAL-TEAMS FILTER - Detect commentary about other games
# ═══════════════════════════════════════════════════════════════════════════

# Phrases that indicate commentary about OTHER games (not the current match)
OTHER_GAME_PHRASES = [
    "em outro jogo", "no outro jogo", "na outra partida",
    "na rodada", "nesta rodada", "placar parcial",
    "tabela", "classificação", "mostramos os gols",
    "mostra os gols", "mostrar os gols", "gols continuam saindo",
    "gols continuam", "gols na rodada", "enquanto isso",
    "e lá no outro", "lá no maracanã", "lá no mineirão",
    "lá em são paulo", "lá no morumbi", "lá em belo horizonte",
    "lá no castelão", "lá na arena", "resultado parcial",
    "outros jogos", "nas outras partidas"
]


def clean_text_for_analysis(text: str) -> str:
    """
    Clean text for team/event analysis.
    Normalizes and lowercases text.
    """
    text = text.lower().strip()
    text = text.replace("…", "...")
    text = re.sub(r"\s+", " ", text)
    return text


def count_goal_hits(text: str) -> int:
    """
    Count goal mentions including emotional variations.
    Pattern: g[o]{1,8}l captures: gol, gool, goool, gooool, etc.
    Excludes 'goleiro'.
    """
    t = clean_text_for_analysis(text)
    t = re.sub(r"[^\w\s]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()

    hits = 0
    for tok in t.split(" "):
        if not tok:
            continue
        # Match g + 1-8 o's + l, but exclude "goleiro"
        if re.fullmatch(r"g[o]{1,8}l", tok) and "goleiro" not in t:
            hits += 1
    return hits


def intensity_score(text: str) -> int:
    """
    Calculate intensity score based on emotional terms.
    Higher score = more likely to be a real event.
    """
    t = clean_text_for_analysis(text)

    intense_terms = [
        "olha", "é gol", "goool", "golaço", "que bomba", "que chute",
        "bateu", "chutou", "finalizou", "cruzamento", "cruzou",
        "enfiada", "arrancou", "capricha", "rede", "ta la", "tá lá",
        "entrou", "na trave", "defendeu", "uhhh", "olha aí",
        "é dele", "do jogador", "que golaço", "sensacional"
    ]

    score = 0
    for w in intense_terms:
        if w in t:
            score += 1

    # Extra point for extended goal celebration
    if re.search(r"g[o]{2,}l", t):
        score += 1

    return score


def looks_like_other_game_commentary(text: str) -> bool:
    """
    Detect if text is about OTHER game (anti-false-positive).
    Returns True if it's commentary about another match.
    """
    t = clean_text_for_analysis(text)

    for p in OTHER_GAME_PHRASES:
        if p in t:
            return True

    return False


def detect_teams_in_text(text: str) -> List[str]:
    """
    Detect all teams mentioned in text using KNOWN_TEAMS + TEAM_ALIASES.
    Returns list of detected team names (normalized).
    """
    text_lower = text.lower()
    found = []
    
    # Check known teams
    for team in KNOWN_TEAMS:
        pattern = r'\b' + re.escape(team) + r'\b'
        if re.search(pattern, text_lower):
            if team not in found:
                found.append(team)
    
    # Check aliases
    for key, aliases in TEAM_ALIASES.items():
        for alias in aliases:
            pattern = r'\b' + re.escape(alias.lower()) + r'\b'
            if re.search(pattern, text_lower):
                if key not in found:
                    found.append(key)
    
    return found


def get_team_variants(team_name: str) -> set:
    """
    Get all variations/aliases for a team name.
    Ex: "Sport" → {"sport", "leão", "sport recife", ...}
    """
    if not team_name:
        return set()
    
    team_lower = team_name.lower().strip()
    variants = {team_lower}
    
    # Add individual words from team name (if > 3 chars)
    for word in team_lower.split():
        if len(word) > 3:
            variants.add(word)
    
    # Add aliases from TEAM_ALIASES
    for key, aliases in TEAM_ALIASES.items():
        # Match if team_name contains key or vice versa
        if key in team_lower or team_lower in key or any(team_lower in a.lower() for a in aliases):
            variants.add(key)
            for alias in aliases:
                variants.add(alias.lower())
    
    return variants


def detect_goal_author(
    window_text: str,
    home_team: str,
    away_team: str,
    home_color: str = None,
    away_color: str = None
) -> Dict[str, Any]:
    """
    Detecta o AUTOR do gol usando análise de PROXIMIDADE textual.
    
    Esta função resolve o problema de atribuir gols ao time errado quando
    ambos os times são mencionados na mesma janela de contexto.
    
    Ex: "Gol do Brasil! Brasil vence Argentina por 2 a 0!"
    → O padrão "gol do Brasil" é detectado com certeza absoluta
    → Argentina é ignorada (distante do "gol")
    
    Prioridades:
    1. Padrão "gol do/de [TEAM]" - certeza absoluta (confidence=1.0)
    2. Padrão "[TEAM] marca/marcou/faz/fez gol" (confidence=0.95)
    3. Proximidade: time mencionado mais perto de "gol" (confidence=0.85)
    4. Contagem: time mais mencionado (confidence=0.7)
    5. Unknown - SEM fallback arbitrário (confidence=0.0)
    
    Args:
        window_text: Texto concatenado da janela de 5 linhas SRT
        home_team: Nome do time da casa
        away_team: Nome do time visitante
        home_color: Cor primária do home (opcional, para futura validação visual)
        away_color: Cor primária do away (opcional, para futura validação visual)
    
    Returns:
        {
            'team': 'home' | 'away' | 'unknown',
            'confidence': 0.0-1.0,
            'method': 'pattern' | 'proximity' | 'count' | 'fallback',
            'details': str
        }
    """
    text_lower = window_text.lower()
    
    home_variants = get_team_variants(home_team)
    away_variants = get_team_variants(away_team)
    
    # ═══════════════════════════════════════════════════════════════
    # PRIORIDADE 1: Padrão "gol do/de [TEAM]"
    # Certeza absoluta - o time logo após "gol do" é o autor
    # Suporta: gol do, gol de, gol da, golaço do, golaço de
    # ═══════════════════════════════════════════════════════════════
    gol_de_patterns = [
        r'go+l(?:aço)?\s+(?:d[eo]|da|dos|das)\s+(\w+(?:\s+\w+)?)',  # gol do/de/da X
        r'é\s+go+l\s+(?:d[eo]|da)\s+(\w+)',  # é gol do X
    ]
    
    for pattern in gol_de_patterns:
        match = re.search(pattern, text_lower)
        if match:
            team_mentioned = match.group(1).strip()
            
            # Verificar se é home
            for variant in home_variants:
                if variant in team_mentioned or team_mentioned in variant:
                    print(f"[GoalAuthor] ✓ Padrão direto: 'gol do {team_mentioned}' → HOME")
                    return {
                        'team': 'home',
                        'confidence': 1.0,
                        'method': 'pattern',
                        'details': f'Matched "gol do {team_mentioned}" → home'
                    }
            
            # Verificar se é away
            for variant in away_variants:
                if variant in team_mentioned or team_mentioned in variant:
                    print(f"[GoalAuthor] ✓ Padrão direto: 'gol do {team_mentioned}' → AWAY")
                    return {
                        'team': 'away',
                        'confidence': 1.0,
                        'method': 'pattern',
                        'details': f'Matched "gol do {team_mentioned}" → away'
                    }
    
    # ═══════════════════════════════════════════════════════════════
    # PRIORIDADE 2: Padrão "[TEAM] marca/marcou/faz/fez gol"
    # ═══════════════════════════════════════════════════════════════
    action_verbs = r'(?:marca|marcou|faz|fez|anota|anotou|abre|abriu|amplia|empata|empatou|vira|virou)'
    
    for variant in home_variants:
        if len(variant) < 3:
            continue
        pattern = rf'\b{re.escape(variant)}\b\s+{action_verbs}'
        if re.search(pattern, text_lower):
            print(f"[GoalAuthor] ✓ Padrão ação: '{variant} [verbo]' → HOME")
            return {
                'team': 'home',
                'confidence': 0.95,
                'method': 'pattern',
                'details': f'{variant} marca/faz → home'
            }
    
    for variant in away_variants:
        if len(variant) < 3:
            continue
        pattern = rf'\b{re.escape(variant)}\b\s+{action_verbs}'
        if re.search(pattern, text_lower):
            print(f"[GoalAuthor] ✓ Padrão ação: '{variant} [verbo]' → AWAY")
            return {
                'team': 'away',
                'confidence': 0.95,
                'method': 'pattern',
                'details': f'{variant} marca/faz → away'
            }
    
    # ═══════════════════════════════════════════════════════════════
    # PRIORIDADE 3: Proximidade textual ao "gol"
    # O time mencionado MAIS PERTO de "gol" é o autor
    # ═══════════════════════════════════════════════════════════════
    words = text_lower.split()
    gol_indices = [i for i, w in enumerate(words) if re.match(r'go+l', w)]
    
    if gol_indices:
        gol_pos = gol_indices[0]  # Usar primeira ocorrência de "gol"
        
        home_distance = float('inf')
        away_distance = float('inf')
        home_matched_word = None
        away_matched_word = None
        
        # Encontrar distância do time home ao "gol"
        for i, word in enumerate(words):
            for variant in home_variants:
                if len(variant) < 3:
                    continue
                if variant in word or word in variant:
                    dist = abs(i - gol_pos)
                    if dist < home_distance:
                        home_distance = dist
                        home_matched_word = word
                    break
        
        # Encontrar distância do time away ao "gol"
        for i, word in enumerate(words):
            for variant in away_variants:
                if len(variant) < 3:
                    continue
                if variant in word or word in variant:
                    dist = abs(i - gol_pos)
                    if dist < away_distance:
                        away_distance = dist
                        away_matched_word = word
                    break
        
        # Se um está significativamente mais perto (2+ palavras de diferença)
        if home_distance < away_distance and (away_distance - home_distance) >= 2:
            print(f"[GoalAuthor] ✓ Proximidade: '{home_matched_word}' dist={home_distance} vs away dist={away_distance} → HOME")
            return {
                'team': 'home',
                'confidence': 0.85,
                'method': 'proximity',
                'details': f'home_dist={home_distance} ({home_matched_word}), away_dist={away_distance}'
            }
        if away_distance < home_distance and (home_distance - away_distance) >= 2:
            print(f"[GoalAuthor] ✓ Proximidade: '{away_matched_word}' dist={away_distance} vs home dist={home_distance} → AWAY")
            return {
                'team': 'away',
                'confidence': 0.85,
                'method': 'proximity',
                'details': f'away_dist={away_distance} ({away_matched_word}), home_dist={home_distance}'
            }
    
    # ═══════════════════════════════════════════════════════════════
    # PRIORIDADE 4: Contagem - time mais mencionado
    # ═══════════════════════════════════════════════════════════════
    home_count = 0
    away_count = 0
    
    for variant in home_variants:
        if len(variant) >= 3:
            home_count += len(re.findall(rf'\b{re.escape(variant)}\b', text_lower))
    
    for variant in away_variants:
        if len(variant) >= 3:
            away_count += len(re.findall(rf'\b{re.escape(variant)}\b', text_lower))
    
    if home_count > away_count:
        print(f"[GoalAuthor] ✓ Contagem: home={home_count} > away={away_count} → HOME")
        return {
            'team': 'home',
            'confidence': 0.7,
            'method': 'count',
            'details': f'home_count={home_count}, away_count={away_count}'
        }
    if away_count > home_count:
        print(f"[GoalAuthor] ✓ Contagem: away={away_count} > home={home_count} → AWAY")
        return {
            'team': 'away',
            'confidence': 0.7,
            'method': 'count',
            'details': f'away_count={away_count}, home_count={home_count}'
        }
    
    # ═══════════════════════════════════════════════════════════════
    # PRIORIDADE 5: Unknown (SEM fallback arbitrário para 'home')
    # Isso evita atribuição errada quando não conseguimos determinar
    # ═══════════════════════════════════════════════════════════════
    print(f"[GoalAuthor] ⚠ Não foi possível determinar time (home_count={home_count}, away_count={away_count})")
    return {
        'team': 'unknown',
        'confidence': 0.0,
        'method': 'fallback',
        'details': f'Could not determine team (home_count={home_count}, away_count={away_count})'
    }


def is_other_game_commentary(
    window_text: str,
    home_team: str,
    away_team: str
) -> bool:
    """
    Check if text is commentary about ANOTHER game.
    
    Returns True if:
    1. Text contains explicit "other game" phrases, OR
    2. Text mentions a team that is NOT home/away
    
    Args:
        window_text: Text from SRT window (concatenated lines)
        home_team: Home team name
        away_team: Away team name
    
    Returns:
        True if commentary is about another game (should reject event)
    """
    text_lower = window_text.lower()
    
    # Check 1: Explicit phrases about other games
    if looks_like_other_game_commentary(text_lower):
        return True
    
    # Check 2: Mentions team not in this match
    detected_teams = detect_teams_in_text(text_lower)
    
    # If no team detected, accept the event (could be generic commentary)
    if not detected_teams:
        return False
    
    # Build valid teams set from home and away
    home_variants = get_team_variants(home_team)
    away_variants = get_team_variants(away_team)
    valid_teams = home_variants | away_variants
    
    # Check if any detected team is NOT in valid teams
    for detected in detected_teams:
        detected_lower = detected.lower()
        # Check if detected team matches any valid variant
        is_valid = any(
            detected_lower == v or detected_lower in v or v in detected_lower
            for v in valid_teams
        )
        if not is_valid:
            # Found a team that is NOT in this match
            print(f"[AntiExternal] ⚠ Detected external team: '{detected}' (valid: {list(valid_teams)[:5]}...)")
            return True
    
    return False


def validate_card_event(
    text: str,
    window_text: str,
    card_type: str,
    home_team: str,
    away_team: str
) -> Dict[str, Any]:
    """
    Validate if a card event is REAL with advanced rules.
    
    Para cartão vermelho, exige MÚLTIPLAS evidências de expulsão real:
    - Palavras de expulsão (expulso, fora de campo, etc.)
    - Ausência de condicionais (poderia, deveria, mereceu, etc.)
    
    Args:
        text: Original text where keyword was found
        window_text: Surrounding context (2 blocks before/after)
        card_type: 'yellow_card' or 'red_card'
        home_team: Home team name
        away_team: Away team name
    
    Returns:
        {'is_valid': bool, 'confidence': float, 'reason': str}
    """
    window_lower = window_text.lower()
    
    # Filter 1: Not about another team/game
    if is_other_game_commentary(window_text, home_team, away_team):
        return {'is_valid': False, 'confidence': 0, 'reason': 'other_game'}
    
    # Filter 2: Should have player name nearby (PARA Fulano, de Fulano, etc.)
    has_player = bool(re.search(
        r'(?:para|pra|de|do|em)\s+[A-ZÀ-Ú][a-záéíóúàèìòùâêîôûãõç]+',
        window_text,
        re.IGNORECASE
    ))
    
    # Filter 3: For red card - VALIDAÇÃO REFORÇADA
    if card_type == 'red_card':
        # Palavras que indicam expulsão REAL
        expulsion_keywords = [
            'expuls', 'expulso', 'foi expulso',
            'vermelho direto', 'cartão vermelho direto',
            'deixa o campo', 'deixou o campo',
            'vai pro chuveiro', 'direto pro chuveiro',
            'fora de campo', 'fora da partida',
            'ficou com um a menos', 'fica com um a menos',
            'jogo com 10', 'com dez jogadores'
        ]
        
        # Palavras que indicam menção HIPOTÉTICA (não expulsão real)
        hypothetical_keywords = [
            'poderia', 'deveria', 'mereceu', 'merecia',
            'quase', 'por pouco', 'escapou',
            'poderia ter sido', 'deveria ter sido',
            'era para', 'era pra',
            'pegou leve', 'só amarelo',
            'podia ser vermelho', 'poderia ser vermelho'
        ]
        
        # Verificar se há evidência de expulsão real
        has_expulsion = any(kw in window_lower for kw in expulsion_keywords)
        
        # Verificar se é menção hipotética
        is_hypothetical = any(kw in window_lower for kw in hypothetical_keywords)
        
        # Log para debug
        print(f"[ValidateCard] Vermelho - expulsão:{has_expulsion}, hipotético:{is_hypothetical}")
        print(f"[ValidateCard] Contexto (100 chars): {window_lower[:100]}...")
        
        # Rejeitar se não tem expulsão OU se é hipotético
        if not has_expulsion:
            return {'is_valid': False, 'confidence': 0.2, 'reason': 'no_expulsion_context'}
        
        if is_hypothetical:
            return {'is_valid': False, 'confidence': 0.3, 'reason': 'hypothetical_mention'}
    
    confidence = 0.9 if has_player else 0.7
    return {'is_valid': True, 'confidence': confidence, 'reason': 'validated'}


def _extract_context_around_timestamp(
    transcription: str, 
    minute: int, 
    second: int, 
    event_type: str = None,
    window_chars: int = 1000  # ~40 segundos = 20s cada lado
) -> str:
    """
    Extrai contexto centrado na palavra-chave do evento.
    
    Estratégia:
    1. Buscar palavra-chave do tipo de evento no texto
    2. Centralizar janela de 1000 chars (500 antes, 500 depois)
    3. Fallback: posição estimada se não encontrar keyword
    
    Args:
        transcription: Texto completo da transcrição
        minute: Minuto do evento
        second: Segundo do evento
        event_type: Tipo do evento (goal, red_card, etc.)
        window_chars: Tamanho da janela em caracteres (~40s = 1000 chars)
    
    Returns:
        Contexto extraído centrado na keyword ou posição estimada
    """
    # Mapa de keywords por tipo de evento
    # 🔧 red_card e yellow_card REMOVIDOS - menções de cartão serão ignoradas
    event_keywords = {
        'goal': ['gol', 'golaço', 'bola na rede', 'abre o placar', 'marca', 'gooool'],
        # 'red_card': ['vermelho', 'expuls', 'cartão vermelho', 'direto pro chuveiro'],
        # 'yellow_card': ['amarelo', 'cartão amarelo', 'amarelou', 'recebe amarelo'],
        'penalty': ['pênalti', 'penalidade', 'marca pênalti', 'penalty'],
        'save': ['defesa', 'salvou', 'espalmou', 'defendeu'],
    }
    
    # 1. Tentar encontrar keyword do evento
    keywords = event_keywords.get(event_type, [])
    
    for keyword in keywords:
        # Buscar todas as ocorrências (case insensitive)
        pattern = re.escape(keyword)
        matches = list(re.finditer(pattern, transcription.lower()))
        
        if matches:
            # Se há múltiplas ocorrências, escolher a mais próxima do timestamp estimado
            total_seconds = minute * 60 + second
            estimated_pos = int(len(transcription) * (total_seconds / (45 * 60)))
            
            # Encontrar match mais próximo da posição estimada
            best_match = min(matches, key=lambda m: abs(m.start() - estimated_pos))
            center_pos = best_match.start()
            
            # Extrair janela centrada na keyword
            half_window = window_chars // 2
            start = max(0, center_pos - half_window)
            end = min(len(transcription), center_pos + half_window)
            
            return transcription[start:end]
    
    # 2. Fallback: posição estimada baseada no timestamp
    total_seconds = minute * 60 + second
    estimated_pos = int(len(transcription) * (total_seconds / (45 * 60)))
    
    half_window = window_chars // 2
    start = max(0, estimated_pos - half_window)
    end = min(len(transcription), estimated_pos + half_window)
    
    return transcription[start:end]


def _validate_all_events_with_context(
    events: List[Dict],
    transcription: str,
    home_team: str,
    away_team: str
) -> List[Dict]:
    """
    Validação pós-Ollama para TODOS os tipos de eventos.
    Remove eventos falsos verificando contexto na transcrição.
    """
    validated = []
    
    for event in events:
        event_type = event.get('event_type')
        minute = event.get('minute', 0)
        second = event.get('second', 0)
        
        # Extrair contexto centrado na keyword do evento (janela 40s)
        context = _extract_context_around_timestamp(
            transcription, minute, second, 
            event_type=event_type,
            window_chars=1000
        )
        
        # 1. Validar cartões vermelhos
        if event_type == 'red_card':
            validation = validate_card_event(context, context, 'red_card', home_team, away_team)
            if not validation['is_valid']:
                print(f"[Validate] ⚠️ Cartão vermelho {minute}' REJEITADO: {validation['reason']}")
                continue
        
        # 2. Validar cartões amarelos
        if event_type == 'yellow_card':
            validation = validate_card_event(context, context, 'yellow_card', home_team, away_team)
            if not validation['is_valid']:
                print(f"[Validate] ⚠️ Cartão amarelo {minute}' REJEITADO: {validation['reason']}")
                continue
        
        # 3. Validar pênaltis
        if event_type == 'penalty':
            validation = validate_penalty_event(context, context, home_team, away_team)
            if not validation['is_valid']:
                print(f"[Validate] ⚠️ Pênalti {minute}' REJEITADO: {validation['reason']}")
                continue
        
        validated.append(event)
    
    print(f"[Validate] Eventos após validação contextual: {len(validated)}/{len(events)}")
    return validated


def validate_penalty_event(
    text: str,
    window_text: str,
    home_team: str,
    away_team: str
) -> Dict[str, Any]:
    """
    Validate if a penalty event is REAL with advanced rules.
    
    Args:
        text: Original text where keyword was found
        window_text: Surrounding context
        home_team: Home team name
        away_team: Away team name
    
    Returns:
        {'is_valid': bool, 'confidence': float, 'reason': str}
    """
    window_lower = window_text.lower()
    
    # Filter 1: Not about another team/game
    if is_other_game_commentary(window_text, home_team, away_team):
        return {'is_valid': False, 'confidence': 0, 'reason': 'other_game'}
    
    # Filter 2: Should have emotion/intensity
    intensity = intensity_score(window_text)
    if intensity < 1:
        return {'is_valid': False, 'confidence': 0.3, 'reason': 'low_intensity'}
    
    # Filter 3: Context about missing vs scoring
    # "perdeu o pênalti" without positive context = uncertain
    if 'perdeu' in window_lower:
        if 'mas' not in window_lower and 'porém' not in window_lower:
            # Still valid but mark as missed penalty
            return {'is_valid': True, 'confidence': 0.7, 'reason': 'penalty_missed'}
    
    confidence = min(0.95, 0.7 + intensity * 0.1)
    return {'is_valid': True, 'confidence': confidence, 'reason': 'validated'}


def window_goal_features(window_blocks: List[Tuple]) -> Dict[str, Any]:
    """
    Extract goal detection features from a window of SRT blocks.
    Used by advanced sliding window algorithm.
    
    Args:
        window_blocks: List of SRT block tuples
    
    Returns:
        Dict with detection features
    """
    gol_hits_per_line = []
    lines_with_gol = 0
    total_hits = 0
    total_intensity = 0
    any_other_game_phrase = False

    for block in window_blocks:
        text = block[5] if len(block) > 5 else ''
        hits = count_goal_hits(text)
        gol_hits_per_line.append(hits)
        if hits > 0:
            lines_with_gol += 1
            total_hits += hits

        total_intensity += intensity_score(text)
        if looks_like_other_game_commentary(text):
            any_other_game_phrase = True

    need_one_line_two_or_more = any(h >= 2 for h in gol_hits_per_line)

    return {
        "lines_with_gol": lines_with_gol,
        "total_gol_hits": total_hits,
        "gol_hits_per_line": gol_hits_per_line,
        "need_one_line_two_or_more": need_one_line_two_or_more,
        "intensity": total_intensity,
        "other_game_phrase": any_other_game_phrase,
    }


def build_goal_validator_prompt(window_blocks: List[Tuple]) -> str:
    """
    Build prompt for Ollama goal validation.
    """
    lines = []
    for block in window_blocks:
        if len(block) > 5:
            start = f"{block[2]:02d}:{block[3]:02d}"
            text = block[5]
            lines.append(f"{start} {text}")
    
    snippet = "\n".join(lines)
    
    prompt = f"""Analise este trecho de legenda de uma transmissao de futebol.
Determine se ha realmente um lance de gol na jogada atual.

Criterios de gol verdadeiro:
1. Ha descricao clara de jogada (chute, finalizacao, cruzamento)
2. Ha emocao tipica de narracao (olha o gol, e gol, goool, que bomba)
3. Ha repeticao de chamadas gol/goool
4. A fala descreve acao ocorrendo na jogada atual

Criterios para NAO ser gol:
1. Fala sobre outro jogo ou outra partida
2. Fala sobre estatisticas, historico ou tabela
3. Apenas mencao neutra de gol sem emocao
4. Nenhum verbo de acao recente

Responda apenas SIM ou NAO.

Trecho:
{snippet}"""
    
    return prompt


def validate_goal_with_ollama(
    window_blocks: List[Tuple],
    model: str = None
) -> Optional[bool]:
    """
    Validate a goal candidate using Ollama.
    
    Returns:
        True = is a real goal
        False = not a goal
        None = couldn't validate (inconclusive)
    """
    if not OLLAMA_ENABLED:
        return None
    
    prompt = build_goal_validator_prompt(window_blocks)
    
    try:
        response = call_ollama(
            messages=[{"role": "user", "content": prompt}],
            model=model or OLLAMA_MODEL,
            temperature=0.1,
            max_tokens=50
        )
        
        if not response:
            return None
        
        out = response.strip().lower()
        
        # Parse response
        if "sim" in out and "nao" not in out and "não" not in out:
            return True
        if "não" in out or "nao" in out:
            return False
        if out.startswith("sim"):
            return True
        if out.startswith("nao") or out.startswith("não"):
            return False
        
        return None  # Inconclusive
        
    except Exception as e:
        print(f"[Ollama Validator] Error: {e}")
        return None


def detect_teams_in_transcription(transcription: str) -> Tuple[List[str], bool]:
    """
    Detect known team names in transcription.
    Returns tuple of (found_teams, has_any_match).
    """
    text_lower = transcription.lower()
    found = []
    
    for team in KNOWN_TEAMS:
        # Use word boundary matching for more accuracy
        pattern = r'\b' + re.escape(team) + r'\b'
        if re.search(pattern, text_lower):
            found.append(team)
    
    return found, len(found) > 0


def validate_transcription_teams(
    transcription: str, 
    home_team: str, 
    away_team: str
) -> Dict[str, Any]:
    """
    Validate if transcription mentions the expected teams.
    Returns validation result with warnings if mismatched.
    
    RELAXED LOGIC: Only marks contamination if:
    1. Neither expected team was found AND
    2. More than 5 different unexpected teams are mentioned (indicates wrong match)
    """
    text_lower = transcription.lower()
    home_lower = home_team.lower().strip()
    away_lower = away_team.lower().strip()
    
    # Build variants list including aliases
    home_variants = [home_lower] + [w for w in home_lower.split() if len(w) > 3]
    away_variants = [away_lower] + [w for w in away_lower.split() if len(w) > 3]
    
    # Add known aliases
    for key, aliases in TEAM_ALIASES.items():
        if key in home_lower or home_lower in key:
            home_variants.extend(aliases)
        if key in away_lower or away_lower in key:
            away_variants.extend(aliases)
    
    # Remove duplicates and empty strings
    home_variants = list(set(v for v in home_variants if v and len(v) > 2))
    away_variants = list(set(v for v in away_variants if v and len(v) > 2))
    
    # Check if expected teams are mentioned
    home_found = any(
        re.search(r'\b' + re.escape(variant) + r'\b', text_lower)
        for variant in home_variants
        if len(variant) > 3
    )
    away_found = any(
        re.search(r'\b' + re.escape(variant) + r'\b', text_lower)
        for variant in away_variants
        if len(variant) > 3
    )
    
    # Detect other teams in transcription
    detected_teams, _ = detect_teams_in_transcription(transcription)
    
    # Filter out the expected teams from detected (more thorough matching)
    all_expected_variants = home_variants + away_variants
    unexpected_teams = [
        t for t in detected_teams 
        if not any(v in t or t in v for v in all_expected_variants)
    ]
    
    is_valid = home_found or away_found
    
    # RELAXED: Only contaminate if MANY unexpected teams AND NO expected teams
    # This allows narrators to mention other teams in passing comments
    has_contamination = not is_valid and len(unexpected_teams) > 5
    
    return {
        'isValid': is_valid,
        'homeFound': home_found,
        'awayFound': away_found,
        'detectedTeams': detected_teams,
        'unexpectedTeams': unexpected_teams,
        'hasContamination': has_contamination,
        'warning': None if is_valid else f"Times esperados não encontrados. Detectados: {', '.join(unexpected_teams[:5]) if unexpected_teams else 'nenhum'}"
    }


# ═══════════════════════════════════════════════════════════════════════════
# KEYWORD-BASED EVENT DETECTION (Deterministic, Fast, Precise)
# ═══════════════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════════════════
# GOAL CONFIRMATION SYSTEM (Smart keyword detection with context analysis)
# ═══════════════════════════════════════════════════════════════════════════

# STRONG keywords - Confirm goal IMMEDIATELY (no context needed)
GOAL_STRONG_KEYWORDS = [
    r'GO{3,}L',           # GOOOL, GOOOOL, GOOOOOL (3+ O's = extended celebration)
    r'GOLAÇO',            # Always a goal
    r'BOLA NA REDE',      # Ball in the net
    r'ESTUFOU A REDE',    # Bulged the net
    r'ABRE O PLACAR',     # Opens the score (confirms 1-0)
    r'EMPATA O JOGO',     # Ties the game (confirms equalizer)
    r'VIRA O JOGO',       # Turns the game around
    r'VIROU O JOGO',      # Turned the game around
    r'AMPLIA O PLACAR',   # Extends the lead
    r'PRIMEIRO GOL',      # First goal (explicit)
    r'SEGUNDO GOL',       # Second goal (explicit)
    r'TERCEIRO GOL',      # Third goal (explicit)
]

# WEAK keywords - Need context confirmation (player name, score, celebration)
GOAL_WEAK_KEYWORDS = [
    r'\bGOL\b',           # Simple GOL (could be "quase gol")
    r'É GOL',             # "É gol!" - may need confirmation
    r'PRA DENTRO',        # "Mandou pra dentro" - context helps
    r'\bENTROU\b',        # "Entrou!" - context helps
]

# Context that CONFIRMS a weak keyword as a real goal
GOAL_CONFIRMATION_CONTEXT = [
    r'[A-Z][a-záéíóúàèìòùâêîôûãõç]+\s+[A-Z][a-záéíóúàèìòùâêîôûãõç]+',  # Player name (First Last)
    r'\bDO\s+[A-Z][a-záéíóú]+',   # "do Fulano"
    r'\bDE\s+[A-Z][a-záéíóú]+',   # "de Fulano"
    r'QUE GOL',                   # "Que gol lindo!"
    r'BONITO',                    # "Gol bonito"
    r'LINDO',                     # "Gol lindo"
    r'INCRÍVEL',                  # "Gol incrível"
    r'SENSACIONAL',               # Celebration
    r'FANTÁSTICO',                # Celebration
    r'\d+\s*[AXx]\s*\d+',         # Score like "1 a 0", "2x1"
    r'\d+\s+A\s+\d+',             # Score like "1 A 0"
    r'COMEMORA',                  # "Comemora o gol"
    r'FESTA',                     # "Festa na arquibancada"
    r'EXPLODE',                   # "Torcida explode"
]

# Context that NEGATES - these mean it was NOT a goal
GOAL_NEGATION_CONTEXT = [
    r'\bQUASE\b',         # "Quase gol"
    r'POR POUCO',         # "Por pouco não foi gol"
    r'\bPERDEU\b',        # "Perdeu o gol"
    r'NA TRAVE',          # "Bateu na trave"
    r'PRA FORA',          # "Mandou pra fora"
    r'DEFENDEU',          # "Goleiro defendeu"
    r'\bNÃO\b',           # "Não foi gol"
    r'IMPEDIDO',          # "Estava impedido"
    r'ANULADO',           # "Gol anulado"
    r'PASSOU PERTO',      # "Passed close"
    r'RASPOU',            # "Grazed the post"
    r'TRAVE',             # Hit the post
    r'TRAVESSÃO',         # Hit the crossbar
]


def confirm_goal_event(text: str, surrounding_text: str = "") -> dict:
    """
    Verify if text contains a REAL goal using smart keyword analysis.
    
    Layer 1: Check for negations (invalidates goal)
    Layer 2: Check for strong keywords (confirms immediately)
    Layer 3: Check weak keywords + context (needs confirmation)
    
    Returns:
        {
            'is_goal': True/False,
            'confidence': 0.0-1.0,
            'reason': 'strong_keyword' | 'context_confirmed' | 'negated' | 'unconfirmed'
        }
    """
    text_upper = text.upper()
    full_context = (text + " " + surrounding_text).upper()
    
    # 1. Check negations FIRST (invalidates the goal)
    for negation in GOAL_NEGATION_CONTEXT:
        if re.search(negation, text_upper):  # Check in main text only
            return {'is_goal': False, 'confidence': 0.95, 'reason': 'negated'}
    
    # 2. Check STRONG keywords (confirms immediately)
    for strong in GOAL_STRONG_KEYWORDS:
        if re.search(strong, text_upper, re.IGNORECASE):
            return {'is_goal': True, 'confidence': 1.0, 'reason': 'strong_keyword'}
    
    # 3. Check WEAK keywords + context
    has_weak_keyword = False
    for weak in GOAL_WEAK_KEYWORDS:
        if re.search(weak, text_upper, re.IGNORECASE):
            has_weak_keyword = True
            break
    
    if has_weak_keyword:
        # Need confirmation from context
        for confirmation in GOAL_CONFIRMATION_CONTEXT:
            if re.search(confirmation, full_context, re.IGNORECASE):
                return {'is_goal': True, 'confidence': 0.95, 'reason': 'context_confirmed'}
        
        # Weak keyword without confirmation - uncertain
        return {'is_goal': False, 'confidence': 0.5, 'reason': 'unconfirmed'}
    
    return {'is_goal': False, 'confidence': 0.0, 'reason': 'no_keyword'}


def get_surrounding_context(srt_blocks: list, current_index: int, window: int = 2) -> str:
    """
    Get text from neighboring SRT blocks for context analysis.
    
    Args:
        srt_blocks: List of SRT block tuples (index, hours, minutes, seconds, ms, text)
        current_index: Current block index
        window: Number of blocks before/after to include
    
    Returns:
        Combined text from surrounding blocks
    """
    start = max(0, current_index - window)
    end = min(len(srt_blocks), current_index + window + 1)
    
    texts = []
    for i in range(start, end):
        if i != current_index and i < len(srt_blocks):
            texts.append(srt_blocks[i][5])  # text is at index 5
    
    return " ".join(texts)


# Event keywords for detection - Portuguese narration patterns
# Note: Goals are now handled separately by the confirmation system
EVENT_KEYWORDS = {
    'goal': [
        # All goal patterns are now processed by confirm_goal_event()
        # These are just triggers to activate the confirmation system
        r'GO+L',           # GOOOL, GOOOOL, GOL
        r'GOLAÇO',         # Golaço
        r'É GOL',          # É gol!
        r'PRA DENTRO',     # Mandou pra dentro
        r'ENTROU',         # Entrou!
        r'BOLA NA REDE',   # Bola na rede
        r'ESTUFOU A REDE', # Estufou a rede
        r'ABRE O PLACAR',  # Abre o placar
        r'EMPATA O JOGO',  # Empata o jogo
        r'VIRA O JOGO',    # Vira o jogo
        r'VIROU O JOGO',   # Virou o jogo
        r'AMPLIA',         # Amplia o placar
        r'PRIMEIRO GOL',   # Primeiro gol
        r'SEGUNDO GOL',    # Segundo gol
        r'TERCEIRO GOL',   # Terceiro gol
    ],
    # 🔧 yellow_card DESABILITADO - menções de cartão amarelo serão ignoradas
    # 'yellow_card': [
    #     r'CARTÃO AMARELO',
    #     r'AMARELO PARA',
    #     r'RECEBE O AMARELO',
    #     r'LEVA AMARELO',
    #     r'ESTÁ AMARELADO',
    # ],
    # 🔧 red_card DESABILITADO - menções de cartão vermelho serão ignoradas
    # 'red_card': [
    #     r'CARTÃO VERMELHO',
    #     r'VERMELHO PARA',
    #     r'EXPULSO',
    #     r'FOI EXPULSO',
    #     r'RECEBE O VERMELHO',
    #     r'LEVA VERMELHO',
    # ],
    'foul': [
        r'FALTA DE',
        r'FALTA PARA',
        r'COMETEU FALTA',
        r'FALTA PERIGOSA',
        r'FALTA DURA',
    ],
    'corner': [
        r'ESCANTEIO',
        r'CÓRNER',
        r'BATE O ESCANTEIO',
        r'COBRANÇA DE ESCANTEIO',
    ],
    'penalty': [
        r'PÊNALTI',
        r'PENALIDADE MÁXIMA',
        r'MARCA O PÊNALTI',
        r'VAI COBRAR O PÊNALTI',
    ],
    'save': [
        r'GRANDE DEFESA',
        r'DEFESAÇA',
        r'SALVOU O GOL',
        r'ESPETACULAR DEFESA',
        r'MILAGRE DO GOLEIRO',
    ],
    'chance': [
        r'QUASE GOL',
        r'POR POUCO',
        r'RASPOU',
        r'NA TRAVE',
        r'PASSOU PERTO',
        r'QUE CHANCE',
        r'PERDEU O GOL',
    ]
}


def refine_event_timestamp_from_srt(
    event: Dict[str, Any],
    srt_path: str,
    window_seconds: int = 30
) -> Dict[str, Any]:
    """
    Refine event timestamp by finding the exact keyword in SRT.
    
    Phase 4 of the dual verification system:
    Searches for event keywords in a ±30s window around the AI-detected timestamp
    and updates the timestamp to the exact SRT position.
    
    Args:
        event: Event detected by AI with 'minute', 'second', 'event_type'
        srt_path: Path to SRT file
        window_seconds: Search window in seconds (default ±30s)
        
    Returns:
        Event with refined 'videoSecond', 'minute', 'second' if keyword found
    """
    import re
    
    event_type = event.get('event_type', '')
    keywords = EVENT_KEYWORDS.get(event_type, [])
    
    if not keywords or not os.path.exists(srt_path):
        return event
    
    # Calculate AI-detected timestamp in total seconds
    ai_minute = event.get('minute', 0)
    ai_second = event.get('second', 0)
    ai_total_seconds = ai_minute * 60 + ai_second
    
    try:
        with open(srt_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Parse SRT blocks: find timestamps and text
        # Format: HH:MM:SS,mmm --> HH:MM:SS,mmm
        srt_pattern = r'(\d{2}):(\d{2}):(\d{2}),\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}\s*\n(.*?)(?=\n\n|\Z)'
        matches = re.findall(srt_pattern, content, re.DOTALL)
        
        best_match = None
        best_distance = float('inf')
        
        for hours, minutes, seconds, text in matches:
            srt_total_seconds = int(hours) * 3600 + int(minutes) * 60 + int(seconds)
            
            # Check if within window
            distance = abs(srt_total_seconds - ai_total_seconds)
            if distance > window_seconds:
                continue
            
            # Check if any keyword matches
            text_upper = text.upper()
            for pattern in keywords:
                if re.search(pattern, text_upper, re.IGNORECASE):
                    # Found keyword! Check if closer than previous best
                    if distance < best_distance:
                        best_distance = distance
                        best_match = {
                            'srt_seconds': srt_total_seconds,
                            'srt_minute': int(minutes) + int(hours) * 60,
                            'srt_second': int(seconds),
                            'keyword': pattern,
                            'text': text.strip()[:80]
                        }
                    break  # Found keyword in this block, move to next
        
        # Update event if we found a better timestamp
        if best_match:
            original_time = f"{ai_minute}:{ai_second:02d}"
            new_time = f"{best_match['srt_minute']}:{best_match['srt_second']:02d}"
            
            event['minute'] = best_match['srt_minute']
            event['second'] = best_match['srt_second']
            event['videoSecond'] = best_match['srt_seconds']
            event['refined'] = True
            event['refinement_method'] = 'keyword'
            event['refinement_delta'] = best_distance
            
            print(f"[AI] 🎯 Refinado {event_type}: {original_time} → {new_time} (Δ{best_distance}s, keyword: {best_match['keyword']})")
        
    except Exception as e:
        print(f"[AI] ⚠ Erro ao refinar timestamp: {e}")
    
    return event


def detect_team_from_text(text: str, home_team: str, away_team: str) -> str:
    """
    Detect which team is mentioned in the text.
    Returns 'home', 'away', or 'unknown'.
    
    IMPROVED: Uses aliases and partial matching for better accuracy.
    """
    text_upper = text.upper()
    home_upper = home_team.upper()
    away_upper = away_team.upper()
    
    # Get significant words from team names (length > 2)
    home_words = [w for w in home_upper.split() if len(w) > 2]
    away_words = [w for w in away_upper.split() if len(w) > 2]
    
    # Add aliases from TEAM_ALIASES dictionary for better matching
    for key, aliases in TEAM_ALIASES.items():
        key_upper = key.upper()
        if key_upper in home_upper or home_upper in key_upper:
            home_words.extend([a.upper() for a in aliases])
        if key_upper in away_upper or away_upper in key_upper:
            away_words.extend([a.upper() for a in aliases])
    
    # Remove duplicates and short words
    home_words = list(set(w for w in home_words if len(w) > 3))
    away_words = list(set(w for w in away_words if len(w) > 3))
    
    # Check for any word match
    home_found = any(w in text_upper for w in home_words) or home_upper in text_upper
    away_found = any(w in text_upper for w in away_words) or away_upper in text_upper
    
    if home_found and not away_found:
        return 'home'
    elif away_found and not home_found:
        return 'away'
    else:
        return 'unknown'


def deduplicate_events(events: List[Dict], threshold_seconds: int = 60) -> List[Dict]:
    """
    Remove duplicate events of the SAME TYPE and SAME TEAM that are too close in time.
    Events of DIFFERENT types or DIFFERENT teams are allowed even if close together.
    
    IMPROVED:
    - Increased threshold to 60s (narrators repeat goals for ~1 minute)
    - Also considers 'team' field to avoid removing goals from different teams
    - Better timestamp handling: uses videoSecond, falls back to minute*60
    
    This allows:
    - Goal at 24:45 (home), Goal at 24:50 (away) - both kept (different teams)
    - Goal at 24:45, Foul at 24:50 - both kept (different types)
    
    But prevents:
    - Goal at 24:45 (home), Goal at 24:47 (home) - duplicate, only one kept
    """
    if not events:
        return []
    
    # Sort by timestamp - use videoSecond if available, otherwise calculate from minute
    sorted_events = sorted(events, key=lambda e: e.get('videoSecond', e.get('minute', 0) * 60 + e.get('second', 0)))
    
    result = []
    
    for event in sorted_events:
        event_type = event.get('event_type')
        event_team = event.get('team', 'unknown')
        event_time = event.get('videoSecond', event.get('minute', 0) * 60 + event.get('second', 0))
        
        # Check if there's already an event of the SAME TYPE AND TEAM too close
        is_duplicate = False
        duplicate_index = -1
        
        for i, existing in enumerate(result):
            existing_type = existing.get('event_type')
            existing_team = existing.get('team', 'unknown')
            
            # Only compare same type AND same team
            if existing_type == event_type and existing_team == event_team:
                existing_time = existing.get('videoSecond', existing.get('minute', 0) * 60 + existing.get('second', 0))
                time_diff = abs(event_time - existing_time)
                
                if time_diff < threshold_seconds:
                    # Same type, same team, too close - it's a duplicate
                    is_duplicate = True
                    duplicate_index = i
                    
                    # Keep the one with higher confidence
                    curr_conf = event.get('confidence', 0)
                    existing_conf = existing.get('confidence', 0)
                    
                    if curr_conf > existing_conf:
                        result[duplicate_index] = event  # Replace with higher confidence
                        print(f"[DEDUP] ♻️ Substituindo duplicata: {event_type} @ {event_time}s (conf: {existing_conf:.2f} → {curr_conf:.2f})")
                    else:
                        print(f"[DEDUP] ⚠️ Ignorando duplicata: {event_type} {event_team} @ {event_time}s (Δ{time_diff:.0f}s)")
                    break
        
        if not is_duplicate:
            result.append(event)
    
    print(f"[DEDUP] ✓ {len(events)} eventos → {len(result)} após deduplicação (threshold: {threshold_seconds}s)")
    return result


def detect_goals_by_sliding_window(
    srt_blocks: List[Tuple],
    home_team: str,
    away_team: str,
    segment_start_minute: int = 0,
    half: str = 'first',
    window_size: int = 5,
    min_goal_mentions: int = 3,
    min_block_gap: int = 5
) -> List[Dict[str, Any]]:
    """
    Detecta gols REAIS analisando repetição em janela deslizante de 5 linhas.
    
    Um gol REAL é caracterizado por:
    - "gol" repetido 3+ vezes em uma janela de 5 linhas consecutivas
    - Exclui "goleiro" da contagem
    - Nome do time ou jogador geralmente presente
    - Usa timestamp da linha CENTRAL como referência
    - Mínimo de 5 blocos entre gols do mesmo time (evita duplicatas)
    
    Exemplo de gol REAL no SRT:
        365: "de Felipe Coutinho, ele gosta de bater pro gol daí."
        366: "Olha a bomba! Aí o gol! Aí o gol! Aí"
        367: "o gol! Aí o gol! Gol! É do Brasil! Brasil"  ← CENTRO
        368: "Brasil do Felipe Coutinho! Do jeitinho que ele gosta!"
        369: "ele pegou aí na bola eu disse..."
    Total: 7 menções de "gol" em 5 linhas = é gol real!
    
    Args:
        srt_blocks: List of SRT block tuples (index, hours, minutes, seconds, ms, text)
        home_team: Nome do time da casa
        away_team: Nome do time visitante
        segment_start_minute: Minuto inicial do segmento (0 para primeiro tempo)
        half: 'first' ou 'second'
        window_size: Tamanho da janela (padrão: 5 linhas)
        min_goal_mentions: Mínimo de menções de "gol" para confirmar (padrão: 3)
        min_block_gap: Espaçamento mínimo entre gols do mesmo time (padrão: 5 blocos)
    
    Returns:
        Lista de eventos de gol detectados
    """
    goals = []
    
    # Padrão para contar "gol" (excluindo "goleiro")
    goal_pattern = r'\bgol\b(?!eiro)'
    
    # Track último bloco de gol por time para evitar duplicatas
    last_goal_block = {'home': -10, 'away': -10, 'unknown': -10}
    
    print(f"[SlidingWindow] 🎯 Iniciando detecção de gols por janela deslizante...")
    print(f"[SlidingWindow]   Janela: {window_size} linhas")
    print(f"[SlidingWindow]   Mínimo de menções: {min_goal_mentions}")
    print(f"[SlidingWindow]   Espaçamento mínimo: {min_block_gap} blocos")
    print(f"[SlidingWindow]   Total de blocos: {len(srt_blocks)}")
    
    for i in range(len(srt_blocks)):
        # Criar janela: 2 antes + atual + 2 depois (5 linhas total)
        start = max(0, i - 2)
        end = min(len(srt_blocks), i + 3)
        window = srt_blocks[start:end]
        
        # Concatenar texto da janela
        window_text = ' '.join([b[5] for b in window]).lower()
        
        # ═══════════════════════════════════════════════════════════════
        # NOVO: Filtro Anti-Times-Externos
        # Se mencionar time que NÃO está jogando, é sobre outro jogo
        # ═══════════════════════════════════════════════════════════════
        if is_other_game_commentary(window_text, home_team, away_team):
            print(f"[SlidingWindow] ⚠ Bloco {i}: Gol ignorado (menciona time externo ou outro jogo)")
            continue
        
        # Contar "gol" (excluindo "goleiro") - usar função avançada
        goal_count = count_goal_hits(window_text)
        
        # Fallback: usar regex simples se count_goal_hits retornar 0
        if goal_count == 0:
            goal_count = len(re.findall(goal_pattern, window_text, re.IGNORECASE))
        
        # Critério 1: mínimo de menções
        if goal_count < min_goal_mentions:
            continue
        
        # Extrair features avançadas da janela
        features = window_goal_features(window)
        
        # Critério extra: verificar frases de "outro jogo"
        if features['other_game_phrase']:
            print(f"[SlidingWindow] ⚠ Bloco {i}: Gol ignorado (frase de outro jogo detectada)")
            continue
        
        # Detectar time na janela usando ANÁLISE DE PROXIMIDADE
        # Isso evita atribuir gols ao time errado quando ambos são mencionados
        goal_author_result = detect_goal_author(window_text, home_team, away_team)
        team = goal_author_result['team']
        goal_confidence = goal_author_result['confidence']
        goal_method = goal_author_result['method']
        
        # Critério 2: espaçamento de blocos (evita duplicatas do mesmo narrador celebrando)
        if i - last_goal_block[team] < min_block_gap:
            print(f"[SlidingWindow] ⏳ Bloco {i}: Gol ignorado (<{min_block_gap} blocos de distância do último {team})")
            continue
        
        # É um gol real! Usar bloco central para timestamp
        center_block = srt_blocks[i]
        _, hours, minutes, seconds, _, text = center_block
        timestamp_seconds = hours * 3600 + minutes * 60 + seconds
        
        # Calcular minuto de jogo (para exibição)
        game_minute = segment_start_minute + minutes + (hours * 60)
        
        # Extrair jogador (se possível) - procurar nomes próprios na janela
        player = extract_player_from_window(window_text)
        
        # Check for own goal
        is_own_goal = 'contra' in window_text
        
        # Calcular confiança COMBINADA: menções + atribuição de time
        mention_confidence = min(0.95, 0.6 + (goal_count * 0.1))
        # Usar o menor entre confiança de menções e confiança de atribuição
        confidence = min(mention_confidence, goal_confidence) if goal_confidence > 0 else mention_confidence * 0.8
        
        goal_event = {
            'event_type': 'goal',
            'minute': minutes,
            'second': seconds,
            'videoSecond': timestamp_seconds,
            'game_minute': game_minute,
            'team': team,
            'player': player,
            'description': f"Gol! {player or team}",
            'source_text': text,
            'match_half': 'first_half' if half == 'first' else 'second_half',
            'is_highlight': True,
            'isOwnGoal': is_own_goal,
            'confidence': confidence,
            'goal_mentions': goal_count,
            'detection_method': 'sliding_window',
            'team_attribution_method': goal_method,  # pattern, proximity, count, fallback
            'block_index': i
        }
        
        goals.append(goal_event)
        
        # Registrar para evitar duplicatas
        last_goal_block[team] = i
        print(f"[SlidingWindow] ✓ GOL detectado no bloco {i} [{minutes:02d}:{seconds:02d}] - {goal_count}x 'gol' - {team} ({goal_method}) - conf: {confidence:.2f}")
    
    print(f"[SlidingWindow] 📊 Total: {len(goals)} gols detectados por janela deslizante")
    return goals


def extract_player_from_window(window_text: str) -> Optional[str]:
    """
    Tenta extrair nome de jogador do texto da janela.
    Procura por padrões como "gol do Fulano", "de Fulano", etc.
    
    Args:
        window_text: Texto concatenado da janela de 5 linhas
        
    Returns:
        Nome do jogador ou None se não encontrado
    """
    # Padrões comuns para identificar jogadores
    patterns = [
        r'\bgol\s+d[eo]\s+([A-Z][a-záéíóúàèìòùâêîôûãõç]+(?:\s+[A-Z][a-záéíóúàèìòùâêîôûãõç]+)?)',  # "gol do Fulano"
        r'\bd[eo]\s+([A-Z][a-záéíóúàèìòùâêîôûãõç]+(?:\s+[A-Z][a-záéíóúàèìòùâêîôûãõç]+)?)',  # "de Fulano"
        r'\b([A-Z][a-záéíóúàèìòùâêîôûãõç]+(?:\s+[A-Z][a-záéíóúàèìòùâêîôûãõç]+)?)\s+(?:faz|marca|fez|marcou)',  # "Fulano faz/marca"
    ]
    
    for pattern in patterns:
        match = re.search(pattern, window_text)
        if match:
            name = match.group(1).strip()
            # Validar que não é uma palavra comum
            common_words = ['brasil', 'argentina', 'time', 'jogador', 'goleiro', 'jogo']
            if name.lower() not in common_words and len(name) > 3:
                return name
    
    return None


def detect_events_by_keywords(
    srt_path: str,
    home_team: str,
    away_team: str,
    half: str = 'first',
    segment_start_minute: int = 0
) -> List[Dict[str, Any]]:
    """
    Detect events using keywords from SRT file.
    
    GOALS: Uses sliding window algorithm for precision detection.
    OTHER EVENTS: Uses keyword matching with confirmation.
    
    This is a deterministic detector - no AI calls required.
    Precision: ~99% for goals (with sliding window)
    Speed: <1 second
    Cost: $0.00
    
    Args:
        srt_path: Path to SRT file
        home_team: Home team name
        away_team: Away team name
        half: 'first' or 'second'
        segment_start_minute: Starting minute for game time (0 for first, 45 for second)
    
    Returns:
        List of events with precise timestamps
    """
    events = []
    
    # Read SRT file
    try:
        with open(srt_path, 'r', encoding='utf-8') as f:
            srt_content = f.read()
    except Exception as e:
        print(f"[KEYWORDS] ❌ Erro ao ler SRT: {e}")
        return []
    
    print(f"[KEYWORDS] 🔍 Iniciando detecção por palavras-chave...")
    print(f"[KEYWORDS] SRT: {srt_path}")
    print(f"[KEYWORDS] Times: {home_team} vs {away_team}")
    print(f"[KEYWORDS] Tempo: {half} (minuto inicial: {segment_start_minute})")
    
    # Regex to extract SRT blocks: index, timestamp, text
    # Format: "1\n00:24:45,000 --> 00:24:50,000\nText here\n\n"
    pattern = r'(\d+)\n(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}\n(.+?)(?=\n\n|\Z)'
    
    matches = list(re.finditer(pattern, srt_content, re.DOTALL))
    print(f"[KEYWORDS] 📄 Encontrados {len(matches)} blocos de legenda no SRT")
    
    # Pre-parse all blocks for context analysis
    srt_blocks = []
    for match in matches:
        block_data = (
            int(match.group(1)),    # index
            int(match.group(2)),    # hours
            int(match.group(3)),    # minutes
            int(match.group(4)),    # seconds
            int(match.group(5)),    # milliseconds
            match.group(6).replace('\n', ' ').strip()  # text
        )
        srt_blocks.append(block_data)
    
    # ═══════════════════════════════════════════════════════════════
    # GOLS: Usar algoritmo de janela deslizante (mais preciso)
    # ═══════════════════════════════════════════════════════════════
    goal_events = detect_goals_by_sliding_window(
        srt_blocks=srt_blocks,
        home_team=home_team,
        away_team=away_team,
        segment_start_minute=segment_start_minute,
        half=half,
        window_size=5,
        min_goal_mentions=3,
        min_block_gap=5
    )
    events.extend(goal_events)
    print(f"[KEYWORDS] 🎯 {len(goal_events)} gols detectados por sliding window")
    
    # ═══════════════════════════════════════════════════════════════
    # OUTROS EVENTOS: Usar keywords tradicionais (cartões, faltas, etc.)
    # ═══════════════════════════════════════════════════════════════
    for block_index, block in enumerate(srt_blocks):
        _, hours, minutes, seconds, _, text = block
        text_upper = text.upper()
        
        # Calculate timestamp in seconds (absolute video time)
        timestamp_seconds = hours * 3600 + minutes * 60 + seconds
        
        # Calculate game minute (for display)
        game_minute = segment_start_minute + minutes + (hours * 60)
        
        # ═══════════════════════════════════════════════════════════════
        # NOVO: Obter contexto da janela (2 blocos antes e depois)
        # ═══════════════════════════════════════════════════════════════
        window_start = max(0, block_index - 2)
        window_end = min(len(srt_blocks), block_index + 3)
        window_blocks = srt_blocks[window_start:window_end]
        window_text = ' '.join([b[5] for b in window_blocks])
        
        # Search for keywords (SKIP GOALS - already handled by sliding window)
        for event_type, keywords in EVENT_KEYWORDS.items():
            # PULAR GOLS - já foram detectados por sliding window
            if event_type == 'goal':
                continue
            
            for keyword in keywords:
                if re.search(keyword, text_upper, re.IGNORECASE):
                    
                    # ═══════════════════════════════════════════════════════════════
                    # NOVO: Filtro Anti-Times-Externos (aplica a TODOS os eventos)
                    # ═══════════════════════════════════════════════════════════════
                    if is_other_game_commentary(window_text, home_team, away_team):
                        print(f"[KEYWORDS] ⚠ {event_type.upper()} ignorado (outro time/jogo mencionado)")
                        continue
                    
                    # ═══════════════════════════════════════════════════════════════
                    # NOVO: Validações específicas por tipo de evento
                    # ═══════════════════════════════════════════════════════════════
                    confidence = 1.0
                    confirmation_reason = 'keyword_match'
                    
                    # Validação de cartões
                    if event_type in ['yellow_card', 'red_card']:
                        validation = validate_card_event(text, window_text, event_type, home_team, away_team)
                        if not validation['is_valid']:
                            print(f"[KEYWORDS] ⚠ {event_type.upper()} ignorado ({validation['reason']})")
                            continue
                        confidence = validation['confidence']
                        confirmation_reason = validation['reason']
                    
                    # Validação de pênaltis
                    if event_type == 'penalty':
                        validation = validate_penalty_event(text, window_text, home_team, away_team)
                        if not validation['is_valid']:
                            print(f"[KEYWORDS] ⚠ {event_type.upper()} ignorado ({validation['reason']})")
                            continue
                        confidence = validation['confidence']
                        confirmation_reason = validation['reason']
                    
                    # Detect team
                    team = detect_team_from_text(text, home_team, away_team)
                    
                    # Check for own goal (for edge cases)
                    is_own_goal = 'CONTRA' in text_upper or 'PRÓPRIO' in text_upper
                    
                    event = {
                        'event_type': event_type,
                        'minute': minutes,
                        'second': seconds,
                        'videoSecond': timestamp_seconds,
                        'game_minute': game_minute,
                        'team': team,
                        'description': text[:60],
                        'source_text': text,
                        'match_half': 'first_half' if half == 'first' else 'second_half',
                        'is_highlight': event_type in ['goal', 'red_card', 'penalty'],
                        'isOwnGoal': is_own_goal,
                        'confidence': confidence,
                        'confirmation_reason': confirmation_reason,
                        'detection_method': 'keyword'
                    }
                    
                    events.append(event)
                    print(f"[KEYWORDS] ✓ {event_type.upper()} detectado em [{minutes:02d}:{seconds:02d}] - {text[:40]}... (conf: {confidence:.2f})")
                    
                    break  # Avoid duplicates for same text
            else:
                continue
            break  # Found an event, move to next SRT block
    
    # Deduplicate close events (only deduplicates SAME type and SAME team events)
    original_count = len(events)
    events = deduplicate_events(events, threshold_seconds=30)
    
    # Count by type
    event_counts = {}
    for e in events:
        etype = e.get('event_type', 'unknown')
        event_counts[etype] = event_counts.get(etype, 0) + 1
    
    print(f"\n[KEYWORDS] ═══════════════════════════════════════════════════")
    print(f"[KEYWORDS] 📊 RESULTADO DA DETECÇÃO:")
    print(f"[KEYWORDS]   Total bruto: {original_count} eventos")
    print(f"[KEYWORDS]   Após dedup:  {len(events)} eventos")
    print(f"[KEYWORDS]   Por tipo: {event_counts}")
    print(f"[KEYWORDS] ═══════════════════════════════════════════════════\n")
    
    return events


# API configuration
LOVABLE_API_KEY = os.environ.get('LOVABLE_API_KEY', '')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
ELEVENLABS_API_KEY = os.environ.get('ELEVENLABS_API_KEY', '')
GOOGLE_API_KEY = os.environ.get('GOOGLE_GENERATIVE_AI_API_KEY', '')
OLLAMA_URL = os.environ.get('OLLAMA_URL', 'http://localhost:11434')
OLLAMA_MODEL = os.environ.get('OLLAMA_MODEL', 'llama3.2')
OLLAMA_ENABLED = os.environ.get('OLLAMA_ENABLED', 'true').lower() == 'true'  # FREE by default!

# Provider enabled flags (default all enabled if key exists)
GEMINI_ENABLED = True
OPENAI_ENABLED = True
ELEVENLABS_ENABLED = True

# Local Whisper settings (FREE transcription)
# ============================================================================
# WORKAROUND: ctranslate2 4.4.0 bug on Windows/CUDA
# The library tries to access _rocm_sdk_core/bin which doesn't exist on CUDA
# We suppress this error and fall back to CPU if necessary
# ============================================================================
import warnings
import sys

# Suppress ctranslate2 ROCm warnings on Windows/CUDA
_CTRANSLATE2_ROCM_ERROR = False
_CTRANSLATE2_ERROR_MSG = None

# Auto-detect if faster-whisper is installed with proper error handling
try:
    # Suppress the specific ROCm error during import
    with warnings.catch_warnings():
        warnings.filterwarnings('ignore', category=UserWarning)
        warnings.filterwarnings('ignore', category=RuntimeWarning)
        
        # Try to import ctranslate2 first to catch ROCm errors
        try:
            import ctranslate2
        except (OSError, FileNotFoundError) as e:
            if '_rocm_sdk_core' in str(e) or 'rocm' in str(e).lower():
                print(f"[LocalWhisper] ⚠️ ctranslate2 ROCm error detectado (ambiente CUDA/Windows)")
                print(f"[LocalWhisper] ⚠️ Erro: {e}")
                print(f"[LocalWhisper] ⚠️ Usando fallback para CPU...")
                _CTRANSLATE2_ROCM_ERROR = True
                _CTRANSLATE2_ERROR_MSG = str(e)
                # Force CPU mode to avoid ROCm issues
                import os as _os
                _os.environ['CUDA_VISIBLE_DEVICES'] = ''
                _os.environ['CT2_USE_EXPERIMENTAL_PACKED_GEMM'] = '0'
                # Retry import
                import ctranslate2
            else:
                raise
        
        from faster_whisper import WhisperModel
    _FASTER_WHISPER_AVAILABLE = True
    
    if _CTRANSLATE2_ROCM_ERROR:
        print(f"[LocalWhisper] ✓ faster-whisper carregado em modo CPU (workaround ROCm)")
    else:
        print(f"[LocalWhisper] ✓ faster-whisper disponível")
        
except ImportError as e:
    _FASTER_WHISPER_AVAILABLE = False
    print(f"[LocalWhisper] ✗ faster-whisper não disponível: {e}")
except Exception as e:
    _FASTER_WHISPER_AVAILABLE = False
    _CTRANSLATE2_ERROR_MSG = str(e)
    print(f"[LocalWhisper] ✗ Erro ao carregar faster-whisper: {e}")

# Enable by default if library is installed, or via env var
LOCAL_WHISPER_ENABLED = _FASTER_WHISPER_AVAILABLE or os.environ.get('LOCAL_WHISPER_ENABLED', 'false').lower() == 'true'
LOCAL_WHISPER_MODEL = os.environ.get('LOCAL_WHISPER_MODEL', 'base')

LOVABLE_API_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions'
OPENAI_API_URL = 'https://api.openai.com/v1'
GOOGLE_API_URL = 'https://generativelanguage.googleapis.com/v1beta'

# Log de verificação das chaves na inicialização
print(f"\n[AI Services] ========== API Keys Status ==========")
print(f"[AI Services] LOVABLE_API_KEY: {'✓ configurada' if LOVABLE_API_KEY else '✗ não configurada'}")
print(f"[AI Services] OPENAI_API_KEY: {'✓ configurada' if OPENAI_API_KEY else '✗ não configurada'}")
print(f"[AI Services] ELEVENLABS_API_KEY: {'✓ configurada' if ELEVENLABS_API_KEY else '✗ não configurada'}")
print(f"[AI Services] GOOGLE_API_KEY: {'✓ configurada' if GOOGLE_API_KEY else '✗ não configurada'}")
print(f"[AI Services] LOCAL_WHISPER: {'✓ disponível' if LOCAL_WHISPER_ENABLED else '✗ não disponível'}")
print(f"[AI Services] =====================================\n")

# Faster-Whisper model cache (singleton)
_whisper_model = None
_whisper_model_name = None


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
    elevenlabs_enabled: bool = None,
    local_whisper_enabled: bool = None,
    local_whisper_model: str = None
):
    """Set API keys programmatically."""
    global LOVABLE_API_KEY, OPENAI_API_KEY, ELEVENLABS_API_KEY, GOOGLE_API_KEY
    global OLLAMA_URL, OLLAMA_MODEL, OLLAMA_ENABLED
    global GEMINI_ENABLED, OPENAI_ENABLED, ELEVENLABS_ENABLED
    global LOCAL_WHISPER_ENABLED, LOCAL_WHISPER_MODEL
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
    if local_whisper_enabled is not None:
        LOCAL_WHISPER_ENABLED = local_whisper_enabled
    if local_whisper_model is not None:
        LOCAL_WHISPER_MODEL = local_whisper_model


def call_ollama(
    messages: List[Dict[str, str]],
    model: str = None,
    temperature: float = 0.7,
    max_tokens: int = 4096,
    format: str = None  # NOVO: "json" para forçar resposta JSON válida
) -> Optional[str]:
    """
    Call local Ollama API.
    
    Args:
        messages: List of message dicts with 'role' and 'content'
        model: Model to use (default: from settings)
        temperature: Sampling temperature
        max_tokens: Maximum tokens in response
        format: Response format - "json" forces valid JSON output (recommended for structured extraction)
    
    Returns:
        The AI response text or None on error
    """
    model = model or OLLAMA_MODEL
    url = f"{OLLAMA_URL}/api/chat"
    
    # Preparar payload
    payload = {
        'model': model,
        'messages': messages,
        'stream': False,
        'options': {
            'temperature': temperature,
            'num_predict': max_tokens
        }
    }
    
    # Habilitar modo JSON nativo do Ollama (elimina problemas de parsing)
    if format:
        payload['format'] = format
        print(f"[Ollama] Modo JSON nativo ativado para resposta estruturada")
    
    try:
        response = requests.post(
            url,
            json=payload,
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


def get_ai_status() -> Dict[str, Any]:
    """
    Check which AI providers are configured and available.
    
    Returns:
        Dict with provider status information
    """
    providers = {
        'lovable': {
            'configured': bool(LOVABLE_API_KEY),
            'enabled': True,
            'keySet': bool(LOVABLE_API_KEY)
        },
        'gemini': {
            'configured': bool(GOOGLE_API_KEY) and GEMINI_ENABLED,
            'enabled': GEMINI_ENABLED,
            'keySet': bool(GOOGLE_API_KEY)
        },
        'openai': {
            'configured': bool(OPENAI_API_KEY) and OPENAI_ENABLED,
            'enabled': OPENAI_ENABLED,
            'keySet': bool(OPENAI_API_KEY)
        },
        'elevenlabs': {
            'configured': bool(ELEVENLABS_API_KEY) and ELEVENLABS_ENABLED,
            'enabled': ELEVENLABS_ENABLED,
            'keySet': bool(ELEVENLABS_API_KEY)
        },
        'ollama': {
            'configured': OLLAMA_ENABLED,
            'url': OLLAMA_URL if OLLAMA_ENABLED else None,
            'model': OLLAMA_MODEL if OLLAMA_ENABLED else None
        }
    }
    
    any_configured = any([
        providers['lovable']['configured'],
        providers['gemini']['configured'],
        providers['openai']['configured'],
        providers['ollama']['configured']
    ])
    
    any_transcription = any([
        providers['lovable']['configured'],
        providers['gemini']['configured'],
        providers['openai']['configured'],
        LOCAL_WHISPER_ENABLED
    ])
    
    any_analysis = any([
        providers['lovable']['configured'],
        providers['gemini']['configured'],
        providers['openai']['configured'],
        providers['ollama']['configured']
    ])
    
    return {
        'lovable': providers['lovable']['configured'],
        'gemini': providers['gemini']['configured'],
        'openai': providers['openai']['configured'],
        'elevenlabs': providers['elevenlabs']['configured'],
        'ollama': providers['ollama']['configured'],
        'anyConfigured': any_configured,
        'anyTranscription': any_transcription,
        'anyAnalysis': any_analysis,
        'message': 'AI providers status',
        'providers': providers
    }


def get_ai_priority_order(settings: Dict[str, str] = None) -> List[str]:
    """
    Get the AI provider priority order from settings.
    Providers with priority=0 are disabled and excluded.
    
    Args:
        settings: Dict of setting_key -> setting_value
        
    Returns:
        List of provider IDs in priority order (e.g., ['lovable', 'gemini'])
    """
    if settings is None:
        settings = {}
    
    providers = []
    for provider_id in ['ollama', 'lovable', 'gemini', 'openai']:
        key = f'ai_provider_{provider_id}_priority'
        priority_str = settings.get(key, '0')
        try:
            priority = int(priority_str)
        except (ValueError, TypeError):
            priority = 0
        
        if priority > 0:
            providers.append((provider_id, priority))
    
    # Sort by priority ascending (1 = first, 2 = second, etc.)
    providers.sort(key=lambda x: x[1])
    
    result = [p[0] for p in providers]
    
    # Fallback if nothing configured - use Ollama (100% local & free)
    if not result:
        if OLLAMA_ENABLED:
            print("[AI] ⚠ No priority configured, using fallback: ollama (100% local)")
            result = ['ollama']
        else:
            print("[AI] ⚠ No priority configured and Ollama disabled - no AI available")
            result = []
    
    return result


def call_ai(
    messages: List[Dict[str, str]],
    model: str = 'gemini-2.5-flash',
    temperature: float = 0.7,
    max_tokens: int = 4096,
    settings: Dict[str, str] = None
) -> Optional[str]:
    """
    Universal AI caller with dynamic priority from database settings.
    
    Args:
        messages: List of message dicts
        model: Model to use
        temperature: Sampling temperature
        max_tokens: Maximum tokens
        settings: Optional settings dict with priority configuration
    
    Returns:
        AI response text or None
    """
    priority_order = get_ai_priority_order(settings)
    print(f"[AI] Priority order: {' → '.join(priority_order)}")
    
    last_error = None
    result = None
    
    for provider in priority_order:
        try:
            print(f"[AI] Trying {provider}...")
            
            if provider == 'ollama' and OLLAMA_ENABLED:
                result = call_ollama(messages, model=OLLAMA_MODEL, temperature=temperature, max_tokens=max_tokens)
                if result:
                    print(f"[AI] ✓ Success with Ollama ({OLLAMA_MODEL})")
                    return result
                    
            elif provider == 'lovable' and LOVABLE_API_KEY:
                result = call_lovable_ai(messages, model, temperature, max_tokens)
                if result:
                    print(f"[AI] ✓ Success with Lovable AI")
                    return result
                    
            elif provider == 'gemini' and GEMINI_ENABLED and GOOGLE_API_KEY:
                result = call_google_gemini(messages, model, temperature, max_tokens)
                if result:
                    print(f"[AI] ✓ Success with Gemini")
                    return result
                    
            elif provider == 'openai' and OPENAI_ENABLED and OPENAI_API_KEY:
                result = call_openai(messages, 'gpt-4o-mini', temperature, max_tokens)
                if result:
                    print(f"[AI] ✓ Success with OpenAI")
                    return result
            else:
                print(f"[AI] ⚠ {provider} not available (disabled or no API key)")
                
        except Exception as e:
            last_error = e
            print(f"[AI] ✗ {provider} failed: {e}")
            continue
    
    # ═══════════════════════════════════════════════════════════════════════════
    # FALLBACK AUTOMÁTICO: Se todos os provedores priorizados falharem,
    # tentar outros provedores configurados que não estavam na lista
    # ═══════════════════════════════════════════════════════════════════════════
    print(f"[AI] ⚠ All priority providers failed, trying automatic fallback...")
    
    # Fallback 1: Lovable AI (sempre disponível no Cloud)
    if 'lovable' not in priority_order and LOVABLE_API_KEY:
        try:
            print(f"[AI] Fallback: Trying Lovable AI...")
            result = call_lovable_ai(messages, model, temperature, max_tokens)
            if result:
                print(f"[AI] ✓ Fallback success with Lovable AI")
                return result
        except Exception as e:
            print(f"[AI] ✗ Fallback Lovable AI failed: {e}")
    
    # Fallback 2: Gemini (se API key configurada)
    if 'gemini' not in priority_order and GOOGLE_API_KEY:
        try:
            print(f"[AI] Fallback: Trying Gemini...")
            result = call_google_gemini(messages, model, temperature, max_tokens)
            if result:
                print(f"[AI] ✓ Fallback success with Gemini")
                return result
        except Exception as e:
            print(f"[AI] ✗ Fallback Gemini failed: {e}")
    
    # Fallback 3: OpenAI (se API key configurada)
    if 'openai' not in priority_order and OPENAI_API_KEY:
        try:
            print(f"[AI] Fallback: Trying OpenAI...")
            result = call_openai(messages, 'gpt-4o-mini', temperature, max_tokens)
            if result:
                print(f"[AI] ✓ Fallback success with OpenAI")
                return result
        except Exception as e:
            print(f"[AI] ✗ Fallback OpenAI failed: {e}")
    
    raise ValueError(f"All AI providers failed (including fallbacks). Last error: {last_error}")


def call_lovable_ai(
    messages: List[Dict[str, str]],
    model: str = 'google/gemini-2.5-flash',
    temperature: float = 0.7,
    max_tokens: int = 4096,
    max_retries: int = 3
) -> Optional[str]:
    """
    Call Lovable AI Gateway.
    Implements retry with exponential backoff for rate limits.
    
    Args:
        messages: List of message dicts with 'role' and 'content'
        model: Model to use (default: gemini-2.5-flash)
        temperature: Sampling temperature
        max_tokens: Maximum tokens in response
        max_retries: Maximum retry attempts for rate limits
    
    Returns:
        The AI response text or None on error
    """
    import time
    
    if not LOVABLE_API_KEY:
        raise ValueError("LOVABLE_API_KEY not configured")
    
    for attempt in range(max_retries):
        try:
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
            
            # Handle rate limit with retry
            if response.status_code == 429:
                delay = 2 ** (attempt + 1)  # 2, 4, 8 seconds
                print(f"[AI] ⚠ Lovable AI rate limit (429), aguardando {delay}s... (tentativa {attempt + 1}/{max_retries})")
                time.sleep(delay)
                continue
            
            if not response.ok:
                print(f"Lovable AI error: {response.status_code} - {response.text}")
                return None
            
            data = response.json()
            content = data.get('choices', [{}])[0].get('message', {}).get('content')
            if content and attempt > 0:
                print(f"[AI] ✓ Lovable AI respondeu após {attempt + 1} tentativas")
            return content
            
        except requests.exceptions.Timeout:
            print(f"[AI] ⚠ Lovable AI timeout após 120s")
            return None
        except Exception as e:
            print(f"[AI] ⚠ Lovable AI error: {e}")
            return None
    
    print(f"[AI] ⚠ Lovable AI falhou após {max_retries} tentativas de rate limit")
    return None


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


def text_to_speech_elevenlabs(text: str, voice_id: str = 'JBFqnCBsd6RMkjVDRZzb') -> Optional[bytes]:
    """
    Convert text to speech using ElevenLabs TTS API.
    
    Args:
        text: Text to convert
        voice_id: ElevenLabs voice ID (default: George - professional narrator)
    
    Returns:
        Audio data as bytes or None on error
    """
    if not ELEVENLABS_API_KEY:
        print("[ElevenLabs TTS] API key not configured")
        return None
    
    # Truncate text if too long (ElevenLabs limit is ~5000 chars)
    text = text[:5000]
    
    try:
        print(f"[ElevenLabs TTS] Gerando áudio com {len(text)} caracteres...")
        
        response = requests.post(
            f'https://api.elevenlabs.io/v1/text-to-speech/{voice_id}',
            headers={
                'xi-api-key': ELEVENLABS_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg'
            },
            json={
                'text': text,
                'model_id': 'eleven_multilingual_v2',
                'voice_settings': {
                    'stability': 0.5,
                    'similarity_boost': 0.75,
                    'style': 0.5,
                    'use_speaker_boost': True
                }
            },
            timeout=180
        )
        
        if not response.ok:
            print(f"[ElevenLabs TTS] Erro {response.status_code}: {response.text[:200]}")
            return None
        
        print(f"[ElevenLabs TTS] ✓ Áudio gerado: {len(response.content)} bytes")
        return response.content
        
    except Exception as e:
        print(f"[ElevenLabs TTS] Erro: {e}")
        return None


# Map friendly voice names to ElevenLabs voice IDs
ELEVENLABS_VOICES = {
    'narrator': 'JBFqnCBsd6RMkjVDRZzb',      # George - professional narrator
    'commentator': 'nPczCjzI2devNBz1zQrb',   # Brian - technical voice
    'dynamic': 'TX3LPaxmHKxFdv7VOQHJ',       # Liam - energetic
    'alloy': 'EXAVITQu4vr4xnSDxMaL',         # Sarah
    'nova': 'pFZP5JQG7iQjIQuC4Bku',          # Lily
    'onyx': 'cjVigY5qzO86Huf0OWal',          # Eric
    'echo': 'IKne3meq5aSn9XLyUdCD',          # Charlie
    'fable': 'Xb7hH8MSUJpSbSDYk0k2',         # Alice
    'shimmer': 'cgSgspJ2msm6clMCkdW9',       # Jessica
}


def text_to_speech_lovable(text: str, voice: str = 'nova') -> Optional[bytes]:
    """
    Convert text to speech using Lovable AI Gateway (proxies OpenAI TTS).
    
    Args:
        text: Text to convert (max 4096 chars)
        voice: Voice to use (alloy, echo, fable, onyx, nova, shimmer)
    
    Returns:
        Audio data as bytes or None on error
    """
    if not LOVABLE_API_KEY:
        return None
    
    try:
        # Truncate text if too long
        truncated = text[:4000]
        
        print(f"[Lovable TTS] Gerando áudio via Lovable AI Gateway... ({len(truncated)} chars)")
        
        response = requests.post(
            'https://ai.gateway.lovable.dev/v1/audio/speech',
            headers={
                'Authorization': f'Bearer {LOVABLE_API_KEY}',
                'Content-Type': 'application/json'
            },
            json={
                'model': 'tts-1',
                'input': truncated,
                'voice': voice if voice in ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] else 'nova',
                'response_format': 'mp3'
            },
            timeout=120
        )
        
        if response.ok:
            print(f"[Lovable TTS] ✓ Áudio gerado: {len(response.content)} bytes")
            return response.content
        else:
            print(f"[Lovable TTS] Erro {response.status_code}: {response.text[:200]}")
            return None
    except Exception as e:
        print(f"[Lovable TTS] Falha: {e}")
        return None


def text_to_speech(text: str, voice: str = 'nova') -> Optional[bytes]:
    """
    Convert text to speech using available TTS provider.
    Priority: Lovable AI → OpenAI → ElevenLabs
    
    Args:
        text: Text to convert
        voice: Voice to use (narrator, commentator, dynamic, or OpenAI voices)
    
    Returns:
        Audio data as bytes or None on error
    """
    # 1. Try Lovable AI Gateway first (uses OpenAI TTS internally)
    if LOVABLE_API_KEY:
        result = text_to_speech_lovable(text, voice)
        if result:
            return result
        print("[TTS] Lovable AI falhou, tentando próximo provedor...")
    
    # 2. Try OpenAI directly
    if OPENAI_API_KEY and OPENAI_ENABLED:
        try:
            # Truncate text if too long
            truncated = text[:4000]
            
            response = requests.post(
                f'{OPENAI_API_URL}/audio/speech',
                headers={
                    'Authorization': f'Bearer {OPENAI_API_KEY}',
                    'Content-Type': 'application/json'
                },
                json={
                    'model': 'tts-1',
                    'input': truncated,
                    'voice': voice if voice in ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] else 'nova',
                    'response_format': 'mp3'
                },
                timeout=120
            )
            
            if response.ok:
                print(f"[OpenAI TTS] ✓ Áudio gerado: {len(response.content)} bytes")
                return response.content
            else:
                print(f"[OpenAI TTS] Erro {response.status_code}, tentando ElevenLabs...")
        except Exception as e:
            print(f"[OpenAI TTS] Falha: {e}, tentando ElevenLabs...")
    
    # 3. Fallback to ElevenLabs
    if ELEVENLABS_API_KEY and ELEVENLABS_ENABLED:
        voice_id = ELEVENLABS_VOICES.get(voice, ELEVENLABS_VOICES.get('narrator'))
        return text_to_speech_elevenlabs(text, voice_id)
    
    print("[TTS] ⚠️ Nenhum provedor de TTS disponível (Lovable/OpenAI/ElevenLabs)")
    print("[TTS] Configure LOVABLE_API_KEY, OPENAI_API_KEY ou ELEVENLABS_API_KEY")
    return None


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


def _get_checkpoint_path(audio_path: str, match_id: str = None) -> str:
    """Get checkpoint file path for resumable transcription."""
    base_name = os.path.basename(audio_path).rsplit('.', 1)[0]
    checkpoint_dir = Path(audio_path).parent / "checkpoints"
    checkpoint_dir.mkdir(exist_ok=True)
    return str(checkpoint_dir / f"{base_name}_checkpoint.json")


def _load_checkpoint(checkpoint_path: str) -> Dict[str, Any]:
    """Load existing checkpoint if available."""
    try:
        if os.path.exists(checkpoint_path):
            with open(checkpoint_path, 'r', encoding='utf-8') as f:
                data = json_module.load(f)
                print(f"[LocalWhisper] ✓ Checkpoint encontrado: {data.get('completed_chunks', 0)} chunks completos")
                return data
    except Exception as e:
        print(f"[LocalWhisper] ⚠ Erro ao carregar checkpoint: {e}")
    return {"completed_chunks": 0, "segments": [], "text_parts": []}


def _save_checkpoint(checkpoint_path: str, data: Dict[str, Any]):
    """Save checkpoint for resumable transcription."""
    try:
        with open(checkpoint_path, 'w', encoding='utf-8') as f:
            json_module.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[LocalWhisper] ⚠ Erro ao salvar checkpoint: {e}")


def _split_audio_into_chunks(audio_path: str, chunk_duration_seconds: int = 45, overlap_seconds: int = 2) -> List[Tuple[str, float, float]]:
    """
    Split audio file into chunks for processing.
    
    Args:
        audio_path: Path to audio file
        chunk_duration_seconds: Duration of each chunk (default 45s for Whisper optimization)
        overlap_seconds: Overlap between chunks to avoid cutting words (default 2s)
    
    Returns:
        List of tuples: (chunk_path, start_time, end_time)
    """
    import subprocess
    
    # Get audio duration
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
             '-of', 'default=noprint_wrappers=1:nokey=1', audio_path],
            capture_output=True, text=True, timeout=30
        )
        total_duration = float(result.stdout.strip())
    except Exception as e:
        print(f"[LocalWhisper] ⚠ Erro ao obter duração: {e}")
        return [(audio_path, 0.0, 0.0)]  # Return original file
    
    if total_duration <= chunk_duration_seconds:
        return [(audio_path, 0.0, total_duration)]  # No need to split
    
    chunks = []
    chunk_dir = Path(audio_path).parent / "chunks"
    chunk_dir.mkdir(exist_ok=True)
    
    start_time = 0.0
    chunk_index = 0
    
    while start_time < total_duration:
        end_time = min(start_time + chunk_duration_seconds, total_duration)
        chunk_path = str(chunk_dir / f"chunk_{chunk_index:04d}.wav")
        
        # Only create chunk if it doesn't exist
        if not os.path.exists(chunk_path):
            try:
                subprocess.run([
                    'ffmpeg', '-y', '-i', audio_path,
                    '-ss', str(start_time), '-t', str(chunk_duration_seconds + overlap_seconds),
                    '-ar', '16000', '-ac', '1',  # 16kHz mono for Whisper
                    '-c:a', 'pcm_s16le',
                    chunk_path
                ], capture_output=True, timeout=60)
            except Exception as e:
                print(f"[LocalWhisper] ⚠ Erro ao criar chunk {chunk_index}: {e}")
                continue
        
        chunks.append((chunk_path, start_time, end_time))
        start_time = end_time - overlap_seconds  # Overlap for continuity
        chunk_index += 1
        
        if chunk_index > 500:  # Safety limit (500 chunks = ~6 hours)
            break
    
    print(f"[LocalWhisper] Áudio dividido em {len(chunks)} chunks de ~{chunk_duration_seconds}s")
    return chunks


def _transcribe_with_local_whisper(
    audio_path: str, 
    match_id: str = None,
    force_restart: bool = False,
    chunk_duration: int = 45
) -> Dict[str, Any]:
    """
    Transcribe audio using local Faster-Whisper (100% FREE, offline).
    
    Enhanced with:
    - GPU (CUDA) acceleration when available
    - Chunked processing for large files
    - Checkpoint system for resumable transcription
    - Auto-retry on failures
    
    Args:
        audio_path: Path to audio file
        match_id: Optional match ID for metadata
        force_restart: If True, ignore existing checkpoints and start fresh
        chunk_duration: Duration of each chunk in seconds (default 45s)
    
    Returns:
        Dict with 'success', 'text', 'srtContent', 'segments'
    """
    global _whisper_model, _whisper_model_name
    
    if not _FASTER_WHISPER_AVAILABLE:
        return {
            "error": "faster-whisper não instalado. Execute: pip install faster-whisper==1.1.0", 
            "success": False
        }
    
    try:
        from faster_whisper import WhisperModel
        import torch
    except ImportError as e:
        return {"error": f"Dependência não instalada: {e}", "success": False}
    
    try:
        model_name = LOCAL_WHISPER_MODEL or 'base'
        audio_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
        
        # Check device availability - prefer CUDA, but fallback to CPU if ROCm error
        # WORKAROUND: ctranslate2 4.4.0 has a bug where it tries to access _rocm_sdk_core
        # on Windows/CUDA systems. If we detected this error during import, force CPU.
        if _CTRANSLATE2_ROCM_ERROR:
            device = "cpu"
            compute_type = "int8"
            print(f"[LocalWhisper] ⚠️ Usando CPU devido a bug do ctranslate2 ROCm")
        else:
            cuda_available = torch.cuda.is_available()
            device = "cuda" if cuda_available else "cpu"
            compute_type = "float16" if device == "cuda" else "int8"
        
        print(f"[LocalWhisper] =====================================")
        print(f"[LocalWhisper] 🎤 Iniciando transcrição robusta")
        print(f"[LocalWhisper] Arquivo: {os.path.basename(audio_path)} ({audio_size_mb:.1f}MB)")
        print(f"[LocalWhisper] Modelo: {model_name}")
        print(f"[LocalWhisper] Device: {device.upper()} {'🚀 GPU Acelerada!' if device == 'cuda' else '(CPU - mais lento)'}")
        print(f"[LocalWhisper] Compute Type: {compute_type}")
        if _CTRANSLATE2_ROCM_ERROR:
            print(f"[LocalWhisper] ⚠️ ROCm workaround ativo - GPU desabilitada temporariamente")
        
        # Load or reuse model (singleton pattern for efficiency)
        # With extra error handling for ctranslate2 issues
        if _whisper_model is None or _whisper_model_name != model_name:
            print(f"[LocalWhisper] Carregando modelo '{model_name}'... (pode levar alguns minutos na primeira vez)")
            
            try:
                _whisper_model = WhisperModel(model_name, device=device, compute_type=compute_type)
            except (OSError, FileNotFoundError, RuntimeError) as load_error:
                error_str = str(load_error).lower()
                # Check for ROCm-related errors and retry with CPU
                if 'rocm' in error_str or '_rocm_sdk_core' in error_str or 'cuda' in error_str:
                    print(f"[LocalWhisper] ⚠️ Erro GPU detectado: {load_error}")
                    print(f"[LocalWhisper] ⚠️ Tentando fallback para CPU...")
                    device = "cpu"
                    compute_type = "int8"
                    _whisper_model = WhisperModel(model_name, device=device, compute_type=compute_type)
                else:
                    raise
            
            _whisper_model_name = model_name
            print(f"[LocalWhisper] ✓ Modelo carregado!")
        
        # Check if file is large enough to need chunking
        needs_chunking = audio_size_mb > 50  # 50MB threshold
        
        if needs_chunking:
            return _transcribe_chunked(audio_path, match_id, force_restart, chunk_duration)
        else:
            return _transcribe_single_file(audio_path, match_id)
        
    except Exception as e:
        import traceback
        print(f"[LocalWhisper] ❌ Erro: {e}")
        traceback.print_exc()
        return {"error": f"Local Whisper error: {str(e)}", "success": False}


def _transcribe_single_file(audio_path: str, match_id: str = None) -> Dict[str, Any]:
    """Transcribe a single file (small files only)."""
    global _whisper_model
    
    print(f"[LocalWhisper] Transcrevendo arquivo único...")
    
    segments_gen, info = _whisper_model.transcribe(
        audio_path, 
        language="pt",
        beam_size=5,
        vad_filter=True,  # Voice Activity Detection for better accuracy
        vad_parameters=dict(min_silence_duration_ms=500)
    )
    
    print(f"[LocalWhisper] Idioma detectado: {info.language} (probabilidade: {info.language_probability:.2%})")
    
    # Build SRT and text output
    srt_lines = []
    full_text = []
    segments_list = []
    
    for i, seg in enumerate(segments_gen, 1):
        start_str = _format_srt_time(seg.start)
        end_str = _format_srt_time(seg.end)
        text = seg.text.strip()
        
        if text:
            srt_lines.append(f"{i}\n{start_str} --> {end_str}\n{text}\n")
            full_text.append(text)
            segments_list.append({
                'start': seg.start,
                'end': seg.end,
                'text': text
            })
    
    srt_content = '\n'.join(srt_lines)
    text_content = ' '.join(full_text)
    
    print(f"[LocalWhisper] ✓ Transcrição completa: {len(text_content)} chars, {len(segments_list)} segmentos")
    
    return {
        "success": True,
        "text": text_content,
        "srtContent": srt_content,
        "segments": segments_list,
        "matchId": match_id,
        "provider": "local_whisper",
        "model": _whisper_model_name,
        "device": "cuda" if hasattr(_whisper_model, 'device') else "cpu"
    }


def _transcribe_chunked(
    audio_path: str, 
    match_id: str = None,
    force_restart: bool = False,
    chunk_duration: int = 45,
    max_retries: int = 3
) -> Dict[str, Any]:
    """
    Transcribe large audio file in chunks with checkpoint support.
    
    Features:
    - Splits audio into manageable chunks
    - Saves progress after each chunk
    - Can resume from last checkpoint if interrupted
    - Auto-retries failed chunks
    
    Args:
        audio_path: Path to audio file
        match_id: Optional match ID for metadata
        force_restart: If True, ignore existing checkpoints
        chunk_duration: Duration of each chunk in seconds
        max_retries: Maximum retries per chunk
    
    Returns:
        Dict with transcription results
    """
    global _whisper_model
    
    checkpoint_path = _get_checkpoint_path(audio_path, match_id)
    
    # Load or initialize checkpoint
    if force_restart and os.path.exists(checkpoint_path):
        os.remove(checkpoint_path)
    
    checkpoint = _load_checkpoint(checkpoint_path)
    completed_chunks = checkpoint.get("completed_chunks", 0)
    all_segments = checkpoint.get("segments", [])
    text_parts = checkpoint.get("text_parts", [])
    
    # Split audio into chunks
    chunks = _split_audio_into_chunks(audio_path, chunk_duration)
    total_chunks = len(chunks)
    
    if completed_chunks >= total_chunks:
        print(f"[LocalWhisper] ✓ Transcrição já completa (checkpoint)")
    else:
        print(f"[LocalWhisper] 📝 Processando {total_chunks} chunks...")
        if completed_chunks > 0:
            print(f"[LocalWhisper] ⏩ Retomando do chunk {completed_chunks + 1}")
    
    # Process remaining chunks
    for i in range(completed_chunks, total_chunks):
        chunk_path, start_time, end_time = chunks[i]
        
        print(f"[LocalWhisper] 📍 Chunk {i + 1}/{total_chunks} ({start_time:.1f}s - {end_time:.1f}s)")
        
        # Retry logic for each chunk
        for retry in range(max_retries):
            try:
                segments_gen, info = _whisper_model.transcribe(
                    chunk_path,
                    language="pt",
                    beam_size=5,
                    vad_filter=True,
                    vad_parameters=dict(min_silence_duration_ms=500)
                )
                
                chunk_text = []
                for seg in segments_gen:
                    text = seg.text.strip()
                    if text:
                        # Adjust timestamps to global time
                        adjusted_start = start_time + seg.start
                        adjusted_end = start_time + seg.end
                        
                        all_segments.append({
                            'start': adjusted_start,
                            'end': adjusted_end,
                            'text': text
                        })
                        chunk_text.append(text)
                
                text_parts.append(' '.join(chunk_text))
                
                # Save checkpoint after each successful chunk
                completed_chunks = i + 1
                checkpoint = {
                    "completed_chunks": completed_chunks,
                    "total_chunks": total_chunks,
                    "segments": all_segments,
                    "text_parts": text_parts,
                    "last_updated": datetime.now().isoformat()
                }
                _save_checkpoint(checkpoint_path, checkpoint)
                
                print(f"[LocalWhisper] ✓ Chunk {i + 1}/{total_chunks} ({len(chunk_text)} frases)")
                break  # Success, exit retry loop
                
            except Exception as e:
                print(f"[LocalWhisper] ⚠ Erro no chunk {i + 1} (tentativa {retry + 1}/{max_retries}): {e}")
                if retry == max_retries - 1:
                    print(f"[LocalWhisper] ❌ Chunk {i + 1} falhou após {max_retries} tentativas. Continuando...")
                    # Continue to next chunk instead of failing completely
                    text_parts.append(f"[ERRO: chunk {i + 1} não transcrito]")
    
    # Build final SRT
    srt_lines = []
    for idx, seg in enumerate(all_segments, 1):
        start_str = _format_srt_time(seg['start'])
        end_str = _format_srt_time(seg['end'])
        srt_lines.append(f"{idx}\n{start_str} --> {end_str}\n{seg['text']}\n")
    
    srt_content = '\n'.join(srt_lines)
    full_text = ' '.join(text_parts)
    
    # Cleanup checkpoint on success
    if os.path.exists(checkpoint_path):
        os.remove(checkpoint_path)
        print(f"[LocalWhisper] 🧹 Checkpoint removido")
    
    # Cleanup chunk files
    chunk_dir = Path(audio_path).parent / "chunks"
    if chunk_dir.exists():
        import shutil
        try:
            shutil.rmtree(chunk_dir)
            print(f"[LocalWhisper] 🧹 Chunks temporários removidos")
        except Exception as e:
            print(f"[LocalWhisper] ⚠ Erro ao limpar chunks: {e}")
    
    print(f"[LocalWhisper] =====================================")
    print(f"[LocalWhisper] ✅ TRANSCRIÇÃO COMPLETA!")
    print(f"[LocalWhisper] Total: {len(full_text)} caracteres, {len(all_segments)} segmentos")
    print(f"[LocalWhisper] =====================================")
    
    return {
        "success": True,
        "text": full_text,
        "srtContent": srt_content,
        "segments": all_segments,
        "matchId": match_id,
        "provider": "local_whisper",
        "model": _whisper_model_name,
        "device": "cuda" if hasattr(_whisper_model, 'device') else "cpu",
        "chunked": True,
        "total_chunks": total_chunks
    }


def transcribe_upload_segments(
    upload_id: str,
    manifest_path: str,
    max_retries: int = 3,
    progress_callback: callable = None
) -> Dict[str, Any]:
    """
    Transcribe audio segments created by audio_processor.
    
    ROBUST FEATURES:
    - Loads checkpoint per segment (resumable)
    - Continues on error (logs and skips)
    - Saves progress after each segment
    - Uses local Whisper GPU for speed
    
    Args:
        upload_id: Upload ID (for checkpoints)
        manifest_path: Path to manifest.json with segment info
        max_retries: Maximum retries per segment
        progress_callback: Function called with (current, total, segment_text)
    
    Returns:
        Dict with 'success', 'text', 'srtContent', 'segments', 'errors'
    """
    global _whisper_model, _whisper_model_name
    
    print(f"[UploadTranscribe] =====================================")
    print(f"[UploadTranscribe] 🎤 Iniciando transcrição de segmentos")
    print(f"[UploadTranscribe] Upload ID: {upload_id}")
    print(f"[UploadTranscribe] Manifest: {manifest_path}")
    
    # Load manifest
    try:
        with open(manifest_path, 'r') as f:
            manifest = json.load(f)
    except Exception as e:
        print(f"[UploadTranscribe] ❌ Erro ao carregar manifest: {e}")
        return {"success": False, "error": f"Erro ao carregar manifest: {e}", "errors": [str(e)]}
    
    segments = manifest.get('segments', [])
    total = len(segments)
    
    if total == 0:
        return {"success": False, "error": "Nenhum segmento encontrado no manifest", "errors": ["No segments"]}
    
    print(f"[UploadTranscribe] Total de segmentos: {total}")
    
    # Check if Whisper is available
    if not _FASTER_WHISPER_AVAILABLE:
        return {
            "success": False,
            "error": "faster-whisper não instalado. Execute: pip install faster-whisper==1.1.0",
            "errors": ["faster-whisper not available"]
        }
    
    # Load Whisper model (singleton)
    try:
        from faster_whisper import WhisperModel
        import torch
        
        model_name = LOCAL_WHISPER_MODEL or 'base'
        
        # Check device availability
        if _CTRANSLATE2_ROCM_ERROR:
            device = "cpu"
            compute_type = "int8"
            print(f"[UploadTranscribe] ⚠️ Usando CPU (ROCm workaround)")
        else:
            cuda_available = torch.cuda.is_available()
            device = "cuda" if cuda_available else "cpu"
            compute_type = "float16" if device == "cuda" else "int8"
        
        print(f"[UploadTranscribe] Device: {device.upper()}")
        
        if _whisper_model is None or _whisper_model_name != model_name:
            print(f"[UploadTranscribe] Carregando modelo '{model_name}'...")
            try:
                _whisper_model = WhisperModel(model_name, device=device, compute_type=compute_type)
            except (OSError, FileNotFoundError, RuntimeError) as load_error:
                if 'rocm' in str(load_error).lower() or 'cuda' in str(load_error).lower():
                    print(f"[UploadTranscribe] ⚠️ Fallback para CPU...")
                    _whisper_model = WhisperModel(model_name, device="cpu", compute_type="int8")
                else:
                    raise
            _whisper_model_name = model_name
            print(f"[UploadTranscribe] ✓ Modelo carregado!")
            
    except ImportError as e:
        return {"success": False, "error": f"Dependência não instalada: {e}", "errors": [str(e)]}
    except Exception as e:
        return {"success": False, "error": f"Erro ao carregar modelo: {e}", "errors": [str(e)]}
    
    # Import checkpoint functions from audio_processor
    from audio_processor import load_segment_checkpoint, save_segment_checkpoint
    
    all_transcripts = []
    errors = []
    
    for i, seg in enumerate(segments):
        segment_path = seg.get('path')
        start_ms = seg.get('startMs', 0)
        end_ms = seg.get('endMs', 0)
        
        # 1. Check existing checkpoint
        checkpoint = load_segment_checkpoint(upload_id, i)
        if checkpoint:
            print(f"[UploadTranscribe] ⏩ Segmento {i+1}/{total} já transcrito (checkpoint)")
            all_transcripts.append({
                'text': checkpoint.get('text', ''),
                'startMs': checkpoint.get('startMs', start_ms),
                'endMs': checkpoint.get('endMs', end_ms)
            })
            if progress_callback:
                progress_callback(i + 1, total, checkpoint.get('text', '')[:50])
            continue
        
        # 2. Verify segment file exists
        if not segment_path or not os.path.exists(segment_path):
            print(f"[UploadTranscribe] ❌ Segmento {i+1} não encontrado: {segment_path}")
            errors.append(f"Segmento {i+1} não encontrado")
            continue
        
        # 3. Transcribe with retries
        segment_text = ""
        transcribed = False
        
        for retry in range(max_retries):
            try:
                segments_gen, info = _whisper_model.transcribe(
                    segment_path,
                    language="pt",
                    beam_size=5,
                    vad_filter=True,
                    vad_parameters=dict(min_silence_duration_ms=500)
                )
                
                # Collect text from generator
                texts = []
                for seg_result in segments_gen:
                    text = seg_result.text.strip()
                    if text:
                        texts.append(text)
                
                segment_text = ' '.join(texts)
                
                # 4. Save checkpoint immediately
                save_segment_checkpoint(
                    upload_id, i,
                    text=segment_text,
                    start_ms=start_ms,
                    end_ms=end_ms
                )
                
                all_transcripts.append({
                    'text': segment_text,
                    'startMs': start_ms,
                    'endMs': end_ms
                })
                
                print(f"[UploadTranscribe] ✓ Segmento {i+1}/{total} ({len(segment_text)} chars)")
                transcribed = True
                break
                
            except Exception as e:
                if retry == max_retries - 1:
                    errors.append(f"Segmento {i+1}: {str(e)}")
                    print(f"[UploadTranscribe] ❌ Segmento {i+1} falhou após {max_retries} tentativas: {e}")
                else:
                    print(f"[UploadTranscribe] ⚠ Retry {retry+1}/{max_retries} para segmento {i+1}: {e}")
        
        # 5. Update progress
        if progress_callback:
            progress_callback(i + 1, total, segment_text[:50] if segment_text else '')
    
    # 6. Generate final SRT
    srt_lines = []
    for idx, seg in enumerate(all_transcripts, 1):
        text = seg.get('text', '').strip()
        if not text:
            continue
        
        start_ms = seg.get('startMs', 0)
        end_ms = seg.get('endMs', 0)
        
        start_str = _format_srt_time(start_ms / 1000.0)
        end_str = _format_srt_time(end_ms / 1000.0)
        
        srt_lines.append(f"{idx}\n{start_str} --> {end_str}\n{text}\n")
    
    srt_content = '\n'.join(srt_lines)
    full_text = ' '.join(seg.get('text', '') for seg in all_transcripts)
    
    print(f"[UploadTranscribe] =====================================")
    print(f"[UploadTranscribe] ✅ TRANSCRIÇÃO COMPLETA!")
    print(f"[UploadTranscribe] Total: {len(full_text)} caracteres, {len(all_transcripts)} segmentos")
    if errors:
        print(f"[UploadTranscribe] ⚠ Erros: {len(errors)} segmentos falharam")
    print(f"[UploadTranscribe] =====================================")
    
    return {
        "success": True,
        "text": full_text,
        "srtContent": srt_content,
        "segments": all_transcripts,
        "errors": errors,
        "provider": "local_whisper",
        "model": _whisper_model_name or "base",
        "total_segments": total,
        "transcribed_segments": len(all_transcripts)
    }


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


def transcribe_audio_file(audio_path: str, match_id: str = None, language: str = 'pt') -> Dict[str, Any]:
    """
    Transcribe a single audio file using the best available provider.
    
    Priority:
    1. Local Whisper (FREE, offline)
    2. OpenAI Whisper API (paid)
    3. ElevenLabs (paid)
    
    This is the main entry point for chunk-based transcription.
    
    Args:
        audio_path: Path to audio file (WAV, MP3, etc.)
        match_id: Optional match ID for metadata
        language: Language code (default: 'pt' for Portuguese)
    
    Returns:
        Dict with:
        - success: bool
        - text: transcribed text
        - srtContent: SRT formatted content
        - segments: list of segments with timestamps
        - provider: which provider was used
        - error: error message if failed
    """
    if not os.path.exists(audio_path):
        return {
            "success": False,
            "error": f"Audio file not found: {audio_path}"
        }
    
    audio_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
    print(f"[TranscribeFile] Transcrevendo {audio_path} ({audio_size_mb:.2f}MB)...")
    
    # Priority 1: Local Whisper (FREE)
    if LOCAL_WHISPER_ENABLED:
        print(f"[TranscribeFile] Tentando Local Whisper...")
        result = _transcribe_with_local_whisper(audio_path, match_id)
        if result.get('success'):
            result['provider'] = 'local_whisper'
            print(f"[TranscribeFile] ✓ Local Whisper: {len(result.get('text', ''))} chars")
            return result
        else:
            print(f"[TranscribeFile] Local Whisper falhou: {result.get('error')}")
    
    # Priority 2: OpenAI Whisper API
    if OPENAI_API_KEY and OPENAI_ENABLED:
        print(f"[TranscribeFile] Tentando OpenAI Whisper API...")
        try:
            with open(audio_path, 'rb') as audio_file:
                response = requests.post(
                    f'{OPENAI_API_URL}/audio/transcriptions',
                    headers={'Authorization': f'Bearer {OPENAI_API_KEY}'},
                    files={'file': audio_file},
                    data={
                        'model': 'whisper-1',
                        'language': language,
                        'response_format': 'verbose_json'
                    },
                    timeout=300
                )
            
            if response.ok:
                data = response.json()
                text = data.get('text', '')
                segments = data.get('segments', [])
                
                # Generate SRT from segments
                srt_lines = []
                for i, seg in enumerate(segments, 1):
                    start_str = _format_srt_time(seg.get('start', 0))
                    end_str = _format_srt_time(seg.get('end', 0))
                    srt_lines.append(f"{i}\n{start_str} --> {end_str}\n{seg.get('text', '').strip()}\n")
                
                print(f"[TranscribeFile] ✓ OpenAI Whisper: {len(text)} chars")
                return {
                    "success": True,
                    "text": text,
                    "srtContent": '\n'.join(srt_lines),
                    "segments": segments,
                    "provider": "openai_whisper",
                    "matchId": match_id
                }
            else:
                print(f"[TranscribeFile] OpenAI falhou: {response.status_code}")
        except Exception as e:
            print(f"[TranscribeFile] OpenAI erro: {e}")
    
    # Priority 3: ElevenLabs
    if ELEVENLABS_API_KEY and ELEVENLABS_ENABLED:
        print(f"[TranscribeFile] Tentando ElevenLabs...")
        result = _transcribe_with_elevenlabs(audio_path, match_id)
        if result.get('success'):
            result['provider'] = 'elevenlabs'
            print(f"[TranscribeFile] ✓ ElevenLabs: {len(result.get('text', ''))} chars")
            return result
        else:
            print(f"[TranscribeFile] ElevenLabs falhou: {result.get('error')}")
    
    return {
        "success": False,
        "error": "Nenhum provedor de transcrição disponível. Configure LOCAL_WHISPER, OPENAI_API_KEY ou ELEVENLABS_API_KEY."
    }


def call_openai_gpt5(
    messages: List[Dict[str, str]],
    model: str = 'gpt-5',
    max_tokens: int = 8192,
    max_retries: int = 3
) -> Optional[str]:
    """
    Call OpenAI GPT-5 directly for event detection.
    Uses max_completion_tokens (GPT-5 requirement).
    Implements retry with exponential backoff for rate limits.
    
    Args:
        messages: List of message dicts with 'role' and 'content'
        model: GPT-5 model variant (default: gpt-5)
        max_tokens: Maximum tokens in response
        max_retries: Maximum retry attempts for rate limits
    
    Returns:
        The AI response text or None on error
    """
    import time
    
    if not OPENAI_API_KEY:
        print("[AI] ⚠ OpenAI API key not configured for GPT-5")
        return None
    
    headers = {
        'Authorization': f'Bearer {OPENAI_API_KEY}',
        'Content-Type': 'application/json'
    }
    
    # GPT-4o and older models use max_tokens, GPT-5 and O-series use max_completion_tokens
    if model.startswith('gpt-5') or model.startswith('o3') or model.startswith('o4'):
        payload = {
            'model': model,
            'messages': messages,
            'max_completion_tokens': max_tokens,
        }
    else:
        payload = {
            'model': model,
            'messages': messages,
            'max_tokens': max_tokens,
            'temperature': 0.7,
        }
    
    for attempt in range(max_retries):
        try:
            print(f"[AI] 🧠 Chamando OpenAI {model}..." + (f" (tentativa {attempt + 1}/{max_retries})" if attempt > 0 else ""))
            response = requests.post(
                f'{OPENAI_API_URL}/chat/completions',
                headers=headers,
                json=payload,
                timeout=180
            )
            
            # Handle rate limit with retry
            if response.status_code == 429:
                delay = 2 ** (attempt + 1)  # 2, 4, 8 seconds
                print(f"[AI] ⚠ Rate limit (429), aguardando {delay}s... (tentativa {attempt + 1}/{max_retries})")
                time.sleep(delay)
                continue
            
            if not response.ok:
                print(f"[AI] OpenAI GPT-5 error: {response.status_code} - {response.text[:500]}")
                return None
            
            data = response.json()
            content = data.get('choices', [{}])[0].get('message', {}).get('content')
            
            if content:
                print(f"[AI] ✓ GPT-5 retornou {len(content)} caracteres" + (f" após {attempt + 1} tentativas" if attempt > 0 else ""))
            return content
            
        except requests.exceptions.Timeout:
            print(f"[AI] ⚠ GPT-5 timeout após 180s")
            return None
        except Exception as e:
            print(f"[AI] ⚠ GPT-5 error: {e}")
            return None
    
    print(f"[AI] ⚠ GPT-5 falhou após {max_retries} tentativas de rate limit")
    return None


def detect_events_with_gpt(
    match_id: str,
    transcription: str,
    home_team: str,
    away_team: str,
    half: str = 'first',
    game_start_minute: int = 0,
    game_end_minute: int = 45
) -> Dict[str, Any]:
    """
    GPT-5 analyzes transcription and generates detected_events.json
    
    Phase 1 of the dual verification system:
    1. GPT-5 reads the full transcription text
    2. Extracts all match events with confidence scores
    3. Saves raw results to json/detected_events.json
    
    Args:
        match_id: The match ID
        transcription: Full transcription text
        home_team: Home team name
        away_team: Away team name
        half: 'first' or 'second'
        game_start_minute: Start minute (0 for first half, 45 for second)
        game_end_minute: End minute (45 for first half, 90 for second)
    
    Returns:
        Dict with detected events and metadata
    """
    import hashlib
    from datetime import datetime
    from storage import get_subfolder_path
    
    half_desc = "1º Tempo (0-45 min)" if half == 'first' else "2º Tempo (45-90 min)"
    
    system_prompt = f"""Você é um analista de futebol ESPECIALISTA em extrair eventos de narrações esportivas.

⚽⚽⚽ REGRA NÚMERO 1 - NUNCA PERCA UM GOL! ⚽⚽⚽

PALAVRAS-CHAVE PARA GOLS (NUNCA IGNORE):
- "GOOOL", "GOOOOL", "GOL", "GOLAÇO" → É GOL!
- "PRA DENTRO", "ENTROU", "MANDOU PRA REDE" → É GOL!
- "BOLA NO FUNDO DA REDE", "ESTUFOU A REDE" → É GOL!
- "ABRE O PLACAR", "AMPLIA", "EMPATA", "VIRA O JOGO" → É GOL!

GOLS CONTRA:
- "Gol contra do {{TIME}}" → team = TIME QUE ERROU, isOwnGoal = true

TIMES DA PARTIDA:
- HOME (casa): {home_team}
- AWAY (visitante): {away_team}
- Período: {half_desc}

╔══════════════════════════════════════════════════════════════════════════════╗
║  🚨🚨🚨 REGRA CRÍTICA SOBRE TIMESTAMPS - LEIA COM ATENÇÃO! 🚨🚨🚨           ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  O formato da transcrição é SRT com timestamps assim:                        ║
║                                                                              ║
║  368                                                                         ║
║  00:24:52,253 --> 00:24:56,308                                               ║
║  o gol! Gol! É do Brasil!                                                    ║
║                                                                              ║
║  ⚠️ USE O TIMESTAMP DO BLOCO [00:24:52], NÃO o minuto mencionado na fala!    ║
║                                                                              ║
║  CORRETO: minute=24, second=52 (do timestamp 00:24:52)                       ║
║  ERRADO:  minute=38 (se o narrador disser "gol aos 38 minutos")              ║
║                                                                              ║
║  O timestamp indica o MOMENTO NO VÍDEO onde o evento acontece.               ║
╚══════════════════════════════════════════════════════════════════════════════╝

Para CADA evento detectado, extraia:
- event_type: goal, shot, save, foul, corner, chance, penalty, etc. (NÃO detecte yellow_card ou red_card)
- minute: MINUTO do timestamp SRT [HH:MM:SS] - extraia o valor de MM
- second: SEGUNDO do timestamp SRT [HH:MM:SS] - extraia o valor de SS
- team: "home" ou "away"
- description: descrição curta (max 60 chars)
- is_highlight: true para eventos importantes
- isOwnGoal: true apenas para gols contra
- confidence: 0.0-1.0 (quão certo você está)
- source_text: trecho EXATO da narração que menciona o evento

FORMATO: Retorne APENAS um array JSON válido, sem explicações."""

    user_prompt = f"""⚽ MISSÃO: ENCONTRAR TODOS OS EVENTOS DA PARTIDA ⚽

PARTIDA: {home_team} vs {away_team}
PERÍODO: {half_desc} (minutos {game_start_minute}' a {game_end_minute}')

TRANSCRIÇÃO COMPLETA (formato SRT com timestamps):
═══════════════════════════════════════════════════════════════
{transcription}
═══════════════════════════════════════════════════════════════

CHECKLIST OBRIGATÓRIO:
□ Para CADA evento, extraia minute e second do TIMESTAMP do bloco SRT (ex: 00:24:52 → minute=24, second=52)
□ NÃO use o "minuto de jogo" que o narrador menciona - use o timestamp real!
□ Quantas vezes aparece "GOL" na transcrição? → Mesmo número de eventos de gol!
□ Retornar pelo menos 15-30 eventos para um tempo completo
□ source_text = trecho exato da narração

Retorne o array JSON com TODOS os eventos detectados:"""

    print(f"[AI] 🧠 FASE 1: GPT-4o detectando eventos do {half_desc}...")
    
    # Try GPT-4o first (stable, cost-effective, good for structured extraction)
    response = call_openai_gpt5([
        {'role': 'system', 'content': system_prompt},
        {'role': 'user', 'content': user_prompt}
    ], model='gpt-4o', max_tokens=8192)
    
    generator_model = 'openai/gpt-4o'
    
    # Fallback to Gemini if GPT-5 fails
    if not response:
        print(f"[AI] ⚠ GPT-5 falhou, usando Gemini como fallback...")
        response = call_ai([
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_prompt}
        ], model='google/gemini-2.5-flash', max_tokens=8192)
        generator_model = 'google/gemini-2.5-flash'
    
    if not response:
        print(f"[AI] ❌ Nenhuma IA conseguiu processar a transcrição")
        return {"match_id": match_id, "events": [], "error": "AI processing failed"}
    
    # Parse JSON from response
    events = []
    try:
        start = response.find('[')
        end = response.rfind(']') + 1
        if start >= 0 and end > start:
            events = json.loads(response[start:end])
            print(f"[AI] ✓ Parsed {len(events)} eventos do {generator_model}")
            
            # Log detalhado de gols detectados
            goals_detected = [e for e in events if e.get('event_type') == 'goal']
            if goals_detected:
                print(f"[AI] ⚽ GPT-4o DETECTOU {len(goals_detected)} GOL(S):")
                for g in goals_detected:
                    video_second = (g.get('minute', 0) or 0) * 60 + (g.get('second', 0) or 0)
                    print(f"[AI]   → min {g.get('minute')}:{g.get('second', 0):02d} = {video_second}s - {(g.get('description') or '')[:50]}")
                    print(f"[AI]     source: {(g.get('source_text') or '')[:80]}")
            else:
                print(f"[AI] ⚠️ ALERTA: Nenhum gol detectado pelo GPT-4o!")
                
    except json.JSONDecodeError as e:
        print(f"[AI] ⚠ JSON parse error: {e}")
    
    # Build result with metadata
    result = {
        "match_id": match_id,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "generator": generator_model,
        "transcription_hash": hashlib.md5(transcription.encode()).hexdigest()[:16],
        "half": half,
        "game_minutes": f"{game_start_minute}-{game_end_minute}",
        "home_team": home_team,
        "away_team": away_team,
        "total_events": len(events),
        "events": events
    }
    
    # Count events by type
    event_counts = {}
    for e in events:
        etype = e.get('event_type', 'unknown')
        event_counts[etype] = event_counts.get(etype, 0) + 1
    result["event_counts"] = event_counts
    
    # Save to json/detected_events.json
    try:
        json_path = get_subfolder_path(match_id, 'json')
        filename = f"detected_events_{half}.json"
        filepath = json_path / filename
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        
        print(f"[AI] ✓ {len(events)} eventos salvos em json/{filename}")
        result["saved_to"] = str(filepath)
    except Exception as e:
        print(f"[AI] ⚠ Erro ao salvar JSON: {e}")
    
    return result


def validate_events_with_gemini(
    match_id: str,
    transcription: str,
    detected_result: Dict[str, Any],
    home_team: str,
    away_team: str
) -> Dict[str, Any]:
    """
    Gemini validates each event detected by GPT-5 against the original transcription.
    
    Phase 2 of the dual verification system:
    1. Gemini receives detected events + original transcription
    2. Validates each event looking for textual evidence
    3. Saves approved events to validated_events.json
    4. Saves rejected events to rejected_events.json for audit
    
    Args:
        match_id: The match ID
        transcription: Original transcription text
        detected_result: Result from detect_events_with_gpt()
        home_team: Home team name
        away_team: Away team name
    
    Returns:
        Dict with validated events and summary
    """
    from datetime import datetime
    from storage import get_subfolder_path
    
    events_to_validate = detected_result.get('events', [])
    half = detected_result.get('half', 'first')
    
    if not events_to_validate:
        print(f"[AI] ⚠ Nenhum evento para validar")
        return {"match_id": match_id, "events": [], "summary": {"confirmed": 0, "rejected": 0}}
    
    # Prepare events for validation (simplified format)
    events_for_prompt = []
    for i, event in enumerate(events_to_validate):
        events_for_prompt.append({
            "id": i,
            "type": event.get('event_type'),
            "minute": event.get('minute'),
            "second": event.get('second', 0),
            "team": event.get('team'),
            "description": (event.get('description') or '')[:80],
            "source_text": (event.get('source_text') or '')[:100]
        })
    
    validation_prompt = f"""Você é um árbitro de vídeo (VAR) revisando eventos detectados por outro sistema.

TIMES DA PARTIDA:
- HOME (casa): {home_team}
- AWAY (visitante): {away_team}

TRANSCRIÇÃO ORIGINAL:
═══════════════════════════════════════════════════════════════
{transcription[:15000]}
═══════════════════════════════════════════════════════════════

EVENTOS DETECTADOS PELO SISTEMA PRIMÁRIO:
{json.dumps(events_for_prompt, ensure_ascii=False, indent=2)}

SUA TAREFA:
Para CADA evento, verifique se existe EVIDÊNCIA na transcrição:

╔══════════════════════════════════════════════════════════════════════════════╗
║  🔴 REGRA ESPECIAL PARA GOLS - SEMPRE CONFIRME NA DÚVIDA! 🔴                ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  GOLS são PRIORITÁRIOS. Se houver QUALQUER menção a:                         ║
║  - "GOL", "GOOOOL", "GOLAÇO", "ENTROU", "PRA DENTRO", "BOLA NA REDE"         ║
║  → CONFIRME O GOL IMEDIATAMENTE!                                             ║
║                                                                              ║
║  Só rejeite um gol se houver PROVA CLARA de que foi anulado/impedido.       ║
╚══════════════════════════════════════════════════════════════════════════════╝

Para OUTROS eventos, verifique evidência textual:
- CARTÕES: "AMARELO", "VERMELHO", "CARTÃO"
- FALTAS: "FALTA", "FALTOSO"
- CHANCES: "QUASE", "PASSOU PERTO", "DEFESA"

RETORNE um JSON array:
[
  {{"id": 0, "confirmed": true, "reason": "GOL encontrado: 'GOOOOL do Brasil'"}},
  {{"id": 1, "confirmed": false, "reason": "Sem evidência textual para este evento"}}
]

Para GOLS: Na dúvida, CONFIRME.
Para outros eventos: Na dúvida, REJEITE.
Retorne APENAS o array JSON, sem explicações."""

    print(f"[AI] 🔍 FASE 2: Gemini validando {len(events_to_validate)} eventos...")
    
    response = call_ai([
        {'role': 'system', 'content': 'Você é um sistema de revisão rigoroso. Confirme apenas eventos com evidência clara no texto.'},
        {'role': 'user', 'content': validation_prompt}
    ], model='google/gemini-2.5-flash', max_tokens=4096)
    
    if not response:
        print(f"[AI] ⚠ Validação falhou, mantendo todos os eventos")
        return {
            "match_id": match_id, 
            "events": events_to_validate,
            "summary": {"confirmed": len(events_to_validate), "rejected": 0, "validation_failed": True}
        }
    
    # Parse validation response
    validations = []
    try:
        start = response.find('[')
        end = response.rfind(']') + 1
        if start >= 0 and end > start:
            validations = json.loads(response[start:end])
            print(f"[AI] ✓ Recebidas {len(validations)} validações do Gemini")
    except json.JSONDecodeError as e:
        print(f"[AI] ⚠ Erro ao parsear validações: {e}")
        # Return all events if parsing fails
        return {
            "match_id": match_id,
            "events": events_to_validate,
            "summary": {"confirmed": len(events_to_validate), "rejected": 0, "parse_failed": True}
        }
    
    # Build set of confirmed IDs
    confirmed_ids = set()
    validation_reasons = {}
    for v in validations:
        vid = v.get('id')
        if vid is not None:
            if v.get('confirmed', False):
                confirmed_ids.add(vid)
            validation_reasons[vid] = v.get('reason', '')
    
    # Separate confirmed and rejected events
    confirmed_events = []
    rejected_events = []
    
    for i, event in enumerate(events_to_validate):
        event_copy = event.copy()
        event_copy['validation_reason'] = validation_reasons.get(i, '')
        
        is_goal = event.get('event_type') == 'goal'
        high_confidence = (event.get('confidence') or 0) >= 0.7
        
        # REGRA: Gols com confiança >= 0.7 são SEMPRE confirmados (bypass do Gemini)
        if i in confirmed_ids or (is_goal and high_confidence):
            event_copy['validated'] = True
            if is_goal and high_confidence and i not in confirmed_ids:
                event_copy['validation_reason'] = 'AUTO-APROVADO: Gol com alta confiança (bypass VAR)'
                print(f"[AI] ⚽ GOL AUTO-APROVADO: min {event.get('minute')}:{event.get('second', 0):02d} (confiança: {event.get('confidence', 0):.2f})")
            confirmed_events.append(event_copy)
        else:
            event_copy['validated'] = False
            rejected_events.append(event_copy)
            print(f"[AI] ❌ Rejeitado: {event.get('event_type')} min {event.get('minute')}' - {validation_reasons.get(i, 'sem razão')[:60]}")
    
    # Log confirmed goals
    for event in confirmed_events:
        if event.get('event_type') == 'goal':
            is_own = event.get('isOwnGoal', False)
            team = event.get('team', 'unknown')
            minute = event.get('minute', 0)
            print(f"[AI] ⚽ GOL confirmado: min {minute}' - Time: {team} - OwnGoal: {is_own}")
    
    print(f"[AI] ✓ Validação: {len(confirmed_events)} confirmados, {len(rejected_events)} rejeitados")
    
    # Build result
    result = {
        "match_id": match_id,
        "validated_at": datetime.utcnow().isoformat() + "Z",
        "validator": "google/gemini-2.5-flash",
        "half": half,
        "home_team": home_team,
        "away_team": away_team,
        "events": confirmed_events,
        "summary": {
            "total_detected": len(events_to_validate),
            "confirmed": len(confirmed_events),
            "rejected": len(rejected_events)
        }
    }
    
    # Count confirmed events by type
    confirmed_counts = {}
    for e in confirmed_events:
        etype = e.get('event_type', 'unknown')
        confirmed_counts[etype] = confirmed_counts.get(etype, 0) + 1
    result["confirmed_counts"] = confirmed_counts
    
    # Save validated and rejected to JSON files
    try:
        json_path = get_subfolder_path(match_id, 'json')
        
        # Save validated events
        validated_filename = f"validated_events_{half}.json"
        with open(json_path / validated_filename, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"[AI] ✓ Eventos validados salvos em json/{validated_filename}")
        
        # Save rejected events for audit
        rejected_result = {
            "match_id": match_id,
            "rejected_at": datetime.utcnow().isoformat() + "Z",
            "half": half,
            "events": rejected_events
        }
        rejected_filename = f"rejected_events_{half}.json"
        with open(json_path / rejected_filename, 'w', encoding='utf-8') as f:
            json.dump(rejected_result, f, ensure_ascii=False, indent=2)
        print(f"[AI] ✓ Eventos rejeitados salvos em json/{rejected_filename}")
        
    except Exception as e:
        print(f"[AI] ⚠ Erro ao salvar JSONs de validação: {e}")
    
    return result


def deduplicate_goal_events(events: List[Dict[str, Any]], min_interval_seconds: int = 30) -> List[Dict[str, Any]]:
    """
    Remove eventos de gol duplicados que ocorram em intervalo menor que min_interval_seconds.
    
    A IA pode detectar o mesmo gol múltiplas vezes quando o narrador repete expressões
    como "GOOOL! É GOL!" em sequência ou menciona o mesmo gol em diferentes partes.
    
    Args:
        events: Lista de eventos detectados pela IA
        min_interval_seconds: Intervalo mínimo entre gols do mesmo time (default: 30s)
    
    Returns:
        Lista de eventos com gols duplicados removidos
    """
    if not events:
        return events
    
    # Separar gols dos outros eventos
    goals = [e for e in events if e.get('event_type') == 'goal']
    other_events = [e for e in events if e.get('event_type') != 'goal']
    
    if len(goals) <= 1:
        return events  # Nada a deduplicar
    
    # Ordenar gols por tempo (minuto + segundo)
    def get_total_seconds(g):
        minute = g.get('minute', 0) or 0
        second = g.get('second', 0) or 0
        return minute * 60 + second
    
    goals_sorted = sorted(goals, key=get_total_seconds)
    
    # Filtrar gols duplicados (mesmo time, intervalo < min_interval_seconds)
    deduplicated_goals = []
    last_goal_by_team = {}  # {team: last_goal_second}
    
    for goal in goals_sorted:
        team = goal.get('team', 'home')
        current_seconds = get_total_seconds(goal)
        
        # Verificar se já houve um gol recente do mesmo time
        if team in last_goal_by_team:
            last_seconds = last_goal_by_team[team]
            interval = current_seconds - last_seconds
            
            if interval < min_interval_seconds:
                # Gol duplicado detectado - pular
                print(f"[AI] ⚠️ DEDUP: Removendo gol duplicado do time '{team}' - "
                      f"intervalo de apenas {interval}s (min: {min_interval_seconds}s)")
                print(f"[AI]   → Gol removido: {goal.get('minute', 0)}'{goal.get('second', 0)}'' - {goal.get('description', '')[:50]}")
                continue
        
        # Gol válido - manter
        deduplicated_goals.append(goal)
        last_goal_by_team[team] = current_seconds
    
    if len(deduplicated_goals) < len(goals):
        removed = len(goals) - len(deduplicated_goals)
        print(f"[AI] ✓ DEDUP: Removidos {removed} gol(s) duplicado(s). "
              f"Original: {len(goals)} → Final: {len(deduplicated_goals)}")
    
    # Recombinar gols dedupados com outros eventos e ordenar por tempo
    all_events = deduplicated_goals + other_events
    all_events_sorted = sorted(all_events, key=get_total_seconds)
    
    return all_events_sorted


def _parse_ollama_events_fallback(text: str) -> List[Dict[str, Any]]:
    """
    Fallback: Tenta extrair eventos JSON objeto por objeto quando o array completo falha.
    """
    import re
    events = []
    
    # Encontrar todos os objetos JSON individuais {...}
    # Regex mais robusto para objetos aninhados
    pattern = r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}'
    matches = re.findall(pattern, text, re.DOTALL)
    
    print(f"[Ollama Fallback] Encontrados {len(matches)} possíveis objetos JSON")
    
    for i, match in enumerate(matches):
        try:
            # Corrigir aspas simples
            clean = match.replace("'", '"')
            # Remover trailing commas
            clean = re.sub(r',\s*}', '}', clean)
            
            obj = json.loads(clean)
            
            # Validar campos mínimos (precisa ter pelo menos event_type OU minute)
            if 'event_type' in obj or 'minute' in obj:
                # Garantir campos obrigatórios
                if 'event_type' not in obj:
                    obj['event_type'] = 'unknown'
                if 'minute' not in obj:
                    obj['minute'] = 0
                if 'second' not in obj:
                    obj['second'] = 0
                if 'team' not in obj:
                    obj['team'] = 'home'
                if 'confidence' not in obj:
                    obj['confidence'] = 0.7
                    
                events.append(obj)
                print(f"[Ollama Fallback] ✓ Objeto {i+1}: {obj.get('event_type')} aos {obj.get('minute')}'")
        except json.JSONDecodeError as e:
            print(f"[Ollama Fallback] ✗ Objeto {i+1} inválido: {str(e)[:50]}")
            continue
        except Exception as e:
            continue
    
    print(f"[Ollama Fallback] Total extraído: {len(events)} eventos válidos")
    return events


def validate_event_timestamps(
    events: List[Dict[str, Any]], 
    video_duration: float = None
) -> List[Dict[str, Any]]:
    """
    Valida e corrige eventos com timestamps inválidos.
    
    - Remove eventos com minute=0, second=0 SE não houver videoSecond válido
    - Distribui proporcionalmente se todos os eventos tiverem timestamp zero
    
    Args:
        events: Lista de eventos detectados
        video_duration: Duração do vídeo em segundos (para distribuição proporcional)
    
    Returns:
        Lista de eventos com timestamps válidos
    """
    valid_events = []
    zero_timestamp_events = []
    
    for event in events:
        minute = event.get('minute', 0)
        second = event.get('second', 0)
        video_second = event.get('videoSecond', 0)
        
        # Evento tem timestamp válido?
        if video_second > 0 or minute > 0 or second > 0:
            valid_events.append(event)
        else:
            # Timestamp zero - pode ser inválido
            zero_timestamp_events.append(event)
    
    # Se TODOS os eventos têm timestamp zero, algo está errado
    if zero_timestamp_events and not valid_events:
        print(f"[VALIDATE] ⚠ TODOS os {len(zero_timestamp_events)} eventos têm timestamp 0!")
        print(f"[VALIDATE] ⚠ Isso indica falha no parsing do SRT.")
        
        # Se temos duração do vídeo, distribuir proporcionalmente
        if video_duration and video_duration > 60:
            print(f"[VALIDATE] 🔧 Distribuindo eventos proporcionalmente no vídeo de {video_duration:.0f}s")
            
            # Usar 10% a 90% do vídeo para evitar extremos
            usable_duration = video_duration * 0.8
            start_offset = video_duration * 0.1
            
            for i, event in enumerate(zero_timestamp_events):
                # Distribuir eventos uniformemente
                position = i / max(1, len(zero_timestamp_events) - 1) if len(zero_timestamp_events) > 1 else 0.5
                new_second = start_offset + (position * usable_duration)
                
                event['videoSecond'] = int(new_second)
                event['minute'] = int(new_second / 60)
                event['second'] = int(new_second % 60)
                event['timestampEstimated'] = True
                
                print(f"[VALIDATE]   → {event.get('event_type')}: distribuído para {new_second:.0f}s")
            
            valid_events.extend(zero_timestamp_events)
        else:
            print(f"[VALIDATE] ⚠ Sem duração de vídeo, descartando eventos com timestamp 0")
    elif zero_timestamp_events:
        # Há alguns eventos com timestamp 0 mas outros têm timestamps válidos
        # Neste caso, descartar os de timestamp 0 (provavelmente parsing errado)
        print(f"[VALIDATE] ⚠ Descartando {len(zero_timestamp_events)} eventos com timestamp 0 (outros {len(valid_events)} são válidos)")
    
    return valid_events

def event_display_name(event_type: str) -> str:
    m = {
        "goal": "Gol",
        "yellow_card": "Cartão Amarelo",
        "red_card": "Cartão Vermelho",
        "foul": "Falta",
        "corner": "Escanteio",
        "penalty": "Pênalti",
        "save": "Defesa",
        "chance": "Chance",
    }
    return m.get((event_type or "").strip(), (event_type or "Evento").strip() or "Evento")


def ensure_clip_window(event: Dict[str, Any], back_seconds: int = 20, forward_seconds: int = 10) -> Dict[str, Any]:
    vs = event.get("videoSecond", None)

    if not isinstance(vs, (int, float)):
        m = int(event.get("minute", 0) or 0)
        s = int(event.get("second", 0) or 0)
        vs = m * 60 + s

    vs = max(0, int(vs))
    event["videoSecond"] = vs
    event["clip_start_second"] = max(0, vs - int(back_seconds))
    event["clip_end_second"] = vs + int(forward_seconds)
    return event


def detect_events_by_keywords_from_text(
    transcription: str,
    home_team: str,
    away_team: str,
    game_start_minute: int = 0,
    video_duration: float = None
) -> List[Dict[str, Any]]:
    """
    Detecta eventos por keywords em texto bruto (não-SRT).
    
    MELHORADO: Usa mapa de timestamps para associar keywords ao tempo correto.
    
    Args:
        transcription: Texto bruto da transcrição
        home_team: Time da casa
        away_team: Time visitante
        game_start_minute: Minuto inicial (0 ou 45)
        video_duration: Duração do vídeo em segundos (para validação)
    
    Returns:
        Lista de eventos detectados com timestamps
    """
    events = []
    
    if not transcription:
        print("[Keywords-Text] ⚠ Transcrição vazia")
        return []
    
    # 1. Criar mapa de timestamps encontrados no texto
    # Suporta formatos: HH:MM:SS ou MM:SS
    timestamp_pattern = r'(\d{1,2}):(\d{2}):(\d{2})|(\d{1,2}):(\d{2})'
    timestamp_map = {}
    
    for match in re.finditer(timestamp_pattern, transcription):
        position = match.start()
        groups = match.groups()
        
        if groups[0] is not None:
            # Formato HH:MM:SS
            hours = int(groups[0])
            mins = int(groups[1])
            secs = int(groups[2])
        else:
            # Formato MM:SS
            hours = 0
            mins = int(groups[3])
            secs = int(groups[4])
        
        total_seconds = hours * 3600 + mins * 60 + secs
        timestamp_map[position] = {
            'minute': game_start_minute + mins + (hours * 60),
            'second': secs,
            'videoSecond': total_seconds
        }
    
    print(f"[Keywords-Text] Mapa de timestamps: {len(timestamp_map)} encontrados")
    
    # 2. Padrões de eventos
    patterns = {
        'goal': [r'go+l', r'golaço', r'bola na rede', r'abre o placar', r'empata'],
        # 🔧 yellow_card REMOVIDO - menções de cartão amarelo serão ignoradas
        # 🔧 red_card REMOVIDO - menções de cartão vermelho serão ignoradas
        'penalty': [r'pênalti', r'penalidade'],
        'save': [r'grande defesa', r'salvou', r'espalmou'],
    }
    
    # 3. Para cada keyword encontrada, associar ao timestamp mais próximo
    for event_type, keyword_list in patterns.items():
        for pattern in keyword_list:
            for match in re.finditer(pattern, transcription, re.IGNORECASE):
                keyword_pos = match.start()
                
                # Encontrar timestamp mais próximo (antes OU depois)
                closest_ts = None
                min_distance = float('inf')
                
                for ts_pos, ts_data in timestamp_map.items():
                    distance = abs(keyword_pos - ts_pos)
                    if distance < min_distance:
                        min_distance = distance
                        closest_ts = ts_data
                
                if closest_ts:
                    # Usar detect_goal_author para gols
                    if event_type == 'goal':
                        window_text = transcription[max(0, keyword_pos-200):keyword_pos+200]
                        try:
                            author = detect_goal_author(window_text, home_team, away_team)
                            team = author['team']
                            confidence = author['confidence']
                        except Exception:
                            team = detect_team_from_text(
                                transcription[max(0, keyword_pos-100):keyword_pos+100],
                                home_team, away_team
                            )
                            confidence = 0.7
                    else:
                        # VALIDAÇÃO: Verificar cartões antes de aceitar
                        if event_type in ['red_card', 'yellow_card']:
                            context_start = max(0, keyword_pos - 200)
                            context_end = min(len(transcription), keyword_pos + 200)
                            context = transcription[context_start:context_end]
                            
                            validation = validate_card_event(match.group(), context, event_type, home_team, away_team)
                            if not validation['is_valid']:
                                print(f"[Keywords-Text] ⚠ {event_type} ignorado: {validation['reason']}")
                                continue
                        
                        team = detect_team_from_text(
                            transcription[max(0, keyword_pos-100):keyword_pos+100],
                            home_team, away_team
                        )
                        confidence = 0.8
                    
                    event = {
                        'minute': closest_ts['minute'],
                        'second': closest_ts['second'],
                        'videoSecond': closest_ts['videoSecond'],
                        'event_type': event_type,
                        'event_name': event_display_name(event_type),
                        'title': event_display_name(event_type),
                        'team': team,
                        'description': match.group()[:50],
                        'confidence': confidence,
                        'detection_method': 'keyword_text',
                        'timestampSource': 'proximity_map'
                    }
                    
                    # Adicionar janela de clip
                    event = ensure_clip_window(event, back_seconds=20, forward_seconds=10)
                    
                    events.append(event)
                    print(f"[Keywords-Text] ✓ {event_type} em {closest_ts['minute']}:{closest_ts['second']:02d}")
                    break  # Uma detecção por padrão
    
    # 4. Validar timestamps (remover zeros inválidos)
    events = validate_event_timestamps(events, video_duration)
    
    # 5. Deduplicar
    events = deduplicate_events(events, threshold_seconds=30)
    
    print(f"[Keywords-Text] Total: {len(events)} eventos detectados")
    return events



def _validate_goals_with_context(events: List[Dict[str, Any]], transcription: str) -> List[Dict[str, Any]]:
    """
    Validação pós-Ollama: Remove gols falsos verificando contexto na transcrição.
    
    Analisa a vizinhança do timestamp de cada gol para identificar negações
    que indicam que NÃO foi realmente um gol (ex: "quase gol", "na trave").
    
    Args:
        events: Lista de eventos detectados pelo Ollama
        transcription: Texto completo da transcrição
        
    Returns:
        Lista de eventos validados (gols falsos removidos)
    """
    # Palavras que NEGAM um gol (indicam que não entrou)
    NEGATION_PATTERNS = [
        r'\bquase\b',           # "quase gol"
        r'\bpor\s+pouco\b',     # "por pouco"
        r'\bperdeu\b',          # "perdeu o gol"
        r'\bna\s+trave\b',      # "bateu na trave"
        r'\bno\s+travessão\b',  # "bateu no travessão"
        r'\bpra\s+fora\b',      # "mandou pra fora"
        r'\bdefendeu\b',        # "goleiro defendeu"
        r'\bespalmou\b',        # "goleiro espalmou"
        r'\bsalvou\b',          # "goleiro salvou"
        r'\bnão\s+foi\b',       # "não foi gol"
        r'\banulado\b',         # "gol anulado"
        r'\bimpedido\b',        # "estava impedido"
        r'\bpassou\s+perto\b',  # "passou perto"
        r'\braspou\b',          # "raspou a trave"
        r'\btirou\b',           # "zagueiro tirou"
    ]
    
    validated = []
    removed_count = 0
    
    for event in events:
        # Só validar gols - outros eventos passam direto
        if event.get('event_type') != 'goal':
            validated.append(event)
            continue
        
        minute = event.get('minute', 0)
        second = event.get('second', 0)
        
        # Extrair contexto centrado na keyword 'gol' (janela 40s)
        context = _extract_context_around_timestamp(
            transcription, minute, second,
            event_type='goal',
            window_chars=1000
        )
        context_lower = context.lower()
        
        # Verificar negações
        is_negated = False
        negation_found = None
        
        for pattern in NEGATION_PATTERNS:
            if re.search(pattern, context_lower, re.IGNORECASE):
                is_negated = True
                negation_found = pattern
                break
        
        if is_negated:
            print(f"[Validate] ⚠️ Gol em {minute}'{second:02d}\" REJEITADO - negação detectada: '{negation_found}'")
            print(f"[Validate]    Contexto: \"{context[:100]}...\"")
            removed_count += 1
            continue
        
        # Gol validado
        validated.append(event)
    
    if removed_count > 0:
        print(f"[Validate] ✓ Validação concluída: {removed_count} gol(s) falso(s) removido(s)")
    
    return validated


    # Nota: Função _extract_context_around_timestamp consolidada na linha 513
    # Esta duplicata foi removida para evitar conflito


def _analyze_events_with_ollama(
    transcription: str,
    home_team: str,
    away_team: str,
    game_start_minute: int,
    game_end_minute: int,
    match_half: str,
    match_id: str = None
) -> List[Dict[str, Any]]:
    """
    Analyze match events using local Ollama (FREE).
    
    Args:
        transcription: Match transcription text
        home_team: Home team name
        away_team: Away team name
        game_start_minute: Start minute
        game_end_minute: End minute
        match_half: 'first' or 'second'
        match_id: Optional match ID
    
    Returns:
        List of detected events
    """
    half_desc = "1º Tempo" if match_half == 'first' else "2º Tempo"
    
    # ═══════════════════════════════════════════════════════════════════════════
    # PROMPT OTIMIZADO - Versão 2.0
    # Simplificado para melhor performance com modelos 7B (mistral, qwen2.5)
    # ═══════════════════════════════════════════════════════════════════════════
    prompt = f"""Extraia eventos de futebol desta transcrição SRT.

PARTIDA: {home_team} (casa) vs {away_team} (visitante)
PERÍODO: {half_desc}

EVENTOS PARA DETECTAR:
- goal: "GOOOL", "GOLAÇO", "abre o placar", "empata", "virou", "bola na rede"
- penalty: "pênalti", "penalidade máxima"
- save: "grande defesa", "salvou", "espalmou"
- chance: "quase gol", "na trave", "passou perto"
- foul: "falta de", "derrubou"
- corner: "escanteio"
- shot: "chutou", "finalizou", "arriscou"

REGRA CRÍTICA DE TIMESTAMP:
Use o timestamp do bloco SRT (00:MM:SS), NÃO o minuto falado pelo narrador.
Exemplo: Se o bloco SRT mostra "00:24:52,253 --> ..." use minute=24, second=52

TRANSCRIÇÃO:
{transcription[:24000]}

Retorne APENAS um array JSON com os eventos detectados. Sem texto antes ou depois.
Formato obrigatório:
[{{"minute":24,"second":52,"event_type":"goal","team":"home","description":"Gol de cabeça","confidence":0.95}}]"""

    try:
        print(f"[Ollama] Analisando transcrição com {OLLAMA_MODEL} (temperature=0.1, format=json)...")
        
        result = call_ollama(
            messages=[{'role': 'user', 'content': prompt}],
            model=OLLAMA_MODEL,
            temperature=0.1,  # Mais baixo para precisão máxima
            max_tokens=4096,
            format="json"     # Força JSON válido (elimina parsing errors)
        )
        
        # ═══════════════════════════════════════════════════════════════════════════
        # FALLBACK: Se Ollama falhou, tentar outros provedores de IA
        # ═══════════════════════════════════════════════════════════════════════════
        if not result:
            print(f"[Ollama] ⚠ Offline ou sem resposta, tentando fallback...")
            
            # Fallback 1: Lovable AI (sempre disponível se LOVABLE_API_KEY configurada)
            if LOVABLE_API_KEY:
                print(f"[Ollama] Fallback: Tentando Lovable AI...")
                result = call_lovable_ai(
                    messages=[{'role': 'user', 'content': prompt}],
                    model='google/gemini-2.5-flash',
                    temperature=0.1,
                    max_tokens=4096
                )
                if result:
                    print(f"[Ollama] ✓ Fallback Lovable AI funcionou!")
            
            # Fallback 2: Gemini direto (se API key configurada)
            if not result and GOOGLE_API_KEY and GEMINI_ENABLED:
                print(f"[Ollama] Fallback: Tentando Gemini direto...")
                result = call_google_gemini(
                    messages=[{'role': 'user', 'content': prompt}],
                    model='gemini-2.5-flash',
                    temperature=0.1,
                    max_tokens=4096
                )
                if result:
                    print(f"[Ollama] ✓ Fallback Gemini funcionou!")
            
            # Fallback 3: OpenAI (se API key configurada)
            if not result and OPENAI_API_KEY and OPENAI_ENABLED:
                print(f"[Ollama] Fallback: Tentando OpenAI...")
                result = call_openai(
                    messages=[{'role': 'user', 'content': prompt}],
                    model='gpt-4o-mini',
                    temperature=0.1,
                    max_tokens=4096
                )
                if result:
                    print(f"[Ollama] ✓ Fallback OpenAI funcionou!")
            
            # Fallback final: Detecção por keywords (sempre funciona, 0% IA)
            if not result:
                print(f"[Ollama] ⚠ Sem IA disponível! Usando detecção por keywords (100% determinístico)...")
                keyword_events = detect_events_by_keywords_from_text(
                    transcription=transcription,
                    home_team=home_team,
                    away_team=away_team,
                    game_start_minute=game_start_minute,
                    video_duration=None  # Sem duração disponível neste contexto
                )
                print(f"[Ollama] Detecção por keywords: {len(keyword_events)} eventos encontrados")
                return keyword_events
        
        # LOG: Mostrar resposta bruta para debug
        print(f"[Ollama] === RESPOSTA BRUTA (primeiros 800 chars) ===")
        print(result[:800])
        print(f"[Ollama] === FIM (total: {len(result)} chars) ===")
        
        # Parse JSON from response com múltiplas estratégias
        result = result.strip()
        events = []
        
        # Estratégia 1: Remover blocos de código markdown
        if '```' in result:
            import re
            json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', result)
            if json_match:
                result = json_match.group(1).strip()
                print(f"[Ollama] Estratégia 1: Removido markdown, agora: {len(result)} chars")
        
        # Estratégia 2: Encontrar array JSON [...]
        start = result.find('[')
        end = result.rfind(']') + 1
        
        if start >= 0 and end > start:
            json_str = result[start:end]
            
            # Estratégia 3: Corrigir aspas simples para duplas
            json_str = json_str.replace("'", '"')
            
            # Estratégia 4: Remover trailing commas
            import re
            json_str = re.sub(r',\s*}', '}', json_str)
            json_str = re.sub(r',\s*]', ']', json_str)
            
            try:
                events = json.loads(json_str)
                print(f"[Ollama] ✓ Estratégia 2-4: Extraídos {len(events)} eventos")
            except json.JSONDecodeError as e:
                print(f"[Ollama] Erro JSON (tentando fallback): {e}")
                # Estratégia 5: Tentar parsear objeto por objeto
                events = _parse_ollama_events_fallback(result)
        else:
            print(f"[Ollama] Não encontrou array JSON, tentando fallback...")
            events = _parse_ollama_events_fallback(result)
        
        if events:
            # Log goals found
            goals = [e for e in events if e.get('event_type') == 'goal']
            print(f"[Ollama] Total: {len(events)} eventos, {len(goals)} gols")
            for g in goals:
                print(f"[Ollama] ⚽ GOL: {g.get('minute', 0)}' - {g.get('team', 'unknown')}")
            
            # VALIDAÇÃO PÓS-OLLAMA: Remover gols falsos verificando contexto
            events = _validate_goals_with_context(events, transcription)
            
            # VALIDAÇÃO PÓS-OLLAMA: Validar TODOS os eventos (cartões, pênaltis)
            events = _validate_all_events_with_context(events, transcription, home_team, away_team)
        else:
            print(f"[Ollama] ⚠️ Nenhum evento extraído!")
        
        # FALLBACK: Se Ollama retornou poucos eventos, usar SRT keywords (mais preciso)
        if len(events) < 3:
            print(f"[Ollama] ⚠️ Poucos eventos ({len(events)}), usando fallback por SRT...")
            keyword_events = []
            
            # Tentar usar detect_events_by_keywords (SRT direto) se temos match_id
            if match_id:
                try:
                    from storage import get_subfolder_path
                    srt_folder = get_subfolder_path(match_id, 'srt')
                    srt_files = list(srt_folder.glob('*.srt')) if srt_folder.exists() else []
                    
                    # 🔧 Filtrar SRT pelo tempo correto (match_half)
                    print(f"[Ollama] 📂 SRTs disponíveis: {[f.name for f in srt_files]}")
                    print(f"[Ollama] 🎯 Buscando SRT para tempo: {match_half}")
                    
                    target_srt = None
                    if srt_files:
                        # Prioridade: arquivo específico do tempo
                        srt_patterns = [
                            f'{match_half}_half.srt',           # second_half.srt
                            f'{match_half}_transcription.srt',  # second_transcription.srt
                            f'{match_half}.srt',                # second.srt
                        ]
                        
                        for pattern in srt_patterns:
                            for srt_file in srt_files:
                                if pattern in srt_file.name.lower():
                                    target_srt = srt_file
                                    break
                            if target_srt:
                                break
                        
                        # Fallback: usar qualquer SRT se só existe um
                        if not target_srt and len(srt_files) == 1:
                            target_srt = srt_files[0]
                            print(f"[Ollama] ⚠️ Usando único SRT disponível: {target_srt.name}")
                    
                    if target_srt:
                        print(f"[Ollama] ✓ Usando SRT do {match_half}: {target_srt.name}")
                        keyword_events = detect_events_by_keywords(
                            srt_path=str(target_srt),
                            home_team=home_team,
                            away_team=away_team,
                            half=match_half,
                            segment_start_minute=game_start_minute
                        )
                        print(f"[Ollama] Detecção por SRT (sliding window): {len(keyword_events)} eventos")
                    else:
                        print(f"[Ollama] SRT não encontrado, usando texto bruto...")
                        keyword_events = detect_events_by_keywords_from_text(
                            transcription=transcription,
                            home_team=home_team,
                            away_team=away_team,
                            game_start_minute=game_start_minute,
                            video_duration=None
                        )
                except Exception as e:
                    print(f"[Ollama] Erro ao buscar SRT: {e}, usando texto bruto...")
                    keyword_events = detect_events_by_keywords_from_text(
                        transcription=transcription,
                        home_team=home_team,
                        away_team=away_team,
                        game_start_minute=game_start_minute,
                        video_duration=None
                    )
            else:
                # Sem match_id, usar texto bruto
                keyword_events = detect_events_by_keywords_from_text(
                    transcription=transcription,
                    home_team=home_team,
                    away_team=away_team,
                    game_start_minute=game_start_minute,
                    video_duration=None
                )
            
            # Merge eventos novos (deduplicação)
            for ke in keyword_events:
                already_exists = any(
                    abs(e.get('minute', 0) - ke.get('minute', 0)) < 2 and 
                    e.get('event_type') == ke.get('event_type')
                    for e in events
                )
                if not already_exists:
                    events.append(ke)
            print(f"[Ollama] Total após fallback: {len(events)} eventos")
        
        return events
            
    except Exception as e:
        print(f"[Ollama] Erro geral: {e}")
        import traceback
        traceback.print_exc()
        return []


def _enrich_events(
    events: List[Dict[str, Any]],
    game_start_minute: int,
    game_end_minute: int
) -> List[Dict[str, Any]]:
    """
    Enrich events with required fields for database insertion.
    
    Args:
        events: Raw events from AI
        game_start_minute: Start minute
        game_end_minute: End minute
    
    Returns:
        Enriched events with all required fields
    """
    VALID_EVENT_TYPES = [
        'goal', 'shot', 'save', 'foul', 'yellow_card',  # 🔧 red_card REMOVIDO
        'corner', 'offside', 'substitution', 'chance', 'penalty',
        'free_kick', 'throw_in', 'kick_off', 'half_time', 'full_time',
        'var', 'injury', 'assist', 'cross', 'tackle', 'interception',
        'clearance', 'duel_won', 'duel_lost', 'ball_recovery', 'ball_loss',
        'high_press', 'transition', 'buildup', 'shot_on_target', 'unknown'
    ]
    
    enriched = []
    for event in events:
        event_type = event.get('event_type', 'unknown')
        
        # 🔧 CONVERSÃO: Cartão vermelho → Falta
        if event_type == 'red_card':
            print(f"[Sanitize] 🔄 Convertendo red_card → foul (min {event.get('minute', '?')}')")
            event_type = 'foul'
            event['event_type'] = 'foul'
            event['description'] = f"Falta (menção a cartão): {(event.get('description') or '')[:80]}"[:100]
        
        # 🔧 CONVERSÃO: Cartão amarelo → Falta (desativado - muitos falsos positivos)
        if event_type == 'yellow_card':
            print(f"[Sanitize] 🔄 Convertendo yellow_card → foul (min {event.get('minute', '?')}')")
            event_type = 'foul'
            event['event_type'] = 'foul'
            event['description'] = f"Falta (menção a cartão): {(event.get('description') or '')[:80]}"[:100]
        
        if event_type not in VALID_EVENT_TYPES:
            event_type = 'unknown'
        
        event['event_type'] = event_type
        event['minute'] = max(game_start_minute, min(game_end_minute, event.get('minute', game_start_minute)))
        event['second'] = event.get('second', 0)
        event['team'] = event.get('team', 'home')
        event['description'] = (event.get('description') or '')[:200]
        event['confidence'] = event.get('confidence', 0.8)
        # 🔧 yellow_card e red_card removidos de highlights
        event['is_highlight'] = event.get('is_highlight', event_type in ['goal', 'penalty'])
        event['isOwnGoal'] = event.get('isOwnGoal', False)
        event['validated'] = True
        event['validation_reason'] = 'Approved by Ollama local'
        
        # Own goal auto-fix
        if event_type == 'goal':
            description = (event.get('description') or '').lower()
            own_goal_keywords = ['gol contra', 'próprio gol', 'mandou contra', 'own goal', 'autogol']
            if any(term in description for term in own_goal_keywords) and not event.get('isOwnGoal'):
                event['isOwnGoal'] = True
                event['_autoFixed'] = True
        
        if event_type == 'unknown' and len(event['description']) < 5:
            continue
        
        enriched.append(event)
    
    return enriched


def analyze_match_events(
    transcription: str,
    home_team: str,
    away_team: str,
    game_start_minute: int = 0,
    game_end_minute: int = 45,
    max_retries: int = 3,
    match_id: str = None,
    use_dual_verification: bool = True,
    settings: Dict[str, str] = None
) -> List[Dict[str, Any]]:
    """
    Analyze match transcription to extract events using dual AI verification.
    
    NEW FLOW (Dual Verification):
    1. PHASE 1 - Detection (GPT-5): Analyzes transcription, extracts all events
    2. PHASE 2 - Validation (Gemini): Reviews each event for textual evidence
    3. PHASE 3 - Deduplication: Removes duplicate goals within 30 seconds
    
    Args:
        transcription: Match transcription text
        home_team: Home team name
        away_team: Away team name
        game_start_minute: Start minute of the game segment
        game_end_minute: End minute of the game segment
        max_retries: Maximum retry attempts on failure
        match_id: Optional match ID for saving intermediate JSON files
        use_dual_verification: If True, uses GPT-5 + Gemini dual verification
    
    Returns:
        List of detected events with validated scores
    
    Raises:
        ValueError: If no AI provider is configured
        RuntimeError: If all analysis attempts fail
    """
    import time
    
    # ═══════════════════════════════════════════════════════════════
    # VALIDAÇÃO PRÉVIA: Verificar se há pelo menos um provedor de IA
    # ═══════════════════════════════════════════════════════════════
    if not LOVABLE_API_KEY and not GOOGLE_API_KEY and not OPENAI_API_KEY and not OLLAMA_ENABLED:
        error_msg = (
            "Nenhum provedor de IA configurado. "
            "Configure uma chave de API (Lovable, Gemini, OpenAI ou Ollama) em Configurações > API."
        )
        print(f"[AI] ❌ ERRO: {error_msg}")
        raise ValueError(error_msg)
    
    # Log dos provedores disponíveis
    providers = []
    print(f"[AI] DEBUG - Verificando provedores de IA:")
    print(f"  LOVABLE_API_KEY: {'✓ ' + LOVABLE_API_KEY[:10] + '...' if LOVABLE_API_KEY else '✗ não configurada'}")
    print(f"  GOOGLE_API_KEY: {'✓ ' + GOOGLE_API_KEY[:10] + '...' if GOOGLE_API_KEY else '✗ não configurada'}")
    print(f"  OPENAI_API_KEY: {'✓ ' + OPENAI_API_KEY[:10] + '...' if OPENAI_API_KEY else '✗ não configurada'}")
    print(f"  OLLAMA_ENABLED: {OLLAMA_ENABLED}")
    print(f"  GEMINI_ENABLED: {GEMINI_ENABLED}")
    print(f"  OPENAI_ENABLED: {OPENAI_ENABLED}")
    
    if LOVABLE_API_KEY:
        providers.append("Lovable")
    if GOOGLE_API_KEY and GEMINI_ENABLED:
        providers.append("Gemini")
    if OPENAI_API_KEY and OPENAI_ENABLED:
        providers.append("OpenAI/GPT-5")
    if OLLAMA_ENABLED:
        providers.append("Ollama")
    print(f"[AI] Provedores disponíveis: {', '.join(providers) if providers else 'NENHUM!'}")
    
    half_desc = "1º Tempo (0-45 min)" if game_start_minute < 45 else "2º Tempo (45-90 min)"
    match_half = 'first' if game_start_minute < 45 else 'second'
    
    # ═══════════════════════════════════════════════════════════════
    # SISTEMA DE PRIORIDADE DINÂMICA
    # ═══════════════════════════════════════════════════════════════
    priority_order = get_ai_priority_order(settings)
    primary_provider = priority_order[0] if priority_order else 'gemini'
    print(f"[AI] Prioridade: {' → '.join(priority_order)}")
    print(f"[AI] Provedor primário: {primary_provider}")
    
    # Verificar se pode usar GPT-4o (modo legado com verificação)
    can_use_gpt = use_dual_verification and match_id and OPENAI_API_KEY and OPENAI_ENABLED
    
    # Se Ollama é primário e está ativo, usar fluxo Ollama
    use_ollama_flow = primary_provider == 'ollama' and OLLAMA_ENABLED
    
    if use_ollama_flow:
        print(f"\n[AI] ═══════════════════════════════════════════════════════════")
        print(f"[AI] 🦙 MODO OLLAMA LOCAL (GRATUITO)")
        print(f"[AI]    Modelo: {OLLAMA_MODEL}")
        print(f"[AI]    URL: {OLLAMA_URL}")
        print(f"[AI] ═══════════════════════════════════════════════════════════\n")
    elif can_use_gpt:
        print(f"\n[AI] ═══════════════════════════════════════════════════════════")
        print(f"[AI] 🔄 SISTEMA SINGLE AI (GPT-4o apenas)")
        print(f"[AI]    Fase 1: GPT-4o (detecção)")
        print(f"[AI]    Fase 2: Filtro por Confidence")
        print(f"[AI]    Fase 3: Deduplicação")
        print(f"[AI] ═══════════════════════════════════════════════════════════\n")
    else:
        reasons = []
        if not use_dual_verification:
            reasons.append("dual_verification desabilitado")
        if not match_id:
            reasons.append("match_id não fornecido")
        if not OPENAI_API_KEY:
            reasons.append("OPENAI_API_KEY não configurada")
        if OPENAI_API_KEY and not OPENAI_ENABLED:
            reasons.append("OpenAI desabilitado nas configurações")
        print(f"[AI] ℹ️ Modo legado (call_ai com prioridade): {', '.join(reasons) if reasons else 'usando prioridade dinâmica'}")
    
    # ═══════════════════════════════════════════════════════════════
    # FLUXO OLLAMA LOCAL (GRATUITO)
    # ═══════════════════════════════════════════════════════════════
    if use_ollama_flow:
        try:
            events = _analyze_events_with_ollama(
                transcription=transcription,
                home_team=home_team,
                away_team=away_team,
                game_start_minute=game_start_minute,
                game_end_minute=game_end_minute,
                match_half=match_half,
                match_id=match_id
            )
            
            if events:
                # Enrich and deduplicate
                enriched_events = _enrich_events(events, game_start_minute, game_end_minute)
                final_events = deduplicate_goal_events(enriched_events)
                
                goals_count = len([e for e in final_events if e.get('event_type') == 'goal'])
                print(f"[AI] ✓ ANÁLISE COMPLETA (Ollama Local)")
                print(f"[AI]   Detectados: {len(events)} eventos")
                print(f"[AI]   Gols: {goals_count}")
                
                # NOVO: Salvar JSONs como o pipeline GPT faz
                if match_id:
                    try:
                        from datetime import datetime
                        from storage import get_subfolder_path
                        json_path = get_subfolder_path(match_id, 'json')
                        
                        # 1. detected_events_{half}.json - eventos brutos
                        detected_result = {
                            "match_id": match_id,
                            "detected_at": datetime.utcnow().isoformat() + "Z",
                            "detector": "ollama_local",
                            "model": OLLAMA_MODEL,
                            "half": match_half,
                            "home_team": home_team,
                            "away_team": away_team,
                            "events": events,
                            "summary": {
                                "raw_detected": len(events),
                                "goals": len([e for e in events if e.get('event_type') == 'goal'])
                            }
                        }
                        detected_filename = f"detected_events_{match_half}.json"
                        with open(json_path / detected_filename, 'w', encoding='utf-8') as f:
                            json.dump(detected_result, f, ensure_ascii=False, indent=2)
                        print(f"[AI] ✓ Detectados salvos: json/{detected_filename}")
                        
                        # 2. validated_events_{half}.json - eventos finais
                        validated_result = {
                            "match_id": match_id,
                            "validated_at": datetime.utcnow().isoformat() + "Z",
                            "validator": "ollama_local",
                            "half": match_half,
                            "home_team": home_team,
                            "away_team": away_team,
                            "events": final_events,
                            "summary": {
                                "total_detected": len(events),
                                "confirmed": len(final_events),
                                "rejected": len(events) - len(final_events)
                            }
                        }
                        validated_filename = f"validated_events_{match_half}.json"
                        with open(json_path / validated_filename, 'w', encoding='utf-8') as f:
                            json.dump(validated_result, f, ensure_ascii=False, indent=2)
                        print(f"[AI] ✓ Validados salvos: json/{validated_filename}")
                        
                        # 3. rejected_events_{half}.json - eventos descartados na dedup
                        rejected_events = [e for e in enriched_events if e not in final_events]
                        rejected_result = {
                            "match_id": match_id,
                            "rejected_at": datetime.utcnow().isoformat() + "Z",
                            "half": match_half,
                            "reason": "deduplication",
                            "events": rejected_events
                        }
                        rejected_filename = f"rejected_events_{match_half}.json"
                        with open(json_path / rejected_filename, 'w', encoding='utf-8') as f:
                            json.dump(rejected_result, f, ensure_ascii=False, indent=2)
                        print(f"[AI] ✓ Rejeitados salvos: json/{rejected_filename}")
                        
                    except Exception as e:
                        print(f"[AI] ⚠ Erro ao salvar JSONs do Ollama: {e}")
                
                return final_events
                
        except Exception as e:
            print(f"[AI] ⚠ Ollama falhou: {e}")
            print(f"[AI] Tentando fallback...")
    
    # ═══════════════════════════════════════════════════════════════
    # FLUXO GPT-4o (quando OpenAI é o provedor primário)
    # ═══════════════════════════════════════════════════════════════
    if can_use_gpt:
        
        try:
            # ═══ FASE 1: GPT-4o detecta eventos ═══
            detected_result = detect_events_with_gpt(
                match_id=match_id,
                transcription=transcription,
                home_team=home_team,
                away_team=away_team,
                half=match_half,
                game_start_minute=game_start_minute,
                game_end_minute=game_end_minute
            )
            
            if detected_result.get('error'):
                print(f"[AI] ⚠ Detecção falhou: {detected_result.get('error')}")
                # Fall through to legacy mode
            else:
                # ═══ FASE 2: Filtro por Confidence (GEMINI REMOVIDO) ═══
                detected_events = detected_result.get('events', [])
                half = detected_result.get('half', 'first')
                
                print(f"[AI] 🔍 FASE 2: Filtrando {len(detected_events)} eventos por confidence...")
                
                validated_events = []
                rejected_events = []
                
                for event in detected_events:
                    confidence = event.get('confidence', 0) or 0
                    event_type = event.get('event_type', '')
                    source_text = (event.get('source_text') or '').upper()
                    
                    # Gols: threshold mais baixo (0.5) - prioridade máxima
                    # Se menciona "GOL" no source_text, aprovar com confidence >= 0.3
                    # Outros eventos: threshold padrão (0.7)
                    is_goal = event_type == 'goal'
                    has_goal_mention = any(word in source_text for word in ['GOL', 'GOOOL', 'GOLAÇO', 'ENTROU', 'PRA DENTRO'])
                    
                    if is_goal and has_goal_mention:
                        min_confidence = 0.3  # Muito permissivo para gols com menção clara
                    elif is_goal:
                        min_confidence = 0.5  # Permissivo para outros gols
                    else:
                        min_confidence = 0.7  # Padrão para outros eventos
                    
                    if confidence >= min_confidence:
                        event['validated'] = True
                        event['validation_reason'] = f'Aprovado por confidence ({confidence:.2f} >= {min_confidence})'
                        validated_events.append(event)
                        if is_goal:
                            print(f"[AI] ⚽ GOL APROVADO: min {event.get('minute')}:{event.get('second', 0):02d} - confidence {confidence:.2f} - {event.get('description', '')[:40]}")
                    else:
                        event['validated'] = False
                        event['validation_reason'] = f'Rejeitado por confidence ({confidence:.2f} < {min_confidence})'
                        rejected_events.append(event)
                        print(f"[AI] ❌ Rejeitado: {event_type} min {event.get('minute')}' - confidence {confidence:.2f} < {min_confidence}")
                
                print(f"[AI] ✓ Filtro: {len(validated_events)} aprovados, {len(rejected_events)} rejeitados")
                
                # Salvar JSONs para debug
                try:
                    from datetime import datetime
                    from storage import get_subfolder_path
                    json_path = get_subfolder_path(match_id, 'json')
                    
                    validated_result = {
                        "match_id": match_id,
                        "validated_at": datetime.utcnow().isoformat() + "Z",
                        "validator": "confidence_filter",
                        "half": half,
                        "home_team": home_team,
                        "away_team": away_team,
                        "events": validated_events,
                        "summary": {
                            "total_detected": len(detected_events),
                            "confirmed": len(validated_events),
                            "rejected": len(rejected_events)
                        }
                    }
                    
                    validated_filename = f"validated_events_{half}.json"
                    with open(json_path / validated_filename, 'w', encoding='utf-8') as f:
                        json.dump(validated_result, f, ensure_ascii=False, indent=2)
                    
                    rejected_result = {
                        "match_id": match_id,
                        "rejected_at": datetime.utcnow().isoformat() + "Z",
                        "half": half,
                        "events": rejected_events
                    }
                    rejected_filename = f"rejected_events_{half}.json"
                    with open(json_path / rejected_filename, 'w', encoding='utf-8') as f:
                        json.dump(rejected_result, f, ensure_ascii=False, indent=2)
                    
                    print(f"[AI] ✓ JSONs salvos em json/")
                except Exception as e:
                    print(f"[AI] ⚠ Erro ao salvar JSONs: {e}")
                
                # Enrich events with required fields for database insertion
                VALID_EVENT_TYPES = [
                    'goal', 'shot', 'save', 'foul', 'yellow_card', 'red_card',
                    'corner', 'offside', 'substitution', 'chance', 'penalty',
                    'free_kick', 'throw_in', 'kick_off', 'half_time', 'full_time',
                    'var', 'injury', 'assist', 'cross', 'tackle', 'interception',
                    'clearance', 'duel_won', 'duel_lost', 'ball_recovery', 'ball_loss',
                    'high_press', 'transition', 'buildup', 'shot_on_target', 'unknown'
                ]
                
                enriched_events = []
                for event in validated_events:
                    event_type = event.get('event_type', 'unknown')
                    if event_type not in VALID_EVENT_TYPES:
                        event_type = 'unknown'
                    
                    event['event_type'] = event_type
                    event['minute'] = max(game_start_minute, min(game_end_minute, event.get('minute', game_start_minute)))
                    event['team'] = event.get('team', 'home')
                    event['description'] = (event.get('description') or '')[:200]
                    event['is_highlight'] = event.get('is_highlight', event_type in ['goal', 'yellow_card', 'red_card', 'penalty'])
                    event['isOwnGoal'] = event.get('isOwnGoal', False)
                    
                    # Own goal auto-fix
                    if event_type == 'goal':
                        description = (event.get('description') or '').lower()
                        own_goal_keywords = ['gol contra', 'próprio gol', 'contra o próprio', 'mandou contra', 'own goal', 'autogol']
                        if any(term in description for term in own_goal_keywords) and not event.get('isOwnGoal'):
                            event['isOwnGoal'] = True
                            event['_autoFixed'] = True
                    
                    enriched_events.append(event)
                
                # ═══ FASE 3: Deduplicação ═══
                print(f"\n[AI] 🔄 FASE 3: Deduplicação de gols...")
                final_events = deduplicate_goal_events(enriched_events)
                
                # ═══ FASE 4 REMOVIDA ═══
                # O refinamento por keyword foi removido
                # O ajuste fino agora é feito manualmente pelo usuário via Timeline Editor
                
                # Summary
                goals_count = len([e for e in final_events if e.get('event_type') == 'goal'])
                print(f"\n[AI] ═══════════════════════════════════════════════════════════")
                print(f"[AI] ✓ ANÁLISE COMPLETA (Single AI - GPT-4o)")
                print(f"[AI]   Detectados: {len(detected_events)} eventos")
                print(f"[AI]   Aprovados: {len(validated_events)} eventos")
                print(f"[AI]   Rejeitados: {len(rejected_events)} eventos")
                print(f"[AI]   Gols finais: {goals_count}")
                print(f"[AI]   Resultado: {len(final_events)} eventos finais")
                print(f"[AI] ═══════════════════════════════════════════════════════════\n")
                
                return final_events
                
        except Exception as e:
            print(f"[AI] ⚠ Erro na análise: {e}")
            import traceback
            traceback.print_exc()
            print(f"[AI] Fallback para modo legado...")
    
    # ═══════════════════════════════════════════════════════════════
    # MODO LEGADO (Single AI - Gemini)
    # ═══════════════════════════════════════════════════════════════
    print(f"[AI] Usando modo legado (Gemini único)")
    
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
⚠️ ATENÇÃO ESPECIAL: GOLS CONTRA (MUITO IMPORTANTE!)
═══════════════════════════════════════════════════════════════

REGRA CRÍTICA PARA GOLS CONTRA:
→ team = TIME QUE COMETEU O ERRO (não quem se beneficiou!)
→ isOwnGoal = true (OBRIGATÓRIO!)

TIMES DA PARTIDA:
- HOME (casa): {home_team}
- AWAY (visitante): {away_team}
- Período: {half_desc}

FORMATO DE SAÍDA: Retorne APENAS um array JSON válido com minute E second, sem explicações."""

    user_prompt = f"""⚽⚽⚽ MISSÃO CRÍTICA: ENCONTRAR TODOS OS GOLS E EVENTOS! ⚽⚽⚽

PARTIDA: {home_team} (casa) vs {away_team} (visitante)
PERÍODO: {half_desc} (minutos {game_start_minute}' a {game_end_minute}')

Para um tempo de 45 minutos, retorne PELO MENOS 15-30 eventos!

TRANSCRIÇÃO COMPLETA:
═══════════════════════════════════════════════════════════════
{transcription}
═══════════════════════════════════════════════════════════════

RETORNE APENAS O ARRAY JSON, SEM TEXTO ADICIONAL."""

    events = []
    last_error = None
    
    for attempt in range(max_retries):
        try:
            print(f"[AI] Análise tentativa {attempt + 1}/{max_retries}")
            
            # Use gemini-2.5-flash (faster and consistent with Edge Function)
            response = call_ai([
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt}
            ], model='google/gemini-2.5-flash', max_tokens=8192, settings=settings)
            
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
                
                # Valid event types
                VALID_EVENT_TYPES = [
                    'goal', 'shot', 'save', 'foul', 'yellow_card', 'red_card',
                    'corner', 'offside', 'substitution', 'chance', 'penalty',
                    'free_kick', 'throw_in', 'kick_off', 'half_time', 'full_time',
                    'var', 'injury', 'assist', 'cross', 'tackle', 'interception',
                    'clearance', 'duel_won', 'duel_lost', 'ball_recovery', 'ball_loss',
                    'high_press', 'transition', 'buildup', 'shot_on_target', 'unknown'
                ]
                
                # Validate and enrich events
                validated_events = []
                for event in events:
                    event_type = event.get('event_type', 'unknown')
                    
                    if event_type not in VALID_EVENT_TYPES:
                        print(f"[AI] ⚠ Invalid event_type '{event_type}' - converting to 'unknown'")
                        event_type = 'unknown'
                    
                    event['event_type'] = event_type
                    event['minute'] = max(game_start_minute, min(game_end_minute, event.get('minute', game_start_minute)))
                    event['team'] = event.get('team', 'home')
                    event['description'] = event.get('description', '')[:200]
                    event['is_highlight'] = event.get('is_highlight', event_type in ['goal', 'yellow_card', 'red_card', 'penalty'])
                    event['isOwnGoal'] = event.get('isOwnGoal', False)
                    
                    # Own goal auto-fix
                    if event_type == 'goal':
                        description = (event.get('description') or '').lower()
                        own_goal_keywords = ['gol contra', 'próprio gol', 'mandou contra', 'own goal', 'autogol']
                        if any(term in description for term in own_goal_keywords) and not event.get('isOwnGoal'):
                            event['isOwnGoal'] = True
                            event['_autoFixed'] = True
                        
                        print(f"[AI] ⚽ GOL: Min {event.get('minute')}' - Team: {event.get('team')} - OwnGoal: {event.get('isOwnGoal')}")
                    
                    if event_type == 'unknown' and len(event['description']) < 5:
                        continue
                    
                    validated_events.append(event)
                
                print(f"[AI] Validated {len(validated_events)} events")
                
                # Deduplication
                deduplicated_events = deduplicate_goal_events(validated_events)
                
                # NOVO: Salvar JSONs no fluxo legado também (paridade com Ollama/GPT-4o)
                if match_id:
                    try:
                        from datetime import datetime
                        from storage import get_subfolder_path
                        json_path = get_subfolder_path(match_id, 'json')
                        
                        # validated_events_{half}.json - eventos finais validados
                        validated_result = {
                            "match_id": match_id,
                            "validated_at": datetime.utcnow().isoformat() + "Z",
                            "validator": "gemini_legacy",
                            "half": match_half,
                            "home_team": home_team,
                            "away_team": away_team,
                            "events": deduplicated_events,
                            "summary": {
                                "total_detected": len(events),
                                "validated": len(validated_events),
                                "confirmed": len(deduplicated_events),
                                "rejected": len(validated_events) - len(deduplicated_events)
                            }
                        }
                        validated_filename = f"validated_events_{match_half}.json"
                        with open(json_path / validated_filename, 'w', encoding='utf-8') as f:
                            json.dump(validated_result, f, ensure_ascii=False, indent=2)
                        print(f"[AI] ✓ Validados salvos: json/{validated_filename}")
                        
                        # detected_events_{half}.json - eventos brutos antes da validação
                        detected_result = {
                            "match_id": match_id,
                            "detected_at": datetime.utcnow().isoformat() + "Z",
                            "detector": "gemini_legacy",
                            "half": match_half,
                            "home_team": home_team,
                            "away_team": away_team,
                            "events": events,
                            "summary": {
                                "raw_detected": len(events),
                                "goals": len([e for e in events if e.get('event_type') == 'goal'])
                            }
                        }
                        detected_filename = f"detected_events_{match_half}.json"
                        with open(json_path / detected_filename, 'w', encoding='utf-8') as f:
                            json.dump(detected_result, f, ensure_ascii=False, indent=2)
                        print(f"[AI] ✓ Detectados salvos: json/{detected_filename}")
                        
                    except Exception as e:
                        print(f"[AI] ⚠ Erro ao salvar JSONs Gemini: {e}")
                
                return deduplicated_events
            else:
                last_error = f"No JSON array found in response: {response[:200]}"
                
        except json.JSONDecodeError as e:
            last_error = f"JSON parse error: {e}"
            print(f"[AI] JSON parse failed: {e}")
        except Exception as e:
            last_error = str(e)
            print(f"[AI] Error: {e}")
        
        if attempt < max_retries - 1:
            time.sleep(2 * (attempt + 1))
    
    error_msg = f"Análise falhou após {max_retries} tentativas. Último erro: {last_error}"
    print(f"[AI] ❌ {error_msg}")
    raise RuntimeError(error_msg)


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
    system_prompt = """Você é o Arena Play Assistant, um especialista multifunção da plataforma Arena Play.

## SUAS 3 FUNÇÕES PRINCIPAIS:

### 1. COMENTARISTA DA PARTIDA ATUAL
Você SEMPRE deve comentar e analisar a partida que o usuário está visualizando no momento.
- Comente sobre o placar, gols, eventos importantes
- Analise taticamente os times
- Sugira insights sobre a performance dos jogadores
- Se o usuário perguntar algo genérico, relacione à partida atual

### 2. MENTOR DO SISTEMA ARENA PLAY
Você é um guia expert do sistema Arena Play. Ajude os usuários a:
- **Upload**: Explique como fazer upload de vídeos do 1º e 2º tempo
- **Transcrição**: Ensine sobre transcrição de áudio com ElevenLabs ou Whisper
- **Análise de IA**: Explique o sistema Dual AI (detecção GPT-4o + validação Gemini)
- **Timeline Editor**: Mostre como ajustar timestamps manualmente
- **Geração de Clips**: Ensine a gerar clips automáticos dos eventos
- **Mídia/Playlists**: Explique como criar compilações de highlights
- **Campo Tático**: Mostre o heatmap 3D e animações de jogadas
- **Áudio**: Podcasts, narrações e TTS das partidas
- **Live**: Análise em tempo real de transmissões ao vivo

### 3. ESPECIALISTA EM CAMPANHAS PARA REDES SOCIAIS
Você ajuda a criar conteúdo viral para redes sociais:
- **Instagram**: Reels de gols, Stories de bastidores, carrosséis de estatísticas
- **TikTok**: Cortes rápidos, trends de futebol, memes
- **X/Twitter**: Threads de análise, GIFs de jogadas, opiniões polêmicas
- **YouTube**: Shorts, compilações, análises táticas longas
- **Facebook**: Posts engajadores, lives, grupos de torcida
- **LinkedIn**: Conteúdo profissional sobre gestão esportiva
- **WhatsApp Business**: Mensagens para grupos de torcida

Sugira:
- Calendário de postagens ideal para cada rede
- Hashtags relevantes e trending
- Horários de maior engajamento
- Formatos de vídeo ideais (9:16, 16:9, 1:1)
- CTAs (Call-to-Action) eficazes
- Estratégias de crescimento orgânico

## TOM E ESTILO
- Seja amigável, entusiasmado e profissional
- Use linguagem natural em português brasileiro
- Seja proativo em sugerir ações e próximos passos
- Quando não souber algo, indique onde encontrar no sistema"""

    if match_context:
        home_team = match_context.get('homeTeam', 'Time da Casa')
        away_team = match_context.get('awayTeam', 'Time Visitante')
        home_score = match_context.get('homeScore', 0)
        away_score = match_context.get('awayScore', 0)
        competition = match_context.get('competition', 'não informada')
        status = match_context.get('status', 'não informado')
        
        system_prompt += f"""

## 🎯 PARTIDA ATUAL (FOCO PRINCIPAL)
**{home_team} {home_score} x {away_score} {away_team}**
- Competição: {competition}
- Status: {status}

IMPORTANTE: Sempre relacione suas respostas a esta partida quando possível.
Se o usuário perguntar sobre "o jogo", "a partida", "os gols", etc., refere-se a ESTA partida."""
    else:
        system_prompt += """

## ⚠️ NENHUMA PARTIDA SELECIONADA
O usuário não está visualizando uma partida específica.
Foque em ajudar como mentor do sistema ou consultor de campanhas."""

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
    Transcribe audio from base64 data using best available provider.
    
    Priority:
    1. Local Whisper (FREE, offline) - PRIORITÁRIO
    2. OpenAI Whisper API (paid) - Fallback
    
    Args:
        audio_base64: Base64-encoded audio data
        language: Language code
    
    Returns:
        Transcription text or None on error
    """
    import tempfile
    import subprocess
    
    # Decode base64 and save to temp file
    audio_data = base64.b64decode(audio_base64)
    
    with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as tmp:
        tmp.write(audio_data)
        tmp_path = tmp.name
    
    wav_path = None
    
    try:
        # Converter para WAV 16kHz mono (melhor compatibilidade com Whisper)
        wav_path = tmp_path.replace('.webm', '.wav')
        try:
            result = subprocess.run([
                'ffmpeg', '-y', '-i', tmp_path,
                '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
                wav_path
            ], capture_output=True, timeout=30)
            if result.returncode == 0:
                transcribe_path = wav_path
                print(f"[TranscribeBase64] ✓ Convertido para WAV 16kHz")
            else:
                transcribe_path = tmp_path
                print(f"[TranscribeBase64] ⚠ Falha na conversão WAV, usando original")
        except Exception as e:
            transcribe_path = tmp_path
            print(f"[TranscribeBase64] ⚠ ffmpeg não disponível: {e}")
        
        # PRIORIDADE 1: Local Whisper (GRATUITO, offline)
        if LOCAL_WHISPER_ENABLED and _FASTER_WHISPER_AVAILABLE:
            print(f"[TranscribeBase64] 🆓 Usando Local Whisper...")
            try:
                result = _transcribe_with_local_whisper(transcribe_path, match_id=None)
                if result.get('success') and result.get('text'):
                    text = result['text'].strip()
                    if text:
                        print(f"[TranscribeBase64] ✓ Local Whisper: {len(text)} chars")
                        return text
                    else:
                        print(f"[TranscribeBase64] Local Whisper retornou texto vazio")
                else:
                    print(f"[TranscribeBase64] Local Whisper falhou: {result.get('error', 'Unknown error')}")
            except Exception as e:
                print(f"[TranscribeBase64] Erro no Local Whisper: {e}")
        
        # PRIORIDADE 2: OpenAI Whisper (pago - fallback)
        if OPENAI_API_KEY:
            print(f"[TranscribeBase64] 💰 Tentando OpenAI Whisper (fallback)...")
            try:
                text = transcribe_audio(transcribe_path, language)
                if text:
                    print(f"[TranscribeBase64] ✓ OpenAI Whisper: {len(text)} chars")
                    return text
            except Exception as e:
                print(f"[TranscribeBase64] Erro no OpenAI: {e}")
        
        # Nenhum provedor disponível ou todos falharam
        if not LOCAL_WHISPER_ENABLED and not OPENAI_API_KEY:
            raise ValueError(
                "Nenhum provedor de transcrição disponível. "
                "Instale faster-whisper (gratuito) ou configure OPENAI_API_KEY."
            )
        
        print(f"[TranscribeBase64] ⚠ Todos os provedores falharam")
        return None
        
    finally:
        import os
        try:
            os.unlink(tmp_path)
        except:
            pass
        if wav_path:
            try:
                os.unlink(wav_path)
            except:
                pass


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
    
    Prioriza LOVABLE_API_KEY, mas usa GOOGLE_API_KEY como fallback.
    
    Args:
        prompt: Description for the image
        event_id: Related event ID
        match_id: Related match ID
    
    Returns:
        Dict with image data or error
    """
    use_lovable = bool(LOVABLE_API_KEY)
    use_google = bool(GOOGLE_API_KEY)
    
    if not use_lovable and not use_google:
        return {"error": "Nenhuma chave de API configurada (LOVABLE ou GOOGLE)"}
    
    image_prompt = f"Generate a high-quality thumbnail image: {prompt}. Style: sports, dynamic, vibrant colors."
    
    try:
        if use_lovable:
            # Usar Lovable AI Gateway
            response = requests.post(
                LOVABLE_API_URL,
                headers={
                    'Authorization': f'Bearer {LOVABLE_API_KEY}',
                    'Content-Type': 'application/json'
                },
                json={
                    'model': 'google/gemini-2.5-flash-image-preview',
                    'messages': [{'role': 'user', 'content': image_prompt}],
                    'modalities': ['image', 'text']
                },
                timeout=120
            )
            
            if not response.ok:
                if response.status_code == 429:
                    return {"error": "Rate limit exceeded"}
                if response.status_code == 402:
                    return {"error": "Insufficient credits"}
                return {"error": f"Lovable API error: {response.status_code}"}
            
            data = response.json()
            images = data.get('choices', [{}])[0].get('message', {}).get('images', [])
            if images:
                image_url = images[0].get('image_url', {}).get('url', '')
                return {
                    "success": True,
                    "imageData": image_url,
                    "eventId": event_id,
                    "matchId": match_id
                }
            return {"error": "No image generated from Lovable AI"}
        
        else:
            # Fallback: Usar Google Gemini API diretamente
            api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key={GOOGLE_API_KEY}"
            
            response = requests.post(
                api_url,
                headers={'Content-Type': 'application/json'},
                json={
                    'contents': [{'parts': [{'text': image_prompt}]}],
                    'generationConfig': {'responseModalities': ['TEXT', 'IMAGE']}
                },
                timeout=120
            )
            
            if not response.ok:
                error_text = response.text[:200] if response.text else "Unknown error"
                return {"error": f"Google API error: {response.status_code} - {error_text}"}
            
            data = response.json()
            
            # Extrair imagem do formato Google Gemini
            candidates = data.get('candidates', [])
            if candidates:
                parts = candidates[0].get('content', {}).get('parts', [])
                for part in parts:
                    if 'inlineData' in part:
                        mime_type = part['inlineData'].get('mimeType', 'image/png')
                        base64_data = part['inlineData'].get('data', '')
                        if base64_data:
                            image_url = f"data:{mime_type};base64,{base64_data}"
                            return {
                                "success": True,
                                "imageData": image_url,
                                "eventId": event_id,
                                "matchId": match_id
                            }
            
            return {"error": "No image generated from Google Gemini"}
    
    except requests.exceptions.Timeout:
        return {"error": "Timeout ao gerar imagem"}
    except Exception as e:
        return {"error": f"Erro ao gerar thumbnail: {str(e)}"}


def _transcribe_gemini_chunks(audio_path: str, tmpdir: str, match_id: str = None, max_chunk_size_mb: int = 18) -> Dict[str, Any]:
    """
    Transcribe large audio by splitting into chunks and using Gemini for each.
    
    Splits audio into ~18MB chunks (under Gemini's 20MB limit),
    transcribes each chunk, and combines the results.
    
    Args:
        audio_path: Path to the full audio file
        tmpdir: Temporary directory for chunk files
        match_id: Optional match ID
        max_chunk_size_mb: Max size per chunk in MB (default 18 to stay under 20MB limit)
    
    Returns:
        Dict with combined transcription
    """
    import subprocess
    
    audio_size_bytes = os.path.getsize(audio_path)
    audio_size_mb = audio_size_bytes / (1024 * 1024)
    
    # Calculate number of chunks needed
    num_chunks = int(audio_size_mb / max_chunk_size_mb) + 1
    
    # Get audio duration using ffprobe
    try:
        probe_cmd = ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', audio_path]
        probe_result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
        total_duration = float(probe_result.stdout.strip())
    except:
        # Estimate duration based on file size (~128kbps = 16KB/s)
        total_duration = audio_size_bytes / (16 * 1024)
    
    chunk_duration = total_duration / num_chunks
    print(f"[GeminiChunks] Dividindo {audio_size_mb:.1f}MB em {num_chunks} chunks de ~{chunk_duration:.0f}s cada")
    
    all_text = []
    all_srt = []
    srt_index = 1
    time_offset = 0
    successful_chunks = 0
    
    for i in range(num_chunks):
        start_time = i * chunk_duration
        chunk_path = os.path.join(tmpdir, f'chunk_{i}.mp3')
        
        # Extract chunk with ffmpeg
        try:
            cmd = [
                'ffmpeg', '-y', '-i', audio_path,
                '-ss', str(start_time),
                '-t', str(chunk_duration),
                '-acodec', 'libmp3lame', '-ab', '128k',
                chunk_path
            ]
            subprocess.run(cmd, capture_output=True, timeout=120)
            
            if not os.path.exists(chunk_path):
                print(f"[GeminiChunks] ⚠ Chunk {i+1} não foi criado")
                continue
                
            chunk_size_mb = os.path.getsize(chunk_path) / (1024 * 1024)
            print(f"[GeminiChunks] Chunk {i+1}/{num_chunks}: {chunk_size_mb:.1f}MB ({start_time:.0f}s-{start_time+chunk_duration:.0f}s)")
            
        except Exception as e:
            print(f"[GeminiChunks] ⚠ Erro ao extrair chunk {i+1}: {e}")
            continue
        
        # Transcribe chunk with Gemini
        try:
            chunk_result = _transcribe_with_gemini(chunk_path, match_id)
            
            if chunk_result.get('success') and chunk_result.get('text'):
                chunk_text = chunk_result['text']
                all_text.append(chunk_text)
                successful_chunks += 1
                
                # Add SRT entries with adjusted timestamps - split by words, not paragraphs
                all_words = chunk_text.split()
                segment_size = 10  # Words per subtitle line
                segments_in_chunk = max(1, len(all_words) // segment_size)
                time_per_segment = chunk_duration / segments_in_chunk
                
                for j in range(0, len(all_words), segment_size):
                    word_chunk = all_words[j:j + segment_size]
                    if not word_chunk:
                        continue
                    
                    segment_text = ' '.join(word_chunk)
                    seg_start = time_offset + ((j // segment_size) * time_per_segment)
                    seg_end = seg_start + time_per_segment
                    all_srt.append(f"{srt_index}\n{_format_srt_time(seg_start)} --> {_format_srt_time(seg_end)}\n{segment_text}\n")
                    srt_index += 1
                
                print(f"[GeminiChunks] ✓ Chunk {i+1} transcrito: {len(chunk_text)} chars")
            else:
                print(f"[GeminiChunks] ⚠ Chunk {i+1} falhou: {chunk_result.get('error', 'unknown')}")
                
        except Exception as e:
            print(f"[GeminiChunks] ⚠ Erro ao transcrever chunk {i+1}: {e}")
        
        time_offset += chunk_duration
        
        # Clean up chunk file
        try:
            os.remove(chunk_path)
        except:
            pass
    
    # Combine results
    if successful_chunks == 0:
        return {"error": "Nenhum chunk foi transcrito com sucesso", "success": False}
    
    combined_text = '\n\n'.join(all_text)
    combined_srt = '\n'.join(all_srt)
    
    print(f"[GeminiChunks] ✓ Transcrição completa: {successful_chunks}/{num_chunks} chunks, {len(combined_text)} chars")
    
    return {
        "success": True,
        "text": combined_text,
        "srtContent": combined_srt,
        "matchId": match_id,
        "provider": "gemini",
        "chunksProcessed": successful_chunks,
        "totalChunks": num_chunks
    }



def _get_audio_duration(audio_path: str) -> float:
    """Get audio duration in seconds using ffprobe."""
    try:
        probe_cmd = ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                     '-of', 'default=noprint_wrappers=1:nokey=1', audio_path]
        result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
        duration = float(result.stdout.strip())
        print(f"[AudioDuration] Duração real do áudio: {duration:.2f}s ({duration/60:.1f}min)")
        return duration
    except Exception as e:
        print(f"[AudioDuration] ⚠ Falha ao obter duração: {e}")
        return None


def _transcribe_with_gemini(audio_path: str, match_id: str = None, audio_duration: float = None) -> Dict[str, Any]:
    """
    Transcribe audio using Google Gemini via Lovable AI Gateway.
    
    Works for files up to ~20MB. Converts audio to base64 and sends
    to the Gemini model for transcription.
    
    Args:
        audio_path: Path to the audio file
        match_id: Optional match ID for reference
        audio_duration: Real audio duration in seconds (from ffprobe) for accurate SRT timing
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
        
        # Generate segmented SRT with real audio duration for accurate timing
        # Split text into smaller segments (~8-12 words each) for better readability
        srt_lines = []
        all_words = text.split()
        segment_size = 10  # Words per subtitle line (similar to ElevenLabs)
        total_words = len(all_words)
        
        # Use real audio duration if provided, otherwise estimate
        if audio_duration and audio_duration > 0:
            actual_duration = audio_duration
            print(f"[GeminiSRT] Usando duração real: {actual_duration:.2f}s")
        else:
            # Fallback: estimate based on speaking rate (150 words per minute)
            actual_duration = max(60, (total_words / 150) * 60)
            print(f"[GeminiSRT] ⚠ Usando duração estimada: {actual_duration:.2f}s (sem ffprobe)")
        
        segment_count = max(1, total_words // segment_size)
        time_per_segment = actual_duration / segment_count
        print(f"[GeminiSRT] {total_words} palavras / {segment_count} segmentos = {time_per_segment:.2f}s por segmento")
        
        srt_index = 1
        for i in range(0, total_words, segment_size):
            chunk_words = all_words[i:i + segment_size]
            if not chunk_words:
                continue
            
            chunk_text = ' '.join(chunk_words)
            start_sec = (i // segment_size) * time_per_segment
            end_sec = start_sec + time_per_segment
            
            start = _format_srt_time(start_sec)
            end = _format_srt_time(end_sec)
            srt_lines.append(f"{srt_index}\n{start} --> {end}\n{chunk_text}\n")
            srt_index += 1
        
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


def transcribe_large_video(
    video_url: str,
    match_id: str = None,
    max_chunk_size_mb: int = 20,
    half_type: str = None
) -> Dict[str, Any]:
    """
    Transcribe a large video file with multi-chunk support.
    
    For videos > 24MB, splits audio into chunks and transcribes each separately,
    then combines the results. This ensures complete transcription coverage.
    
    Automatically saves extracted audio and SRT to match storage folder.
    
    Args:
        video_url: URL to the video file (can be local /api/storage/ path or external URL)
        match_id: Related match ID
        max_chunk_size_mb: Maximum size per chunk in MB (default: 20MB)
        half_type: 'first' or 'second' to label saved files
    
    Returns:
        Dict with transcription and SRT content
    """
    import subprocess
    import tempfile
    import shutil
    import math
    from storage import get_file_path, STORAGE_DIR, save_file, get_match_storage_path
    
    # ===== PRIORIDADE: Google Gemini > Whisper Local =====
    gemini_available = bool(LOVABLE_API_KEY or GOOGLE_API_KEY)
    local_whisper_available = LOCAL_WHISPER_ENABLED and _FASTER_WHISPER_AVAILABLE
    
    if not gemini_available and not local_whisper_available:
        raise ValueError(
            "Nenhum provedor de transcrição configurado. "
            "Configure uma chave de API Google/Lovable em Configurações > APIs, "
            "ou instale faster-whisper para transcrição offline."
        )
    
    provider_info = "Google Gemini" if gemini_available else "Whisper Local"
    print(f"[Transcribe] 🎙️ MODO: {provider_info}")
    print(f"[Transcribe]   Vídeo: {video_url}")
    
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
        
        # ========== SAVE EXTRACTED AUDIO TO MATCH FOLDER ==========
        audio_saved_path = None
        if match_id:
            try:
                half_label = half_type or 'full'
                audio_filename = f"{half_label}_audio.mp3"
                with open(audio_path, 'rb') as af:
                    audio_data = af.read()
                # Ordem correta: (match_id, subfolder, file_data, filename)
                save_result = save_file(match_id, 'audio', audio_data, audio_filename)
                audio_saved_path = save_result.get('path')
                print(f"[Transcribe] ✓ Áudio salvo: {audio_saved_path} ({audio_size_mb:.2f} MB)")
            except Exception as save_err:
                import traceback
                print(f"[Transcribe] ⚠ Erro ao salvar áudio: {save_err}")
                traceback.print_exc()
        
        # ========== TRANSCRIPTION ==========
        transcription_result = None
        
        # ===== PROVEDOR 1: Google Gemini (via Lovable ou direto) =====
        if gemini_available:
            print(f"[Transcribe] 🌐 Usando Google Gemini para transcrição...")
            
            # Obter duração real do áudio para sincronização precisa do SRT
            real_audio_duration = _get_audio_duration(audio_path)
            
            # Gemini tem limite de 20MB por arquivo, então dividimos se necessário
            if audio_size_mb <= 20:
                # Arquivo pequeno: transcrever diretamente com duração real
                transcription_result = _transcribe_with_gemini(audio_path, match_id, real_audio_duration)
            else:
                # Arquivo grande: dividir em chunks e transcrever cada um
                print(f"[Transcribe] Áudio grande ({audio_size_mb:.1f}MB), dividindo em chunks...")
                transcription_result = _transcribe_gemini_chunks(audio_path, tmpdir, match_id, max_chunk_size_mb=18)
            
            if transcription_result.get('success'):
                print(f"[Transcribe] ✓ Google Gemini sucesso!")
            else:
                error_msg = transcription_result.get('error', 'Unknown error')
                print(f"[Transcribe] ⚠ Google Gemini falhou: {error_msg}")
                
                # Fallback para Whisper Local se disponível
                if local_whisper_available:
                    print(f"[Transcribe] 🔄 Fallback para Whisper Local...")
                    transcription_result = _transcribe_with_local_whisper(audio_path, match_id)
        
        # ===== PROVEDOR 2: Whisper Local (fallback) =====
        elif local_whisper_available:
            print(f"[Transcribe] 🆓 Usando Whisper Local (offline)...")
            transcription_result = _transcribe_with_local_whisper(audio_path, match_id)
        
        # Verificar resultado final
        if not transcription_result or not transcription_result.get('success'):
            error_msg = transcription_result.get('error', 'Nenhum provedor conseguiu transcrever') if transcription_result else 'Falha na transcrição'
            return {"error": error_msg, "success": False}
        
        # ========== SAVE SRT AND TXT TO MATCH FOLDER ==========
        if match_id and transcription_result.get('success'):
            half_label = half_type or 'full'
            
            # Save SRT file
            srt_content = transcription_result.get('srtContent', '')
            if srt_content:
                try:
                    srt_filename = f"{half_label}_transcription.srt"
                    # Ordem correta: (match_id, subfolder, file_data, filename)
                    srt_result = save_file(match_id, 'srt', srt_content.encode('utf-8'), srt_filename)
                    transcription_result['srtPath'] = srt_result.get('url', f"/api/storage/{match_id}/srt/{srt_filename}")
                    print(f"[Transcribe] ✓ SRT salvo: {srt_result.get('path')}")
                except Exception as srt_err:
                    import traceback
                    print(f"[Transcribe] ⚠ Erro ao salvar SRT: {srt_err}")
                    traceback.print_exc()
            
            # Save TXT file (plain text)
            text_content = transcription_result.get('text', '')
            if text_content:
                try:
                    txt_filename = f"{half_label}_transcription.txt"
                    # Ordem correta: (match_id, subfolder, file_data, filename)
                    txt_result = save_file(match_id, 'texts', text_content.encode('utf-8'), txt_filename)
                    transcription_result['txtPath'] = txt_result.get('url', f"/api/storage/{match_id}/texts/{txt_filename}")
                    print(f"[Transcribe] ✓ TXT salvo: {txt_result.get('path')}")
                except Exception as txt_err:
                    import traceback
                    print(f"[Transcribe] ⚠ Erro ao salvar TXT: {txt_err}")
                    traceback.print_exc()
            
            # Add audio path to result
            if audio_saved_path:
                transcription_result['audioPath'] = f"/api/storage/{match_id}/audio/{half_label}_audio.mp3"
        
        return transcription_result


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
    Transcribe large audio by splitting into chunks with resilient error handling.
    
    Splits the audio into ~20MB chunks, transcribes each separately,
    and combines the results maintaining proper timing.
    
    Resilient features:
    - Saves partial results if some chunks fail
    - Handles 401 (invalid key) and 429 (rate limit) errors gracefully
    - Returns partial transcription if at least 50% of chunks succeed
    """
    import subprocess
    import math
    import time
    from storage import save_file
    
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
    
    # Track chunk results for resilience
    chunk_results = []
    failed_chunks = []
    rate_limit_hit = False
    auth_error = False
    
    for i in range(num_chunks):
        if auth_error:
            # Stop if we hit authentication error (invalid key)
            print(f"[Transcribe] Parando devido a erro de autenticação")
            break
        
        if rate_limit_hit:
            # Wait before retrying after rate limit
            print(f"[Transcribe] Aguardando 30s devido a rate limit...")
            time.sleep(30)
            rate_limit_hit = False
        
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
            failed_chunks.append({'chunk': i, 'error': 'extraction_failed'})
            continue
        
        if not os.path.exists(chunk_path) or os.path.getsize(chunk_path) < 1000:
            print(f"[Transcribe] Chunk {i} muito pequeno ou inexistente, pulando...")
            failed_chunks.append({'chunk': i, 'error': 'too_small'})
            continue
        
        print(f"[Transcribe] Transcrevendo chunk {i+1}/{num_chunks} (início: {start_time:.1f}s)...")
        
        # Transcribe chunk with retry
        max_retries = 2
        for attempt in range(max_retries):
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
                
                # Handle specific error codes
                if response.status_code == 401:
                    error_msg = response.json().get('error', {}).get('message', 'Invalid API key')
                    print(f"[Transcribe] ❌ ERRO 401: {error_msg}")
                    auth_error = True
                    failed_chunks.append({'chunk': i, 'error': 'auth_401', 'message': error_msg})
                    break
                
                if response.status_code == 429:
                    print(f"[Transcribe] ⚠ Rate limit hit, aguardando...")
                    rate_limit_hit = True
                    if attempt < max_retries - 1:
                        time.sleep(10 * (attempt + 1))  # Exponential backoff
                        continue
                    failed_chunks.append({'chunk': i, 'error': 'rate_limit_429'})
                    break
                
                if not response.ok:
                    print(f"[Transcribe] Whisper error chunk {i}: {response.status_code}")
                    if attempt < max_retries - 1:
                        time.sleep(2)
                        continue
                    failed_chunks.append({'chunk': i, 'error': f'http_{response.status_code}'})
                    break
                
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
                
                # Save partial result to storage
                if match_id:
                    try:
                        partial_text = f"[Chunk {i+1}/{num_chunks}]\n{chunk_text}\n"
                        save_file(match_id, 'texts', partial_text.encode('utf-8'), f'chunk_{i:03d}.txt')
                    except Exception as save_err:
                        print(f"[Transcribe] Warning: Could not save partial: {save_err}")
                
                chunk_results.append({
                    'chunk': i,
                    'status': 'done',
                    'segments': len(chunk_segments),
                    'chars': len(chunk_text)
                })
                
                print(f"[Transcribe] ✓ Chunk {i+1}: {len(chunk_segments)} segmentos, {len(chunk_text)} chars")
                break  # Success, exit retry loop
                
            except requests.exceptions.Timeout:
                print(f"[Transcribe] Timeout no chunk {i}, tentativa {attempt+1}")
                if attempt < max_retries - 1:
                    time.sleep(5)
                    continue
                failed_chunks.append({'chunk': i, 'error': 'timeout'})
            except Exception as e:
                print(f"[Transcribe] Erro no chunk {i}: {e}")
                if attempt < max_retries - 1:
                    time.sleep(2)
                    continue
                failed_chunks.append({'chunk': i, 'error': str(e)})
        
        # Clean up chunk file
        try:
            os.remove(chunk_path)
        except:
            pass
    
    # Calculate success rate
    success_rate = len(chunk_results) / num_chunks if num_chunks > 0 else 0
    
    # Return appropriate response based on success rate
    if not all_text:
        error_msg = "Failed to transcribe any chunks"
        if auth_error:
            error_msg = "Chave OpenAI inválida ou sem permissão para transcrição de áudio. Verifique a chave em Configurações > API."
        return {
            "error": error_msg,
            "success": False,
            "failed_chunks": failed_chunks
        }
    
    combined_text = ' '.join(all_text)
    srt_content = '\n'.join(srt_lines)
    
    print(f"[Transcribe] Multi-chunk: {len(chunk_results)}/{num_chunks} chunks OK ({success_rate*100:.0f}%)")
    
    # If at least 50% succeeded, return as partial success
    is_partial = success_rate < 1.0
    
    result = {
        "success": True,
        "partial": is_partial,
        "text": combined_text,
        "srtContent": srt_content,
        "segments": all_segments,
        "matchId": match_id,
        "chunksProcessed": len(chunk_results),
        "totalChunks": num_chunks,
        "successRate": success_rate
    }
    
    if is_partial:
        result["warning"] = f"Transcrição parcial: {len(chunk_results)}/{num_chunks} partes processadas ({success_rate*100:.0f}%)"
        result["failed_chunks"] = failed_chunks
    
    return result


def _format_srt_time(seconds: float) -> str:
    """Format seconds to SRT timestamp format."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


# ═══════════════════════════════════════════════════════════════════════════
# VISUAL GOAL DETECTION WITH GEMINI VISION
# ═══════════════════════════════════════════════════════════════════════════

def extract_frames_for_analysis(video_path: str, center_second: float, window_seconds: int = 20, num_frames: int = 8) -> List[str]:
    """
    Extract frames around a timestamp for visual analysis.
    Returns list of base64-encoded JPEG images.
    
    Args:
        video_path: Path to video file
        center_second: Center timestamp in seconds
        window_seconds: Window around center (±seconds)
        num_frames: Number of frames to extract
    
    Returns:
        List of base64-encoded frame images
    """
    import subprocess
    import tempfile
    import os
    
    frames_base64 = []
    
    # Calculate frame timestamps spread across the window
    start_sec = max(0, center_second - window_seconds)
    end_sec = center_second + window_seconds
    step = (end_sec - start_sec) / (num_frames - 1) if num_frames > 1 else 0
    
    for i in range(num_frames):
        timestamp = start_sec + (step * i)
        
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
            tmp_path = tmp.name
        
        try:
            # Extract frame at timestamp
            cmd = [
                'ffmpeg', '-y', '-ss', str(timestamp),
                '-i', video_path,
                '-vframes', '1',
                '-q:v', '2',  # High quality
                '-vf', 'scale=640:-1',  # Resize for API limits
                tmp_path
            ]
            
            result = subprocess.run(cmd, capture_output=True, timeout=30)
            
            if result.returncode == 0 and os.path.exists(tmp_path):
                with open(tmp_path, 'rb') as f:
                    img_data = f.read()
                    if len(img_data) > 1000:  # Valid image
                        frames_base64.append(base64.b64encode(img_data).decode('utf-8'))
        except Exception as e:
            print(f"[FRAMES] Error extracting frame at {timestamp:.1f}s: {e}")
        finally:
            try:
                os.remove(tmp_path)
            except:
                pass
    
    print(f"[FRAMES] Extracted {len(frames_base64)} frames around {center_second:.1f}s")
    return frames_base64


def detect_goal_visual_cues(
    video_path: str, 
    estimated_second: float, 
    window_seconds: int = 30,  # Aumentado de 25 para 30 para maior cobertura
    home_team: str = None,
    away_team: str = None,
    num_frames: int = 12  # Aumentado de 10 para 12 para maior precisão
) -> Dict[str, Any]:
    """
    Use Gemini Vision to analyze frames and detect visual goal cues.
    
    This function extracts frames around the estimated goal timestamp
    and uses AI vision to find:
    - Ball entering the goal
    - Player celebrations
    - Replay being shown
    - Score updates on screen
    
    Args:
        video_path: Path to the video file
        estimated_second: Estimated timestamp of the goal (from narration)
        window_seconds: Window around the timestamp to search (±seconds)
        home_team: Name of home team (for context)
        away_team: Name of away team (for context)
    
    Returns:
        Dict with:
        - visual_confirmed: bool - Was a goal visually confirmed?
        - exact_second: float - Refined timestamp (if confirmed)
        - confidence: float - Confidence score (0-1)
        - celebration_second: float - When celebration starts (if detected)
        - details: str - Description of what was found
    """
    result = {
        'visual_confirmed': False,
        'exact_second': estimated_second,
        'confidence': 0.0,
        'celebration_second': None,
        'details': 'Visual analysis not performed'
    }
    
    if not os.path.exists(video_path):
        result['details'] = f'Video file not found: {video_path}'
        return result
    
    # Check if we have any Vision API available
    if not LOVABLE_API_KEY and not GOOGLE_API_KEY:
        result['details'] = 'No Vision API configured (need LOVABLE_API_KEY or GOOGLE_API_KEY)'
        return result
    
    print(f"[VISION] Analyzing goal at ~{estimated_second:.1f}s (window: ±{window_seconds}s, frames: {num_frames})")
    
    # Extract frames for analysis
    frames = extract_frames_for_analysis(
        video_path, 
        estimated_second, 
        window_seconds, 
        num_frames=num_frames
    )
    
    if len(frames) < 3:
        result['details'] = f'Could not extract enough frames ({len(frames)} < 3)'
        return result
    
    # Build prompt for Gemini Vision
    team_context = ""
    if home_team and away_team:
        team_context = f"Os times jogando são {home_team} (mandante) vs {away_team} (visitante). "
    
    system_prompt = f"""Você é um analista especializado em futebol que deve identificar o MOMENTO EXATO de um gol em imagens de vídeo.
{team_context}
Analise as imagens em sequência (estão em ordem cronológica) e identifique:

1. BOLA NA REDE: Procure o frame onde a bola está claramente dentro do gol
2. COMEMORAÇÃO: Jogadores correndo com braços levantados, abraços
3. REPLAY: Se a imagem mostra um replay (câmera lenta, ângulo diferente)
4. PLACAR: Se o placar na tela mudou

Retorne um JSON com:
{{
  "goal_detected": true/false,
  "frame_index": número do frame mais próximo do gol (0-{len(frames)-1}),
  "celebration_frame": número do frame onde começa comemoração (ou null),
  "confidence": 0.0 a 1.0,
  "details": "descrição do que você viu",
  "visual_cues": ["lista de pistas visuais encontradas"]
}}

IMPORTANTE: Responda APENAS com o JSON, sem markdown."""

    # Build messages with images
    content_parts = [{"type": "text", "text": system_prompt}]
    
    for i, frame_b64 in enumerate(frames):
        content_parts.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/jpeg;base64,{frame_b64}"
            }
        })
    
    try:
        # Try Lovable AI Gateway first (supports vision)
        if LOVABLE_API_KEY:
            response = requests.post(
                LOVABLE_API_URL,
                headers={
                    'Authorization': f'Bearer {LOVABLE_API_KEY}',
                    'Content-Type': 'application/json'
                },
                json={
                    'model': 'google/gemini-2.5-flash',  # Supports vision
                    'messages': [
                        {'role': 'user', 'content': content_parts}
                    ],
                    'temperature': 0.1,
                    'max_tokens': 1000
                },
                timeout=60
            )
            
            if response.ok:
                data = response.json()
                ai_response = data.get('choices', [{}])[0].get('message', {}).get('content', '')
                
                # Parse JSON response
                try:
                    # Clean up response if needed
                    ai_response = ai_response.strip()
                    if ai_response.startswith('```'):
                        ai_response = ai_response.split('```')[1]
                        if ai_response.startswith('json'):
                            ai_response = ai_response[4:]
                    
                    vision_result = json.loads(ai_response)
                    
                    # Calculate exact second based on frame index
                    frame_index = vision_result.get('frame_index', len(frames) // 2)
                    start_sec = max(0, estimated_second - window_seconds)
                    step = (2 * window_seconds) / (len(frames) - 1) if len(frames) > 1 else 0
                    calculated_second = start_sec + (step * frame_index)
                    
                    result['visual_confirmed'] = vision_result.get('goal_detected', False)
                    result['exact_second'] = calculated_second
                    result['confidence'] = vision_result.get('confidence', 0.0)
                    result['details'] = vision_result.get('details', 'Analysis complete')
                    
                    # Calculate celebration second if provided
                    celeb_frame = vision_result.get('celebration_frame')
                    if celeb_frame is not None:
                        result['celebration_second'] = start_sec + (step * celeb_frame)
                    
                    print(f"[VISION] ✓ Goal {'CONFIRMED' if result['visual_confirmed'] else 'NOT FOUND'} at {result['exact_second']:.1f}s (confidence: {result['confidence']:.0%})")
                    print(f"[VISION] Details: {result['details']}")
                    
                    return result
                    
                except json.JSONDecodeError as e:
                    print(f"[VISION] Could not parse AI response: {e}")
                    result['details'] = f'JSON parse error: {ai_response[:100]}'
            else:
                print(f"[VISION] Lovable AI error: {response.status_code}")
        
        # Fallback to Google Gemini direct if Lovable failed
        if GOOGLE_API_KEY and not result['visual_confirmed']:
            print("[VISION] Trying Google Gemini directly...")
            # Build Gemini-format request
            gemini_parts = [{"text": system_prompt}]
            for frame_b64 in frames:
                gemini_parts.append({
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": frame_b64
                    }
                })
            
            gemini_response = requests.post(
                f"{GOOGLE_API_URL}/models/gemini-2.0-flash:generateContent?key={GOOGLE_API_KEY}",
                json={
                    "contents": [{"parts": gemini_parts}],
                    "generationConfig": {"temperature": 0.1, "maxOutputTokens": 1000}
                },
                timeout=60
            )
            
            if gemini_response.ok:
                gemini_data = gemini_response.json()
                candidates = gemini_data.get('candidates', [])
                if candidates:
                    ai_text = candidates[0].get('content', {}).get('parts', [{}])[0].get('text', '')
                    try:
                        vision_result = json.loads(ai_text.strip())
                        frame_index = vision_result.get('frame_index', len(frames) // 2)
                        start_sec = max(0, estimated_second - window_seconds)
                        step = (2 * window_seconds) / (len(frames) - 1) if len(frames) > 1 else 0
                        
                        result['visual_confirmed'] = vision_result.get('goal_detected', False)
                        result['exact_second'] = start_sec + (step * frame_index)
                        result['confidence'] = vision_result.get('confidence', 0.0)
                        result['details'] = vision_result.get('details', 'Analysis complete')
                        
                        print(f"[VISION] ✓ (Gemini) Goal {'CONFIRMED' if result['visual_confirmed'] else 'NOT FOUND'}")
                    except:
                        pass
    
    except Exception as e:
        print(f"[VISION] Error during analysis: {e}")
        result['details'] = f'Error: {str(e)}'
    
    return result


def detect_goal_with_dual_analysis(
    video_path: str,
    transcription_timestamp: float,
    home_team: str = None,
    away_team: str = None,
    vision_window: int = 30  # Aumentado de 20 para 30 para maior cobertura
) -> Dict[str, Any]:
    """
    Detecta gol usando análise DUAL: texto (transcrição) + visão (frames).
    Compara os dois métodos e retorna o mais preciso.
    
    A ideia é que a transcrição dá uma estimativa inicial, mas o narrador
    SEMPRE descreve o gol DEPOIS que ele acontece (atraso de 4-10s).
    Usamos visão para refinar e encontrar o momento exato.
    
    ESTRATÉGIA: Janela ASSIMÉTRICA
    - 70% da janela ANTES do timestamp (onde o gol provavelmente aconteceu)
    - 30% da janela DEPOIS (para capturar replays/comemoração)
    
    Args:
        video_path: Caminho para o arquivo de vídeo
        transcription_timestamp: Timestamp da transcrição (em segundos no vídeo)
        home_team: Nome do time da casa (opcional, para contexto)
        away_team: Nome do time visitante (opcional, para contexto)
        vision_window: Janela de busca visual total em segundos
    
    Returns:
        Dict com:
        - text_timestamp: Timestamp original da transcrição
        - vision_timestamp: Timestamp refinado pela visão (ou None)
        - final_timestamp: Timestamp final escolhido
        - method_used: 'text' | 'vision' | 'combined'
        - confidence: 0.0 a 1.0
        - details: Descrição do resultado
    """
    result = {
        'text_timestamp': transcription_timestamp,
        'vision_timestamp': None,
        'final_timestamp': transcription_timestamp,
        'method_used': 'text',
        'confidence': 0.5,  # Confiança base para texto
        'details': 'Using transcription timestamp only'
    }
    
    if not video_path or not os.path.exists(video_path):
        result['details'] = f'Video not found: {video_path}'
        return result
    
    print(f"[DUAL] Starting dual analysis at text_ts={transcription_timestamp:.1f}s")
    
    # ESTRATÉGIA ASSIMÉTRICA: O gol acontece ANTES do narrador falar
    # 70% da janela ANTES do timestamp, 30% DEPOIS
    pre_window = int(vision_window * 0.7)   # Ex: 21s antes
    post_window = int(vision_window * 0.3)  # Ex: 9s depois
    
    # Centro de busca ajustado (deslocado para trás)
    # Se o narrador falou em T, o gol provavelmente foi em T - pre_window/2
    adjusted_center = transcription_timestamp - (pre_window / 3)  # Desloca 7s para trás
    adjusted_center = max(0, adjusted_center)
    
    print(f"[DUAL] Janela assimétrica: -{pre_window}s / +{post_window}s (centro ajustado: {adjusted_center:.1f}s)")
    
    # 1. ANÁLISE VISUAL: Buscar gol na janela ajustada
    vision_result = detect_goal_visual_cues(
        video_path,
        estimated_second=adjusted_center,  # Centro ajustado para antes
        window_seconds=max(pre_window, post_window),  # Usar maior janela
        home_team=home_team,
        away_team=away_team,
        num_frames=12  # Mais frames para precisão
    )
    
    if vision_result['visual_confirmed'] and vision_result['confidence'] >= 0.5:
        vision_ts = vision_result['exact_second']
        result['vision_timestamp'] = vision_ts
        
        # 2. COMPARAR os dois timestamps
        diff = abs(vision_ts - transcription_timestamp)
        
        print(f"[DUAL] Text: {transcription_timestamp:.1f}s | Vision: {vision_ts:.1f}s | Diff: {diff:.1f}s")
        
        if diff <= 3:
            # Ambos concordam (diferença ≤ 3s) → alta confiança, usar visão
            result['final_timestamp'] = vision_ts
            result['method_used'] = 'combined'
            result['confidence'] = min(0.95, vision_result['confidence'] + 0.2)
            result['details'] = f'✓ Texto e Visão concordam (diff: {diff:.1f}s). Usando visão.'
            print(f"[DUAL] ✓ COMBINED: {result['final_timestamp']:.1f}s (conf: {result['confidence']:.0%})")
            
        elif diff <= 10:
            # Diferença moderada → priorizar visão (narrador atrasou)
            result['final_timestamp'] = vision_ts
            result['method_used'] = 'vision'
            result['confidence'] = vision_result['confidence']
            result['details'] = f'⚡ Visão corrigiu texto por {diff:.1f}s (narrador atrasado).'
            print(f"[DUAL] ⚡ VISION: {result['final_timestamp']:.1f}s (corrigiu {diff:.1f}s)")
            
        else:
            # Diferença grande (>10s) → visão pode ter encontrado outro lance
            # Manter texto mas sinalizar
            result['final_timestamp'] = transcription_timestamp
            result['method_used'] = 'text'
            result['confidence'] = 0.4
            result['details'] = f'⚠ Divergência grande ({diff:.1f}s). Mantendo texto por segurança.'
            print(f"[DUAL] ⚠ DIVERGENT: keeping text. Vision at {vision_ts:.1f}s differs by {diff:.1f}s")
    else:
        # Visão não confirmou gol
        result['details'] = f'Visão não confirmou gol (conf: {vision_result["confidence"]:.0%}). Usando texto.'
        print(f"[DUAL] Vision did not confirm goal, using text timestamp")
    
    return result


def log_clip_analysis(
    match_id: str,
    event_type: str,
    description: str,
    text_ts: float,
    vision_ts: float,
    final_ts: float,
    method: str,
    confidence: float
):
    """
    Log estruturado para análise de precisão de clips.
    Salva em arquivo JSONL para análise posterior.
    """
    from datetime import datetime
    from pathlib import Path
    
    log_entry = {
        'timestamp': datetime.now().isoformat(),
        'match_id': match_id,
        'event_type': event_type,
        'description': description[:60] if description else '',
        'text_timestamp': text_ts,
        'vision_timestamp': vision_ts,
        'final_timestamp': final_ts,
        'method_used': method,
        'confidence': confidence,
        'diff': abs(vision_ts - text_ts) if vision_ts else 0
    }
    
    try:
        log_file = Path('logs') / 'clip_analysis.jsonl'
        log_file.parent.mkdir(exist_ok=True)
        with open(log_file, 'a') as f:
            f.write(json.dumps(log_entry) + '\n')
    except Exception as e:
        print(f"[LOG] Error writing clip analysis log: {e}")


# ═══════════════════════════════════════════════════════════════════════════
# VISION-ONLY EVENT DETECTION - Análise 100% Visual
# ═══════════════════════════════════════════════════════════════════════════

def analyze_video_events_vision_only(
    video_path: str,
    home_team: str = None,
    away_team: str = None,
    scan_interval_seconds: int = 30,
    frames_per_window: int = 6,
    target_event_types: List[str] = None
) -> Dict[str, Any]:
    """
    Analisa um vídeo EXCLUSIVAMENTE por visão para detectar eventos de futebol.
    
    Processo:
    1. Divide o vídeo em janelas de N segundos
    2. Extrai frames de cada janela
    3. Gemini Vision identifica eventos importantes em cada janela
    4. Para eventos detectados, faz segunda passada para timestamp preciso
    5. Retorna eventos com timestamps EXATOS (para clips de 30s centralizados)
    
    Args:
        video_path: Caminho para o arquivo de vídeo
        home_team: Nome do time mandante (para contexto)
        away_team: Nome do time visitante (para contexto)
        scan_interval_seconds: Intervalo entre janelas de análise (default: 30s)
        frames_per_window: Frames a extrair por janela (default: 6)
        target_event_types: Tipos de eventos a detectar (default: goal, card, penalty, save)
    
    Returns:
        Dict com:
        - success: bool
        - events: List[Dict] com eventos detectados
        - windows_analyzed: int
        - total_frames: int
        - error: str (se falhar)
    """
    import subprocess
    
    if not target_event_types:
        target_event_types = ['goal', 'red_card', 'yellow_card', 'penalty', 'save']
    
    result = {
        'success': False,
        'events': [],
        'windows_analyzed': 0,
        'total_frames': 0,
        'error': None
    }
    
    if not os.path.exists(video_path):
        result['error'] = f'Vídeo não encontrado: {video_path}'
        return result
    
    # Check API availability
    if not LOVABLE_API_KEY and not GOOGLE_API_KEY:
        result['error'] = 'Nenhuma API Vision configurada (LOVABLE_API_KEY ou GOOGLE_API_KEY)'
        return result
    
    # Get video duration
    try:
        probe_cmd = ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                     '-of', 'default=noprint_wrappers=1:nokey=1', video_path]
        probe_result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
        video_duration = float(probe_result.stdout.strip())
    except Exception as e:
        result['error'] = f'Não foi possível obter duração do vídeo: {e}'
        return result
    
    print(f"[VISION-ONLY] 🎬 Iniciando análise visual pura")
    print(f"[VISION-ONLY] Vídeo: {video_path}")
    print(f"[VISION-ONLY] Duração: {video_duration:.0f}s ({video_duration/60:.1f} min)")
    print(f"[VISION-ONLY] Intervalo: {scan_interval_seconds}s, Frames/janela: {frames_per_window}")
    
    num_windows = int(video_duration / scan_interval_seconds) + 1
    detected_events = []
    
    team_context = ""
    if home_team and away_team:
        team_context = f"Partida: {home_team} (casa) vs {away_team} (visitante). "
    
    # Prompt para detecção de eventos por visão
    detection_prompt = f"""Você é um analista de vídeo de futebol especializado em detectar EVENTOS IMPORTANTES visualmente.

{team_context}
Analise estas imagens consecutivas (em ordem cronológica) e identifique se algum destes eventos está acontecendo:

🔍 EVENTOS A DETECTAR:
- GOL: Bola entrando na rede, jogadores comemorando, replay de gol
- CARTÃO AMARELO: Árbitro mostrando cartão amarelo
- CARTÃO VERMELHO: Árbitro mostrando cartão vermelho  
- PÊNALTI: Jogador posicionado para cobrar pênalti
- DEFESA: Goleiro fazendo defesa espetacular

⚠️ IMPORTANTE:
- Identifique o ÍNDICE DO FRAME onde o evento ACONTECE (0 = primeiro frame)
- Ignore replays lentos - foque na ação ao vivo
- Para GOL: o momento que a bola CRUZA a linha do gol

Retorne APENAS JSON (sem markdown):
{{
  "events_detected": true/false,
  "events": [
    {{
      "event_type": "goal|yellow_card|red_card|penalty|save",
      "frame_index": 0-{frames_per_window-1},
      "confidence": 0.0-1.0,
      "description": "Breve descrição do evento",
      "team": "home|away|unknown"
    }}
  ]
}}

Se nenhum evento importante for detectado, retorne:
{{"events_detected": false, "events": []}}"""

    # Primeira passada: scan por janelas
    for window_idx in range(num_windows):
        window_start = window_idx * scan_interval_seconds
        window_end = min(window_start + scan_interval_seconds, video_duration)
        
        if window_end - window_start < 5:  # Janela muito pequena
            continue
        
        window_center = (window_start + window_end) / 2
        
        # Extrair frames da janela
        frames = extract_frames_for_analysis(
            video_path,
            center_second=window_center,
            window_seconds=int((window_end - window_start) / 2),
            num_frames=frames_per_window
        )
        
        if len(frames) < 2:
            continue
        
        result['total_frames'] += len(frames)
        result['windows_analyzed'] += 1
        
        # Analisar frames com Vision
        try:
            content_parts = [{"type": "text", "text": detection_prompt}]
            
            for i, frame_b64 in enumerate(frames):
                content_parts.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{frame_b64}"}
                })
            
            # Call Gemini Vision
            if LOVABLE_API_KEY:
                response = requests.post(
                    LOVABLE_API_URL,
                    headers={
                        'Authorization': f'Bearer {LOVABLE_API_KEY}',
                        'Content-Type': 'application/json'
                    },
                    json={
                        'model': 'google/gemini-2.5-flash',
                        'messages': [{'role': 'user', 'content': content_parts}],
                        'max_tokens': 1024
                    },
                    timeout=60
                )
                
                if response.ok:
                    data = response.json()
                    response_text = data.get('choices', [{}])[0].get('message', {}).get('content', '')
                else:
                    print(f"[VISION-ONLY] ⚠ API error janela {window_idx}: {response.status_code}")
                    continue
                    
            elif GOOGLE_API_KEY:
                parts = [{"text": detection_prompt}]
                for frame_b64 in frames:
                    parts.append({"inline_data": {"mime_type": "image/jpeg", "data": frame_b64}})
                
                response = requests.post(
                    f"{GOOGLE_API_URL}/models/gemini-2.0-flash:generateContent?key={GOOGLE_API_KEY}",
                    json={
                        'contents': [{'role': 'user', 'parts': parts}],
                        'generationConfig': {'maxOutputTokens': 1024}
                    },
                    timeout=60
                )
                
                if response.ok:
                    data = response.json()
                    candidates = data.get('candidates', [])
                    if candidates:
                        parts_resp = candidates[0].get('content', {}).get('parts', [])
                        response_text = parts_resp[0].get('text', '') if parts_resp else ''
                    else:
                        continue
                else:
                    print(f"[VISION-ONLY] ⚠ Google API error: {response.status_code}")
                    continue
            
            # Parse response
            try:
                json_start = response_text.find('{')
                json_end = response_text.rfind('}') + 1
                if json_start >= 0 and json_end > json_start:
                    parsed = json.loads(response_text[json_start:json_end])
                    
                    if parsed.get('events_detected') and parsed.get('events'):
                        for event in parsed['events']:
                            if event.get('event_type') not in target_event_types:
                                continue
                            if event.get('confidence', 0) < 0.5:
                                continue
                            
                            # Calcular timestamp exato do evento
                            frame_idx = event.get('frame_index', 0)
                            frame_interval = (window_end - window_start) / max(1, len(frames) - 1)
                            event_timestamp = window_start + (frame_idx * frame_interval)
                            
                            print(f"[VISION-ONLY] ⚽ EVENTO: {event.get('event_type')} @ {event_timestamp:.1f}s (janela {window_idx})")
                            
                            detected_events.append({
                                'event_type': event.get('event_type'),
                                'timestamp_seconds': event_timestamp,
                                'minute': int(event_timestamp / 60),
                                'second': int(event_timestamp % 60),
                                'confidence': event.get('confidence', 0.6),
                                'description': event.get('description', ''),
                                'team': event.get('team', 'unknown'),
                                'detection_method': 'vision_only',
                                'window_index': window_idx
                            })
                            
            except json.JSONDecodeError:
                print(f"[VISION-ONLY] ⚠ JSON parse error janela {window_idx}")
                
        except Exception as e:
            print(f"[VISION-ONLY] ⚠ Erro analisando janela {window_idx}: {e}")
        
        # Progress log
        if (window_idx + 1) % 5 == 0:
            print(f"[VISION-ONLY] Progresso: {window_idx + 1}/{num_windows} janelas analisadas")
    
    # Segunda passada: refinar timestamps para eventos de alta importância
    refined_events = []
    for event in detected_events:
        if event['event_type'] in ['goal', 'penalty'] and event['confidence'] >= 0.6:
            print(f"[VISION-ONLY] 🔍 Refinando timestamp de {event['event_type']} @ {event['timestamp_seconds']:.1f}s")
            
            # Análise mais detalhada com mais frames
            refined = detect_goal_visual_cues(
                video_path,
                estimated_second=event['timestamp_seconds'],
                window_seconds=15,  # Janela menor para precisão
                home_team=home_team,
                away_team=away_team,
                num_frames=12
            )
            
            if refined['visual_confirmed'] and refined['confidence'] > event['confidence']:
                old_ts = event['timestamp_seconds']
                event['timestamp_seconds'] = refined['exact_second']
                event['minute'] = int(refined['exact_second'] / 60)
                event['second'] = int(refined['exact_second'] % 60)
                event['confidence'] = refined['confidence']
                event['refined'] = True
                print(f"[VISION-ONLY] ✓ Timestamp refinado: {old_ts:.1f}s → {refined['exact_second']:.1f}s")
        
        refined_events.append(event)
    
    # Deduplicar eventos muito próximos
    deduplicated = []
    for event in sorted(refined_events, key=lambda e: e['timestamp_seconds']):
        is_duplicate = False
        for existing in deduplicated:
            if existing['event_type'] == event['event_type']:
                diff = abs(event['timestamp_seconds'] - existing['timestamp_seconds'])
                if diff < 30:  # Mesmo tipo dentro de 30s = duplicata
                    is_duplicate = True
                    # Manter o de maior confiança
                    if event['confidence'] > existing['confidence']:
                        deduplicated.remove(existing)
                        deduplicated.append(event)
                    break
        if not is_duplicate:
            deduplicated.append(event)
    
    result['success'] = True
    result['events'] = deduplicated
    
    print(f"[VISION-ONLY] ✅ Análise completa: {len(deduplicated)} eventos detectados em {result['windows_analyzed']} janelas")
    
    return result


def vision_events_to_match_format(
    vision_events: List[Dict],
    match_id: str = None,
    half_type: str = 'first',
    segment_start_minute: int = 0
) -> List[Dict]:
    """
    Converte eventos do formato vision_only para o formato esperado pelo match analysis.
    
    Args:
        vision_events: Lista de eventos do analyze_video_events_vision_only
        match_id: ID da partida
        half_type: 'first' ou 'second'
        segment_start_minute: Minuto de início do segmento (0 ou 45)
    
    Returns:
        Lista de eventos no formato do analyze_match_events
    """
    formatted = []
    
    for event in vision_events:
        # Ajustar minuto baseado no tempo
        raw_minute = event.get('minute', 0)
        adjusted_minute = raw_minute + segment_start_minute
        
        formatted.append({
            'event_type': event.get('event_type', 'unknown'),
            'minute': adjusted_minute,
            'second': event.get('second', 0),
            'description': event.get('description', ''),
            'team': event.get('team', 'unknown'),
            'is_highlight': event.get('event_type') in ['goal', 'penalty', 'red_card'],
            'isOwnGoal': False,
            'player': None,
            'metadata': {
                'detection_method': 'vision_only',
                'confidence': event.get('confidence', 0),
                'videoSecond': event.get('timestamp_seconds', 0),
                'refined': event.get('refined', False)
            }
        })
    
    return formatted
