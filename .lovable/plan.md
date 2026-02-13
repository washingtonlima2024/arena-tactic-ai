
# Integração Automática de OCR no Pipeline de Análise

## Problema Atual

Atualmente, o OCR está implementado mas é **100% manual**:
- Usuário deve clicar em "Ler Placar (OCR)" para detectar limites (início, intervalo, 2º tempo)
- Usuário deve clicar em "Validar Tempos (OCR)" para corrigir minutos de eventos
- O pipeline automático `analyze-match` usa APENAS transcrição (`detect_match_periods_from_transcription`) para definir `gameStartMinute` e `gameEndMinute`
- Acréscimos (stoppage_time) são lidos pelo OCR mas **nunca são salvos** como metadados dos eventos

## Solução: Integração 3 Níveis

### Nível 1: Detecção de Boundaries Automática
**Onde**: `video-processor/server.py` no endpoint `/api/analyze-match` (linha ~3829)

**Mudança**: Adicionar OCR como **fallback automático** quando a transcrição falha:

```python
# ═══ NOVO FLUXO ═══
boundaries = None
boundary_source = None

# Tentativa 1: SRT (mais confiável)
if os.path.exists(srt_path):
    boundaries = ai_services.detect_match_periods_from_transcription(srt_content)
    boundary_source = 'srt'

# Tentativa 2: Transcrição bruta
if not boundaries.get('game_start_second') and transcription:
    boundaries = ai_services.detect_match_periods_from_transcription(transcription)
    boundary_source = 'transcription'

# NOVO: Tentativa 3: OCR (fallback automático) ✅
if not boundaries.get('game_start_second') and video_path:
    try:
        from scoreboard_ocr import detect_match_boundaries_ocr
        ocr_boundaries = detect_match_boundaries_ocr(video_path, duration_seconds)
        if ocr_boundaries.get('confidence', 0) > 0.3:  # Confiança mínima
            boundaries = ocr_boundaries
            boundary_source = 'ocr_scoreboard'
            print(f"[ANALYZE-MATCH] ✓ OCR forneceu boundaries com confiança {ocr_boundaries['confidence']:.2f}")
    except Exception as ocr_err:
        print(f"[ANALYZE-MATCH] ⚠ OCR falhou (não crítico): {ocr_err}")
```

**Benefício**: 
- Se transcrição é ruim/vazia, OCR detecta os períodos automaticamente
- Não bloqueia o fluxo se OCR falhar
- Acréscimos (`stoppage_time_1st`, `stoppage_time_2nd`) já vêm do OCR

---

### Nível 2: Correção Automática de Minutos de Eventos
**Onde**: `video-processor/server.py` no endpoint `/api/analyze-match` (após criar eventos, linha ~4050)

**Mudança**: Executar `validate_events_batch_ocr` automaticamente ao final da análise:

```python
# NOVO: Após salvar eventos no banco
if video_path and os.path.exists(video_path):
    try:
        from scoreboard_ocr import validate_events_batch_ocr
        
        # Buscar eventos criados nesta análise
        new_events = session.query(MatchEvent)\
            .filter_by(match_id=match_id, match_half=match_half_value)\
            .all()
        
        if new_events:
            print(f"[ANALYZE-MATCH] 🎬 Validando {len(new_events)} eventos com OCR...")
            validations = validate_events_batch_ocr(video_path, new_events, game_start_minute)
            
            # Atualizar eventos com minutos corrigidos
            for validation in validations:
                event_id = validation.get('event_id')
                if event_id and validation.get('corrected'):
                    event = session.query(MatchEvent).filter_by(id=event_id).first()
                    if event:
                        old_minute = event.minute
                        event.minute = validation['minute']
                        event.second = validation.get('second', 0)
                        event.time_source = 'ocr_scoreboard'
                        
                        # Salvar confiança do OCR no metadata
                        metadata = event.metadata or {}
                        metadata['ocr_validation'] = {
                            'original_minute': old_minute,
                            'ocr_minute': validation['ocr_minute'],
                            'confidence': validation['confidence'],
                            'validated_at': datetime.now().isoformat(),
                        }
                        event.metadata = metadata
                        print(f"[ANALYZE-MATCH] ✓ Evento {event.event_type}: {old_minute}' → {validation['minute']}'")
            
            session.commit()
            print(f"[ANALYZE-MATCH] ✓ OCR validou eventos")
    except ImportError:
        print("[ANALYZE-MATCH] ⚠ EasyOCR não instalado, saltando validação automática")
    except Exception as ocr_validate_err:
        print(f"[ANALYZE-MATCH] ⚠ Validação OCR falhou (não crítico): {ocr_validate_err}")
```

**Benefício**:
- Eventos são criados com transcrição, depois corrigidos automaticamente com OCR
- Usuário não precisa clicar manualmente
- Confidence e divergência são salvos para auditoria

---

### Nível 3: Detecção Automática de Períodos Estendidos (ET1, ET2, Pênaltis)
**Onde**: `video-processor/ai_services.py` + `scoreboard_ocr.py`

**Mudança A**: Expandir `read_scoreboard_ocr` para retornar período detectado:

