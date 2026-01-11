import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';

interface DeviceMockupProps {
  format: '9:16' | '16:9' | '1:1' | '4:5';
  size?: 'sm' | 'md' | 'lg';
  platform?: string;
  children: React.ReactNode;
  className?: string;
  allowRotation?: boolean;
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
    rotatedFrameClass: {
      sm: 'w-[320px] h-[160px]',
      md: 'w-[460px] h-[220px]',
      lg: 'w-[580px] h-[280px] md:w-[660px] md:h-[320px]',
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
    rotatedFrameClass: {
      sm: 'w-[260px] h-[200px]',
      md: 'w-[360px] h-[280px]',
      lg: 'w-[420px] h-[320px] md:w-[500px] md:h-[380px]',
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
    rotatedFrameClass: {
      sm: 'w-[280px] h-[260px]',
      md: 'w-[360px] h-[340px]',
      lg: 'w-[440px] h-[400px] md:w-[520px] md:h-[480px]',
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
    rotatedFrameClass: {
      sm: 'w-[230px] h-[360px]',
      md: 'w-[320px] h-[520px]',
      lg: 'w-[420px] h-[640px] md:w-[500px] md:h-[800px]',
    },
    screenClass: 'rounded-t-lg',
    homeIndicator: false,
  },
};

export function DeviceMockup({ format, size = 'lg', platform, children, className, allowRotation = false }: DeviceMockupProps) {
  const [isRotated, setIsRotated] = useState(false);
  const config = deviceConfigs[format];
  const frameClass = isRotated 
    ? config.rotatedFrameClass[size] 
    : config.frameClass[size];
  const isSmall = size === 'sm';
  const isMedium = size === 'md';
  
  // Only allow rotation for phone formats
  const canRotate = allowRotation && (format === '9:16' || format === '4:5');
  
  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {/* Rotation Button */}
      {canRotate && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsRotated(!isRotated)}
          className="gap-2"
        >
          <RotateCcw className={cn("h-4 w-4 transition-transform", isRotated && "rotate-90")} />
          {isRotated ? 'Retrato' : 'Paisagem'}
        </Button>
      )}
      
      <div className="flex items-center justify-center">
        {config.device === 'phone' && (
          <div className={cn(
            "relative bg-gray-900 shadow-2xl border-gray-800 transition-all duration-300",
            isSmall ? "rounded-[24px] p-1 border-2" : isMedium ? "rounded-[32px] p-1.5 border-3" : "rounded-[40px] p-2 border-4",
            frameClass
          )}>
            {/* Phone frame - Dynamic Island style notch */}
            {!isRotated ? (
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
            ) : (
              <div className={cn(
                "absolute left-0 top-1/2 -translate-y-1/2 bg-black rounded-r-xl z-30 flex flex-col items-center justify-center gap-1",
                isSmall ? "h-1/3 w-4" : isMedium ? "h-1/3 w-5" : "h-1/3 w-7"
              )}>
                {!isSmall && (
                  <>
                    <div className={cn("rounded-full bg-gray-700", isSmall ? "w-1 h-1" : "w-2 h-2")} />
                    <div className={cn("rounded-full bg-gray-800", isSmall ? "h-6 w-1.5" : isMedium ? "h-8 w-2" : "h-12 w-3")} />
                  </>
                )}
              </div>
            )}
            
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
            {config.homeIndicator && !isRotated && (
              <div className={cn(
                "absolute left-1/2 -translate-x-1/2 bg-white/50 rounded-full z-40",
                isSmall ? "bottom-0.5 w-1/4 h-0.5" : isMedium ? "bottom-1 w-1/4 h-0.5" : "bottom-1 w-1/3 h-1"
              )} />
            )}
            
            {config.homeIndicator && isRotated && (
              <div className={cn(
                "absolute top-1/2 -translate-y-1/2 bg-white/50 rounded-full z-40",
                isSmall ? "right-0.5 h-1/4 w-0.5" : isMedium ? "right-1 h-1/4 w-0.5" : "right-1 h-1/3 w-1"
              )} />
            )}
            
            {/* Side buttons - only show on medium and large */}
            {!isSmall && !isRotated && (
              <>
                <div className={cn("absolute -left-0.5 bg-gray-700 rounded-l", isSmall ? "top-16 w-0.5 h-4" : isMedium ? "top-20 w-0.5 h-6" : "top-24 w-1 h-8")} />
                <div className={cn("absolute -left-0.5 bg-gray-700 rounded-l", isSmall ? "top-24 w-0.5 h-6" : isMedium ? "top-28 w-0.5 h-8" : "top-36 w-1 h-12")} />
                <div className={cn("absolute -right-0.5 bg-gray-700 rounded-r", isSmall ? "top-20 w-0.5 h-8" : isMedium ? "top-24 w-0.5 h-10" : "top-32 w-1 h-16")} />
              </>
            )}
            
            {!isSmall && isRotated && (
              <>
                <div className={cn("absolute -top-0.5 bg-gray-700 rounded-t", isSmall ? "left-16 h-0.5 w-4" : isMedium ? "left-20 h-0.5 w-6" : "left-24 h-1 w-8")} />
                <div className={cn("absolute -top-0.5 bg-gray-700 rounded-t", isSmall ? "left-24 h-0.5 w-6" : isMedium ? "left-28 h-0.5 w-8" : "left-36 h-1 w-12")} />
                <div className={cn("absolute -bottom-0.5 bg-gray-700 rounded-b", isSmall ? "left-20 h-0.5 w-8" : isMedium ? "left-24 h-0.5 w-10" : "left-32 h-1 w-16")} />
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
    </div>
  );
}
