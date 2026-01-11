import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Processing scheduled posts...');

    // Get posts that are due for publishing
    const now = new Date().toISOString();
    const { data: duePosts, error: fetchError } = await supabase
      .from('social_scheduled_posts')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(10);

    if (fetchError) {
      throw fetchError;
    }

    if (!duePosts || duePosts.length === 0) {
      console.log('No posts due for publishing');
      return new Response(
        JSON.stringify({ message: 'No posts to process', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${duePosts.length} posts to publish`);

    const results = [];

    for (const post of duePosts) {
      try {
        // Update status to publishing
        await supabase
          .from('social_scheduled_posts')
          .update({ status: 'publishing' })
          .eq('id', post.id);

        // Get connection for this platform
        const { data: connection, error: connError } = await supabase
          .from('social_connections')
          .select('*')
          .eq('user_id', post.user_id)
          .eq('platform', post.platform)
          .eq('is_connected', true)
          .single();

        if (connError || !connection) {
          throw new Error(`No active connection for ${post.platform}`);
        }

        // Call the publish function
        const { data: publishResult, error: publishError } = await supabase.functions.invoke('social-publish', {
          body: {
            platform: post.platform,
            content: post.content,
            mediaUrl: post.media_url,
            userId: post.user_id,
          }
        });

        if (publishError) {
          throw publishError;
        }

        if (publishResult.success) {
          // Update as published
          await supabase
            .from('social_scheduled_posts')
            .update({
              status: 'published',
              published_at: new Date().toISOString(),
              external_post_id: publishResult.result?.id || publishResult.result?.data?.id
            })
            .eq('id', post.id);

          results.push({ id: post.id, status: 'published' });
          console.log(`Successfully published post ${post.id} to ${post.platform}`);
        } else {
          throw new Error(publishResult.error || 'Unknown publishing error');
        }
      } catch (postError: any) {
        console.error(`Error publishing post ${post.id}:`, postError);
        
        // Update as failed
        await supabase
          .from('social_scheduled_posts')
          .update({
            status: 'failed',
            error_message: postError.message
          })
          .eq('id', post.id);

        results.push({ id: post.id, status: 'failed', error: postError.message });
      }
    }

    return new Response(
      JSON.stringify({ 
        message: 'Processing complete', 
        processed: results.length,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in process-scheduled-posts:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
