import { useState, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';

interface TTSGenerationResult {
  script: string;
  audioBlob: Blob | null;
  audioUrl: string;
  voice: string;
}

/**
 * Hook para gerar áudio usando Web Speech API (gratuito, offline)
 * Usa MediaRecorder para capturar o áudio falado
 */
export function useFreeTTSGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<TTSGenerationResult | null>(null);
  const { toast } = useToast();
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Get available voices
  const getVoices = useCallback((): SpeechSynthesisVoice[] => {
    if (!isSupported) return [];
    return speechSynthesis.getVoices();
  }, [isSupported]);

  // Get Portuguese voice
  const getPortugueseVoice = useCallback((): SpeechSynthesisVoice | null => {
    const voices = getVoices();
    // Priorizar vozes PT-BR
    const ptBrVoice = voices.find(v => 
      v.lang === 'pt-BR' || 
      v.lang.toLowerCase().includes('brazil')
    );
    if (ptBrVoice) return ptBrVoice;
    
    // Fallback para qualquer voz em português
    const ptVoice = voices.find(v => 
      v.lang.startsWith('pt') || 
      v.lang.includes('PT')
    );
    return ptVoice || voices[0] || null;
  }, [getVoices]);

  /**
   * Gera áudio usando Web Speech API
   * Retorna uma Promise com o texto falado (áudio é reproduzido pelo navegador)
   */
  const generateSpeech = useCallback(async (
    text: string,
    options?: {
      rate?: number;
      pitch?: number;
      voice?: SpeechSynthesisVoice;
    }
  ): Promise<TTSGenerationResult> => {
    if (!isSupported) {
      throw new Error('Web Speech API não suportada neste navegador');
    }

    if (!text.trim()) {
      throw new Error('Texto vazio');
    }

    setIsGenerating(true);
    setProgress(0);

    return new Promise((resolve, reject) => {
      // Cancel any ongoing speech
      speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      const voice = options?.voice || getPortugueseVoice();
      
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = 'pt-BR';
      }

      utterance.rate = options?.rate ?? 1;
      utterance.pitch = options?.pitch ?? 1;

      const textLength = text.length;

      utterance.onboundary = (event) => {
        if (textLength > 0) {
          const progressPercent = (event.charIndex / textLength) * 100;
          setProgress(Math.min(progressPercent, 99));
        }
      };

      utterance.onend = () => {
        setProgress(100);
        setIsGenerating(false);
        
        const generatedResult: TTSGenerationResult = {
          script: text,
          audioBlob: null, // Web Speech não permite exportar blob diretamente
          audioUrl: '', // Será reproduzido via speechSynthesis
          voice: voice?.name || 'default',
        };
        
        setResult(generatedResult);
        resolve(generatedResult);
      };

      utterance.onerror = (event) => {
        setIsGenerating(false);
        setProgress(0);
        reject(new Error(`Erro na síntese de voz: ${event.error}`));
      };

      speechSynthesis.speak(utterance);
    });
  }, [isSupported, getPortugueseVoice]);

  /**
   * Gera script de narração baseado nos eventos do jogo
   */
  const generateNarrationScript = useCallback((
    events: any[],
    homeTeam: string,
    awayTeam: string,
    homeScore: number,
    awayScore: number,
    style: 'narrator' | 'commentator' | 'dynamic' = 'narrator'
  ): string => {
    const lines: string[] = [];

    // Abertura
    if (style === 'narrator') {
      lines.push(`Bem-vindos à cobertura completa de ${homeTeam} contra ${awayTeam}.`);
    } else if (style === 'commentator') {
      lines.push(`E aí, galera! Vamos falar do jogão entre ${homeTeam} e ${awayTeam}!`);
    } else {
      lines.push(`${homeTeam} recebe ${awayTeam} em partida válida pela rodada.`);
    }

    // Eventos principais
    const goals = events.filter(e => e.event_type === 'goal');
    const cards = events.filter(e => ['yellow_card', 'red_card'].includes(e.event_type));
    const saves = events.filter(e => e.event_type === 'save');

    if (goals.length > 0) {
      lines.push('');
      lines.push('Gols da partida:');
      goals.forEach(goal => {
        const minute = goal.minute || '?';
        const desc = goal.description || 'Gol marcado';
        lines.push(`Aos ${minute} minutos: ${desc}`);
      });
    }

    if (cards.length > 0) {
      lines.push('');
      const yellows = cards.filter(c => c.event_type === 'yellow_card').length;
      const reds = cards.filter(c => c.event_type === 'red_card').length;
      if (yellows > 0) lines.push(`Foram mostrados ${yellows} cartões amarelos.`);
      if (reds > 0) lines.push(`E ${reds} cartão vermelho.`);
    }

    if (saves.length > 0) {
      lines.push(`Os goleiros fizeram ${saves.length} defesas importantes.`);
    }

    // Placar final
    lines.push('');
    if (homeScore > awayScore) {
      lines.push(`Vitória do ${homeTeam} por ${homeScore} a ${awayScore}.`);
    } else if (awayScore > homeScore) {
      lines.push(`Vitória do ${awayTeam} por ${awayScore} a ${homeScore}.`);
    } else {
      lines.push(`Empate em ${homeScore} a ${awayScore}.`);
    }

    lines.push('');
    lines.push('Fim da transmissão.');

    return lines.join('\n');
  }, []);

  /**
   * Gera script de podcast baseado nos eventos e análise tática
   */
  const generatePodcastScript = useCallback((
    events: any[],
    homeTeam: string,
    awayTeam: string,
    homeScore: number,
    awayScore: number,
    podcastType: 'summary' | 'tactical' | 'debate',
    tacticalAnalysis?: any
  ): string => {
    const lines: string[] = [];

    if (podcastType === 'summary') {
      lines.push(`Resumo da partida: ${homeTeam} ${homeScore} x ${awayScore} ${awayTeam}`);
      lines.push('');
      
      // Resumo dos momentos principais
      const goals = events.filter(e => e.event_type === 'goal');
      if (goals.length > 0) {
        lines.push(`Foram ${goals.length} gols na partida.`);
        goals.forEach(goal => {
          lines.push(`Gol aos ${goal.minute || '?'} minutos. ${goal.description || ''}`);
        });
      } else {
        lines.push('Partida terminou sem gols.');
      }
      
      lines.push('');
      lines.push(`Placar final: ${homeTeam} ${homeScore}, ${awayTeam} ${awayScore}.`);
      
    } else if (podcastType === 'tactical') {
      lines.push(`Análise Tática: ${homeTeam} versus ${awayTeam}`);
      lines.push('');
      
      if (tacticalAnalysis) {
        if (tacticalAnalysis.summary) {
          lines.push(tacticalAnalysis.summary);
        }
        if (tacticalAnalysis.homeTeamAnalysis) {
          lines.push('');
          lines.push(`Sobre o ${homeTeam}: ${tacticalAnalysis.homeTeamAnalysis}`);
        }
        if (tacticalAnalysis.awayTeamAnalysis) {
          lines.push('');
          lines.push(`Sobre o ${awayTeam}: ${tacticalAnalysis.awayTeamAnalysis}`);
        }
      } else {
        lines.push('A análise tática não está disponível para esta partida.');
        lines.push('Execute a análise de eventos primeiro para gerar insights táticos.');
      }
      
    } else if (podcastType === 'debate') {
      lines.push(`Debate sobre ${homeTeam} contra ${awayTeam}`);
      lines.push('');
      lines.push(`O resultado foi ${homeScore} a ${awayScore}.`);
      lines.push('');
      
      if (homeScore > awayScore) {
        lines.push(`Os torcedores do ${homeTeam} estão comemorando esta vitória.`);
        lines.push(`Já a torcida do ${awayTeam} lamenta o resultado.`);
      } else if (awayScore > homeScore) {
        lines.push(`Grande festa para os torcedores do ${awayTeam}!`);
        lines.push(`O ${homeTeam} vai precisar se recuperar.`);
      } else {
        lines.push('Empate que pode ter significados diferentes para cada torcida.');
      }
    }

    return lines.join('\n');
  }, []);

  /**
   * Reproduz texto usando Web Speech API
   */
  const speak = useCallback((text: string) => {
    if (!isSupported || !text) return;
    
    speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = getPortugueseVoice();
    
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = 'pt-BR';
    }
    
    utterance.rate = 1;
    utterance.pitch = 1;
    
    speechSynthesis.speak(utterance);
  }, [isSupported, getPortugueseVoice]);

  /**
   * Para a reprodução atual
   */
  const stop = useCallback(() => {
    if (!isSupported) return;
    speechSynthesis.cancel();
    setIsGenerating(false);
    setProgress(0);
  }, [isSupported]);

  return {
    isGenerating,
    progress,
    result,
    isSupported,
    generateSpeech,
    generateNarrationScript,
    generatePodcastScript,
    speak,
    stop,
    getVoices,
    getPortugueseVoice,
  };
}
