

## Plano: Corrigir Exibição de Cartões Vermelhos Falsos

### Problema Identificado

Os eventos de "Cartão Vermelho" que você está vendo foram detectados incorretamente pela IA baseados em comentários hipotéticos do narrador. Apesar da correção no backend para prevenir novas detecções, **os eventos já existentes no banco de dados ainda possuem o tipo `red_card`**.

### Solução

Aplicar uma correção no frontend para tratar eventos `red_card` como `foul` (Falta) na exibição, garantindo que:

1. O texto exibido seja "Falta" ao invés de "Cartão Vermelho"
2. A cor do badge seja laranja (foul) ao invés de vermelho (card-red)

### Alterações Técnicas

#### 1. Arquivo: `src/components/events/EventTimeline.tsx`

Adicionar mapeamento que converte `red_card` para `foul` antes de renderizar:

```typescript
// Função para normalizar tipo do evento (red_card → foul)
const normalizeEventType = (type: string): string => {
  if (type === 'red_card') return 'foul';
  return type;
};
```

Aplicar essa normalização ao:
- Obter a variante do badge
- Obter o label do evento
- Obter o ícone do evento

#### 2. Arquivo: `src/lib/eventLabels.ts`

Atualizar a entrada de `red_card` para exibir "Falta" ao invés de "Cartão Vermelho".

### Resultado Esperado

- Eventos que foram detectados como `red_card` aparecerão como "Falta" com cor laranja
- A lógica de detecção no backend já previne novas detecções incorretas
- Após reprocessar a partida, os eventos antigos serão substituídos corretamente

