import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MatchEvent {
  minute: number;
  second: number;
  event_type: string;
  description: string;
  team: 'home' | 'away';
  isOwnGoal?: boolean;
}

interface AnalysisResult {
  events: MatchEvent[];
  homeScore: number;
  awayScore: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { matchId, transcription, homeTeam, awayTeam, gameStartMinute = 0, gameEndMinute = 45, halfType } = await req.json();
    
    // Determine half type from parameters or gameStartMinute
    const matchHalf = halfType || (gameStartMinute >= 45 ? 'second' : 'first');

    if (!matchId) {
      throw new Error('matchId is required');
    }

    if (!transcription || transcription.trim().length < 50) {
      throw new Error('transcription is required and must be at least 50 characters');
    }

    console.log('=== ANÁLISE DE PARTIDA (Pro + Few-Shot) ===');
    console.log('Match ID:', matchId);
    console.log('Times:', homeTeam, 'vs', awayTeam);
    console.log('Tempo de jogo:', gameStartMinute, '-', gameEndMinute);
    console.log('Período:', matchHalf === 'first' ? '1º Tempo' : '2º Tempo');
    console.log('Transcrição:', transcription.length, 'caracteres');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // IMPROVED: System prompt with Few-Shot Learning examples
    const systemPrompt = `Você é um ANALISTA ESPECIALIZADO em futebol brasileiro que assiste milhares de jogos.
Seu trabalho é analisar transcrições de narrações e extrair TODOS os eventos com MÁXIMA PRECISÃO.

═══════════════════════════════════════════════════════════════
EXEMPLOS DE EXTRAÇÃO (FEW-SHOT LEARNING) - SIGA ESTE PADRÃO:
═══════════════════════════════════════════════════════════════

EXEMPLO 1 - GOL:
Narração: "GOOOOOL! Neymar recebe na área, dribla o marcador e chuta no canto! Brasil abre o placar!"
→ Evento: { minute: (estimado), event_type: "goal", team: "home", description: "Gol de Neymar! Drible e chute no canto!", isOwnGoal: false }

EXEMPLO 2 - GOL CONTRA:
Narração: "Que azar! O zagueiro tenta cortar e manda contra o próprio gol! Gol contra do Sport!"
→ Evento: { minute: (estimado), event_type: "goal", team: "home", description: "GOL CONTRA! Zagueiro corta errado!", isOwnGoal: true }
NOTA: isOwnGoal=true quando o jogador marca em seu próprio gol

EXEMPLO 3 - CARTÃO AMARELO:
Narração: "Cartão amarelo para o zagueiro que derrubou o atacante na entrada da área"
→ Evento: { minute: (estimado), event_type: "yellow_card", team: "away", description: "Amarelo por falta no atacante" }

EXEMPLO 4 - DEFESA:
Narração: "Que defesa espetacular! O goleiro voou no canto e salvou o que seria o gol!"
→ Evento: { minute: (estimado), event_type: "save", team: "away", description: "Defesa espetacular do goleiro!" }

EXEMPLO 5 - CHANCE:
Narração: "Quase gol! A bola passa raspando a trave, por pouco não foi!"
→ Evento: { minute: (estimado), event_type: "chance", team: "home", description: "Bola raspando a trave!" }

EXEMPLO 6 - FALTA:
Narração: "Falta dura do lateral! O árbitro marca falta perigosa"
→ Evento: { minute: (estimado), event_type: "foul", team: "away", description: "Falta dura do lateral" }

═══════════════════════════════════════════════════════════════
REGRAS CRÍTICAS:
═══════════════════════════════════════════════════════════════

1. EXTRAIA ABSOLUTAMENTE TODOS OS EVENTOS - não perca NENHUM gol, cartão ou lance importante
2. GOLS CONTRA: Se narrador menciona "gol contra", "próprio gol", "contra si mesmo" → isOwnGoal: true
3. TIME CORRETO: Analise QUEM atacava e QUEM defendia no contexto da narração
4. MINUTOS: Estime baseado na progressão (início ~2'-10', meio ~15'-30', fim ~35'-45'+)
5. DESCRIÇÕES: Máximo 60 caracteres, capture a EMOÇÃO do narrador
6. PLACAR: Conte TODOS os gols corretamente ao final

TIPOS DE EVENTOS (use exatamente):
goal, shot, save, foul, yellow_card, red_card, corner, offside, substitution, chance, penalty

TIMES DA PARTIDA:
- HOME (casa): ${homeTeam}
- AWAY (visitante): ${awayTeam}
- Período: ${matchHalf === 'first' ? '1º Tempo' : '2º Tempo'} (${gameStartMinute}' - ${gameEndMinute}')`;

