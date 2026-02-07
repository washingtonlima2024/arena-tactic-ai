

# Corrigir Preload e Analise com Dois Tempos no Pipeline Automatico

## Problema Principal

Apos o split automatico de um video de jogo completo (>50 min) em dois tempos, a flag `is_full_match_video` permanece `True`. Isso faz a analise do 1o tempo usar o range 0-90 minutos ao inves de 0-45 minutos, mesmo que o video tenha sido dividido e cada metade tenha apenas ~45 minutos de conteudo.

```text
FLUXO COM BUG:

Video full (90 min) → split em 2 videos de ~45 min
    |
    is_full_match_video = True  (NAO foi resetado!)
    |
    v
Phase 4 - Analise 1T:
    game_end = 90 if is_full_match_video else 45
    → IA analisa 0-90 min em transcricao de 45 min → eventos incorretos
```

## Mudancas Propostas

### Mudanca 1: Resetar `is_full_match_video` apos split bem-sucedido

**Arquivo:** `video-processor/server.py` (apos linha 8442)

Quando o split automatico termina com sucesso, o video ja nao e mais "full" — agora sao dois videos independentes. A flag deve ser resetada:

```python
# Apos o split bem-sucedido (linha 8442):
print(f"[ASYNC-PIPELINE] Video split: ...")

# ADICIONAR: Reset flag pois agora temos dois videos separados
is_full_match_video = False
print(f"[ASYNC-PIPELINE] is_full_match_video resetado para False (video foi dividido)")
```

Isso corrige a Phase 4 onde `game_end` sera corretamente calculado como 45 para o 1o tempo e 90 para o 2o tempo.

### Mudanca 2: Upload paralelo de dois videos no frontend (opcional, melhoria de performance)

**Arquivo:** `src/pages/Upload.tsx` (linhas 2866-2921)

Atualmente os videos sao uploadados sequencialmente. Para dois videos grandes, fazer upload em paralelo usando `Promise.all`:

```text
ANTES:
  for (const vid of videosToProcess) {
    // upload sequencial — lento para 2 videos
  }

DEPOIS:
  await Promise.all(videosToProcess.map(async (vid) => {
    // upload paralelo — ambos sobem ao mesmo tempo
  }));
```

## Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `video-processor/server.py` | Apos linha 8442: Resetar `is_full_match_video = False` apos split automatico |
| `src/pages/Upload.tsx` | Linhas 2866-2921: Paralelizar upload de multiplos videos |

## O Que NAO Muda

- A logica de split automatico com silencedetect permanece igual
- O fallback de transcricao do storage permanece igual
- A limpeza de transcricoes parciais (< 1KB) permanece igual
- O fluxo manual nao e alterado

## Resultado Esperado

- Apos split automatico, analise do 1o tempo usa range 0-45 min (correto)
- Analise do 2o tempo continua usando range 45-90 min (ja estava correto)
- Upload de 2 videos separados e mais rapido (paralelo)
- Eventos e clips sao gerados corretamente para ambos os tempos

