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

// Aspect ratio values for each format
const aspectRatios = {
  '9:16': 9 / 16,
  '16:9': 16 / 9,
  '1:1': 1,
  '4:5': 4 / 5,
};

// Max heights for each size (in vh or px)
const maxHeights = {
  sm: 'max-h-[35vh]',
  md: 'max-h-[45vh]',
  lg: 'max-h-[55vh]',
};

// Device config for styling
const deviceConfigs = {
  '9:16': {
    device: 'phone',
    screenClass: 'rounded-[24px]',
    homeIndicator: true,
  },
  '4:5': {
    device: 'phone',
    screenClass: 'rounded-[24px]',
    homeIndicator: true,
  },
  '1:1': {
    device: 'tablet',
    screenClass: 'rounded-[20px]',
    homeIndicator: false,
  },
  '16:9': {
    device: 'desktop',
    screenClass: 'rounded-t-lg',
    homeIndicator: false,
  },
};

export function DeviceMockup({ format, size = 'lg', platform, children, className, allowRotation = false }: DeviceMockupProps) {
  const [isRotated, setIsRotated] = useState(false);
  const config = deviceConfigs[format];
  const isSmall = size === 'sm';
  const isMedium = size === 'md';
  
  // Calculate aspect ratio (swap if rotated)
  const baseAspectRatio = aspectRatios[format];
  const aspectRatio = isRotated ? 1 / baseAspectRatio : baseAspectRatio;
  
  // Only allow rotation for phone formats
  const canRotate = allowRotation && (format === '9:16' || format === '4:5');
  
  // Get padding based on device and size
  const getPadding = () => {
    if (isSmall) return 'p-1';
    if (isMedium) return 'p-1.5';
    return 'p-2';
  };

  const getBorderRadius = () => {
    if (config.device === 'phone') {
      if (isSmall) return 'rounded-[24px]';
      if (isMedium) return 'rounded-[32px]';
      return 'rounded-[40px]';
    }
    if (config.device === 'tablet') {
      if (isSmall) return 'rounded-[16px]';
      if (isMedium) return 'rounded-[20px]';
      return 'rounded-[24px]';
    }
    // desktop
    if (isSmall) return 'rounded-md';
    if (isMedium) return 'rounded-lg';
    return 'rounded-lg';
  };

  const getScreenRadius = () => {
    if (config.device === 'phone') {
      if (isSmall) return 'rounded-[18px]';
      if (isMedium) return 'rounded-[22px]';
      return 'rounded-[24px]';
    }
    if (config.device === 'tablet') {
      if (isSmall) return 'rounded-md';
      return 'rounded-lg';
    }
    // desktop
    if (isSmall) return 'rounded-sm';
    return 'rounded';
  };

  const getBorderWidth = () => {
    if (isSmall) return 'border-2';
    if (isMedium) return 'border-[3px]';
    return 'border-4';
  };
  
  return (
    <div className={cn("flex flex-col items-center gap-3 h-full", className)}>
      {/* Rotation Button */}
      {canRotate && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsRotated(!isRotated)}
          className="gap-2 flex-shrink-0"
        >
          <RotateCcw className={cn("h-4 w-4 transition-transform", isRotated && "rotate-90")} />
          {isRotated ? 'Retrato' : 'Paisagem'}
        </Button>
      )}
      
      {/* Main container - flex grow to fill available space */}
      <div className={cn(
        "flex items-center justify-center flex-1 min-h-0 w-full",
        maxHeights[size]
      )}>
        {config.device === 'phone' && (
          <div 
            className={cn(
              "relative bg-gray-900 shadow-2xl border-gray-800",
              getBorderRadius(),
              getPadding(),
              getBorderWidth(),
              maxHeights[size]
            )}
            style={{ aspectRatio: aspectRatio, width: 'auto' }}
          >
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
              getScreenRadius()
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
                <div className={cn("absolute -left-0.5 bg-gray-700 rounded-l", isMedium ? "top-[15%] w-0.5 h-[5%]" : "top-[15%] w-1 h-[6%]")} />
                <div className={cn("absolute -left-0.5 bg-gray-700 rounded-l", isMedium ? "top-[22%] w-0.5 h-[8%]" : "top-[23%] w-1 h-[10%]")} />
                <div className={cn("absolute -right-0.5 bg-gray-700 rounded-r", isMedium ? "top-[18%] w-0.5 h-[10%]" : "top-[20%] w-1 h-[12%]")} />
              </>
            )}
            
            {!isSmall && isRotated && (
              <>
                <div className={cn("absolute -top-0.5 bg-gray-700 rounded-t", isMedium ? "left-[15%] h-0.5 w-[5%]" : "left-[15%] h-1 w-[6%]")} />
                <div className={cn("absolute -top-0.5 bg-gray-700 rounded-t", isMedium ? "left-[22%] h-0.5 w-[8%]" : "left-[23%] h-1 w-[10%]")} />
                <div className={cn("absolute -bottom-0.5 bg-gray-700 rounded-b", isMedium ? "left-[18%] h-0.5 w-[10%]" : "left-[20%] h-1 w-[12%]")} />
              </>
            )}
          </div>
        )}
        
        {config.device === 'tablet' && (
          <div 
            className={cn(
              "relative bg-gray-900 shadow-2xl border-gray-800",
              getBorderRadius(),
              getPadding(),
              getBorderWidth(),
              maxHeights[size]
            )}
            style={{ aspectRatio: aspectRatio, width: 'auto' }}
          >
            {/* Camera */}
            <div className={cn(
              "absolute left-1/2 -translate-x-1/2 rounded-full bg-gray-700 z-30",
              isSmall ? "top-1.5 w-1.5 h-1.5" : "top-3 w-2 h-2"
            )} />
            
            {/* Screen */}
            <div className={cn(
              "relative w-full h-full bg-black overflow-hidden",
              getScreenRadius()
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
          <div className={cn("flex flex-col items-center", maxHeights[size])}>
            {/* Monitor */}
            <div 
              className={cn(
                "relative bg-gray-900 shadow-2xl border-gray-800 flex-1 min-h-0",
                getBorderRadius(),
                getPadding(),
                getBorderWidth()
              )}
              style={{ aspectRatio: aspectRatio, width: 'auto', height: '85%' }}
            >
              {/* Screen */}
              <div className={cn(
                "relative w-full h-full bg-black overflow-hidden",
                getScreenRadius()
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
              "bg-gradient-to-b from-gray-800 to-gray-900 flex-shrink-0",
              isSmall ? "w-12 h-3" : isMedium ? "w-16 h-4" : "w-24 h-6"
            )} />
            <div className={cn(
              "bg-gray-800 rounded-lg flex-shrink-0",
              isSmall ? "w-20 h-1.5" : isMedium ? "w-28 h-2" : "w-40 h-3"
            )} />
          </div>
        )}
      </div>
    </div>
  );
}