    // IMPROVED: User prompt with Chain-of-Thought instructions
    const userPrompt = `═══════════════════════════════════════════════════════════════
PARTIDA: ${homeTeam} (casa) vs ${awayTeam} (visitante)
PERÍODO: ${matchHalf === 'first' ? '1º Tempo' : '2º Tempo'} (minutos ${gameStartMinute}' a ${gameEndMinute}')
═══════════════════════════════════════════════════════════════

INSTRUÇÕES DE ANÁLISE (CHAIN-OF-THOUGHT):

PASSO 1: Leia a transcrição COMPLETA abaixo com atenção
PASSO 2: Identifique CADA momento importante (gols, defesas, faltas, cartões, chances)
PASSO 3: Para cada momento, determine:
   - Minuto aproximado (${gameStartMinute}' a ${gameEndMinute}')
   - Tipo de evento (goal, shot, save, foul, etc)
   - Qual time realizou a ação (home=${homeTeam} ou away=${awayTeam})
   - Se é gol contra (isOwnGoal: true/false)
PASSO 4: Gere descrições que capturam a EMOÇÃO do narrador (máx 60 chars)
PASSO 5: Conte TODOS os gols para calcular o placar final correto

═══════════════════════════════════════════════════════════════
TRANSCRIÇÃO COMPLETA DA NARRAÇÃO:
═══════════════════════════════════════════════════════════════

${transcription}

═══════════════════════════════════════════════════════════════
IMPORTANTE: 
- NÃO PERCA NENHUM GOL! 
- Conte todos os gols para determinar o placar final correto
- Gols de ${homeTeam} aumentam homeScore
- Gols de ${awayTeam} aumentam awayScore
- Gols contra de ${homeTeam} aumentam awayScore (isOwnGoal=true, team="home")
- Gols contra de ${awayTeam} aumentam homeScore (isOwnGoal=true, team="away")
═══════════════════════════════════════════════════════════════`;

    console.log('Chamando Gemini 2.5 Pro com tool calling...');

