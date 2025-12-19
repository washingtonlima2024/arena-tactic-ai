import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Decode base64 to Uint8Array safely
function base64ToUint8Array(base64String: string): Uint8Array {
  // Remove any whitespace or newlines
  const cleanBase64 = base64String.replace(/\s/g, '');
  
  // Decode base64 to binary string
  const binaryString = atob(cleanBase64);
  
  // Convert to Uint8Array
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return bytes;
}

// Detect audio format from base64 data
function detectAudioFormat(base64String: string): { mimeType: string; extension: string } {
  // Get first few bytes to detect format
  const header = atob(base64String.slice(0, 50));
  
  // WebM signature: 0x1A 0x45 0xDF 0xA3
  if (header.charCodeAt(0) === 0x1A && header.charCodeAt(1) === 0x45) {
    return { mimeType: 'audio/webm', extension: 'webm' };
  }
  
  // OGG signature: OggS
  if (header.startsWith('OggS')) {
    return { mimeType: 'audio/ogg', extension: 'ogg' };
  }
  
  // MP4/M4A signature: ftyp at offset 4
  if (header.slice(4, 8) === 'ftyp') {
    return { mimeType: 'audio/mp4', extension: 'm4a' };
  }
  
  // WAV signature: RIFF....WAVE
  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WAVE') {
    return { mimeType: 'audio/wav', extension: 'wav' };
  }
  
  // MP3 signature: ID3 or 0xFF 0xFB
  if (header.startsWith('ID3') || (header.charCodeAt(0) === 0xFF && (header.charCodeAt(1) & 0xE0) === 0xE0)) {
    return { mimeType: 'audio/mpeg', extension: 'mp3' };
  }
  
  // FLAC signature
  if (header.startsWith('fLaC')) {
    return { mimeType: 'audio/flac', extension: 'flac' };
  }
  
  // Default to webm for browser recordings
  return { mimeType: 'audio/webm', extension: 'webm' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audio } = await req.json();
    
    if (!audio) {
      console.error('No audio data provided');
      return new Response(
        JSON.stringify({ success: false, error: 'No audio data provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      console.error('OPENAI_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'OpenAI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing audio transcription...');
    console.log('Audio base64 length:', audio.length);

    // Detect the actual audio format
    const { mimeType, extension } = detectAudioFormat(audio);
    console.log('Detected audio format:', mimeType, extension);

    // Decode base64 to binary
    const binaryAudio = base64ToUint8Array(audio);
    console.log('Binary audio size:', binaryAudio.length, 'bytes');
    
    // Log first few bytes for debugging
    const headerBytes = Array.from(binaryAudio.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log('Audio header bytes:', headerBytes);

    // Prepare form data for OpenAI Whisper API
    const formData = new FormData();
    const arrayBuffer = binaryAudio.buffer.slice(binaryAudio.byteOffset, binaryAudio.byteOffset + binaryAudio.byteLength) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: mimeType });
    formData.append('file', blob, `audio.${extension}`);
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt'); // Portuguese
    formData.append('response_format', 'json');

    console.log('Sending to OpenAI Whisper API...');

    // Send to OpenAI Whisper API
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ success: false, error: `Transcription failed: ${errorText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    console.log('Transcription successful:', result.text?.substring(0, 100));

    return new Response(
      JSON.stringify({ success: true, text: result.text }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in transcribe-audio:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
