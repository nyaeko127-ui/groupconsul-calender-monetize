// app/api/events/trashed/route.ts
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!session.user.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data, error } = await supabaseAdmin
      .from('session_candidates')
      .select('*')
      .not('trashed_at', 'is', null)
      .order('trashed_at', { ascending: false })

    if (error) {
      console.error('Supabase query error:', error)
      return NextResponse.json({ error: 'Failed to fetch trashed events' }, { status: 500 })
    }

    return NextResponse.json({ events: data || [] })
  } catch (error) {
    console.error('API route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
