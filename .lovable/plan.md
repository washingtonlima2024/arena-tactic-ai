
# Reutilizar Transcricoes Existentes na Importacao Manual

## Problema

Quando voce importa um jogo manualmente (fluxo sequencial no Upload.tsx), o sistema **sempre tenta transcrever o video novamente**, mesmo que ja exista uma transcricao salva em `storage/{match_id}/texts/` de uma importacao anterior ou Smart Import. Isso desperdiça tempo e recursos.

## Onde as transcricoes sao salvas

O backend salva transcricoes em dois locais:
- `storage/{match_id}/texts/first_half_transcription.txt`
- `storage/{match_id}/texts/second_half_transcription.txt`
- `storage/{match_id}/srt/first_half.srt`
- `storage/{match_id}/srt/second_half.srt`

O servidor Python ja tem endpoints para servir esses arquivos:
- `GET /api/storage/{match_id}/texts/{filename}`
- `GET /api/storage/{match_id}/texts` (lista arquivos)

## Solucao

Adicionar uma verificacao no frontend (Upload.tsx) e no backend (pipeline async) que, **antes de iniciar a transcricao**, consulta o storage para ver se ja existem arquivos de transcricao. Se existirem, usa os existentes e pula o Whisper.

### Mudanca 1: Frontend - apiClient.ts

Adicionar um novo metodo `getExistingTranscription(matchId, halfType)` que:
1. Tenta buscar o TXT de `texts/{half}_half_transcription.txt`
2. Se nao encontrar, tenta o SRT de `srt/{half}_half.srt`
3. Retorna o conteudo se encontrado, ou `null`

### Mudanca 2: Frontend - Upload.tsx (Pipeline Sequencial)

No `handleStartAnalysis`, antes do bloco que monta os `transcriptionItems` para Whisper (~linha 1855), adicionar:

```text
1. Se nao tem firstHalfTranscription:
   -> Chamar apiClient.getExistingTranscription(matchId, 'first')
   -> Se retornar texto, usar como firstHalfTranscription
   -> Mostrar toast "Transcricao existente encontrada para 1o tempo"

2. Se nao tem secondHalfTranscription:
   -> Chamar apiClient.getExistingTranscription(matchId, 'second')
   -> Se retornar texto, usar como secondHalfTranscription
   -> Mostrar toast "Transcricao existente encontrada para 2o tempo"
```

Mesma logica aplicada ao bloco do pipeline **async** (~linha 1660), antes de enviar para o backend.

### Mudanca 3: Backend - Pipeline Async (server.py)

O backend ja faz fallback para o 2o tempo (linhas 8128-8148), mas **nao faz para o 1o tempo**. Adicionar a mesma logica de verificacao no storage para o 1o tempo tambem.

## Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/lib/apiClient.ts` | Novo metodo `getExistingTranscription()` |
| `src/pages/Upload.tsx` | Verificar transcricoes existentes antes de transcrever (pipelines sequencial e async) |
| `video-processor/server.py` | Adicionar fallback de storage para 1o tempo no pipeline async |

## Fluxo Apos Implementacao

```text
Usuario clica "Iniciar Analise"
  |
  v
Ja tem transcricao do SRT/Smart Import?
  SIM -> usa ela
  NAO -> Verificar storage: texts/{half}_half_transcription.txt
           EXISTE -> carregar e usar (pular Whisper)
           NAO EXISTE -> Verificar SRT: srt/{half}_half.srt
                           EXISTE -> carregar e usar (pular Whisper)
                           NAO EXISTE -> Transcrever com Whisper normalmente
```

## Resultado Esperado

- Ao reimportar/reanalisar uma partida que ja foi transcrita, o sistema detecta os arquivos TXT/SRT existentes e reutiliza
- Economia de tempo significativa (evita 5-15 min de transcricao por tempo)
- Toast informativo: "Transcricao existente encontrada para 1o tempo - pulando Whisper"
