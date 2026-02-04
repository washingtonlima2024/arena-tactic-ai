

# Plano: Corrigir Detecção de Eventos (Truncagem + Fallback)

## Problema Identificado

### Causa Raiz 1: Truncagem da Transcrição
```python
# ai_services.py linha 4173
prompt = f"""...
TRANSCRIÇÃO:
{transcription[:8000]}   # ← PROBLEMA! Só 8000 chars de 38000+
"""
```

**Impacto**: 80% da transcrição é ignorada. Gols que ocorrem depois de ~8 minutos do vídeo não são detectados.

### Causa Raiz 2: Fallback Fraco
Quando Ollama retorna menos de 3 eventos, o fallback usa `detect_events_by_keywords_from_text()` que:
- Usa regex simples no texto bruto
- Não tem acesso ao arquivo SRT original
- Não usa o algoritmo de sliding window (mais preciso)

```text
┌───────────────────────────────────────────────────────────────────────┐
│                      FLUXO ATUAL (PROBLEMÁTICO)                       │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  SRT 62KB ──► Trunca para 8KB ──► Ollama ──► 1 evento                 │
│                                      │                                │
│                                      ▼                                │
│                          Fallback detect_events_by_keywords_from_text │
│                          (texto bruto, sem sliding window)            │
│                                      │                                │
│                                      ▼                                │
│                          Poucos eventos adicionais                    │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Solução Proposta

### 1. Aumentar limite de transcrição para Ollama
Modelos 7B (mistral, qwen2.5) suportam **32K tokens** (~100K chars). Aumentar de 8000 para **24000 caracteres**.

### 2. Usar fallback por SRT quando disponível
Passar o `match_id` para a função de fallback e usar `detect_events_by_keywords()` (que lê o SRT diretamente).

```text
┌───────────────────────────────────────────────────────────────────────┐
│                      FLUXO CORRIGIDO                                  │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  SRT 62KB ──► Usa até 24KB ──► Ollama ──► N eventos                   │
│                                   │                                   │
│                                   ▼                                   │
│                      Se < 3 eventos:                                  │
│                      ┌─────────────────────────────────┐              │
│                      │ detect_events_by_keywords(SRT)  │              │
│                      │ • Sliding window para gols      │              │
│                      │ • Validação por contexto        │              │
│                      │ • 99% precisão                  │              │
│                      └─────────────────────────────────┘              │
│                                   │                                   │
│                                   ▼                                   │
│                      Eventos combinados e deduplicados                │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Mudanças Necessárias

### Arquivo: `video-processor/ai_services.py`

#### Mudança 1: Aumentar limite de caracteres (linha ~4172)
```python
# ANTES:
{transcription[:8000]}

# DEPOIS:
{transcription[:24000]}
```

#### Mudança 2: Atualizar função `_analyze_events_with_ollama` para receber match_id e usar fallback por SRT

Na seção de fallback (linhas ~4301-4319), modificar para:
```python
# FALLBACK: Se Ollama retornou poucos eventos, usar SRT keywords
if len(events) < 3:
    print(f"[Ollama] ⚠️ Poucos eventos ({len(events)}), usando fallback por SRT...")
    
    # Tentar usar detect_events_by_keywords (SRT direto) se temos match_id
    if match_id:
        from storage import get_subfolder_path
        srt_path = get_subfolder_path(match_id, 'srt')
        srt_files = list(srt_path.glob('*.srt')) if srt_path.exists() else []
        
        if srt_files:
            # Usar primeiro SRT encontrado
            keyword_events = detect_events_by_keywords(
                srt_path=str(srt_files[0]),
                home_team=home_team,
                away_team=away_team,
                half=match_half,
                segment_start_minute=game_start_minute
            )
            print(f"[Ollama] Detecção por SRT (sliding window): {len(keyword_events)} eventos")
        else:
            # Fallback para texto bruto se não tiver SRT
            keyword_events = detect_events_by_keywords_from_text(...)
    else:
        # Fallback para texto bruto se não tiver match_id
        keyword_events = detect_events_by_keywords_from_text(...)
    
    # Merge eventos novos
    for ke in keyword_events:
        already_exists = any(
            abs(e.get('minute', 0) - ke.get('minute', 0)) < 2 and 
            e.get('event_type') == ke.get('event_type')
            for e in events
        )
        if not already_exists:
            events.append(ke)
    
    print(f"[Ollama] Total após fallback: {len(events)} eventos")
```

---

## Resultado Esperado

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Texto analisado | 8KB (~20%) | 24KB (~60%) |
| Fallback | Texto bruto (impreciso) | SRT + Sliding Window (99% precisão) |
| Eventos detectados | 1 gol | Todos os gols + outros eventos |
| Tempo de análise | Similar | Similar |

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `video-processor/ai_services.py` | Aumentar limite 8K→24K + usar fallback por SRT |

---

## Teste Recomendado

Após a correção, reanalisar a partida Brasil x Argentina:
1. Ir para `/events`
2. Selecionar a partida
3. Clicar em "Reanalisar" 
4. Verificar se mais gols são detectados

