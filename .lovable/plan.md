
# Diagnóstico e Correção: Ollama Não Disponível

## Problema Identificado

Os logs mostram que a análise de eventos está falhando porque:

1. **Ollama não está rodando** em `http://localhost:11434`
2. **Apenas Ollama está configurado** como provedor de IA na lista de prioridades
3. Quando a conexão com Ollama falha, o sistema não tem fallback disponível

```
Ollama not available at http://localhost:11434
[AI] Priority order: ollama
[AI] Trying ollama...
[AI] Error: All AI providers failed. Last error: None
```

---

## Soluções (em ordem de prioridade)

### Solução 1: Iniciar o Ollama no Servidor (Recomendado)

Execute no terminal do servidor:

```bash
# Verificar se Ollama está instalado
ollama --version

# Se não estiver instalado:
curl -fsSL https://ollama.com/install.sh | sh

# Iniciar serviço Ollama
ollama serve &

# Ou como serviço systemd (persistente)
sudo systemctl start ollama
sudo systemctl enable ollama

# Baixar o modelo recomendado
ollama pull mistral:7b-instruct
```

---

### Solução 2: Adicionar Fallback para Gemini/OpenAI

Se o Ollama não puder rodar permanentemente, podemos configurar fallback automático para APIs cloud:

**Alteração em `video-processor/ai_services.py`:**

Na função `call_ai()`, quando Ollama falha, o sistema deve tentar automaticamente outros provedores configurados (Gemini/OpenAI) mesmo que não estejam na lista de prioridade.

```python
# Em call_ai():
# Se todos os provedores priorizados falharem, tentar fallback automático
if not result and GOOGLE_API_KEY and GEMINI_ENABLED:
    print("[AI] ⚠ Tentando fallback: Gemini")
    result = call_google_gemini(messages, model, temperature, max_tokens)
```

---

### Solução 3: Melhorar UI com Status em Tempo Real

Adicionar indicador visual na página de Eventos que mostre se o Ollama está acessível antes de iniciar a análise.

**Alteração em `src/pages/Events.tsx`:**

- Adicionar verificação de saúde do Ollama antes de processar
- Mostrar aviso se Ollama estiver offline
- Sugerir ao usuário habilitar outro provedor em Configurações

---

## Recomendação de Implementação

| Ordem | Ação | Complexidade | Impacto |
|-------|------|--------------|---------|
| 1 | Iniciar Ollama no servidor | Nenhuma (manual) | Resolve imediatamente |
| 2 | Adicionar fallback automático para Gemini | Média | Garante análise mesmo sem Ollama |
| 3 | Adicionar check prévio na UI | Baixa | Melhora UX |

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `video-processor/ai_services.py` | Adicionar fallback automático em `call_ai()` quando Ollama falhar |
| `video-processor/ai_services.py` | Adicionar fallback em `_analyze_events_with_ollama()` para usar Gemini se Ollama offline |
| `src/pages/Events.tsx` | Verificar status do Ollama antes de processar e mostrar aviso |
| `src/lib/apiClient.ts` | Adicionar método `checkOllamaStatus()` |

---

## Implementação Técnica

### 1. Fallback em `_analyze_events_with_ollama()`:

```python
def _analyze_events_with_ollama(...) -> List[Dict[str, Any]]:
    # ... código existente ...
    
    result = call_ollama(messages=[...], format="json")
    
    if not result:
        # FALLBACK: Se Ollama falhar, tentar Gemini
        if GOOGLE_API_KEY and GEMINI_ENABLED:
            print(f"[Ollama] ⚠ Offline! Usando fallback: Gemini")
            result = call_google_gemini(
                messages=[{'role': 'user', 'content': prompt}],
                temperature=0.1,
                max_tokens=4096
            )
            
        # FALLBACK 2: Detecção por keywords (sempre funciona)
        if not result:
            print(f"[Ollama] ⚠ Sem IA disponível! Usando detecção por keywords")
            return detect_events_by_keywords_from_text(
                transcription, home_team, away_team, match_half, game_start_minute
            )
    
    # ... resto do parsing ...
```

### 2. Verificação na UI:

```typescript
// Em Events.tsx
const handleProcessMatch = async () => {
  // Verificar status do Ollama primeiro
  try {
    const aiStatus = await apiClient.get('/api/ai-status');
    if (!aiStatus.ollama?.configured) {
      toast.warning('Ollama offline. Será usado fallback (Gemini ou Keywords).');
    }
  } catch { /* ignore */ }
  
  // Continuar processamento...
};
```

---

## Benefícios Esperados

- **Resiliência**: Análise funciona mesmo com Ollama offline
- **UX Melhorada**: Usuário sabe quando há problemas antes de processar
- **Flexibilidade**: Múltiplos caminhos para completar análise
- **Cobertura Mínima**: Fallback para keywords garante detecção básica sempre
