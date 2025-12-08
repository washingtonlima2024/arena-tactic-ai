import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Clock, Play } from 'lucide-react';

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
  duration = 4000
}: ClipVignetteProps) {
  const [phase, setPhase] = useState<'enter' | 'hold' | 'exit'>('enter');
  const [countdown, setCountdown] = useState(Math.ceil(duration / 1000));

  useEffect(() => {
    // Enter phase (1s)
    const enterTimer = setTimeout(() => {
      setPhase('hold');
    }, 800);

    // Countdown
    const countdownInterval = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);

    // Exit phase
    const exitTimer = setTimeout(() => {
      setPhase('exit');
    }, duration - 500);

    // Complete
    const completeTimer = setTimeout(() => {
      onComplete();
    }, duration);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
      clearInterval(countdownInterval);
    };
  }, [duration, onComplete]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* Background with zoom effect */}
      <div 
        className={`absolute inset-0 transition-all duration-1000 ease-out ${
          phase === 'enter' ? 'scale-110 opacity-0' : 
          phase === 'hold' ? 'scale-100 opacity-100' : 
          'scale-95 opacity-0'
        }`}
      >
        <img 
          src={thumbnailUrl} 
          alt={title}
          className="w-full h-full object-cover"
        />
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
      </div>

      {/* Animated glow effect */}
      <div 
        className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${
          phase === 'hold' ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-transparent to-primary/20 animate-pulse" />
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent animate-[shimmer_2s_ease-in-out_infinite]" />
      </div>

      {/* Content */}
      <div 
        className={`absolute inset-0 flex flex-col items-center justify-center text-white transition-all duration-700 ${
          phase === 'enter' ? 'translate-y-10 opacity-0' : 
          phase === 'hold' ? 'translate-y-0 opacity-100' : 
          '-translate-y-10 opacity-0'
        }`}
      >
        {/* Event type badge */}
        <Badge 
          variant="arena" 
          className={`mb-4 text-lg px-6 py-2 uppercase tracking-widest transition-all duration-500 delay-200 ${
            phase === 'hold' ? 'scale-100' : 'scale-0'
          }`}
        >
          {eventType.replace(/_/g, ' ')}
        </Badge>

        {/* Minute */}
        <div 
          className={`flex items-center gap-2 text-6xl font-bold mb-6 transition-all duration-500 delay-300 ${
            phase === 'hold' ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
          }`}
        >
          <Clock className="h-12 w-12 text-primary" />
          <span className="bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">
            {minute}'
          </span>
        </div>

        {/* Teams score */}
        <div 
          className={`flex items-center gap-6 text-2xl font-semibold mb-4 transition-all duration-500 delay-400 ${
            phase === 'hold' ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
          }`}
        >
          <span>{homeTeam}</span>
          <span className="text-4xl font-bold text-primary">
            {homeScore} - {awayScore}
          </span>
          <span>{awayTeam}</span>
        </div>

        {/* Title */}
        <p 
          className={`text-lg text-muted-foreground max-w-md text-center px-4 transition-all duration-500 delay-500 ${
            phase === 'hold' ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
          }`}
        >
          {title}
        </p>
      </div>

      {/* Play icon pulse */}
      <div 
        className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-all duration-300 ${
          phase === 'exit' ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
        }`}
      >
        <div className="relative">
          <div className="absolute inset-0 bg-primary/30 rounded-full animate-ping" />
          <div className="relative bg-primary/80 p-6 rounded-full">
            <Play className="h-12 w-12 text-white fill-white" />
          </div>
        </div>
      </div>

      {/* Countdown indicator */}
      <div 
        className={`absolute bottom-6 right-6 transition-all duration-300 ${
          phase === 'hold' ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="relative h-8 w-8">
            <svg className="h-8 w-8 -rotate-90">
              <circle
                cx="16"
                cy="16"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-muted"
              />
              <circle
                cx="16"
                cy="16"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={88}
                strokeDashoffset={88 * (countdown / Math.ceil(duration / 1000))}
                className="text-primary transition-all duration-1000"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
              {countdown}
            </span>
          </div>
          <span>Iniciando...</span>
        </div>
      </div>

      {/* Corner decorations */}
      <div className={`absolute top-4 left-4 w-16 h-16 border-l-2 border-t-2 border-primary/50 transition-all duration-500 ${
        phase === 'hold' ? 'opacity-100' : 'opacity-0'
      }`} />
      <div className={`absolute top-4 right-4 w-16 h-16 border-r-2 border-t-2 border-primary/50 transition-all duration-500 ${
        phase === 'hold' ? 'opacity-100' : 'opacity-0'
      }`} />
      <div className={`absolute bottom-4 left-4 w-16 h-16 border-l-2 border-b-2 border-primary/50 transition-all duration-500 ${
        phase === 'hold' ? 'opacity-100' : 'opacity-0'
      }`} />
      <div className={`absolute bottom-4 right-4 w-16 h-16 border-r-2 border-b-2 border-primary/50 transition-all duration-500 ${
        phase === 'hold' ? 'opacity-100' : 'opacity-0'
      }`} />
    </div>
  );
}
