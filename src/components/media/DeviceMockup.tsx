import { cn } from '@/lib/utils';
import { Smartphone, Monitor, Tablet } from 'lucide-react';

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
    notchClass: 'w-24 h-6 bg-black rounded-full absolute top-2 left-1/2 -translate-x-1/2 z-10',
    homeIndicator: true,
  },
  '4:5': {
    device: 'phone',
    frameClass: 'w-[320px] h-[420px] md:w-[380px] md:h-[500px]',
    screenClass: 'rounded-[32px]',
    notchClass: 'w-24 h-6 bg-black rounded-full absolute top-2 left-1/2 -translate-x-1/2 z-10',
    homeIndicator: true,
  },
  '1:1': {
    device: 'tablet',
    frameClass: 'w-[400px] h-[440px] md:w-[480px] md:h-[520px]',
    screenClass: 'rounded-[24px]',
    notchClass: '',
    homeIndicator: false,
  },
  '16:9': {
    device: 'desktop',
    frameClass: 'w-[640px] h-[420px] md:w-[800px] md:h-[500px]',
    screenClass: 'rounded-t-lg',
    notchClass: '',
    homeIndicator: false,
  },
};

// Social media UI overlays
const SocialMediaUI = ({ platform, format }: { platform?: string; format: string }) => {
  const isVertical = format === '9:16' || format === '4:5';
  
  // Instagram-style UI
  if (platform?.toLowerCase().includes('instagram') || platform?.toLowerCase().includes('reels')) {
    return (
      <>
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 p-3 flex items-center justify-between z-20 bg-gradient-to-b from-black/50 to-transparent">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500" />
            <span className="text-white text-sm font-medium">arena_play</span>
          </div>
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-white/20" />
            <div className="w-6 h-6 rounded-full bg-white/20" />
          </div>
        </div>
        
        {/* Right side actions */}
        {isVertical && (
          <div className="absolute right-3 bottom-32 flex flex-col gap-5 z-20">
            <div className="flex flex-col items-center gap-1">
              <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
              </div>
              <span className="text-white text-xs">12.5K</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                </svg>
              </div>
              <span className="text-white text-xs">847</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                </svg>
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg border-2 border-white overflow-hidden">
              <div className="w-full h-full bg-gradient-to-br from-emerald-500 to-teal-600" />
            </div>
          </div>
        )}
        
        {/* Bottom caption */}
        <div className="absolute bottom-0 left-0 right-12 p-4 z-20 bg-gradient-to-t from-black/70 to-transparent">
          <p className="text-white text-sm font-medium">arena_play</p>
          <p className="text-white/80 text-xs mt-1 line-clamp-2">⚽ Melhores momentos do jogo! 🔥 #futebol #gol #highlights</p>
        </div>
      </>
    );
  }
  
  // YouTube-style UI
  if (platform?.toLowerCase().includes('youtube') || format === '16:9') {
    return (
      <>
        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 z-20">
          <div className="h-1 bg-white/30">
            <div className="h-full w-[35%] bg-red-600" />
          </div>
          {/* Controls */}
          <div className="bg-gradient-to-t from-black/80 to-transparent p-3 flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
            <span className="text-white text-sm">2:34 / 7:12</span>
            <div className="flex-1" />
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded bg-white/20" />
              <div className="w-6 h-6 rounded bg-white/20" />
              <div className="w-6 h-6 rounded bg-white/20" />
            </div>
          </div>
        </div>
        
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/50 to-transparent z-20">
          <p className="text-white text-sm font-medium truncate">Melhores Momentos - Arena Play</p>
        </div>
      </>
    );
  }
  
  // TikTok-style UI
  if (platform?.toLowerCase().includes('tiktok')) {
    return (
      <>
        {/* Right side actions */}
        <div className="absolute right-3 bottom-24 flex flex-col gap-5 z-20">
          <div className="w-12 h-12 rounded-full border-2 border-white overflow-hidden">
            <div className="w-full h-full bg-gradient-to-br from-emerald-500 to-teal-600" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </div>
            <span className="text-white text-xs font-bold">24.8K</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
              </svg>
            </div>
            <span className="text-white text-xs font-bold">1,234</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
              </svg>
            </div>
            <span className="text-white text-xs font-bold">Share</span>
          </div>
          <div className="w-10 h-10 rounded-full border-2 border-white animate-[spin_3s_linear_infinite]">
            <div className="w-full h-full rounded-full bg-gradient-to-br from-pink-500 to-violet-500" />
          </div>
        </div>
        
        {/* Bottom info */}
        <div className="absolute bottom-0 left-0 right-16 p-4 z-20">
          <p className="text-white font-bold">@arena_play</p>
          <p className="text-white text-sm mt-1">⚽ Gol incrível! 🔥 #futebol #gol</p>
          <div className="flex items-center gap-2 mt-2">
            <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center">
              <svg className="w-2 h-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
              </svg>
            </div>
            <p className="text-white text-xs">som original - arena_play</p>
          </div>
        </div>
      </>
    );
  }
  
  return null;
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
          {/* Phone frame details */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-7 bg-black rounded-b-2xl z-30 flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gray-700" />
            <div className="w-12 h-3 rounded-full bg-gray-800" />
          </div>
          
          {/* Screen */}
          <div className={cn(
            "relative w-full h-full bg-black overflow-hidden",
            config.screenClass
          )}>
            {/* Content */}
            <div className="absolute inset-0">
              {children}
            </div>
            
            {/* Social media UI overlay */}
            <SocialMediaUI platform={platform} format={format} />
          </div>
          
          {/* Home indicator */}
          {config.homeIndicator && (
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1/3 h-1 bg-white/50 rounded-full" />
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
            {children}
            <SocialMediaUI platform={platform} format={format} />
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
              {children}
              <SocialMediaUI platform={platform} format={format} />
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
