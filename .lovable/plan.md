

# Corrigir: Pipeline Async Usando Transcricao Parcial do Smart Import

## Problema Raiz

O pipeline gera apenas 6 eventos porque esta usando a **transcricao parcial do Smart Import** (primeiros 5 minutos do video, ~12k chars) em vez de rodar o Whisper completo no video inteiro (~47 minutos).

### Por que a transcricao parcial passa na validacao?

O filtro de densidade (`chars_per_sec < 3`) nao detecta a parcialidade porque:

```text
Video: 2797 segundos (~47 min)
Transcricao Smart Import: ~12.000 chars (primeiros 5 min)
Calculo: 12000 / 2797 = 4.3 chars/s  -->  PASSA (> 3)

Transcricao completa real teria: ~50.000-80.000 chars
Ratio real: ~20 chars/s
```

O Smart Import gera texto denso (transcreve apenas 5 minutos, mas com alta qualidade), entao o ratio chars/s fica acima do threshold. O pipeline aceita, pula o Whisper, e a IA so tem narracaco dos primeiros 5 minutos para analisar.

### Segundo problema: `break` no fallback por keywords

No `detect_events_by_keywords_from_text` (linha 5499), ha um `break` que limita a deteccao a **uma unica ocorrencia por padrao de regex**. Se o texto menciona "gol" 3 vezes, so a primeira e capturada.

## Solucao

### Arquivo 1: `video-processor/server.py`

**Aumentar o threshold de densidade para 8 chars/s** (ou melhor: usar um threshold absoluto de chars minimos baseado na duracao do video).

```text
Logica atual (linha 8963):
  if chars_per_sec < 3:  -->  descarta

Logica corrigida:
  if chars_per_sec < 8:  -->  descarta (transcricoes reais tem ~15-20 chars/s)

  OU (mais robusto):
  expected_min_chars = dur * 5  # minimo 5 chars/s para ~47 min
  if text_len < expected_min_chars:  -->  descarta
```

Aplicar a mesma correcao no `_validate_storage_transcription` (linha 9007): mudar `< 3` para `< 8`.

Isso garante que:
- Transcricao completa (~50k chars, ~20 chars/s): ACEITA
- Transcricao parcial Smart Import (~12k chars, ~4 chars/s): DESCARTADA --> Whisper roda

### Arquivo 2: `video-processor/ai_services.py`

**Remover o `break` na linha 5499** do `detect_events_by_keywords_from_text` para permitir multiplas deteccoes do mesmo padrao (ex: 3 gols diferentes no texto).

Substituir por logica que acumula todas as ocorrencias, mantendo a deduplicacao posterior (linha 5504) para evitar eventos repetidos.

```text
Antes (linha 5499):
  break  # Uma deteccao por padrao

Depois:
  continue  # Permitir multiplas deteccoes do mesmo padrao
```

## Detalhes Tecnicos

### server.py - Correcao do threshold

**Linhas 8962-8968** (validacao do frontend):
- Mudar `chars_per_sec < 3` para `chars_per_sec < 8` nas linhas 8964 e 8977

**Linhas 9005-9010** (`_validate_storage_transcription`):
- Mudar `chars_per_sec < 3` para `chars_per_sec < 8` na linha 9007

### ai_services.py - Remover break limitante

**Linha 5499**:
- Substituir `break` por `continue` para detectar multiplas ocorrencias do mesmo padrao de keyword no texto

## Impacto Esperado

- Pipeline async rodara o Whisper completo (47 min) em vez de usar os 5 min do Smart Import
- A IA recebera ~50-80k chars de transcricao, cobrindo toda a partida
- O fallback por keywords capturara multiplas instancias de cada tipo de evento
- Resultado esperado: 15-40 eventos por tempo em vez de 3-6

## Arquivos a Modificar

1. `video-processor/server.py` - Aumentar threshold de densidade de 3 para 8 chars/s
2. `video-processor/ai_services.py` - Remover break limitante no fallback por keywords

