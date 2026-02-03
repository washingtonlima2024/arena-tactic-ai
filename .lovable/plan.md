
## Plano: Implementar Fatiamento de Mídia com FFmpeg

### Resumo

Implementar um sistema de fatiamento (chunking) de vídeo e áudio no servidor Python para processamento paralelo e resiliente de transcrições. O sistema dividirá vídeos em segmentos de duração fixa (default 10s), extrairá áudio WAV mono 16kHz para cada chunk, e gerará um manifest JSON para rastreabilidade.

### Arquitetura Proposta

```text
data/jobs/
└── {JOB_ID}/
    ├── source/
    │   └── video.mp4         # Vídeo original ou link simbólico
    └── media_chunks/
        ├── manifest.json     # Metadados de todos os chunks
        ├── chunk_000001.mp4  # Segmento de vídeo 0-10s
        ├── chunk_000001.wav  # Áudio extraído para transcrição
        ├── chunk_000002.mp4  # Segmento de vídeo 10-20s
        ├── chunk_000002.wav
        └── ...
```

### Alterações no Backend (Python)

#### 1. Novo Módulo `media_chunker.py`

Criar novo arquivo com funções de fatiamento:

```python
# video-processor/media_chunker.py

CHUNK_DURATION_DEFAULT = 10  # segundos

def get_video_duration(video_path: str) -> float:
    """Obtém duração do vídeo via ffprobe."""

def split_video_to_chunks(
    video_path: str,
    output_dir: str,
    chunk_duration: int = CHUNK_DURATION_DEFAULT
) -> list[dict]:
    """
    Divide vídeo em chunks de duração fixa.
    Retorna lista de chunk_info dicts.
    """

def extract_audio_wav(
    video_path: str,
    output_path: str,
    mono: bool = True,
    sample_rate: int = 16000
) -> bool:
    """Extrai áudio em WAV mono 16kHz para Whisper."""

def generate_manifest(
    job_id: str,
    chunks: list[dict],
    output_path: str
) -> dict:
    """Gera manifest.json com metadados."""

def is_chunk_valid(chunk_path: str) -> bool:
    """Verifica se chunk existe e tem tamanho > 0."""
```

#### 2. Estrutura do Manifest JSON

```json
{
  "job_id": "abc-123",
  "created_at": "2026-02-03T18:00:00Z",
  "source_video": "/path/to/video.mp4",
  "total_duration_ms": 2700000,
  "chunk_duration_ms": 10000,
  "total_chunks": 270,
  "chunks": [
    {
      "chunk_index": 1,
      "start_ms": 0,
      "end_ms": 10000,
      "duration_ms": 10000,
      "video_path": "chunk_000001.mp4",
      "audio_path": "chunk_000001.wav",
      "video_size_bytes": 512000,
      "audio_size_bytes": 320000
    }
  ]
}
```

#### 3. Atualização do Modelo `TranscriptionJob`

Adicionar campos ao modelo existente:

```python
# Novos campos em models.py TranscriptionJob
chunk_duration_seconds = Column(Integer, default=10)
manifest_path = Column(Text)
chunks_dir = Column(Text)
media_prepared = Column(Boolean, default=False)
```

#### 4. Novo Endpoint de Preparação de Mídia

```python
# Em server.py

@app.route('/api/jobs/<job_id>/prepare-media', methods=['POST'])
def prepare_job_media(job_id: str):
    """
    Fase 1: Download + split de vídeo + extração de áudio.
    Idempotente: pula chunks que já existem.
    """
```

#### 5. Atualização do Fluxo de Transcrição

Modificar `_process_transcription_job()`:

```python
def _process_transcription_job(job_id, match_id, video_path):
    # Fase 1: Preparar mídia (se não preparada)
    if not job.media_prepared:
        prepare_media_for_job(job_id, video_path)
    
    # Fase 2: Carregar manifest
    manifest = load_manifest(job.manifest_path)
    
    # Fase 3: Transcrever cada chunk WAV
    for chunk in manifest['chunks']:
        if chunk_already_transcribed(chunk):
            continue
        transcribe_chunk(chunk['audio_path'])
        update_job_progress(...)
    
    # Fase 4: Combinar resultados
    combine_transcriptions(...)
```

### Comandos FFmpeg

#### Obter Duração

```bash
ffprobe -v quiet -print_format json -show_format video.mp4
```

#### Split de Vídeo (Stream Copy - Rápido)