```python
def read_scoreboard_ocr(frame: np.ndarray) -> Dict[str, Any]:
    # ... código existente ...
    
    # NOVO: Classificar período com base no cronômetro
    if time_match:
        minute = int(time_match.group(1))
        # ...
        
        # Novo: Classificar período
        if minute <= 45:
            result['period'] = 'first_half'
        elif minute <= 90:
            result['period'] = 'second_half'
        elif minute <= 105:
            result['period'] = 'extra_time_1'
        elif minute <= 120:
            result['period'] = 'extra_time_2'
        else:  # > 120 minutos
            result['period'] = 'penalty_shootout'
    
    return result
```

**Mudança B**: Atualizar `detect_match_boundaries_ocr` para retornar informações de prorrogação:

```python
def detect_match_boundaries_ocr(...):
    # ... código existente ...
    
    boundaries = {
        # ... campos existentes ...
        'has_extra_time': False,
        'has_penalties': False,
        'extra_time_1_start_second': None,
        'extra_time_2_start_second': None,
    }
    
    # Detectar prorrogação lendo frames finais
    late_readings = [r for r in visible_readings if r['video_second'] > duration_seconds * 0.8]
    for r in late_readings:
        if r.get('game_minute', 0) > 90:
            boundaries['has_extra_time'] = True
            if r['game_minute'] <= 105:
                boundaries['extra_time_1_start_second'] = r['video_second'] - (r['game_minute'] - 90) * 60
            elif r['game_minute'] > 105:
                boundaries['extra_time_2_start_second'] = r['video_second'] - (r['game_minute'] - 105) * 60
        
        if r['game_minute'] > 120:
            boundaries['has_penalties'] = True
    
    return boundaries
```

**Mudança C**: No `/api/analyze-match`, ao receber boundaries, ajustar `gameEndMinute` automaticamente:

```python
# Ajustar gameEndMinute se houver prorrogação detectada
if boundaries.get('has_extra_time'):
    game_end_minute = 120  # ou 105 se só ET1
    match_half_value = 'extra_time'  # Novo tipo de metade

elif boundaries.get('has_penalties'):
    game_end_minute = 120
    match_half_value = 'penalty_shootout'

print(f"[ANALYZE-MATCH] ✓ Período detectado: {match_half_value} (até {game_end_minute}')")
```

---

## Modificações de Código

### 1. `video-processor/server.py` (~línhas 3829 + 4050)
- Adicionar tentativa de OCR como fallback para detectar boundaries
- Adicionar validação automática de eventos após criação (OCR)
- Ajustar `gameEndMinute` e `match_half` se prorrogação for detectada

### 2. `video-processor/scoreboard_ocr.py` (~linhas 140 + 159)
- Adicionar classificação automática de período em `read_scoreboard_ocr` (primeiro/segundo/ET1/ET2/pênaltis)
- Expandir `detect_match_boundaries_ocr` para retornar `has_extra_time`, `has_penalties`, timestamps ET1/ET2
- Melhorar detecção de pênaltis (minuto > 120)

### 3. `src/components/events/ReanalyzeHalfDialog.tsx` (opcional)
- Melhorar feedback visual: mostrar que OCR foi executado
- Adicionar badge visual: "✅ OCR confirmado" vs "⚠️ Transcrição"

### 4. Novo: Página de Eventos - Indicadores de Fonte
- Adicionar coluna visual na tabela de eventos mostrando:
  - ✅ `ocr_scoreboard` (confiável, verde)
  - 📝 `transcription` (razoável, amarelo)
  - ✏️ `manual_edit` (editado pelo usuário, azul)

---

## Fluxo Automático Resultante

```text
Usuário clica "Analisar Partida"
    |
    v
[1] Detectar Boundaries
    ├─ Tentar SRT → OK
    ├─ Ou Transcrição → OK
    └─ Ou OCR (NOVO) → OK (fallback automático)
    |
    v
[2] Extrair Eventos com IA
    ├─ Text/Hybrid: Usar transcription + AI
    └─ Vision: Análise visual (se disponível)
    |
    v
[3] Validar Minutos com OCR (NOVO)
    ├─ Buscar cada evento no cronômetro real
    ├─ Corrigir se divergência > 2 min
    └─ Salvar confidence e source
    |
    v
[4] Detectar Período Estendido (NOVO)
    ├─ OCR lê se tem prorrogação (>90 min)
    ├─ OCR lê se tem pênaltis (>120 min)
    └─ Ajustar gameEndMinute automaticamente
    |
    v
[5] Criar Clips e Salvar
    └─ Eventos já estão com tempos corretos
```

---

## Testes Recomendados Após Implementação

1. ✅ **Vídeo do YouTube (jogo completo)**: Sem transcrição, OCR deve detectar automaticamente
2. ✅ **Vídeo com acréscimos**: Validar que `stoppage_time` é salvo como metadados
3. ✅ **Vídeo com prorrogação**: OCR detecta ET1/ET2 e ajusta períodos
4. ✅ **Fluxo re-análise**: Ao reanalizar um tempo, OCR não interfere no outro tempo
5. ✅ **Fallback**: Se OCR falhar, sistema continua usando transcrição (não bloqueia)

---

## Benefícios Finais

✅ **Zero cliques adicionais**: OCR roda automaticamente  
✅ **Mais preciso**: Cronômetro real vs transcrição imprecisa  
✅ **Suporta prorrogação/pênaltis**: Classifica períodos estendidos  
✅ **Auditável**: Salva confiança (confidence) e fonte (time_source)  
✅ **Resiliente**: Fallback automático se OCR falhar  
✅ **Sem custos**: 100% local (EasyOCR + OpenCV)
