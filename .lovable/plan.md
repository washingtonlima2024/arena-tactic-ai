

# Fix: Erro "Unexpected token '<'" na Importação Inteligente

## Problema Identificado

Quando voce tenta usar a Importacao Inteligente com upload de arquivo, o codigo faz um `POST` para `/api/upload-video`, mas esse endpoint nao existe no backend (retorna 405 - Method Not Allowed com pagina HTML). O codigo tenta interpretar esse HTML como JSON e causa o erro.

## Causa Raiz

No `SmartImportCard.tsx`, o upload de video usa `fetch()` direto sem:
1. Verificar se a resposta foi bem-sucedida antes de interpretar como JSON
2. Usar o endpoint correto do backend (que requer um `match_id`)

O problema principal e que na Importacao Inteligente, a partida ainda nao foi criada, entao nao existe `match_id` para usar no endpoint de upload padrao (`/api/storage/{matchId}/videos/upload`).

## Solucao

Reestruturar o fluxo do SmartImportCard para funcionar em dois cenarios:

### Cenario 1: Upload de Arquivo
- Fazer upload usando o endpoint correto com um `match_id` temporario, OU
- Usar o `apiClient.post` para enviar o arquivo para `/api/smart-import/transcribe` diretamente (o backend Python recebe o arquivo e faz a transcricao em um unico passo)

### Cenario 2: URL de Video
- Enviar a URL diretamente para `/api/smart-import/transcribe` (ja funciona)

## Alteracoes Planejadas

### 1. `src/components/upload/SmartImportCard.tsx`

**Remover** o upload separado para `/api/upload-video` e unificar o fluxo:

- Para **arquivo**: Enviar o video como `FormData` diretamente para `/api/smart-import/transcribe` (o backend recebe o arquivo, transcreve e retorna o texto)
- Para **URL**: Enviar a URL como JSON para `/api/smart-import/transcribe` (comportamento atual)
- Adicionar verificacao de `response.ok` antes de chamar `.json()`
- Usar `buildApiUrl` via `apiClient` para montar a URL corretamente
- Tratar erros HTTP com mensagens claras (ex: "Servidor retornou erro 405")

### 2. `src/lib/apiClient.ts`

Adicionar metodo `smartImportTranscribe` que aceita tanto arquivo quanto URL:

```text
smartImportTranscribe(options: { file?: File, videoUrl?: string })
  -> Se file: envia FormData com multipart
  -> Se videoUrl: envia JSON com video_url
  -> Retorna { transcription: string }
  -> Usa timeout longo (5 min) pois inclui transcricao
```

## Detalhes Tecnicos

```text
Fluxo Corrigido:
  [Usuario seleciona video]
         |
         v
  smartImportTranscribe({ file ou videoUrl })
    -> POST /api/smart-import/transcribe
    -> FormData (arquivo) ou JSON (url)
    -> Timeout: 5 minutos
         |
         v
  extractMatchInfo(transcription)
    -> POST /api/extract-match-info
    -> JSON { transcription }
    -> Timeout: 2 minutos
         |
         v
  [Exibir resultado para revisao]
```

As mudancas no frontend garantem que:
- Nenhuma chamada e feita para endpoints inexistentes
- Respostas HTML sao tratadas sem crash
- O fluxo funciona para upload de arquivo e URL
- O backend Python precisa aceitar o arquivo em `/api/smart-import/transcribe` (multipart) ou a URL (JSON)

