

## Diagnostico: Propriedade errada no objeto de arquivo

### Causa raiz das legendas ausentes

O servidor Python retorna os arquivos SRT com a propriedade **`filename`**, mas o frontend `loadSrtLines` procura a propriedade **`name`**. Como `f.name` e sempre `undefined`, o filtro de textos retorna `[]`, e o `find` para selecionar o arquivo SRT tambem falha.

Resposta do servidor (exemplo):
```json
{ "filename": "first_half.srt", "url": "/api/storage/.../srt/first_half.srt", "size": 18083 }
```

Codigo no frontend (ERRADO):
```typescript
f.name?.toLowerCase().endsWith('.srt')  // f.name = undefined!
srtFiles.find((f: any) => f.name?.toLowerCase().includes('full'))  // sempre falso
targetSrt.name  // undefined
```

Resultado: o SRT nunca e carregado, `subtitleLines` chega vazio ao backend, e o servidor imprime "Sem legendas".

### Causa raiz do audio ausente

A correcao do `anullsrc` ja esta no codigo do `server.py`, mas o servidor Python roda **localmente** na maquina do usuario. Para que a mudanca tenha efeito, o servidor precisa ser **reiniciado**. Se o servidor nao foi reiniciado desde a ultima edicao, as vinhetas continuam sendo geradas sem audio (`-an`), e o concat descarta o audio dos clips.

### Correcoes

#### 1. `src/components/media/ExportPreviewDialog.tsx` - Corrigir `f.name` para `f.filename`

Trocar todas as referencias a `f.name` e `targetSrt.name` por `f.filename` e `targetSrt.filename` na funcao `loadSrtLines`:

- Linha 465: `f.name` -> `f.filename`
- Linha 476: `f.name` -> `f.filename` (2 ocorrencias)
- Linha 480: `targetSrt.name` -> `targetSrt.filename`
- Linha 481: `targetSrt.name` -> `targetSrt.filename`
- Linha 488: `targetSrt.name` -> `targetSrt.filename`

Tambem corrigir o `loadSRTForPreview` (preview CC overlay) que provavelmente tem o mesmo bug com `f.name`.

#### 2. Audio - Nota para o usuario

Informar que o servidor Python precisa ser reiniciado para aplicar a correcao do audio silencioso nas vinhetas. A mudanca ja esta no `server.py` (anullsrc).

### Tabela de mudancas

| Arquivo | Mudanca |
|---|---|
| `src/components/media/ExportPreviewDialog.tsx` | Corrigir `f.name` -> `f.filename` e `targetSrt.name` -> `targetSrt.filename` em `loadSrtLines` e `loadSRTForPreview` |

### Resultado esperado

- O SRT sera carregado corretamente do servidor
- As linhas de legenda serao filtradas e enviadas no `renderSpec`
- O backend gerara o ASS e queimara as legendas no MP4
- Apos reiniciar o servidor Python, o audio tambem sera preservado

