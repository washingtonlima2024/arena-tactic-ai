/**
 * Mapeamento de nomes reais de modelos para nomes kakttus.ai
 * Usado em toda a interface para manter branding consistente
 */

const MODEL_BRAND_MAP: Record<string, string> = {
  // Gemini family → kakttus Pro
  'gemini-2.5-pro': 'kakttus Pro Ultra',
  'gemini-2.5-flash': 'kakttus Pro',
  'gemini-2.5-flash-lite': 'kakttus Pro Lite',
  'gemini-3-pro-preview': 'kakttus Pro Preview',
  'gemini-3-flash-preview': 'kakttus Pro Flash',
  'google/gemini-2.5-pro': 'kakttus Pro Ultra',
  'google/gemini-2.5-flash': 'kakttus Pro',
  'google/gemini-2.5-flash-lite': 'kakttus Pro Lite',
  'google/gemini-3-pro-preview': 'kakttus Pro Preview',
  'google/gemini-3-flash-preview': 'kakttus Pro Flash',

  // OpenAI family → kakttus Vision
  'gpt-5': 'kakttus Vision Ultra',
  'gpt-5-mini': 'kakttus Vision',
  'gpt-5-nano': 'kakttus Vision Lite',
  'gpt-4o': 'kakttus Vision Multi',
  'gpt-4o-mini': 'kakttus Vision Mini',
  'o3': 'kakttus Reasoning',
  'o4-mini': 'kakttus Reasoning Lite',
  'openai/gpt-5': 'kakttus Vision Ultra',
  'openai/gpt-5-mini': 'kakttus Vision',
  'openai/gpt-5-nano': 'kakttus Vision Lite',

  // Ollama / Local models → kakttus.ai Local
  'mistral:7b-instruct': 'kakttus Mist',
  'mistral:latest': 'kakttus Mist',
  'mistral': 'kakttus Mist',
  'mistral-nemo': 'kakttus Mist Nemo',
  'mistral-small': 'kakttus Mist Small',
  'washingtonlima/kakttus': 'kakttus.ai Local',
  'llama3.2': 'kakttus Llama',
  'llama3.2:latest': 'kakttus Llama',
  'llama3.1': 'kakttus Llama Pro',
  'llama3.1:latest': 'kakttus Llama Pro',
  'qwen2.5': 'kakttus Qwen',
  'qwen2.5:latest': 'kakttus Qwen',
  'phi3': 'kakttus Phi',
  'phi3:latest': 'kakttus Phi',
  'deepseek-r1': 'kakttus Deep',
  'deepseek-r1:latest': 'kakttus Deep',
  'gemma2': 'kakttus Gemma',
  'gemma2:latest': 'kakttus Gemma',

  // Whisper → kakttus Transcrição
  'whisper': 'kakttus Transcrição',
  'whisper-local': 'kakttus Transcrição',
  'faster-whisper': 'kakttus Transcrição',

  // ElevenLabs → kakttus Voice
  'elevenlabs': 'kakttus Voice',
};

/**
 * Converte o nome real de um modelo para o nome de marca kakttus.ai
 * Se não encontrar mapeamento exato, tenta correspondência parcial
 */
export function getModelBrandName(modelName: string): string {
  if (!modelName) return modelName;

  // Busca exata
  const exact = MODEL_BRAND_MAP[modelName];
  if (exact) return exact;

  // Busca exata com lowercase
  const lower = modelName.toLowerCase();
  const exactLower = MODEL_BRAND_MAP[lower];
  if (exactLower) return exactLower;

  // Correspondência parcial - procura se o nome contém alguma key conhecida
  for (const [key, brand] of Object.entries(MODEL_BRAND_MAP)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return brand;
    }
  }

  // Se o modelo já tem "kakttus" no nome, retorna como está
  if (lower.includes('kakttus')) return modelName;

  // Fallback: prefixar com kakttus
  return `kakttus ${modelName}`;
}

/**
 * Formata o nome de um modelo Ollama com branding kakttus.ai
 * Inclui o tamanho se fornecido
 */
export function formatOllamaModelName(name: string, size?: string): string {
  const brandName = getModelBrandName(name);
  if (size) {
    return `${brandName} (${size})`;
  }
  return brandName;
}
