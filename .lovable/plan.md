

# Adicionar Prompts de Eventos na Configuracao Admin

## Situacao Atual

A tabela `ai_prompts` ja funciona com 4 prompts configurados:
- `chatbot_system` (Chatbot)
- `report_system` (Relatorio)
- `report_user_template` (Relatorio)
- `transcription_engine` (Transcricao)

Porem, os **3 prompts de geracao de eventos** estao hardcoded no `video-processor` Python (que roda 100% local, sem conexao com o banco Cloud). Eles precisam ser adicionados na tabela para ficarem visiveis e editaveis na tela Admin > Config.

## O Que Sera Feito

### 1. Inserir 3 novos prompts na tabela ai_prompts

Adicionar via migracao SQL os prompts do video-processor:

| prompt_key | prompt_name | category | modelo padrao |
|---|---|---|---|
| `event_detection_gpt` | Deteccao de Eventos (GPT) | events | openai/gpt-5 |
| `event_analysis_kakttus` | Analise de Eventos (Kakttus Local) | events | washingtonlima/kakttus |
| `event_consolidation` | Consolidacao Tatica | events | washingtonlima/kakttus |

Cada prompt tera:
- O texto completo (system + user) copiado do `ai_services.py`
- O modelo padrao pre-selecionado
- `is_default = true`
- `default_value` e `default_model` iguais ao valor inicial (para restaurar)

### 2. Atualizar o AdminPromptsManager

- Adicionar a categoria "events" no mapeamento de labels e icones:
  - Label: "Geracao de Eventos"
  - Icone: `Zap` (lucide-react)
- Os novos prompts aparecerao automaticamente na interface (ja agrupados por categoria)
- O seletor de modelo ja mostra todas as opcoes (Local/Ollama, Gemini, GPT) com o padrao marcado

### 3. Criar endpoint no video-processor para ler prompts

O video-processor roda 100% local (SQLite, sem Supabase). Para que ele use os prompts configurados no Admin, sera necessario:

- Criar um endpoint na API Flask: `GET /api/ai-prompts/<prompt_key>`
- Esse endpoint faz uma chamada HTTP ao Supabase REST API para buscar o prompt
- Se o Supabase nao estiver acessivel (modo offline), usa o prompt hardcoded como fallback
- As funcoes `detect_events_with_gpt()`, `analyze_with_kakttus()` e `consolidate_match_analysis()` verificam se ha prompt customizado antes de usar o hardcoded

**Alternativa mais simples**: Como o video-processor nao tem conexao direta com o Supabase (100% local), os prompts de eventos ficam visiveis e editaveis na Admin para referencia e futuro uso, mas o video-processor continua usando os hardcoded ate que uma sincronizacao seja implementada. Isso ja e util para:
- Documentar os prompts que o sistema usa
- Permitir ao admin copiar/colar manualmente para testar variantes
- Preparar a infraestrutura para quando o video-processor ganhar conexao Cloud

---

## Detalhes Tecnicos

### Arquivos a criar/modificar:

1. **Migracao SQL** - INSERT dos 3 novos prompts com textos completos copiados de `ai_services.py`
2. **src/components/admin/AdminPromptsManager.tsx** - Adicionar categoria "events" nos labels e icones

### Conteudo dos prompts a inserir:

**event_detection_gpt** (System prompt ~47 linhas):
- Prompt do `detect_events_with_gpt()` com regras de deteccao de gols, timestamps SRT, tipos de eventos
- Modelo padrao: `openai/gpt-5` (kakttus Vision Ultra)

**event_analysis_kakttus** (System + User prompt):
- Prompt do `analyze_with_kakttus()` com formato JSON simplificado (events, summary, tactical)
- Modelo padrao: `washingtonlima/kakttus` (kakttus.ai Local)

**event_consolidation** (System prompt):
- Prompt do `consolidate_match_analysis()` que gera visao tatica unificada dos 2 tempos
- Modelo padrao: `washingtonlima/kakttus` (kakttus.ai Local)

### Variaveis nos templates de eventos:
- `{home_team}`, `{away_team}` - nomes dos times
- `{half_desc}` - descricao do periodo (1o/2o tempo)
- `{game_start_minute}`, `{game_end_minute}` - intervalo de minutos
- `{transcription}` - texto da transcricao

