
# Plano: Pipeline de Transcricao Robusto e Resiliente

## Problema Atual

O fluxo de transcricao falha e para completamente em diversos cenarios:

1. **Smart Import com URLs do YouTube**: O `yt-dlp` pode falhar no download, o FFmpeg pode falhar na extracao de audio, ou o provedor de transcricao (Gemini/Whisper) pode falhar -- e qualquer erro interrompe tudo.

2. **Timeout de 5 minutos no Smart Import**: O `smartImportTranscribe` tem timeout de apenas 5 min, insuficiente para videos longos do YouTube.

3. **Sem retry no Smart Import**: Diferente do pipeline principal (que tem `MAX_RETRIES = 2`), o Smart Import nao tenta novamente quando falha.

4. **Transcrição e um gargalo unico**: Todo o audio e enviado de uma vez para o Gemini (limite de 20MB) ou Whisper. Se falhar, nao ha recuperacao parcial.

5. **Nenhuma transcrição = tela de erro final**: Quando a transcrição falha, o fluxo mostra uma tela de erro sem opcao clara de continuar.

## Solucao Proposta: Pipeline de 3 Camadas

```text
+-------------------------------------------------------------------+
|                    CAMADA 1: Smart Import                         |
|   Transcreve apenas primeiros 5-10 min para extrair metadados     |
|   (rapido, baixo risco de falha)                                  |
+-------------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------------+
|                    CAMADA 2: Transcricao Completa                 |
|   Dividir audio em chunks de 3-5 min + transcrever em paralelo    |
|   + retry individual por chunk + resultado parcial aceito          |
+-------------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------------+
|                    CAMADA 3: Fallback / Continuar Sem              |
|   Se transcricao falhar: continuar pipeline sem transcrição        |
|   Permitir importar SRT manualmente depois na pagina de Eventos   |
+-------------------------------------------------------------------+
```

## Mudancas Detalhadas

### 1. Backend: Smart Import Otimizado (server.py)

**Problema**: O endpoint `/api/smart-import/transcribe` tenta transcrever o video inteiro. Para um jogo de 90min, isso e desnecessario -- so precisamos de alguns minutos para a IA identificar times, competicao, etc.

**Solucao**: Extrair apenas os primeiros 5 minutos de audio para o Smart Import:
- Adicionar parametro `-t 300` (5 min) no comando FFmpeg de extracao de audio
- Isso reduz o arquivo de audio de ~100MB para ~5MB
- Transcrição sera rapida e confiavel (arquivo pequeno, cabe em um unico request)

```text
FFmpeg atual:  ffmpeg -i video -vn -acodec libmp3lame ...
FFmpeg novo:   ffmpeg -i video -vn -t 300 -acodec libmp3lame ...
                                    ^^^^^
                              apenas 5 minutos
```

### 2. Backend: Transcricao com Chunks Resilientes (ai_services.py)

**Problema**: `_transcribe_gemini_chunks` ja divide em chunks, mas nao tem retry por chunk e nao salva progresso parcial.

**Solucao**: Adicionar retry por chunk com backoff exponencial:
- Cada chunk que falhar sera tentado ate 3 vezes
- Se um chunk falhar apos 3 tentativas, ele e pulado (nao interrompe o pipeline)
- Aceitar transcricao parcial se >= 50% dos chunks forem transcritos com sucesso
- Adicionar delay entre chunks para evitar rate limiting

### 3. Backend: Fallback em Cadeia no Smart Import (server.py)

Implementar uma cadeia de fallbacks robusta:
1. Tentar Gemini com audio curto (5 min)
2. Se falhar -> Tentar Whisper Local com audio curto
3. Se falhar -> Tentar com audio de apenas 2 minutos
4. Se tudo falhar -> Retornar resultado vazio com `success: true` e flag `transcription_failed: true`

O frontend nunca recebera um erro 500 do Smart Import -- sempre recebera uma resposta valida.

### 4. Frontend: Smart Import Nunca Para (SmartImportCard.tsx)

**Problema**: Se a transcricao falha, o fluxo volta para a tela de selecao de video.

**Solucao**:
- Se a transcricao falhar, pular a etapa de extracao de metadados
- Ir direto para o formulario manual de cadastro da partida
- Mostrar toast informativo explicando que a IA nao conseguiu detectar os dados automaticamente
- O video ja esta vinculado, so precisa preencher os times manualmente

### 5. Frontend: Timeout Ajustado (apiClient.ts)

- Aumentar timeout do `smartImportTranscribe` de 5 min para 15 min
- Para URLs do YouTube, o download pode levar varios minutos antes mesmo de comecar a transcrição

### 6. Frontend: Transcricao Principal com "Continuar Sem" (Upload.tsx)

**Problema**: Quando `transcribeWithWhisper` retorna `null`, o fluxo mostra erro e para.

**Solucao**: Ja existe logica parcial para continuar sem transcricao (linhas 1893-1916), mas ela redireciona para Eventos sem completar. Vamos melhorar:
- Ao inves de redirecionar imediatamente, mostrar opcao "Continuar sem transcricao" na UI
- Permitir que o usuario arraste um SRT ou tente novamente
- Adicionar botao "Pular transcricao e analisar depois" que redireciona para a pagina de Eventos

### 7. Backend: Download YouTube Mais Robusto (server.py)

Adicionar resiliencia ao download do YouTube:
- Tentar primeiro `bestaudio` (menor, mais rapido)
- Se falhar, tentar `worst` (video mais leve possível)
- Timeout de 10 min com mensagens de progresso
- Tratar erros comuns (video privado, geo-bloqueado, etc.) com mensagens claras

## Resumo dos Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `video-processor/server.py` | Smart Import: extrair apenas 5 min de audio; download YouTube robusto; fallback em cadeia |
| `video-processor/ai_services.py` | Retry por chunk; aceitar resultado parcial; delay entre chunks |
| `src/lib/apiClient.ts` | Timeout do Smart Import de 5min para 15min |
| `src/components/upload/SmartImportCard.tsx` | Nunca parar em erro; fallback para formulario manual |
| `src/pages/Upload.tsx` | Botao "Pular transcricao"; UI de retry melhorada |

## Detalhes Tecnicos

### Smart Import: Fluxo Revisado

```text
1. Usuario fornece video/URL
2. Backend extrai apenas 5 min de audio (rapido)
3. Transcreve 5 min com Gemini/Whisper (confiavel - arquivo pequeno)
4. Se transcricao OK -> IA extrai metadados -> preenche formulario
5. Se transcricao FALHA -> pula para formulario manual com toast
6. Em ambos os casos: video ja vinculado, usuario so confirma
```

### Transcricao Completa: Fluxo Revisado

```text
1. Extrair audio completo do video
2. Dividir em chunks de ~3 minutos (nao por tamanho, por duracao)
3. Transcrever cada chunk com retry (3 tentativas)
4. Se chunk falhar -> pular, nao parar
5. Combinar resultados parciais
6. Se < 50% transcritos -> mostrar opcao "Continuar sem" / "Tentar novamente"
7. Se >= 50% -> continuar pipeline normalmente
```

### Retry por Chunk (ai_services.py)

```text
Para cada chunk:
  tentativa 1 -> falhou? -> espera 2s
  tentativa 2 -> falhou? -> espera 5s  
  tentativa 3 -> falhou? -> marca como pulado, continua proximo
```
