
# Unificar Regras de Importação por Link para o 2º Tempo

## Problema Identificado

Na aba **"Upload"** (file upload), o sistema oferece seletores para escolher entre:
- **1º Tempo** (0-45 min, videoType: 'first_half')
- **2º Tempo** (45-90 min, videoType: 'second_half')
- **Partida Completa** (0-90 min, videoType: 'full')

Porém, na aba **"Link/Embed"**, o código sempre define:
- `autoType: 'full'` (linha 758 de Upload.tsx)
- `half: undefined` (linha 789)
- Não há seletor para o usuário escolher o período

Isso causa inconsistência: vídeos importados por link são sempre tratados como "Partida Completa", impossibilitando a importação incremental do 2º tempo via URL.

## Solução Proposta

Adicionar um **ToggleGroup** (ou botões) na aba Link/Embed **antes do textarea**, permitindo ao usuário selecionar qual período o link representa. O mapeamento será idêntico ao da aba "Upload":

| Seleção | videoType | half | startMinute | endMinute |
|---------|-----------|------|-------------|-----------|
| 1º Tempo | `first_half` | `'first'` | 0 | 45 |
| 2º Tempo | `second_half` | `'second'` | 45 | 90 |
| Jogo Completo | `full` | `undefined` | 0 | 90 |

## Mudanças Necessárias

### 1. **`src/pages/Upload.tsx` - Adicionar Estado**

Criar novo estado para rastrear a seleção de tempo no link:
```typescript
const [linkHalfType, setLinkHalfType] = useState<'first' | 'second' | 'full'>('full');
```

### 2. **`src/pages/Upload.tsx` - Modificar Função `addVideoLink`**

Alterar a lógica de atribuição de videoType (linhas 757-790):

**Antes:**
```typescript
const autoType: VideoType = 'full';
// ... sempre 'full'
const newSegment: VideoSegment = {
  // ...
  videoType: autoType,
  half: undefined,
  startMinute: 0,
  endMinute: 90,
};
```

**Depois:**
```typescript
const typeConfig = {
  first: { type: 'first_half' as VideoType, half: 'first' as const, start: 0, end: 45 },
  second: { type: 'second_half' as VideoType, half: 'second' as const, start: 45, end: 90 },
  full: { type: 'full' as VideoType, half: undefined, start: 0, end: 90 }
};

const config = typeConfig[linkHalfType];

const newSegment: VideoSegment = {
  // ...
  videoType: config.type,
  half: config.half,
  startMinute: config.start,
  endMinute: config.end,
  title: {
    first: '1º Tempo',
    second: '2º Tempo',
    full: 'Partida Completa'
  }[linkHalfType],
};
```

### 3. **`src/pages/Upload.tsx` - Adicionar UI na Aba Link (linhas 3342-3350)**

Inserir ToggleGroup **antes do Textarea**, com três opções:

```text
Aba Link/Embed
├── [NEW] ------- Selecione o Período -------
├── [NEW] ToggleGroup: [1º Tempo] [2º Tempo] [Jogo Completo]
├── Textarea: "Cole o link do vídeo..."
└── Button: "Adicionar Vídeo"
```

Usar componentes já existentes no projeto:
- `ToggleGroup` e `ToggleGroupItem` (src/components/ui/toggle-group.tsx)
- Cores consistentes: Azul para 1º, Laranja para 2º, Verde para Completo
- Similar ao layout dos botões na aba "Local File Mode" (linhas 3226-3275)

## Fluxo de Uso

1. Usuário acessa a aba **"Link/Embed"**
2. Seleciona o período (1º Tempo, 2º Tempo ou Jogo Completo)
3. Cola o link do vídeo
4. Clica "Adicionar Vídeo"
5. Sistema cria o segmento com:
   - `videoType`, `half`, `startMinute`, `endMinute` corretos
   - Matching automático de transcrição (SRT) baseado em `half`
   - Envio ao backend com informação correta do período

## Benefícios

✅ Uniformidade: Link funciona identicamente ao upload por arquivo
✅ Suporte ao 2º tempo: Permite importação incremental via URL
✅ Transcrição automática: Sistema encontra SRT correto baseado em `half`
✅ Pipeline robusto: Backend recebe informação consistente de período
✅ UX melhorada: Usuário tem controle explícito sobre classificação do vídeo

## Arquivos a Modificar

1. **`src/pages/Upload.tsx`**
   - Adicionar estado `linkHalfType`
   - Modificar função `addVideoLink` para usar a seleção
   - Adicionar UI (ToggleGroup) antes do textarea na aba Link

## Detalhes Técnicos

### Posição do ToggleGroup (linha 3342-3350)
```
TabsContent value="link"
├── CardHeader
├── CardContent
│   ├── [NEW] Label "Selecione o período do vídeo"
│   ├── [NEW] ToggleGroup (3 opções)
│   ├── Textarea (newLinkInput)
│   └── Button (addVideoLink)
└── ...
```

### Estilos dos Botões de Período
Reutilizar estilos existentes do projeto:
- **1º Tempo**: Azul (blue-500)
- **2º Tempo**: Laranja (orange-500)
- **Jogo Completo**: Verde (emerald-500)

Usar ToggleGroup com valores: `'first' | 'second' | 'full'`

