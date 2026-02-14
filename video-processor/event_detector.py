"""
Event Detector - Framework genérico e extensível para detecção de eventos
em transcrições de partidas de futebol usando janela deslizante + pré-filtro local.

Baseado no pipeline comprovado do script analisar_kakttus2_funcionou.py,
expandido para suportar múltiplos tipos de eventos além de gols.
"""

import re
import json
import requests
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass, field


# ═══════════════════════════════════════════════════════════════════════════
# STOP PLAYERS - Palavras comuns que NÃO são nomes de jogadores
# ═══════════════════════════════════════════════════════════════════════════

STOP_PLAYERS = {
    "nós", "nos", "eles", "elas", "ele", "ela", "eu", "tu", "você", "vocês",
    "a", "o", "os", "as", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das",
    "em", "no", "na", "nos", "nas", "pra", "para", "por", "com", "sem", "que", "e",
    "vai", "foi", "é", "tá", "ta", "está", "estao", "estão", "tô", "to", "aqui", "ali",
    "agora", "muito", "pouco", "mais", "menos", "também", "tb", "sim", "não", "nao",
    "brasil", "argentina", "gol", "gooool", "gool", "golaço", "seleção",
    "primeiro", "tempo", "segundo", "jogo", "partida", "juiz", "arbitro", "árbitro",
    "cartão", "amarelo", "vermelho", "falta", "pênalti", "escanteio", "impedimento",
    "chute", "defesa", "goleiro", "jogador", "lateral", "trave", "rede",
}


# ═══════════════════════════════════════════════════════════════════════════
# EVENT RECIPE - Receita de detecção para cada tipo de evento
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class EventRecipe:
    """Receita de detecção para um tipo de evento."""
    event_type: str
    primary_patterns: List[str]       # Indicadores fortes (peso 2)
    secondary_patterns: List[str]     # Indicadores fracos (peso 1)
    confirmation_patterns: List[str] = field(default_factory=list)  # Contexto adicional
    window_size: int = 8              # Linhas na janela deslizante
    min_evidence_lines: int = 2       # Mínimo de linhas com evidência
    team_extraction: bool = True      # Extrair time envolvido?
    player_extraction: bool = True    # Extrair jogador?
    apply_stopwords_filter: bool = True  # Filtrar nomes por stopwords?
    validation_rule: str = 'none'     # 'consistency' (placar) ou 'none'


# ═══════════════════════════════════════════════════════════════════════════
# RECIPES REGISTRY - Catálogo de receitas para cada tipo de evento
# ═══════════════════════════════════════════════════════════════════════════

