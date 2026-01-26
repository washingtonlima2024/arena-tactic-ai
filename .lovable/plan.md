
## Plano: Corrigir Persistência Imediata dos Switches de IA

### Problema Identificado

Os switches de ativação das IAs (Gemini, OpenAI, Ollama, ElevenLabs) **não salvam automaticamente** quando alterados. O usuário precisa clicar no botão "Salvar Alterações" no final da página, mas a maioria dos usuários não percebe isso.

O Whisper Local funciona corretamente porque tem salvamento imediato implementado.

### Solução

Atualizar os handlers `onCheckedChange` dos switches para salvar imediatamente no banco de dados, similar ao comportamento do Whisper Local.

---

### Alterações Necessárias

#### Arquivo: `src/pages/Settings.tsx`

**1. Switch Google Gemini (linha ~628)**

Alterar de:
```tsx
<Switch checked={geminiEnabled} onCheckedChange={setGeminiEnabled} />
```

Para:
```tsx
<Switch
  checked={geminiEnabled}
  onCheckedChange={async (checked) => {
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
    }
  }}
/>
```

**2. Switch OpenAI GPT (linha ~702)**

Alterar de:
```tsx
<Switch checked={openaiEnabled} onCheckedChange={setOpenaiEnabled} />
```

Para:
```tsx
<Switch
  checked={openaiEnabled}
  onCheckedChange={async (checked) => {
    setOpenaiEnabled(checked);
    try {
      await upsertApiSetting.mutateAsync({
        key: "openai_enabled",
        value: String(checked),
      });
      toast.success(checked ? "OpenAI ativado!" : "OpenAI desativado");
    } catch (error) {
      setOpenaiEnabled(!checked);
      toast.error("Erro ao salvar configuração");
    }
  }}
/>
```

**3. Switch ElevenLabs (linha ~779)**

Alterar de:
```tsx
<Switch checked={elevenlabsEnabled} onCheckedChange={setElevenlabsEnabled} />
```

Para:
```tsx
<Switch
  checked={elevenlabsEnabled}
  onCheckedChange={async (checked) => {
    setElevenlabsEnabled(checked);
    try {
      await upsertApiSetting.mutateAsync({
        key: "elevenlabs_enabled",
        value: String(checked),
      });
      toast.success(checked ? "ElevenLabs ativado!" : "ElevenLabs desativado");
    } catch (error) {
      setElevenlabsEnabled(!checked);
      toast.error("Erro ao salvar configuração");
    }
  }}
/>
```

**4. Switch Ollama (linha ~946)**

Alterar de:
```tsx
<Switch checked={ollamaEnabled} onCheckedChange={setOllamaEnabled} />
```

Para:
```tsx
<Switch
  checked={ollamaEnabled}
  onCheckedChange={async (checked) => {
    setOllamaEnabled(checked);
    try {
      await upsertApiSetting.mutateAsync({
        key: "ollama_enabled",
        value: String(checked),
      });
      toast.success(checked ? "Ollama ativado!" : "Ollama desativado");
    } catch (error) {
      setOllamaEnabled(!checked);
      toast.error("Erro ao salvar configuração");
    }
  }}
/>
```

---

### Comportamento Resultante

| Antes | Depois |
|-------|--------|
| Usuário altera switch → estado local muda | Usuário altera switch → estado local muda |
| Configuração só salva ao clicar "Salvar Alterações" | Configuração salva **imediatamente** no banco |
| Sair da página perde alteração | Alteração persiste automaticamente |
| Sem feedback ao usuário | Toast de confirmação ("Gemini ativado!") |

---

### Benefícios

- **Experiência do usuário melhorada**: Comportamento consistente com Whisper Local
- **Menos confusão**: Não depende mais de um botão de salvar no final
- **Feedback imediato**: Toast confirma que a alteração foi salva
- **Rollback automático**: Se falhar ao salvar, reverte o switch para estado anterior

---

### Arquivos Modificados

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Settings.tsx` | 4 switches atualizados com salvamento imediato |

### Estimativa

- 4 blocos de código a modificar (substituição de handlers simples)
- Sem impacto em outras partes do sistema
- Implementação similar ao padrão já existente no Whisper Local
