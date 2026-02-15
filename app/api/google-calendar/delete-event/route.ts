import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

// リフレッシュトークンを使って新しいアクセストークンを取得
async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    oauth2Client.setCredentials({ refresh_token: refreshToken })
    
    const { credentials } = await oauth2Client.refreshAccessToken()
    return credentials.access_token || null
  } catch (error) {
    console.error('Failed to refresh access token:', error)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    // セッション確認（運営のみ実行可能）
    const session = await getServerSession(authOptions)
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { instructorId, googleCalendarEventId, adminEventId } = body

    if (!googleCalendarEventId && !adminEventId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )

    // 講師のGoogleカレンダーから削除
    if (instructorId && googleCalendarEventId) {
      const { data: tokenData, error: tokenError } = await supabase
        .from('user_tokens')
        .select('*')
        .eq('user_id', instructorId)
        .single()

      if (!tokenError && tokenData) {
        let accessToken = tokenData.access_token
        if (tokenData.refresh_token) {
          const newAccessToken = await refreshAccessToken(tokenData.refresh_token)
          if (newAccessToken) {
            accessToken = newAccessToken
            await supabase
              .from('user_tokens')
              .update({ access_token: newAccessToken, updated_at: new Date().toISOString() })
              .eq('user_id', instructorId)
          }
        }
        oauth2Client.setCredentials({ access_token: accessToken })
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
        try {
          await calendar.events.delete({
            calendarId: 'primary',
            eventId: googleCalendarEventId,
          })
          console.log('Calendar event deleted (instructor):', googleCalendarEventId)
        } catch (e: any) {
          if (e.code !== 404 && e.code !== 410) throw e
        }
      }
    }

    // 運営のGoogleカレンダーから削除
    if (adminEventId && session.user?.id) {
      const { data: adminTokenData, error: adminTokenError } = await supabase
        .from('user_tokens')
        .select('*')
        .eq('user_id', session.user.id)
        .single()

      if (!adminTokenError && adminTokenData) {
        let adminToken = adminTokenData.access_token
        if (adminTokenData.refresh_token) {
          const newToken = await refreshAccessToken(adminTokenData.refresh_token)
          if (newToken) {
            adminToken = newToken
            await supabase
              .from('user_tokens')
              .update({ access_token: newToken, updated_at: new Date().toISOString() })
              .eq('user_id', session.user.id)
          }
        }
        oauth2Client.setCredentials({ access_token: adminToken })
        const adminCalendar = google.calendar({ version: 'v3', auth: oauth2Client })
        try {
          await adminCalendar.events.delete({
            calendarId: 'primary',
            eventId: adminEventId,
          })
          console.log('Calendar event deleted (admin):', adminEventId)
        } catch (e: any) {
          if (e.code !== 404 && e.code !== 410) throw e
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Googleカレンダーから予定を削除しました'
    })

  } catch (error: any) {
    console.error('Failed to delete calendar event:', error)
    
    // イベントが既に削除されている場合は成功として扱う
    if (error.code === 404 || error.code === 410) {
      return NextResponse.json({
        success: true,
        message: '予定は既に削除されています'
      })
    }
    
    if (error.code === 401 || error.code === 403) {
      return NextResponse.json({
        error: 'Authentication failed',
        message: '講師のGoogleカレンダーへのアクセス権限がありません。'
      }, { status: 401 })
    }

    return NextResponse.json({
      error: 'Failed to delete event',
      message: 'Googleカレンダーからの予定削除に失敗しました'
    }, { status: 500 })
  }
}
