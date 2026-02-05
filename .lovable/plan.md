

# Plano: Usar TXT como Fonte Primária de Timestamps (Não SRT)

## Problema Identificado

O fluxo atual prioriza **SRT** para enriquecer timestamps, usando TXT apenas como fallback. Você quer que a **análise seja feita diretamente no TXT**.

### Fluxo Atual (Problemático)

```text
Kakttus analisa TXT → Eventos sem timestamp
           ↓
    Busca arquivo SRT?
        ↓ SIM              ↓ NÃO
    Enriquece via SRT    Fallback: TXT keywords
```

### Fluxo Desejado

```text
Kakttus analisa TXT → Eventos sem timestamp
           ↓
    Enriquece via TXT keywords (sempre)
           ↓
    (SRT opcional como backup)
```

## Solução Proposta

Inverter a lógica: usar **TXT como fonte primária** de timestamps e **SRT como backup**.

## Alteração Necessária

| Arquivo | Alteração |
|---------|-----------|
| `video-processor/ai_services.py` | Inverter prioridade: TXT primeiro, SRT como fallback |

## Detalhes Técnicos

### Alteração no Fluxo de Enriquecimento (Linhas 5048-5145)

**Antes (SRT primeiro):**
```python
if target_srt:
    # Usa SRT
else:
    # Fallback: usa TXT
```

**Depois (TXT primeiro):**
```python
# 1. SEMPRE tentar TXT primeiro (fonte primária)
print(f"[Kakttus] 📄 Buscando timestamps no TXT...")
keyword_events = detect_events_by_keywords_from_text(
    transcription=transcription,
    home_team=home_team,
    away_team=away_team,
    game_start_minute=game_start_minute
)

keyword_goals = [e for e in keyword_events if e.get('event_type') == 'goal']

if keyword_goals:
    print(f"[Kakttus] ✓ TXT encontrou {len(keyword_goals)} gols com timestamps")
    # Associar timestamps do TXT aos eventos
    for event in final_events:
        if event.get('event_type') == 'goal' and event.get('minute', 0) == 0:
            team = event.get('team', 'unknown')
            for ke in keyword_goals:
                if ke.get('team') == team:
                    event['minute'] = ke.get('minute', 0)
                    event['second'] = ke.get('second', 0)
                    event['videoSecond'] = ke.get('videoSecond', 0)
                    event['metadata'] = event.get('metadata', {})
                    event['metadata']['timestampSource'] = 'txt_keyword'
                    keyword_goals.remove(ke)
                    break
else:
    # 2. Fallback: usar SRT se TXT não tiver timestamps
    print(f"[Kakttus] ⚠ TXT sem timestamps, tentando SRT...")
    if target_srt:
        # Código atual de enriquecimento via SRT
```

## Verificação Importante

Para que o TXT funcione, ele **precisa ter timestamps** no formato:
- `[00:15:30]` ou `[15:30]`
- `00:15:30` ou `15:30`
- `aos 23 minutos`

Se o TXT enviado **não tem nenhum marcador de tempo**, nenhum método vai funcionar - nem TXT, nem SRT.

## Resultado Esperado

Após a correção:
1. TXT é analisado primeiro para extrair timestamps
2. Se TXT não tiver timestamps, usa SRT como backup
3. Se nenhum dos dois tiver, usa estimativa proporcional

