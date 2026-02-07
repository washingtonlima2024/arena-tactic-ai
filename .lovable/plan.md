
# Progresso Animado no Preload do Smart Import

## Problema

Quando o usuario clica "Iniciar Importacao", o SmartImportCard mostra a tela de processamento com o progresso **travado em 20%** enquanto a API de transcricao roda (pode levar varios minutos). Isso da a impressao de travamento total. A versao anterior mostrava evolucao gradual ate ~20%, o que passava confianca ao usuario.

O fluxo atual:
```text
0% --> pula para 20% (instantaneo) --> trava por 2-5 minutos --> pula para 70% --> 100%
```

## Solucao

Implementar **progresso simulado gradual** que anima a barra de forma continua durante cada etapa longa, com sub-mensagens que mudam ao longo do tempo para dar sensacao de atividade real.

Fluxo proposto:
```text
0% "Preparando..." 
  --> 5% "Enviando video..." (gradual)
  --> 8% "Extraindo audio..." (gradual)
  --> 12% "Iniciando transcricao..." (gradual, ~1s cada step)
  --> 15-55% "Transcrevendo audio... X%" (incremento lento durante await)
  --> 60% "Transcricao concluida"
  --> 65-85% "IA analisando transcricao..." (incremento durante await)
  --> 90% "Extraindo metadados..."
  --> 100% "Concluido!"
```

Alem disso, substituir o icone generico `Loader2` pelo `SoccerBallLoader` existente no projeto, que ja tem animacoes de bounce, spin e particulas — muito mais visual e tematico.

## Mudancas

### Arquivo: `src/components/upload/SmartImportCard.tsx`

**1. Adicionar timer de progresso simulado**

Criar um `useEffect` + `useRef` com `setInterval` que incrementa o progresso de forma gradual durante cada fase. A logica:

- Quando `step === 'processing'`, iniciar um intervalo que roda a cada 800ms
- Cada tick incrementa `percent` em 1-2 pontos, ate o limite da fase atual
- Fases com limites:
  - Fase "transcricao": limite de 55% (enquanto espera `smartImportTranscribe`)
  - Fase "extracao": limite de 85% (enquanto espera `extractMatchInfo`)
- Ao receber resposta da API, atualizar para o valor real e mudar a fase
- Sub-mensagens rotativas durante a transcricao: "Extraindo audio...", "Processando linguagem natural...", "Identificando narrador...", etc.

**2. Substituir UI de processing**

Trocar o `Loader2` + `Progress` por `SoccerBallLoader` que ja suporta `message` e `progress` como props, mantendo a barra de progresso dentro dele.

**3. Logica de progresso detalhada no `handleStartProcessing`**

Antes de cada `await`, definir a fase atual (que controla o limite do timer):
- `setPhase('transcribing')` antes de `apiClient.smartImportTranscribe()`
- `setPhase('extracting')` antes de `apiClient.extractMatchInfo()`
- `setPhase('done')` ao final

## Detalhes Tecnicos

Estado adicional no componente:

```typescript
const [phase, setPhase] = useState<'idle' | 'transcribing' | 'extracting' | 'done'>('idle');
const progressTimerRef = useRef<NodeJS.Timeout | null>(null);
```

Timer de progresso simulado (useEffect):

```typescript
useEffect(() => {
  if (step !== 'processing' || phase === 'idle' || phase === 'done') {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    return;
  }

  const limits = { transcribing: 55, extracting: 85 };
  const maxPercent = limits[phase] || 90;
  
  // Sub-mensagens rotativas
  const messages = {
    transcribing: [
      'Enviando video para transcrição...',
      'Extraindo faixa de áudio...',
      'Processando áudio com IA...',
      'Transcrevendo narração...',
      'Identificando times e jogadores...',
      'Analisando contexto da partida...',
    ],
    extracting: [
      'IA analisando transcrição...',
      'Identificando times...',
      'Extraindo metadados da partida...',
      'Detectando competição e data...',
    ],
  };
  
  let msgIndex = 0;
  progressTimerRef.current = setInterval(() => {
    setProgress(prev => {
      const increment = phase === 'transcribing' ? 0.8 : 1.2;
      const newPercent = Math.min(prev.percent + increment, maxPercent);
      const phaseMessages = messages[phase] || [];
      const newMsgIndex = Math.floor((newPercent / maxPercent) * phaseMessages.length);
      const message = phaseMessages[Math.min(newMsgIndex, phaseMessages.length - 1)] || prev.message;
      return { percent: newPercent, message };
    });
  }, 1200);

  return () => { if (progressTimerRef.current) clearInterval(progressTimerRef.current); };
}, [step, phase]);
```

Fluxo atualizado do `handleStartProcessing`:

```typescript
setStep('processing');
setPhase('transcribing');
setProgress({ message: 'Preparando vídeo...', percent: 2 });

// await transcription (timer anima de 2% ate ~55%)
const result = await apiClient.smartImportTranscribe(...);

setPhase('extracting');
setProgress({ message: 'IA analisando transcrição...', percent: 60 });

// await extraction (timer anima de 60% ate ~85%)
const extractResult = await apiClient.extractMatchInfo(...);

setPhase('done');
setProgress({ message: 'Metadados extraídos!', percent: 100 });
```

UI com SoccerBallLoader:

```tsx
{step === 'processing' && (
  <div className="space-y-4 py-4">
    <SoccerBallLoader
      message={progress.message}
      progress={progress.percent}
      showProgress={true}
    />
    <p className="text-xs text-muted-foreground text-center">
      Isso pode levar alguns minutos dependendo da duracao do video
    </p>
  </div>
)}
```

## Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/components/upload/SmartImportCard.tsx` | Adicionar estado `phase`, timer de progresso simulado, sub-mensagens rotativas, substituir Loader2 por SoccerBallLoader |

## O Que NAO Muda

- Nenhuma alteracao no backend ou pipeline
- O `AsyncProcessingProgress` (auto-processing) continua igual
- O `SoccerBallLoader` nao e alterado
- O fluxo de upload de video e criacao de match nao e alterado

## Resultado Esperado

- Barra de progresso evolui gradualmente de 0% a 55% durante a transcricao (~1% a cada 1.2s)
- Mensagens mudam automaticamente ("Enviando video...", "Extraindo audio...", "Transcrevendo narracao...", etc.)
- SoccerBallLoader com animacao de bola dando bounce, muito mais visual
- Usuario nunca ve a barra "travada" — sempre tem evolucao visivel
