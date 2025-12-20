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

// Detect audio format from binary data
function detectAudioFormat(binaryData: Uint8Array): { mimeType: string; extension: string } {
  // WebM/Matroska signature: 0x1A 0x45 0xDF 0xA3
  if (binaryData[0] === 0x1A && binaryData[1] === 0x45 && binaryData[2] === 0xDF && binaryData[3] === 0xA3) {
    return { mimeType: 'audio/webm', extension: 'webm' };
  }
  
  // OGG signature: OggS (0x4F 0x67 0x67 0x53)
  if (binaryData[0] === 0x4F && binaryData[1] === 0x67 && binaryData[2] === 0x67 && binaryData[3] === 0x53) {
    return { mimeType: 'audio/ogg', extension: 'ogg' };
  }
  
  // MP4/M4A signature: ftyp at offset 4
  if (binaryData[4] === 0x66 && binaryData[5] === 0x74 && binaryData[6] === 0x79 && binaryData[7] === 0x70) {
    return { mimeType: 'audio/mp4', extension: 'm4a' };
  }
  
  // WAV signature: RIFF....WAVE
  if (binaryData[0] === 0x52 && binaryData[1] === 0x49 && binaryData[2] === 0x46 && binaryData[3] === 0x46) {
    return { mimeType: 'audio/wav', extension: 'wav' };
  }
  
  // MP3 signature: ID3 or sync bytes 0xFF 0xFB/0xFF 0xFA/0xFF 0xF3
  if ((binaryData[0] === 0x49 && binaryData[1] === 0x44 && binaryData[2] === 0x33) || 
      (binaryData[0] === 0xFF && (binaryData[1] & 0xE0) === 0xE0)) {
    return { mimeType: 'audio/mpeg', extension: 'mp3' };
  }
  
  // FLAC signature
  if (binaryData[0] === 0x66 && binaryData[1] === 0x4C && binaryData[2] === 0x61 && binaryData[3] === 0x43) {
    return { mimeType: 'audio/flac', extension: 'flac' };
  }
  
  // EBML/WebM variant - check for EBML header which can start differently
  // EBML elements can have various headers, but 0x1A is common
  if (binaryData[0] === 0x1A) {
    return { mimeType: 'audio/webm', extension: 'webm' };
  }
  
  // Default to webm for browser recordings - OpenAI accepts webm
  return { mimeType: 'audio/webm', extension: 'webm' };
}

// Create a File from binary data
function createAudioFile(binaryData: Uint8Array, filename: string, mimeType: string): File {
  // Create an ArrayBuffer copy to avoid type issues
  const buffer = new ArrayBuffer(binaryData.length);
  const view = new Uint8Array(buffer);
  view.set(binaryData);
  
  const blob = new Blob([buffer], { type: mimeType });
  return new File([blob], filename, { type: mimeType });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audio, language = 'pt' } = await req.json();
    
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
    console.log('Audio base64 length:', audio.length, 'Language:', language);

    // Decode base64 to binary first
    const binaryAudio = base64ToUint8Array(audio);
    console.log('Binary audio size:', binaryAudio.length, 'bytes');
    
    // Log first few bytes for debugging
    const headerBytes = Array.from(binaryAudio.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log('Audio header bytes:', headerBytes);

    // Detect the actual audio format from binary data
    const { mimeType, extension } = detectAudioFormat(binaryAudio);
    console.log('Detected audio format:', mimeType, extension);

    // Check minimum size - should be at least 1KB for valid audio
    if (binaryAudio.length < 1000) {
      console.log('Audio too short, returning empty');
      return new Response(
        JSON.stringify({ success: true, text: '' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Function to try transcription with specific format
    const tryTranscribe = async (ext: string, mime: string): Promise<{ success: boolean; text?: string; error?: string }> => {
      const formData = new FormData();
      const file = createAudioFile(binaryAudio, `recording.${ext}`, mime);
      formData.append('file', file);
      formData.append('model', 'whisper-1');
      formData.append('language', language);
      formData.append('response_format', 'json');

      console.log(`Trying transcription with format: ${ext} (${mime}), size: ${binaryAudio.length}`);

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Transcription failed with ${ext}:`, response.status, errorText);
        return { success: false, error: errorText };
      }

      const result = await response.json();
      console.log(`Transcription successful with ${ext}:`, result.text?.substring(0, 100));
      return { success: true, text: result.text };
    };

    // Try formats in order of compatibility
    // OpenAI Whisper works best with: mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg
    const formatsToTry = [
      { ext: 'ogg', mime: 'audio/ogg' },  // Most compatible for browser recordings
      { ext: 'webm', mime: 'audio/webm' },
      { ext: 'mp3', mime: 'audio/mpeg' },
      { ext: 'wav', mime: 'audio/wav' },
    ];

    // Start with detected format first
    let result = await tryTranscribe(extension, mimeType);
    
    // If failed, try fallback formats
    if (!result.success) {
      for (const format of formatsToTry) {
        if (format.ext === extension) continue; // Skip already tried format
        
        console.log(`Retrying with ${format.ext} format...`);
        result = await tryTranscribe(format.ext, format.mime);
        
        if (result.success) break;
      }
    }

    if (result.success) {
      return new Response(
        JSON.stringify({ success: true, text: result.text }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      console.error('All transcription attempts failed');
      return new Response(
        JSON.stringify({ success: false, error: `Transcription failed: ${result.error}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in transcribe-audio:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
