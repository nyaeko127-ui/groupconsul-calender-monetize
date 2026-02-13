'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signIn, signOut } from 'next-auth/react'
import { useEventStore } from '@/store/eventStore'
import Calendar from '@/components/Calendar'
import EventForm from '@/components/EventForm'
import { SessionCandidate, EventFormData, User, TimeSlot, GoogleCalendarEvent } from '@/types'

// 日付をローカル YYYY-MM-DD に変換（コンポーネント外で定義）
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function Home() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { currentUser, events, addEvent, getEventsByInstructor, fetchEvents, setCurrentUser } =
    useEventStore()
  const [showForm, setShowForm] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set()) // "2026-01-26_21:00-23:00" 形式
  const [instructorEvents, setInstructorEvents] = useState<SessionCandidate[]>([])
  const [allEventsForCalendar, setAllEventsForCalendar] = useState<SessionCandidate[]>([])
  const [notification, setNotification] = useState<{ message: string; event: SessionCandidate } | null>(null)
  const [notifiedEventIds, setNotifiedEventIds] = useState<Set<string>>(new Set())
  const [googleCalendarEvents, setGoogleCalendarEvents] = useState<GoogleCalendarEvent[]>([])
  const [googleCalendarConflicts, setGoogleCalendarConflicts] = useState<Map<string, Set<TimeSlot>>>(new Map())
  const [isGoogleConnected, setIsGoogleConnected] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(true)
  const [instructorName, setInstructorName] = useState<string>('')
  const [isEditingName, setIsEditingName] = useState(false)
  const [tempName, setTempName] = useState('')
  const [showMemoForm, setShowMemoForm] = useState(false)
  const [memoText, setMemoText] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [genre, setGenre] = useState<string>('')
  const [isEditingGenre, setIsEditingGenre] = useState(false)
  const [tempGenre, setTempGenre] = useState('')

  // アバター画像とジャンルを取得
  useEffect(() => {
    const fetchProfile = async () => {
      if (status !== 'authenticated') return
      try {
        const response = await fetch('/api/avatar')
        const data = await response.json()
        if (data.avatarUrl) {
          setAvatarUrl(data.avatarUrl)
        }
        if (data.genre) {
          setGenre(data.genre)
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error)
      }
    }
    fetchProfile()
  }, [status])

  // ジャンルを保存
  const saveGenre = async (newGenre: string) => {
    try {
      const response = await fetch('/api/genre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ genre: newGenre }),
      })
      if (response.ok) {
        setGenre(newGenre)
        setIsEditingGenre(false)
      } else {
        alert('ジャンルの保存に失敗しました')
      }
    } catch (error) {
      console.error('Failed to save genre:', error)
      alert('ジャンルの保存に失敗しました')
    }
  }

  // アバター画像をアップロード
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/avatar/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      if (response.ok && data.avatarUrl) {
        setAvatarUrl(data.avatarUrl)
        alert('アバター画像を更新しました')
      } else {
        alert(data.error || 'アップロードに失敗しました')
      }
    } catch (error) {
      console.error('Avatar upload error:', error)
      alert('アップロードに失敗しました')
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  // localStorageから講師名を読み込む
  useEffect(() => {
    if (session?.user?.email) {
      const savedName = localStorage.getItem(`instructor-name-${session.user.email}`)
      if (savedName) {
        setInstructorName(savedName)
      } else {
        setInstructorName(session.user.name || '講師')
      }
    }
  }, [session])

  // 講師名を保存
  const saveInstructorName = (name: string) => {
    if (session?.user?.email && name.trim()) {
      localStorage.setItem(`instructor-name-${session.user.email}`, name.trim())
      setInstructorName(name.trim())
      setIsEditingName(false)
    }
  }

  // Googleログインしたユーザー情報から講師ユーザーを作成
  const getInstructorUser = useCallback((): User => {
    if (session?.user) {
      return {
        id: session.user.id || session.user.email || 'unknown',
        name: instructorName || session.user.name || '講師',
        email: session.user.email || '',
        role: 'instructor' as const,
      }
    }
    return {
      id: 'guest',
      name: 'ゲスト',
      email: '',
      role: 'instructor' as const,
    }
  }, [session, instructorName])

  const updateEvents = useCallback(() => {
    const user = getInstructorUser()
    const myEvents = getEventsByInstructor(user.id)
    setInstructorEvents(myEvents)

    // 他の講師の候補がある日付をチェック
    const otherInstructorEvents = events.filter(
      (event) => event.instructorId !== user.id
    )
    
    // 他の講師のイベントを「候補あり」として個別に表示
    const otherEventsDisplay: SessionCandidate[] = otherInstructorEvents.map((event) => ({
      ...event,
      id: `other-${event.id}`,
      instructorId: 'other',
      instructorName: '候補あり',
    }))

    setAllEventsForCalendar([...myEvents, ...otherEventsDisplay])
  }, [events, getEventsByInstructor, getInstructorUser])

  useEffect(() => {
    fetchEvents()
    // 定期的にデータを再取得（5秒ごと）
    const interval = setInterval(() => {
      fetchEvents()
    }, 5000)
    return () => clearInterval(interval)
  }, [fetchEvents])

  // Googleログイン時にcurrentUserを更新（講師カレンダーでは常にinstructorとして扱う）
  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      const user = getInstructorUser()
      // 講師カレンダーでは常にinstructorロールとして設定
      setCurrentUser({ ...user, role: 'instructor' })
    }
  }, [status, session, getInstructorUser, setCurrentUser, instructorName])

  useEffect(() => {
    // eventsが初期化されている場合のみ更新
    if (Array.isArray(events)) {
      updateEvents()
    }
  }, [events, updateEvents])

  // Googleカレンダーの予定を取得する関数
  const fetchGoogleCalendar = async (targetDate?: Date) => {
    // セッションがない場合はスキップ
    if (status !== 'authenticated') {
      setIsGoogleConnected(false)
      setGoogleCalendarEvents([])
      setGoogleCalendarConflicts(new Map())
      return
    }

    setIsGoogleLoading(true)
    try {
      const baseDate = targetDate || new Date()
      // 表示月の前月から翌月までの3ヶ月分を取得
      const startDate = new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1)
      const endDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 2, 0)
      const startStr = startDate.toISOString().split('T')[0]
      const endStr = endDate.toISOString().split('T')[0]

      const response = await fetch(
        `/api/google-calendar?startDate=${startStr}&endDate=${endStr}`
      )
      const data = await response.json()
      console.log('Google Calendar API response:', data)
      if (data.authenticated && data.events) {
        setIsGoogleConnected(true)
        setGoogleCalendarEvents(data.events)
        checkTimeConflicts(data.events)
        console.log('Google Calendar events loaded:', data.events.length)
      } else {
        console.log('Google Calendar not authenticated or no events:', data)
        setIsGoogleConnected(false)
      }
    } catch (error) {
      console.error('Failed to fetch Google Calendar:', error)
      setIsGoogleConnected(false)
    } finally {
      setIsGoogleLoading(false)
    }
  }

  // 初回読み込み時にGoogleカレンダーを取得
  useEffect(() => {
    fetchGoogleCalendar()
  }, [status, session])

  // カレンダーの月が変わった時にGoogleカレンダーを再取得
  const handleMonthChange = (date: Date) => {
    fetchGoogleCalendar(date)
  }

  // 日本時間での日付文字列を取得
  const toJapanDateStr = (date: Date): string => {
    const year = date.toLocaleString('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric' })
    const month = date.toLocaleString('en-US', { timeZone: 'Asia/Tokyo', month: '2-digit' })
    const day = date.toLocaleString('en-US', { timeZone: 'Asia/Tokyo', day: '2-digit' })
    return `${year}-${month}-${day}`
  }

  // Googleカレンダーの予定と時間枠の重複をチェック
  const checkTimeConflicts = (gcalEvents: GoogleCalendarEvent[]) => {
    const conflicts = new Map<string, Set<TimeSlot>>()

    gcalEvents.forEach((gcalEvent) => {
      // 終日イベントの場合
      if (gcalEvent.start.date && !gcalEvent.start.dateTime) {
        const startDate = new Date(gcalEvent.start.date)
        const endDate = gcalEvent.end.date ? new Date(gcalEvent.end.date) : startDate
        
        // 終日イベントは開始日から終了日の前日までをカバー
        const currentDate = new Date(startDate)
        while (currentDate < endDate) {
          const dateStr = toJapanDateStr(currentDate)
          const conflictsForDate = conflicts.get(dateStr) || new Set<TimeSlot>()
          // 終日イベントは両方の時間枠と重複
          conflictsForDate.add('21:00-23:00')
          conflictsForDate.add('22:00-24:00')
          conflicts.set(dateStr, conflictsForDate)
          currentDate.setDate(currentDate.getDate() + 1)
        }
        return
      }

      // 時間指定イベントの場合
      if (!gcalEvent.start.dateTime) return

      const eventStart = new Date(gcalEvent.start.dateTime)
      const eventEnd = gcalEvent.end.dateTime ? new Date(gcalEvent.end.dateTime) : eventStart

      // 日付文字列を取得（日本時間で明示的に）
      const startDateStr = toJapanDateStr(eventStart)
      const endDateStr = toJapanDateStr(eventEnd)

      // 日本時間での時刻を取得
      const startHour = parseInt(
        eventStart.toLocaleString('en-US', { timeZone: 'Asia/Tokyo', hour: '2-digit', hour12: false })
      )
      const startMinute = parseInt(
        eventStart.toLocaleString('en-US', { timeZone: 'Asia/Tokyo', minute: '2-digit' })
      )
      const endHour = parseInt(
        eventEnd.toLocaleString('en-US', { timeZone: 'Asia/Tokyo', hour: '2-digit', hour12: false })
      )
      const endMinute = parseInt(
        eventEnd.toLocaleString('en-US', { timeZone: 'Asia/Tokyo', minute: '2-digit' })
      )

      // 開始時刻と終了時刻を分単位で計算
      const eventStartMinutes = startHour * 60 + startMinute
      let eventEndMinutes = endHour * 60 + endMinute

      // 日をまたぐイベントの場合、開始日は24:00（1440分）まで続くとみなす
      const isDifferentDay = startDateStr !== endDateStr
      if (isDifferentDay) {
        eventEndMinutes = 24 * 60 // 1440分（24:00）
      }

      const conflictsForDate = conflicts.get(startDateStr) || new Set<TimeSlot>()

      // 21:00-23:00 (1260-1380分) との重複チェック
      // 終了時間が21:00ちょうどの場合は表示する（> を使用）
      const slot21Start = 21 * 60 // 1260分
      const slot21End = 23 * 60 // 1380分
      if (eventStartMinutes < slot21End && eventEndMinutes > slot21Start) {
        conflictsForDate.add('21:00-23:00')
      }

      // 22:00-24:00 (1320-1440分) との重複チェック
      // 終了時間が22:00ちょうどの場合は表示する（> を使用）
      const slot22Start = 22 * 60 // 1320分
      const slot22End = 24 * 60 // 1440分
      if (eventStartMinutes < slot22End && eventEndMinutes > slot22Start) {
        conflictsForDate.add('22:00-24:00')
      }

      if (conflictsForDate.size > 0) {
        conflicts.set(startDateStr, conflictsForDate)
      }
    })

    setGoogleCalendarConflicts(conflicts)
  }

  useEffect(() => {
    // 確定された候補を検知して通知を表示
    if (!events || events.length === 0) return

    const user = currentUser || {
      id: 'instructor-1',
      name: '講師',
      email: 'instructor@example.com',
      role: 'instructor' as const,
    }

    const myConfirmedEvents = events.filter(
      (event) =>
        event.instructorId === user.id &&
        event.status === 'confirmed' &&
        event.confirmedAt
    )

    myConfirmedEvents.forEach((event) => {
      // 既に通知したイベントはスキップ
      if (notifiedEventIds.has(event.id)) {
        return
      }

      // 確定日時が5分以内なら通知
      if (event.confirmedAt) {
        const confirmedTime = new Date(event.confirmedAt).getTime()
        const now = Date.now()
        const fiveMinutes = 5 * 60 * 1000

        if (now - confirmedTime < fiveMinutes) {
          const dateStr = event.date.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
          const timeStr = event.timeSlot === '21:00-23:00' ? '21時〜23時' : '22時〜24時'
          const message = `${dateStr} ${timeStr} の候補が確定されました！`

          setNotification({ message, event })
          setNotifiedEventIds((prev) => new Set(prev).add(event.id))

          // ブラウザ通知API（許可されている場合）
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('候補が確定されました', {
              body: message,
              icon: '/favicon.ico',
            })
          } else if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then((permission) => {
              if (permission === 'granted') {
                new Notification('候補が確定されました', {
                  body: message,
                  icon: '/favicon.ico',
                })
              }
            })
          }

          // 3秒後に自動で通知を閉じる
          setTimeout(() => {
            setNotification(null)
          }, 5000)
        }
      }
    })
  }, [events, currentUser, notifiedEventIds])

  // 日付クリック時のフォーム表示は無効化（チェックボックスで選択する方式に統一）
  const handleSelectSlot = (slotInfo: { start: Date; end: Date; slots?: Date[] }) => {
    // チェックボックスで選択するため、何もしない
  }

  const handleToggleSlot = (dateStr: string, timeSlot: TimeSlot) => {
    const key = `${dateStr}_${timeSlot}`
    setSelectedSlots((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleRegisterFromSelected = () => {
    if (selectedSlots.size === 0) {
      alert('候補を選択してください。カレンダーのチェックボックスで日付と時間枠を選んでください。')
      return
    }
    // メモ入力フォームを表示
    setMemoText('')
    setShowMemoForm(true)
  }

  const handleSubmitWithMemo = () => {
    const user = getInstructorUser()

    selectedSlots.forEach((key) => {
      const [dateStr, timeSlot] = key.split('_') as [string, TimeSlot]
      const [y, m, day] = dateStr.split('-').map(Number)
      const date = new Date(y, m - 1, day, 0, 0, 0, 0)
      const yearMonth = `${y}-${String(m).padStart(2, '0')}`

      const newEvent: SessionCandidate = {
        id: `event-${Date.now()}-${Math.random()}-${key}`,
        instructorId: user.id,
        instructorName: user.name,
        month: yearMonth,
        date: date,
        timeSlot: timeSlot,
        memo: memoText || undefined,
        status: 'submitted',
        submittedAt: new Date(),
      }

      addEvent(newEvent)
    })

    const count = selectedSlots.size
    setSelectedSlots(new Set())
    setShowMemoForm(false)
    setMemoText('')
    alert(`${count}件の候補を登録しました。`)
  }

  const handleSubmitEvent = (formData: EventFormData) => {
    const user = getInstructorUser()

    // 新規作成モード
    const selectedDate = formData.date
    const yearMonth = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`
    const newEvent: SessionCandidate = {
      id: `event-${Date.now()}-${Math.random()}`,
      instructorId: user.id,
      instructorName: user.name,
      month: yearMonth,
      date: selectedDate,
      timeSlot: formData.timeSlot,
      memo: formData.memo,
      status: 'submitted',
      submittedAt: new Date(),
    }

    addEvent(newEvent)

    setShowForm(false)
    setSelectedDate(null)
  }

  const handleSelectEvent = (event: SessionCandidate) => {
    // 講師側では編集・削除機能は使用しない（要件により）
    // 確定状態の表示のみ
  }

  const user = getInstructorUser()
  const isAdmin = session?.user?.isAdmin || false

  // 未ログインの場合はログイン画面を表示
  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-4">グルコン候補日提出システム</h1>
          <p className="text-gray-600 mb-6">
            Googleアカウントでログインして、グルコンの候補日を提出してください。
          </p>
          <button
            onClick={() => signIn('google')}
            className="w-full bg-white border border-gray-300 text-gray-700 px-4 py-3 rounded-md hover:bg-gray-50 flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Googleアカウントでログイン
          </button>
        </div>
      </div>
    )
  }

  // ローディング中
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <h1 className="text-xl sm:text-2xl font-bold">講師カレンダー</h1>
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
              {/* ジャンル表示・編集 */}
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">ジャンル:</span>
                {isEditingGenre ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={tempGenre}
                      onChange={(e) => setTempGenre(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-sm w-24"
                      placeholder="例: ビジネス"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          saveGenre(tempGenre)
                        } else if (e.key === 'Escape') {
                          setIsEditingGenre(false)
                        }
                      }}
                    />
                    <button
                      onClick={() => saveGenre(tempGenre)}
                      className="text-green-600 hover:text-green-800 text-sm px-1"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setIsEditingGenre(false)}
                      className="text-gray-500 hover:text-gray-700 text-sm px-1"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setTempGenre(genre)
                      setIsEditingGenre(true)
                    }}
                    className="text-sm text-gray-700 hover:text-blue-600 hover:underline"
                  >
                    {genre || '未設定'}
                  </button>
                )}
              </div>

              {/* ログイン状態表示と講師名編集 */}
              <div className="flex items-center gap-2">
                {/* アバター画像（クリックでアップロード） */}
                <label className="relative cursor-pointer group">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleAvatarUpload}
                    className="hidden"
                    disabled={isUploadingAvatar}
                  />
                  {isUploadingAvatar ? (
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                      <svg className="w-5 h-5 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    </div>
                  ) : (
                    <div className="relative">
                      <img
                        src={avatarUrl || session?.user?.image || '/default-avatar.png'}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover border-2 border-gray-200 group-hover:border-blue-400 transition-colors"
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded-full flex items-center justify-center transition-all">
                        <svg className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                    </div>
                  )}
                </label>
                {isEditingName ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-sm w-32"
                      placeholder="講師名を入力"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          saveInstructorName(tempName)
                        } else if (e.key === 'Escape') {
                          setIsEditingName(false)
                        }
                      }}
                    />
                    <button
                      onClick={() => saveInstructorName(tempName)}
                      className="text-green-600 hover:text-green-800 text-sm px-1"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setIsEditingName(false)}
                      className="text-gray-500 hover:text-gray-700 text-sm px-1"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setTempName(user.name)
                      setIsEditingName(true)
                    }}
                    className="text-gray-700 text-sm hover:text-blue-600 hover:underline flex items-center gap-1"
                    title="クリックして講師名を編集"
                  >
                    {user.name}講師
                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}
                {isAdmin && (
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                    運営
                  </span>
                )}
              </div>
              {/* 運営の場合のみ運営カレンダーへのリンクを表示 */}
              {isAdmin && (
                <a
                  href="/admin"
                  className="bg-purple-600 text-white px-3 py-2 rounded-md hover:bg-purple-700 text-sm"
                >
                  運営カレンダー
                </a>
              )}
              <button
                onClick={() => signOut()}
                className="text-gray-500 text-sm hover:text-gray-700 px-3 py-2 border border-gray-300 rounded-md"
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {notification && (
          <div className="mb-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative animate-fade-in">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="font-medium">{notification.message}</p>
              </div>
              <button
                onClick={() => setNotification(null)}
                className="text-green-700 hover:text-green-900"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}
        {/* Googleカレンダー連携状態の表示 */}
        {isGoogleLoading ? (
          <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded">
            <p className="text-sm">
              Googleカレンダーを確認中...
            </p>
          </div>
        ) : isGoogleConnected ? (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
            <p className="text-sm">
              Googleカレンダー連携済み（{googleCalendarEvents.length} 件の予定を取得）
            </p>
          </div>
        ) : (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            <p className="text-sm">
              Googleカレンダーと連携できていません。ページを再読み込みするか、再度ログインしてください。
            </p>
          </div>
        )}

        {/* カレンダー表示セクション（独立した白いカード・内部スクロールなしでフル表示） */}
        <section className="bg-white rounded-lg shadow p-4 sm:p-6 mb-8 overflow-visible" style={{ maxHeight: 'none', height: 'auto' }} aria-label="開催候補日時の提出">
          <h2 className="text-xl font-semibold mb-4">開催候補日時の提出</h2>
          <p className="text-gray-600 mb-4">
            カレンダーの日付のチェックボックスで候補日を選択するか、日付をクリックして候補日時を入力してください。
          </p>
          {selectedSlots.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <button
                type="button"
                onClick={handleRegisterFromSelected}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                選択した候補を登録（{selectedSlots.size}件）
              </button>
              <button
                type="button"
                onClick={() => setSelectedSlots(new Set())}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                選択を解除
              </button>
            </div>
          )}
          <Calendar
            events={allEventsForCalendar}
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            selectedSlots={selectedSlots}
            onToggleSlot={handleToggleSlot}
            googleCalendarConflicts={googleCalendarConflicts}
            submittedSlots={instructorEvents}
            defaultView="month"
            maxEventsPerDay={1}
            onMonthChange={handleMonthChange}
          />
        </section>

        {/* 提出済み候補一覧セクション（別の白いカード） */}
        <section className="bg-white rounded-lg shadow p-6" aria-label="提出済み候補一覧">
          <h2 className="text-xl font-semibold mb-4">提出済み候補一覧</h2>
          <div className="space-y-2">
            {instructorEvents.length === 0 ? (
              <p className="text-gray-500">まだ候補が提出されていません</p>
            ) : (
              instructorEvents
                .sort((a, b) => a.date.getTime() - b.date.getTime())
                .map((event) => (
                  <div
                    key={event.id}
                    className={`p-4 border rounded-lg ${
                      event.status === 'confirmed'
                        ? 'border-green-500 bg-green-50'
                        : 'border-yellow-500 bg-yellow-50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">
                          {event.date.toLocaleDateString('ja-JP', {
                            timeZone: 'Asia/Tokyo',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                        <p className="text-gray-600">
                          {event.timeSlot === '21:00-23:00' ? '21時〜23時' : '22時〜24時'}
                        </p>
                        {event.memo && (
                          <p className="text-sm text-gray-600 mt-1 italic">
                            メモ: {event.memo}
                          </p>
                        )}
                        <p className="text-sm text-gray-500 mt-1">
                          提出日: {event.submittedAt.toLocaleString('ja-JP', {
                            timeZone: 'Asia/Tokyo',
                          })}
                        </p>
                        {event.status === 'confirmed' && event.confirmedAt && (
                          <p className="text-sm text-green-600 mt-1 font-medium">
                            確定日: {event.confirmedAt.toLocaleString('ja-JP', {
                              timeZone: 'Asia/Tokyo',
                            })}
                          </p>
                        )}
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          event.status === 'confirmed'
                            ? 'bg-green-200 text-green-800'
                            : 'bg-yellow-200 text-yellow-800'
                        }`}
                      >
                        {event.status === 'confirmed'
                          ? '確定'
                          : '候補'}
                      </span>
                    </div>
                  </div>
                ))
            )}
          </div>
        </section>

        {/* メモ入力フォーム（チェックボックス選択時） */}
        {showMemoForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h2 className="text-xl font-bold mb-4">候補日時を提出</h2>
              
              <div className="mb-6">
                <p className="text-sm text-gray-600 mb-2">選択した候補：</p>
                <div className="bg-gray-50 p-3 rounded-md max-h-40 overflow-y-auto">
                  {Array.from(selectedSlots).map((slot) => {
                    const [dateStr, timeSlot] = slot.split('_')
                    const [y, m, d] = dateStr.split('-').map(Number)
                    const date = new Date(y, m - 1, d)
                    const dateDisplay = date.toLocaleDateString('ja-JP', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      weekday: 'short',
                    })
                    const timeDisplay = timeSlot === '21:00-23:00' ? '21時〜23時' : '22時〜24時'
                    return (
                      <div key={slot} className="text-sm py-1">
                        {dateDisplay} {timeDisplay}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleSubmitWithMemo}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 font-medium"
                >
                  提出
                </button>
                <button
                  onClick={() => {
                    setShowMemoForm(false)
                    setMemoText('')
                  }}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-300 font-medium"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}