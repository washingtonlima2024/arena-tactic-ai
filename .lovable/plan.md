

## Plano: Corrigir Parsing de Data ISO no Backend

### Problema

O erro `Invalid isoformat string: '2016-12-11T23:45:00.000Z'` ocorre porque a função `datetime.fromisoformat()` do Python não reconhece o formato JavaScript com sufixo `.000Z`.

### Causa Raiz

O frontend envia datas no formato ISO padrão do JavaScript:
```
2016-12-11T23:45:00.000Z
```

Mas o `datetime.fromisoformat()` do Python espera:
```
2016-12-11T23:45:00
```

O sufixo `.000Z` (milissegundos + indicador UTC) causa a falha.

### Solução

Criar uma função auxiliar `parse_iso_datetime()` que limpa o formato antes de parsear:

```python
def parse_iso_datetime(date_string: str) -> datetime:
    """
    Parse ISO datetime string from JavaScript format.
    Handles: '2016-12-11T23:45:00.000Z' -> datetime
    """
    if not date_string:
        return None
    
    # Remove 'Z' suffix and milliseconds
    cleaned = date_string.replace('Z', '').replace('+00:00', '')
    
    # Remove milliseconds if present (.000)
    if '.' in cleaned:
        cleaned = cleaned.split('.')[0]
    
    return datetime.fromisoformat(cleaned)
```

### Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `video-processor/server.py` | Adicionar função `parse_iso_datetime()` e substituir chamadas de `datetime.fromisoformat()` nas linhas 1739 e 1795 |

### Alterações Específicas

**Linha 1739** (criar partida):
```python
# Antes
match_date=datetime.fromisoformat(data['match_date']) if data.get('match_date') else None,

# Depois
match_date=parse_iso_datetime(data['match_date']) if data.get('match_date') else None,
```

**Linha 1795** (atualizar partida):
```python
# Antes
match.match_date = datetime.fromisoformat(data['match_date'])

# Depois
match.match_date = parse_iso_datetime(data['match_date'])
```

### Critérios de Aceite

1. Criar partida com data/hora funciona sem erros
2. Atualizar partida com nova data funciona
3. Datas vazias ou nulas são tratadas corretamente
4. Formato com ou sem milissegundos é aceito

