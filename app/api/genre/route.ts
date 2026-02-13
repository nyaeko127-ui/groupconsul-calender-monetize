import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { genre } = await request.json()

    const { error } = await supabase
      .from('user_tokens')
      .update({ genre })
      .eq('user_id', session.user.id)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to save genre' }, { status: 500 })
    }

    return NextResponse.json({ success: true, genre })

  } catch (error) {
    console.error('Save genre error:', error)
    return NextResponse.json({ error: 'Failed to save genre' }, { status: 500 })
  }
}
