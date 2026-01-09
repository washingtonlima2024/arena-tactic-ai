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
    const apiUrl = localStorage.getItem('arenaApiUrl') || 'https://75c7a7f57d85.ngrok-free.app';
    const response = await fetch(`${apiUrl}/health`, {
      signal: AbortSignal.timeout(3000),
      headers: {
        'ngrok-skip-browser-warning': 'true'
      }
    });
    return response.ok;
  } catch {
    return false;
  }
};
