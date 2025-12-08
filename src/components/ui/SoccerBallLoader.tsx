import { cn } from '@/lib/utils';
import soccerBallImg from '@/assets/soccer-ball.png';

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
        
        {/* Ball Image */}
        <div className="relative animate-ball-bounce">
          <img 
            src={soccerBallImg} 
            alt="Soccer Ball" 
            className="w-16 h-16 animate-ball-spin drop-shadow-xl"
            style={{
              filter: 'drop-shadow(0 0 15px hsl(var(--primary)/0.5))'
            }}
          />
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
