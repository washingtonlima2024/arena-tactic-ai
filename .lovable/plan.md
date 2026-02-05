

# Plano: Corrigir Persistência de Chunks no Upload

## Problema Identificado

O upload de arquivos grandes está falhando com o erro:
```
Partes faltando: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]...
```

### Causa Raiz
O SQLAlchemy não detecta automaticamente mutações em colunas JSON/Lista. Quando `received_chunks` é modificado via `append()` e `sort()`, o SQLAlchemy não marca o campo como "dirty" e não salva as alterações no banco de dados.

O mesmo problema afeta `events_log`.

## Alteração Necessária

### Arquivo: `video-processor/chunked_upload.py`

Adicionar `flag_modified()` após modificar campos JSON para forçar o SQLAlchemy a persistir as alterações.

### Código Atual (Linha 166-171):
```python
received = job.received_chunks or []
if chunk_index not in received:
    received.append(chunk_index)
    received.sort()
job.received_chunks = received
```

### Código Corrigido:
```python
from sqlalchemy.orm.attributes import flag_modified

received = list(job.received_chunks or [])  # Criar cópia
if chunk_index not in received:
    received.append(chunk_index)
    received.sort()
job.received_chunks = received
flag_modified(job, 'received_chunks')  # Forçar detecção de mudança
```

### Também corrigir `events_log` (Linha 181-186):
```python
events = list(job.events_log or [])  # Criar cópia
events.append({
    'timestamp': datetime.utcnow().isoformat(),
    'message': f'{progress}% enviado ({len(received)}/{job.total_chunks} partes)'
})
job.events_log = events
flag_modified(job, 'events_log')  # Forçar detecção de mudança
```

## Outras Funções a Corrigir

O mesmo problema existe em outras funções do `chunked_upload.py`:

| Função | Campo Afetado | Linha |
|--------|---------------|-------|
| `init_upload()` | `events_log` | 113-117 |
| `receive_chunk()` | `received_chunks`, `events_log` | 166-186 |
| `assemble_chunks()` | `events_log` | 263-268, 296-301 |
| `pause_upload()` | `events_log` | 396-401 |
| `resume_upload()` | `events_log` | 421-426 |
| `cancel_upload()` | `events_log` | 447-452 |

## Resumo da Correção

1. Importar `flag_modified` no topo do arquivo
2. Sempre criar uma **cópia** da lista antes de modificar (evita referência compartilhada)
3. Chamar `flag_modified(job, 'campo')` após atribuir o novo valor
4. Garantir que o `session.commit()` persista as alterações

## Resultado Esperado

Após a correção:
- Todos os chunks enviados serão registrados corretamente no banco
- O progresso do upload será calculado e exibido corretamente
- A montagem do arquivo final funcionará sem erros de "partes faltando"

