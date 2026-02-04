
# Plano: Corrigir Clips com Tempo Zero

## Problema Identificado

Os clips estão sendo gerados com `videoSecond: 0` porque a função de fallback `detect_events_by_keywords()` (linha 3570 em `ai_services.py`) não está extraindo os timestamps corretamente da transcrição.

### Causa Raiz

1. A função recebe **texto bruto** da transcrição, não o arquivo SRT estruturado
2. O parser procura por timestamps no formato `00:MM:SS` linha por linha
3. Se a keyword (ex: "gol") aparece **ANTES** do primeiro timestamp no texto, o evento é criado com `minute=0, second=0`
4. O `videoSecond` fica zerado, causando clips do início do vídeo

### Evidência nos Dados

```json
{
  "minute": 0,
  "second": 0,
  "metadata": {
    "videoSecond": 0,
    "source": "keyword_fallback",
    "validated": true
  }
}
```

---

## Solução: 3 Correções

### Correção 1: Usar SRT ao invés de texto bruto

A função `detect_events_by_keywords` (linha 1354) **já existe** e usa o arquivo SRT diretamente com parsing correto de blocos. O problema é que a versão de fallback (linha 3570) usa texto bruto.

**Ação:** Modificar o fallback para passar o caminho do SRT quando disponível.

### Correção 2: Rejeitar eventos com timestamp zero

Adicionar validação para ignorar eventos com `minute=0` e `second=0` quando isso claramente indica falha de parsing (a menos que seja um evento real no início do jogo, o que é raro).

### Correção 3: Fallback para distribuição proporcional

Se o parser falhar em extrair timestamps, distribuir os eventos proporcionalmente ao longo da transcrição baseado na posição relativa do texto.

---

## Implementação Técnica

### 1. Modificar fallback para usar SRT

**Arquivo:** `video-processor/ai_services.py`

**Antes (linha ~3902):**
```python
keyword_events = detect_events_by_keywords(
    transcription=transcription,
    home_team=home_team,
    away_team=away_team,
    game_start_minute=game_start_minute
)
```

**Depois:**
```python
# Tentar usar a versão com SRT primeiro (mais precisa)
srt_path = srt_file_path  # Passado como parâmetro
if srt_path and os.path.exists(srt_path):
    keyword_events = detect_events_by_keywords(
        srt_path=srt_path,
        home_team=home_team,
        away_team=away_team,
        half=half,
        segment_start_minute=game_start_minute
    )
else:
    # Fallback para texto bruto com validação
    keyword_events = detect_events_by_keywords_from_text(
        transcription=transcription,
        home_team=home_team,
        away_team=away_team,
        game_start_minute=game_start_minute
    )
```

### 2. Renomear funções para evitar conflito

Existem **duas funções** com o mesmo nome `detect_events_by_keywords`:
- Linha 1354: Recebe `srt_path` (correta)
- Linha 3570: Recebe `transcription` (problemática)

**Ação:** Renomear a versão do texto bruto para `detect_events_by_keywords_from_text()`

### 3. Adicionar validação de timestamps

**Nova função:** `validate_event_timestamps()`

```python
def validate_event_timestamps(events: List[Dict], video_duration: float = None) -> List[Dict]:
    """
    Valida e corrige eventos com timestamps inválidos.
    
    - Remove eventos com minute=0, second=0 SE não houver videoSecond válido
    - Distribui proporcionalmente se todos os eventos tiverem timestamp zero
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
    
    return valid_events
```

### 4. Melhorar parser de texto bruto

Se não houver SRT, melhorar a extração de timestamps do texto:

