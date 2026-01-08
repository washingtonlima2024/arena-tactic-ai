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

    // ═══════════════════════════════════════════════════════════════
    // CREDENTIAL VERIFICATION
    // ═══════════════════════════════════════════════════════════════
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    console.log('[DEBUG] ========================================');
    console.log('[DEBUG] VERIFICAÇÃO DE CREDENCIAIS');
    console.log('[DEBUG] SUPABASE_URL existe:', !!supabaseUrl);
    console.log('[DEBUG] SUPABASE_URL valor:', supabaseUrl?.substring(0, 30) + '...');
    console.log('[DEBUG] SERVICE_ROLE_KEY existe:', !!supabaseKey);
    console.log('[DEBUG] SERVICE_ROLE_KEY tamanho:', supabaseKey?.length || 0);
    console.log('[DEBUG] LOVABLE_API_KEY existe:', !!LOVABLE_API_KEY);
    console.log('[DEBUG] ========================================');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Credenciais Supabase não configuradas! URL=' + !!supabaseUrl + ' KEY=' + !!supabaseKey);
    }
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

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

    // Retry logic for API calls
    const MAX_RETRIES = 3;
    let analysisResult: AnalysisResult | null = null;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      console.log(`Chamando Gemini 2.5 Flash (tentativa ${attempt}/${MAX_RETRIES})...`);

      try {
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
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
          console.error(`AI API error (tentativa ${attempt}):`, aiResponse.status, errorText);
          
          if (aiResponse.status === 429) {
            // Rate limit - wait and retry
            console.log('Rate limit - aguardando 5s antes de retry...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
          }
          if (aiResponse.status === 402) {
            throw new Error('Créditos insuficientes. Adicione créditos ao workspace.');
          }
          lastError = new Error(`AI analysis failed: ${errorText}`);
          continue;
        }

        const aiData = await aiResponse.json();
        console.log('AI response received from Gemini Pro');

        // Extract structured data from tool call
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall && toolCall.function?.arguments) {
          try {
            const parsed = JSON.parse(toolCall.function.arguments);
            if (parsed.events && Array.isArray(parsed.events)) {
              analysisResult = parsed;
              console.log('✓ Tool call parsed successfully');
              break; // Success - exit retry loop
            } else {
              console.warn('Tool call returned invalid structure, retrying...');
              lastError = new Error('Invalid tool call structure');
              continue;
            }
          } catch (parseError) {
            console.error('Tool call parse error:', parseError);
            lastError = new Error('Failed to parse tool call arguments');
            continue;
          }
        } else {
          // Fallback: try to extract from content if tool call not used
          const content = aiData.choices?.[0]?.message?.content || '';
          console.log('No tool call, trying content parse. Content length:', content.length);
          
          if (content.length === 0) {
            console.warn(`Empty response from AI (tentativa ${attempt}), retrying...`);
            lastError = new Error('Empty AI response');
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          
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
              console.warn('No JSON found in response, retrying...');
              lastError = new Error('No JSON found in response');
              continue;
            }
            
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.events && Array.isArray(parsed.events)) {
              analysisResult = parsed;
              console.log('✓ Content parsed successfully');
              break;
            } else {
              console.warn('Content JSON has invalid structure, retrying...');
              lastError = new Error('Invalid JSON structure');
              continue;
            }
          } catch (fallbackError) {
            console.error('Fallback parse error:', fallbackError);
            console.error('Content preview:', content.substring(0, 500));
            lastError = new Error('Failed to parse AI response');
            continue;
          }
        }
      } catch (fetchError) {
        console.error(`Fetch error (tentativa ${attempt}):`, fetchError);
        lastError = fetchError as Error;
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
    }

    // If all retries failed, throw the last error
    if (!analysisResult) {
      console.error('All retry attempts failed');
      throw lastError || new Error('Failed to get valid AI response after retries');
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
      console.log('[DEBUG] ========================================');
      console.log('[DEBUG] INSERINDO EVENTOS NO BANCO');
      console.log('[DEBUG] Quantidade a inserir:', eventsToInsert.length);
      console.log('[DEBUG] Match ID:', matchId);
      console.log('[DEBUG] Primeiro evento:', JSON.stringify(eventsToInsert[0]));
      
      const { data: insertedData, error: insertError } = await supabase
        .from('match_events')
        .insert(eventsToInsert)
        .select();

      console.log('[DEBUG] INSERT response - data:', JSON.stringify(insertedData));
      console.log('[DEBUG] INSERT response - error:', JSON.stringify(insertError));
      console.log('[DEBUG] INSERT retornou dados?:', insertedData !== null);
      console.log('[DEBUG] INSERT quantidade retornada:', insertedData?.length || 0);

      if (insertError) {
        console.error('[ERRO] Insert events error:', JSON.stringify(insertError));
        console.error('[ERRO] Error code:', insertError.code);
        console.error('[ERRO] Error message:', insertError.message);
        console.error('[ERRO] Error details:', insertError.details);
      } else {
        console.log('✓ Eventos inseridos com sucesso:', insertedData?.length || 0);
      }

      // VERIFICAÇÃO: Query para confirmar que dados foram realmente salvos
      console.log('[DEBUG] ========================================');
      console.log('[DEBUG] VERIFICANDO PERSISTÊNCIA DOS EVENTOS');
      const { data: verifyData, error: verifyError } = await supabase
        .from('match_events')
        .select('id, event_type, minute, description')
        .eq('match_id', matchId);

      console.log('[DEBUG] VERIFY query - error:', JSON.stringify(verifyError));
      console.log('[DEBUG] VERIFY eventos no banco:', verifyData?.length || 0);
      
      if (verifyData && verifyData.length > 0) {
        console.log('[DEBUG] VERIFY primeiro evento:', JSON.stringify(verifyData[0]));
        console.log('[DEBUG] ✓ CONFIRMADO: Eventos persistidos no banco!');
      } else {
        console.error('[ERRO] ✗ FALHA: Nenhum evento encontrado no banco após insert!');
        console.error('[ERRO] Isso indica que o INSERT não persistiu os dados');
      }
      console.log('[DEBUG] ========================================');
    } else {
      console.log('[DEBUG] Nenhum evento para inserir');
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

    console.log('[DEBUG] ========================================');
    console.log('[DEBUG] ATUALIZANDO PLACAR DO MATCH');
    console.log('[DEBUG] Match ID:', matchId);
    console.log('[DEBUG] Novo placar:', newHomeScore, 'x', newAwayScore);
    console.log('[DEBUG] Novo status: completed');

    const { data: updateData, error: updateError } = await supabase
      .from('matches')
      .update({
        home_score: newHomeScore,
        away_score: newAwayScore,
        status: 'completed'
      })
      .eq('id', matchId)
      .select();

    console.log('[DEBUG] UPDATE response - data:', JSON.stringify(updateData));
    console.log('[DEBUG] UPDATE response - error:', JSON.stringify(updateError));
    console.log('[DEBUG] UPDATE retornou dados?:', updateData !== null);
    console.log('[DEBUG] UPDATE quantidade retornada:', updateData?.length || 0);

    if (updateError) {
      console.error('[ERRO] Update match error:', JSON.stringify(updateError));
      console.error('[ERRO] Error code:', updateError.code);
      console.error('[ERRO] Error message:', updateError.message);
    } else {
      console.log('✓ Placar atualizado com sucesso');
    }

    // VERIFICAÇÃO: Query para confirmar que o match foi realmente atualizado
    console.log('[DEBUG] ========================================');
    console.log('[DEBUG] VERIFICANDO PERSISTÊNCIA DO MATCH');
    const { data: verifyMatch, error: verifyMatchError } = await supabase
      .from('matches')
      .select('id, home_score, away_score, status')
      .eq('id', matchId)
      .single();

    console.log('[DEBUG] VERIFY match - error:', JSON.stringify(verifyMatchError));
    console.log('[DEBUG] VERIFY match data:', JSON.stringify(verifyMatch));
    
    if (verifyMatch) {
      const matchOk = verifyMatch.home_score === newHomeScore && 
                      verifyMatch.away_score === newAwayScore && 
                      verifyMatch.status === 'completed';
      if (matchOk) {
        console.log('[DEBUG] ✓ CONFIRMADO: Match atualizado corretamente!');
        console.log('[DEBUG]   home_score:', verifyMatch.home_score);
        console.log('[DEBUG]   away_score:', verifyMatch.away_score);
        console.log('[DEBUG]   status:', verifyMatch.status);
      } else {
        console.error('[ERRO] ✗ FALHA: Match não foi atualizado corretamente!');
        console.error('[ERRO]   Esperado: home_score=' + newHomeScore + ', away_score=' + newAwayScore + ', status=completed');
        console.error('[ERRO]   Atual: home_score=' + verifyMatch.home_score + ', away_score=' + verifyMatch.away_score + ', status=' + verifyMatch.status);
      }
    } else {
      console.error('[ERRO] ✗ FALHA: Match não encontrado após update!');
    }
    console.log('[DEBUG] ========================================');

    // ═══════════════════════════════════════════════════════════════
    // SAVE ANALYSIS JOB WITH TRANSCRIPTION FOR FUTURE REPROCESSING
    // ═══════════════════════════════════════════════════════════════
    console.log('[DEBUG] Salvando analysis_job com transcrição...');
    
    const analysisResult2 = {
      fullTranscription: transcription,
      eventsDetected: eventsToInsert.length,
      goalsDetected: goalEvents.length,
      homeScore: newHomeScore,
      awayScore: newAwayScore,
      half: matchHalf,
      homeTeam,
      awayTeam,
      analyzedAt: new Date().toISOString()
    };

    // Insert analysis_job record
    const { error: jobError } = await supabase
      .from('analysis_jobs')
      .insert({
        match_id: matchId,
        status: 'completed',
        progress: 100,
        current_step: 'Análise completa',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        result: analysisResult2
      });

    if (jobError) {
      console.error('[DEBUG] Erro ao salvar analysis_job:', jobError);
      // Não falhar a análise por causa disso, apenas log
    } else {
      console.log('[DEBUG] ✓ analysis_job salvo com transcrição para reprocessamento futuro');
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
