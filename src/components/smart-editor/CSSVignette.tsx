import { useEffect, useState } from 'react';

export type VignetteType = 'opening' | 'transition' | 'closing';

interface CSSVignetteProps {
  type: VignetteType;
  text: string;
  channelName?: string;
  duration?: number; // seconds
  onComplete?: () => void;
  isPlaying?: boolean;
}

export const CSSVignette = ({
  type,
  text,
  channelName = 'Arena Play',
  duration = 3,
  onComplete,
  isPlaying = true
}: CSSVignetteProps) => {
  const [phase, setPhase] = useState<'enter' | 'hold' | 'exit'>('enter');

  useEffect(() => {
    if (!isPlaying) return;

    const enterTime = 600;
    const holdTime = (duration * 1000) - 1200;
    const exitTime = 600;

    const enterTimer = setTimeout(() => setPhase('hold'), enterTime);
    const exitTimer = setTimeout(() => setPhase('exit'), enterTime + holdTime);
    const completeTimer = setTimeout(() => {
      onComplete?.();
    }, enterTime + holdTime + exitTime);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [duration, onComplete, isPlaying]);

  const getBackgroundStyle = () => {
    switch (type) {
      case 'opening':
        return 'bg-gradient-to-br from-arena-green via-emerald-600 to-teal-700';
      case 'transition':
        return 'bg-gradient-to-r from-slate-900 via-arena-green/30 to-slate-900';
      case 'closing':
        return 'bg-gradient-to-tl from-arena-green via-cyan-600 to-slate-900';
      default:
        return 'bg-gradient-to-br from-arena-green to-emerald-700';
    }
  };

  return (
    <div className={`relative w-full aspect-video overflow-hidden ${getBackgroundStyle()}`}>
      {/* Animated Grid Background */}
      <div className="absolute inset-0 opacity-20">
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
            animation: 'gridMove 20s linear infinite'
          }}
        />
      </div>

      {/* Radial Glow */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.4) 0%, transparent 60%)',
          animation: 'pulseGlow 2s ease-in-out infinite'
        }}
      />

      {/* Floating Particles */}
      {[...Array(20)].map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 bg-white/40 rounded-full"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animation: `floatParticle ${3 + Math.random() * 4}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 2}s`
          }}
        />
      ))}

      {/* Scan Lines */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-10"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)'
        }}
      />

      {/* Content Container */}
      <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
        {/* Channel Name (Opening/Closing) */}
        {(type === 'opening' || type === 'closing') && (
          <div
            className={`text-sm md:text-base font-medium text-white/70 tracking-[0.3em] uppercase mb-4 transition-all duration-500 ${
              phase === 'enter' ? 'opacity-0 -translate-y-4' :
              phase === 'exit' ? 'opacity-0 translate-y-4' : 'opacity-100'
            }`}
            style={{ transitionDelay: '100ms' }}
          >
            {channelName}
          </div>
        )}

        {/* Main Text */}
        <div
          className={`text-2xl md:text-5xl lg:text-6xl font-bold text-white text-center transition-all duration-700 ${
            phase === 'enter' ? 'opacity-0 scale-90' :
            phase === 'exit' ? 'opacity-0 scale-110' : 'opacity-100 scale-100'
          }`}
          style={{
            textShadow: '0 0 40px rgba(16, 185, 129, 0.8), 0 0 80px rgba(16, 185, 129, 0.4)',
            fontFamily: 'Orbitron, sans-serif'
          }}
        >
          {text}
        </div>

        {/* Decorative Line */}
        <div
          className={`mt-6 h-0.5 bg-gradient-to-r from-transparent via-white to-transparent transition-all duration-700 ${
            phase === 'enter' ? 'w-0 opacity-0' :
            phase === 'exit' ? 'w-0 opacity-0' : 'w-48 md:w-64 opacity-100'
          }`}
          style={{ transitionDelay: '200ms' }}
        />

        {/* Subtitle (Opening only) */}
        {type === 'opening' && (
          <div
            className={`mt-4 text-xs md:text-sm text-white/60 tracking-wider transition-all duration-500 ${
              phase === 'enter' ? 'opacity-0 translate-y-4' :
              phase === 'exit' ? 'opacity-0 -translate-y-4' : 'opacity-100'
            }`}
            style={{ transitionDelay: '300ms' }}
          >
            Conteúdo inteligente gerado por IA
          </div>
        )}
      </div>

      {/* Corner Decorations */}
      <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-white/30" 
        style={{ animation: 'cornerPulse 2s ease-in-out infinite' }} />
      <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-white/30"
        style={{ animation: 'cornerPulse 2s ease-in-out infinite', animationDelay: '0.5s' }} />
      <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-white/30"
        style={{ animation: 'cornerPulse 2s ease-in-out infinite', animationDelay: '1s' }} />
      <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-white/30"
        style={{ animation: 'cornerPulse 2s ease-in-out infinite', animationDelay: '1.5s' }} />

      {/* Vignette Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20 pointer-events-none" />

      {/* CSS Animations */}
      <style>{`
        @keyframes gridMove {
          0% { transform: translate(0, 0); }
          100% { transform: translate(40px, 40px); }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        @keyframes floatParticle {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0.4; }
          50% { transform: translateY(-20px) translateX(10px); opacity: 0.8; }
        }
        @keyframes cornerPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
};

export default CSSVignette;
