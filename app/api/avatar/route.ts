import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('user_tokens')
      .select('avatar_url, genre')
      .eq('user_id', session.user.id)
      .single()

    if (error || !data) {
      return NextResponse.json({ avatarUrl: null, genre: null })
    }

    return NextResponse.json({ avatarUrl: data.avatar_url, genre: data.genre })

  } catch (error) {
    console.error('Get avatar error:', error)
    return NextResponse.json({ avatarUrl: null, genre: null })
  }
}
