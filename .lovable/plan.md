
## Plano: Corrigir Campo de Futebol Cortado no Mapa de Calor

### Problema Identificado

Na página de Análise Tática, a seção "Mapa de Calor - Formação dos Jogadores" mostra o campo de futebol com as laterais cortadas. Os gols e as medidas (7.32m, GOL) ficam parcialmente visíveis nas bordas.

### Causa Raiz

Após a expansão do `viewBox` para incluir espaço para os gols e medidas, algumas referências no SVG ficaram inconsistentes:

1. **Outer boundary rect**: Usa `VIEW_WIDTH` e `VIEW_HEIGHT` (dimensões do viewBox com padding) em vez de `FIFA_FIELD.length` e `FIFA_FIELD.width` (dimensões reais do campo 105m x 68m)

2. **Linha central**: Usa `VIEW_HEIGHT` para a altura, o que estende além do campo

3. **Grid overlay**: Também usa `VIEW_WIDTH` e `VIEW_HEIGHT` incorretamente

### Alterações Propostas

**Arquivo**: `src/components/tactical/OfficialFootballField.tsx`

#### A. Corrigir Outer Boundary Rect (linha ~145-151)

```tsx
// ANTES (incorreto):
<rect
  x={m(0)}
  y={m(0)}
  width={VIEW_WIDTH}
  height={VIEW_HEIGHT}
  rx="4"
/>

// DEPOIS (correto):
<rect
  x={m(0)}
  y={m(0)}
  width={m(FIFA_FIELD.length)}
  height={m(FIFA_FIELD.width)}
  rx="4"
/>
```

#### B. Corrigir Linha Central (linhas ~153-159)

```tsx
// ANTES:
<line
  x1={m(FIELD_CALCULATIONS.halfLength)}
  y1={m(0)}
  x2={m(FIELD_CALCULATIONS.halfLength)}
  y2={VIEW_HEIGHT}
/>

// DEPOIS:
<line
  x1={m(FIELD_CALCULATIONS.halfLength)}
  y1={m(0)}
  x2={m(FIELD_CALCULATIONS.halfLength)}
  y2={m(FIFA_FIELD.width)}
/>
```

#### C. Corrigir Grid Overlay (linhas ~119-140)

```tsx
// Substituir VIEW_WIDTH e VIEW_HEIGHT por m(FIFA_FIELD.length) e m(FIFA_FIELD.width)
// nas linhas do grid
```

### Resultado Esperado

- Campo de futebol visível integralmente dentro do container
- Gols e medidas (7.32m) visíveis em ambos os lados
- Indicadores "GOL" vermelho com setas visíveis
- Grid e linhas do campo alinhadas corretamente com as bordas reais

### Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/tactical/OfficialFootballField.tsx` | Corrigir referências de `VIEW_WIDTH`/`VIEW_HEIGHT` para usar dimensões do campo real |
