

# Corrigir: Zero Eventos no Pipeline Kakttus

## Problemas Identificados

### Bug 1: Fallback por keywords nunca executa quando Kakttus retorna 0 eventos

No `ai_services.py`, a logica do fallback por keywords (linha 6215) esta **dentro** do bloco `if events:` (linha 6100). Quando `analyze_with_kakttus()` retorna uma lista vazia (`[]`), o Python avalia `if []:` como `False` e pula TODO o bloco -- incluindo o fallback e o `return`.

```text
Fluxo atual quando events = []:
  1. events = kakttus_result.get('events', [])   # []
  2. if events:                                   # False! Pula tudo
  3.   enrichment...                              # PULADO
  4.   fallback keywords...                       # PULADO
  5.   return final_events                        # PULADO
  6. except...                                    # Nao ha excecao
  7. if can_use_gpt:                              # Provavelmente False
  8. # Cai no fluxo legado ou retorna vazio
```

### Bug 2: Transcricao parcial do Smart Import pode ser reutilizada

O Smart Import salva a transcricao inicial (curta, ~12k chars) no storage. Quando o pipeline async roda, ele encontra essa transcricao no storage e, se passar na validacao de densidade (>= 3 chars/s), usa-a em vez de rodar o Whisper completo. Resultado: a IA recebe texto insuficiente.

## Solucao

### Arquivo 1: `video-processor/ai_services.py`

**Mover o fallback por keywords para FORA do `if events:`**, garantindo que execute mesmo quando Kakttus retorna 0 eventos.

Estrutura corrigida:

```text
events = kakttus_result.get('events', [])

if events:
    enriched_events = _enrich_events(events, ...)
    final_events = deduplicate_goal_events(enriched_events)
    # ... enriquecimento de timestamps ...
else:
    final_events = []

# FALLBACK (agora FORA do if events:)
if len(final_events) < 10:
    # ... deteccao por keywords (SRT ou texto bruto) ...
    # ... merge com deduplicacao ...

if final_events:
    # salvar JSONs, consolidar
    ...
    return final_events

# Se chegou aqui, tentar fluxo legado
```

Mudancas especificas:
1. Adicionar `else: final_events = []` apos o bloco `if events:` (depois da linha ~6210)
2. Mover o bloco de fallback (linhas 6212-6302) para fora do `if events:`, mantendo-o no mesmo nivel de indentacao
3. Mover o bloco de salvamento e `return` (linhas 6304-6414) para fora tambem, protegendo com `if final_events:`

### Arquivo 2: `video-processor/server.py`

**Marcar transcricoes do Smart Import como parciais** para evitar reutilizacao indevida.

No pipeline async, quando a transcricao vem do Smart Import (pre-loaded), adicionar um sufixo ou flag ao nome do arquivo para que a validacao do storage nao a confunda com uma transcricao completa:

- Na secao onde salva `first_half_transcription.txt` (linha 9208), verificar se a transcricao foi gerada pelo Whisper Local ou se veio pre-loaded do Smart Import
- Se veio pre-loaded E o Whisper ainda vai rodar, NAO sobrescrever os arquivos de storage com a transcricao parcial
- Adicionar log explicando a decisao

Alternativa mais simples: na validacao `_validate_storage_transcription`, aumentar o threshold minimo de caracteres de 100 para 1000 (para que transcricoes muito curtas do Smart Import sejam descartadas).

## Detalhes Tecnicos

### ai_services.py -- Reestruturacao do bloco Kakttus (linhas 6098-6414)

**Antes:**
```python
events = kakttus_result.get('events', [])

if events:                          # <-- Se vazio, pula TUDO
    enriched_events = ...
    final_events = ...
    # timestamp enrichment (100 linhas)
    # fallback keywords (90 linhas)    # <-- NUNCA EXECUTA se events=[]
    # save JSONs (100 linhas)
    return final_events              # <-- NUNCA EXECUTA se events=[]
```

**Depois:**
```python
events = kakttus_result.get('events', [])

if events:
    enriched_events = ...
    final_events = ...
    # timestamp enrichment (100 linhas)
else:
    final_events = []
    print("[Kakttus] ⚠ Nenhum evento detectado pela IA")

# FALLBACK (FORA do if events:)
if len(final_events) < 10:
    # keyword detection...
    # merge...

# SAVE (FORA do if events:)
if final_events:
    # save JSONs...
    return final_events
```

### server.py -- Proteger contra transcricao parcial (linha ~9208)

Adicionar verificacao: se `first_half_text` veio do request (Smart Import) e nao do Whisper, salvar com nome diferente (`first_half_transcription_partial.txt`) para que o pipeline nao o reutilize como transcricao completa na proxima execucao.

## Arquivos a Modificar

1. **`video-processor/ai_services.py`** -- Reestruturar bloco Kakttus para que fallback execute mesmo com 0 eventos
2. **`video-processor/server.py`** -- Proteger contra reutilizacao de transcricao parcial do Smart Import
