import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

interface AdminStats {
  totalOrganizations: number;
  newOrganizationsThisMonth: number;
  totalUsers: number;
  newUsersThisMonth: number;
  totalCreditsUsed: number;
  creditsUsedThisMonth: number;
  monthlyRevenue: number;
  revenueGrowth: number;
  recentActivity: Array<{
    type: 'signup' | 'payment' | 'credits';
    description: string;
    time: string;
  }>;
}

export function useAdminStats() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async (): Promise<AdminStats> => {
      try {
        const stats = await apiClient.admin.getStats();
        return stats;
      } catch (error) {
        console.error('[useAdminStats] Error fetching stats:', error);
        // Return defaults on error
        return {
          totalOrganizations: 0,
          newOrganizationsThisMonth: 0,
          totalUsers: 0,
          newUsersThisMonth: 0,
          totalCreditsUsed: 0,
          creditsUsedThisMonth: 0,
          monthlyRevenue: 0,
          revenueGrowth: 0,
          recentActivity: [],
        };
      }
    },
  });

  // Generate sample chart data
  const creditsUsageData = Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    credits: Math.floor(Math.random() * 500) + 100,
  }));

  const revenueData = [
    { month: 'Ago', revenue: 0 },
    { month: 'Set', revenue: 0 },
    { month: 'Out', revenue: 0 },
    { month: 'Nov', revenue: 0 },
    { month: 'Dez', revenue: 0 },
    { month: 'Jan', revenue: 0 },
  ];

  return {
    stats: data || {
      totalOrganizations: 0,
      newOrganizationsThisMonth: 0,
      totalUsers: 0,
      newUsersThisMonth: 0,
      totalCreditsUsed: 0,
      creditsUsedThisMonth: 0,
      monthlyRevenue: 0,
      revenueGrowth: 0,
      recentActivity: [],
    },
    isLoading,
    creditsUsageData,
    revenueData,
  };
}
