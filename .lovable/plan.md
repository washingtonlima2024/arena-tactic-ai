

## Plano: Corrigir Race Condition na Persistência dos Switches de IA

### Problema Identificado

Os switches de IA não estão persistindo porque existe uma **race condition** entre a mutação e o carregamento de dados:

1. O switch é ativado e o estado local muda para `true`
2. A mutação salva o valor no banco via POST
3. Em `onSuccess`, a query `api_settings` é invalidada
4. O `useEffect` que observa `apiSettings` re-executa
5. Se o registro ainda não existia, o `find()` retorna `undefined`
6. Com lógica `=== "true"`, `undefined === "true"` é `false`
7. O estado local é **sobrescrito de volta para `false`**

### Dados Atuais no Banco

| Chave | Valor | Status |
|-------|-------|--------|
| `gemini_enabled` | **NÃO EXISTE** | ❌ Será criado no primeiro toggle |
| `openai_enabled` | "false" | ⚠️ Existe mas está desativado |
| `elevenlabs_enabled` | "false" | ⚠️ Existe mas está desativado |
| `ollama_enabled` | "true" | ✅ Funciona |

### Solução

Adicionar um **ref de controle** para ignorar a sincronização do `useEffect` quando uma mutação estiver em progresso. Isso evita que o `useEffect` sobrescreva o estado local durante a invalidação.

---

### Alterações Necessárias

#### Arquivo: `src/pages/Settings.tsx`

**1. Adicionar ref de controle no início do componente (após os estados):**

```typescript
// Flag para ignorar re-sync durante mutações
const isMutatingRef = useRef(false);
```

**2. Modificar o useEffect para verificar a flag:**

```typescript
useEffect(() => {
  // Ignorar sincronização se estamos no meio de uma mutação
  if (isMutatingRef.current) return;
  
  if (apiSettings) {
    // ... resto do código existente ...
  }
}, [apiSettings]);
```

**3. Modificar os handlers dos switches para controlar a flag:**

```typescript
onCheckedChange={async (checked) => {
  isMutatingRef.current = true;  // Bloquear re-sync
  setGeminiEnabled(checked);
  try {
    await upsertApiSetting.mutateAsync({
      key: "gemini_enabled",
      value: String(checked),
    });
    toast.success(checked ? "Gemini ativado!" : "Gemini desativado");
  } catch (error) {
    setGeminiEnabled(!checked);
    toast.error("Erro ao salvar configuração");
  } finally {
    // Aguardar a query ser refetchada antes de liberar
    setTimeout(() => {
      isMutatingRef.current = false;
    }, 500);
  }
}}
```

**4. Aplicar o mesmo padrão para os 4 switches:**
- Google Gemini (`gemini_enabled`)
- OpenAI GPT (`openai_enabled`)
- ElevenLabs (`elevenlabs_enabled`)
- Ollama (`ollama_enabled`)

---

### Comportamento Resultante

```text
┌─────────────────────────────────────────────────────────────────┐
│ ANTES                                                           │
├─────────────────────────────────────────────────────────────────┤
│ Switch ON → setGeminiEnabled(true) → POST → invalidate         │
│                                         ↓                        │
│                                    useEffect re-executa         │
│                                         ↓                        │
│                              gemini_enabled = undefined          │
│                                         ↓                        │
│                              setGeminiEnabled(false) ← REVERT!  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ DEPOIS                                                          │
├─────────────────────────────────────────────────────────────────┤
│ Switch ON → isMutatingRef = true → setGeminiEnabled(true)       │
│                                         ↓                        │
│                                    POST → invalidate            │
│                                         ↓                        │
│                              useEffect: if (isMutatingRef) return│
│                                         ↓                        │
│                              Estado preservado = true ✓          │
└─────────────────────────────────────────────────────────────────┘
```

---

### Arquivos Modificados

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Settings.tsx` | Adicionar ref + modificar useEffect + atualizar 4 handlers |

### Detalhes Técnicos

1. **Por que usar `useRef` em vez de `useState`?**
   - `useRef` não causa re-render quando alterado
   - Permite controlar a flag sem ciclos de renderização adicionais

2. **Por que usar `setTimeout` de 500ms?**
   - Dá tempo para a query invalidada ser refetchada
   - A invalidação do React Query é assíncrona
   - Garante que o novo valor já esteja no cache

3. **Alternativa considerada:**
   - Usar `setQueryData` para atualização otimista, mas isso adicionaria complexidade desnecessária

### Estimativa

- 1 import a adicionar (`useRef`)
- 1 ref a criar
- 1 linha a adicionar no useEffect
- 4 handlers de switch a modificar

