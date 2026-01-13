import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Team {
  id: string;
  name: string;
  short_name?: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
}

interface MatchData {
  id: string;
  home_team?: Team;
  away_team?: Team;
  home_score?: number;
  away_score?: number;
  match_date?: string;
  competition?: string;
  venue?: string;
  status?: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[sync-match] Supabase credentials not configured');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Supabase credentials not configured' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json() as MatchData;
    console.log('[sync-match] Received request:', JSON.stringify(body, null, 2));

    if (!body.id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Match ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 1: Upsert home team if provided
    if (body.home_team?.id) {
      console.log('[sync-match] Upserting home team:', body.home_team.name);
      const { error: homeTeamError } = await supabase.from('teams').upsert({
        id: body.home_team.id,
        name: body.home_team.name,
        short_name: body.home_team.short_name,
        logo_url: body.home_team.logo_url,
        primary_color: body.home_team.primary_color,
        secondary_color: body.home_team.secondary_color,
      }, { onConflict: 'id' });

      if (homeTeamError) {
        console.error('[sync-match] Error upserting home team:', homeTeamError);
        // Continue anyway, team might already exist
      } else {
        console.log('[sync-match] ✓ Home team upserted');
      }
    }

    // Step 2: Upsert away team if provided and different from home
    if (body.away_team?.id && body.away_team.id !== body.home_team?.id) {
      console.log('[sync-match] Upserting away team:', body.away_team.name);
      const { error: awayTeamError } = await supabase.from('teams').upsert({
        id: body.away_team.id,
        name: body.away_team.name,
        short_name: body.away_team.short_name,
        logo_url: body.away_team.logo_url,
        primary_color: body.away_team.primary_color,
        secondary_color: body.away_team.secondary_color,
      }, { onConflict: 'id' });

      if (awayTeamError) {
        console.error('[sync-match] Error upserting away team:', awayTeamError);
        // Continue anyway, team might already exist
      } else {
        console.log('[sync-match] ✓ Away team upserted');
      }
    }

    // Step 3: Upsert the match
    console.log('[sync-match] Upserting match:', body.id);
    const matchData = {
      id: body.id,
      home_team_id: body.home_team?.id || null,
      away_team_id: body.away_team?.id || null,
      home_score: body.home_score ?? 0,
      away_score: body.away_score ?? 0,
      match_date: body.match_date || new Date().toISOString(),
      competition: body.competition || null,
      venue: body.venue || null,
      status: body.status || 'pending',
    };

    const { error: matchError } = await supabase.from('matches').upsert(matchData, { onConflict: 'id' });

    if (matchError) {
      console.error('[sync-match] Error upserting match:', matchError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to sync match: ${matchError.message}` 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[sync-match] ✓ Match synced successfully:', body.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        synced: true,
        matchId: body.id 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[sync-match] Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
