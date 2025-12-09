import { cn } from '@/lib/utils';

interface DeviceMockupProps {
  format: '9:16' | '16:9' | '1:1' | '4:5';
  platform?: string;
  children: React.ReactNode;
  className?: string;
}

// Device frame styles for each format
const deviceConfigs = {
  '9:16': {
    device: 'phone',
    frameClass: 'w-[280px] h-[580px] md:w-[320px] md:h-[660px]',
    screenClass: 'rounded-[32px]',
    homeIndicator: true,
  },
  '4:5': {
    device: 'phone',
    frameClass: 'w-[320px] h-[420px] md:w-[380px] md:h-[500px]',
    screenClass: 'rounded-[32px]',
    homeIndicator: true,
  },
  '1:1': {
    device: 'tablet',
    frameClass: 'w-[400px] h-[440px] md:w-[480px] md:h-[520px]',
    screenClass: 'rounded-[24px]',
    homeIndicator: false,
  },
  '16:9': {
    device: 'desktop',
    frameClass: 'w-[640px] h-[420px] md:w-[800px] md:h-[500px]',
    screenClass: 'rounded-t-lg',
    homeIndicator: false,
  },
};

export function DeviceMockup({ format, platform, children, className }: DeviceMockupProps) {
  const config = deviceConfigs[format];
  
  return (
    <div className={cn("flex items-center justify-center", className)}>
      {config.device === 'phone' && (
        <div className={cn(
          "relative bg-gray-900 rounded-[40px] p-2 shadow-2xl",
          "border-4 border-gray-800",
          config.frameClass
        )}>
          {/* Phone frame - Dynamic Island style notch */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-7 bg-black rounded-b-2xl z-30 flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gray-700" />
            <div className="w-12 h-3 rounded-full bg-gray-800" />
          </div>
          
          {/* Screen */}
          <div className={cn(
            "relative w-full h-full bg-black overflow-hidden",
            config.screenClass
          )}>
            {/* Content - takes full screen */}
            <div className="absolute inset-0 z-10">
              {children}
            </div>
          </div>
          
          {/* Home indicator */}
          {config.homeIndicator && (
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1/3 h-1 bg-white/50 rounded-full z-40" />
          )}
          
          {/* Side buttons */}
          <div className="absolute -left-1 top-24 w-1 h-8 bg-gray-700 rounded-l" />
          <div className="absolute -left-1 top-36 w-1 h-12 bg-gray-700 rounded-l" />
          <div className="absolute -left-1 top-52 w-1 h-12 bg-gray-700 rounded-l" />
          <div className="absolute -right-1 top-32 w-1 h-16 bg-gray-700 rounded-r" />
        </div>
      )}
      
      {config.device === 'tablet' && (
        <div className={cn(
          "relative bg-gray-900 rounded-[24px] p-3 shadow-2xl",
          "border-4 border-gray-800",
          config.frameClass
        )}>
          {/* Camera */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-gray-700 z-30" />
          
          {/* Screen */}
          <div className={cn(
            "relative w-full h-full bg-black overflow-hidden rounded-lg"
          )}>
            <div className="absolute inset-0">
              {children}
            </div>
          </div>
          
          {/* Home button */}
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full border-2 border-gray-700" />
        </div>
      )}
      
      {config.device === 'desktop' && (
        <div className="flex flex-col items-center">
          {/* Monitor */}
          <div className={cn(
            "relative bg-gray-900 rounded-lg p-2 shadow-2xl",
            "border-4 border-gray-800",
            config.frameClass
          )}>
            {/* Screen */}
            <div className="relative w-full h-full bg-black overflow-hidden rounded">
              <div className="absolute inset-0">
                {children}
              </div>
            </div>
            
            {/* Webcam */}
            <div className="absolute top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-gray-700" />
          </div>
          
          {/* Stand */}
          <div className="w-24 h-6 bg-gradient-to-b from-gray-800 to-gray-900" />
          <div className="w-40 h-3 bg-gray-800 rounded-lg" />
        </div>
      )}
    </div>
  );
}
