

# Plano: Corrigir Importação Incremental do Segundo Tempo

## Problema Identificado

Quando o usuário importa apenas o segundo tempo de uma partida (que já tinha o primeiro tempo analisado), **nenhum evento do 2º tempo é gerado**. 

## Diagnóstico

Após análise detalhada do código:

| Componente | Problema |
|------------|----------|
| **Upload.tsx** (linhas 1504-1528) | A transcrição do 2º tempo só é coletada de `secondHalfSrt` OU do segmento. Se o SRT foi arrastado mas não associado, fica vazio |
| **Upload.tsx** (linhas 1517-1519) | O filtro de segmentos do 2º tempo depende de `s.half === 'second'` que pode não estar setado |
| **Upload.tsx** (linhas 1543-1552) | O pipeline assíncrono envia `secondHalfTranscription` mas não valida se está vazio antes |
| **server.py** (linhas 7772-7790) | O backend só processa se `len(second_half_transcription.strip()) > 100`. Se estiver vazio, ignora silenciosamente |

### Fluxo Atual (Problema)

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  IMPORTAÇÃO DO 2º TEMPO (modo local)                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Usuário vincula vídeo do 2º tempo (LocalFileBrowser)                     │
│     └── Segmento criado com half: 'second', videoType: 'second_half' ✓       │
│                                                                              │
│  2. Usuário arrasta SRT do 2º tempo (HalfDropzone)                           │
│     └── secondHalfSrt setado ✓                                               │
│     └── handleSrtDrop tenta associar ao segmento...                          │
│         └── ⚠️ Filtro usa (s.half === 'second')                              │
│         └── ⚠️ Se half não estiver setado, SRT não é associado!              │
│                                                                              │
│  3. handleStartAnalysis() inicia pipeline assíncrono                         │
│     └── Lê secondHalfSrt → secondHalfTranscription ✓ (se tiver)              │
│     └── ⚠️ Mas também tenta ler do segmento.transcription (backup)           │
│     └── ⚠️ Se nenhum dos dois tem, secondHalfTranscription = ''              │
│                                                                              │
│  4. Backend recebe secondHalfTranscription                                   │
│     └── ⚠️ Se vazio ou < 100 chars → IGNORA SILENCIOSAMENTE                  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Solução Proposta

### Mudança 1: Melhorar associação SRT ao segmento (Upload.tsx)

Atualizar `handleSrtDrop` para ser mais robusto na associação:

**Arquivo**: `src/pages/Upload.tsx` (linhas 1057-1065)

```typescript
// ANTES:
if ((half === 'first' && (s.half === 'first' || s.videoType === 'first_half' || s.videoType === 'full')) ||
    (half === 'second' && (s.half === 'second' || s.videoType === 'second_half'))) {

// DEPOIS:
// 🔧 Melhorar matching: incluir segmentos sem half definido mas com videoType correto
const isFirstHalfSegment = s.half === 'first' || s.videoType === 'first_half' || s.videoType === 'full';
const isSecondHalfSegment = s.half === 'second' || s.videoType === 'second_half' || 
                            // Fallback: se não tem half e o nome sugere segundo tempo
                            (!s.half && s.name.toLowerCase().includes('segundo'));

if ((half === 'first' && isFirstHalfSegment) || (half === 'second' && isSecondHalfSegment)) {
```

### Mudança 2: Garantir que vídeo local tem `half` setado (Upload.tsx)

Atualizar `handleLocalFileSelect` para sempre setar `half`:

**Arquivo**: `src/pages/Upload.tsx` (linha 940)

```typescript
// ANTES:
half: localBrowserHalf || undefined,

// DEPOIS:
// 🔧 Garantir half baseado em videoType se não especificado
half: localBrowserHalf || (videoType === 'second_half' ? 'second' : videoType === 'first_half' ? 'first' : undefined),
```

### Mudança 3: Adicionar validação antes de chamar pipeline assíncrono (Upload.tsx)

Adicionar verificação e toast de erro se transcrição do 2º tempo estiver vazia quando há vídeo:

