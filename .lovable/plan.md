

# Corrigir Deleção do 1T no Frontend (Upload.tsx)

## Problema Real

As correções anteriores foram feitas apenas no backend (`server.py` e `ai_services.py`), mas o frontend (`Upload.tsx`) tambem precisa de proteção. Quando voce seleciona uma partida existente e adiciona apenas o video do 2T:

1. O frontend busca a transcrição existente do 1T no storage (linhas 1689-1704 e 1871-1886)
2. Envia essa transcrição do 1T para o backend junto com o video do 2T
3. O backend (na versão sem o fix) re-analisa o 1T e deleta os eventos originais

Mesmo com o fix no backend, o frontend não deveria enviar dados desnecessarios.

## Solução: Corrigir em `src/pages/Upload.tsx`

### Mudança 1 — Async Pipeline: Não enviar transcrição do 1T se não há video do 1T

Nas linhas 1689-1719 (async pipeline), o frontend busca transcrições existentes do storage e as passa para o backend. A correção:

Antes de buscar a transcrição existente do 1T, verificar se existe algum segmento do 1T nos `currentSegments`. Se não existe, não buscar nem enviar.

```text
// Linha ~1689 - ANTES:
if (!firstHalfTranscription) {
  const existingFirst = await apiClient.getExistingTranscription(matchId, 'first');
  firstHalfTranscription = existingFirst;
}

// DEPOIS:
const hasFirstHalfVideo = firstHalfSegments.length > 0;
if (!firstHalfTranscription && hasFirstHalfVideo) {
  const existingFirst = await apiClient.getExistingTranscription(matchId, 'first');
  firstHalfTranscription = existingFirst;
}
```

Mesma logica para o 2T:
```text
const hasSecondHalfVideo = secondHalfSegments.length > 0;
if (!secondHalfTranscription && hasSecondHalfVideo) {
  ...
}
```

### Mudança 2 — Sequential Pipeline: Mesma proteção

Nas linhas 1871-1901, o mesmo problema existe no fluxo sequencial. Aplicar a mesma verificação: so buscar transcrição existente se há segmento de video correspondente.

```text
// Linha ~1872 - ANTES:
if (!firstHalfTranscription) {
  const existingFirst = await apiClient.getExistingTranscription(matchId, 'first');
  ...
}

// DEPOIS:
if (!firstHalfTranscription && firstHalfSegments.length > 0) {
  const existingFirst = await apiClient.getExistingTranscription(matchId, 'first');
  ...
}
```

### Mudança 3 — Validação extra na chamada startAnalysis

Na analise por tempos separados (linha ~2196), adicionar log de segurança para confirmar que so analisa tempos com video:

```text
// Linha ~2201 - Já tem a verificação correta:
if (firstHalfTranscription && firstHalfSegments.length > 0) { ... }

// Adicionar log de proteção ANTES:
console.log('[PROTEÇÃO] 1T: transcrição=' + !!firstHalfTranscription + 
            ', segmentos=' + firstHalfSegments.length + 
            ' → ' + (firstHalfTranscription && firstHalfSegments.length > 0 ? 'ANALISAR' : 'PULAR'));
```

### Mudança 4 — Async pipeline: Não enviar transcrição sem video

Na chamada do `asyncProcessing.startProcessing` (linha ~1746), condicionar:

```text
await asyncProcessing.startProcessing({
  matchId,
  videos: videoInputs,
  homeTeam: homeTeamName,
  awayTeam: awayTeamName,
  autoClip: true,
  autoAnalysis: true,
  // SÓ enviar transcrição se há video correspondente
  firstHalfTranscription: hasFirstHalfVideo ? firstHalfTranscription : undefined,
  secondHalfTranscription: hasSecondHalfVideo ? secondHalfTranscription : undefined,
});
```

## Arquivo Afetado

| Arquivo | Mudança |
|---|---|
| `src/pages/Upload.tsx` | Condicionar busca de transcrições existentes a presença de segmentos de video. Não enviar transcrição para o backend se não há video do tempo correspondente. |

## Resultado Esperado

| Cenario | Antes | Depois |
|---|---|---|
| Importar so o 2T em partida existente | Frontend busca transcrição 1T do storage e envia ao backend, que pode re-analisar e deletar eventos do 1T | Frontend não busca nem envia transcrição do 1T. Backend recebe APENAS dados do 2T. Eventos do 1T permanecem intactos |
| Importar so o 1T em partida existente | Idem para 2T | Mesma proteção para o 2T |
| Importar ambos | Busca e envia ambas transcrições | Sem mudança (ambos têm video) |

