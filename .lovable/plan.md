
# Corrigir Extracão de Audio no Pipeline Automatico - Abordagem Direta

## Diagnostico

Comparando o processo manual (que funciona) com o automatico (que nao funciona), encontrei a diferenca fundamental:

- **Manual** (`ai_services.py`): Le o video, extrai audio com FFmpeg, depois usa `save_file(match_id, 'audio', audio_data, filename)` para salvar -- le o MP3 como bytes e escreve diretamente no storage. Isso SEMPRE funciona.

- **Automatico** (`server.py` Phase 2.5): Resolve symlinks do tmpdir, extrai audio para tmpdir, depois usa `shutil.copy2()` para copiar do tmpdir para o storage. Isso falha silenciosamente quando:
  - O symlink esta quebrado ou o path nao resolve corretamente
  - O tmpdir tem permissoes diferentes
  - O FFmpeg falha ao ler atraves do symlink

Os fallbacks que adicionamos anteriormente usam a mesma abordagem (tmpdir + copy), por isso tambem nao funcionam.

## Solucao

Criar uma funcao auxiliar `ensure_audio_extracted()` que usa a **mesma abordagem do processo manual**: busca o video direto do storage (sem symlinks), extrai audio com FFmpeg, e salva usando `save_file()` (a funcao que comprovadamente funciona).

## Mudancas

### `video-processor/server.py`

**1. Nova funcao auxiliar (antes do pipeline async)**

Criar `ensure_audio_extracted(match_id)` que:
1. Verifica se ja existem arquivos .mp3/.wav em `storage/{match_id}/audio/`
2. Se nao existem, busca videos diretamente no banco de dados (tabela Video)
3. Para cada video encontrado, resolve o caminho fisico em `storage/{match_id}/videos/`
4. Extrai audio com FFmpeg (mesmos parametros do manual)
5. Salva usando `save_file(match_id, 'audio', audio_data, filename)` -- o MESMO metodo que funciona no manual
6. Retorna lista de arquivos de audio gerados

**2. Chamar `ensure_audio_extracted` em dois pontos do pipeline async**

- Apos Phase 2.5 (se `audio_files` estiver vazio)
- Apos Phase 3 (verificacao pos-transcricao, substituindo o codigo de emergencia atual)

### Logica detalhada da funcao

```text
def ensure_audio_extracted(match_id):
  audio_dir = get_subfolder_path(match_id, 'audio')
  existing = list(audio_dir.glob('*.mp3')) + list(audio_dir.glob('*.wav'))
  
  if existing:
    return existing  # Ja tem audio, nada a fazer
  
  # Buscar videos no storage DIRETAMENTE (sem symlinks)
  video_dir = get_subfolder_path(match_id, 'videos')
  video_files = encontrar videos em video_dir e video_dir/original
  
  # Tambem buscar do banco de dados (como Phase 5 faz para clips)
  session = get_session()
  db_videos = session.query(Video).filter_by(match_id=match_id).all()
  
  for cada video encontrado:
    # Resolver caminho real do arquivo
    video_path = video_dir / video.file_name
    
    # Extrair audio com FFmpeg (direto, sem tmpdir)
    with tempfile.NamedTemporaryFile(suffix='.mp3') as tmp:
      cmd = ['ffmpeg', '-y', '-i', str(video_path), '-vn', '-acodec', 'libmp3lame', '-ab', '128k', tmp.name]
      subprocess.run(cmd, ...)
      
      # Usar save_file() - MESMO METODO DO MANUAL
      with open(tmp.name, 'rb') as f:
        audio_data = f.read()
      save_file(match_id, 'audio', audio_data, f"{half_label}_audio.mp3")
  
  return list(audio_dir.glob('*.mp3'))
```

## Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `video-processor/server.py` | Nova funcao `ensure_audio_extracted()` + chamadas em Phase 2.5 e pos-transcricao |

## Por que esta solucao vai funcionar

1. Usa o **exato mesmo metodo** (`save_file`) que funciona no processo manual
2. Busca o video **diretamente do storage** sem depender de symlinks do tmpdir
3. Tambem consulta o **banco de dados** para encontrar videos (como Phase 5 faz para clips, que funciona)
4. Nao depende de `shutil.copy2` que pode estar falhando
5. Log detalhado em cada etapa para debug futuro