**Arquivo**: `src/pages/Upload.tsx` (após linha 1527)

```typescript
// 🆕 Validar que segundo tempo tem transcrição se tem vídeo
if (secondHalfSegments.length > 0 && !secondHalfTranscription) {
  console.error('[ASYNC] ⚠️ Vídeo do 2º tempo SEM transcrição! Abortando pipeline async.');
  toast({
    title: "⚠️ Transcrição do 2º tempo não encontrada",
    description: "Arraste o arquivo SRT do 2º tempo antes de iniciar a análise.",
    variant: "destructive"
  });
  setProcessingStage('idle');
  return;
}
```

### Mudança 4: Log detalhado no backend (server.py)

Adicionar logs para diagnóstico quando transcrição é ignorada:

**Arquivo**: `video-processor/server.py` (após linha 7774)

```python
# 🆕 Log quando transcrição do 2º tempo é ignorada
if not has_preloaded_second and second_half_transcription:
    print(f"[ASYNC-PIPELINE] ⚠️ 2nd half transcription too short ({len(second_half_transcription)} chars < 100) - IGNORED")
elif not second_half_transcription:
    print(f"[ASYNC-PIPELINE] ⚠️ 2nd half transcription EMPTY - will need Whisper or existing SRT file")
```

### Mudança 5: Buscar SRT do storage se não fornecido (server.py)

Adicionar fallback para buscar SRT salvo anteriormente:

**Arquivo**: `video-processor/server.py` (após linha 7790, dentro do bloco de transcrições pré-carregadas)

```python
# 🆕 Fallback: Se não tem transcrição do 2º tempo, tentar ler do storage
if not has_preloaded_second:
    existing_srt_path = get_subfolder_path(match_id, 'srt') / 'second_half.srt'
    existing_txt_path = get_subfolder_path(match_id, 'texts') / 'second_half_transcription.txt'
    
    if existing_srt_path.exists():
        with open(existing_srt_path, 'r', encoding='utf-8') as f:
            second_half_text = f.read()
        print(f"[ASYNC-PIPELINE] ✓ 2nd half transcription loaded from storage: {len(second_half_text)} chars")
    elif existing_txt_path.exists():
        with open(existing_txt_path, 'r', encoding='utf-8') as f:
            second_half_text = f.read()
        print(f"[ASYNC-PIPELINE] ✓ 2nd half TXT loaded from storage: {len(second_half_text)} chars")
```

---

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| SRT arrastado no 2º tempo | Pode não associar ao segmento | Sempre associa corretamente |
| Vídeo local do 2º tempo | Pode ficar sem `half` | Sempre tem `half: 'second'` |
| Pipeline async sem SRT | Ignora silenciosamente | Mostra erro claro e aborta |
| SRT já salvo no storage | Não usa | Usado como fallback automático |
| Placar após análise | Não atualizado | Sincronizado via `syncMatchScoreFromEvents` |

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Upload.tsx` | Melhorar associação SRT, garantir `half` no segmento, validação antes do async |
| `video-processor/server.py` | Logs de diagnóstico, fallback para SRT do storage |

---

## Diagrama do Fluxo Corrigido

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  IMPORTAÇÃO INCREMENTAL DO 2º TEMPO (CORRIGIDO)                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Vídeo vinculado → half: 'second' GARANTIDO ✓                             │
│                                                                              │
│  2. SRT arrastado → Matching robusto (half OU videoType OU nome) ✓           │
│                                                                              │
│  3. handleStartAnalysis()                                                    │
│     ├── Lê secondHalfSrt → transcription                                     │
│     ├── Valida: tem vídeo + sem transcrição? → ERRO + ABORT                  │
│     └── Envia para backend com transcrição ✓                                 │
│                                                                              │
│  4. Backend processa                                                         │
│     ├── Usa transcrição enviada OU                                           │
│     ├── Busca SRT/TXT do storage (fallback)                                  │
│     ├── Analisa eventos do 2º tempo                                          │
│     └── Gera clips + atualiza placar ✓                                       │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

