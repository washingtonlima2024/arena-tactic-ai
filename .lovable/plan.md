

# Corrigir Ordem dos Times: Primeiro Mencionado = Time da Casa

## Problema

Quando a IA extrai os metadados da partida (endpoint `/api/extract-match-info`), ela tenta adivinhar qual time joga em "casa" e qual e "visitante". Isso causa inversoes frequentes (ex: "Brasil x Paraguai" vira "Paraguai x Brasil") porque a IA nao prioriza a ordem de aparicao no texto da narracao.

A regra correta e simples: **o primeiro time mencionado pelo narrador e sempre o time da casa**.

## Causa Raiz

1. O prompt da IA no backend (`server.py` linha 13946) diz "geralmente mencionado primeiro" mas nao e uma instrucao forte
2. A IA pode inverter a ordem tentando adivinhar quem joga em casa com base em contexto (ex: torcida, estadio)
3. A funcao `_extract_teams_by_regex` ja respeita a ordem correta (primeiro encontrado = home), mas a IA pode sobrescrever isso

## Solucao

### Arquivo: `video-processor/server.py`

**Mudanca 1 - Reforcar no prompt que ordem de aparicao = home/away (linha ~13929-13962):**
- Alterar a regra no prompt para ser explicita: "O PRIMEIRO time mencionado na transcricao e SEMPRE o time da casa (home_team). O SEGUNDO time e SEMPRE o visitante (away_team). NAO tente adivinhar com base em estadio ou torcida."
- Remover a linguagem ambigua "geralmente mencionado primeiro"

**Mudanca 2 - Usar regex como autoridade final para a ordem dos times (apos linha ~13980):**
- Apos receber a resposta da IA, verificar se os dois times retornados pela IA correspondem aos detectados por regex
- Se o regex detectou times e a IA inverteu a ordem, **corrigir para a ordem do regex** (que respeita a ordem de aparicao no texto)
- Isso garante que mesmo se a IA errar, a ordem do texto prevalece

**Mudanca 3 - Adicionar fallback de primeira mencao no texto bruto:**
- Se a IA retornar home_team e away_team, verificar qual aparece primeiro no texto original
- Se away_team aparece antes de home_team no texto, inverter os dois

## Detalhes Tecnicos

### Fluxo corrigido:

```text
Transcricao: "Brasil e Paraguai se enfrentam..."
                |
                v
    Regex: home="Brasil", away="Paraguai" (ordem do texto)
                |
                v
    IA analisa com prompt reforçado
                |
                v
    IA retorna: home_team="Paraguai", away_team="Brasil" (ERRO da IA)
                |
                v
    Pos-processamento: Verifica ordem no texto original
    "Brasil" aparece na posicao 0, "Paraguai" na posicao 11
    Brasil vem PRIMEIRO -> home_team="Brasil", away_team="Paraguai" (CORRIGIDO)
```

### Arquivos afetados:

| Arquivo | Mudanca |
|---|---|
| `video-processor/server.py` | Reforcar prompt + pos-processamento de ordem |

### Impacto:

- Smart Import: times sempre na ordem correta da narracao
- Importacao manual: sem mudanca (usuario escolhe os times)
- Re-analise: sem mudanca (times ja definidos)