RECIPES: Dict[str, EventRecipe] = {
    'goal': EventRecipe(
        event_type='goal',
        primary_patterns=[
            r'\bg+o+l+\b', r'\bgolaço\b', r'é\s+gol', r'marcou',
            r'balançou\s+a\s+rede', r'guardou', r'fez\s+o\s+gol',
        ],
        secondary_patterns=[
            r'pra\s+dentro', r'entrou', r'bola\s+na\s+rede',
            r'bateu\s+pro\s+gol', r'tá\s+lá', r'ta\s+la',
            r'\bfez\b', r'chutou\s+pro\s+gol',
        ],
        confirmation_patterns=[
            r'rede', r'celebra', r'abraço', r'comemora',
        ],
        window_size=8,
        min_evidence_lines=2,
        team_extraction=True,
        player_extraction=True,
        apply_stopwords_filter=True,
        validation_rule='consistency',
    ),

    'yellow_card': EventRecipe(
        event_type='yellow_card',
        primary_patterns=[
            r'cartão\s+amarelo', r'amarelo\s+para', r'amarelo\s+pro',
            r'recebe\s+o\s+amarelo', r'leva\s+amarelo',
        ],
        secondary_patterns=[
            r'segunda\s+amarela', r'cartão\s+pra', r'mostrou\s+o\s+amarelo',
            r'advertido', r'advertência',
        ],
        confirmation_patterns=[
            r'próximo\s+jogo', r'suspenso', r'protesta',
        ],
        window_size=6,
        min_evidence_lines=1,
        team_extraction=True,
        player_extraction=True,
        apply_stopwords_filter=False,
        validation_rule='none',
    ),

    'red_card': EventRecipe(
        event_type='red_card',
        primary_patterns=[
            r'cartão\s+vermelho', r'expuls[ãa]o', r'foi\s+expulso',
            r'vermelho\s+para', r'vermelho\s+pro', r'vermelho\s+direto',
        ],
        secondary_patterns=[
            r'direto\s+ao\s+chuveiro', r'deu\s+as\s+costas',
            r'mostrou\s+o\s+vermelho', r'saiu\s+de\s+campo',
        ],
        confirmation_patterns=[
            r'com\s+um\s+a\s+menos', r'ficou\s+com\s+\d+',
        ],
        window_size=6,
        min_evidence_lines=1,
        team_extraction=True,
        player_extraction=True,
        apply_stopwords_filter=False,
        validation_rule='none',
    ),

    'penalty': EventRecipe(
        event_type='penalty',
        primary_patterns=[
            r'p[êe]nalti', r'penalidade\s+máxima', r'penalty',
            r'marca\s+o\s+p[êe]nalti', r'marcou\s+p[êe]nalti',
        ],
        secondary_patterns=[
            r'vai\s+cobrar', r'bola\s+na\s+marca', r'marca\s+do\s+cal',
            r'cobran[çc]a\s+de\s+p[êe]nalti',
        ],
        confirmation_patterns=[
            r'goleiro\s+recua', r'bateu\s+o\s+p[êe]nalti',
            r'converteu', r'desperdi[çc]ou',
        ],
        window_size=6,
        min_evidence_lines=1,
        team_extraction=True,
        player_extraction=True,
        apply_stopwords_filter=False,
        validation_rule='none',
    ),

    'corner': EventRecipe(
        event_type='corner',
        primary_patterns=[
            r'escanteio', r'córner', r'corner',
            r'bate\s+o\s+escanteio', r'cobra\s+o\s+escanteio',
        ],
        secondary_patterns=[
            r'cobran[çc]a\s+de\s+escanteio', r'pelo\s+alto',
        ],
        confirmation_patterns=[
            r'na\s+área', r'cabe[çc]ada', r'afastou',
        ],
        window_size=5,
        min_evidence_lines=1,
        team_extraction=True,
        player_extraction=False,
        apply_stopwords_filter=False,
        validation_rule='none',
    ),

    'foul': EventRecipe(
        event_type='foul',
        primary_patterns=[
            r'falta\s+de', r'falta\s+para', r'falta\s+pro',
            r'cometeu\s+falta', r'falta\s+sobre',
        ],
        secondary_patterns=[
            r'falta\s+dura', r'falta\s+perigosa', r'falta\s+forte',
            r'entrada\s+dura', r'lance\s+perigoso',
        ],
        confirmation_patterns=[
            r'cartão', r'protesta', r'reclamou',
        ],
        window_size=5,
        min_evidence_lines=1,
        team_extraction=True,
        player_extraction=True,
        apply_stopwords_filter=False,
        validation_rule='none',
    ),

    'shot': EventRecipe(
        event_type='shot',
        primary_patterns=[
            r'chutou', r'finalizou', r'finaliza[çc][ãa]o',
            r'batida', r'arriscou',
        ],
        secondary_patterns=[
            r'chute', r'tiro', r'pancada', r'bomba',
        ],
        confirmation_patterns=[
            r'defesa', r'na\s+trave', r'fora', r'por\s+cima',
            r'pra\s+fora', r'passou\s+raspando',
        ],
        window_size=4,
        min_evidence_lines=1,
        team_extraction=True,
        player_extraction=True,
        apply_stopwords_filter=False,
        validation_rule='none',
    ),

    'offside': EventRecipe(
        event_type='offside',
        primary_patterns=[
            r'impedimento', r'impedido', r'offside',
            r'posi[çc][ãa]o\s+irregular',
        ],
        secondary_patterns=[
            r'bandeira\s+levantada', r'bandeirinha',
        ],
        confirmation_patterns=[
            r'estava\s+na\s+frente', r'adiantado',
        ],
        window_size=4,
        min_evidence_lines=1,
        team_extraction=True,
        player_extraction=True,
        apply_stopwords_filter=False,
        validation_rule='none',
    ),

    'free_kick': EventRecipe(
        event_type='free_kick',
        primary_patterns=[
            r'falta\s+cobrada', r'cobran[çc]a\s+de\s+falta',
            r'bate\s+a\s+falta', r'cobra\s+a\s+falta',
        ],
        secondary_patterns=[
            r'falta\s+perigosa', r'falta\s+frontal',
            r'na\s+barreira', r'por\s+cima\s+da\s+barreira',
        ],
        confirmation_patterns=[
            r'barreira', r'goleiro', r'defesa',
        ],
        window_size=5,
        min_evidence_lines=1,
        team_extraction=True,
        player_extraction=True,
        apply_stopwords_filter=False,
        validation_rule='none',
    ),

    'substitution': EventRecipe(
        event_type='substitution',
        primary_patterns=[
            r'substitui[çc][ãa]o', r'sai\s+\w+\s+entra', r'entra\s+\w+\s+sai',
        ],
        secondary_patterns=[
            r'troca', r'mudança', r'altera[çc][ãa]o',
        ],
        confirmation_patterns=[
            r'técnico', r'banco', r'mexeu',
        ],
        window_size=5,
        min_evidence_lines=1,
        team_extraction=True,
        player_extraction=True,
        apply_stopwords_filter=False,
        validation_rule='none',
    ),
}


