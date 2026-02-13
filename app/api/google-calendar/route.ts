import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      )
    }

    // セッションからアクセストークンを取得
    const session = await getServerSession(authOptions)
    
    console.log('Session:', session) // デバッグ用
    console.log('AccessToken:', session?.accessToken) // デバッグ用
    
    if (!session?.accessToken) {
      // 未認証の場合は空の配列を返す
      console.log('No access token found')
      return NextResponse.json({ events: [], authenticated: false })
    }

    // Google Calendar APIクライアントを作成
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    
    oauth2Client.setCredentials({
      access_token: session.accessToken,
    })

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    // カレンダーの予定を取得
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: `${startDate}T00:00:00+09:00`,
      timeMax: `${endDate}T23:59:59+09:00`,
      singleEvents: true,
      orderBy: 'startTime',
    })

    const events = response.data.items?.map((event) => ({
      id: event.id,
      summary: event.summary || '(タイトルなし)',
      start: event.start,
      end: event.end,
    })) || []

    console.log('Fetched events:', events.length, events) // デバッグ用

    return NextResponse.json({ events, authenticated: true })
  } catch (error) {
    console.error('Error fetching Google Calendar events:', error)
    return NextResponse.json(
      { error: 'Failed to fetch calendar events', events: [] },
      { status: 500 }
    )
  }
}