```bash
ffmpeg -y -ss 0 -i video.mp4 -t 10 -c copy -avoid_negative_ts make_zero chunk_000001.mp4
```

#### Extração de Áudio WAV Mono 16kHz

```bash
ffmpeg -y -i chunk_000001.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 chunk_000001.wav
```

### Alterações no Frontend

#### 1. Atualizar Interface `TranscriptionJob`

```typescript
// src/hooks/useTranscriptionJob.ts
export interface TranscriptionJob {
  // ... campos existentes ...
  
  // Novos campos
  chunk_duration_seconds?: number;
  manifest_path?: string;
  media_prepared?: boolean;
  current_chunk?: number;
  stage?: 'downloading' | 'splitting' | 'extracting_audio' | 'transcribing' | 'combining';
}
```

#### 2. Melhorar Indicador de Progresso

Atualizar componentes para mostrar estágio atual:

```typescript
const stageLabels = {
  downloading: 'Baixando vídeo...',
  splitting: 'Dividindo em chunks...',
  extracting_audio: 'Extraindo áudio...',
  transcribing: 'Transcrevendo chunks...',
  combining: 'Combinando resultados...'
};
```

### Lógica de Idempotência

```python
def should_process_chunk(chunk_index: int, chunks_dir: str) -> bool:
    """Retorna False se chunk já existe e é válido."""
    video_path = os.path.join(chunks_dir, f"chunk_{chunk_index:06d}.mp4")
    audio_path = os.path.join(chunks_dir, f"chunk_{chunk_index:06d}.wav")
    
    if os.path.exists(video_path) and os.path.getsize(video_path) > 0:
        if os.path.exists(audio_path) and os.path.getsize(audio_path) > 0:
            return False  # Já processado, pular
    
    return True  # Precisa processar
```

### Fluxo Completo

```text
1. Criar TranscriptionJob
   └─ status: 'queued'

2. _process_transcription_job() inicia em background
   └─ status: 'processing', stage: 'downloading'

3. Download do vídeo (se URL externa)
   └─ progress: 10%

4. Split em chunks de 10s
   └─ stage: 'splitting', progress: 15-25%

5. Extração de áudio WAV para cada chunk
   └─ stage: 'extracting_audio', progress: 25-40%

6. Gerar manifest.json
   └─ media_prepared: true

7. Transcrever cada chunk WAV com Whisper
   └─ stage: 'transcribing', progress: 40-90%
   └─ current_chunk: N, completed_chunks: M

8. Combinar transcrições com ajuste de timestamps
   └─ stage: 'combining', progress: 95%

9. Salvar SRT e TXT finais
   └─ status: 'completed', progress: 100%
```

### Arquivos a Criar/Modificar

| Arquivo | Operação | Descrição |
|---------|----------|-----------|
| `video-processor/media_chunker.py` | Criar | Módulo de fatiamento de mídia |
| `video-processor/models.py` | Modificar | Adicionar campos ao TranscriptionJob |
| `video-processor/server.py` | Modificar | Novo endpoint e fluxo de processamento |
| `src/hooks/useTranscriptionJob.ts` | Modificar | Novos campos na interface |
| `src/components/upload/TranscriptionQueue.tsx` | Modificar | Melhorar indicador de progresso |

### Critérios de Aceite

1. Após criar job, pasta `data/jobs/{JOB_ID}/media_chunks/` contém N arquivos MP4 e N arquivos WAV
2. Arquivo `manifest.json` presente com metadados corretos
3. Reexecutar job não reprocessa chunks existentes (idempotência)
4. Progress bar no frontend mostra estágio atual e chunks processados
5. Transcrição só inicia após todos os chunks WAV estarem prontos

### Detalhes Técnicos Adicionais

**Nomenclatura de Arquivos:**
- `chunk_000001.mp4`, `chunk_000002.mp4`, ... (zero-padding de 6 dígitos)
- Suporta até 999.999 chunks (~115 dias de vídeo a 10s/chunk)

**Configuração via Job:**
```json
{
  "match_id": "abc",
  "video_path": "/path/to/video.mp4",
  "config": {
    "chunk_duration_seconds": 10,
    "audio_sample_rate": 16000,
    "audio_channels": 1
  }
}
```

**Tratamento de Erros:**
- Se FFmpeg falhar em um chunk, marcar como `failed` no manifest e continuar
- Chunks com erro podem ser reprocessados individualmente
- Status `partial` se alguns chunks falharem mas maioria suceder
