type ApiMode = 'local';

export const getApiMode = (): ApiMode => {
  return 'local'; // Always use local server
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
