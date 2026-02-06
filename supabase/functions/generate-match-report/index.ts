import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Voce e um analista tatico profissional de futebol brasileiro. Sua funcao e gerar relatorios detalhados e completos de partidas de futebol com base nos eventos reais detectados durante o jogo.

REGRAS OBRIGATORIAS:
- Escreva em portugues brasileiro com terminologia tecnica de futebol
- NUNCA use emojis, emoticons ou caracteres especiais decorativos
- NUNCA use asteriscos, hashtags ou qualquer formatacao markdown
- Texto limpo, profissional e objetivo
- Baseie-se EXCLUSIVAMENTE nos dados reais fornecidos
- Nao invente jogadores, eventos ou situacoes que nao estejam nos dados
- Use paragrafos claros separados por tema
- Seja detalhado mas sem enrolacao
- Use termos como: construcao, transicao, marcacao alta, bloco baixo, saida de bola, triangulacao, amplitude, profundidade, compactacao, linha de marcacao, pressing, contra-ataque, bola parada, escanteio curto/longo, falta tatica, cartao disciplinar

Voce recebera os dados da partida e deve retornar um JSON com 7 secoes obrigatorias. Cada secao deve ter no minimo 3-4 paragrafos detalhados.`;

const USER_PROMPT_TEMPLATE = (data: any) => {
  const { homeTeam, awayTeam, homeScore, awayScore, competition, matchDate, venue, events, stats, bestPlayer, patterns, possession } = data;

  const eventsList = events.map((e: any) => {
    const half = e.match_half || (e.minute < 45 ? 'primeiro' : 'segundo');
    const team = e.metadata?.team || 'indefinido';
    return `- ${e.minute}'${e.second > 0 ? e.second + '"' : ''} [${half} tempo] [${team}] ${e.event_type}: ${e.description || 'sem descricao'}`;
  }).join('\n');

  const firstHalfEvents = events.filter((e: any) => {
    const half = e.match_half || (e.minute < 45 ? 'first' : 'second');
    return half === 'first' || half === 'primeiro';
  });
  const secondHalfEvents = events.filter((e: any) => {
    const half = e.match_half || (e.minute < 45 ? 'first' : 'second');
    return half === 'second' || half === 'segundo';
  });

  return `DADOS DA PARTIDA:

Times: ${homeTeam} (casa) vs ${awayTeam} (visitante)
Placar final: ${homeScore} x ${awayScore}
Competicao: ${competition || 'Nao informada'}
Data: ${matchDate || 'Nao informada'}
Local: ${venue || 'Nao informado'}

ESTATISTICAS:
- Finalizacoes: ${homeTeam} ${stats.homeShots} x ${stats.awayShots} ${awayTeam}
- Defesas: ${homeTeam} ${stats.homeSaves} x ${stats.awaySaves} ${awayTeam}
- Faltas: ${homeTeam} ${stats.homeFouls} x ${stats.awayFouls} ${awayTeam}
- Cartoes: ${homeTeam} ${stats.homeCards} x ${stats.awayCards} ${awayTeam}
- Escanteios: ${homeTeam} ${stats.homeCorners} x ${stats.awayCorners} ${awayTeam}
- Impedimentos: ${homeTeam} ${stats.homeOffsides} x ${stats.awayOffsides} ${awayTeam}
- Recuperacoes: ${homeTeam} ${stats.homeRecoveries} x ${stats.awayRecoveries} ${awayTeam}
- Posse estimada: ${homeTeam} ${possession.home}% x ${possession.away}% ${awayTeam}

MELHOR JOGADOR: ${bestPlayer ? `${bestPlayer.name} (${bestPlayer.team === 'home' ? homeTeam : awayTeam}) - ${bestPlayer.goals} gols, ${bestPlayer.assists} assistencias, ${bestPlayer.saves} defesas, ${bestPlayer.recoveries} recuperacoes` : 'Nao identificado'}

PADROES TATICOS: ${patterns.length > 0 ? patterns.map((p: any) => `${p.type}: ${p.description}`).join('; ') : 'Nenhum padrao identificado'}

TOTAL DE EVENTOS: ${events.length}
Eventos no primeiro tempo: ${firstHalfEvents.length}
Eventos no segundo tempo: ${secondHalfEvents.length}

LISTA COMPLETA DE EVENTOS:
${eventsList}

---

Com base EXCLUSIVAMENTE nesses dados reais, gere um relatorio tatico completo no seguinte formato JSON:

{
  "visaoGeral": "Texto com 3-4 paragrafos contextualizando a partida: adversario, competicao, cenario inicial, o que se esperava, como o jogo se desenrolou de forma geral. Mencione o placar e os dados basicos.",
  "linhaDoTempo": "Texto com analise narrativa dos principais momentos da partida em ordem cronologica. Para cada evento importante, descreva o que motivou a jogada, como o time se comportou e qual o impacto no andamento do jogo.",
  "primeiroTempo": "Texto com 4-5 paragrafos analisando o primeiro tempo. Aborde: posicionamento das equipes, construcao desde a defesa, ocupacao de espaco, intensidade com e sem bola, transicoes ofensivas e defensivas, erros recorrentes, momentos de pressao, como cada time se comportou.",
  "segundoTempo": "Texto com 4-5 paragrafos analisando o segundo tempo. Aborde: ajustes taticos feitos no intervalo, mudanca de ritmo, padroes de ataque e recomposicao, momentos de pressao, situacoes que decidiram o resultado, como os times reagiram ao placar.",
  "analiseIndividual": {
    "timePrincipal": "Texto com 3-4 paragrafos sobre o time da casa: comportamento coletivo, sincronia entre setores (defesa-meio-ataque), principais fortalezas demonstradas, fragilidades que apareceram, melhorias observadas entre um tempo e outro.",
    "adversario": "Texto com 3-4 paragrafos sobre o time visitante: como marcou, como atacou, pontos que geraram mais dificuldade para o time da casa, movimentos repetidos que precisam ser estudados."
  },
  "analiseTatica": "Texto com 4-5 paragrafos com analise tatica profunda: fases do jogo, padronizacoes identificadas, modelo de jogo observado de cada equipe, lances de bola parada, trabalhos de marcacao, sequencias repetitivas de jogadas.",
  "resumoFinal": "Texto com 3-4 paragrafos sintetizando: melhores pontos da partida, maiores falhas, o que pode ser corrigido no proximo treino, o que funcionou bem, fatores que influenciaram diretamente no placar."
}

IMPORTANTE: Retorne APENAS o JSON valido, sem nenhum texto antes ou depois. Cada campo deve conter texto corrido em paragrafos, sem marcacao markdown.`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { matchData } = body;

    if (!matchData) {
      return new Response(
        JSON.stringify({ error: "matchData is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`[generate-match-report] Generating report for ${matchData.homeTeam} vs ${matchData.awayTeam} with ${matchData.events?.length || 0} events`);

    const userPrompt = USER_PROMPT_TEMPLATE(matchData);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisicoes excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Creditos insuficientes. Adicione creditos ao workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("[generate-match-report] AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content || "";

    console.log(`[generate-match-report] Raw response length: ${rawText.length}`);

    // Parse the JSON from the response
    let report;
    try {
      // Try to extract JSON from potential markdown code blocks
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawText.trim();
      report = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("[generate-match-report] Failed to parse JSON response:", parseError);
      console.error("[generate-match-report] Raw text:", rawText.slice(0, 500));
      
      // Fallback: try to extract any JSON object from the text
      const jsonObjectMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonObjectMatch) {
        try {
          report = JSON.parse(jsonObjectMatch[0]);
        } catch {
          throw new Error("Falha ao processar resposta da IA. Tente novamente.");
        }
      } else {
        throw new Error("Resposta da IA nao continha um relatorio valido. Tente novamente.");
      }
    }

    // Validate required fields
    const requiredFields = ['visaoGeral', 'linhaDoTempo', 'primeiroTempo', 'segundoTempo', 'analiseIndividual', 'analiseTatica', 'resumoFinal'];
    for (const field of requiredFields) {
      if (!report[field]) {
        report[field] = '';
      }
    }
    if (!report.analiseIndividual || typeof report.analiseIndividual !== 'object') {
      report.analiseIndividual = { timePrincipal: '', adversario: '' };
    }

    console.log(`[generate-match-report] Report generated successfully with ${Object.keys(report).length} sections`);

    return new Response(
      JSON.stringify({ report }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[generate-match-report] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
