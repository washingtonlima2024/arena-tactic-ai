import { useCallback, useRef } from 'react';

// Pre-generated audio buffers for vignette sound effects
// These are created once and reused

export function useVignetteAudio() {
  const audioContextRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  const playSwoosh = useCallback(async () => {
    try {
      const ctx = getAudioContext();
      
      // Resume if suspended
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const now = ctx.currentTime;

      // Main swoosh oscillator
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(2000, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.3);

      // Sub bass
      const bass = ctx.createOscillator();
      bass.type = 'sine';
      bass.frequency.setValueAtTime(80, now);
      bass.frequency.exponentialRampToValueAtTime(40, now + 0.4);

      // Noise for texture
      const bufferSize = ctx.sampleRate * 0.4;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        noiseData[i] = (Math.random() * 2 - 1) * 0.5;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      // Filters
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.setValueAtTime(3000, now);
      highpass.frequency.exponentialRampToValueAtTime(500, now + 0.3);

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(8000, now);
      lowpass.frequency.exponentialRampToValueAtTime(2000, now + 0.3);

      // Gains
      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0.3, now);
      oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

      const bassGain = ctx.createGain();
      bassGain.gain.setValueAtTime(0.4, now);
      bassGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.2, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

      const master = ctx.createGain();
      master.gain.value = 1.0;

      // Connect
      osc.connect(lowpass);
      lowpass.connect(oscGain);
      oscGain.connect(master);

      bass.connect(bassGain);
      bassGain.connect(master);

      noise.connect(highpass);
      highpass.connect(noiseGain);
      noiseGain.connect(master);

      master.connect(ctx.destination);

      // Play
      osc.start(now);
      bass.start(now);
      noise.start(now);

      osc.stop(now + 0.4);
      bass.stop(now + 0.45);
      noise.stop(now + 0.35);

      console.log('[VignetteAudio] Swoosh played');
    } catch (e) {
      console.warn('[VignetteAudio] Swoosh failed:', e);
    }
  }, [getAudioContext]);

  const playImpact = useCallback(async () => {
    try {
      const ctx = getAudioContext();
      
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const now = ctx.currentTime;

      // Deep bass hit
      const bass = ctx.createOscillator();
      bass.type = 'sine';
      bass.frequency.setValueAtTime(150, now);
      bass.frequency.exponentialRampToValueAtTime(25, now + 0.2);

      // Mid punch
      const mid = ctx.createOscillator();
      mid.type = 'triangle';
      mid.frequency.setValueAtTime(300, now);
      mid.frequency.exponentialRampToValueAtTime(60, now + 0.15);

      // Attack transient
      const click = ctx.createOscillator();
      click.type = 'square';
      click.frequency.setValueAtTime(2000, now);
      click.frequency.exponentialRampToValueAtTime(200, now + 0.02);

      // Noise burst
      const bufferSize = ctx.sampleRate * 0.1;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        noiseData[i] = (Math.random() * 2 - 1);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      // Gains
      const bassGain = ctx.createGain();
      bassGain.gain.setValueAtTime(0.6, now);
      bassGain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

      const midGain = ctx.createGain();
      midGain.gain.setValueAtTime(0.4, now);
      midGain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(0.15, now);
      clickGain.gain.exponentialRampToValueAtTime(0.01, now + 0.03);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.25, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

      const master = ctx.createGain();
      master.gain.value = 1.0;

      // Connect
      bass.connect(bassGain);
      bassGain.connect(master);

      mid.connect(midGain);
      midGain.connect(master);

      click.connect(clickGain);
      clickGain.connect(master);

      noise.connect(noiseGain);
      noiseGain.connect(master);

      master.connect(ctx.destination);

      // Play
      bass.start(now);
      mid.start(now);
      click.start(now);
      noise.start(now);

      bass.stop(now + 0.3);
      mid.stop(now + 0.2);
      click.stop(now + 0.05);
      noise.stop(now + 0.1);

      console.log('[VignetteAudio] Impact played');
    } catch (e) {
      console.warn('[VignetteAudio] Impact failed:', e);
    }
  }, [getAudioContext]);

  // Initialize audio context on user interaction
  const initAudio = useCallback(async () => {
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      console.log('[VignetteAudio] Audio initialized, state:', ctx.state);
      return true;
    } catch (e) {
      console.warn('[VignetteAudio] Init failed:', e);
      return false;
    }
  }, [getAudioContext]);

  return { playSwoosh, playImpact, initAudio };
}
