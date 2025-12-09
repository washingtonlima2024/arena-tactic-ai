import { useState, useEffect, useRef } from 'react';
import { useVignetteAudio } from '@/hooks/useVignetteAudio';
import { ArrowRight, Zap } from 'lucide-react';

interface TransitionVignetteProps {
  nextClipTitle: string;
  nextClipMinute: number;
  nextClipType: string;
  onComplete: () => void;
  duration?: number; // in milliseconds
}

export function TransitionVignette({
  nextClipTitle,
  nextClipMinute,
  nextClipType,
  onComplete,
  duration = 2000
}: TransitionVignetteProps) {
  const [phase, setPhase] = useState<'enter' | 'hold' | 'exit'>('enter');
  const { playSwoosh, initAudio } = useVignetteAudio();
  const soundPlayedRef = useRef(false);

  useEffect(() => {
    const playSound = async () => {
      if (!soundPlayedRef.current) {
        await initAudio();
        await playSwoosh();
        soundPlayedRef.current = true;
      }
    };
    playSound();

    const enterTimer = setTimeout(() => setPhase('hold'), 200);
    const exitTimer = setTimeout(() => setPhase('exit'), duration - 200);
    const completeTimer = setTimeout(onComplete, duration);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [duration, onComplete, playSwoosh, initAudio]);

  return (
    <div className="relative w-full h-full bg-background overflow-hidden flex items-center justify-center">
      {/* Animated background lines */}
      <div className="absolute inset-0 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="absolute h-px bg-gradient-to-r from-transparent via-primary to-transparent"
            style={{
              top: `${12 + i * 12}%`,
              left: 0,
              right: 0,
              animation: `lineSlide ${0.4 + i * 0.05}s ease-out ${i * 0.05}s forwards`,
              opacity: 0,
              transform: 'translateX(-100%)'
            }}
          />
        ))}
      </div>

      {/* Center pulse - responsive */}
      <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${
        phase === 'hold' ? 'opacity-100' : 'opacity-0'
      }`}>
        <div 
          className="absolute w-32 h-32 sm:w-48 sm:h-48 md:w-64 md:h-64 rounded-full bg-primary/20"
          style={{
            animation: phase === 'hold' ? 'pulseBig 0.6s ease-out' : undefined
          }}
        />
        <div 
          className="absolute w-16 h-16 sm:w-24 sm:h-24 md:w-32 md:h-32 rounded-full bg-primary/40"
          style={{
            animation: phase === 'hold' ? 'pulseBig 0.4s ease-out' : undefined
          }}
        />
      </div>

      {/* Content - responsive */}
      <div className={`relative z-10 flex flex-col items-center gap-2 sm:gap-3 md:gap-4 px-3 transition-all duration-300 ${
        phase === 'enter' ? 'opacity-0 scale-90' :
        phase === 'hold' ? 'opacity-100 scale-100' :
        'opacity-0 scale-110'
      }`}>
        <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 text-primary">
          <Zap className="h-4 w-4 sm:h-6 sm:w-6 md:h-8 md:w-8 fill-primary" />
          <span className="text-sm sm:text-lg md:text-2xl font-bold uppercase tracking-widest">Próximo</span>
          <ArrowRight className="h-4 w-4 sm:h-6 sm:w-6 md:h-8 md:w-8" />
        </div>

        <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
          <span className="text-2xl sm:text-4xl md:text-5xl font-black text-primary drop-shadow-[0_0_20px_hsl(var(--primary)/0.6)]">
            {nextClipMinute}'
          </span>
          <div className="h-6 sm:h-10 md:h-12 w-px bg-primary/50" />
          <div className="text-left max-w-[150px] sm:max-w-[200px] md:max-w-none">
            <p className="text-xs sm:text-sm md:text-lg font-medium text-foreground truncate">{nextClipTitle}</p>
            <p className="text-[10px] sm:text-xs md:text-sm text-muted-foreground uppercase tracking-wide">{nextClipType.replace(/_/g, ' ')}</p>
          </div>
        </div>
      </div>

      {/* Corner flashes - responsive */}
      <div className={`absolute top-0 left-0 w-16 h-16 sm:w-24 sm:h-24 md:w-32 md:h-32 transition-opacity duration-200 ${
        phase === 'hold' ? 'opacity-100' : 'opacity-0'
      }`}>
        <div className="absolute top-2 left-2 sm:top-3 sm:left-3 md:top-4 md:left-4 w-8 sm:w-12 md:w-16 h-px bg-primary" style={{ animation: 'expandX 0.3s ease-out' }} />
        <div className="absolute top-2 left-2 sm:top-3 sm:left-3 md:top-4 md:left-4 h-8 sm:h-12 md:h-16 w-px bg-primary" style={{ animation: 'expandY 0.3s ease-out' }} />
      </div>
      <div className={`absolute bottom-0 right-0 w-16 h-16 sm:w-24 sm:h-24 md:w-32 md:h-32 transition-opacity duration-200 ${
        phase === 'hold' ? 'opacity-100' : 'opacity-0'
      }`}>
        <div className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 md:bottom-4 md:right-4 w-8 sm:w-12 md:w-16 h-px bg-primary" style={{ animation: 'expandX 0.3s ease-out' }} />
        <div className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 md:bottom-4 md:right-4 h-8 sm:h-12 md:h-16 w-px bg-primary" style={{ animation: 'expandY 0.3s ease-out' }} />
      </div>

      <style>{`
        @keyframes lineSlide {
          0% { transform: translateX(-100%); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translateX(100%); opacity: 0; }
        }
        @keyframes pulseBig {
          0% { transform: scale(0); opacity: 1; }
          100% { transform: scale(3); opacity: 0; }
        }
        @keyframes expandX {
          0% { width: 0; }
          100% { width: 4rem; }
        }
        @keyframes expandY {
          0% { height: 0; }
          100% { height: 4rem; }
        }
      `}</style>
    </div>
  );
}
