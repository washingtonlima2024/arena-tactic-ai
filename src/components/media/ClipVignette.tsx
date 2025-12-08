import { useState, useEffect, useMemo, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Clock, Play } from 'lucide-react';
import { useVignetteAudio } from '@/hooks/useVignetteAudio';

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

// Play whoosh/swoosh sound using Web Audio API
const playSwooshSound = async () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Resume if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    
    // Create multiple oscillators for richer swoosh sound
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    
    osc1.type = 'sine';
    osc2.type = 'triangle';
    
    // Frequency sweep for swoosh effect
    osc1.frequency.setValueAtTime(800, audioContext.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.2);
    
    osc2.frequency.setValueAtTime(600, audioContext.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.25);
    
    // Create noise for texture
    const bufferSize = audioContext.sampleRate * 0.3;
    const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * 0.3;
    }
    
    const noise = audioContext.createBufferSource();
    noise.buffer = noiseBuffer;
    
    // Filter for the noise
    const filter = audioContext.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2000, audioContext.currentTime);
    filter.frequency.exponentialRampToValueAtTime(500, audioContext.currentTime + 0.2);
    
    // Gain envelopes
    const gain1 = audioContext.createGain();
    const gain2 = audioContext.createGain();
    const noiseGain = audioContext.createGain();
    const masterGain = audioContext.createGain();
    
    gain1.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);
    
    gain2.gain.setValueAtTime(0.2, audioContext.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    noiseGain.gain.setValueAtTime(0.15, audioContext.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    
    masterGain.gain.value = 0.8;
    
    // Connect
    osc1.connect(gain1);
    osc2.connect(gain2);
    noise.connect(filter);
    filter.connect(noiseGain);
    
    gain1.connect(masterGain);
    gain2.connect(masterGain);
    noiseGain.connect(masterGain);
    masterGain.connect(audioContext.destination);
    
    // Play
    osc1.start();
    osc2.start();
    noise.start();
    
    osc1.stop(audioContext.currentTime + 0.3);
    osc2.stop(audioContext.currentTime + 0.35);
    noise.stop(audioContext.currentTime + 0.3);
    
    setTimeout(() => audioContext.close(), 500);
    console.log('[ClipVignette] Swoosh sound played');
  } catch (e) {
    console.log('[ClipVignette] Swoosh audio not available:', e);
  }
};

