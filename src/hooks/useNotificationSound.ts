import { useCallback } from 'react';

export function useNotificationSound() {
  const playSuccessSound = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Create a pleasant "success" chime sound
      const playTone = (frequency: number, startTime: number, duration: number, volume: number = 0.3) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, startTime);
        
        // Envelope for smooth sound
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      };
      
      const now = audioContext.currentTime;
      
      // Play ascending chime (C5 - E5 - G5) for success feel
      playTone(523.25, now, 0.2, 0.2);        // C5
      playTone(659.25, now + 0.1, 0.2, 0.25); // E5
      playTone(783.99, now + 0.2, 0.4, 0.3);  // G5
      
    } catch (error) {
      console.warn('Could not play notification sound:', error);
    }
  }, []);

  const playErrorSound = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
      oscillator.frequency.linearRampToValueAtTime(150, audioContext.currentTime + 0.3);
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.3);
      
    } catch (error) {
      console.warn('Could not play error sound:', error);
    }
  }, []);

  return { playSuccessSound, playErrorSound };
}
