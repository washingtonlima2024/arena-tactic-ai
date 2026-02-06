import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PublishRequest {
  platform: string;
  content: string;
  mediaUrl?: string;
  mediaType?: string;
  userId: string;
  postId?: string;
}

interface SocialConnection {
  access_token: string;
  account_id: string;
  refresh_token?: string;
  token_expires_at?: string;
}

// Instagram Graph API - Publish video as Reel (2-step process)
async function publishToInstagram(
  connection: SocialConnection,
  caption: string,
  videoUrl: string
): Promise<{ success: boolean; result?: any; error?: string }> {
  const { access_token, account_id } = connection;
  
  console.log(`[Instagram] Starting publish to account ${account_id}`);
  console.log(`[Instagram] Video URL: ${videoUrl}`);
  
  // Validate URL is public
  if (videoUrl.includes('localhost') || videoUrl.includes('127.0.0.1')) {
    return {
      success: false,
      error: 'URL de mídia deve ser pública. URLs locais não são acessíveis pela Meta.',
    };
  }

  try {
    // Step 1: Create media container
    console.log('[Instagram] Step 1: Creating media container...');
    
    const containerParams = new URLSearchParams({
      video_url: videoUrl,
      caption: caption,
      media_type: 'REELS',
      access_token: access_token,
    });

    const containerRes = await fetch(
      `https://graph.facebook.com/v19.0/${account_id}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: containerParams.toString(),
      }
    );

    const containerData = await containerRes.json();
    console.log('[Instagram] Container response:', JSON.stringify(containerData));

    if (containerData.error) {
      return {
        success: false,
        error: `Erro ao criar container: ${containerData.error.message}`,
      };
    }

    const creationId = containerData.id;
    if (!creationId) {
      return {
        success: false,
        error: 'Container ID não retornado pela API',
      };
    }

    // Step 2: Wait for container to be ready (polling)
    console.log('[Instagram] Step 2: Waiting for container to be ready...');
    
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes max (10 seconds * 30)
    let containerStatus = '';

    while (attempts < maxAttempts) {
      const statusRes = await fetch(
        `https://graph.facebook.com/v19.0/${creationId}?fields=status_code,status&access_token=${access_token}`
      );
      const statusData = await statusRes.json();
      
      console.log(`[Instagram] Status check ${attempts + 1}:`, JSON.stringify(statusData));
      
      containerStatus = statusData.status_code;
      
      if (containerStatus === 'FINISHED') {
        console.log('[Instagram] Container ready!');
        break;
      }
      
      if (containerStatus === 'ERROR') {
        return {
          success: false,
          error: `Erro no processamento do vídeo: ${statusData.status || 'Unknown error'}`,
        };
      }
      
      // Wait 10 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 10000));
      attempts++;
    }

    if (containerStatus !== 'FINISHED') {
      return {
        success: false,
        error: 'Timeout aguardando processamento do vídeo pela Meta',
      };
    }

    // Step 3: Publish the container
    console.log('[Instagram] Step 3: Publishing container...');
    
    const publishParams = new URLSearchParams({
      creation_id: creationId,
      access_token: access_token,
    });

    const publishRes = await fetch(
      `https://graph.facebook.com/v19.0/${account_id}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: publishParams.toString(),
      }
    );

    const publishData = await publishRes.json();
    console.log('[Instagram] Publish response:', JSON.stringify(publishData));

    if (publishData.error) {
      return {
        success: false,
        error: `Erro ao publicar: ${publishData.error.message}`,
      };
    }

    return {
      success: true,
      result: {
        mediaId: publishData.id,
        platform: 'instagram',
      },
    };
  } catch (error: any) {
    console.error('[Instagram] Error:', error);
    return {
      success: false,
      error: `Erro inesperado: ${error.message}`,
    };
  }
}

// Facebook Graph API - Publish video
async function publishToFacebook(
  connection: SocialConnection,
  caption: string,
  videoUrl: string
): Promise<{ success: boolean; result?: any; error?: string }> {
  const { access_token, account_id } = connection;
  
  console.log(`[Facebook] Starting publish to page ${account_id}`);
  
  try {
    // For Facebook pages, we post to /{page-id}/videos
    const params = new URLSearchParams({
      file_url: videoUrl,
      description: caption,
      access_token: access_token,
    });

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${account_id}/videos`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      }
    );

    const data = await res.json();
    console.log('[Facebook] Response:', JSON.stringify(data));

    if (data.error) {
      return {
        success: false,
        error: `Erro Facebook: ${data.error.message}`,
      };
    }

    return {
      success: true,
      result: {
        videoId: data.id,
        platform: 'facebook',
      },
    };
  } catch (error: any) {
    console.error('[Facebook] Error:', error);
    return {
      success: false,
      error: `Erro inesperado: ${error.message}`,
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const body: PublishRequest = await req.json();
    const { platform, content, mediaUrl, userId, postId } = body;

    console.log(`[social-publish] Request:`, { platform, userId, postId, hasMedia: !!mediaUrl });

    if (!platform || !userId) {
      return new Response(
        JSON.stringify({ error: "platform e userId são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch user's social connection for this platform
    const { data: connection, error: connError } = await supabaseAdmin
      .from("social_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("platform", platform)
      .eq("is_connected", true)
      .single();

    if (connError || !connection) {
      console.error("[social-publish] Connection not found:", connError);
      return new Response(
        JSON.stringify({ error: `Conexão ${platform} não encontrada ou inativa` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check token expiration
    if (connection.token_expires_at) {
      const expiresAt = new Date(connection.token_expires_at);
      const now = new Date();
      if (expiresAt < now) {
        return new Response(
          JSON.stringify({ error: `Token ${platform} expirado. Por favor, reconecte a conta.` }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Warn if token expires in less than 7 days
      const daysUntilExpiry = Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry < 7) {
        console.warn(`[social-publish] Token expires in ${daysUntilExpiry} days!`);
      }
    }

    let publishResult: { success: boolean; result?: any; error?: string };

    switch (platform.toLowerCase()) {
      case "instagram":
        if (!mediaUrl) {
          return new Response(
            JSON.stringify({ error: "mediaUrl é obrigatório para Instagram" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        publishResult = await publishToInstagram(connection, content || "", mediaUrl);
        break;

      case "facebook":
        if (!mediaUrl) {
          return new Response(
            JSON.stringify({ error: "mediaUrl é obrigatório para Facebook" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        publishResult = await publishToFacebook(connection, content || "", mediaUrl);
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Plataforma ${platform} não suportada ainda` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Update post status if postId provided
    if (postId) {
      const updateData = publishResult.success
        ? {
            status: "published",
            published_at: new Date().toISOString(),
            external_post_id: publishResult.result?.mediaId || publishResult.result?.videoId,
            error_message: null,
          }
        : {
            status: "failed",
            error_message: publishResult.error,
          };

      await supabaseAdmin
        .from("social_scheduled_posts")
        .update(updateData)
        .eq("id", postId);
    }

    if (publishResult.success) {
      console.log(`[social-publish] Success:`, publishResult.result);
      return new Response(
        JSON.stringify({ success: true, result: publishResult.result }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      console.error(`[social-publish] Failed:`, publishResult.error);
      return new Response(
        JSON.stringify({ success: false, error: publishResult.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: any) {
    console.error("[social-publish] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
