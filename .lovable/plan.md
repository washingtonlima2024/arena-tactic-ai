

# Corrigir Gravacao de Edicao de Eventos (Metadata JSON)

## Problema

O backend (`server.py`) usa `existing.update(data['metadata'])` para mesclar metadados. Porem, como `existing` e uma referencia direta ao objeto `event.event_metadata` do SQLAlchemy, a mutacao in-place nao e detectada pelo ORM. O SQLAlchemy so detecta mudancas em colunas JSON quando um **novo objeto** e atribuido.

**Prova**: O PUT envia `isOwnGoal: false`, mas a resposta retorna `isOwnGoal: true` (valor antigo).

## Solucao

### Arquivo: `video-processor/server.py` (linhas 2144-2152)

Substituir a mutacao in-place por atribuicao de um novo dicionario:

**Antes:**
```python
if 'metadata' in data:
    existing = event.event_metadata or {}
    if isinstance(existing, dict) and isinstance(data['metadata'], dict):
        existing.update(data['metadata'])
        event.event_metadata = existing
    else:
        event.event_metadata = data['metadata']
```

**Depois:**
```python
if 'metadata' in data:
    existing = dict(event.event_metadata or {})  # Copia para novo dict
    if isinstance(existing, dict) and isinstance(data['metadata'], dict):
        existing.update(data['metadata'])
    else:
        existing = data['metadata']
    event.event_metadata = existing  # Atribui novo objeto -> SQLAlchemy detecta
```

A diferenca critica e `dict(event.event_metadata or {})` que cria uma **copia** em vez de referenciar o mesmo objeto. Assim, ao atribuir de volta, o SQLAlchemy detecta que houve mudanca e grava no banco.

## Impacto

- Corrige: edicoes de time, gol contra, jogador e todos os campos de metadata
- Sem efeitos colaterais em outras funcionalidades
- Uma unica linha alterada no backend

