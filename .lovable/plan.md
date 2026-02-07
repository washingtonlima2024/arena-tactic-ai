
# Plano: Pipeline Automatizado Completo no Smart Import

## Problema Atual

O fluxo do Smart Import para na etapa de **gestao de videos** (`videos` step), exigindo que o usuario:
1. Revise os videos adicionados manualmente
2. Clique em "Continuar para Analise"
3. Revise o resumo
4. Clique em "Iniciar Analise"
5. O sistema transcreve **novamente** o video inteiro

Isso contradiz o objetivo de automacao "zero-clique" do Smart Import.

## Solucao Proposta

Apos o Smart Import criar a partida e vincular o video, o sistema deve **automaticamente** iniciar o pipeline completo de analise, pulando as etapas intermediarias (videos, summary). A transcricao ja obtida sera reutilizada, e o backend cuidara de:
- Extrair o audio
- Gerar versao otimizada do video
- Organizar os arquivos na estrutura de pastas existente (audio/, clips/, images/, json/, srt/, texts/, videos/)
- Analisar eventos usando a transcricao ja existente
- Gerar clips e thumbnails

```text
FLUXO ATUAL:
  Smart Import (transcricao 5min)
    --> Cria partida
    --> Vai para tela de Videos (manual)
    --> Usuario clica "Continuar"
    --> Resumo (manual)
    --> Usuario clica "Iniciar Analise"
    --> Transcreve NOVAMENTE + Analisa

FLUXO NOVO:
  Smart Import (transcricao 5min)
    --> Cria partida + vincula video
    --> Inicia pipeline async AUTOMATICAMENTE
    --> Mostra progresso (AsyncProcessingProgress)
    --> Redireciona para pagina de Eventos quando completo
```

## Mudancas por Arquivo

### 1. src/pages/Upload.tsx

**No callback `onMatchInfoExtracted` (linhas ~2657-2825):**

Apos criar a partida e vincular o video com sucesso, em vez de ir para `setCurrentStep('videos')`, o sistema:

1. Monta os `videoInputs` a partir do video vinculado (file ou URL)
2. Chama `asyncProcessing.startProcessing()` passando:
   - `matchId` recem-criado
   - `videoInputs` com os dados do video
   - `homeTeam` / `awayTeam` dos times criados/encontrados
   - `firstHalfTranscription` com a transcricao do Smart Import
   - `autoClip: true` e `autoAnalysis: true`
3. Muda para um novo step `'auto-processing'` que mostra o `AsyncProcessingProgress`

**Novo step `'auto-processing'`:**

Adicionar um novo bloco de renderizacao condicional para `currentStep === 'auto-processing'` que exibe:
- O componente `AsyncProcessingProgress` ja existente
- Um indicador de que o processo foi iniciado automaticamente
- Redirecionamento automatico para `/events?match={matchId}` quando o status for `complete`

**Para upload de arquivo (videoFile):**

Quando o Smart Import fornece um `videoFile`, o upload precisa completar antes de iniciar o pipeline. O fluxo sera:
1. Fazer upload do arquivo (reutilizar `uploadFile()` existente)
2. Aguardar conclusao do upload
3. Usar a URL resultante para montar o `videoInput`
4. Iniciar o pipeline async

**Para URL/link (videoUrl):**

Quando e uma URL, nao precisa de upload. Montar o `videoInput` diretamente com a URL.

### 2. src/components/upload/SmartImportCard.tsx

Sem alteracoes adicionais necessarias. O componente ja passa corretamente a transcricao, video e dados da partida para o callback.

## Detalhes Tecnicos

### Montagem do VideoInput

```text
videoInputs = [{
  url: <url do video apos upload ou URL direta>,
  halfType: 'first',
  videoType: 'full',
  startMinute: 0,
  endMinute: 90,
  sizeMB: <tamanho em MB se conhecido>,
}]
```

### Reutilizacao da Transcricao

O parametro `firstHalfTranscription` no `startAsyncProcessing` ja e suportado pelo backend (server.py linhas 8043-8055). Ao recebe-lo, o backend pula o Whisper automaticamente e usa a transcricao fornecida.

### Fluxo de Upload + Pipeline

Para arquivos locais (videoFile), o upload precisa completar primeiro. A logica sera:

```text
1. Criar partida (createMatch)
2. Se videoFile:
   a. Upload do arquivo via apiClient
   b. Obter URL resultante
3. Se videoUrl:
   a. Usar URL diretamente
4. Iniciar asyncProcessing.startProcessing()
5. Mudar para step 'auto-processing'
```

### Novo Step de Renderizacao

O step `'auto-processing'` reutilizara o componente `AsyncProcessingProgress` ja existente, adicionando:
- Um banner informando que o processamento foi iniciado automaticamente
- Um `useEffect` que monitora `asyncProcessing.isComplete` para redirecionar

## Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/Upload.tsx` | Novo step `'auto-processing'`; callback do Smart Import inicia pipeline automaticamente |

## Beneficios

- Elimina 3 cliques manuais do fluxo (videos, continuar, iniciar)
- Transcricao feita apenas uma vez (reutilizada do Smart Import)
- Backend cuida de toda a organizacao de arquivos na estrutura existente
- Usuario ve apenas o progresso e e redirecionado automaticamente ao final
- Fluxo manual continua disponivel para quem preferir (opcao "Nova Partida" no choice)
