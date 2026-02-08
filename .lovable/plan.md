
# Corrigir Transcricao Parcial no Pipeline Assincrono

## Problema

O Smart Import transcreve apenas os primeiros 5 minutos do video para identificacao rapida dos times. Essa transcricao parcial esta sendo passada ao pipeline assincrono como `firstHalfTranscription`, que a trata como transcricao completa e **pula o Whisper inteiramente**.

Fluxo do bug:

```text
Smart Import (5 min) --> Frontend envia como firstHalfTranscription
                     --> Backend: len > 100? Sim --> has_preloaded_first = True
                     --> PULA WHISPER
                     --> Analise so encontra eventos nos primeiros 5-6 min
```

A validacao de densidade (chars/segundo) que detecta transcricoes parciais so e aplicada a transcricoes carregadas do **storage**, nunca as enviadas pelo **frontend**.

## Solucao

Duas mudancas complementares para garantir que a transcricao parcial do Smart Import nao seja confundida com uma transcricao completa:

### 1. Frontend: Nao enviar transcricao parcial do Smart Import (Upload.tsx)

**Linha ~2958-2960**: Remover o envio da transcricao do Smart Import como `firstHalfTranscription` no pipeline assincrono. O Smart Import so transcreve 5 minutos -- isso nunca deveria ser tratado como transcricao final.

```text
ANTES:
  firstHalfTranscription: transcription && transcription.length > 50 ? transcription : undefined,

DEPOIS:
  // Smart Import transcription is only 5min - never pass as full transcription
  // The async pipeline will run Whisper for the complete video
  firstHalfTranscription: undefined,
```

### 2. Backend: Validar densidade da transcricao fornecida pelo frontend (server.py)

**Linhas ~8830-8833**: Aplicar a mesma validacao de densidade (`chars_per_sec >= 3`) as transcricoes enviadas pelo frontend, como segunda camada de protecao. Se o video tem 45+ minutos mas a transcricao cobre so 5 minutos, a densidade sera muito baixa e o Whisper sera acionado automaticamente.

```text
ANTES:
  has_preloaded_first = bool(first_half_transcription and len(first_half_transcription.strip()) > 100)

DEPOIS:
  has_preloaded_first = bool(first_half_transcription and len(first_half_transcription.strip()) > 100)
  # Validar se transcricao fornecida e proporcional ao video (evita parciais do Smart Import)
  if has_preloaded_first:
      first_dur = video_durations.get('first', 0)
      if first_dur > 300:
          chars_per_sec = len(first_half_transcription.strip()) / first_dur
          if chars_per_sec < 3:
              print(f"[ASYNC-PIPELINE] Transcricao do frontend DESCARTADA (parcial): "
                    f"{len(first_half_transcription.strip())} chars / {first_dur:.0f}s = {chars_per_sec:.1f} chars/s")
              has_preloaded_first = False
              first_half_transcription = ''
```

A mesma logica sera aplicada para `has_preloaded_second`.

## Resultado Esperado

- Transcricao parcial do Smart Import (5 min) nao e mais enviada como transcricao completa
- Mesmo se enviada acidentalmente, o backend detecta a baixa densidade e aciona o Whisper
- Pipeline assincrono roda o Whisper Local completo para o video inteiro
- Analise encontra eventos ao longo de toda a partida (90 minutos)
