

# Corrigir: EventDetector com 0 Candidatos - min_evidence_lines Muito Restritivo para Chunks Sinteticos

## Problema Diagnosticado

A correcao anterior (dividir texto corrido em chunks de 15 palavras) gera as linhas sinteticas corretamente, mas o filtro `min_evidence_lines` continua bloqueando todos os candidatos.

### Fluxo atual:

1. Texto do Whisper (~50k chars) eh dividido em ~3000 chunks de 15 palavras
2. Para cada chunk, o sistema busca keywords (ex: "gol")
3. Quando encontra, pega uma janela de 8 chunks ao redor
4. Conta quantos chunks na janela tem alguma keyword (`evidence_count`)
5. Para gols: `min_evidence_lines=2` -- exige que PELO MENOS 2 chunks tenham keywords
6. Com chunks de 15 palavras, a keyword "gol" fica em UM chunk, e os 7 chunks vizinhos raramente contem "rede", "comemora", etc.
7. Resultado: `evidence_count=1 < 2` → candidato descartado → 0 candidatos total

### Por que isso acontece?

Chunks de 15 palavras sao muito curtos. No texto original, duas linhas de narracaco poderiam ter "GOOOL" e "a bola entrou na rede" juntas. Mas quando dividimos artificialmente em blocos de 15 palavras, cada bloco tem pouco contexto, e a probabilidade de 2 blocos adjacentes conterem keywords diferentes cai drasticamente.

## Solucao

### Arquivo: `video-processor/event_detector.py`

Duas mudancas complementares:

**1. Aumentar o tamanho dos chunks sinteticos de 15 para 40 palavras**

Chunks maiores (40 palavras ~ 2-3 frases) mantem mais contexto junto, aumentando a chance de ter keywords primarias e secundarias no mesmo chunk ou em chunks adjacentes.

```text
Antes: chunk_size = 15  (~60 chars, contexto minimo)
Depois: chunk_size = 40  (~200 chars, contexto suficiente)
```

Isso gera ~750 chunks em vez de ~3000 para 50k chars -- ainda muito mais que o `window_size` de qualquer receita.

**2. Reduzir `min_evidence_lines` para 1 quando usando linhas sinteticas**

Passar um flag para `find_event_candidates` indicando que as linhas sao sinteticas, e nesse caso usar `min_evidence_lines=1` (em vez do valor da receita). Com chunks de 40 palavras, um unico chunk contendo "gol" ou "golaço" ja eh evidencia suficiente para ser candidato.

Implementacao: adicionar parametro `synthetic_lines=False` em `find_event_candidates`, e quando `True`, forcar `min_evidence = 1`.

### Resultado Esperado

- Texto de 50k chars → ~750 chunks de 40 palavras
- Cada chunk tem contexto suficiente para conter keywords
- `min_evidence_lines=1` permite que qualquer chunk com keyword seja candidato
- EventDetector gera 15-40 candidatos (gols, cartoes, faltas, etc.)
- Pipeline Kakttus recebe snippets focados em vez do texto inteiro
- Mais eventos detectados com maior precisao

## Detalhes Tecnicos

### Mudanca 1: Chunk size (linha ~436-441)

```python
# Antes:
chunk_size = 15

# Depois:
chunk_size = 40
```

### Mudanca 2: Flag synthetic_lines em find_event_candidates (linha 321-332)

```python
# Antes:
def find_event_candidates(transcript_lines, recipe, home_team, away_team):
    if not transcript_lines or len(transcript_lines) < recipe.window_size:
        return []

# Depois:
def find_event_candidates(transcript_lines, recipe, home_team, away_team, synthetic_lines=False):
    if not transcript_lines or len(transcript_lines) < recipe.window_size:
        return []
    # ... no filtro de evidencia (linha 371):
    min_evidence = 1 if synthetic_lines else recipe.min_evidence_lines
    if evidence_count < min_evidence:
        continue
```

### Mudanca 3: Passar flag na chamada (linha 456)

```python
# Antes:
candidates = find_event_candidates(lines, recipe, home_team, away_team)

# Depois:
candidates = find_event_candidates(lines, recipe, home_team, away_team, synthetic_lines=is_synthetic)
```

Onde `is_synthetic` eh setado como `True` quando o texto foi dividido sinteticamente (bloco das linhas 431-444).

## Arquivos a Modificar

1. **`video-processor/event_detector.py`**:
   - Aumentar `chunk_size` de 15 para 40
   - Adicionar parametro `synthetic_lines` em `find_event_candidates`
   - Usar `min_evidence=1` quando `synthetic_lines=True`
   - Passar flag `is_synthetic` na chamada dentro de `find_all_candidates`

