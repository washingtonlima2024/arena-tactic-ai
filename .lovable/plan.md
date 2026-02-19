

# Corrigir: Importacao do 2T Apaga Eventos do 1T

## Problema Identificado

Ao importar apenas o segundo tempo de uma partida que ja tinha o primeiro tempo analisado, **todos os eventos do primeiro tempo desaparecem**.

## Causa Raiz

No pipeline async (`server.py`), quando voce importa so o 2T:

1. O sistema detecta que existe uma transcricao do 1T salva em disco (fallback nas linhas 9040-9066)
2. Carrega essa transcricao do 1T em `first_half_text`
3. Na Fase 4 (analise IA), como `first_half_text` nao esta vazio, o pipeline:
   - **DELETA todos os eventos do 1T** (linha 9433-9436)
   - Re-analisa o texto do 1T com a IA
4. Se a re-analise gera resultados diferentes (ou falha), os eventos originais do 1T sao perdidos

Em resumo: o pipeline trata a importacao incremental do 2T como se fosse um reprocessamento completo de ambos os tempos.

## Solucao

### Arquivo: `video-processor/server.py`

**Mudanca principal: Nao re-analisar tempos que nao foram importados nesta execucao**

O pipeline deve rastrear quais tempos foram **efetivamente enviados pelo usuario** nesta importacao (via `video_paths`) e so analisar/deletar eventos desses tempos. Se o 1T foi carregado apenas do fallback do storage (e nao tem video novo), ele deve ser **preservado intacto**.

Concretamente:

1. Criar duas flags no inicio da Fase 4:
   - `should_analyze_first = 'first' in video_paths` (usuario enviou video do 1T)
   - `should_analyze_second = 'second' in video_paths` (usuario enviou video do 2T)

2. Condicionar o bloco de analise do 1T (linhas 9427-9508):
   - `if first_half_text and should_analyze_first:` em vez de `if first_half_text:`
   - Isso garante que o 1T so e re-analisado se o usuario enviou um video novo do 1T

3. Condicionar o bloco de analise do 2T (linhas 9511-9600):
   - `if second_half_text and should_analyze_second:` em vez de `if second_half_text:`
   - Mesma logica para o 2T

4. Manter o fallback de transcricao do storage (linhas 9040-9066) APENAS para uso em boundary detection e SRT, sem disparar re-analise.

### Impacto

| Cenario | Antes | Depois |
|---|---|---|
| Importar so o 2T | Deleta e re-analisa 1T + analisa 2T | Preserva 1T + analisa so 2T |
| Importar so o 1T | Analisa 1T + deleta e re-analisa 2T se tinha | Preserva 2T + analisa so 1T |
| Importar ambos | Deleta e re-analisa ambos | Deleta e re-analisa ambos (sem mudanca) |
| Reprocessar tudo | Deleta e re-analisa ambos | Deleta e re-analisa ambos (sem mudanca) |

### Detalhes Tecnicos

```text
# Antes (BUGADO):
if first_half_text:        # <-- True mesmo se so o 2T foi importado
    DELETE first_half events  # <-- APAGA eventos do 1T!
    re-analyze first_half     # <-- Re-analisa (pode dar resultado diferente)

# Depois (CORRETO):
should_analyze_first = 'first' in video_paths
if first_half_text and should_analyze_first:  # <-- False se so o 2T foi importado
    DELETE first_half events
    re-analyze first_half

# 2T permanece igual:
should_analyze_second = 'second' in video_paths
if second_half_text and should_analyze_second:
    DELETE second_half events
    analyze second_half
```

### Arquivos afetados

| Arquivo | Mudanca |
|---|---|
| `video-processor/server.py` | Adicionar flags `should_analyze_first/second` baseadas em `video_paths` e condicionar blocos de delete+analise |

