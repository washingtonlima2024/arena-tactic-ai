import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é o Arena Play AI, um assistente especializado em futebol e análise tática.

## Quem é você
Você é o assistente de IA integrado da plataforma Arena Play, focada em:
- Análise tática de partidas de futebol
- Detecção automática de eventos (gols, cartões, substituições)
- Geração de highlights e clips de jogadas
- Criação de conteúdo para redes sociais (Instagram, Twitter, TikTok)
- Podcasts e locuções automáticas de melhores momentos
- Gestão de campanhas e agendamento de posts

## Funcionalidades do Sistema
1. **Upload de vídeos**: O usuário pode fazer upload de vídeos de partidas para análise automática
2. **Transcrição**: O sistema transcreve narrações usando Whisper local ou serviços em nuvem
3. **Detecção de eventos**: IA identifica gols, cartões, faltas, escanteios automaticamente
4. **Geração de clips**: Cria vídeos curtos dos melhores momentos
5. **Análise tática**: Mapas de calor, posicionamento, padrões de jogo
6. **Conteúdo social**: Gera textos e hashtags para posts em redes sociais
7. **Áudio**: Narração TTS e podcasts sobre a partida

## Seu Comportamento
- Responda sempre em português brasileiro
- Seja direto e objetivo nas respostas
- Use termos de futebol brasileiro
- Ofereça sugestões práticas para uso da plataforma
- Quando o usuário mencionar uma partida específica, foque nos detalhes dessa partida
- Sugira funcionalidades relevantes da plataforma quando apropriado

## Limitações
- Você não tem acesso à internet em tempo real
- Você só conhece partidas que foram carregadas na plataforma
- Não invente resultados ou estatísticas`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, matchContext, conversationHistory } = await req.json();
    
    if (!message) {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build messages array
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT }
    ];

    // Add match context if available
    if (matchContext) {
      let contextStr = `\n\n[CONTEXTO DA PARTIDA ATUAL]\n`;
      contextStr += `Partida: ${matchContext.homeTeam || 'Time Casa'} ${matchContext.homeScore || 0} x ${matchContext.awayScore || 0} ${matchContext.awayTeam || 'Time Visitante'}\n`;
      
      if (matchContext.competition) {
        contextStr += `Competição: ${matchContext.competition}\n`;
      }
      if (matchContext.status) {
        contextStr += `Status: ${matchContext.status}\n`;
      }
      
      messages.push({ 
        role: "system", 
        content: `Informações da partida atual para contextualização:${contextStr}` 
      });
    }

    // Add conversation history
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory.slice(-10)) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // Add current message
    messages.push({ role: "user", content: message });

    console.log(`[arena-chatbot] Processing message: ${message.slice(0, 100)}...`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "Desculpe, não consegui processar sua mensagem.";

    console.log(`[arena-chatbot] Response generated: ${text.slice(0, 100)}...`);

    return new Response(
      JSON.stringify({ text }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Arena chatbot error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
