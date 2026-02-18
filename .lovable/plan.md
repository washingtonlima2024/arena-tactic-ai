

# Melhorar Qualidade de Audio e Transcricao

## Problemas Identificados

1. **Edge function `transcribe-audio` NAO EXISTE** - O hook `useVideoAudioTranscription` tenta chamar essa funcao na nuvem, mas ela nunca foi criada. Toda chamada falha e cai no fallback do backend Python, adicionando latencia e erros no console.

2. **Chunks de audio muito curtos (10 segundos)** - Segmentos curtos cortam palavras e frases no meio, prejudicando a precisao do Whisper. O modelo funciona melhor com 15-30 segundos de contexto.

3. **Sem pre-processamento de audio no navegador** - O audio e gravado "cru", sem filtros de ruido ou normalizacao, resultando em audio com ruido de fundo que confunde o modelo.

4. **MediaRecorder sem configuracao de bitrate** - O navegador usa bitrate padrao (geralmente baixo), degradando a qualidade do audio enviado.

5. **Sem sobreposicao (overlap) entre chunks** - Quando um chunk termina no meio de uma palavra, ela e perdida. Nao ha overlap para compensar.

6. **Lista de alucinacoes incompleta** - O filtro de hallucinations do Whisper nao cobre todos os padroes comuns em portugues.

---

## Solucao

### 1. Criar Edge Function `transcribe-audio` (NOVO ARQUIVO)

**Arquivo**: `supabase/functions/transcribe-audio/index.ts`

Criar a edge function que falta, usando o Lovable AI Gateway com o modelo Gemini 2.5 Flash (rapido e bom para audio). Ela recebera o audio em base64, convertera para o formato adequado e enviara ao modelo para transcricao.

- Modelo: `google/gemini-2.5-flash` (rapido, bom custo-beneficio)
- Recebe audio base64 + idioma
- Retorna texto transcrito
- Tratamento de erros 429 (rate limit) e 402 (creditos)

### 2. Melhorar Qualidade de Captura de Audio

**Arquivo**: `src/hooks/useVideoAudioTranscription.ts`

**Mudanca 2a - Aumentar duracao do chunk para 15 segundos:**
- Alterar `chunkDurationMs` padrao de `10000` para `15000`
- Isso da mais contexto ao modelo e reduz cortes no meio de frases

**Mudanca 2b - Adicionar filtros de audio no Web Audio API:**
- Adicionar um `BiquadFilterNode` highpass (300Hz) para cortar ruidos de fundo graves
- Adicionar um `DynamicsCompressorNode` para normalizar volume
- Cadeia: source -> highpass -> compressor -> analyser -> destination

**Mudanca 2c - Configurar bitrate do MediaRecorder:**
- Adicionar `audioBitsPerSecond: 128000` (128kbps) na criacao do MediaRecorder
- Garantir qualidade minima do audio capturado

**Mudanca 2d - Ampliar lista de alucinacoes:**
- Adicionar padroes adicionais de hallucination do Whisper em portugues:
  - "Obrigado a todos", "Tchau tchau", "Ate a proxima", "Amem"
  - "Musica de fundo", "Aplausos", "(musica)"
  - Textos com menos de 5 caracteres (ruido)

**Mudanca 2e - Filtro de texto muito curto:**
- Ignorar transcricoes com menos de 10 caracteres (geralmente ruido ou alucinacao)

### 3. Melhorar Transcricao de Videos Importados

**Arquivo**: `src/hooks/useWhisperTranscription.ts`

**Mudanca 3a - Adicionar feedback de progresso mais granular:**
- Atualizar mensagens de progresso com estimativa de tempo
- Indicar claramente qual provedor esta sendo usado (Whisper Local vs Cloud)

---

## Detalhes Tecnicos

### Cadeia de audio melhorada (Web Audio API):

```text
Video Element
    |
    v
MediaElementSource
    |
    v
BiquadFilter (highpass 300Hz)  <-- Remove ruido grave
    |
    v
DynamicsCompressor             <-- Normaliza volume
    |
    v
AnalyserNode                   <-- Detector de atividade
    |
    +---> MediaStreamDestination (gravacao)
    |
    +---> AudioContext.destination (saida do usuario)
```

### Edge Function (transcribe-audio):

A funcao usara o Lovable AI Gateway com Gemini para transcrever audio, eliminando a necessidade do backend Python para transcricoes em tempo real (live). O backend Python continuara sendo usado como fallback.

### Arquivos afetados:

| Arquivo | Tipo de Mudanca |
|---|---|
| `supabase/functions/transcribe-audio/index.ts` | Novo arquivo |
| `src/hooks/useVideoAudioTranscription.ts` | Modificacao (audio quality + chunk duration) |
| `src/hooks/useWhisperTranscription.ts` | Modificacao menor (feedback) |

