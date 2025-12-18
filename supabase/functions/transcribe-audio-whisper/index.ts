import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Convert seconds to SRT timestamp format (HH:MM:SS,mmm)
function formatSrtTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

// Convert Whisper segments to SRT format
function segmentsToSrt(segments: Array<{ start: number; end: number; text: string }>): string {
  return segments.map((segment, index) => {
    const startTime = formatSrtTimestamp(segment.start);
    const endTime = formatSrtTimestamp(segment.end);
    return `${index + 1}\n${startTime} --> ${endTime}\n${segment.text.trim()}\n`;
  }).join('\n');
}

// Try to extract video source URL from embed page
async function extractVideoFromEmbed(embedUrl: string): Promise<string | null> {
  console.log('Attempting to extract video from embed:', embedUrl);
  
  // Try common URL patterns for direct video access
  const patterns = [
    // Replace /embed/ with /video/
    embedUrl.replace('/embed/', '/video/'),
    // Replace /embed/ with /download/
    embedUrl.replace('/embed/', '/download/'),
    // Add .mp4 extension
    embedUrl.replace('/embed/', '/video/') + '.mp4',
    // API endpoint pattern
    embedUrl.replace('/embed/', '/api/video/'),
  ];

  for (const url of patterns) {
    try {
      console.log('Trying URL pattern:', url);
      const response = await fetch(url, { method: 'HEAD' });
      const contentType = response.headers.get('content-type') || '';
      
      if (response.ok && (contentType.includes('video') || contentType.includes('audio'))) {
        console.log('Found media at:', url);
        return url;
      }
    } catch (e) {
      console.log('Pattern failed:', url);
    }
  }

  // Try to fetch embed page and extract source
  try {
    console.log('Fetching embed page to extract source...');
    const response = await fetch(embedUrl);
    const html = await response.text();
    
    // Look for video source in HTML
    const patterns = [
      /src=["']([^"']+\.mp4[^"']*)/i,
      /source\s+src=["']([^"']+)/i,
      /"url":\s*["']([^"']+\.mp4[^"']*)/i,
      /"file":\s*["']([^"']+)/i,
      /videoUrl["']?\s*[:=]\s*["']([^"']+)/i,
      /hlsUrl["']?\s*[:=]\s*["']([^"']+)/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        let videoUrl = match[1];
        // Handle relative URLs
        if (videoUrl.startsWith('/')) {
          const baseUrl = new URL(embedUrl);
          videoUrl = `${baseUrl.origin}${videoUrl}`;
        }
        console.log('Extracted video URL from embed:', videoUrl);
        return videoUrl;
      }
    }
  } catch (e) {
    console.log('Failed to parse embed page:', e);
  }

  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audioUrl, videoUrl, embedUrl, audio } = await req.json();

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    let audioBlob: Blob;
    let fileName = 'audio.mp3';
    let resolvedUrl: string | null = null;

    // Priority: audioUrl > videoUrl > embedUrl > base64 audio
    if (audioUrl) {
      resolvedUrl = audioUrl;
      console.log('Using direct audio URL');
    } else if (videoUrl) {
      resolvedUrl = videoUrl;
      console.log('Using direct video URL');
    } else if (embedUrl) {
      // Try to extract video source from embed
      resolvedUrl = await extractVideoFromEmbed(embedUrl);
      if (!resolvedUrl) {
        throw new Error('Não foi possível extrair o vídeo do embed. Tente fornecer uma URL de vídeo direta ou um arquivo SRT.');
      }
      console.log('Extracted URL from embed:', resolvedUrl);
    }

    if (resolvedUrl) {
      // Download media from URL
      console.log('Downloading media from URL:', resolvedUrl);
      const response = await fetch(resolvedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to download media: ${response.status} ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'audio/mpeg';
      audioBlob = new Blob([arrayBuffer], { type: contentType });
      
      // Extract filename from URL
      const urlParts = resolvedUrl.split('/');
      fileName = urlParts[urlParts.length - 1]?.split('?')[0] || 'audio.mp3';
      
      console.log('Media downloaded:', (audioBlob.size / (1024 * 1024)).toFixed(2), 'MB');
    } else if (audio) {
      // Base64 encoded audio
      console.log('Using base64 audio data');
      const binaryString = atob(audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
    } else {
      throw new Error('Forneça audioUrl, videoUrl, embedUrl ou audio (base64)');
    }

    // Check file size (Whisper has 25MB limit)
    const MAX_SIZE_MB = 25;
    const fileSizeMB = audioBlob.size / (1024 * 1024);
    console.log('Media size:', fileSizeMB.toFixed(2), 'MB');
    
    if (fileSizeMB > MAX_SIZE_MB) {
      throw new Error(`Arquivo muito grande (${fileSizeMB.toFixed(1)}MB). Máximo permitido: ${MAX_SIZE_MB}MB. Use um arquivo de áudio extraído ou SRT.`);
    }

    // Create form data for Whisper API
    const formData = new FormData();
    formData.append('file', audioBlob, fileName);
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'segment');

    console.log('Sending to Whisper API...');
    
    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      console.error('Whisper API error:', whisperResponse.status, errorText);
      throw new Error(`Whisper API error: ${errorText}`);
    }

    const result = await whisperResponse.json();
    console.log('Whisper transcription complete');
    console.log('Text length:', result.text?.length || 0, 'characters');
    console.log('Segments:', result.segments?.length || 0);

    // Convert segments to SRT format
    const segments = result.segments || [];
    const srtContent = segmentsToSrt(segments);

    return new Response(JSON.stringify({ 
      success: true,
      text: result.text || '',
      srtContent,
      segments: segments.map((s: any) => ({
        start: s.start,
        end: s.end,
        text: s.text
      })),
      duration: result.duration || 0,
      language: result.language || 'pt'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in transcribe-audio-whisper:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});