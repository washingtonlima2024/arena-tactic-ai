import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/apiClient';

export interface SocialConnection {
  id: string;
  user_id: string;
  platform: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  account_name: string | null;
  account_id: string | null;
  is_connected: boolean;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useSocialConnections() {
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConnections = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiClient.get<SocialConnection[]>('/api/social/connections');
      setConnections(data || []);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching social connections:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const getConnectionByPlatform = useCallback((platform: string): SocialConnection | undefined => {
    return connections.find(c => c.platform === platform && c.is_connected);
  }, [connections]);

  const isConnected = useCallback((platform: string): boolean => {
    const connection = getConnectionByPlatform(platform);
    return !!connection?.is_connected;
  }, [getConnectionByPlatform]);

  const getConnectedPlatforms = useCallback((): string[] => {
    return connections
      .filter(c => c.is_connected)
      .map(c => c.platform);
  }, [connections]);

  return {
    connections,
    loading,
    error,
    refetch: fetchConnections,
    getConnectionByPlatform,
    isConnected,
    getConnectedPlatforms,
  };
}
