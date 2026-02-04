
## Plano: Sistema de Upload de Arquivos Grandes com Fatiamento

### Resumo Executivo

Implementar um sistema robusto de upload de vídeos e áudios que suporta arquivos de até 4GB+ através de fatiamento no frontend (chunks de 8MB), remontagem no backend, conversão automática de formatos, e transcrição com Whisper local usando segmentos de 45 segundos com sobreposição.

### Arquitetura Proposta

```text
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
├─────────────────────────────────────────────────────────────────┤
│  ChunkedUploader                                                │
│  ├── Divide arquivo em partes de 8MB                            │
│  ├── Envia partes com uploadId, ordem, tamanho                  │
│  ├── Suporta pausar/continuar/cancelar                          │
│  ├── Exibe progresso detalhado por parte                        │
│  └── Persiste estado em localStorage para retomada              │
│                                                                  │
│  UploadProgressPanel                                            │
│  ├── Barra de progresso total + por parte                       │
│  ├── Velocidade de envio + tempo estimado                       │
│  ├── Estados: preparando → enviando → montando → convertendo    │
│  │             → extraindo áudio → transcrevendo                │
│  └── Log de eventos + botões pausar/continuar/cancelar          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                  │
├─────────────────────────────────────────────────────────────────┤
│  Upload Jobs                                                     │
│  ├── /api/upload/init → Cria uploadId, prepara diretório        │
│  ├── /api/upload/chunk → Recebe partes (qualquer ordem)         │
│  ├── /api/upload/complete → Verifica e monta arquivo final      │
│  ├── /api/upload/status → Retorna progresso completo            │
│  └── /api/upload/cancel → Limpa partes temporárias              │
│                                                                  │
│  Estrutura de diretórios por uploadId:                          │
│  data/uploads/{uploadId}/                                       │
│  ├── chunks/           # Partes temporárias                     │
│  ├── media/           # Arquivo montado + convertido            │
│  ├── audio/           # WAV 16kHz extraído                      │
│  ├── transcript/      # SRT + TXT                               │
│  └── logs/            # Eventos detalhados                      │
│                                                                  │
│  Processing Queue                                               │
│  ├── Fila única para evitar jobs simultâneos pesados           │
│  ├── Estado persistente em SQLite                               │
│  └── Retomada automática após reinício do servidor              │
└─────────────────────────────────────────────────────────────────┘
```

### Extensões Aceitas e Conversões

| Tipo | Extensões Aceitas | Formato de Saída |
|------|------------------|------------------|
| Vídeo | mp4, mov, mkv, avi, mpeg, webm | MP4 H.264 + AAC |
| Áudio | mp3, wav, m4a, aac, ogg, flac | WAV mono 16kHz |

### Fluxo de Processamento Completo

```text
1. PREPARAÇÃO (Frontend)
   ├── Validar extensão do arquivo
   ├── Calcular MD5 parcial (primeiros 10MB) para detectar duplicados
   ├── Dividir arquivo em chunks de 8MB
   └── Iniciar upload com /api/upload/init

2. ENVIO COM FATIAMENTO (Frontend → Backend)
   ├── Enviar cada chunk com: uploadId, chunkIndex, totalChunks, checksum
   ├── Backend armazena em data/uploads/{uploadId}/chunks/
   ├── Chunks podem chegar fora de ordem
   ├── Frontend rastreia partes enviadas/pendentes
   └── Suporta retomada: consulta /api/upload/status ao reabrir

3. MONTAGEM (Backend)
   ├── Verificar integridade de todos os chunks recebidos
   ├── Concatenar em ordem para arquivo final
   ├── Validar tamanho total e checksum opcional
   └── Mover para data/uploads/{uploadId}/media/

4. CONVERSÃO AUTOMÁTICA (Backend)
   ├── Vídeo → MP4 H.264 + AAC (CRF 23, preset medium)
   ├── Áudio → WAV mono 16kHz
   └── Salvar informações de codec original para logs

5. EXTRAÇÃO DE ÁUDIO (Backend - se vídeo)
   └── FFmpeg: -vn -acodec pcm_s16le -ar 16000 -ac 1

6. FATIAMENTO PARA WHISPER (Backend)
   ├── Dividir áudio em segmentos de 45 segundos
   ├── Sobreposição de 2 segundos entre segmentos
   ├── Salvar em data/uploads/{uploadId}/audio/segment_001.wav
   └── Gerar manifest.json com metadados

7. TRANSCRIÇÃO (Backend - Whisper Local)
   ├── Processar cada segmento sequencialmente
   ├── Salvar checkpoint após cada segmento
   ├── Ajustar timestamps considerando sobreposição
   └── Combinar em SRT e TXT finais

8. CONCLUSÃO (Backend → Frontend)
   ├── Atualizar status do job para "complete"
   ├── Mover arquivos finais para storage/{matchId}/
   └── Notificar frontend via polling
```

### Modelo de Dados: UploadJob

