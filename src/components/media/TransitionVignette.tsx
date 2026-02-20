import { useState, useEffect, useRef } from 'react';
import { useVignetteAudio } from '@/hooks/useVignetteAudio';
import { ArrowRight, Zap } from 'lucide-react';
import { getEventLabelUpper } from '@/lib/eventLabels';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(300);

  // ResizeObserver: scale to container, not viewport
  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const scale = Math.max(0.35, Math.min(1.4, containerWidth / 400));

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

  // Scaled sizes
  const iconSize = `${Math.round(24 * scale)}px`;
  const labelFontSize = `${Math.round(14 * scale)}px`;
  const minuteFontSize = `${Math.round(40 * scale)}px`;
  const titleFontSize = `${Math.round(13 * scale)}px`;
  const subFontSize = `${Math.round(10 * scale)}px`;
  const dividerH = `${Math.round(40 * scale)}px`;
  const contentGap = `${Math.round(12 * scale)}px`;
  const innerGap = `${Math.round(8 * scale)}px`;
  const cornerSize = `${Math.round(48 * scale)}px`;
  const cornerOffset = `${Math.round(8 * scale)}px`;
  const pulseOuter = `${Math.round(96 * scale)}px`;
  const pulseInner = `${Math.round(48 * scale)}px`;

  return (
    <div ref={containerRef} className="relative w-full h-full bg-background overflow-hidden flex items-center justify-center">
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
              animation: `tvLineSlide ${0.4 + i * 0.05}s ease-out ${i * 0.05}s forwards`,
              opacity: 0,
              transform: 'translateX(-100%)'
            }}
          />
        ))}
      </div>

      {/* Center pulse */}
      <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${phase === 'hold' ? 'opacity-100' : 'opacity-0'}`}>
        <div 
          className="absolute rounded-full bg-primary/20"
          style={{ width: pulseOuter, height: pulseOuter, animation: phase === 'hold' ? 'tvPulseBig 0.6s ease-out' : undefined }}
        />
        <div 
          className="absolute rounded-full bg-primary/40"
          style={{ width: pulseInner, height: pulseInner, animation: phase === 'hold' ? 'tvPulseBig 0.4s ease-out' : undefined }}
        />
      </div>

      {/* Content */}
      <div className={`relative z-10 flex flex-col items-center px-3 transition-all duration-300 ${
        phase === 'enter' ? 'opacity-0 scale-90' :
        phase === 'hold' ? 'opacity-100 scale-100' :
        'opacity-0 scale-110'
      }`} style={{ gap: contentGap }}>
        <div className="flex items-center text-primary" style={{ gap: innerGap }}>
          <Zap style={{ width: iconSize, height: iconSize }} className="fill-primary" />
          <span className="font-bold uppercase tracking-widest" style={{ fontSize: labelFontSize }}>Próximo</span>
          <ArrowRight style={{ width: iconSize, height: iconSize }} />
        </div>

        <div className="flex items-center" style={{ gap: innerGap }}>
          <span 
            className="font-black text-primary drop-shadow-[0_0_20px_hsl(var(--primary)/0.6)]"
            style={{ fontSize: minuteFontSize }}
          >
            {nextClipMinute}'
          </span>
          <div className="bg-primary/50 w-px" style={{ height: dividerH }} />
          <div className="text-left" style={{ maxWidth: `${Math.round(160 * scale)}px` }}>
            <p className="font-medium text-foreground truncate" style={{ fontSize: titleFontSize }}>{nextClipTitle}</p>
            <p className="text-muted-foreground uppercase tracking-wide" style={{ fontSize: subFontSize }}>
              {getEventLabelUpper(nextClipType)}
            </p>
          </div>
        </div>
      </div>

      {/* Corner flashes */}
      <div className={`absolute top-0 left-0 transition-opacity duration-200 ${phase === 'hold' ? 'opacity-100' : 'opacity-0'}`} style={{ width: cornerSize, height: cornerSize }}>
        <div className="absolute bg-primary" style={{ top: cornerOffset, left: cornerOffset, width: `${Math.round(48 * scale)}px`, height: '1px', animation: 'tvExpandX 0.3s ease-out' }} />
        <div className="absolute bg-primary" style={{ top: cornerOffset, left: cornerOffset, width: '1px', height: `${Math.round(48 * scale)}px`, animation: 'tvExpandY 0.3s ease-out' }} />
      </div>
      <div className={`absolute bottom-0 right-0 transition-opacity duration-200 ${phase === 'hold' ? 'opacity-100' : 'opacity-0'}`} style={{ width: cornerSize, height: cornerSize }}>
        <div className="absolute bg-primary" style={{ bottom: cornerOffset, right: cornerOffset, width: `${Math.round(48 * scale)}px`, height: '1px', animation: 'tvExpandX 0.3s ease-out' }} />
        <div className="absolute bg-primary" style={{ bottom: cornerOffset, right: cornerOffset, width: '1px', height: `${Math.round(48 * scale)}px`, animation: 'tvExpandY 0.3s ease-out' }} />
      </div>

      <style>{`
        @keyframes tvLineSlide {
          0% { transform: translateX(-100%); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translateX(100%); opacity: 0; }
        }
        @keyframes tvPulseBig {
          0% { transform: scale(0); opacity: 1; }
          100% { transform: scale(3); opacity: 0; }
        }
        @keyframes tvExpandX {
          0% { width: 0; }
          100% { width: ${Math.round(48 * scale)}px; }
        }
        @keyframes tvExpandY {
          0% { height: 0; }
          100% { height: ${Math.round(48 * scale)}px; }
        }
      `}</style>
    </div>
  );
}
