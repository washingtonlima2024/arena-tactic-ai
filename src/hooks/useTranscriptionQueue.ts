import { useState, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/apiClient';
import { toast } from '@/hooks/use-toast';
import { generateUUID } from '@/lib/utils';

export interface TranscriptionQueueItem {
  id: string;
  videoUrl: string;
  matchId: string;
  videoId: string;
  halfType: 'first' | 'second';
  fileName: string;
  sizeMB: number;
  status: 'pending' | 'transcribing' | 'complete' | 'error';
  progress: number;
  message: string;
  currentPart?: number;
  totalParts?: number;
  srtContent?: string;
  text?: string;
  error?: string;
}

interface UseTranscriptionQueueReturn {
  queue: TranscriptionQueueItem[];
  isProcessing: boolean;
  currentItemId: string | null;
  addToQueue: (item: Omit<TranscriptionQueueItem, 'id' | 'status' | 'progress' | 'message'>) => string;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  startProcessing: () => Promise<void>;
  getQueueProgress: () => { completed: number; total: number; overallProgress: number };
}

export function useTranscriptionQueue(): UseTranscriptionQueueReturn {
  const [queue, setQueue] = useState<TranscriptionQueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const processingRef = useRef(false);

  const addToQueue = useCallback((item: Omit<TranscriptionQueueItem, 'id' | 'status' | 'progress' | 'message'>): string => {
    const id = generateUUID();
    const newItem: TranscriptionQueueItem = {
      ...item,
      id,
      status: 'pending',
      progress: 0,
      message: 'Aguardando na fila...'
    };
    
    setQueue(prev => [...prev, newItem]);
    console.log(`[Queue] Adicionado à fila: ${item.fileName} (${item.sizeMB.toFixed(0)}MB)`);
    
    return id;
  }, []);

  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
    setIsProcessing(false);
    setCurrentItemId(null);
    processingRef.current = false;
  }, []);

  const updateItem = useCallback((id: string, updates: Partial<TranscriptionQueueItem>) => {
    setQueue(prev => prev.map(item => 
      item.id === id ? { ...item, ...updates } : item
    ));
  }, []);

  const transcribeItem = async (item: TranscriptionQueueItem): Promise<void> => {
    console.log(`[Queue] Iniciando transcrição: ${item.fileName}`);
    
    updateItem(item.id, { 
      status: 'transcribing', 
      progress: 5, 
      message: 'Iniciando transcrição...' 
    });

    try {
      // Determinar se precisa dividir (vídeos > 300MB)
      const useSplit = item.sizeMB > 300;
      const numParts = useSplit ? (item.sizeMB > 800 ? 4 : 2) : 1;

      if (useSplit) {
        console.log(`[Queue] Vídeo grande (${item.sizeMB.toFixed(0)}MB), dividindo em ${numParts} partes...`);
        
        updateItem(item.id, { 
          progress: 10, 
          message: `Dividindo vídeo em ${numParts} partes...`,
          totalParts: numParts,
          currentPart: 0
        });

        // Poll para progresso durante transcrição com divisão
        const pollProgress = async (itemId: string) => {
          let pollCount = 0;
          const maxPolls = 180; // 30 min máximo
          
          while (pollCount < maxPolls && processingRef.current) {
            await new Promise(r => setTimeout(r, 10000)); // Poll a cada 10s
            pollCount++;
            
            // Estimar progresso baseado no tempo
            const estimatedProgress = Math.min(15 + (pollCount * 0.4), 90);
            const estimatedPart = Math.min(Math.floor((pollCount / (maxPolls / numParts)) + 1), numParts);
            
            updateItem(itemId, {
              progress: estimatedProgress,
              currentPart: estimatedPart,
              message: `Transcrevendo parte ${estimatedPart}/${numParts}...`
            });
          }
        };

        // Iniciar polling em background
        const pollPromise = pollProgress(item.id);

        try {
          const splitData = await apiClient.transcribeSplitVideo({ 
            videoUrl: item.videoUrl, 
            matchId: item.matchId, 
            numParts,
            halfType: item.halfType,
            halfDuration: 45
          });

          // Parar polling
          processingRef.current = false;
          await new Promise(r => setTimeout(r, 100));
          processingRef.current = true;

          if (splitData?.success && splitData?.text) {
            console.log(`[Queue] ✓ Transcrição completa: ${splitData.text.length} caracteres`);
            
            updateItem(item.id, {
              status: 'complete',
              progress: 100,
              message: `✓ Transcrição completa (${numParts} partes)`,
              srtContent: splitData.srtContent || '',
              text: splitData.text,
              currentPart: numParts,
              totalParts: numParts
            });
            return;
          }
        } catch (splitError: any) {
          console.warn(`[Queue] Divisão falhou, tentando método padrão:`, splitError.message);
        }
      }

      // Método padrão (sem divisão)
      updateItem(item.id, { 
        progress: 20, 
        message: 'Transcrevendo vídeo...',
        totalParts: 1,
        currentPart: 1
      });

      const data = await apiClient.transcribeLargeVideo({ 
        videoUrl: item.videoUrl, 
        matchId: item.matchId, 
        language: 'pt' 
      }) as any;

      if (!data?.success) {
        throw new Error(data?.error || data?.text || 'Erro na transcrição');
      }

      updateItem(item.id, {
        status: 'complete',
        progress: 100,
        message: '✓ Transcrição completa',
        srtContent: data.srtContent || '',
        text: data.text || data.srtContent || ''
      });

      console.log(`[Queue] ✓ Transcrição completa: ${data.text?.length} caracteres`);

    } catch (error: any) {
      console.error(`[Queue] Erro na transcrição:`, error);
      
      updateItem(item.id, {
        status: 'error',
        progress: 0,
        message: `✗ Erro: ${error.message}`,
        error: error.message
      });

      toast({
        title: "Erro na transcrição",
        description: `${item.fileName}: ${error.message}`,
        variant: "destructive"
      });
    }
  };

  const startProcessing = useCallback(async () => {
    if (isProcessing) {
      console.log('[Queue] Já está processando');
      return;
    }

    const pendingItems = queue.filter(item => item.status === 'pending');
    if (pendingItems.length === 0) {
      console.log('[Queue] Nenhum item pendente');
      return;
    }

    console.log(`[Queue] Iniciando processamento de ${pendingItems.length} itens...`);
    setIsProcessing(true);
    processingRef.current = true;

    for (const item of pendingItems) {
      if (!processingRef.current) {
        console.log('[Queue] Processamento cancelado');
        break;
      }

      setCurrentItemId(item.id);
      await transcribeItem(item);
    }

    setIsProcessing(false);
    setCurrentItemId(null);
    processingRef.current = false;

    // Notificar conclusão
    const results = queue.filter(item => item.status === 'complete' || item.status === 'error');
    const successCount = results.filter(r => r.status === 'complete').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    if (successCount > 0 || errorCount > 0) {
      toast({
        title: "Fila concluída",
        description: `${successCount} transcrições completas${errorCount > 0 ? `, ${errorCount} com erro` : ''}`,
        variant: errorCount > 0 ? "destructive" : "default"
      });
    }
  }, [isProcessing, queue]);

  const getQueueProgress = useCallback(() => {
    const total = queue.length;
    const completed = queue.filter(item => item.status === 'complete').length;
    const currentProgress = queue.find(item => item.id === currentItemId)?.progress || 0;
    
    const overallProgress = total > 0 
      ? ((completed / total) * 100) + ((currentProgress / total))
      : 0;

    return { completed, total, overallProgress: Math.round(overallProgress) };
  }, [queue, currentItemId]);

  return {
    queue,
    isProcessing,
    currentItemId,
    addToQueue,
    removeFromQueue,
    clearQueue,
    startProcessing,
    getQueueProgress
  };
}