// Play dramatic impact sound
const playImpactSound = async () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    
    // Low bass hit
    const osc1 = audioContext.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(120, audioContext.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(30, audioContext.currentTime + 0.15);
    
    // Mid punch
    const osc2 = audioContext.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(200, audioContext.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.1);
    
    // Click/attack transient
    const osc3 = audioContext.createOscillator();
    osc3.type = 'square';
    osc3.frequency.setValueAtTime(1000, audioContext.currentTime);
    osc3.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.02);
    
    // Gains
    const gain1 = audioContext.createGain();
    const gain2 = audioContext.createGain();
    const gain3 = audioContext.createGain();
    const masterGain = audioContext.createGain();
    
    gain1.gain.setValueAtTime(0.5, audioContext.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    
    gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
    
    gain3.gain.setValueAtTime(0.15, audioContext.currentTime);
    gain3.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.03);
    
    masterGain.gain.value = 0.9;
    
    osc1.connect(gain1);
    osc2.connect(gain2);
    osc3.connect(gain3);
    
    gain1.connect(masterGain);
    gain2.connect(masterGain);
    gain3.connect(masterGain);
    masterGain.connect(audioContext.destination);
    
    osc1.start();
    osc2.start();
    osc3.start();
    
    osc1.stop(audioContext.currentTime + 0.25);
    osc2.stop(audioContext.currentTime + 0.2);
    osc3.stop(audioContext.currentTime + 0.05);
    
    setTimeout(() => audioContext.close(), 400);
    console.log('[ClipVignette] Impact sound played');
  } catch (e) {
    console.log('[ClipVignette] Impact audio not available:', e);
  }
};

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
  const [countdown, setCountdown] = useState(Math.ceil(duration / 1000));
  const [imageLoaded, setImageLoaded] = useState(false);
  
  const particles = useMemo(() => generateParticles(20), []);
  const { playSwoosh, playImpact, initAudio } = useVignetteAudio();
  const soundPlayedRef = useRef({ enter: false, exit: false });

  useEffect(() => {
    // Initialize and play swoosh on mount
    const playEnterSound = async () => {
      if (!soundPlayedRef.current.enter) {
        await initAudio();
        await playSwoosh();
        soundPlayedRef.current.enter = true;
      }
    };
    playEnterSound();

    // Enter phase (0.5s)
    const enterTimer = setTimeout(() => {
      setPhase('hold');
    }, 500);

    // Countdown
    const countdownInterval = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);

    // Exit phase
    const exitTimer = setTimeout(() => {
      setPhase('exit');
      // Play impact sound on exit
      if (!soundPlayedRef.current.exit) {
        playImpact();
        soundPlayedRef.current.exit = true;
      }
    }, duration - 400);

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
  }, [duration, onComplete, playSwoosh, playImpact, initAudio]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* Ken Burns effect on thumbnail - zoom and pan */}
      <div 
        className={`absolute inset-0 transition-all ease-out ${
          phase === 'enter' 
            ? 'scale-125 opacity-0 blur-sm duration-500' 
            : phase === 'hold' 
            ? 'scale-110 opacity-100 blur-0 duration-[2500ms]' 
            : 'scale-100 opacity-0 blur-md duration-400'
        }`}
        style={{
          animation: phase === 'hold' ? 'kenBurns 3s ease-out forwards' : undefined,
        }}
      >
        <img 
          src={thumbnailUrl} 
          alt={title}
          onLoad={() => setImageLoaded(true)}
          className="w-full h-full object-cover"
          style={{
            animation: imageLoaded && phase === 'hold' ? 'slowPan 3s ease-in-out' : undefined,
          }}
        />
      </div>

      {/* Cinematic letterbox bars */}
      <div className={`absolute top-0 left-0 right-0 h-[10%] bg-black transition-all duration-700 ${
        phase === 'hold' ? 'translate-y-0' : '-translate-y-full'
      }`} />
      <div className={`absolute bottom-0 left-0 right-0 h-[10%] bg-black transition-all duration-700 ${
        phase === 'hold' ? 'translate-y-0' : 'translate-y-full'
      }`} />

      {/* Overlay gradients */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/30" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/40" />

      {/* Animated particles */}
      <div className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${
        phase === 'hold' ? 'opacity-100' : 'opacity-0'
      }`}>
        {particles.map(particle => (
          <div
            key={particle.id}
            className="absolute rounded-full bg-primary/60"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              width: particle.size,
              height: particle.size,
              animation: `float ${particle.duration}s ease-in-out ${particle.delay}s infinite alternate`,
            }}
          />
        ))}
      </div>

      {/* Animated scan line effect */}
      <div 
        className={`absolute inset-0 pointer-events-none overflow-hidden transition-opacity duration-300 ${
          phase === 'hold' ? 'opacity-30' : 'opacity-0'
        }`}
      >
        <div 
          className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent"
          style={{
            animation: 'scanLine 2s linear infinite',
          }}
        />
      </div>

      {/* Glow pulse effect */}
      <div 
        className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${
          phase === 'hold' ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div 
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(circle at center, hsl(var(--primary) / 0.15) 0%, transparent 70%)',
            animation: 'glowPulse 1.5s ease-in-out infinite',
          }}
        />
      </div>

      {/* Content with staggered animations */}
      <div 
        className={`absolute inset-0 flex flex-col items-center justify-center text-white z-10 transition-all duration-500 ${
          phase === 'enter' ? 'translate-y-8 opacity-0' : 
          phase === 'hold' ? 'translate-y-0 opacity-100' : 
          '-translate-y-8 opacity-0'
        }`}
      >
        {/* Event type badge with glow */}
        <div className="relative">
          <div 
            className={`absolute inset-0 blur-xl bg-primary/50 transition-all duration-500 ${
              phase === 'hold' ? 'scale-150 opacity-100' : 'scale-0 opacity-0'
            }`}
          />
          <Badge 
            variant="arena" 
            className={`relative mb-4 text-lg px-6 py-2 uppercase tracking-widest border-primary/50 backdrop-blur-sm transition-all duration-500 ${
              phase === 'hold' ? 'scale-100' : 'scale-0'
            }`}
            style={{
              animationDelay: '0.1s',
              animation: phase === 'hold' ? 'popIn 0.4s ease-out' : undefined,
            }}
          >
            {eventType.replace(/_/g, ' ')}
          </Badge>
        </div>

        {/* Minute with dramatic reveal */}
        <div 
          className={`flex items-center gap-3 text-7xl font-black mb-6 transition-all duration-600 ${
            phase === 'hold' ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
          }`}
          style={{
            animationDelay: '0.2s',
            animation: phase === 'hold' ? 'slideUp 0.5s ease-out' : undefined,
          }}
        >
          <Clock className="h-14 w-14 text-primary drop-shadow-[0_0_15px_hsl(var(--primary)/0.5)]" />
          <span 
            className="bg-gradient-to-r from-primary via-emerald-400 to-primary bg-clip-text text-transparent drop-shadow-lg"
            style={{
              backgroundSize: '200% 100%',
              animation: phase === 'hold' ? 'shimmerText 2s linear infinite' : undefined,
            }}
          >
            {minute}'
          </span>
        </div>

        {/* Teams score with slide-in effect */}
        <div 
          className={`flex items-center gap-8 text-2xl font-semibold mb-4 transition-all duration-500 ${
            phase === 'hold' ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
          }`}
          style={{
            animationDelay: '0.3s',
          }}
        >
          <span 
            className="transition-transform duration-500"
            style={{
              animation: phase === 'hold' ? 'slideInLeft 0.6s ease-out' : undefined,
            }}
          >
            {homeTeam}
          </span>
          <div className="relative">
            <div className="absolute inset-0 blur-lg bg-primary/40 animate-pulse" />
            <span className="relative text-5xl font-black text-primary drop-shadow-[0_0_20px_hsl(var(--primary)/0.6)]">
              {homeScore} - {awayScore}
            </span>
          </div>
          <span 
            className="transition-transform duration-500"
            style={{
              animation: phase === 'hold' ? 'slideInRight 0.6s ease-out' : undefined,
            }}
          >
            {awayTeam}
          </span>
        </div>

        {/* Title with typewriter-like reveal */}
        <p 
          className={`text-lg text-muted-foreground max-w-lg text-center px-4 transition-all duration-500 ${
            phase === 'hold' ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
          style={{
            animationDelay: '0.4s',
          }}
        >
          {title}
        </p>
      </div>

      {/* Play icon burst animation */}
      <div 
        className={`absolute inset-0 flex items-center justify-center pointer-events-none z-20 transition-all duration-300 ${
          phase === 'exit' ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
        }`}
      >
        <div className="relative">
          {/* Multiple ripple rings */}
          <div className="absolute inset-0 -m-8 bg-primary/20 rounded-full animate-[ripple_0.6s_ease-out]" />
          <div className="absolute inset-0 -m-4 bg-primary/30 rounded-full animate-[ripple_0.4s_ease-out]" />
          <div className="relative bg-primary p-8 rounded-full shadow-[0_0_40px_hsl(var(--primary)/0.8)]">
            <Play className="h-16 w-16 text-white fill-white" />
          </div>
        </div>
      </div>

      {/* Progress bar at bottom */}
      <div 
        className={`absolute bottom-[10%] left-0 right-0 h-1 bg-white/10 transition-opacity duration-300 ${
          phase === 'hold' ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div 
          className="h-full bg-gradient-to-r from-primary via-emerald-400 to-primary"
          style={{
            animation: phase === 'hold' ? `progressBar ${duration}ms linear forwards` : undefined,
          }}
        />
      </div>

      {/* Corner decorations with animation */}
      <div className={`absolute top-[12%] left-4 w-20 h-20 transition-all duration-700 ${
        phase === 'hold' ? 'opacity-100 scale-100' : 'opacity-0 scale-0'
      }`}>
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary to-transparent" />
        <div className="absolute top-0 left-0 h-full w-0.5 bg-gradient-to-b from-primary to-transparent" />
      </div>
      <div className={`absolute top-[12%] right-4 w-20 h-20 transition-all duration-700 ${
        phase === 'hold' ? 'opacity-100 scale-100' : 'opacity-0 scale-0'
      }`}>
        <div className="absolute top-0 right-0 w-full h-0.5 bg-gradient-to-l from-primary to-transparent" />
        <div className="absolute top-0 right-0 h-full w-0.5 bg-gradient-to-b from-primary to-transparent" />
      </div>
      <div className={`absolute bottom-[12%] left-4 w-20 h-20 transition-all duration-700 ${
        phase === 'hold' ? 'opacity-100 scale-100' : 'opacity-0 scale-0'
      }`}>
        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary to-transparent" />
        <div className="absolute bottom-0 left-0 h-full w-0.5 bg-gradient-to-t from-primary to-transparent" />
      </div>
      <div className={`absolute bottom-[12%] right-4 w-20 h-20 transition-all duration-700 ${
        phase === 'hold' ? 'opacity-100 scale-100' : 'opacity-0 scale-0'
      }`}>
        <div className="absolute bottom-0 right-0 w-full h-0.5 bg-gradient-to-l from-primary to-transparent" />
        <div className="absolute bottom-0 right-0 h-full w-0.5 bg-gradient-to-t from-primary to-transparent" />
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes kenBurns {
          0% { transform: scale(1.25) translate(0, 0); }
          100% { transform: scale(1.1) translate(-2%, -2%); }
        }
        
        @keyframes slowPan {
          0% { transform: translate(0, 0); }
          100% { transform: translate(-3%, -2%); }
        }
        
        @keyframes scanLine {
          0% { top: -5%; }
          100% { top: 105%; }
        }
        
        @keyframes float {
          0% { transform: translateY(0px) rotate(0deg); opacity: 0.6; }
          100% { transform: translateY(-20px) rotate(180deg); opacity: 0.2; }
        }
        
        @keyframes glowPulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.05); }
        }
        
        @keyframes popIn {
          0% { transform: scale(0) rotate(-10deg); }
          50% { transform: scale(1.1) rotate(2deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        
        @keyframes slideUp {
          0% { transform: translateY(30px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        
        @keyframes slideInLeft {
          0% { transform: translateX(-50px); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        
        @keyframes slideInRight {
          0% { transform: translateX(50px); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        
        @keyframes shimmerText {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        
        @keyframes ripple {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(2); opacity: 0; }
        }
        
        @keyframes progressBar {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
}
