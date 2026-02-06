import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ScheduledPost {
  id: string;
  user_id: string;
  platform: string;
  content: string;
  media_url: string | null;
  media_type: string | null;
  scheduled_at: string;
  status: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log("[process-scheduled-posts] Starting scheduled posts processing...");

    // Find posts that are scheduled and due
    const now = new Date().toISOString();
    const { data: posts, error: fetchError } = await supabaseAdmin
      .from("social_scheduled_posts")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(10); // Process 10 at a time

    if (fetchError) {
      console.error("[process-scheduled-posts] Error fetching posts:", fetchError);
      return new Response(
        JSON.stringify({ error: "Erro ao buscar posts agendados" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!posts || posts.length === 0) {
      console.log("[process-scheduled-posts] No scheduled posts to process");
      return new Response(
        JSON.stringify({ message: "Nenhum post agendado para processar", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[process-scheduled-posts] Found ${posts.length} posts to process`);

    const results: { postId: string; success: boolean; error?: string }[] = [];

    for (const post of posts as ScheduledPost[]) {
      console.log(`[process-scheduled-posts] Processing post ${post.id} for ${post.platform}`);

      // Mark as publishing
      await supabaseAdmin
        .from("social_scheduled_posts")
        .update({ status: "publishing" })
        .eq("id", post.id);

      // Validate media URL
      if (post.media_url && (post.media_url.includes('localhost') || post.media_url.includes('127.0.0.1'))) {
        console.error(`[process-scheduled-posts] Post ${post.id} has local URL, skipping`);
        await supabaseAdmin
          .from("social_scheduled_posts")
          .update({
            status: "failed",
            error_message: "URL de mídia deve ser pública. URLs locais não são acessíveis pela Meta.",
          })
          .eq("id", post.id);
        
        results.push({ postId: post.id, success: false, error: "URL local" });
        continue;
      }

      try {
        // Call the social-publish function
        const publishRes = await fetch(`${supabaseUrl}/functions/v1/social-publish`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            platform: post.platform,
            content: post.content,
            mediaUrl: post.media_url,
            mediaType: post.media_type,
            userId: post.user_id,
            postId: post.id,
          }),
        });

        const publishData = await publishRes.json();
        console.log(`[process-scheduled-posts] Post ${post.id} result:`, publishData);

        if (publishData.success) {
          results.push({ postId: post.id, success: true });
        } else {
          results.push({ postId: post.id, success: false, error: publishData.error });
        }
      } catch (error: any) {
        console.error(`[process-scheduled-posts] Error processing post ${post.id}:`, error);
        
        await supabaseAdmin
          .from("social_scheduled_posts")
          .update({
            status: "failed",
            error_message: error.message || "Erro inesperado ao publicar",
          })
          .eq("id", post.id);

        results.push({ postId: post.id, success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`[process-scheduled-posts] Completed: ${successCount} success, ${failCount} failed`);

    return new Response(
      JSON.stringify({
        message: `Processados ${posts.length} posts`,
        processed: posts.length,
        success: successCount,
        failed: failCount,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[process-scheduled-posts] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