# ═══════════════════════════════════════════════════════════════════════════
# FUNÇÕES AUXILIARES - detect_team e detect_player (do script original)
# ═══════════════════════════════════════════════════════════════════════════

def normalize(s: str) -> str:
    """Normaliza string para comparação."""
    return (s or "").strip().lower()


def detect_team(chunk: List[str], home: str, away: str) -> str:
    """
    Detecta qual time é mencionado no chunk.
    Retorna 'home', 'away' ou 'unknown'.
    """
    joined = normalize(" ".join(chunk))
    home_ok = normalize(home) in joined if home else False
    away_ok = normalize(away) in joined if away else False
    if home_ok and not away_ok:
        return "home"
    if away_ok and not home_ok:
        return "away"
    return "unknown"


def detect_player(chunk: List[str], apply_stopwords: bool = True) -> Optional[str]:
    """
    Detecta nome de jogador no chunk usando regex de nomes capitalizados.
    Filtra por STOP_PLAYERS se apply_stopwords=True.
    """
    text = " ".join(chunk)
    name_re = re.compile(
        r"\b([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+){0,2})\b"
    )

    for m in name_re.finditer(text):
        cand = m.group(1).strip()
        cl = normalize(cand)

        if not cand or len(cand) < 3:
            continue
        if apply_stopwords and cl in STOP_PLAYERS:
            continue
        # Rejeita palavras muito comuns
        if cl in {"nós", "nos", "eles", "elas", "aqui", "agora"}:
            continue
        return cand

    return None


# ═══════════════════════════════════════════════════════════════════════════
# FIND EVENT CANDIDATES - Pré-filtro local por janela deslizante
# ═══════════════════════════════════════════════════════════════════════════

