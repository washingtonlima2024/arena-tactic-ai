
-- Tabela para prompts parametrizados de IA
CREATE TABLE public.ai_prompts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt_key TEXT NOT NULL UNIQUE,
  prompt_name TEXT NOT NULL,
  prompt_value TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'chatbot',
  ai_model TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT true,
  default_value TEXT NOT NULL,
  default_model TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID
);

-- RLS
ALTER TABLE public.ai_prompts ENABLE ROW LEVEL SECURITY;

-- Qualquer autenticado pode ler (edge functions com service_role_key bypassam)
CREATE POLICY "Authenticated users can read ai_prompts"
ON public.ai_prompts FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Apenas admins podem modificar
CREATE POLICY "Admins can insert ai_prompts"
ON public.ai_prompts FOR INSERT
WITH CHECK (is_admin());

CREATE POLICY "Admins can update ai_prompts"
ON public.ai_prompts FOR UPDATE
USING (is_admin());

CREATE POLICY "Admins can delete ai_prompts"
ON public.ai_prompts FOR DELETE
USING (is_admin());

-- Trigger para updated_at
CREATE TRIGGER update_ai_prompts_updated_at
BEFORE UPDATE ON public.ai_prompts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Dados iniciais: Chatbot System Prompt
INSERT INTO public.ai_prompts (prompt_key, prompt_name, prompt_value, description, category, ai_model, default_value, default_model) VALUES
(
  'chatbot_system',
  'Chatbot - Prompt do Sistema',
  E'Você é o Arena Play AI, assistente de futebol e análise tática.\n\n## Regras de Resposta OBRIGATÓRIAS\n- Respostas CURTAS e DIRETAS (máximo 2-3 frases)\n- Seja objetivo, vá direto ao ponto\n- Use linguagem informal e amigável\n- Termos de futebol brasileiro\n- NUNCA use emojis, emoticons ou caracteres especiais decorativos\n- NUNCA use asteriscos para negrito ou formatação markdown\n- Texto limpo e profissional, sem figurinhas\n\n## Sobre a Plataforma\nArena Play: análise de partidas com IA, detecção de eventos (gols, cartões), geração de clips, conteúdo para redes sociais, podcasts automáticos.\n\n## Limitações\n- Não tem acesso à internet em tempo real\n- Só conhece partidas carregadas na plataforma',
  'Prompt principal do chatbot Arena Play AI. Define tom, regras e limitações.',
  'chatbot',
  'google/gemini-3-flash-preview',
  E'Você é o Arena Play AI, assistente de futebol e análise tática.\n\n## Regras de Resposta OBRIGATÓRIAS\n- Respostas CURTAS e DIRETAS (máximo 2-3 frases)\n- Seja objetivo, vá direto ao ponto\n- Use linguagem informal e amigável\n- Termos de futebol brasileiro\n- NUNCA use emojis, emoticons ou caracteres especiais decorativos\n- NUNCA use asteriscos para negrito ou formatação markdown\n- Texto limpo e profissional, sem figurinhas\n\n## Sobre a Plataforma\nArena Play: análise de partidas com IA, detecção de eventos (gols, cartões), geração de clips, conteúdo para redes sociais, podcasts automáticos.\n\n## Limitações\n- Não tem acesso à internet em tempo real\n- Só conhece partidas carregadas na plataforma',
  'google/gemini-3-flash-preview'
),
(
  'report_system',
  'Relatório - Prompt do Sistema',
  E'Voce e um analista tatico profissional de futebol brasileiro. Sua funcao e gerar relatorios detalhados e completos de partidas de futebol com base nos eventos reais detectados durante o jogo.\n\nREGRAS OBRIGATORIAS:\n- Escreva em portugues brasileiro com terminologia tecnica de futebol\n- NUNCA use emojis, emoticons ou caracteres especiais decorativos\n- NUNCA use asteriscos, hashtags ou qualquer formatacao markdown\n- Texto limpo, profissional e objetivo\n- Baseie-se EXCLUSIVAMENTE nos dados reais fornecidos\n- Nao invente jogadores, eventos ou situacoes que nao estejam nos dados\n- Use paragrafos claros separados por tema\n- Seja detalhado mas sem enrolacao\n- Use termos como: construcao, transicao, marcacao alta, bloco baixo, saida de bola, triangulacao, amplitude, profundidade, compactacao, linha de marcacao, pressing, contra-ataque, bola parada, escanteio curto/longo, falta tatica, cartao disciplinar\n\nVoce recebera os dados da partida e deve retornar um JSON com 7 secoes obrigatorias. Cada secao deve ter no minimo 3-4 paragrafos detalhados.',
  'Prompt de sistema para geração de relatórios táticos. Define regras de escrita e terminologia.',
  'report',
  'google/gemini-2.5-flash',
  E'Voce e um analista tatico profissional de futebol brasileiro. Sua funcao e gerar relatorios detalhados e completos de partidas de futebol com base nos eventos reais detectados durante o jogo.\n\nREGRAS OBRIGATORIAS:\n- Escreva em portugues brasileiro com terminologia tecnica de futebol\n- NUNCA use emojis, emoticons ou caracteres especiais decorativos\n- NUNCA use asteriscos, hashtags ou qualquer formatacao markdown\n- Texto limpo, profissional e objetivo\n- Baseie-se EXCLUSIVAMENTE nos dados reais fornecidos\n- Nao invente jogadores, eventos ou situacoes que nao estejam nos dados\n- Use paragrafos claros separados por tema\n- Seja detalhado mas sem enrolacao\n- Use termos como: construcao, transicao, marcacao alta, bloco baixo, saida de bola, triangulacao, amplitude, profundidade, compactacao, linha de marcacao, pressing, contra-ataque, bola parada, escanteio curto/longo, falta tatica, cartao disciplinar\n\nVoce recebera os dados da partida e deve retornar um JSON com 7 secoes obrigatorias. Cada secao deve ter no minimo 3-4 paragrafos detalhados.',
  'google/gemini-2.5-flash'
),
(
  'report_user_template',
  'Relatório - Template do Usuário',
  E'DADOS DA PARTIDA:\n\nTimes: {homeTeam} (casa) vs {awayTeam} (visitante)\nPlacar final: {homeScore} x {awayScore}\nCompeticao: {competition}\nData: {matchDate}\nLocal: {venue}\n\nESTATISTICAS:\n{stats}\n\nMELHOR JOGADOR: {bestPlayer}\n\nPADROES TATICOS: {patterns}\n\nTOTAL DE EVENTOS: {totalEvents}\nEventos no primeiro tempo: {firstHalfCount}\nEventos no segundo tempo: {secondHalfCount}\n\nLISTA COMPLETA DE EVENTOS:\n{eventsList}\n\n---\n\nCom base EXCLUSIVAMENTE nesses dados reais, gere um relatorio tatico completo no seguinte formato JSON:\n\n{\n  "visaoGeral": "Texto com 3-4 paragrafos contextualizando a partida...",\n  "linhaDoTempo": "Texto com analise narrativa dos principais momentos...",\n  "primeiroTempo": "Texto com 4-5 paragrafos analisando o primeiro tempo...",\n  "segundoTempo": "Texto com 4-5 paragrafos analisando o segundo tempo...",\n  "analiseIndividual": {\n    "timePrincipal": "Texto com 3-4 paragrafos sobre o time da casa...",\n    "adversario": "Texto com 3-4 paragrafos sobre o time visitante..."\n  },\n  "analiseTatica": "Texto com 4-5 paragrafos com analise tatica profunda...",\n  "resumoFinal": "Texto com 3-4 paragrafos sintetizando..."\n}\n\nIMPORTANTE: Retorne APENAS o JSON valido, sem nenhum texto antes ou depois.',
  'Template do prompt de usuário para relatórios. Use variáveis: {homeTeam}, {awayTeam}, {homeScore}, {awayScore}, {competition}, {matchDate}, {venue}, {stats}, {bestPlayer}, {patterns}, {totalEvents}, {firstHalfCount}, {secondHalfCount}, {eventsList}',
  'report',
  'google/gemini-2.5-flash',
  E'DADOS DA PARTIDA:\n\nTimes: {homeTeam} (casa) vs {awayTeam} (visitante)\nPlacar final: {homeScore} x {awayScore}\nCompeticao: {competition}\nData: {matchDate}\nLocal: {venue}\n\nESTATISTICAS:\n{stats}\n\nMELHOR JOGADOR: {bestPlayer}\n\nPADROES TATICOS: {patterns}\n\nTOTAL DE EVENTOS: {totalEvents}\nEventos no primeiro tempo: {firstHalfCount}\nEventos no segundo tempo: {secondHalfCount}\n\nLISTA COMPLETA DE EVENTOS:\n{eventsList}\n\n---\n\nCom base EXCLUSIVAMENTE nesses dados reais, gere um relatorio tatico completo no seguinte formato JSON:\n\n{\n  "visaoGeral": "Texto com 3-4 paragrafos contextualizando a partida...",\n  "linhaDoTempo": "Texto com analise narrativa dos principais momentos...",\n  "primeiroTempo": "Texto com 4-5 paragrafos analisando o primeiro tempo...",\n  "segundoTempo": "Texto com 4-5 paragrafos analisando o segundo tempo...",\n  "analiseIndividual": {\n    "timePrincipal": "Texto com 3-4 paragrafos sobre o time da casa...",\n    "adversario": "Texto com 3-4 paragrafos sobre o time visitante..."\n  },\n  "analiseTatica": "Texto com 4-5 paragrafos com analise tatica profunda...",\n  "resumoFinal": "Texto com 3-4 paragrafos sintetizando..."\n}\n\nIMPORTANTE: Retorne APENAS o JSON valido, sem nenhum texto antes ou depois.',
  'google/gemini-2.5-flash'
),
(
  'transcription_engine',
  'Motor de Transcrição',
  'Transcrição de áudio de partidas de futebol usando Whisper Local. Detectar falas de narradores, comentaristas e sons do jogo.',
  'Configuração do motor de transcrição de áudio. Whisper Local é o padrão.',
  'transcription',
  'whisper-local/base',
  'Transcrição de áudio de partidas de futebol usando Whisper Local. Detectar falas de narradores, comentaristas e sons do jogo.',
  'whisper-local/base'
);
