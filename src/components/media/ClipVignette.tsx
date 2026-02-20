import { useState, useEffect, useMemo, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Clock, Play } from 'lucide-react';
import { useVignetteAudio } from '@/hooks/useVignetteAudio';
import { getEventLabelUpper } from '@/lib/eventLabels';

interface ClipVignetteProps {
  thumbnailUrl: string;
  eventType: string;
  minute: number;
  title: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  onComplete: () => void;
  duration?: number; // in milliseconds
}

// Generate random particles for the animation
const generateParticles = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 4 + 2,
    duration: Math.random() * 2 + 1,
    delay: Math.random() * 2,
  }));
};

export function ClipVignette({
  thumbnailUrl,
  eventType,
  minute,
  title,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  onComplete,
  duration = 3000
}: ClipVignetteProps) {
  const [phase, setPhase] = useState<'enter' | 'hold' | 'exit'>('enter');
  const [imageLoaded, setImageLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(300);
  
  const particles = useMemo(() => generateParticles(20), []);
  const { playSwoosh, playImpact, initAudio } = useVignetteAudio();
  const soundPlayedRef = useRef({ enter: false, exit: false });

  // ResizeObserver to scale with container, not viewport
  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // scale factor: 1.0 at 400px wide, proportionally smaller/larger
  const scale = Math.max(0.35, Math.min(1.4, containerWidth / 400));

  useEffect(() => {
    const playEnterSound = async () => {
      if (!soundPlayedRef.current.enter) {
        await initAudio();
        await playSwoosh();
        soundPlayedRef.current.enter = true;
      }
    };
    playEnterSound();

    const enterTimer = setTimeout(() => setPhase('hold'), 500);
    const exitTimer = setTimeout(() => {
      setPhase('exit');
      if (!soundPlayedRef.current.exit) {
        playImpact();
        soundPlayedRef.current.exit = true;
      }
    }, duration - 400);
    const completeTimer = setTimeout(onComplete, duration);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [duration, onComplete, playSwoosh, playImpact, initAudio]);

  // Scaled sizes
  const badgeFontSize = `${Math.round(10 * scale)}px`;
  const badgePx = `${Math.round(12 * scale)}px`;
  const badgePy = `${Math.round(4 * scale)}px`;
  const badgeMb = `${Math.round(10 * scale)}px`;
  const minuteFontSize = `${Math.round(48 * scale)}px`;
  const clockSize = `${Math.round(32 * scale)}px`;
  const minuteMb = `${Math.round(14 * scale)}px`;
  const minuteGap = `${Math.round(8 * scale)}px`;
  const scoresFontSize = `${Math.round(14 * scale)}px`;
  const scoresGap = `${Math.round(12 * scale)}px`;
  const scoresMb = `${Math.round(10 * scale)}px`;
  const scoreFontSize = `${Math.round(26 * scale)}px`;
  const titleFontSize = `${Math.round(12 * scale)}px`;
  const cornerSize = `${Math.round(40 * scale)}px`;
  const cornerOffset = `${Math.round(8 * scale)}px`;
  const cornerTop = `${Math.round(7)}%`;
  const playIconSize = `${Math.round(40 * scale)}px`;
  const playPad = `${Math.round(16 * scale)}px`;

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black overflow-hidden">
      {/* Ken Burns effect on thumbnail */}
      <div 
        className={`absolute inset-0 transition-all ease-out ${
          phase === 'enter' 
            ? 'scale-125 opacity-0 blur-sm duration-500' 
            : phase === 'hold' 
            ? 'scale-110 opacity-100 blur-0 duration-[2500ms]' 
            : 'scale-100 opacity-0 blur-md duration-400'
        }`}
        style={{ animation: phase === 'hold' ? 'cvKenBurns 3s ease-out forwards' : undefined }}
      >
        <img 
          src={thumbnailUrl} 
          alt={title}
          onLoad={() => setImageLoaded(true)}
          className="w-full h-full object-cover"
          style={{ animation: imageLoaded && phase === 'hold' ? 'cvSlowPan 3s ease-in-out' : undefined }}
        />
      </div>

      {/* Cinematic letterbox bars */}
      <div className={`absolute top-0 left-0 right-0 h-[5%] bg-black transition-all duration-700 ${
        phase === 'hold' ? 'translate-y-0' : '-translate-y-full'
      }`} />
      <div className={`absolute bottom-0 left-0 right-0 h-[5%] bg-black transition-all duration-700 ${
        phase === 'hold' ? 'translate-y-0' : 'translate-y-full'
      }`} />

      {/* Overlay gradients */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/30" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/40" />

      {/* Animated particles */}
      <div className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${phase === 'hold' ? 'opacity-100' : 'opacity-0'}`}>
        {particles.map(particle => (
          <div
            key={particle.id}
            className="absolute rounded-full bg-primary/60"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              width: particle.size * scale,
              height: particle.size * scale,
              animation: `cvFloat ${particle.duration}s ease-in-out ${particle.delay}s infinite alternate`,
            }}
          />
        ))}
      </div>

      {/* Scan line */}
      <div className={`absolute inset-0 pointer-events-none overflow-hidden transition-opacity duration-300 ${phase === 'hold' ? 'opacity-30' : 'opacity-0'}`}>
        <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent" style={{ animation: 'cvScanLine 2s linear infinite' }} />
      </div>

      {/* Glow pulse */}
      <div className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${phase === 'hold' ? 'opacity-100' : 'opacity-0'}`}>
        <div 
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(circle at center, hsl(var(--primary) / 0.15) 0%, transparent 70%)',
            animation: 'cvGlowPulse 1.5s ease-in-out infinite',
          }}
        />
      </div>

      {/* Content — scaled inline */}
      <div className={`absolute inset-0 flex flex-col items-center justify-center text-white z-10 transition-all duration-500 ${
        phase === 'enter' ? 'translate-y-8 opacity-0' : 
        phase === 'hold' ? 'translate-y-0 opacity-100' : 
        '-translate-y-8 opacity-0'
      }`}>
        {/* Event type badge */}
        <div className="relative" style={{ marginBottom: badgeMb }}>
          <div className={`absolute inset-0 blur-xl bg-primary/50 transition-all duration-500 ${phase === 'hold' ? 'scale-150 opacity-100' : 'scale-0 opacity-0'}`} />
          <Badge 
            variant="arena" 
            className="relative uppercase tracking-wider border-primary/50 backdrop-blur-sm transition-all duration-500"
            style={{
              fontSize: badgeFontSize,
              paddingLeft: badgePx,
              paddingRight: badgePx,
              paddingTop: badgePy,
              paddingBottom: badgePy,
              transform: phase === 'hold' ? 'scale(1)' : 'scale(0)',
              animation: phase === 'hold' ? 'cvPopIn 0.4s ease-out' : undefined,
            }}
          >
            {getEventLabelUpper(eventType)}
          </Badge>
        </div>

        {/* Minute */}
        <div 
          className="flex items-center transition-all duration-[600ms]"
          style={{
            gap: minuteGap,
            marginBottom: minuteMb,
            transform: phase === 'hold' ? 'scale(1)' : 'scale(0.5)',
            opacity: phase === 'hold' ? 1 : 0,
            animation: phase === 'hold' ? 'cvSlideUp 0.5s ease-out' : undefined,
          }}
        >
          <Clock style={{ width: clockSize, height: clockSize }} className="text-primary drop-shadow-[0_0_15px_hsl(var(--primary)/0.5)]" />
          <span 
            className="bg-gradient-to-r from-primary via-emerald-400 to-primary bg-clip-text text-transparent drop-shadow-lg font-black"
            style={{
              fontSize: minuteFontSize,
              backgroundSize: '200% 100%',
              animation: phase === 'hold' ? 'cvShimmerText 2s linear infinite' : undefined,
            }}
          >
            {minute}'
          </span>
        </div>

        {/* Teams + score */}
        <div 
          className="flex items-center font-semibold transition-all duration-500"
          style={{
            gap: scoresGap,
            marginBottom: scoresMb,
            fontSize: scoresFontSize,
            transform: phase === 'hold' ? 'translateY(0)' : 'translateY(40px)',
            opacity: phase === 'hold' ? 1 : 0,
          }}
        >
          <span 
            className="truncate text-right"
            style={{
              maxWidth: `${Math.round(80 * scale)}px`,
              animation: phase === 'hold' ? 'cvSlideInLeft 0.6s ease-out' : undefined,
            }}
          >
            {homeTeam}
          </span>
          <div className="relative flex-shrink-0">
            <div className="absolute inset-0 blur-lg bg-primary/40 animate-pulse" />
            <span className="relative font-black text-primary drop-shadow-[0_0_20px_hsl(var(--primary)/0.6)]" style={{ fontSize: scoreFontSize }}>
              {homeScore} - {awayScore}
            </span>
          </div>
          <span 
            className="truncate text-left"
            style={{
              maxWidth: `${Math.round(80 * scale)}px`,
              animation: phase === 'hold' ? 'cvSlideInRight 0.6s ease-out' : undefined,
            }}
          >
            {awayTeam}
          </span>
        </div>

        {/* Title */}
        <p 
          className="text-center text-muted-foreground transition-all duration-500 line-clamp-2"
          style={{
            fontSize: titleFontSize,
            maxWidth: `${Math.round(220 * scale)}px`,
            transform: phase === 'hold' ? 'translateY(0)' : 'translateY(32px)',
            opacity: phase === 'hold' ? 1 : 0,
          }}
        >
          {title}
        </p>
      </div>

      {/* Play icon burst on exit */}
      <div className={`absolute inset-0 flex items-center justify-center pointer-events-none z-20 transition-all duration-300 ${
        phase === 'exit' ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
      }`}>
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full" style={{ margin: `-${playPad}`, animation: 'cvRipple 0.6s ease-out' }} />
          <div className="relative bg-primary rounded-full shadow-[0_0_40px_hsl(var(--primary)/0.8)]" style={{ padding: playPad }}>
            <Play style={{ width: playIconSize, height: playIconSize }} className="text-white fill-white" />
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className={`absolute bottom-[6%] left-0 right-0 bg-white/10 transition-opacity duration-300 ${phase === 'hold' ? 'opacity-100' : 'opacity-0'}`} style={{ height: `${Math.max(2, Math.round(3 * scale))}px` }}>
        <div 
          className="h-full bg-gradient-to-r from-primary via-emerald-400 to-primary"
          style={{ animation: phase === 'hold' ? `cvProgressBar ${duration}ms linear forwards` : undefined }}
        />
      </div>

      {/* Corner decorations */}
      <div className={`absolute transition-all duration-700 ${phase === 'hold' ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} style={{ top: cornerTop, left: cornerOffset, width: cornerSize, height: cornerSize }}>
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary to-transparent" />
        <div className="absolute top-0 left-0 h-full w-0.5 bg-gradient-to-b from-primary to-transparent" />
      </div>
      <div className={`absolute transition-all duration-700 ${phase === 'hold' ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} style={{ top: cornerTop, right: cornerOffset, width: cornerSize, height: cornerSize }}>
        <div className="absolute top-0 right-0 w-full h-0.5 bg-gradient-to-l from-primary to-transparent" />
        <div className="absolute top-0 right-0 h-full w-0.5 bg-gradient-to-b from-primary to-transparent" />
      </div>
      <div className={`absolute transition-all duration-700 ${phase === 'hold' ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} style={{ bottom: cornerTop, left: cornerOffset, width: cornerSize, height: cornerSize }}>
        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary to-transparent" />
        <div className="absolute bottom-0 left-0 h-full w-0.5 bg-gradient-to-t from-primary to-transparent" />
      </div>
      <div className={`absolute transition-all duration-700 ${phase === 'hold' ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} style={{ bottom: cornerTop, right: cornerOffset, width: cornerSize, height: cornerSize }}>
        <div className="absolute bottom-0 right-0 w-full h-0.5 bg-gradient-to-l from-primary to-transparent" />
        <div className="absolute bottom-0 right-0 h-full w-0.5 bg-gradient-to-t from-primary to-transparent" />
      </div>

      <style>{`
        @keyframes cvKenBurns {
          0% { transform: scale(1.25) translate(0, 0); }
          100% { transform: scale(1.1) translate(-2%, -2%); }
        }
        @keyframes cvSlowPan {
          0% { transform: translate(0, 0); }
          100% { transform: translate(-3%, -2%); }
        }
        @keyframes cvScanLine {
          0% { top: -5%; }
          100% { top: 105%; }
        }
        @keyframes cvFloat {
          0% { transform: translateY(0px) rotate(0deg); opacity: 0.6; }
          100% { transform: translateY(-20px) rotate(180deg); opacity: 0.2; }
        }
        @keyframes cvGlowPulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.05); }
        }
        @keyframes cvPopIn {
          0% { transform: scale(0) rotate(-10deg); }
          50% { transform: scale(1.1) rotate(2deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        @keyframes cvSlideUp {
          0% { transform: translateY(30px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes cvSlideInLeft {
          0% { transform: translateX(-50px); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes cvSlideInRight {
          0% { transform: translateX(50px); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes cvShimmerText {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        @keyframes cvRipple {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(2); opacity: 0; }
        }
        @keyframes cvProgressBar {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
}
