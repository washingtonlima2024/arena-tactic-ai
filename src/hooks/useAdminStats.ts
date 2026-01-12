import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Get organizations count
      const { count: totalOrgs } = await supabase
        .from('organizations')
        .select('*', { count: 'exact', head: true });

      const { count: newOrgs } = await supabase
        .from('organizations')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfMonth.toISOString());

      // Get users count
      const { count: totalUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      const { count: newUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfMonth.toISOString());

      // Get credit transactions
      const { data: allCredits } = await supabase
        .from('credit_transactions')
        .select('amount, created_at')
        .eq('transaction_type', 'usage');

      const totalCreditsUsed = allCredits?.reduce((sum, tx) => sum + Math.abs(tx.amount), 0) || 0;
      const creditsUsedThisMonth = allCredits
        ?.filter(tx => new Date(tx.created_at) >= startOfMonth)
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0) || 0;

      // Get recent activity
      const { data: recentProfiles } = await supabase
        .from('profiles')
        .select('display_name, email, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      const recentActivity = (recentProfiles || []).map(profile => ({
        type: 'signup' as const,
        description: `${profile.display_name || profile.email} se cadastrou`,
        time: new Date(profile.created_at).toLocaleString('pt-BR'),
      }));

      return {
        totalOrganizations: totalOrgs || 0,
        newOrganizationsThisMonth: newOrgs || 0,
        totalUsers: totalUsers || 0,
        newUsersThisMonth: newUsers || 0,
        totalCreditsUsed,
        creditsUsedThisMonth,
        monthlyRevenue: 0, // Will be calculated from Stripe
        revenueGrowth: 0,
        recentActivity,
      };
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