def find_event_candidates(
    transcript_lines: List[str],
    recipe: EventRecipe,
    home_team: str,
    away_team: str,
) -> List[Dict[str, Any]]:
    """
    Retorna lista de candidatos para um tipo de evento usando a receita.
    Cada candidato tem: start_line, end_line, evidence_count, team_hint, player_hint, snippet.
    """
    if not transcript_lines or len(transcript_lines) < recipe.window_size:
        return []

    # Compilar todos os patterns
    all_primary = [re.compile(p, re.IGNORECASE) for p in recipe.primary_patterns]
    all_secondary = [re.compile(p, re.IGNORECASE) for p in recipe.secondary_patterns]
    all_patterns = all_primary + all_secondary

    candidates: List[Dict[str, Any]] = []

    for i in range(len(transcript_lines)):
        line = transcript_lines[i]

        # Contar hits: primary vale 2, secondary vale 1
        hits = 0
        matched = []
        for p in all_primary:
            if p.search(line):
                hits += 2
                matched.append(p.pattern)
        for p in all_secondary:
            if p.search(line):
                hits += 1
                matched.append(p.pattern)

        if hits == 0:
            continue

        # Extrair janela deslizante centrada na linha
        half_w = recipe.window_size // 2
        start = max(0, i - half_w)
        end = min(len(transcript_lines), i + half_w + 1)
        chunk = transcript_lines[start:end]

        # Verificar mínimo de linhas com evidência na janela
        evidence_count = sum(
            1 for ln in chunk
            if any(p.search(ln) for p in all_patterns)
        )

        if evidence_count < recipe.min_evidence_lines:
            continue

        team_hint = detect_team(chunk, home_team, away_team) if recipe.team_extraction else None
        player_hint = detect_player(chunk, recipe.apply_stopwords_filter) if recipe.player_extraction else None

        window_text = "\n".join(chunk)

        candidates.append({
            'event_type': recipe.event_type,
            'start_line': start,
            'end_line': end - 1,
            'line_index': i,
            'evidence_count': evidence_count,
            'matched_patterns': matched,
            'team_hint': team_hint or 'unknown',
            'player_hint': player_hint or '',
            'text': window_text,
            'snippet': window_text[:200],
        })

    # Compactar candidatos próximos (evitar duplicatas do mesmo evento)
    compact: List[Dict[str, Any]] = []
    last_end = -999
    for c in sorted(candidates, key=lambda x: (-x['evidence_count'], x['start_line'])):
        if c['start_line'] <= last_end:
            continue
        compact.append(c)
        last_end = c['end_line']

    # Ordenar por posição no texto e limitar
    compact = sorted(compact, key=lambda x: x['start_line'])[:12]
    return compact


# ═══════════════════════════════════════════════════════════════════════════
# FIND ALL CANDIDATES - Executa todas as receitas de uma vez
# ═══════════════════════════════════════════════════════════════════════════

