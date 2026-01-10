import { cn } from '@/lib/utils';

interface DeviceMockupProps {
  format: '9:16' | '16:9' | '1:1' | '4:5';
  size?: 'sm' | 'md' | 'lg';
  platform?: string;
  children: React.ReactNode;
  className?: string;
}

// Device frame styles for each format and size
const deviceConfigs = {
  '9:16': {
    device: 'phone',
    frameClass: {
      sm: 'w-[160px] h-[320px]',
      md: 'w-[220px] h-[460px]',
      lg: 'w-[280px] h-[580px] md:w-[320px] md:h-[660px]',
    },
    screenClass: 'rounded-[24px]',
    homeIndicator: true,
  },
  '4:5': {
    device: 'phone',
    frameClass: {
      sm: 'w-[200px] h-[260px]',
      md: 'w-[280px] h-[360px]',
      lg: 'w-[320px] h-[420px] md:w-[380px] md:h-[500px]',
    },
    screenClass: 'rounded-[24px]',
    homeIndicator: true,
  },
  '1:1': {
    device: 'tablet',
    frameClass: {
      sm: 'w-[260px] h-[280px]',
      md: 'w-[340px] h-[360px]',
      lg: 'w-[400px] h-[440px] md:w-[480px] md:h-[520px]',
    },
    screenClass: 'rounded-[20px]',
    homeIndicator: false,
  },
  '16:9': {
    device: 'desktop',
    frameClass: {
      sm: 'w-[360px] h-[230px]',
      md: 'w-[520px] h-[320px]',
      lg: 'w-[640px] h-[420px] md:w-[800px] md:h-[500px]',
    },
    screenClass: 'rounded-t-lg',
    homeIndicator: false,
  },
};

export function DeviceMockup({ format, size = 'lg', platform, children, className }: DeviceMockupProps) {
  const config = deviceConfigs[format];
  const frameClass = config.frameClass[size];
  const isSmall = size === 'sm';
  const isMedium = size === 'md';
  
  return (
    <div className={cn("flex items-center justify-center", className)}>
      {config.device === 'phone' && (
        <div className={cn(
          "relative bg-gray-900 shadow-2xl border-gray-800",
          isSmall ? "rounded-[24px] p-1 border-2" : isMedium ? "rounded-[32px] p-1.5 border-3" : "rounded-[40px] p-2 border-4",
          frameClass
        )}>
          {/* Phone frame - Dynamic Island style notch */}
          <div className={cn(
            "absolute top-0 left-1/2 -translate-x-1/2 bg-black rounded-b-xl z-30 flex items-center justify-center gap-1",
            isSmall ? "w-1/3 h-4" : isMedium ? "w-1/3 h-5" : "w-1/3 h-7"
          )}>
            {!isSmall && (
              <>
                <div className={cn("rounded-full bg-gray-700", isSmall ? "w-1 h-1" : "w-2 h-2")} />
                <div className={cn("rounded-full bg-gray-800", isSmall ? "w-6 h-1.5" : isMedium ? "w-8 h-2" : "w-12 h-3")} />
              </>
            )}
          </div>
          
          {/* Screen */}
          <div className={cn(
            "relative w-full h-full bg-black overflow-hidden",
            isSmall ? "rounded-[18px]" : isMedium ? "rounded-[22px]" : config.screenClass
          )}>
            {/* Content - takes full screen */}
            <div className="absolute inset-0 z-10">
              {children}
            </div>
          </div>
          
          {/* Home indicator */}
          {config.homeIndicator && (
            <div className={cn(
              "absolute left-1/2 -translate-x-1/2 bg-white/50 rounded-full z-40",
              isSmall ? "bottom-0.5 w-1/4 h-0.5" : isMedium ? "bottom-1 w-1/4 h-0.5" : "bottom-1 w-1/3 h-1"
            )} />
          )}
          
          {/* Side buttons - only show on medium and large */}
          {!isSmall && (
            <>
              <div className={cn("absolute -left-0.5 bg-gray-700 rounded-l", isSmall ? "top-16 w-0.5 h-4" : isMedium ? "top-20 w-0.5 h-6" : "top-24 w-1 h-8")} />
              <div className={cn("absolute -left-0.5 bg-gray-700 rounded-l", isSmall ? "top-24 w-0.5 h-6" : isMedium ? "top-28 w-0.5 h-8" : "top-36 w-1 h-12")} />
              <div className={cn("absolute -right-0.5 bg-gray-700 rounded-r", isSmall ? "top-20 w-0.5 h-8" : isMedium ? "top-24 w-0.5 h-10" : "top-32 w-1 h-16")} />
            </>
          )}
        </div>
      )}
      
      {config.device === 'tablet' && (
        <div className={cn(
          "relative bg-gray-900 shadow-2xl border-gray-800",
          isSmall ? "rounded-[16px] p-1.5 border-2" : isMedium ? "rounded-[20px] p-2 border-3" : "rounded-[24px] p-3 border-4",
          frameClass
        )}>
          {/* Camera */}
          <div className={cn(
            "absolute left-1/2 -translate-x-1/2 rounded-full bg-gray-700 z-30",
            isSmall ? "top-1.5 w-1.5 h-1.5" : "top-3 w-2 h-2"
          )} />
          
          {/* Screen */}
          <div className={cn(
            "relative w-full h-full bg-black overflow-hidden",
            isSmall ? "rounded-md" : "rounded-lg"
          )}>
            <div className="absolute inset-0">
              {children}
            </div>
          </div>
          
          {/* Home button - only show on large */}
          {!isSmall && !isMedium && (
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full border-2 border-gray-700" />
          )}
        </div>
      )}
      
      {config.device === 'desktop' && (
        <div className="flex flex-col items-center">
          {/* Monitor */}
          <div className={cn(
            "relative bg-gray-900 shadow-2xl border-gray-800",
            isSmall ? "rounded-md p-1 border-2" : isMedium ? "rounded-lg p-1.5 border-3" : "rounded-lg p-2 border-4",
            frameClass
          )}>
            {/* Screen */}
            <div className={cn(
              "relative w-full h-full bg-black overflow-hidden",
              isSmall ? "rounded-sm" : "rounded"
            )}>
              <div className="absolute inset-0">
                {children}
              </div>
            </div>
            
            {/* Webcam */}
            <div className={cn(
              "absolute left-1/2 -translate-x-1/2 rounded-full bg-gray-700",
              isSmall ? "top-0.5 w-1 h-1" : "top-1 w-2 h-2"
            )} />
          </div>
          
          {/* Stand - scaled by size */}
          <div className={cn(
            "bg-gradient-to-b from-gray-800 to-gray-900",
            isSmall ? "w-12 h-3" : isMedium ? "w-16 h-4" : "w-24 h-6"
          )} />
          <div className={cn(
            "bg-gray-800 rounded-lg",
            isSmall ? "w-20 h-1.5" : isMedium ? "w-28 h-2" : "w-40 h-3"
          )} />
        </div>
      )}
    </div>
  );
}
