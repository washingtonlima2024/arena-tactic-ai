

# Plano: Confirmação de Tempos dos Eventos (Essencial)

## Estado Atual

Você já tem:
1. **Detecção de períodos** (`detect_match_periods_from_transcription`) que identifica início do jogo, halftime e 2º tempo via padrões na transcrição
2. **Sincronização de placar** (`scoreSync.ts`) que calcula o score a partir de eventos de gol
3. **Edição manual de eventos** (EventEditDialog) onde users podem corrigir minuto/segundo

**PROBLEMA**: Esses dados dependem 100% da **qualidade da transcrição**. Se a narração é ruim, imprecisa ou incompleta, tudo que depende dela falha.

## Solução Essencial: Leitura do Placar via OCR Local

A abordagem proposta substitui a dependência de transcrição perfeita adicionando **leitura direta do vídeo via EasyOCR** para confirmar:

1. ✅ **Início do jogo** - detecta quando cronômetro aparece "00:00"
2. ✅ **1º e 2º tempo** - detecta transição de ~45:00 → 45:00+ (início 2T)
3. ✅ **Acréscimos** - detecta "+3", "+5" na tela
4. ✅ **Placar final** - confirma score que aparece no vídeo
5. ✅ **Validação de eventos** - lê o cronômetro no frame do evento para confirmar minuto

### Por que EasyOCR e não YOLO?

- **YOLO** = detecção de objetos (jogadores, bola) - não é adequado para ler texto
- **EasyOCR** = leitura de texto direto - perfeito para ler cronômetro, placar, acréscimos do overlay

Ambos rodamlocalmente, zero custo de API.

## Arquitetura da Solução

```
Pipeline de Análise Existente
    |
    v
[1] Transcrição detecta períodos (atual) → boundaries
    |
    v
[2] OCR do vídeo lê placar (NOVO) → ocr_boundaries
    |
    v
[3] Comparar: Se transcrição tem confiança baixa (<0.7), usar OCR como complemento
    |
    v
[4] Resultado final: boundaries certoz com timestamps confirmados
    |
    v
Detectar eventos + validar minuto contra cronômetro lido do vídeo (NOVO)
    |
    v
Score sincronizado e eventos com tempos confirmados
```

## Implementações Necessárias (Apenas Essencial)

### 1. `video-processor/ai_services.py` - Novas funções OCR

**`read_scoreboard_ocr(frame_base64)`** - Extrai dados do placar de um frame
- Input: frame base64
- Output: `{game_minute, game_second, half, stoppage_time, score_home, score_away, confidence}`
- Lógica:
  - OpenCV: crop top 15% (região do placar)
  - Pre-processamento: grayscale, contrast enhancement, binarização
  - EasyOCR: lê cronômetro e placar
  - Regex: extrai MM:SS, placar, acréscimos

**`detect_match_boundaries_ocr(video_path, duration)`** - Detecção de tempos via OCR
- Extrai ~20 frames espalhados pelo vídeo
- Lê o cronômetro de cada frame
- Analisa progressão: encontra 00:00, 45:00, 90:00
- Retorna boundaries com `game_start_second`, `second_half_start_second`, `confidence`

**`validate_event_minute_ocr(video_path, video_second, claimed_minute)`** - Valida minuto do evento
- Extrai frame no video_second do evento
- Lê cronômetro
- Confirma ou corrige o minuto

### 2. `video-processor/server.py` - Novo endpoint

**`POST /api/matches/<match_id>/read-scoreboard`** - Processa OCR
- Chamado automaticamente após análise ou manualmente pelo usuário
- Retorna boundaries e stats do placar

### 3. Backend - Integrar no pipeline de análise

No `/api/analyze-match`, após transcription:
```python
boundaries = detect_match_periods_from_transcription(...)  # Current
if boundaries['confidence'] < 0.7:
    ocr_boundaries = detect_match_boundaries_ocr(...)     # Fallback
    if ocr_boundaries['confidence'] > boundaries['confidence']:
        boundaries = ocr_boundaries  # Usar OCR se mais confiável
```

### 4. Frontend - Interface para validar

**`src/pages/Events.tsx`** - Adicionar:
- Botão "Validar Tempos com OCR" que lê cronômetro do vídeo
- Mostrar se tempo do evento foi confirmado ou necessita correção
- Visual: evento com tempo confirmado = ✅, tempo duvidoso = ⚠️

**`src/components/events/EventEditDialog.tsx`** - Validação inline:
- Ao editar minuto/segundo, oferecer botão "Confirmar do vídeo"
- Lê cronômetro no segundo exato e sugere correção

### 5. Database - Rastrear origem do tempo

Adicionar coluna em `match_events`:
```sql
ALTER TABLE match_events ADD COLUMN time_source TEXT DEFAULT 'transcription';
  -- Valores: 'transcription', 'ocr_scoreboard', 'manual_edit'
```

## Performance e Custo

| Métrica | Valor |
|---------|-------|
| Custo | R$ 0,00 (100% local) |
| Dependências novas | easyocr, opencv-python-headless |
| Tempo para 90 min | ~8-10s (CPU), ~2-3s (GPU) |
| Precisão | ~95% (cronômetro legível) |

## Fluxo Completo (Exemplo)

```text
1. Usuário faz upload de vídeo 90 min
2. Transcrição detecta: inicio=50s, halftime=2800s, 2T=3050s, confiança=0.6
3. OCR do vídeo lê placar: inicio=55s, halftime=2810s, 2T=3060s, confiança=0.85
4. Sistema escolhe OCR (mais confiável)
5. Eventos detectados:
   - Gol em minute=12 (transcription estimou)
   - OCR lê frame exato: cronômetro = 12:34
   - Evento confirmado ✅
6. Usuário vê na página de Eventos: todos os tempos com ✅ "Confirmado por OCR"
```

## Arquivos a Criar/Modificar

1. **`video-processor/requirements.txt`** - Adicionar easyocr + opencv-python-headless
2. **`video-processor/ai_services.py`** - 3 funções: `read_scoreboard_ocr()`, `detect_match_boundaries_ocr()`, `validate_event_minute_ocr()`
3. **`video-processor/server.py`** - Novo endpoint + integração no pipeline
4. **`src/pages/Events.tsx`** - Mostrar status de confirmação dos tempos
5. **`src/components/events/EventEditDialog.tsx`** - Botão para validar tempo
6. **`src/lib/apiClient.ts`** - Novo método para chamar OCR

## Por que isso Resolve o Problema

✅ **Início do jogo confirmado** - OCR lê "00:00" no cronômetro  
✅ **1º e 2º tempo confirmados** - OCR detecta transição de minutos  
✅ **Acréscimos confirmados** - OCR lê "+3", "+5"  
✅ **Placar confirmado** - OCR lê números do placar  
✅ **Tempos dos eventos validados** - Cronômetro lido no frame exato  
✅ **Zero custo de API** - EasyOCR roda localmente  
✅ **Independente de qualidade de transcrição** - Funciona mesmo se narração ruim

