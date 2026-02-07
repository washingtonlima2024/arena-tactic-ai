
# Corrigir Extracao de Audio no Pipeline Automatico (Smart Import)

## Problema

No processo manual, o audio e extraido corretamente para `storage/{match_id}/audio/` porque o pipeline chama `transcribe_large_video()` que internamente extrai e salva o audio.

No processo automatico (Smart Import), o pipeline async tem o Phase 2.5 que deveria extrair o audio, mas ele pode estar falhando silenciosamente. O problema esta em dois pontos:

### Causa Raiz 1: Erro silencioso na extracao

O Phase 2.5 (linhas 8007-8110 do server.py) esta dentro de um `try/except` que apenas loga erros mas nao interrompe o pipeline. Se o symlink criado na resolucao do video estiver quebrado ou o caminho nao existir, a extracao falha e o pipeline continua sem audio.

### Causa Raiz 2: Transcricao pre-carregada pula `transcribe_large_video`

No pipeline manual, `transcribe_large_video()` (ai_services.py, linha 6913) salva automaticamente o audio extraido para o storage. No Smart Import, como a transcricao ja vem pre-carregada (5 min do Smart Import), o sistema pula `transcribe_large_video()` completamente. Entao a unica chance de extrair audio e no Phase 2.5, que se falhar, nao ha segunda tentativa.

## Solucao

Tornar a extracao de audio no Phase 2.5 mais robusta, adicionando fallbacks adicionais e garantindo que o audio seja extraido mesmo quando a transcricao ja esta pre-carregada.

## Mudancas

### 1. `video-processor/server.py` - Phase 2.5 (Audio Extraction)

Adicionar verificacao pos-extracao e fallback usando o video diretamente do storage:

**Apos o loop de extracao (apos linha 8110)**, adicionar:

```text
Se audio_files estiver vazio apos Phase 2.5:
  1. Buscar video diretamente em storage/{match_id}/videos/
  2. Extrair audio com FFmpeg
  3. Salvar em storage/{match_id}/audio/
  4. Logar sucesso ou falha
```

Alem disso, melhorar a resolucao de caminhos no inicio do Phase 2.5:
- Quando o video e um symlink, verificar se o target existe
- Se o target nao existir, buscar o video no storage diretamente
- Usar `get_subfolder_path(match_id, 'videos')` como ultima opcao

### 2. `video-processor/server.py` - Fallback pos-transcricao

Apos Phase 3 (transcricao), adicionar uma verificacao extra:

```text
Se nenhum arquivo de audio existe em storage/{match_id}/audio/:
  -> Chamar extracao de audio diretamente do video no storage
  -> Usar o mesmo metodo que transcribe_large_video usa (FFmpeg -> MP3)
```

Isso garante que mesmo se o Phase 2.5 falhar, o audio sera extraido antes dos clips.

### 3. Adicionar log detalhado

Em todas as etapas de extracao de audio, adicionar logs claros:
- Antes: caminho do video, se existe, tamanho
- Depois: caminho do audio gerado, tamanho, se foi salvo

## Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `video-processor/server.py` | Melhorar Phase 2.5 com fallback de storage direto + verificacao pos-transcricao |

## Fluxo Apos Implementacao

```text
Smart Import inicia Pipeline Async
  |
  v
Phase 2.5: Extrair audio do video (symlink)
  SUCESSO -> audio salvo em storage/audio/
  FALHA -> Fallback: buscar video em storage/videos/ e extrair diretamente
    SUCESSO -> audio salvo
    FALHA -> Log detalhado do erro
  |
  v
Phase 3: Transcricao (usa pre-carregada do Smart Import)
  |
  v
Verificacao pos-transcricao: audio existe em storage/audio/?
  NAO -> Ultima tentativa: extrair audio de qualquer video em storage/videos/
  SIM -> Continuar
  |
  v
Phase 3.5: Analise, Clips, etc. (com audio disponivel)
```

## Resultado Esperado

- O audio sempre sera extraido e salvo em `storage/{match_id}/audio/` tanto no fluxo manual quanto no automatico
- Se o Phase 2.5 falhar por qualquer motivo (symlink quebrado, permissao, etc.), o fallback garante que o audio seja extraido antes de prosseguir
- Logs detalhados facilitam debugging de problemas futuros
