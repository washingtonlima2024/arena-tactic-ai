

# Corrigir Crash do Pipeline: `UnboundLocalError: time_module`

## Causa Raiz

O Python trata `time_module` como variavel **local** em toda a funcao `_process_match_pipeline` porque existe um `import time as time_module` na linha 8810 (dentro do heartbeat loop). Quando a funcao tenta usar `time_module.time()` na linha 8298, **antes** desse import, o Python lanca `UnboundLocalError` porque a variavel local ainda nao foi atribuida.

```text
Linha 7855: import time as time_module  ← nivel do modulo (IGNORADO pela funcao)

Funcao _process_match_pipeline():
  Linha 8298: start_time = time_module.time()  ← CRASH! variavel local nao existe ainda
  ...
  Linha 8810: import time as time_module  ← faz Python tratar como LOCAL em toda a funcao
```

Este e um comportamento classico do Python: se uma variavel e atribuida em qualquer lugar dentro de uma funcao, o Python a trata como local em **todo** o escopo dessa funcao, mesmo em linhas anteriores a atribuicao.

## Solucao

Remover o `import time as time_module` redundante da linha 8810, ja que o import no nivel do modulo (linha 7855) ja cobre toda a funcao. Sem esse import local, o Python usa normalmente a referencia do modulo.

## Mudanca

### Arquivo: `video-processor/server.py`

**Linha 8810**: Remover a linha `import time as time_module`

```text
ANTES (linhas 8809-8812):
  # Heartbeat loop - incrementa progresso enquanto Whisper processa
  import time as time_module          ← REMOVER esta linha
  last_heartbeat = time_module.time()
  pipeline_start = time_module.time()

DEPOIS (linhas 8809-8811):
  # Heartbeat loop - incrementa progresso enquanto Whisper processa
  last_heartbeat = time_module.time()
  pipeline_start = time_module.time()
```

## Resultado Esperado

- O pipeline `_process_match_pipeline` inicia normalmente sem crash
- O job sai do status `queued` e progride para `preparing`, `splitting`, `transcribing`, etc.
- O progresso real e reportado ao frontend via polling
- Nenhuma outra logica e alterada

