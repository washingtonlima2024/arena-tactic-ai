export type ApiMode = 'local' | 'supabase';

export const getApiMode = (): ApiMode => {
  const stored = localStorage.getItem('api_mode');
  if (stored === 'supabase') return 'supabase';
  return 'local'; // Default to local
};

export const setApiMode = (mode: ApiMode) => {
  localStorage.setItem('api_mode', mode);
};

export const isLocalMode = (): boolean => {
  return getApiMode() === 'local';
};

export const checkLocalServerAvailable = async (): Promise<boolean> => {
  try {
    const response = await fetch('http://localhost:5000/health', {
      signal: AbortSignal.timeout(2000)
    });
    return response.ok;
  } catch {
    return false;
  }
};