def find_all_candidates(
    transcript: str,
    home_team: str,
    away_team: str,
    event_types: Optional[List[str]] = None,
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Executa pré-filtro para TODOS os tipos de evento (ou apenas os especificados).
    
    Args:
        transcript: Texto da transcrição (pode ter múltiplas linhas)
        home_team: Nome do time da casa
        away_team: Nome do time visitante
        event_types: Lista de tipos a detectar (None = todos)
    
    Returns:
        Dict mapeando event_type → lista de candidatos
    """
    lines = [ln.strip() for ln in (transcript or "").splitlines() if ln.strip()]
    
    if not lines:
        return {}

    candidates_by_type: Dict[str, List[Dict[str, Any]]] = {}
    recipes_to_use = RECIPES

    if event_types:
        recipes_to_use = {k: v for k, v in RECIPES.items() if k in event_types}

    for event_type, recipe in recipes_to_use.items():
        candidates = find_event_candidates(lines, recipe, home_team, away_team)
        if candidates:
            candidates_by_type[event_type] = candidates
            print(f"[EventDetector] {event_type}: {len(candidates)} candidatos encontrados")

    total = sum(len(v) for v in candidates_by_type.values())
    print(f"[EventDetector] Total: {total} candidatos em {len(candidates_by_type)} tipos")

    return candidates_by_type


# ═══════════════════════════════════════════════════════════════════════════
# BUILD MULTITYPE PROMPT - Prompt unificado para todos os tipos
# ═══════════════════════════════════════════════════════════════════════════

def build_multitype_prompt(
    candidates_by_type: Dict[str, List[Dict[str, Any]]],
    home_team: str,
    away_team: str,
) -> Tuple[str, str]:
    """
    Constrói um único prompt que analisa TODOS os tipos de eventos simultaneamente.
    
    Retorna: (system_prompt, user_prompt)
    """
    system_prompt = (
        "Você é a IA Kakttus, especialista em futebol brasileiro. "
        "Analise os trechos de transcrição fornecidos e valide cada candidato a evento. "
        "Responda somente com JSON válido. Não use markdown. Não escreva texto fora do JSON. "
        "Não invente detalhes que não estejam nos trechos."
    )

    if not candidates_by_type:
        user_prompt = f"""
Times:
home = {home_team}
away = {away_team}

Não encontrei trechos candidatos com evidência suficiente.
Retorne somente JSON:

{{
  "events": [],
  "summary": "não foi possível detectar eventos com confiança",
  "tactical": ""
}}
""".strip()
        return system_prompt, user_prompt

    # Construir blocos por tipo de evento
    blocks = []
    blocks.append(f"Times:\nhome = {home_team}\naway = {away_team}\n")

    for event_type, candidates in candidates_by_type.items():
        blocks.append(f"\n=== [{event_type.upper()}] ({len(candidates)} candidatos) ===")
        for idx, c in enumerate(candidates, 1):
            blocks.append(
                f"\nCandidato {idx}:\n"
                f"team_hint = {c['team_hint']}\n"
                f"player_hint = {c['player_hint'] or 'desconhecido'}\n"
                f"{c['text']}\n"
            )

    joined = "\n".join(blocks)

    user_prompt = f"""
{joined}

Retorne JSON no formato:

{{
  "events": [
    {{
      "event_type": "goal" ou "yellow_card" ou "red_card" ou "penalty" ou "corner" ou "foul" ou "shot" ou "offside" ou "free_kick" ou "substitution" ou "other",
      "team": "home" ou "away" ou "unknown",
      "detail": "descrição curta baseada no trecho",
      "confidence": número entre 0 e 1,
      "player": "nome do jogador ou null"
    }}
  ],
  "summary": "resumo sem inventar placar além do que os trechos suportam",
  "tactical": "análise tática resumida"
}}

Regras:
- Só crie evento quando o trecho indicar de forma clara
- Se não estiver claro, use event_type "other" ou ignore
- Use team_hint e player_hint como pistas, mas não chute se não houver evidência
- Confidence 1 somente com evidência forte no texto
- Não invente fatos que não estejam nos trechos
""".strip()

    return system_prompt, user_prompt


# ═══════════════════════════════════════════════════════════════════════════
# ANALYZE WITH KAKTTUS MULTITYPE - Chamada unificada ao Ollama
# ═══════════════════════════════════════════════════════════════════════════

def analyze_multitype_with_ollama(
    candidates_by_type: Dict[str, List[Dict[str, Any]]],
    home_team: str,
    away_team: str,
    ollama_url: str = "http://127.0.0.1:11434",
    model: str = "washingtonlima/kakttus",
    timeout: int = 300,
) -> Dict[str, Any]:
    """
    Chama Ollama/Kakttus com todos os candidatos de todos os tipos.
    Retorna dict com 'events', 'summary', 'tactical'.
    """
    system_prompt, user_prompt = build_multitype_prompt(
        candidates_by_type, home_team, away_team
    )

    print(f"[EventDetector] Enviando {sum(len(v) for v in candidates_by_type.values())} candidatos ao Ollama ({model})...")
    print(f"[EventDetector] Prompt size: {len(user_prompt)} chars")

    try:
        response = requests.post(
            f"{ollama_url}/api/chat",
            json={
                'model': model,
                'messages': [
                    {'role': 'system', 'content': system_prompt},
                    {'role': 'user', 'content': user_prompt},
                ],
                'stream': False,
            },
            timeout=timeout,
        )

        if response.status_code != 200:
            print(f"[EventDetector] ❌ Ollama retornou status {response.status_code}")
            return {"events": [], "summary": "", "tactical": ""}

        raw = (response.json().get("message") or {}).get("content", "").strip()

        if not raw:
            print(f"[EventDetector] ⚠ Resposta vazia do Ollama")
            return {"events": [], "summary": "", "tactical": ""}

        print(f"[EventDetector] Resposta: {len(raw)} chars")
        print(f"[EventDetector] Primeiros 300 chars: {raw[:300]}")

        # Extrair JSON da resposta
        result = _extract_json(raw)

        if result is None:
            # Retry: pedir conversão para JSON
            print(f"[EventDetector] ⚠ JSON não encontrado, tentando retry...")
            result = _retry_json_extraction(raw, ollama_url, model)

        if result:
            events = result.get('events', [])
            print(f"[EventDetector] ✓ {len(events)} eventos extraídos")
            return result

        print(f"[EventDetector] ❌ Falha ao extrair JSON após retry")
        return {"events": [], "summary": "", "tactical": ""}

    except requests.exceptions.Timeout:
        print(f"[EventDetector] ❌ Timeout ({timeout}s) ao chamar Ollama")
        return {"events": [], "summary": "", "tactical": ""}
    except Exception as e:
        print(f"[EventDetector] ❌ Erro: {e}")
        return {"events": [], "summary": "", "tactical": ""}


def _extract_json(txt: str) -> Optional[Dict]:
    """Extrai JSON de uma resposta de texto."""
    if not txt:
        return None

    # Tentar blocos ```json ... ```
    m = re.search(r"```json\s*(\{.*?\})\s*```", txt, flags=re.DOTALL | re.IGNORECASE)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass

    # Tentar blocos ``` ... ```
    m = re.search(r"```\s*(\{.*?\})\s*```", txt, flags=re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass

    # Tentar JSON direto
    m = re.search(r"\{.*\}", txt, flags=re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def _retry_json_extraction(
    raw_text: str,
    ollama_url: str,
    model: str,
) -> Optional[Dict]:
    """Tenta converter resposta não-JSON em JSON pedindo ao Ollama."""
    system = (
        "Transforme o conteúdo abaixo em um JSON válido no formato pedido. "
        "Responda somente com JSON e nada fora."
    )
    user = f"""
Converta para JSON no formato:

{{
  "events": [
    {{
      "event_type": "goal" ou "yellow_card" ou "red_card" ou "penalty" ou "other",
      "team": "home" ou "away" ou "unknown",
      "detail": "descrição curta",
      "confidence": número entre 0 e 1,
      "player": "nome ou null"
    }}
  ],
  "summary": "resumo",
  "tactical": "análise tática"
}}

Conteúdo:
{raw_text[:3000]}
""".strip()

    try:
        response = requests.post(
            f"{ollama_url}/api/chat",
            json={
                'model': model,
                'messages': [
                    {'role': 'system', 'content': system},
                    {'role': 'user', 'content': user},
                ],
                'stream': False,
            },
            timeout=120,
        )
        if response.status_code == 200:
            raw2 = (response.json().get("message") or {}).get("content", "").strip()
            return _extract_json(raw2)
    except Exception:
        pass

    return None


# ═══════════════════════════════════════════════════════════════════════════
# SCORE CONSISTENCY - Validação de placar (portado do script original)
# ═══════════════════════════════════════════════════════════════════════════

def parse_score_from_text(text: str) -> Optional[Tuple[int, int]]:
    """Extrai placar do texto (ex: '2x0', '2 a 0')."""
    if not text:
        return None
    m = re.search(r"\b(\d+)\s*x\s*(\d+)\b", text, flags=re.IGNORECASE)
    if not m:
        m = re.search(r"\b(\d+)\s*a\s*(\d+)\b", text, flags=re.IGNORECASE)
    if not m:
        return None
    return int(m.group(1)), int(m.group(2))


def enforce_score_consistency(result: Dict) -> Dict:
    """
    Valida e corrige atribuição de gols baseado no placar do summary.
    """
    if not result or not isinstance(result, dict):
        return result

    events = result.get("events") or []
    summary = result.get("summary") or ""

    score = parse_score_from_text(summary)
    if not score or not isinstance(events, list):
        return result

    home_score, away_score = score
    goal_idx = [
        i for i, e in enumerate(events)
        if isinstance(e, dict) and e.get("event_type") == "goal"
    ]
    if not goal_idx:
        return result

    if len(goal_idx) == home_score + away_score:
        for k, i in enumerate(goal_idx):
            events[i]["team"] = "home" if k < home_score else "away"
        result["events"] = events
        print(f"[EventDetector] ✓ Score consistency: {home_score}x{away_score} validado ({len(goal_idx)} gols)")

    return result


# ═══════════════════════════════════════════════════════════════════════════
# PIPELINE PRINCIPAL - Orquestra todo o fluxo
# ═══════════════════════════════════════════════════════════════════════════

def run_multitype_pipeline(
    transcript: str,
    home_team: str,
    away_team: str,
    ollama_url: str = "http://127.0.0.1:11434",
    model: str = "washingtonlima/kakttus",
    event_types: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Pipeline completo de detecção multi-eventos:
    1. Pré-filtro local por janela deslizante (todas as receitas)
    2. Prompt consolidado com todos os candidatos
    3. Uma única chamada ao Ollama
    4. Validação de consistência de placar (para gols)
    
    Args:
        transcript: Texto da transcrição
        home_team: Time da casa
        away_team: Time visitante
        ollama_url: URL do Ollama
        model: Modelo a usar
        event_types: Lista de tipos a detectar (None = todos)
    
    Returns:
        Dict com 'events', 'summary', 'tactical'
    """
    print(f"\n{'='*60}")
    print(f"[EventDetector] 🚀 Pipeline Multi-Eventos")
    print(f"[EventDetector] {home_team} vs {away_team}")
    print(f"[EventDetector] Tipos: {event_types or 'TODOS'}")
    print(f"{'='*60}")

    # 1. Pré-filtro local
    candidates_by_type = find_all_candidates(
        transcript, home_team, away_team, event_types
    )

    if not candidates_by_type:
        print(f"[EventDetector] ⚠ Nenhum candidato encontrado pelo pré-filtro")
        return {"events": [], "summary": "", "tactical": ""}

    # 2 + 3. Prompt consolidado + chamada ao Ollama
    result = analyze_multitype_with_ollama(
        candidates_by_type, home_team, away_team,
        ollama_url=ollama_url, model=model,
    )

    # 4. Validação de consistência de placar (apenas para gols)
    if result and result.get('events'):
        result = enforce_score_consistency(result)

    events = result.get('events', [])
    by_type = {}
    for e in events:
        t = e.get('event_type', 'other')
        by_type[t] = by_type.get(t, 0) + 1

    print(f"\n[EventDetector] ═══ Resultado Final ═══")
    print(f"[EventDetector] Total: {len(events)} eventos")
    for t, count in sorted(by_type.items()):
        print(f"[EventDetector]   {t}: {count}")
    print(f"[EventDetector] Summary: {result.get('summary', '')[:100]}")

    return result
