

# Corrigir Pipeline: Transcrição do Storage Parcial Causa 0 Eventos

## Problema Diagnosticado

O jogo `f60ae001` processou e finalizou com "0 eventos, 0 clips" porque:

1. O Smart Import anterior salvou uma transcrição de 5 minutos no storage (368 bytes em `texts/first_half_transcription.txt` e 626 bytes em `srt/first_half.srt`)
2. Mesmo com a correção de `firstHalfTranscription: undefined` no Upload.tsx, o pipeline tem um **fallback que lê arquivos do storage** (linhas 8420-8444)
3. Esse fallback encontra o arquivo de 368 bytes, verifica `len > 100` (368 > 100 = verdadeiro), e marca `has_preloaded_first = True`
4. Com essa flag ativa, o pipeline **pula o Whisper completamente** (linha 8473-8493)
5. A IA analisa apenas 368 bytes de texto e encontra 0 eventos

```text
FLUXO ATUAL (bug):

Upload.tsx envia firstHalfTranscription = undefined  (corrigido)
    |
    v
Pipeline: has_preloaded_first = False  (ok)
    |
    v
Fallback storage (linha 8425): encontra first_half_transcription.txt (368 bytes)
    |
    v
368 > 100 chars = True -> has_preloaded_first = True  (BUG!)
    |
    v
Pipeline PULA WHISPER -> IA analisa 368 bytes -> 0 eventos
```

## Solucao

### Mudanca 1: Validar tamanho minimo da transcricao do storage

**Arquivo:** `video-processor/server.py` (linhas 8420-8444 e 8447-8471)

O threshold de 100 caracteres e muito baixo para distinguir uma transcricao real de uma parcial do Smart Import. Para um video de 15 MB (~10-26 minutos), a transcricao completa deveria ter pelo menos 2000-5000 caracteres.

Solucao: Comparar o tamanho da transcricao com a duracao do video. Se a relacao chars/segundo for muito baixa, ignorar a transcricao do storage e rodar Whisper.

```text
ANTES (linha 8428):
  has_preloaded_first = len(first_half_text.strip()) > 100

DEPOIS:
  text_len = len(first_half_text.strip())
  first_dur = video_durations.get('first', 0)
  
  # Validar se transcricao e proporcional ao video
  # Uma transcricao real tem ~8-15 chars/segundo
  # Smart Import de 5 min em video de 26 min teria ~1.5 chars/s
  if first_dur > 300 and text_len > 0:
      chars_per_sec = text_len / first_dur
      if chars_per_sec < 3:
          print(f"[ASYNC-PIPELINE] Transcricao do storage DESCARTADA: "
                f"{text_len} chars / {first_dur:.0f}s = {chars_per_sec:.1f} chars/s (< 3 = parcial)")
          has_preloaded_first = False
          first_half_text = ''  # Limpar para forcar Whisper
      else:
          has_preloaded_first = True
          print(f"[ASYNC-PIPELINE] Transcricao do storage ACEITA: "
                f"{text_len} chars / {first_dur:.0f}s = {chars_per_sec:.1f} chars/s")
  else:
      has_preloaded_first = text_len > 100
```

A mesma logica deve ser aplicada para o segundo tempo (linhas 8447-8471), usando `video_durations.get('second', 0)`.

### Mudanca 2: Garantir video_durations esta populado ANTES do fallback do storage

**Arquivo:** `video-processor/server.py`

Atualmente, `video_durations` e preenchido na Phase 2.5 (linhas 8280-8400), que roda ANTES da Phase 3. Isso e correto - o valor ja estara disponivel no momento do fallback. Nenhuma mudanca necessaria aqui.

### Mudanca 3: Limpar transcricao parcial do storage ao iniciar pipeline

**Arquivo:** `video-processor/server.py` (apos linha 8166, no inicio da Phase 1)

Alternativa complementar: quando o pipeline async inicia, verificar se existe uma transcricao suspeitamente curta no storage e remove-la, forcando a re-transcricao.

```text
# Phase 1 inicio - Limpar transcricoes parciais do Smart Import
for half_label in ['first', 'second']:
    txt_path = get_subfolder_path(match_id, 'texts') / f'{half_label}_half_transcription.txt'
    srt_path = get_subfolder_path(match_id, 'srt') / f'{half_label}_half.srt'
    
    for fpath in [txt_path, srt_path]:
        if fpath.exists():
            file_size = fpath.stat().st_size
            if file_size < 1000:  # Menor que 1KB = provavel Smart Import parcial
                print(f"[ASYNC-PIPELINE] Removendo transcricao parcial: {fpath.name} ({file_size} bytes)")
                fpath.unlink()
```

Isso garante que transcricoes menores que 1KB (como a de 368 bytes ou 626 bytes do Smart Import) sejam removidas antes do pipeline tentar usa-las como fallback.

### Mudanca 4: Seguranca adicional - forcar re-transcricao em reprocessamento

**Arquivo:** `video-processor/server.py` (linha 8473)

Quando o pipeline e executado em modo de reprocessamento (o jogo ja existia), ele deveria sempre rodar o Whisper em vez de reusar transcricoes antigas. Adicionar um parametro `forceTranscription` que o frontend pode enviar:

```text
# Na verificacao de pre-loaded transcriptions
force_transcription = data.get('forceTranscription', False)

if (has_preloaded_first or has_preloaded_second) and not force_transcription:
    # Usar transcricoes carregadas
    ...
else:
    # Rodar Whisper
    ...
```

## Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `video-processor/server.py` | Linhas 8420-8444: Validar chars/segundo antes de aceitar transcricao do storage |
| `video-processor/server.py` | Linhas 8447-8471: Mesma validacao para segundo tempo |
| `video-processor/server.py` | Apos linha 8166: Limpar transcricoes parciais (< 1KB) no inicio do pipeline |
| `video-processor/server.py` | Linha 8473: Suporte a `forceTranscription` para reprocessamento |

## Resultado Esperado

- Transcricao parcial de 368 bytes sera descartada (chars/s < 3)
- Whisper roda no video completo (~15 MB, ~26 minutos)
- IA analisa transcricao completa com range 0-90 min
- Eventos e gols sao detectados corretamente
- Clips sao gerados automaticamente na Phase 5

