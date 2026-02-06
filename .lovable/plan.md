

# Prompts Parametrizados com Seletor de Modelo e Padrao na Administracao

## Objetivo

Criar um sistema na aba "Config" da Administracao onde o SuperAdmin pode editar os prompts de IA e escolher qual modelo processa cada prompt. O sistema sempre lista todos os modelos disponiveis (Local/Ollama, kakttus Pro/Gemini, kakttus Vision/GPT) e ja define um modelo padrao para cada prompt. A transcricao usa Whisper Local como padrao.

---

## O Que Sera Feito

### 1. Nova Tabela: ai_prompts

Tabela no banco de dados para armazenar os prompts e o modelo configurado:

- **id** (uuid, PK)
- **prompt_key** (text, unico) - identificador do prompt
- **prompt_name** (text) - nome amigavel exibido na interface
- **prompt_value** (text) - texto completo do prompt
- **description** (text) - descricao curta do que faz
- **category** (text) - "chatbot" | "report" | "transcription"
- **ai_model** (text) - modelo real selecionado (ex: "google/gemini-2.5-flash")
- **is_default** (boolean) - se e o valor padrao original (para restaurar)
- **default_value** (text) - copia do prompt original para restauracao
- **default_model** (text) - modelo padrao original
- **updated_at** (timestamp)
- **updated_by** (uuid)

Politicas RLS:
- SELECT: qualquer autenticado (edge functions precisam ler)
- INSERT/UPDATE/DELETE: apenas admins (is_admin())

Dados iniciais inseridos na migracao:

| prompt_key | prompt_name | category | modelo padrao | badge |
|---|---|---|---|---|
| chatbot_system | Chatbot - Prompt do Sistema | chatbot | google/gemini-3-flash-preview (kakttus Pro Flash) | Padrao |
| report_system | Relatorio - Prompt do Sistema | report | google/gemini-2.5-flash (kakttus Pro) | Padrao |
| report_user_template | Relatorio - Template do Usuario | report | google/gemini-2.5-flash (kakttus Pro) | Padrao |
| transcription_engine | Motor de Transcricao | transcription | whisper-local/base (kakttus Transcricao) | Padrao / Local |

### 2. Novo Componente: AdminPromptsManager

Interface na aba "Config" da Administracao com:

Para cada prompt cadastrado:
- Nome, descricao e categoria
- **Seletor de modelo com 3 categorias sempre visiveis e modelo padrao pre-selecionado**:
  - **kakttus.ai Local** - Modelos Ollama ja baixados (carrega dinamicamente via apiClient.getOllamaModels) + badge "Local"
  - **kakttus Pro** - Modelos Gemini fixos (Pro Ultra, Pro, Pro Lite, Pro Flash, Pro Preview) + badge "Cloud"
  - **kakttus Vision** - Modelos GPT fixos (Vision Ultra, Vision, Vision Lite, Vision Multi, Vision Mini, Reasoning, Reasoning Lite) + badge "Cloud"
- O modelo padrao de cada prompt vem pre-selecionado e marcado com badge "Padrao"
- Textarea grande para editar o texto do prompt
- Contagem de caracteres
- Legenda de variaveis disponiveis para o template do relatorio ({homeTeam}, {awayTeam}, {stats}, etc.)
- Botao "Restaurar Padrao" que volta prompt e modelo ao valor original
- Secao de transcricao mostrando Whisper Local como padrao com badge "Local / Padrao"

### 3. Novo Hook: useAiPrompts

Hook React para gerenciar CRUD dos prompts:
- Listar todos os prompts (useQuery)
- Atualizar texto e modelo de um prompt (useMutation)
- Restaurar prompt ao valor padrao
- Cache com React Query

### 4. Edge Functions Atualizadas

Ambas as edge functions serao modificadas para buscar prompts e modelo do banco:

**arena-chatbot/index.ts:**
- Cria cliente Supabase com SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
- Busca prompt_key "chatbot_system" na tabela ai_prompts
- Se encontrar: usa o prompt_value e o ai_model do banco
- Se nao encontrar (fallback): usa o prompt e modelo hardcoded atual
- Garante que nunca quebra mesmo se a tabela estiver vazia

**generate-match-report/index.ts:**
- Busca "report_system" e "report_user_template" na tabela ai_prompts
- Se encontrar: usa o prompt_value como system prompt e o ai_model como modelo
- Se nao encontrar: usa os prompts hardcoded atuais
- O user prompt template usa placeholders ({homeTeam}, {stats}, etc.) substituidos em runtime

### 5. AdminSettings Atualizado

A aba Config da Administracao recebe uma nova secao "Prompts e Modelos de IA" com o componente AdminPromptsManager integrado.

---

## Detalhes Tecnicos

### Arquivos a criar:
1. **Migracao SQL** - Tabela ai_prompts com RLS, dados iniciais (prompts atuais copiados + modelos padrao definidos)
2. **src/hooks/useAiPrompts.ts** - Hook CRUD para prompts com React Query
3. **src/components/admin/AdminPromptsManager.tsx** - Interface de edicao com seletor de modelo (3 categorias sempre visiveis + padrao marcado)

### Arquivos a modificar:
1. **supabase/functions/arena-chatbot/index.ts** - Adicionar busca de prompt e modelo no banco antes de usar hardcoded
2. **supabase/functions/generate-match-report/index.ts** - Adicionar busca de prompts e modelo no banco antes de usar hardcoded
3. **src/components/admin/AdminSettings.tsx** - Adicionar secao de Prompts e Modelos de IA com o AdminPromptsManager

### Modelos no seletor (sempre listados, com padrao marcado):

**kakttus.ai Local (Ollama)** - badge "Local"
- Carregados dinamicamente via apiClient.getOllamaModels() (ex: kakttus Mist, kakttus Llama, kakttus Deep, etc.)
- Usa formatOllamaModelName() do modelBranding.ts para nomes

**kakttus Pro (Gemini)** - badge "Cloud"
- google/gemini-2.5-pro → kakttus Pro Ultra
- google/gemini-2.5-flash → kakttus Pro (PADRAO para relatorio)
- google/gemini-2.5-flash-lite → kakttus Pro Lite
- google/gemini-3-pro-preview → kakttus Pro Preview
- google/gemini-3-flash-preview → kakttus Pro Flash (PADRAO para chatbot)

**kakttus Vision (GPT)** - badge "Cloud"
- openai/gpt-5 → kakttus Vision Ultra
- openai/gpt-5-mini → kakttus Vision
- openai/gpt-5-nano → kakttus Vision Lite

**kakttus Transcricao (Whisper)** - badge "Local / Padrao"
- whisper-local/tiny → kakttus Transcricao Tiny
- whisper-local/base → kakttus Transcricao Base (PADRAO)
- whisper-local/small → kakttus Transcricao Small
- whisper-local/medium → kakttus Transcricao Medium
- whisper-local/large-v3 → kakttus Transcricao Pro

### Como as edge functions buscam os prompts:

```text
// Dentro da edge function:
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const { data } = await supabase
  .from("ai_prompts")
  .select("prompt_value, ai_model")
  .eq("prompt_key", "chatbot_system")
  .single();

// Se encontrou, usa data.prompt_value e data.ai_model
// Se nao encontrou, usa SYSTEM_PROMPT e modelo hardcoded como fallback
```

### Variaveis disponiveis no template do relatorio:
`{homeTeam}`, `{awayTeam}`, `{homeScore}`, `{awayScore}`, `{competition}`, `{matchDate}`, `{venue}`, `{stats}`, `{bestPlayer}`, `{patterns}`, `{eventsList}`, `{firstHalfCount}`, `{secondHalfCount}`

### Seguranca:
- Apenas SuperAdmin/Admin edita prompts (RLS com is_admin())
- Edge functions leem com service_role_key (bypassa RLS para leitura)
- Campo updated_by registra quem editou por ultimo

