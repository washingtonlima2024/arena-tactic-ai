

# Corrigir Download do YouTube no Pipeline Assincrono

## Problema

O download do YouTube no pipeline assincrono (`_process_match_pipeline`) esta falhando. A causa raiz esta na combinacao de varios problemas no comando `yt-dlp` utilizado:

1. **Formato restritivo**: O seletor `-f 'bestvideo[height<=720]+bestaudio/best[height<=720]'` exige merge de streams separados via `ffmpeg`. Se o formato exato nao esta disponivel ou o merge falha, nenhum arquivo e gerado.

2. **Deadlock potencial com `subprocess.run` + `capture_output=True`**: Para videos grandes, os buffers de stdout/stderr enchem e o processo trava indefinidamente (deadlock).

3. **Sem fallback de formato**: Se o formato especifico nao esta disponivel para o video, o yt-dlp falha completamente ao inves de tentar alternativas.

4. **Sem `--force-overwrites`**: Se existe um arquivo parcial de tentativa anterior, o yt-dlp pode pular o download.

Note-se que o Smart Import (que funciona) usa um formato muito mais simples: `-f 'bestaudio/best[height<=480]'` — porque so precisa de audio para transcrever.

## Solucao

Reescrever a secao de download do YouTube no pipeline assincrono para usar `subprocess.Popen` com streaming de output (igual ao `download_youtube_with_progress` que ja funciona), formato com fallback robusto, e atualizacao de progresso em tempo real.

## Mudancas

### Arquivo: `video-processor/server.py`

**1. Substituir o bloco de download YouTube no `_process_match_pipeline` (linhas ~8392-8475)**

Trocar `subprocess.run` por `subprocess.Popen` com parsing de progresso em tempo real, e usar formato com fallback:

```text
ANTES:
  subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
  # formato: 'bestvideo[height<=720]+bestaudio/best[height<=720]'

DEPOIS:
  subprocess.Popen(cmd, stdout=PIPE, stderr=STDOUT, text=True)
  # formato: 'bestvideo[height<=720]+bestaudio/best[height<=720]/best[height<=720]/best'
  # com --force-overwrites e --newline para parsing de progresso
```

Mudancas especificas:

- **Formato com fallback**: `'-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]/best[height<=720]/best'` — se o merge falha, tenta formato unico, e se nao encontra 720p, aceita qualquer formato disponivel.
- **`--newline`**: Para que cada atualizacao de progresso fique em uma linha separada (necessario para parsing com Popen).
- **`--force-overwrites`**: Para sobrescrever arquivos parciais de tentativas anteriores.
- **`subprocess.Popen`** ao inves de `subprocess.run`: Evita deadlock por buffer cheio e permite atualizar o progresso do job em tempo real.
- **Atualizacao de progresso**: Parse da saida do yt-dlp para atualizar `_update_async_job` com porcentagem de download, mostrando progresso real na interface.
- **Timeout manual**: Controle de timeout via loop ao inves de parametro do subprocess (que nao funciona com Popen).

**2. Verificacao adicional de arquivo apos download**

Apos o download, alem de verificar `.mp4`, tambem buscar `.mkv`, `.webm` e `.mp4.part` na pasta temporaria, e converter para `.mp4` se necessario usando `ffmpeg`.

## Resultado Esperado

- Downloads do YouTube funcionam de forma confiavel no pipeline assincrono
- Progresso do download e visivel na interface (ao inves de ficar parado em "Baixando do YouTube...")
- Videos com formatos variados no YouTube sao tratados pelo fallback automatico
- Sem risco de deadlock por buffer cheio
- Compativel com videos de qualquer tamanho/duracao

