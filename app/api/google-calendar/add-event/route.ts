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
    const { instructorId, instructorName, date, timeSlot, title, adminEventTitle } = body

    if (!instructorId || !date || !timeSlot) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 日付と時間を解析（講師・運営共通）
    const eventDate = new Date(date)
    const [startTime, endTime] = timeSlot.split('-')
    const [startHour] = startTime.split(':').map(Number)
    const [endHour] = endTime.split(':').map(Number)
    const startDateTime = new Date(eventDate)
    startDateTime.setHours(startHour, 0, 0, 0)
    const endDateTime = new Date(eventDate)
    if (endHour === 24) {
      endDateTime.setDate(endDateTime.getDate() + 1)
      endDateTime.setHours(0, 0, 0, 0)
    } else {
      endDateTime.setHours(endHour, 0, 0, 0)
    }
    const eventBody = {
      start: { dateTime: startDateTime.toISOString(), timeZone: 'Asia/Tokyo' as const },
      end: { dateTime: endDateTime.toISOString(), timeZone: 'Asia/Tokyo' as const },
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
        message: '講師のGoogleカレンダー連携情報が見つかりません。講師に再度ログインしてもらってください。'
      }, { status: 404 })
    }

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

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    oauth2Client.setCredentials({ access_token: accessToken })
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    const eventTitle = title || 'グルコン'
    const instructorEvent = {
      ...eventBody,
      summary: eventTitle,
      description: `グルコン候補日システムから自動登録\n講師: ${instructorName}`,
    }

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: instructorEvent,
    })

    console.log('Calendar event created (instructor):', response.data)

    // 運営アカウントのGoogleカレンダーにも同じ予定を登録（adminEventTitle が渡された場合）
    if (adminEventTitle && session.user?.id) {
      try {
        const { data: adminTokenData, error: adminTokenError } = await supabase
          .from('user_tokens')
          .select('*')
          .eq('user_id', session.user.id)
          .single()

        if (!adminTokenError && adminTokenData) {
          let adminAccessToken = adminTokenData.access_token
          if (adminTokenData.refresh_token) {
            const newAdminToken = await refreshAccessToken(adminTokenData.refresh_token)
            if (newAdminToken) {
              adminAccessToken = newAdminToken
              await supabase
                .from('user_tokens')
                .update({ access_token: newAdminToken, updated_at: new Date().toISOString() })
                .eq('user_id', session.user.id)
            }
          }

          const adminOAuth2 = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
          )
          adminOAuth2.setCredentials({ access_token: adminAccessToken })
          const adminCalendar = google.calendar({ version: 'v3', auth: adminOAuth2 })

          const adminEvent = {
            ...eventBody,
            summary: adminEventTitle,
            description: `グルコン候補日システムから自動登録（運営用）\n講師: ${instructorName}`,
          }

          await adminCalendar.events.insert({
            calendarId: 'primary',
            requestBody: adminEvent,
          })
          console.log('Calendar event created (admin):', adminEventTitle)
        } else {
          console.warn('運営のGoogleカレンダー連携情報が見つかりません。運営でGoogleログインを行ってください。')
        }
      } catch (adminError: any) {
        console.error('Failed to add event to admin calendar:', adminError)
        // 講師側の登録は成功しているので、運営側の失敗はログのみ
      }
    }

    return NextResponse.json({
      success: true,
      eventId: response.data.id,
      message: 'Googleカレンダーに予定を追加しました'
    })

  } catch (error: any) {
    console.error('Failed to add calendar event:', error)
    
    // エラーの種類に応じたメッセージ
    if (error.code === 401 || error.code === 403) {
      return NextResponse.json({
        error: 'Authentication failed',
        message: '講師のGoogleカレンダーへのアクセス権限がありません。講師に再度ログインしてもらってください。'
      }, { status: 401 })
    }

    return NextResponse.json({
      error: 'Failed to add event',
      message: 'Googleカレンダーへの予定追加に失敗しました'
    }, { status: 500 })
  }
}
