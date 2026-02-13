import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { DBAccountRole } from '@/lib/supabase'

// 講師・運営アカウント一覧取得（運営のみ）
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: roles, error } = await supabase
      .from('account_roles')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('account_roles fetch error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const instructors = (roles || []).filter((r: DBAccountRole) => r.role === 'instructor')
    const admins = (roles || []).filter((r: DBAccountRole) => r.role === 'admin')

    // user_tokens からメールに対応する user_id を取得し、表示名用にマージ（講師一覧で利用）
    const emails = (roles || []).map((r: DBAccountRole) => r.email)
    let emailToUser: Record<string, { user_id: string; email: string }> = {}
    if (emails.length > 0) {
      const { data: tokens } = await supabase
        .from('user_tokens')
        .select('user_id, email')
        .in('email', emails)
      tokens?.forEach((row: { user_id: string; email: string }) => {
        emailToUser[row.email.toLowerCase()] = { user_id: row.user_id, email: row.email }
      })
    }

    return NextResponse.json({
      instructors: instructors.map((r: DBAccountRole) => ({
        email: r.email,
        role: r.role,
        created_at: r.created_at,
        user_id: emailToUser[r.email.toLowerCase()]?.user_id ?? null,
      })),
      admins: admins.map((r: DBAccountRole) => ({
        email: r.email,
        role: r.role,
        created_at: r.created_at,
      })),
    })
  } catch (err) {
    console.error('GET /api/admin/accounts error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// 講師または運営アカウントを追加（運営のみ）
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { email, role } = body as { email?: string; role?: string }

    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
    if (!normalizedEmail) {
      return NextResponse.json({ error: 'メールアドレスを入力してください' }, { status: 400 })
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ error: '有効なメールアドレスを入力してください' }, { status: 400 })
    }
    if (role !== 'instructor' && role !== 'admin') {
      return NextResponse.json({ error: 'role は instructor または admin を指定してください' }, { status: 400 })
    }

    const { error } = await supabase.from('account_roles').insert({
      email: normalizedEmail,
      role,
    })

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'このメールアドレスは既に登録されています' },
          { status: 400 }
        )
      }
      console.error('account_roles insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('POST /api/admin/accounts error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// 講師または運営アカウントを削除（運営のみ）
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { email } = body as { email?: string }

    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
    if (!normalizedEmail) {
      return NextResponse.json({ error: 'メールアドレスを指定してください' }, { status: 400 })
    }

    // 自分自身の運営権限は削除できない
    if (session.user?.email?.toLowerCase() === normalizedEmail) {
      const { data: row } = await supabase
        .from('account_roles')
        .select('role')
        .eq('email', normalizedEmail)
        .single()
      if (row?.role === 'admin') {
        return NextResponse.json(
          { error: '自分自身の運営権限は削除できません' },
          { status: 400 }
        )
      }
    }

    const { error } = await supabase.from('account_roles').delete().eq('email', normalizedEmail)

    if (error) {
      console.error('account_roles delete error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/admin/accounts error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
