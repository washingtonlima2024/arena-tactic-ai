

# Correção: IndentationError na linha 8547 do server.py

## Problema

O `raise Exception(...)` na linha 8547 está com **4 espaços a mais** do que deveria. Ele está alinhado como se estivesse dentro do bloco `try/finally` acima, mas pertence ao bloco `else:` da linha 8542.

## Correção

**Arquivo**: `video-processor/server.py`, **linha 8547**

Mudar a indentação do `raise` de 32 espaços para 28 espaços (mesmo nível do `print` na linha 8546):

```python
# ANTES (errado - 32 espaços):
                        else:
                            tmp_dir_path = os.path.dirname(video_path)
                            files_in_tmp = os.listdir(tmp_dir_path) if os.path.exists(tmp_dir_path) else []
                            print(f"[ASYNC-PIPELINE] Arquivos no tmp: {files_in_tmp}")
                                raise Exception(f"Download de {platform} completou mas arquivo não encontrado")

# DEPOIS (correto - 28 espaços, alinhado com o print):
                        else:
                            tmp_dir_path = os.path.dirname(video_path)
                            files_in_tmp = os.listdir(tmp_dir_path) if os.path.exists(tmp_dir_path) else []
                            print(f"[ASYNC-PIPELINE] Arquivos no tmp: {files_in_tmp}")
                            raise Exception(f"Download de {platform} completou mas arquivo não encontrado")
```

A unica mudanca e remover 4 espacos extras no inicio da linha 8547.

Apos corrigir, reiniciar com `pm2 restart arena-backend`.

