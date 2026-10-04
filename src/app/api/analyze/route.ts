import { coachingResponse } from '@/lib/coaching';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(req: Request) { return coachingResponse(req, false); }
