

# Plano: Diagnosticar e Resolver ImportError

## Diagnóstico

Os arquivos no repositório estão corretos:
- `models.py` - 997 linhas, sintaxe OK, `Base` definido na linha 11
- `database.py` - 84 linhas, sintaxe OK, `init_db` definido na linha 32

O erro indica que o **arquivo local pode estar diferente** do repositório ou há **cache Python corrompido**.

## Passos de Resolução

### Passo 1 - Testar imports isoladamente

Execute no terminal:
```text
cd C:\projetos\arena-tactic-ai\video-processor
python -c "from models import Base; print('models OK')"
```

Se falhar, o problema está no `models.py` local.

### Passo 2 - Limpar cache Python completamente

```text
cd C:\projetos\arena-tactic-ai\video-processor
rmdir /s /q __pycache__
del /s /q *.pyc
```

### Passo 3 - Verificar se há outro arquivo `database.py`

Pode haver conflito com outro módulo `database`:
```text
python -c "import database; print(database.__file__)"
```

Se mostrar um caminho diferente de `video-processor\database.py`, há conflito.

### Passo 4 - Sincronizar com repositório

Se o arquivo local estiver diferente, sincronize:
```text
git checkout video-processor/models.py
git checkout video-processor/database.py
```

### Passo 5 - Executar servidor

```text
python server.py
```

## Causa Mais Provável

O cache Python (`__pycache__`) está mantendo uma versão antiga do módulo compilado que não reflete o código atual.

## Nenhuma Alteração de Código Necessária

Este é um problema de ambiente local, não de código.

