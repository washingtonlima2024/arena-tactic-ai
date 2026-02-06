
# Implementar Download de Video do YouTube no Pipeline de Processamento

## Resumo

Atualmente, quando o usuario cola um link do YouTube na aba "Link/Embed", o sistema apenas salva a URL como referencia mas **nao baixa o video**. O `download_video_with_progress` no backend usa `requests.get()`, que so funciona para links diretos (MP4, Google Drive, Dropbox). Para YouTube, ele recebe HTML em vez do video.

O plano e adicionar suporte a download de videos do YouTube usando a biblioteca `yt-dlp` no backend Python, integrando com o pipeline existente para que o video baixado passe pelo mesmo processo de transcricao e analise que qualquer arquivo enviado.

## Fluxo Proposto

```text
Usuario cola link YouTube
        |
        v
Frontend detecta plataforma "YouTube"
        |
        v
Ao clicar "Iniciar Analise":
  - Se servidor Python online:
      Frontend chama POST /api/storage/{matchId}/videos/download-url
      com flag youtube=true
        |
        v
  Backend detecta URL YouTube
        |
        v
  yt-dlp baixa o video (melhor qualidade ate 720p)
  com progresso via download_jobs
        |
        v
  Arquivo salvo em storage/videos/{matchId}/
        |
        v
  Registro criado na tabela videos (SQLite)
        |
        v
  Segmento atualizado no frontend com file_url local
        |
        v
  Pipeline normal de transcricao + analise continua
```

## Alteracoes Necessarias

### 1. Backend: `video-processor/requirements.txt`
- Adicionar `yt-dlp>=2024.1.0` as dependencias

### 2. Backend: `video-processor/server.py`

**Funcao `download_video_with_progress`** (linhas ~8537-8620):
- Adicionar deteccao de URLs YouTube (`youtube.com`, `youtu.be`)
- Quando for YouTube, usar `yt-dlp` como subprocesso em vez de `requests.get`
- Comando: `yt-dlp -f "bestvideo[height<=720]+bestaudio/best[height<=720]" --merge-output-format mp4 -o {output_path} {url}`
- Capturar progresso via stdout parsing do yt-dlp (linhas `[download] XX.X%`)
- Atualizar `download_jobs[job_id]` com progresso em tempo real
- Manter o restante do fluxo igual (detectar duracao com ffprobe, registrar no banco)

**Funcao `convert_to_direct_url`** (linhas ~8515-8534):
- Adicionar early return para URLs YouTube (nao tentar converter, pois serao tratadas pelo yt-dlp)

### 3. Frontend: `src/pages/Upload.tsx`

**Funcao `addVideoLink`** (~linha 666):
- Quando a plataforma for "YouTube", mostrar aviso de que o download sera feito pelo servidor Python
- Verificar se o servidor Python esta online; se nao, mostrar toast explicando que YouTube requer servidor local

**Funcao `handleStartAnalysis`** (~linha 1364):
- Antes de iniciar transcricao, verificar se algum segmento e `isLink: true` e de plataforma YouTube
- Para esses segmentos: chamar endpoint `POST /api/storage/{matchId}/videos/download-url` e aguardar conclusao via polling em `GET /api/storage/download-status/{jobId}`
- Ao completar download, atualizar segmento com `url` local, `isLink: false`, e `status: 'complete'`
- Entao continuar com o pipeline normal de transcricao/analise

### 4. Frontend: `src/lib/apiClient.ts`

- Adicionar metodo `downloadVideoFromUrl(matchId, url, videoType, filename?)` que chama `POST /api/storage/{matchId}/videos/download-url`
- Adicionar metodo `getDownloadStatus(jobId)` que chama `GET /api/storage/download-status/{jobId}`
- (O endpoint no backend ja existe mas o apiClient nao tem wrapper para ele)

## Detalhes Tecnicos

### yt-dlp no Backend
- Usar como subprocesso (`subprocess.Popen`) para capturar progresso em tempo real
- Formato de saida forcado para MP4 (`--merge-output-format mp4`)
- Limitar qualidade a 720p para balancear tamanho/qualidade
- Timeout de 30 minutos para downloads longos
- Validar arquivo pos-download com ffprobe

### Polling de Progresso no Frontend
- O endpoint `GET /api/storage/download-status/{jobId}` ja existe no backend
- Frontend fara polling a cada 2 segundos durante download
- Mostrar barra de progresso no `ProcessingProgress` component existente
- Fases: "Baixando do YouTube (XX%)" -> "Registrando video" -> "Transcrevendo..."

### Tratamento de Erros
- YouTube video privado/indisponivel: mostrar mensagem clara
- yt-dlp nao instalado: fallback com mensagem "Execute: pip install yt-dlp"
- Servidor offline: mostrar toast "Download do YouTube requer servidor Python local"

## Arquivos Afetados
1. `video-processor/requirements.txt` - adicionar yt-dlp
2. `video-processor/server.py` - logica de download YouTube
3. `src/pages/Upload.tsx` - fluxo de download pre-analise
4. `src/lib/apiClient.ts` - wrappers para endpoints de download
