

# Plano: Reaproveitar Transcrição do Smart Import

## Problema

O sistema transcreve o vídeo **duas vezes**:
1. **Smart Import** (`smartImportTranscribe`): transcreve 5 min de áudio para extrair metadados (times, competição, etc.)
2. **Análise** (`handleStartAnalysis` -> `transcribeWithWhisper`): transcreve o vídeo **inteiro** de novo, ignorando completamente a transcrição anterior

Isso desperdiça tempo e recursos de IA, especialmente quando o vídeo é curto (clips de 5-15 min onde a transcrição do Smart Import cobre praticamente todo o conteúdo).

## Solução

Passar a transcrição obtida no Smart Import para o fluxo de análise, que a reutilizará como ponto de partida. Se o vídeo for mais longo que os 5 minutos transcritos, a análise complementa com o restante via Whisper.

## Fluxo Revisado

```text
Smart Import
  |
  +--> Transcreve 5 min de áudio
  +--> Extrai metadados (times, competição)
  +--> Salva transcricao no estado do React  <-- NOVO
  |
  v
Análise (handleStartAnalysis)
  |
  +--> Verifica se já tem transcrição salva  <-- NOVO
  +--> Se SIM e vídeo é curto (<= 10 min):
  |      Pular Whisper, usar transcrição existente
  +--> Se SIM e vídeo é longo:
  |      Usar como pré-carregada no pipeline async
  +--> Se NÃO:
         Transcrever normalmente (comportamento atual)
```

## Mudanças por Arquivo

### 1. SmartImportCard.tsx
- Adicionar a transcrição ao callback `onMatchInfoExtracted` (novo parâmetro `transcription`)
- Passar o texto transcrito para o componente pai junto com os metadados

### 2. Upload.tsx (componente pai)
- Adicionar estado `smartImportTranscription` para armazenar a transcrição recebida do Smart Import
- No `onMatchInfoExtracted`, salvar a transcrição recebida
- No `handleStartAnalysis`, verificar se `smartImportTranscription` existe antes de chamar Whisper
- Se existir: usar como `firstHalfTranscription` (ou passar ao pipeline async)
- Se o vídeo for curto (duração <= 10 min): pular Whisper completamente
- Se o vídeo for longo: usar como transcrição parcial e complementar via Whisper se necessário

### 3. SmartImportCard - Interface (Props)
- Atualizar a interface `SmartImportCardProps` para incluir `transcription?: string` no callback

## Detalhes Tecnicos

### Estado novo em Upload.tsx
Um novo `useState` armazenará a transcrição do Smart Import:
```
smartImportTranscription: string | null
```

### Lógica de decisão em handleStartAnalysis
Antes de iniciar a fila de transcrição (linha ~1820), verificar:
- Se `smartImportTranscription` existe e tem conteúdo (> 50 chars)
- Se o vídeo é curto (durationSeconds <= 600, ou seja, 10 min): usar direto como `firstHalfTranscription`
- Se o vídeo é longo: passar como `firstHalfTranscription` para o pipeline async, onde o backend pode complementar se necessário

### Pipeline Async
O pipeline async já aceita `firstHalfTranscription` como parâmetro. Ao receber a transcrição do Smart Import, ele vai pular o Whisper automaticamente (lógica já existente nas linhas 8043-8055 do server.py).

## Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `src/components/upload/SmartImportCard.tsx` | Passar transcrição no callback `onMatchInfoExtracted` |
| `src/pages/Upload.tsx` | Novo estado `smartImportTranscription`; reutilizar na análise |

## Benefícios

- Elimina transcrição duplicada para vídeos curtos
- Reduz tempo total do pipeline (economiza 2-5 min)
- Aproveita melhor os recursos de IA (menos chamadas ao Gemini/Whisper)
- Para vídeos longos, a transcrição parcial é reaproveitada como "head start"
