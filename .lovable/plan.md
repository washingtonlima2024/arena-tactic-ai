

# Plano: Corrigir Detecção de Timestamps no Pipeline Kakttus

## Diagnóstico do Problema

A análise da partida Brasil x Argentina gerou apenas **2 eventos com timestamps zerados** porque:

1. **Prompt simplificado demais**: A função `analyze_with_kakttus` não solicita `minute`, `second` ou `videoSecond` no prompt da IA
2. **Transcrição sem timestamps**: O texto TXT enviado pelo frontend não contém marcas de tempo
3. **Fallback ausente**: O pipeline Kakttus não aciona a detecção por keywords SRT após a análise
4. **`_enrich_events` usa fallback**: Define `minute: game_start_minute (0)` quando não há timestamp

### Fluxo Atual (Problemático)

```text
Frontend envia TXT
       ↓
analyze_with_kakttus()
       ↓
IA retorna: { event_type, team, detail, confidence }
       ↓
_enrich_events() define minute: 0, second: 0, videoSecond: 0
       ↓
Eventos com timestamps zerados 😞
```

## Solução Proposta

Modificar o prompt do Kakttus para incluir timestamps **E** enriquecer eventos com dados do SRT quando disponível.

### Fluxo Corrigido

```text
Frontend envia TXT
       ↓
analyze_with_kakttus() → solicita timestamps no JSON
       ↓
Se SRT disponível: detect_events_by_keywords()
       ↓
Merge: eventos da IA + timestamps do SRT
       ↓
Eventos com timestamps precisos ✓
```

## Alterações Necessárias

| Arquivo | Alteração |
|---------|-----------|
| `video-processor/ai_services.py` | Atualizar prompt do Kakttus para solicitar timestamps |
| `video-processor/ai_services.py` | Adicionar pós-processamento com SRT no fluxo Kakttus |

---

## Detalhes Técnicos

### Alteração 1: Atualizar Prompt do Kakttus (Linhas 580-600)

O prompt atual não solicita campos de timestamp. Vamos adicionar:

**Antes:**
```python
user_prompt = f"""
Times:
home = {home_team}
away = {away_team}

Transcrição:
{transcript_truncated}

Retorne neste formato:
{{
  "events": [
    {{
      "event_type": "goal" ou outro,
      "team": "home" ou "away" ou "unknown",
      "detail": "descrição curta",
      "confidence": número entre 0 e 1
    }}
  ],
  ...
}}
"""
```

**Depois:**
```python
user_prompt = f"""
Times:
home = {home_team}
away = {away_team}

Transcrição:
{transcript_truncated}

IMPORTANTE: Extraia o minuto do jogo de cada evento baseado no contexto da narração.
Se a transcrição mencionar timestamps como [00:15:30] ou "aos 23 minutos", use-os.

Retorne neste formato:
{{
  "events": [
    {{
      "event_type": "goal" ou outro,
      "team": "home" ou "away" ou "unknown",
      "minute": número do minuto do jogo (0-90),
      "second": segundos (0-59),
      "detail": "descrição curta",
      "confidence": número entre 0 e 1
    }}
  ],
  ...
}}
"""
```

### Alteração 2: Pós-processamento com SRT (Após Linha 5040)

No fluxo Kakttus em `analyze_match_events`, após receber eventos da IA, verificar se há SRT disponível e usar `detect_events_by_keywords_from_text` para associar timestamps precisos:

```python
# Após linha 5040: final_events = deduplicate_goal_events(enriched_events)

# NOVO: Se temos match_id, tentar enriquecer com timestamps do SRT
if match_id:
    try:
        from storage import get_subfolder_path
        srt_folder = get_subfolder_path(match_id, 'srt')
        
        # Buscar SRT do tempo correspondente
        srt_candidates = [
            srt_folder / f'{match_half}_transcription.srt',
            srt_folder / f'{match_half}_half.srt',
            srt_folder / f'{match_half}.srt',
        ]
        
        target_srt = None
        for candidate in srt_candidates:
            if candidate.exists():
                target_srt = candidate
                break
        
        if target_srt:
            print(f"[Kakttus] 🔄 Enriquecendo timestamps via SRT: {target_srt.name}")
            
            # Detectar eventos por keywords para obter timestamps
            keyword_events = detect_events_by_keywords(
                srt_path=str(target_srt),
                home_team=home_team,
                away_team=away_team,
                half=match_half,
                segment_start_minute=game_start_minute
            )
            
            # Associar timestamps dos keyword_events aos eventos do Kakttus
            for event in final_events:
                if event.get('event_type') == 'goal' and event.get('minute', 0) == 0:
                    # Buscar gol correspondente nos keyword_events
                    for ke in keyword_events:
                        if ke.get('event_type') == 'goal' and ke.get('team') == event.get('team'):
                            event['minute'] = ke.get('minute', 0)
                            event['second'] = ke.get('second', 0)
                            event['videoSecond'] = ke.get('videoSecond', 0)
                            event['timestampSource'] = 'srt_enriched'
                            print(f"[Kakttus] ✓ Timestamp atribuído: {event['minute']}:{event['second']:02d}")
                            break
        else:
            # Fallback: usar detect_events_by_keywords_from_text no próprio texto
            print(f"[Kakttus] ⚠ SRT não encontrado, tentando extração de texto...")
            keyword_events = detect_events_by_keywords_from_text(
                transcription=transcription,
                home_team=home_team,
                away_team=away_team,
                game_start_minute=game_start_minute
            )
            
            for event in final_events:
                if event.get('event_type') == 'goal' and event.get('minute', 0) == 0:
                    for ke in keyword_events:
                        if ke.get('event_type') == 'goal' and ke.get('team') == event.get('team'):
                            event['minute'] = ke.get('minute', 0)
                            event['second'] = ke.get('second', 0)
                            event['videoSecond'] = ke.get('videoSecond', 0)
                            event['timestampSource'] = 'text_keyword_enriched'
                            break
                            
    except Exception as enrich_err:
        print(f"[Kakttus] ⚠ Erro ao enriquecer timestamps: {enrich_err}")
```

## Resultado Esperado

Após a correção:
- Gols detectados com **timestamps precisos** do SRT
- Clips gerados na **posição correta** do vídeo
- Timeline de eventos **ordenada corretamente**
- Fallback inteligente quando SRT não está disponível

## Hierarquia de Timestamps

1. **SRT direto** (mais preciso)
2. **Keywords no texto** (extrai de padrões como `[00:15:30]` ou `23:45`)
3. **Estimativa proporcional** (último recurso)

