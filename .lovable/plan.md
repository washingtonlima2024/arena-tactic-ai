
# Corrigir Deteccao de Times - Priorizar Nome do Arquivo

## Problema

O arquivo de video se chama `BrasilxArgentina_1_50MB.mp4`, mas o sistema registrou "Paraguai" como adversario. Isso acontece porque:

1. A IA do backend (Ollama) analisa a **transcricao do audio** e identificou incorretamente "Paraguai"
2. O nome do arquivo contem a informacao correta ("Argentina"), mas so e usado como **fallback** quando a transcricao falha completamente
3. Nao existe validacao cruzada entre o que a IA extraiu e o que o nome do arquivo diz

## Solucao

Usar o nome do arquivo como **fonte prioritaria** para nomes de times, e so usar a IA para complementar dados que o filename nao fornece (competicao, data, estadio).

### Arquivo: `src/components/upload/SmartImportCard.tsx`

**Mudanca 1 - Extrair times do filename SEMPRE (nao so no fallback):**
- Mover a chamada `extractTeamsFromFilename` para **antes** da extracao por IA
- Passar os nomes extraidos do filename junto com os dados da IA no resultado final

**Mudanca 2 - Priorizar filename sobre IA nos nomes dos times:**
- Quando o filename contem nomes de times validos (>= 2 caracteres cada), usar esses nomes como `_homeTeamName` e `_awayTeamName`
- Usar os nomes da IA apenas quando o filename nao fornece nomes

A logica ficara assim:

```text
1. Extrair times do filename (BrasilxArgentina -> home=Brasil, away=Argentina)
2. Transcrever audio e extrair metadados via IA
3. Montar resultado final:
   - Times: usar filename se disponivel, senao usar IA
   - Competicao, data, estadio: usar IA (filename nao tem essa info)
```

### Arquivo: `src/pages/Upload.tsx`

Nenhuma mudanca necessaria - o `findTeamId` e auto-create ja funcionam corretamente com os nomes recebidos. O problema e apenas que recebem "Paraguai" em vez de "Argentina".

## Resumo

| Arquivo | Mudanca |
|---|---|
| `src/components/upload/SmartImportCard.tsx` | Extrair times do filename sempre e priorizar sobre resultado da IA |

Mudanca simples e localizada. O filename e uma fonte mais confiavel que a IA para nomes de times porque o usuario geralmente nomeia o arquivo com os times corretos.