```python
class UploadJob(Base):
    __tablename__ = 'upload_jobs'
    
    id = Column(String(36), primary_key=True)
    match_id = Column(String(36))
    original_filename = Column(String(255))
    file_extension = Column(String(10))
    file_type = Column(String(20))  # 'video' ou 'audio'
    total_size_bytes = Column(BigInteger)
    
    # Chunking
    chunk_size_bytes = Column(Integer, default=8*1024*1024)  # 8MB
    total_chunks = Column(Integer)
    received_chunks = Column(JSON, default=list)  # Lista de índices recebidos
    chunks_dir = Column(Text)
    
    # Status
    status = Column(String(50))  # uploading, assembling, converting, extracting, transcribing, complete, error, paused
    stage = Column(String(50))  # Estágio atual detalhado
    progress = Column(Integer, default=0)
    current_step = Column(String(255))
    error_message = Column(Text)
    
    # Velocidade e tempo
    upload_speed_bytes_per_sec = Column(Integer)
    estimated_time_remaining_sec = Column(Integer)
    
    # Conversão
    needs_conversion = Column(Boolean, default=False)
    conversion_progress = Column(Integer, default=0)
    output_path = Column(Text)
    
    # Transcrição
    transcription_segment_current = Column(Integer, default=0)
    transcription_segment_total = Column(Integer, default=0)
    transcription_progress = Column(Integer, default=0)
    srt_path = Column(Text)
    txt_path = Column(Text)
    
    # Log de eventos
    events_log = Column(JSON, default=list)
    
    # Timestamps
    created_at = Column(DateTime)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    paused_at = Column(DateTime)
```

### Endpoints do Backend

```text
POST   /api/upload/init
       Body: { matchId, filename, fileSize, totalChunks, fileType, mimeType }
       Response: { uploadId, chunkSize, uploadUrl, resumeData? }

POST   /api/upload/chunk
       Body: FormData com chunk, uploadId, chunkIndex, checksum
       Response: { received: true, chunkIndex, progress }

POST   /api/upload/complete
       Body: { uploadId }
       Response: { success, jobId, nextStage }

GET    /api/upload/status/{uploadId}
       Response: { 
         status, stage, progress, 
         receivedChunks, totalChunks,
         uploadSpeed, estimatedTime,
         transcriptionProgress, transcriptionSegment,
         events: [{timestamp, message}],
         error?
       }

POST   /api/upload/pause/{uploadId}
POST   /api/upload/resume/{uploadId}
DELETE /api/upload/cancel/{uploadId}
```

### Componentes do Frontend

#### 1. ChunkedUploadService (src/lib/chunkedUpload.ts)

```typescript
interface ChunkUploadOptions {
  file: File;
  matchId: string;
  chunkSize?: number;  // default 8MB
  onProgress?: (state: UploadState) => void;
  onComplete?: (result: UploadResult) => void;
  onError?: (error: Error) => void;
}

interface UploadState {
  uploadId: string;
  status: 'preparing' | 'uploading' | 'paused' | 'assembling' | 'converting' | 'transcribing' | 'complete' | 'error';
  totalBytes: number;
  uploadedBytes: number;
  currentChunk: number;
  totalChunks: number;
  speedBps: number;
  estimatedSecondsRemaining: number;
  transcriptionProgress?: number;
  transcriptionSegment?: { current: number; total: number };
  events: Array<{ timestamp: Date; message: string }>;
}

class ChunkedUploadService {
  async start(options: ChunkUploadOptions): Promise<string>
  pause(): void
  resume(): Promise<void>
  cancel(): Promise<void>
  getState(): UploadState
  
  // Persiste estado em localStorage para retomada
  static getPersistedUploads(matchId: string): UploadState[]
  static clearPersistedUpload(uploadId: string): void
}
```

#### 2. LargeFileUploadPanel (src/components/upload/LargeFileUploadPanel.tsx)

Interface de progresso completa:

```text
┌─────────────────────────────────────────────────────────────┐
│  📁 primeiro_tempo.mov (3.2 GB)                             │
│  ════════════════════════════════════════════ 68%          │
│                                                             │
│  Etapa: Enviando arquivo                                    │
│  ├── Parte 245/400 enviada                                  │
│  ├── Velocidade: 12.4 MB/s                                  │
│  └── Tempo restante: ~4 min 32s                             │
│                                                             │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                   │
│  │ ✓  │ │ ✓  │ │ ⟳  │ │ ○  │ │ ○  │  ...                 │
│  │ 1  │ │ 2  │ │ 3  │ │ 4  │ │ 5  │                       │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘                   │
│                                                             │
│  Log:                                                       │
│  • 14:32:15 - Iniciando upload (400 partes)                 │
│  • 14:33:01 - 100 partes enviadas                           │
│  • 14:33:45 - 200 partes enviadas                           │
│                                                             │
│  [  ⏸ Pausar  ]  [  ✕ Cancelar  ]                          │
└─────────────────────────────────────────────────────────────┘
```

