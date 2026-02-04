
# Plano: Corrigir Botões de Re-análise e Busca de Transcrição

## Problemas Identificados

### 1. **Formato de resposta incompatível em `listMatchFiles`**

O `apiClient.listMatchFiles()` define o tipo de retorno como `files.srt`, mas o backend (`/api/matches/{matchId}/files`) retorna `folders.srt`.

**Frontend espera:**
```typescript
files: { srt: any[], videos: any[], ... }
```

**Backend retorna:**
```json
{ "matchId": "...", "folders": { "srt": [...], "videos": {...}, ... } }
```

**Localização:** 
- `src/lib/apiClient.ts` linhas 1430-1444 (tipo definido)
- `src/pages/Events.tsx` linhas 291-292 (`result?.files?.srt` - sempre undefined!)

---

### 2. **ReanalyzeHalfDialog busca no Supabase Cloud (modo local ativo)**

A função `loadExistingTranscription()` em `ReanalyzeHalfDialog.tsx` usa `supabase.from('analysis_jobs')` para buscar a transcrição original, mas o sistema está em modo **100% local** com SQLite.

**Código problemático:**
```typescript
const { data } = await supabase
  .from('analysis_jobs')  // ❌ Não existe no Cloud!
  .select('result')
  .eq('match_id', matchId)
```

**Localização:** `src/components/events/ReanalyzeHalfDialog.tsx` linhas 141-182

---

### 3. **ReanalyzeHalfDialog verifica vídeos no Supabase**

As funções `checkVideoSize()` e `handleExtractTranscription()` também usam `supabase.from('videos')` em vez do servidor local.

**Localização:** `src/components/events/ReanalyzeHalfDialog.tsx` linhas 104-139 e 225-278

---

### 4. **Botão "Analisar Transcrição Existente" não encontra arquivos**

Como `result?.files?.srt` é sempre `undefined` (problema 1), a UI nunca detecta que há arquivos SRT salvos e não exibe o alerta de análise manual.

---

## Solução Proposta

### Correção 1: Ajustar `apiClient.listMatchFiles` para o formato correto

```typescript
// src/lib/apiClient.ts
listMatchFiles: async (matchId: string): Promise<{
  matchId: string;
  statistics: { totalFiles: number; totalSizeBytes: number; totalSizeMB: number };
  folders: {  // Renomear 'files' para 'folders' para corresponder ao backend
    srt: any[];
    texts: any[];
    audio: any[];
    images: any[];
    json: any[];
    videos: { original: any[]; optimized: any[] };
    clips: Record<string, any[]>;
  };
}> => {
  return apiRequest(`/api/matches/${matchId}/files`);
},
```

---

### Correção 2: Atualizar `Events.tsx` para usar `folders` em vez de `files`

```typescript
// src/pages/Events.tsx - linha 291-292
const srtFiles = result?.folders?.srt || [];  // Antes: files?.srt
```

---

### Correção 3: Migrar `ReanalyzeHalfDialog` para servidor local

Substituir todas as chamadas `supabase.from(...)` por `apiClient.*`:

**a) loadExistingTranscription():**
```typescript
// ANTES (Supabase Cloud)
const { data } = await supabase.from('analysis_jobs')...

// DEPOIS (Servidor Local)
const files = await apiClient.listMatchFiles(matchId);
const srtFiles = files?.folders?.srt || [];
const txtFiles = files?.folders?.texts || [];

// Priorizar arquivo SRT, fallback para TXT
const transcriptionFile = srtFiles.find(f => 
  f.filename.includes(half) || f.filename.includes('transcription')
) || txtFiles[0];

if (transcriptionFile) {
  const content = await apiClient.get<string>(transcriptionFile.url);
  setOriginalTranscription(content);
}
```

**b) checkVideoSize():**
```typescript
// ANTES (Supabase Cloud)
const { data: videos } = await supabase.from('videos')...

// DEPOIS (Servidor Local)
const videos = await apiClient.getVideos(matchId);
```

**c) handleExtractTranscription():**
```typescript
// ANTES (Supabase Cloud)
const { data: videos } = await supabase.from('videos')...

// DEPOIS (Servidor Local)
const videos = await apiClient.getVideos(matchId);
```

**d) handleReanalyze() - deletar eventos:**
```typescript
// ANTES (Supabase Cloud)
await supabase.from('match_events').delete()...

// DEPOIS (Servidor Local)
await apiClient.delete(`/api/matches/${matchId}/events?half=${half}`);
```

---

### Correção 4: Criar endpoint para deletar eventos por half (se não existir)

```python
# video-processor/server.py
@app.route('/api/matches/<match_id>/events', methods=['DELETE'])
def delete_match_events(match_id: str):
    """Delete match events, optionally filtered by half."""
    half = request.args.get('half')  # 'first' ou 'second'
    
    with get_db_session() as session:
        query = session.query(MatchEvent).filter_by(match_id=match_id)
        
        if half:
            query = query.filter_by(match_half=half)
        
        deleted = query.delete()
        
    return jsonify({'success': True, 'deleted_count': deleted})
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/apiClient.ts` | Corrigir tipo de retorno de `listMatchFiles` (files → folders) |
| `src/pages/Events.tsx` | Usar `folders.srt` em vez de `files.srt` |
| `src/components/events/ReanalyzeHalfDialog.tsx` | Migrar de Supabase para apiClient |
| `video-processor/server.py` | Verificar/adicionar endpoint DELETE para eventos por half |

---

## Fluxo Corrigido

```text
1. Usuário clica "Re-analisar 1º Tempo"
   ↓
2. ReanalyzeHalfDialog abre
   ↓
3. loadExistingTranscription() busca SRT/TXT via apiClient.listMatchFiles()
   ↓
4. Se encontrar, carrega conteúdo via apiClient.get(url)
   ↓
5. Usuário vê transcrição original pré-carregada
   ↓
6. Ao confirmar, eventos são deletados via apiClient.delete()
   ↓
7. Nova análise é disparada com a transcrição
```

---

## Benefícios

- **Transcrições encontradas**: Arquivos SRT/TXT salvos no storage serão detectados corretamente
- **Modo local funcional**: ReanalyzeHalfDialog não dependerá mais do Supabase Cloud
- **Consistência**: Todos os componentes usarão o mesmo servidor local
- **Re-análise funcional**: Botão de re-analisar terá acesso às transcrições existentes
