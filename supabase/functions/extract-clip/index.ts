import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractClipRequest {
  eventId: string;
  matchId: string;
  videoUrl: string;
  startSeconds: number;
  durationSeconds: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { eventId, matchId, videoUrl, startSeconds, durationSeconds }: ExtractClipRequest = await req.json();

    if (!videoUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: videoUrl' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // eventId and matchId are optional for direct clip extraction
    const effectiveEventId = eventId || crypto.randomUUID();
    const effectiveMatchId = matchId || 'temp';

    console.log(`[ExtractClip] Starting extraction for event ${effectiveEventId}`);
    console.log(`[ExtractClip] Video: ${videoUrl}`);
    console.log(`[ExtractClip] Start: ${startSeconds}s, Duration: ${durationSeconds}s`);
    console.log(`[ExtractClip] Match: ${effectiveMatchId}`);

    // Download video segment using range request
    const start = Math.max(0, startSeconds);
    const end = start + durationSeconds;
    
    // For now, download the full video and extract the segment
    // This is a simplified approach - in production, you'd use a proper video processing service
    const videoResponse = await fetch(videoUrl);
    
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status}`);
    }

    const videoBlob = await videoResponse.blob();
    console.log(`[ExtractClip] Downloaded video: ${(videoBlob.size / (1024 * 1024)).toFixed(2)} MB`);

    // Upload the full video as a "clip" for now
    // In a real implementation, you'd use FFmpeg via a worker or external service
    const filePath = `${effectiveMatchId}/${effectiveEventId}.mp4`;
    
    const { error: uploadError } = await supabase.storage
      .from('event-clips')
      .upload(filePath, videoBlob, {
        contentType: 'video/mp4',
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('event-clips')
      .getPublicUrl(filePath);

    const clipUrl = urlData.publicUrl;
    console.log(`[ExtractClip] Clip uploaded: ${clipUrl}`);

    // Update event with clip URL (only if eventId was provided)
    if (eventId) {
      const { error: updateError } = await supabase
        .from('match_events')
        .update({ clip_url: clipUrl })
        .eq('id', eventId);

      if (updateError) {
        console.error('[ExtractClip] Failed to update event:', updateError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        clipUrl,
        eventId 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ExtractClip] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
