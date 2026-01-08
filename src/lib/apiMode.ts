type ApiMode = 'local' | 'supabase';

export const getApiMode = (): ApiMode => {
  const stored = localStorage.getItem('api_mode');
  if (stored === 'local' || stored === 'supabase') return stored;
  return 'supabase'; // default to supabase for Lovable preview
};

export const setApiMode = (mode: ApiMode) => {
  localStorage.setItem('api_mode', mode);
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
