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
    const { instructorId, googleCalendarEventId } = body

    if (!instructorId || !googleCalendarEventId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 講師のトークンを取得
    const { data: tokenData, error: tokenError } = await supabase
      .from('user_tokens')
      .select('*')
      .eq('user_id', instructorId)
      .single()

    if (tokenError || !tokenData) {
      console.error('Token not found for instructor:', instructorId)
      return NextResponse.json({ 
        error: 'Instructor token not found',
        message: '講師のGoogleカレンダー連携情報が見つかりません。'
      }, { status: 404 })
    }

    // アクセストークンを取得（期限切れの場合はリフレッシュ）
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

    // Google Calendar APIクライアントを設定
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    oauth2Client.setCredentials({ access_token: accessToken })

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    // イベントを削除
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: googleCalendarEventId,
    })

    console.log('Calendar event deleted:', googleCalendarEventId)

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
