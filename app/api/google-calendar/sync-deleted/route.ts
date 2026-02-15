import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

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

/** 指定ユーザーのGoogleカレンダーからイベントを削除（404/410は無視） */
async function deleteFromUserCalendar(
  oauth2Client: InstanceType<typeof google.auth.OAuth2>,
  userId: string,
  eventId: string
): Promise<void> {
  const { data: tokenData } = await supabase
    .from('user_tokens')
    .select('access_token, refresh_token')
    .eq('user_id', userId)
    .single()
  if (!tokenData) return
  let accessToken = tokenData.access_token
  if (tokenData.refresh_token) {
    const refreshed = await refreshAccessToken(tokenData.refresh_token)
    if (refreshed) accessToken = refreshed
  }
  if (!accessToken) return
  oauth2Client.setCredentials({ access_token: accessToken })
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
  try {
    await calendar.events.delete({ calendarId: 'primary', eventId })
  } catch (e: any) {
    if (e.code !== 404 && e.code !== 410) throw e
  }
}

/** 講師または運営のGoogleカレンダーでイベントが削除されていたら、もう一方のカレンダーからも削除し、DBからも削除する */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: rows, error: fetchError } = await supabase
      .from('session_candidates')
      .select('id, instructor_id, google_calendar_event_id, admin_google_calendar_event_id')
      .or('google_calendar_event_id.not.is.null,admin_google_calendar_event_id.not.is.null')

    if (fetchError || !rows?.length) {
      return NextResponse.json({ deletedEventIds: [] })
    }

    const deletedIds: string[] = []
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    const adminUserId = session.user?.id

    for (const row of rows) {
      const rowAny = row as {
        id: string
        instructor_id: string
        google_calendar_event_id: string | null
        admin_google_calendar_event_id: string | null
      }
      let deletedFromInstructor = false
      let deletedFromAdmin = false

      // 講師カレンダーで削除されていないか確認
      if (rowAny.google_calendar_event_id) {
        try {
          const { data: tokenData } = await supabase
            .from('user_tokens')
            .select('access_token, refresh_token')
            .eq('user_id', rowAny.instructor_id)
            .single()

          if (tokenData) {
            let accessToken = tokenData.access_token
            if (tokenData.refresh_token) {
              const refreshed = await refreshAccessToken(tokenData.refresh_token)
              if (refreshed) accessToken = refreshed
            }
            if (accessToken) {
              oauth2Client.setCredentials({ access_token: accessToken })
              const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
              await calendar.events.get({
                calendarId: 'primary',
                eventId: rowAny.google_calendar_event_id,
              })
            }
          }
        } catch (e: any) {
          if (e.code === 404 || e.code === 410) deletedFromInstructor = true
        }
      }

      // 運営カレンダーで削除されていないか確認（講師側で未削除の場合のみ）
      if (!deletedFromInstructor && rowAny.admin_google_calendar_event_id && adminUserId) {
        try {
          const { data: adminTokenData } = await supabase
            .from('user_tokens')
            .select('access_token, refresh_token')
            .eq('user_id', adminUserId)
            .single()

          if (adminTokenData) {
            let adminToken = adminTokenData.access_token
            if (adminTokenData.refresh_token) {
              const refreshed = await refreshAccessToken(adminTokenData.refresh_token)
              if (refreshed) adminToken = refreshed
            }
            if (adminToken) {
              oauth2Client.setCredentials({ access_token: adminToken })
              const adminCalendar = google.calendar({ version: 'v3', auth: oauth2Client })
              await adminCalendar.events.get({
                calendarId: 'primary',
                eventId: rowAny.admin_google_calendar_event_id,
              })
            }
          }
        } catch (e: any) {
          if (e.code === 404 || e.code === 410) deletedFromAdmin = true
        }
      }

      const isDeleted = deletedFromInstructor || deletedFromAdmin
      if (isDeleted) {
        // もう一方のGoogleカレンダーからも削除する
        if (deletedFromInstructor && rowAny.admin_google_calendar_event_id && adminUserId) {
          await deleteFromUserCalendar(oauth2Client, adminUserId, rowAny.admin_google_calendar_event_id)
        }
        if (deletedFromAdmin && rowAny.google_calendar_event_id) {
          await deleteFromUserCalendar(oauth2Client, rowAny.instructor_id, rowAny.google_calendar_event_id)
        }
        const { error: delError } = await supabase
          .from('session_candidates')
          .delete()
          .eq('id', rowAny.id)
        if (!delError) deletedIds.push(rowAny.id)
      }
    }

    return NextResponse.json({ deletedEventIds: deletedIds })
  } catch (error) {
    console.error('Sync deleted events error:', error)
    return NextResponse.json(
      { error: 'Sync failed', deletedEventIds: [] },
      { status: 500 }
    )
  }
}