    // IMPROVED: Use gemini-2.5-pro for better accuracy
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro', // UPGRADED from flash to pro
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_match_events",
              description: "Extrair eventos da partida a partir da transcrição da narração",
              parameters: {
                type: "object",
                properties: {
                  events: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        minute: { type: "number", description: "Minuto do evento no jogo" },
                        second: { type: "number", description: "Segundo do evento (0-59)" },
                        event_type: { 
                          type: "string", 
                          enum: ["goal", "shot", "save", "foul", "yellow_card", "red_card", "corner", "offside", "substitution", "chance", "penalty"],
                          description: "Tipo do evento"
                        },
                        description: { type: "string", description: "Descrição curta em português (max 60 chars)" },
                        team: { type: "string", enum: ["home", "away"], description: "Time que fez o evento" },
                        isOwnGoal: { type: "boolean", description: "Se é gol contra (true se jogador marca em seu próprio gol)" }
                      },
                      required: ["minute", "event_type", "description", "team"],
                      additionalProperties: false
                    }
                  },
                  homeScore: { type: "number", description: "Placar final do time da casa" },
                  awayScore: { type: "number", description: "Placar final do time visitante" }
                },
                required: ["events", "homeScore", "awayScore"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_match_events" } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        throw new Error('Rate limit exceeded. Tente novamente em alguns segundos.');
      }
      if (aiResponse.status === 402) {
        throw new Error('Créditos insuficientes. Adicione créditos ao workspace.');
      }
      throw new Error(`AI analysis failed: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    console.log('AI response received from Gemini Pro');

    // Extract structured data from tool call
    let analysisResult: AnalysisResult;
    
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall && toolCall.function?.arguments) {
      try {
        analysisResult = JSON.parse(toolCall.function.arguments);
        console.log('Tool call parsed successfully');
      } catch (parseError) {
        console.error('Tool call parse error:', parseError);
        console.error('Raw arguments:', toolCall.function.arguments);
        throw new Error('Failed to parse tool call arguments');
      }
    } else {
      // Fallback: try to extract from content if tool call not used
      const content = aiData.choices?.[0]?.message?.content || '';
      console.log('No tool call, trying content parse. Content length:', content.length);
      
      try {
        // Remove markdown code blocks if present
        let jsonStr = content;
        const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch) {
          jsonStr = codeBlockMatch[1];
        }
        
        // Try to find JSON object
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in response');
        }
        
        analysisResult = JSON.parse(jsonMatch[0]);
      } catch (fallbackError) {
        console.error('Fallback parse error:', fallbackError);
        console.error('Content preview:', content.substring(0, 500));
        throw new Error('Failed to parse AI response');
      }
    }

    console.log('Eventos detectados (antes da validação):', analysisResult.events?.length || 0);
    console.log('Placar reportado pela IA:', analysisResult.homeScore, 'x', analysisResult.awayScore);

    // ═══════════════════════════════════════════════════════════════
    // SCORE VALIDATION: Ensure score matches goal count
    // ═══════════════════════════════════════════════════════════════
    const goalEvents = (analysisResult.events || []).filter(e => e.event_type === 'goal');
    
    // Calculate correct score from goal events
    let calculatedHomeScore = 0;
    let calculatedAwayScore = 0;
    
    for (const goal of goalEvents) {
      if (goal.isOwnGoal) {
        // Own goal: adds to opponent's score
        if (goal.team === 'home') {
          calculatedAwayScore++;
        } else {
          calculatedHomeScore++;
        }
      } else {
        // Regular goal: adds to own team's score
        if (goal.team === 'home') {
          calculatedHomeScore++;
        } else {
          calculatedAwayScore++;
        }
      }
    }

    console.log('Gols detectados:', goalEvents.length);
    console.log('Placar calculado dos gols:', calculatedHomeScore, 'x', calculatedAwayScore);

    // Validate and correct if inconsistent
    if (calculatedHomeScore !== analysisResult.homeScore || calculatedAwayScore !== analysisResult.awayScore) {
      console.warn('⚠️ PLACAR INCONSISTENTE! Corrigindo...');
      console.warn(`  IA reportou: ${analysisResult.homeScore} x ${analysisResult.awayScore}`);
      console.warn(`  Calculado:   ${calculatedHomeScore} x ${calculatedAwayScore}`);
      
      // Use calculated score (based on actual goal events)
      analysisResult.homeScore = calculatedHomeScore;
      analysisResult.awayScore = calculatedAwayScore;
      
      console.log('✓ Placar corrigido para:', calculatedHomeScore, 'x', calculatedAwayScore);
    } else {
      console.log('✓ Placar consistente com gols detectados');
    }

    // Log goal details for debugging
    if (goalEvents.length > 0) {
      console.log('Detalhes dos gols:');
      goalEvents.forEach((g, i) => {
        console.log(`  ${i+1}. ${g.minute}' - ${g.team} ${g.isOwnGoal ? '(CONTRA)' : ''} - ${g.description}`);
      });
    }

    // Insert events into database
    const eventsToInsert = (analysisResult.events || []).map(event => {
      const eventMinute = Math.max(gameStartMinute, Math.min(gameEndMinute, event.minute));
      const eventSecond = event.second || 0;
      const videoSecond = (eventMinute - gameStartMinute) * 60 + eventSecond;
      const eventMs = videoSecond * 1000;
      
      return {
        match_id: matchId,
        event_type: event.event_type,
        minute: eventMinute,
        second: eventSecond,
        description: event.description?.substring(0, 100) || '',
        match_half: matchHalf,
        metadata: {
          team: event.team,
          isOwnGoal: event.isOwnGoal || false,
          teamName: event.team === 'home' ? homeTeam : awayTeam,
          source: 'ai-analysis-pro',
          gameStartMinute,
          videoSecond,
          eventMs,
          half: matchHalf
        },
        approval_status: 'pending',
        is_highlight: ['goal', 'red_card', 'penalty'].includes(event.event_type)
      };
    });

    if (eventsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('match_events')
        .insert(eventsToInsert);

      if (insertError) {
        console.error('Insert events error:', insertError);
      } else {
        console.log('✓ Eventos inseridos:', eventsToInsert.length);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // UPDATE MATCH SCORE - ACCUMULATE instead of overwrite
    // ═══════════════════════════════════════════════════════════════
    
    // First, get current match scores
    const { data: currentMatch, error: fetchError } = await supabase
      .from('matches')
      .select('home_score, away_score')
      .eq('id', matchId)
      .single();

    if (fetchError) {
      console.error('Fetch match error:', fetchError);
    }

    // Calculate new accumulated scores
    const currentHomeScore = currentMatch?.home_score || 0;
    const currentAwayScore = currentMatch?.away_score || 0;
    
    // For first half, use the calculated score directly
    // For second half, ADD to existing score
    let newHomeScore: number;
    let newAwayScore: number;
    
    if (matchHalf === 'first') {
      // First half: set the score directly (reset any previous)
      newHomeScore = analysisResult.homeScore || 0;
      newAwayScore = analysisResult.awayScore || 0;
      console.log('1º Tempo - Placar definido:', newHomeScore, 'x', newAwayScore);
    } else {
      // Second half: ADD goals to first half score
      newHomeScore = currentHomeScore + (analysisResult.homeScore || 0);
      newAwayScore = currentAwayScore + (analysisResult.awayScore || 0);
      console.log('2º Tempo - Placar acumulado:');
      console.log('  1º Tempo:', currentHomeScore, 'x', currentAwayScore);
      console.log('  2º Tempo:', analysisResult.homeScore || 0, 'x', analysisResult.awayScore || 0);
      console.log('  Total:', newHomeScore, 'x', newAwayScore);
    }

    const { error: updateError } = await supabase
      .from('matches')
      .update({
        home_score: newHomeScore,
        away_score: newAwayScore,
        status: 'completed'
      })
      .eq('id', matchId);

    if (updateError) {
      console.error('Update match error:', updateError);
    } else {
      console.log('✓ Placar final atualizado:', newHomeScore, 'x', newAwayScore);
    }

    console.log('=== ANÁLISE PRO COMPLETA ===');

    return new Response(JSON.stringify({
      success: true,
      eventsDetected: eventsToInsert.length,
      goalsDetected: goalEvents.length,
      homeScore: newHomeScore,
      awayScore: newAwayScore,
      halfHomeScore: analysisResult.homeScore || 0,
      halfAwayScore: analysisResult.awayScore || 0,
      half: matchHalf,
      events: eventsToInsert,
      scoreValidated: true,
      accumulated: matchHalf === 'second'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-match:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