```python
def detect_events_by_keywords_from_text(
    transcription: str,
    home_team: str,
    away_team: str,
    game_start_minute: int = 0
) -> List[Dict[str, Any]]:
    """
    Detecta eventos por keywords em texto bruto.
    MELHORADO: Rastreia timestamp mais próximo, não só da linha atual.
    """
    events = []
    
    # Parser mais robusto: extrair TODOS os timestamps primeiro
    timestamp_pattern = r'(\d{2}):(\d{2}):(\d{2})'
    
    # Mapa de posição -> timestamp
    timestamp_map = {}
    for match in re.finditer(timestamp_pattern, transcription):
        position = match.start()
        hours, mins, secs = match.groups()
        total_seconds = int(hours) * 3600 + int(mins) * 60 + int(secs)
        timestamp_map[position] = {
            'minute': game_start_minute + int(mins) + int(hours) * 60,
            'second': int(secs),
            'videoSecond': total_seconds
        }
    
    # Para cada keyword encontrada, usar o timestamp MAIS PRÓXIMO (antes)
    for event_type, keyword_patterns in patterns.items():
        for pattern in keyword_patterns:
            for match in re.finditer(pattern, transcription, re.IGNORECASE):
                keyword_pos = match.start()
                
                # Encontrar timestamp mais próximo ANTES da keyword
                closest_ts = None
                min_distance = float('inf')
                
                for ts_pos, ts_data in timestamp_map.items():
                    if ts_pos < keyword_pos:  # Timestamp antes da keyword
                        distance = keyword_pos - ts_pos
                        if distance < min_distance:
                            min_distance = distance
                            closest_ts = ts_data
                
                if closest_ts:
                    event = {
                        'minute': closest_ts['minute'],
                        'second': closest_ts['second'],
                        'videoSecond': closest_ts['videoSecond'],
                        'event_type': event_type,
                        # ... outros campos
                    }
                    events.append(event)
    
    return events
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `video-processor/ai_services.py` | Renomear função duplicada para `detect_events_by_keywords_from_text()` |
| `video-processor/ai_services.py` | Melhorar parser para usar mapa de timestamps |
| `video-processor/ai_services.py` | Adicionar `validate_event_timestamps()` |
| `video-processor/ai_services.py` | Modificar chamadas de fallback para usar SRT quando disponível |
| `video-processor/server.py` | Passar caminho do SRT para funções de análise |

---

## Fluxo Corrigido

```text
Transcrição disponível
        ↓
[VERIFICAÇÃO] Existe arquivo SRT?
        ├── SIM → detect_events_by_keywords(srt_path) [PRECISO]
        └── NÃO ↓
        
[FALLBACK] Usar texto bruto
        ↓
detect_events_by_keywords_from_text()
        ↓
Mapa de timestamps criado ANTES de procurar keywords
        ↓
Cada keyword associada ao timestamp mais próximo
        ↓
[VALIDAÇÃO] validate_event_timestamps()
        ├── Eventos com timestamp 0 e sem videoSecond válido → REJEITAR/DISTRIBUIR
        └── Eventos válidos → Prosseguir
        ↓
Clips extraídos com timestamps corretos ✓
```

---

## Resultado Esperado

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Eventos com timestamp 0 | Clip do início do vídeo | Rejeitados ou distribuídos |
| Fallback sem SRT | Perde timestamps | Usa mapa de timestamps do texto |
| Validação | Nenhuma | Valida antes de criar clips |
| Clips gerados | Errados (0s) | Corretos (timestamp real) |

---

## Detalhes Técnicos

### Por que há duas funções com o mesmo nome?

1. **Linha 1354:** `detect_events_by_keywords(srt_path, ...)` - Usa arquivo SRT estruturado, extrai timestamps precisos dos blocos
2. **Linha 3570:** `detect_events_by_keywords(transcription, ...)` - Usa texto bruto, parsing frágil linha por linha

A segunda função sobrescreve a primeira no namespace Python, causando comportamento inconsistente dependendo de qual é importada/chamada.

### Solução de namespace:

```python
# Função principal (usa SRT)
def detect_events_by_keywords_srt(srt_path, home_team, away_team, half, segment_start_minute):
    """Versão precisa usando arquivo SRT."""
    ...

# Fallback (usa texto bruto)
def detect_events_by_keywords_text(transcription, home_team, away_team, game_start_minute):
    """Fallback para texto bruto."""
    ...

# Wrapper inteligente
def detect_events_by_keywords(srt_path=None, transcription=None, **kwargs):
    """Escolhe automaticamente a melhor versão."""
    if srt_path and os.path.exists(srt_path):
        return detect_events_by_keywords_srt(srt_path, **kwargs)
    elif transcription:
        return detect_events_by_keywords_text(transcription, **kwargs)
    else:
        return []
```