Estados visuais para cada etapa:
1. **Preparando arquivo** - Ícone de arquivo, cor azul
2. **Enviando** - Ícone de upload animado, cor amarela
3. **Montando** - Ícone de quebra-cabeça, cor roxo
4. **Convertendo vídeo** - Ícone de vídeo com engrenagem, cor laranja
5. **Extraindo áudio** - Ícone de onda de áudio, cor verde-água
6. **Fatiando áudio** - Ícone de tesoura, cor rosa
7. **Transcrevendo** - Ícone de microfone animado, cor verde

### Transcrição com Whisper Local

```text
Configuração:
- Segmentos de 45 segundos (ótimo para Whisper)
- Sobreposição de 2 segundos entre segmentos
- Formato WAV mono 16kHz
- Checkpoints salvos após cada segmento

Para 47 min de vídeo:
- 2820 segundos total
- ~65 segmentos de 45s
- Checkpoint a cada segmento = nunca reinicia do zero
```

Fluxo de transcrição:

```python
def transcribe_with_checkpoints(upload_id: str, audio_path: str):
    segments = split_audio_with_overlap(audio_path, 45, 2)
    
    for i, segment in enumerate(segments):
        # Verificar checkpoint existente
        checkpoint = load_checkpoint(upload_id, i)
        if checkpoint:
            results.append(checkpoint)
            update_progress(i + 1, len(segments))
            continue
        
        # Transcrever com Whisper Local
        text = whisper_local.transcribe(segment.path)
        
        # Salvar checkpoint
        save_checkpoint(upload_id, i, text, segment.start_ms, segment.end_ms)
        
        # Atualizar progresso
        update_progress(i + 1, len(segments))
    
    # Combinar resultados com ajuste de timestamps
    final_srt = merge_segments_to_srt(results)
    final_txt = merge_segments_to_text(results)
```

### Fila de Processamento

```python
# Fila global para evitar sobrecarga
processing_queue = Queue()
MAX_CONCURRENT_JOBS = 1  # Apenas 1 job pesado por vez

def job_processor():
    while True:
        job = processing_queue.get()
        try:
            process_upload_job(job)
        except Exception as e:
            mark_job_failed(job.id, str(e))
        finally:
            processing_queue.task_done()

# Thread de processamento iniciada no startup
threading.Thread(target=job_processor, daemon=True).start()
```

### Verificação de Integridade

```python
def verify_file_integrity(upload_id: str) -> bool:
    chunks_dir = get_chunks_dir(upload_id)
    job = get_upload_job(upload_id)
    
    # Verificar número de chunks
    if len(job.received_chunks) != job.total_chunks:
        return False
    
    # Verificar tamanho de cada chunk
    for i in range(job.total_chunks):
        chunk_path = chunks_dir / f"chunk_{i:06d}"
        if not chunk_path.exists():
            return False
        
        expected_size = job.chunk_size_bytes
        if i == job.total_chunks - 1:
            expected_size = job.total_size_bytes % job.chunk_size_bytes or job.chunk_size_bytes
        
        if chunk_path.stat().st_size != expected_size:
            return False
    
    return True
```

### Arquivos a Criar/Modificar

| Arquivo | Operação | Descrição |
|---------|----------|-----------|
| `video-processor/models.py` | Modificar | Adicionar modelo `UploadJob` |
| `video-processor/migrate_db.py` | Modificar | Migração para tabela `upload_jobs` |
| `video-processor/chunked_upload.py` | Criar | Lógica de recepção e montagem de chunks |
| `video-processor/audio_processor.py` | Criar | Extração e fatiamento de áudio para Whisper |
| `video-processor/server.py` | Modificar | Adicionar endpoints `/api/upload/*` |
| `src/lib/chunkedUpload.ts` | Criar | Serviço de upload com fatiamento no frontend |
| `src/components/upload/LargeFileUploadPanel.tsx` | Criar | UI de progresso detalhada |
| `src/components/upload/ChunkProgressGrid.tsx` | Criar | Visualização de chunks |
| `src/hooks/useChunkedUpload.ts` | Criar | Hook React para gerenciar upload |

### Persistência e Retomada

**Frontend (localStorage):**
```typescript
interface PersistedUpload {
  uploadId: string;
  matchId: string;
  filename: string;
  totalChunks: number;
  sentChunks: number[];
  lastUpdated: string;
}

// Ao reabrir página, verificar uploads pendentes
const pendingUploads = localStorage.getItem('pending_uploads');
// Exibir opção de retomar ou cancelar
```

**Backend (SQLite):**
- `upload_jobs` armazena estado completo
- `received_chunks` lista chunks já recebidos
- Endpoint `/api/upload/status` retorna estado para frontend

### Critérios de Aceite

1. Upload de arquivo 4GB+ funciona sem travamentos
2. Retomada automática após queda de conexão
3. Progresso visual por parte e total
4. Conversão automática para formatos ideais
5. Transcrição com checkpoints (nunca reinicia do zero)
6. Verificação de integridade de arquivos
7. Log de eventos visível na interface
8. Botões pausar/continuar/cancelar funcionais
9. Estado persiste ao recarregar página
10. Fila evita múltiplos jobs pesados simultâneos
