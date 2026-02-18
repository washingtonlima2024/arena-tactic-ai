
# Corrigir Deteccao de Gols em Transcricoes Curtas

## Problema Raiz

O `event_detector.py` rejeita transcricoes curtas (< 500 caracteres) silenciosamente por causa de tres guards restritivos:

1. **Threshold de splitting sintetico** (linha 434): So divide texto corrido em linhas sinteticas quando `len(transcript) > 500`. Uma transcricao de 366 chars nao e dividida.
2. **Guard de window_size** (linha 332): `len(transcript_lines) < recipe.window_size` retorna lista vazia imediatamente. Para gols, `window_size=8`, entao textos com menos de 8 linhas sao ignorados.
3. **min_evidence_lines=2** para gols: Exige 2 linhas distintas com evidencia na janela, o que e impossivel em textos curtos.

Resultado: transcricoes curtas (< 500 chars) geram 0 candidatos, e o pipeline retorna 0 eventos.

## Solucao

### Arquivo: `video-processor/event_detector.py`

**Mudanca 1 - Baixar threshold de splitting sintetico (linha 434):**
- De: `if len(lines) < 10 and len(transcript or "") > 500`
- Para: `if len(lines) < 10 and len(transcript or "") > 100`
- Isso permite que transcricoes a partir de 100 chars sejam divididas em linhas sinteticas

**Mudanca 2 - Chunk size adaptativo:**
- Para textos curtos (< 500 chars), usar chunks menores (15 palavras em vez de 40)
- Isso gera mais linhas sinteticas, permitindo que o pré-filtro funcione

**Mudanca 3 - Relaxar guard de window_size (linha 332):**
- De: `if not transcript_lines or len(transcript_lines) < recipe.window_size: return []`
- Para: permitir processamento mesmo com poucas linhas, ajustando o window_size dinamicamente ao tamanho disponivel

```python
if not transcript_lines:
    return []
effective_window = min(recipe.window_size, len(transcript_lines))
```

**Mudanca 4 - min_evidence=1 para textos sinteticos:**
- Ja existe parcialmente (linha 372: `min_evidence = 1 if synthetic_lines`), mas o problema e que synthetic_lines so e True quando o splitting ocorre, e o splitting nao ocorre para textos < 500 chars.
- Com a Mudanca 1, isso sera corrigido automaticamente.

### Arquivo: `video-processor/ai_services.py` (funcao `analyze_with_kakttus`)

**Mudanca 5 - Fallback para transcricoes muito curtas:**
- Se `event_detector` retornar 0 candidatos E a transcricao contiver keywords de gol (regex simples), forcar o uso do pipeline legado (que envia a transcricao inteira ao Ollama/Kakttus)
- Isso garante que mesmo sem pre-filtro, a IA receba o texto para analise

## Resumo Tecnico

| Mudanca | Arquivo | Efeito |
|---------|---------|--------|
| Threshold 500 para 100 | event_detector.py | Textos curtos sao divididos em linhas sinteticas |
| Chunk adaptativo 15/40 | event_detector.py | Mais linhas para textos curtos |
| Window size dinamico | event_detector.py | Nao rejeita textos com poucas linhas |
| Fallback keyword | ai_services.py | Se pre-filtro falhar mas houver keywords, usa IA direta |

Estas mudancas afetam apenas transcricoes curtas. Transcricoes longas (> 500 chars, > 10 linhas) continuam funcionando exatamente como antes.
