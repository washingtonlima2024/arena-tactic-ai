

## Plano: Sistema de Qualidade Dupla para Vídeos

### Resumo

Implementar um sistema automático de qualidade dupla onde cada vídeo terá duas versões: **Original (para renderização/export)** e **Proxy (para processamento interno)**. Isso permite trabalhar com arquivos de 4GB+ de forma eficiente, usando o proxy para transcrição e análise, enquanto mantém o original para geração de clips de alta qualidade.

### Cálculo de Tamanhos (1 tempo = 47 minutos)

| Qualidade | Resolução | Bitrate | Tamanho (47min) |
|-----------|-----------|---------|-----------------|
| 4K Original | 3840x2160 | 40 Mbps | ~14 GB |
| 1080p Original | 1920x1080 | 10 Mbps | ~3.5 GB |
| 720p Original | 1280x720 | 5 Mbps | ~1.8 GB |
| **480p Proxy** | 854x480 | 2 Mbps | **~700 MB** |
| **360p Proxy** | 640x360 | 1 Mbps | **~350 MB** |

**Economia**: Um vídeo de 4GB (1080p) → Proxy de ~700MB = **82% menos espaço** para processamento.

### Arquitetura Proposta

```text
storage/videos/{match_id}/
├── original/
│   └── primeiro_tempo.mp4     # 4GB - Alta qualidade para export
└── proxy/
    └── primeiro_tempo_proxy.mp4  # 700MB - Para transcrição/análise
```

### Fluxo de Processamento

```text
1. UPLOAD do vídeo original
   └─ Salvar em storage/videos/{match_id}/original/

2. CONVERSÃO automática para proxy
   └─ FFmpeg: 480p, CRF 28, preset medium
   └─ Salvar em storage/videos/{match_id}/proxy/

3. TRANSCRIÇÃO usa proxy
   └─ Chunks de 10s extraídos do proxy
   └─ Whisper processa áudio mais leve

4. EXTRAÇÃO DE CLIPS usa original
   └─ Clips de alta qualidade para export
   └─ Thumbnails geradas do original
```

### Alterações no Modelo Video

```python
# video-processor/models.py - Novos campos

class Video(Base):
    # ... campos existentes ...
    
    # Novos campos para qualidade dupla
    original_url = Column(Text)           # URL do vídeo original
    proxy_url = Column(Text)              # URL do proxy 480p/360p
    proxy_status = Column(String(50))     # pending | converting | ready | error
    proxy_progress = Column(Integer, default=0)
    original_size_bytes = Column(BigInteger)
    proxy_size_bytes = Column(BigInteger)
    proxy_resolution = Column(String(20), default='480p')
```

### Configuração de Qualidade do Proxy

```python
# video-processor/media_chunker.py

PROXY_PRESETS = {
    '480p': {
        'resolution': '854x480',
        'crf': 28,
        'audio_bitrate': '128k',
        'preset': 'medium'
    },
    '360p': {
        'resolution': '640x360',
        'crf': 30,
        'audio_bitrate': '96k',
        'preset': 'fast'
    },
    '720p_lite': {
        'resolution': '1280x720',
        'crf': 26,
        'audio_bitrate': '128k',
        'preset': 'fast'
    }
}
```

### Nova Função de Geração de Proxy

```python
# video-processor/media_chunker.py

def create_video_proxy(
    original_path: str,
    output_path: str,
    preset: str = '480p',
    on_progress: callable = None
) -> dict:
    """
    Cria versão proxy otimizada do vídeo para processamento.
    
    Args:
        original_path: Caminho do vídeo original
        output_path: Caminho para salvar o proxy
        preset: '480p', '360p', ou '720p_lite'
        on_progress: Callback de progresso
        
    Returns:
        Dict com status, tamanho e economia
    """
```

### Atualização do Fluxo de Transcrição

Modificar `_process_transcription_job()` para usar proxy:

```python
def _process_transcription_job(job_id, match_id, video_path):
    # Verificar se proxy existe
    proxy_path = get_or_create_proxy(video_path, match_id)
    
    # Usar proxy para chunking (mais rápido, menos espaço)
    if proxy_path:
        working_path = proxy_path
        print(f"[Transcription] Usando proxy: {proxy_path}")
    else:
        working_path = video_path
        print(f"[Transcription] Usando original: {video_path}")
    
    # Preparar mídia (chunks do proxy)
    prepare_media_for_job(job_id, working_path)
    
    # ... resto do processamento
```

### Configuração do Usuário

Adicionar configuração na interface:

```typescript
interface VideoQualityConfig {
  autoCreateProxy: boolean;      // Criar proxy automaticamente
  proxyResolution: '480p' | '360p' | '720p_lite';
  useProxyForTranscription: boolean;
  useProxyForAnalysis: boolean;
  keepOriginalAfterProxy: boolean;  // Manter original ou deletar
}
```

### Endpoint de Configuração

```python
@app.route('/api/settings/video-quality', methods=['GET', 'POST'])
def video_quality_settings():
    """Configurações de qualidade de vídeo."""
    if request.method == 'GET':
        return jsonify({
            'auto_create_proxy': True,
            'proxy_resolution': '480p',
            'use_proxy_for_transcription': True,
            'use_proxy_for_analysis': True
        })
    # POST para salvar...
```

### Indicador de Status no Frontend

```typescript
// Componente de status do vídeo
interface VideoStatusProps {
  video: {
    original_url: string;
    proxy_url: string | null;
    proxy_status: 'pending' | 'converting' | 'ready' | 'error';
    proxy_progress: number;
    original_size_bytes: number;
    proxy_size_bytes: number;
  };
}

// Exibir:
// - "Original: 3.5 GB (1080p)"
// - "Proxy: 700 MB (480p) ✓"
// - "Economia: 80%"
```

### Arquivos a Criar/Modificar

| Arquivo | Operação | Descrição |
|---------|----------|-----------|
| `video-processor/models.py` | Modificar | Adicionar campos proxy_url, proxy_status, etc. |
| `video-processor/media_chunker.py` | Modificar | Adicionar create_video_proxy() |
| `video-processor/server.py` | Modificar | Integrar proxy no fluxo de upload e transcrição |
| `video-processor/migrate_db.py` | Modificar | Migração para novos campos |
| `src/hooks/useVideoUpload.ts` | Criar | Hook para gerenciar upload com proxy |
| `src/components/upload/VideoQualityIndicator.tsx` | Criar | Indicador visual de qualidade |

### Benefícios

1. **Espaço de Processamento**: Chunks de proxy ocupam ~80% menos
2. **Velocidade**: Transcrição e análise mais rápidas com arquivo menor
3. **Flexibilidade**: Export final sempre em alta qualidade
4. **Economia de Bandwidth**: Proxy mais leve para streaming durante edição

### Critérios de Aceite

1. Upload de vídeo 1080p+ gera proxy 480p automaticamente
2. Transcrição usa proxy quando disponível
3. Geração de clips usa vídeo original
4. Interface mostra status do proxy e economia de espaço
5. Configuração permite escolher resolução do proxy

