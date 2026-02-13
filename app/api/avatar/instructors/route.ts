import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// 複数の講師IDからアバターURLとジャンルを取得
export async function POST(request: NextRequest) {
  try {
    const { instructorIds } = await request.json()
    
    if (!instructorIds || !Array.isArray(instructorIds)) {
      return NextResponse.json({ error: 'instructorIds is required' }, { status: 400 })
    }

    // user_tokensテーブルから講師のアバターURLとジャンルを取得
    const { data, error } = await supabase
      .from('user_tokens')
      .select('user_id, avatar_url, genre')
      .in('user_id', instructorIds)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ avatars: {}, genres: {} })
    }

    // user_id -> avatar_url, user_id -> genre のマップを作成
    const avatars: Record<string, string | null> = {}
    const genres: Record<string, string | null> = {}
    data?.forEach((row) => {
      avatars[row.user_id] = row.avatar_url
      genres[row.user_id] = row.genre
    })

    return NextResponse.json({ avatars, genres })

  } catch (error) {
    console.error('Get instructors avatars error:', error)
    return NextResponse.json({ avatars: {}, genres: {} })
  }
}
