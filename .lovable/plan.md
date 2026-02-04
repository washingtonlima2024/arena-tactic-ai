
# Plano de Otimização do Ollama para Detecção de Eventos

## ✅ STATUS: IMPLEMENTADO

---

## Alterações Realizadas

### 1. `call_ollama()` - Modo JSON Nativo
- Adicionado parâmetro `format="json"` para forçar resposta JSON válida
- Elimina problemas de parsing e respostas malformadas

### 2. Prompt Otimizado
- Reduzido de ~800 palavras para ~200 palavras
- Mais direto e focado em keywords específicas
- Melhor performance com modelos 7B

### 3. Parâmetros Ajustados
- `temperature`: 0.3 → **0.1** (mais determinístico)
- `max_tokens`: 8192 → **4096** (suficiente)
- `format`: *(não usado)* → **"json"** (força JSON válido)

### 4. Validação Pós-Ollama
- Nova função `_validate_goals_with_context()`
- Remove gols falsos verificando negações no contexto
- Detecta: "quase gol", "na trave", "perdeu", "anulado", etc.

### 5. Modelo Padrão Atualizado
- Alterado de `washingtonlima/kakttus` para **`mistral:7b-instruct`**
- Melhor suporte a JSON e instruções estruturadas

---

## Próximos Passos (Manual)

### Instalar o modelo recomendado:
```bash
ollama pull mistral:7b-instruct
```

### Alternativamente (para PT-BR):
```bash
ollama pull qwen2.5:7b
```

---

## Benefícios Esperados

- **+50% precisão** na detecção de gols (eliminando falsos positivos)
- **Parsing 100% confiável** com modo JSON nativo
- **Menos retries** por respostas malformadas
- **Análise mais rápida** com prompt menor
