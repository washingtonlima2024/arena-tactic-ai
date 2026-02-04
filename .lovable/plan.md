
# Plano: Habilitar Transcrição 100% Local (Whisper Local para Áudio Base64)

## Problema Identificado

A função `transcribe_audio_base64` (usada pelo endpoint `/api/transcribe-audio` e pelo hook `useVideoAudioTranscription`) **exige OPENAI_API_KEY** e **não usa Whisper Local**, mesmo quando está instalado e habilitado.

### Mapeamento de Funções

| Função | Usado por | Usa Local Whisper? | Problema |
|--------|-----------|-------------------|----------|
| `transcribe_audio_base64()` | `/api/transcribe-audio`, Live Broadcast | ❌ Só OpenAI | **ERRO** - Não funciona offline |
| `transcribe_audio()` | Interno | ❌ Só OpenAI | Função auxiliar antiga |
| `transcribe_audio_file()` | Pipeline de arquivos | ✅ Local primeiro | Correto, mas não usada para base64 |
| `_transcribe_with_local_whisper()` | Interno | ✅ Local | Disponível, mas não chamada |

### Fluxo Atual (Problema)

```text
Frontend (Live Broadcast)
    │
    ▼
useVideoAudioTranscription.ts
    │ supabase.functions.invoke("transcribe-audio")
    │ ou apiClient.transcribeAudio()
    ▼
/api/transcribe-audio
    │
    ▼
ai_services.transcribe_audio_base64()
    │
    ▼
❌ OPENAI_API_KEY obrigatória!
    └── Erro: "OPENAI_API_KEY not configured"
```

---

## Solução

Modificar `transcribe_audio_base64()` para usar a mesma lógica de prioridade de `transcribe_audio_file()`:

1. **Local Whisper** (GRATUITO, offline) - PRIORIDADE
2. **OpenAI Whisper API** (pago) - Fallback
3. **ElevenLabs** (pago) - Último recurso

### Código Proposto

**Arquivo**: `video-processor/ai_services.py` (função `transcribe_audio_base64`, linha ~5624)

```python
def transcribe_audio_base64(audio_base64: str, language: str = 'pt') -> Optional[str]:
    """
    Transcribe audio from base64 data using best available provider.
    
    Priority:
    1. Local Whisper (FREE, offline)
    2. OpenAI Whisper API (paid)
    
    Args:
        audio_base64: Base64-encoded audio data
        language: Language code
    
    Returns:
        Transcription text or None on error
    """
    import tempfile
    
    # Decode base64 and save to temp file
    audio_data = base64.b64decode(audio_base64)
    
    with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as tmp:
        tmp.write(audio_data)
        tmp_path = tmp.name
    
    try:
        # PRIORIDADE 1: Local Whisper (GRATUITO)
        if LOCAL_WHISPER_ENABLED and _FASTER_WHISPER_AVAILABLE:
            print(f"[TranscribeBase64] 🆓 Usando Local Whisper...")
            result = _transcribe_with_local_whisper(tmp_path, match_id=None)
            if result.get('success') and result.get('text'):
                print(f"[TranscribeBase64] ✓ Local Whisper: {len(result['text'])} chars")
                return result['text']
            else:
                print(f"[TranscribeBase64] Local Whisper falhou: {result.get('error')}")
        
        # PRIORIDADE 2: OpenAI Whisper (pago)
        if OPENAI_API_KEY:
            print(f"[TranscribeBase64] Tentando OpenAI Whisper...")
            text = transcribe_audio(tmp_path, language)
            if text:
                print(f"[TranscribeBase64] ✓ OpenAI: {len(text)} chars")
                return text
        
        # Nenhum provedor disponível
        raise ValueError(
            "Nenhum provedor de transcrição disponível. "
            "Instale faster-whisper (gratuito) ou configure OPENAI_API_KEY."
        )
    finally:
        import os
        os.unlink(tmp_path)
```

---

## Mudanças Detalhadas

### Mudança 1: Atualizar `transcribe_audio_base64` (ai_services.py)

**Linhas ~5624-5652**

- Adicionar verificação de `LOCAL_WHISPER_ENABLED` e `_FASTER_WHISPER_AVAILABLE`
- Chamar `_transcribe_with_local_whisper()` como primeira opção
- Manter OpenAI como fallback
- Melhorar mensagem de erro

### Mudança 2: Adicionar conversão para WAV se necessário

O WebM/OGG do navegador pode precisar de conversão para o Whisper Local:

```python
# Converter para WAV se necessário (Whisper prefere WAV)
wav_path = tmp_path.replace('.webm', '.wav')
try:
    subprocess.run([
        'ffmpeg', '-y', '-i', tmp_path,
        '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
        wav_path
    ], capture_output=True, timeout=30)
    transcribe_path = wav_path
except:
    transcribe_path = tmp_path  # Usar original se conversão falhar
```

---

## Nota Sobre Ollama

**Ollama NÃO faz transcrição de áudio** - ele é um modelo de texto (LLM) usado para:
- Análise de eventos
- Geração de descrições
- Chat/conversação

Para transcrição de áudio, as opções são:
- **Whisper Local** (faster-whisper) - GRATUITO
- **OpenAI Whisper API** - pago
- **ElevenLabs Scribe** - pago
- **Google Gemini** - pago (para arquivos de vídeo)

---

## Fluxo Após Correção

```text
Frontend (Live Broadcast)
    │
    ▼
/api/transcribe-audio
    │
    ▼
ai_services.transcribe_audio_base64()
    │
    ├── 1️⃣ LOCAL_WHISPER_ENABLED? ──▶ _transcribe_with_local_whisper() ✅
    │                                      │
    │                                      └── Transcrição 100% LOCAL e GRÁTIS
    │
    └── 2️⃣ OPENAI_API_KEY? ──────────▶ transcribe_audio() (pago)
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `video-processor/ai_services.py` | Linha ~5624: Reescrever `transcribe_audio_base64` com prioridade para Local Whisper |

---

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Whisper Local instalado | ❌ Erro - exige OpenAI | ✅ Transcreve offline |
| Sem API keys | ❌ Erro | ✅ Funciona com Whisper Local |
| OpenAI configurada | ✅ Funciona | ✅ Usa como fallback |
| Live Broadcast | ❌ Falha | ✅ Transcrição em tempo real |

---

## Verificação Pós-Implementação

1. Iniciar servidor Python
2. Verificar log: `[AI Services] LOCAL_WHISPER: ✓ disponível`
3. Testar Live Broadcast - áudio deve ser transcrito
4. Verificar log: `[TranscribeBase64] 🆓 Usando Local Whisper...`
