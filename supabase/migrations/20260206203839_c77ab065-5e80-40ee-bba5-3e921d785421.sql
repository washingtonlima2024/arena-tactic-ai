-- Adicionar colunas para sub-prompts
ALTER TABLE public.ai_prompts 
ADD COLUMN IF NOT EXISTS parent_prompt_id uuid REFERENCES public.ai_prompts(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS event_type_filter text;

-- Índice para buscar sub-prompts de um prompt pai
CREATE INDEX IF NOT EXISTS idx_ai_prompts_parent ON public.ai_prompts(parent_prompt_id) WHERE parent_prompt_id IS NOT NULL;

-- Inserir sub-prompt de gol vinculado ao event_detection_gpt
INSERT INTO public.ai_prompts (
  prompt_key, prompt_name, category, ai_model, default_model,
  prompt_value, default_value, description, is_default,
  parent_prompt_id, event_type_filter
) VALUES (
  'event_goal_priority',
  'Prioridade de Gols',
  'events',
  'openai/gpt-5',
  'openai/gpt-5',
  E'REGRAS DE PRIORIDADE PARA DETECÇÃO DE GOLS:\n\n1. THRESHOLDS DE CONFIANÇA:\n   - Gol com menção clara (GOL, GOOOL, GOLAÇO, ENTROU, PRA DENTRO): confidence mínima = 0.3\n   - Gol sem menção explícita: confidence mínima = 0.5\n   - Outros eventos (falta, escanteio, etc.): confidence mínima = 0.7\n\n2. PALAVRAS-CHAVE DE GOL (aprovar sempre que detectar):\n   GOL, GOOOL, GOOOOL, GOLAÇO, GOLAAAAÇO, É GOL\n   PRA DENTRO, ENTROU, MANDOU PRA REDE\n   BOLA NO FUNDO DA REDE, ESTUFOU A REDE\n   ABRIU O PLACAR, AMPLIA, EMPATA, VIRA O JOGO\n   PRIMEIRO GOL, SEGUNDO GOL, TERCEIRO GOL\n\n3. VALIDAÇÃO CONTEXTUAL:\n   - Verificar se o source_text contém palavras-chave de gol\n   - Se contiver, usar threshold permissivo (0.3)\n   - Se não contiver mas event_type=goal, usar threshold intermediário (0.5)\n\n4. GOL CONTRA:\n   - Detectar: "gol contra", "próprio gol", "mandou contra", "own goal", "autogol"\n   - Marcar isOwnGoal = true\n   - team = time que ERROU (mandou contra o próprio gol)\n\n5. NEGAÇÃO DE GOL (NÃO é gol):\n   - "quase gol", "por pouco", "passou perto"\n   - "na trave", "o goleiro pegou", "defende"\n   - "impedimento", "anulado", "gol anulado"\n   - Estes devem gerar event_type "chance" ou "save", NÃO "goal"\n\n6. ANTI-DUPLICAÇÃO:\n   - Se o narrador repete "GOL! GOL! GOOOOL!" é UM único gol\n   - Usar o timestamp SRT do primeiro bloco da sequência\n   - Ignorar repetições dentro de 30 segundos do mesmo gol',
  E'REGRAS DE PRIORIDADE PARA DETECÇÃO DE GOLS:\n\n1. THRESHOLDS DE CONFIANÇA:\n   - Gol com menção clara (GOL, GOOOL, GOLAÇO, ENTROU, PRA DENTRO): confidence mínima = 0.3\n   - Gol sem menção explícita: confidence mínima = 0.5\n   - Outros eventos (falta, escanteio, etc.): confidence mínima = 0.7\n\n2. PALAVRAS-CHAVE DE GOL (aprovar sempre que detectar):\n   GOL, GOOOL, GOOOOL, GOLAÇO, GOLAAAAÇO, É GOL\n   PRA DENTRO, ENTROU, MANDOU PRA REDE\n   BOLA NO FUNDO DA REDE, ESTUFOU A REDE\n   ABRIU O PLACAR, AMPLIA, EMPATA, VIRA O JOGO\n   PRIMEIRO GOL, SEGUNDO GOL, TERCEIRO GOL\n\n3. VALIDAÇÃO CONTEXTUAL:\n   - Verificar se o source_text contém palavras-chave de gol\n   - Se contiver, usar threshold permissivo (0.3)\n   - Se não contiver mas event_type=goal, usar threshold intermediário (0.5)\n\n4. GOL CONTRA:\n   - Detectar: "gol contra", "próprio gol", "mandou contra", "own goal", "autogol"\n   - Marcar isOwnGoal = true\n   - team = time que ERROU (mandou contra o próprio gol)\n\n5. NEGAÇÃO DE GOL (NÃO é gol):\n   - "quase gol", "por pouco", "passou perto"\n   - "na trave", "o goleiro pegou", "defende"\n   - "impedimento", "anulado", "gol anulado"\n   - Estes devem gerar event_type "chance" ou "save", NÃO "goal"\n\n6. ANTI-DUPLICAÇÃO:\n   - Se o narrador repete "GOL! GOL! GOOOOL!" é UM único gol\n   - Usar o timestamp SRT do primeiro bloco da sequência\n   - Ignorar repetições dentro de 30 segundos do mesmo gol',
  'Sub-prompt com regras de prioridade, thresholds de confiança e palavras-chave específicas para detecção de gols. Junta-se ao prompt principal de detecção de eventos.',
  true,
  '4fff6c1d-ad68-44c8-a049-22ff4b3afcde',
  'goal'
);