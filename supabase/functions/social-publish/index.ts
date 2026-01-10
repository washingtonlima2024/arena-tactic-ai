import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { platform, content, mediaUrl, userId, scheduledAt } = await req.json();

    console.log(`Publishing to ${platform} for user ${userId}`);

    // Get connection credentials
    const { data: connection, error: connError } = await supabase
      .from('social_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform)
      .eq('is_connected', true)
      .single();

    if (connError || !connection) {
      throw new Error(`No active connection found for ${platform}`);
    }

    let result: any = null;

    switch (platform) {
      case 'x':
        result = await publishToTwitter(connection, content, mediaUrl);
        break;
      case 'facebook':
        result = await publishToFacebook(connection, content, mediaUrl);
        break;
      case 'instagram':
        result = await publishToInstagram(connection, content, mediaUrl);
        break;
      case 'linkedin':
        result = await publishToLinkedIn(connection, content, mediaUrl);
        break;
      case 'youtube':
        result = await publishToYouTube(connection, content, mediaUrl);
        break;
      case 'tiktok':
        result = await publishToTikTok(connection, content, mediaUrl);
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    // Update last sync time
    await supabase
      .from('social_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', connection.id);

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error publishing:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Twitter/X Publishing
async function publishToTwitter(connection: any, content: string, mediaUrl?: string) {
  const { createHmac } = await import("node:crypto");
  
  const API_KEY = connection.access_token; // Stored as api_key
  const API_SECRET = connection.refresh_token?.split('|')[0]; // api_secret
  const ACCESS_TOKEN = connection.refresh_token?.split('|')[1]; // access_token
  const ACCESS_TOKEN_SECRET = connection.refresh_token?.split('|')[2]; // access_token_secret

  if (!API_KEY || !API_SECRET || !ACCESS_TOKEN || !ACCESS_TOKEN_SECRET) {
    throw new Error('Twitter credentials incomplete');
  }

  function generateOAuthSignature(
    method: string,
    url: string,
    params: Record<string, string>,
    consumerSecret: string,
    tokenSecret: string
  ): string {
    const signatureBaseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(
      Object.entries(params).sort().map(([k, v]) => `${k}=${v}`).join("&")
    )}`;
    const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
    const hmacSha1 = createHmac("sha1", signingKey);
    return hmacSha1.update(signatureBaseString).digest("base64");
  }

  function generateOAuthHeader(method: string, url: string): string {
    const oauthParams = {
      oauth_consumer_key: API_KEY!,
      oauth_nonce: Math.random().toString(36).substring(2),
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: ACCESS_TOKEN!,
      oauth_version: "1.0",
    };

    const signature = generateOAuthSignature(method, url, oauthParams, API_SECRET!, ACCESS_TOKEN_SECRET!);
    const signedOAuthParams = { ...oauthParams, oauth_signature: signature };
    const entries = Object.entries(signedOAuthParams).sort((a, b) => a[0].localeCompare(b[0]));
    return "OAuth " + entries.map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`).join(", ");
  }

  const url = "https://api.x.com/2/tweets";
  const oauthHeader = generateOAuthHeader("POST", url);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: oauthHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: content }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Twitter error: ${errorText}`);
  }

  return await response.json();
}

// Facebook Publishing
async function publishToFacebook(connection: any, content: string, mediaUrl?: string) {
  const pageId = connection.account_id;
  const accessToken = connection.access_token;

  let endpoint = `https://graph.facebook.com/v18.0/${pageId}/feed`;
  let body: any = {
    message: content,
    access_token: accessToken,
  };

  if (mediaUrl) {
    // For video posts
    if (mediaUrl.includes('.mp4') || mediaUrl.includes('video')) {
      endpoint = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      body = {
        file_url: mediaUrl,
        description: content,
        access_token: accessToken,
      };
    } else {
      // For photo posts
      endpoint = `https://graph.facebook.com/v18.0/${pageId}/photos`;
      body = {
        url: mediaUrl,
        caption: content,
        access_token: accessToken,
      };
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Facebook error: ${JSON.stringify(errorData)}`);
  }

  return await response.json();
}

// Instagram Publishing (via Facebook Graph API)
async function publishToInstagram(connection: any, content: string, mediaUrl?: string) {
  const igUserId = connection.account_id;
  const accessToken = connection.access_token;

  if (!mediaUrl) {
    throw new Error('Instagram requires media for posts');
  }

  // Step 1: Create media container
  const isVideo = mediaUrl.includes('.mp4') || mediaUrl.includes('video');
  const containerEndpoint = `https://graph.facebook.com/v18.0/${igUserId}/media`;
  
  const containerBody: any = {
    access_token: accessToken,
    caption: content,
  };

  if (isVideo) {
    containerBody.media_type = 'REELS';
    containerBody.video_url = mediaUrl;
  } else {
    containerBody.image_url = mediaUrl;
  }

  const containerResponse = await fetch(containerEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(containerBody),
  });

  if (!containerResponse.ok) {
    const errorData = await containerResponse.json();
    throw new Error(`Instagram container error: ${JSON.stringify(errorData)}`);
  }

  const containerData = await containerResponse.json();

  // Step 2: Publish the container
  const publishEndpoint = `https://graph.facebook.com/v18.0/${igUserId}/media_publish`;
  const publishResponse = await fetch(publishEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: containerData.id,
      access_token: accessToken,
    }),
  });

  if (!publishResponse.ok) {
    const errorData = await publishResponse.json();
    throw new Error(`Instagram publish error: ${JSON.stringify(errorData)}`);
  }

  return await publishResponse.json();
}

// LinkedIn Publishing
async function publishToLinkedIn(connection: any, content: string, mediaUrl?: string) {
  const orgId = connection.account_id;
  const accessToken = connection.access_token;

  const endpoint = 'https://api.linkedin.com/v2/ugcPosts';
  
  const body = {
    author: `urn:li:organization:${orgId}`,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: {
          text: content,
        },
        shareMediaCategory: mediaUrl ? 'ARTICLE' : 'NONE',
        ...(mediaUrl && {
          media: [{
            status: 'READY',
            originalUrl: mediaUrl,
          }],
        }),
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LinkedIn error: ${errorText}`);
  }

  return await response.json();
}

// YouTube Publishing (simplified - full implementation requires resumable upload)
async function publishToYouTube(connection: any, content: string, mediaUrl?: string) {
  const accessToken = connection.access_token;

  if (!mediaUrl) {
    throw new Error('YouTube requires a video URL');
  }

  // This is a simplified version - full YouTube upload requires resumable upload API
  const endpoint = 'https://www.googleapis.com/youtube/v3/videos?part=snippet,status';
  
  const body = {
    snippet: {
      title: content.substring(0, 100),
      description: content,
      categoryId: '17', // Sports category
    },
    status: {
      privacyStatus: 'public',
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`YouTube error: ${errorText}`);
  }

  return await response.json();
}

// TikTok Publishing
async function publishToTikTok(connection: any, content: string, mediaUrl?: string) {
  const accessToken = connection.access_token;
  const openId = connection.account_id;

  if (!mediaUrl) {
    throw new Error('TikTok requires a video URL');
  }

  // TikTok Content Posting API
  const endpoint = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
  
  const body = {
    post_info: {
      title: content.substring(0, 150),
      privacy_level: 'PUBLIC_TO_EVERYONE',
    },
    source_info: {
      source: 'PULL_FROM_URL',
      video_url: mediaUrl,
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TikTok error: ${errorText}`);
  }

  return await response.json();
}
