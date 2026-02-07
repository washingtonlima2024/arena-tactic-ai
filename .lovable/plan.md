

# Corrigir Pipeline para Links de Video (nao-YouTube)

## Problema Identificado

Quando voce adiciona um video por **link direto** (nao YouTube), o sistema nao roteia para o pipeline assincrono do servidor local, mesmo quando o servidor esta online. Isso acontece porque a condicao `shouldUseAsyncPipeline` na linha 1646 do `Upload.tsx` avalia como `false`:

```text
shouldUseAsyncPipeline = isLocalServerOnline && (hasLargeVideos || isUsingLocalMode || hadYoutubeDownload)
```

- `hasLargeVideos` = false (links tem size: 0)
- `isUsingLocalMode` = false (quando nao esta em modo local)
- `hadYoutubeDownload` = false (nao e YouTube)

Resultado: o link cai no pipeline sequencial que tenta transcrever via Whisper no frontend, mas nao consegue porque e apenas uma URL sem arquivo local.

## Solucao

Adicionar uma verificacao para **segmentos com link** (`isLink: true`) na condicao `shouldUseAsyncPipeline`, forçando o uso do pipeline assincrono quando o servidor esta online e ha links nao-YouTube. O servidor local ja sabe resolver URLs e baixar videos automaticamente.

## Mudancas

### Arquivo: `src/pages/Upload.tsx`

**1. Incluir links na condicao do pipeline assincrono (linha 1646)**

Adicionar verificacao `hasLinkSegments` para garantir que links diretos tambem usem o pipeline assincrono:

```text
ANTES:
const shouldUseAsyncPipeline = isLocalServerOnline && (hasLargeVideos || isUsingLocalMode || hadYoutubeDownload);

DEPOIS:
const hasLinkSegments = currentSegments.some(s => s.isLink && s.status === 'ready');
const shouldUseAsyncPipeline = isLocalServerOnline && (hasLargeVideos || isUsingLocalMode || hadYoutubeDownload || hasLinkSegments);
```

**2. Adicionar log para links (apos logs existentes)**

Adicionar log de debug para links detectados:

```text
console.log('Has link segments:', hasLinkSegments);
```

Isso garante que links diretos (Google Drive, Dropbox, URLs de video) sejam processados pelo servidor local, que ja possui a logica de `resolve_video_path` e download direto implementada no endpoint `/api/smart-import/transcribe` e no pipeline `_process_match_pipeline`.

## Resultado Esperado

- Links diretos de video agora sao processados pelo pipeline assincrono quando o servidor esta online
- O servidor local baixa o video, extrai audio, transcreve e analisa automaticamente
- O progresso e mostrado na interface com SoccerBallLoader e barra de progresso
- Links do YouTube continuam usando o fluxo de download dedicado (yt-dlp) antes do pipeline

