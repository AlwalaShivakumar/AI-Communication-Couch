import { getHistoricalAggregates } from '@/lib/insights';
import ProfileDashboardClient from './ProfileDashboardClient';

import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const cookieStore = await cookies();
  const guestId = cookieStore.get('guest_id')?.value || '00000000-0000-0000-0000-000000000001';
  const data = await getHistoricalAggregates(guestId);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] text-gray-900 dark:text-gray-100 p-8">
      <div className="max-w-6xl mx-auto flex flex-col gap-8">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Total Communication Insights</h2>
          <p className="text-gray-500 mt-2">Track your communication performance, identify hidden patterns, and know what to practice next.</p>
        </div>

        {data?.empty || !data ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-12 rounded-2xl text-center shadow-sm">
            <h3 className="text-xl font-bold mb-3">Your communication journey starts here.</h3>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              Complete your first Live Training session to unlock performance insights, historical tracking, and AI-generated coaching recommendations.
            </p>
            <a href="/" className="px-6 py-3 bg-white dark:bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors inline-block">
              Start a Session
            </a>
          </div>
        ) : (
          <ProfileDashboardClient initialData={data} userId={guestId} />
        )}
      </div>
    </div>
  );
}
