import { cn } from '@/lib/utils';

interface SoccerBallLoaderProps {
  message?: string;
  progress?: number;
  showProgress?: boolean;
  className?: string;
}

export function SoccerBallLoader({
  message = 'Carregando...',
  progress,
  showProgress = true,
  className
}: SoccerBallLoaderProps) {
  return (
    <div className={cn(
      "relative flex flex-col items-center justify-center min-h-[200px] py-6 w-full overflow-hidden",
      className
    )}>
      {/* Grid Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-primary/10">
        <div 
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `
              linear-gradient(hsl(var(--primary)/0.3) 1px, transparent 1px),
              linear-gradient(90deg, hsl(var(--primary)/0.3) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px'
          }}
        />
      </div>

      {/* Radial Glow */}
      <div className="absolute inset-0 bg-gradient-radial from-primary/20 via-transparent to-transparent" />

      {/* Soccer Ball Container */}
      <div className="relative z-10 mb-4">
        {/* Glow Effect */}
        <div className="absolute inset-0 blur-xl bg-primary/30 animate-pulse rounded-full scale-125" />
        
        {/* Shadow on ground */}
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-12 h-3 bg-black/30 rounded-full blur-md animate-ball-shadow" />
        
        {/* Ball */}
        <div className="relative animate-ball-bounce">
          <svg
            viewBox="0 0 100 100"
            className="w-16 h-16 drop-shadow-xl animate-ball-spin"
            style={{
              filter: 'drop-shadow(0 0 15px hsl(var(--primary)/0.5))'
            }}
          >
            {/* Ball base */}
            <defs>
              <radialGradient id="ballGradient" cx="30%" cy="30%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="50%" stopColor="#f0f0f0" />
                <stop offset="100%" stopColor="#d0d0d0" />
              </radialGradient>
              <radialGradient id="pentagonGradient" cx="50%" cy="50%">
                <stop offset="0%" stopColor="#333333" />
                <stop offset="100%" stopColor="#1a1a1a" />
              </radialGradient>
            </defs>
            
            {/* Main circle */}
            <circle cx="50" cy="50" r="48" fill="url(#ballGradient)" stroke="#ccc" strokeWidth="1" />
            
            {/* Pentagon patterns */}
            <polygon 
              points="50,20 62,32 58,48 42,48 38,32" 
              fill="url(#pentagonGradient)"
            />
            <polygon 
              points="25,40 30,28 42,32 42,48 30,52" 
              fill="url(#pentagonGradient)"
            />
            <polygon 
              points="75,40 70,28 58,32 58,48 70,52" 
              fill="url(#pentagonGradient)"
            />
            <polygon 
              points="35,65 42,52 58,52 65,65 50,75" 
              fill="url(#pentagonGradient)"
            />
            <polygon 
              points="20,55 30,52 35,65 28,78 18,68" 
              fill="url(#pentagonGradient)"
            />
            <polygon 
              points="80,55 70,52 65,65 72,78 82,68" 
              fill="url(#pentagonGradient)"
            />
            
            {/* Highlight */}
            <ellipse cx="35" cy="35" rx="12" ry="8" fill="white" opacity="0.4" />
          </svg>
        </div>
      </div>

      {/* Loading Text */}
      <div className="relative z-10 text-center">
        <h3 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
          {message}
          <span className="flex gap-1">
            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        </h3>
        
        {/* Progress Bar */}
        {showProgress && progress !== undefined && (
          <div className="mt-3 w-48 mx-auto">
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-300 relative"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{Math.round(progress)}% completo</p>
          </div>
        )}
      </div>

      {/* Floating Particles - reduced */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-primary rounded-full animate-float-particle"
            style={{
              left: `${25 + i * 15}%`,
              top: `${30 + (i % 2) * 30}%`,
              animationDelay: `${i * 0.5}s`,
              opacity: 0.5
            }}
          />
        ))}
      </div>
    </div>
  );
}
