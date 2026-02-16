

# Corrigir: EventDetector Retorna 0 Candidatos com Texto do Whisper

## Problema Raiz

O EventDetector (`event_detector.py`) recebe a transcricao do Whisper como **um unico paragrafo** sem quebras de linha. Na linha 428:

```python
lines = [ln.strip() for ln in (transcript or "").splitlines() if ln.strip()]
```

Isso gera `lines = ["todo o texto em uma unica linha"]` (1 elemento).

Na linha 331, cada receita verifica:

```python
if not transcript_lines or len(transcript_lines) < recipe.window_size:
    return []  # window_size = 4-8, len = 1 → SEMPRE retorna vazio
```

Resultado: **todas as receitas retornam `[]`**, 0 candidatos, e o sistema cai no prompt completo (sem pre-filtro), que gera poucos eventos.

## Solucao

### Arquivo: `video-processor/event_detector.py`

**Corrigir `find_all_candidates` para dividir texto corrido em linhas sinteticas** quando o Whisper gera texto sem quebras de linha.

Na funcao `find_all_candidates` (linha 428), apos o `splitlines()`, se o resultado tiver poucas linhas mas muito texto, dividir em sentencas ou blocos de ~100 palavras:

```python
lines = [ln.strip() for ln in (transcript or "").splitlines() if ln.strip()]

# Se texto corrido (poucas linhas mas muito conteudo), dividir em sentencas
if len(lines) < 10 and len(transcript or "") > 500:
    import re
    # Dividir por sentencas (pontuacao + espaco)
    sentences = re.split(r'(?<=[.!?])\s+', transcript)
    # Se ainda poucas sentencas, dividir por blocos de ~15 palavras
    if len(sentences) < 10:
        words = transcript.split()
        chunk_size = 15
        sentences = [
            " ".join(words[i:i+chunk_size])
            for i in range(0, len(words), chunk_size)
        ]
    lines = [s.strip() for s in sentences if s.strip()]
    print(f"[EventDetector] Texto corrido detectado, dividido em {len(lines)} linhas sinteticas")
```

Isso garante que:
- Texto do Whisper (~50k chars, sem newlines) → dividido em ~300+ sentencas/blocos
- Cada receita encontra linhas suficientes para a janela deslizante
- Os patterns de regex funcionam normalmente em cada bloco

### Resultado Esperado

- EventDetector passa a encontrar 15-40 candidatos em vez de 0
- Pipeline multi-eventos envia candidatos reais ao Ollama/Kakttus
- Ollama recebe trechos focados (snippets) em vez do texto completo
- Mais eventos detectados com maior precisao

## Detalhes Tecnicos

### event_detector.py - Linha 428

Adicionar logica de segmentacao apos o `splitlines()`:

1. Verificar se `len(lines) < 10` e `len(transcript) > 500`
2. Primeiro tentar dividir por sentencas (`re.split(r'(?<=[.!?])\s+', ...)`)
3. Se ainda insuficiente, dividir por blocos de 15 palavras
4. Log informativo para debug

### Impacto no resto do pipeline

- `find_event_candidates` recebe linhas sinteticas e aplica a janela deslizante normalmente
- Nenhuma mudanca necessaria em `ai_services.py` -- o fix e apenas no `event_detector.py`
- O fallback por keywords (`detect_events_by_keywords_from_text`) nao e afetado pois opera no texto inteiro, nao em linhas

## Arquivo a Modificar

1. **`video-processor/event_detector.py`** -- Adicionar segmentacao de texto corrido em `find_all_candidates`

