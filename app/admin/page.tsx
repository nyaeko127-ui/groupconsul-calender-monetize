'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useEventStore } from '@/store/eventStore'
import Calendar from '@/components/Calendar'
import EventForm from '@/components/EventForm'
import { SessionCandidate, User, EventFormData } from '@/types'

const TIME_LABELS: Record<string, string> = {
  '10:00-12:00': '10時〜12時',
  '12:00-14:00': '12時〜14時',
  '21:00-23:00': '21時〜23時',
  '22:00-24:00': '22時〜24時',
}

/** カレンダー表示の日付を YYYY-MM-DD で返す（toISOString だとタイムゾーンで1日ずれるため API 用に使用） */
function formatDateYYYYMMDD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function AdminPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { currentUser, events, updateEventStatus, updateEvent, deleteEvents, fetchAllEvents, setCurrentUser, trashedEvents, moveToTrash, restoreFromTrash, fetchTrashedEvents } =
    useEventStore()
  const [pendingEvents, setPendingEvents] = useState<SessionCandidate[]>([])
  const [confirmedEvents, setConfirmedEvents] = useState<SessionCandidate[]>([])
  const [selectedEvent, setSelectedEvent] = useState<SessionCandidate | null>(null)
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set())
  const [selectedEventIdForEditDelete, setSelectedEventIdForEditDelete] = useState<string>('')
  const [showEditForm, setShowEditForm] = useState(false)
  const [showActionModal, setShowActionModal] = useState(false)
  const [actionModalEvent, setActionModalEvent] = useState<SessionCandidate | null>(null)
  const [selectedAction, setSelectedAction] = useState<string>('confirm')
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false)
  const [calendarSelectedIds, setCalendarSelectedIds] = useState<Set<string>>(new Set())

  // 運営かどうかを判定
  const isAdmin = session?.user?.isAdmin || false

  // すべてのフックを早期リターンの前に配置
  const updateEvents = useCallback(() => {
    const allEvents = events.filter((event) => event.instructorName !== '候補あり')
    setPendingEvents(allEvents.filter((event) => event.status === 'submitted'))
    setConfirmedEvents(allEvents.filter((event) => event.status === 'confirmed'))
  }, [events])

  useEffect(() => {
    fetchAllEvents()
    fetchTrashedEvents()
    const interval = setInterval(() => {
      fetchAllEvents()
      fetchTrashedEvents()
    }, 5000)
    return () => clearInterval(interval)
  }, [fetchAllEvents, fetchTrashedEvents])

  // 運営ユーザーを設定
  useEffect(() => {
    if (status === 'authenticated' && session?.user && isAdmin) {
      const adminUser: User = {
        id: session.user.id || session.user.email || 'admin',
        name: session.user.name || '運営',
        email: session.user.email || '',
        role: 'admin',
      }
      setCurrentUser(adminUser)
    }
  }, [status, session, isAdmin, setCurrentUser])

  useEffect(() => {
    updateEvents()
  }, [events, updateEvents])

  // 確定枠（確定済みと同じ日×同じ時間帯）に残っている未確定候補
  const submittedInConfirmedSlots = useMemo(() => {
    const confirmedSlotKeys = new Set(
      confirmedEvents.map((e) => `${e.date.toISOString().split('T')[0]}_${e.timeSlot}`)
    )
    return pendingEvents.filter((e) =>
      confirmedSlotKeys.has(`${e.date.toISOString().split('T')[0]}_${e.timeSlot}`)
    )
  }, [confirmedEvents, pendingEvents])

  // 未ログインまたは運営以外はアクセス不可
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-4">アクセス権限がありません</h1>
          <p className="text-gray-600 mb-6">
            このページにアクセスするにはログインが必要です。
          </p>
          <a
            href="/"
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700"
          >
            ログインページへ
          </a>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-4">アクセス権限がありません</h1>
          <p className="text-gray-600 mb-6">
            このページは運営専用です。
          </p>
          <a
            href="/"
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700"
          >
            講師カレンダーへ
          </a>
        </div>
      </div>
    )
  }

  const allEventsForDropdown = events
    .filter((e) => e.instructorName !== '候補あり')
    .sort((a, b) => {
      const d = a.date.getTime() - b.date.getTime()
      if (d !== 0) return d
      return a.instructorName.localeCompare(b.instructorName)
    })

  const eventForEditDelete = allEventsForDropdown.find((e) => e.id === selectedEventIdForEditDelete) ?? null

  const formatEventOption = (e: SessionCandidate) => {
    const d = e.date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
    const t = TIME_LABELS[e.timeSlot] || e.timeSlot
    return `${e.instructorName} | ${d} | ${t}`
  }

  const handleAdminEditSubmit = (formData: EventFormData) => {
    if (!eventForEditDelete) return
    const d = formData.date
    const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    updateEvent(eventForEditDelete.id, {
      date: d,
      month: yearMonth,
      timeSlot: formData.timeSlot,
      memo: formData.memo,
    })
    setShowEditForm(false)
    setSelectedEventIdForEditDelete('')
  }

  const handleAdminDelete = async () => {
    if (!eventForEditDelete) return
    if (!confirm(`${formatEventOption(eventForEditDelete)} をゴミ箱に移動しますか？`)) return

    try {
      await moveToTrash([eventForEditDelete.id])
      setSelectedEventIdForEditDelete('')
    } catch (e) {
      console.error('ゴミ箱への移動に失敗しました', e)
      alert('ゴミ箱への移動に失敗しました')
    }
  }

  /** 同じ日付の確定済み一覧（対象イベント除く） */
  const getConfirmedOnDate = (dateStr: string, excludeEventId?: string): SessionCandidate[] => {
    return events.filter(
      (e) =>
        e.status === 'confirmed' &&
        e.id !== excludeEventId &&
        e.date.toISOString().split('T')[0] === dateStr
    )
  }

  /**
   * 確定可否チェック（同じ日・同じ時間帯は2件まで、3件以上でエラー）。
   * 問題なければ null。エラー時は { type: 'slot_full' } を返す。
   */
  const checkCanConfirm = (event: SessionCandidate): { type: 'slot_full' } | null => {
    const eventDateStr = event.date.toISOString().split('T')[0]
    const sameSlotConfirmed = getConfirmedOnDate(eventDateStr, event.id).filter(
      (e) => e.timeSlot === event.timeSlot
    )
    if (sameSlotConfirmed.length >= 2) return { type: 'slot_full' }
    return null
  }

  const handleConfirmEvent = async (eventId: string, adminUser?: User) => {
    const eventToConfirm = events.find((e) => e.id === eventId)
    if (!eventToConfirm) return

    const dateStr = eventToConfirm.date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const timeStr = TIME_LABELS[eventToConfirm.timeSlot] || eventToConfirm.timeSlot

    const check = checkCanConfirm(eventToConfirm)
    if (check) {
      alert(
        `${dateStr} の${timeStr}は既に2件確定済みです。\n\n時間の重複が3件以上になるため、これ以上は確定できません。`
      )
      return
    }

    const adminUserForLog = adminUser || user
    updateEventStatus(eventId, 'confirmed', adminUserForLog)

    setSelectedEvent(null)
    setSelectedEventIds((prev) => {
      const newSet = new Set(prev)
      newSet.delete(eventId)
      return newSet
    })
  }

  const handleSelectEvent = (event: SessionCandidate) => {
    // 複数選択モードの場合
    if (isMultiSelectMode) {
      setCalendarSelectedIds((prev) => {
        const newSet = new Set(prev)
        if (newSet.has(event.id)) {
          newSet.delete(event.id)
        } else {
          newSet.add(event.id)
        }
        return newSet
      })
      return
    }
    
    // 通常モード：カレンダー上の候補日をクリックしたときの処理
    if (event.status === 'submitted') {
      setActionModalEvent(event)
      setSelectedAction('confirm')
      setShowActionModal(true)
    } else {
      setSelectedEvent(event)
    }
  }

  const handleActionModalSubmit = () => {
    if (!actionModalEvent) return

    if (selectedAction === 'confirm') {
      handleConfirmEvent(actionModalEvent.id, user)
    } else if (selectedAction === 'edit') {
      setSelectedEventIdForEditDelete(actionModalEvent.id)
      setShowEditForm(true)
    } else if (selectedAction === 'delete') {
      handleAdminDeleteForEvent(actionModalEvent)
    }

    setShowActionModal(false)
    setActionModalEvent(null)
  }

  const handleAdminDeleteForEvent = async (event: SessionCandidate) => {
    const dateStr = event.date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const timeStr = TIME_LABELS[event.timeSlot] || event.timeSlot
    if (confirm(`${event.instructorName}の${dateStr} ${timeStr} の候補をゴミ箱に移動しますか？`)) {
      try {
        await moveToTrash([event.id])
      } catch (e) {
        console.error('ゴミ箱への移動に失敗しました', e)
        alert('ゴミ箱への移動に失敗しました')
      }
    }
  }

  const handleToggleSelectEvent = (eventId: string) => {
    setSelectedEventIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(eventId)) {
        newSet.delete(eventId)
      } else {
        newSet.add(eventId)
      }
      return newSet
    })
  }

  const handleSelectAll = () => {
    if (selectedEventIds.size === pendingEvents.length) {
      setSelectedEventIds(new Set())
    } else {
      setSelectedEventIds(new Set(pendingEvents.map((event) => event.id)))
    }
  }

  const handleBulkConfirm = async () => {
    if (selectedEventIds.size === 0) {
      alert('確定する候補を選択してください')
      return
    }

    // 選択した候補を取得
    const eventsToConfirm = pendingEvents.filter((event) =>
      selectedEventIds.has(event.id)
    )

    // 既存確定との重複チェック（同じ日・同じ時間帯は2件まで、3件以上でエラー）
    const confirmErrors: string[] = []
    eventsToConfirm.forEach((event) => {
      const check = checkCanConfirm(event)
      if (check) {
        const dateStr = event.date.toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
        const timeStr = TIME_LABELS[event.timeSlot] || event.timeSlot
        confirmErrors.push(`${dateStr} ${timeStr}（${event.instructorName}講師）→ この時間帯は既に2件確定済みのため追加できません`)
      }
    })
    if (confirmErrors.length > 0) {
      alert(
        '以下の候補は確定できません：\n\n' +
          confirmErrors.join('\n') +
          '\n\n同じ時間帯は2件までです。3件以上は確定できません。'
      )
      return
    }

    // 選択候補同士：同じ日・同じ時間帯で3件以上にならないか
    const dateSlotKey = (d: string, slot: string) => `${d}_${slot}`
    const dateSlotToCount = new Map<string, { existing: number; inBatch: number }>()
    eventsToConfirm.forEach((e) => {
      const d = e.date.toISOString().split('T')[0]
      const key = dateSlotKey(d, e.timeSlot)
      if (!dateSlotToCount.has(key)) {
        const existing = getConfirmedOnDate(d).filter(
          (c) => c.timeSlot === e.timeSlot && !eventsToConfirm.some((t) => t.id === c.id)
        ).length
        const inBatch = eventsToConfirm.filter((t) => t.date.toISOString().split('T')[0] === d && t.timeSlot === e.timeSlot).length
        dateSlotToCount.set(key, { existing, inBatch })
      }
    })
    for (const [key, { existing, inBatch }] of dateSlotToCount) {
      if (existing + inBatch >= 3) {
        const parts = key.split('_')
        const dateStr = parts[0]
        const timeSlot = parts.slice(1).join('_')
        const ev = eventsToConfirm.find(
          (e) => e.date.toISOString().split('T')[0] === dateStr && e.timeSlot === timeSlot
        )
        if (ev) {
          const displayDate = ev.date.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
          const timeStr = TIME_LABELS[ev.timeSlot] || ev.timeSlot
          alert(
            `${displayDate} の${timeStr}は確定が3件以上になります。\n\n時間の重複が3件以上あるため、同じ時間帯は2件までです。`
          )
          return
        }
      }
    }

    if (
      confirm(
        `選択した${selectedEventIds.size}件の候補を確定しますか？`
      )
    ) {
      // 各候補を確定
      for (const eventId of selectedEventIds) {
        const event = eventsToConfirm.find(e => e.id === eventId)
        if (!event) continue

        updateEventStatus(eventId, 'confirmed', user)
      }

      setSelectedEventIds(new Set())
    }
  }

  const handleBulkDelete = async () => {
    if (selectedEventIds.size === 0) {
      alert('削除する候補を選択してください')
      return
    }

    if (
      confirm(
        `選択した${selectedEventIds.size}件の候補をゴミ箱に移動しますか？`
      )
    ) {
      try {
        await moveToTrash([...selectedEventIds])
        setSelectedEventIds(new Set())
      } catch (e) {
        console.error('ゴミ箱への移動に失敗しました', e)
        alert('ゴミ箱への移動に失敗しました')
      }
    }
  }

  const handleDeleteConfirmedSlotLosers = async () => {
    if (submittedInConfirmedSlots.length === 0) {
      alert('削除対象の未確定候補はありません')
      return
    }
    if (
      confirm(
        `確定済みの枠に残っている未確定候補 ${submittedInConfirmedSlots.length}件をゴミ箱に移動しますか？\n\n（確定と同じ日・同じ時間帯の未確定候補のみが対象です。確定済みの予定は削除されません。）`
      )
    ) {
      try {
        await moveToTrash(submittedInConfirmedSlots.map((e) => e.id))
        setSelectedEventIds(new Set())
      } catch (e) {
        console.error('一括削除に失敗しました', e)
        alert(
          'ゴミ箱への移動に失敗しました。時間をおいて再度お試しください。\n（データベースが一時停止している可能性があります）'
        )
      }
    }
  }

  const handleEmptyTrash = async () => {
    if (trashedEvents.length === 0) return
    if (
      confirm(
        `ゴミ箱の${trashedEvents.length}件を完全に削除しますか？この操作は取り消せません。`
      )
    ) {
      try {
        await deleteEvents(trashedEvents.map((e) => e.id))
        await fetchTrashedEvents()
      } catch (e) {
        console.error('ゴミ箱を空にする処理に失敗しました', e)
        alert('完全削除に失敗しました。時間をおいて再度お試しください。')
      }
    }
  }

  const handleRestoreOne = async (id: string) => {
    try {
      await restoreFromTrash([id])
    } catch (e) {
      console.error('復元に失敗しました', e)
      alert(e instanceof Error ? e.message : '復元に失敗しました。時間をおいて再度お試しください。')
    }
  }

  const handlePermanentDeleteOne = async (id: string) => {
    if (!confirm('この候補を完全に削除しますか？取り消せません。')) return
    try {
      await deleteEvents([id])
      await fetchTrashedEvents()
    } catch (e) {
      console.error('完全削除に失敗しました', e)
      alert('完全削除に失敗しました。時間をおいて再度お試しください。')
    }
  }

  const user: User = {
    id: session?.user?.id || 'admin',
    name: session?.user?.name || '運営',
    email: session?.user?.email || '',
    role: 'admin' as const,
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <h1 className="text-xl sm:text-2xl font-bold">運営カレンダー</h1>
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
              {/* ログインユーザー情報 */}
              <div className="flex items-center gap-2">
                {session?.user?.image && (
                  <img
                    src={session.user.image}
                    alt=""
                    className="w-8 h-8 rounded-full"
                  />
                )}
                <span className="text-gray-700 text-sm">{user.name}さん</span>
                <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                  運営
                </span>
              </div>
              <a
                href="/"
                className="bg-green-600 text-white px-3 py-2 rounded-md hover:bg-green-700 text-sm"
              >
                講師カレンダー
              </a>
              <a
                href="/admin/confirmed"
                className="bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 text-sm"
              >
                確定カレンダー
              </a>
              <a
                href="/admin/audit"
                className="bg-purple-600 text-white px-3 py-2 rounded-md hover:bg-purple-700 text-sm"
              >
                監査ログ
              </a>
              <a
                href="/admin/account"
                className="bg-gray-600 text-white px-3 py-2 rounded-md hover:bg-gray-700 text-sm"
              >
                アカウント管理
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 候補日時カレンダー：スクロールせず全体表示（講師カレンダーと同じ） */}
        <section className="mb-8 overflow-visible" style={{ maxHeight: 'none', height: 'auto' }} aria-label="候補日時の確認・確定">
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-4">候補日時の確認・確定</h2>
            <p className="text-gray-600 mb-4">
              全講師から提出された候補日時を確認し、確定してください。
              <span className="text-sm text-blue-600 ml-2">
                （登録数: {events.filter((e) => e.instructorName !== '候補あり').length}件）
              </span>
            </p>
          </div>

          {/* 複数選択モードのコントロール */}
          <div className="flex justify-end mb-2">
            <button
              onClick={() => {
                setIsMultiSelectMode(!isMultiSelectMode)
                if (isMultiSelectMode) {
                  setCalendarSelectedIds(new Set())
                }
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                isMultiSelectMode
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {isMultiSelectMode ? '複数選択モード ON' : '複数選択'}
            </button>
          </div>
          
          <Calendar
            events={events.filter((event) => event.instructorName !== '候補あり')}
            onSelectEvent={handleSelectEvent}
            defaultView="month"
            selectedEventIds={isMultiSelectMode ? calendarSelectedIds : undefined}
          />
          
          {/* 複数選択モード中の操作ボタン */}
          {isMultiSelectMode && calendarSelectedIds.size > 0 && (
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 z-50">
              <div className="max-w-7xl mx-auto flex items-center justify-between">
                <div className="text-gray-700">
                  <span className="font-medium">{calendarSelectedIds.size}件</span> 選択中
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={async () => {
                      // 選択したイベントを取得
                      const selectedEvents = events.filter(e => calendarSelectedIds.has(e.id))
                      
                      // 既に確定済みの予定が含まれていないかチェック
                      const alreadyConfirmed = selectedEvents.filter(e => e.status === 'confirmed')
                      if (alreadyConfirmed.length > 0) {
                        const confirmedList = alreadyConfirmed.map(e => {
                          const dateStr = e.date.toLocaleDateString('ja-JP')
                          const timeStr = TIME_LABELS[e.timeSlot] || e.timeSlot
                          return `${dateStr} ${timeStr}（${e.instructorName}）`
                        })
                        alert(`以下の予定は既に確定済みです：\n\n${confirmedList.join('\n')}\n\n確定済みの予定を再度確定することはできません。`)
                        return
                      }
                      
                      // 既存確定との重複チェック（同じ時間帯は2件まで、3件以上でエラー）
                      const confirmErrors: string[] = []
                      selectedEvents.forEach((event) => {
                        const check = checkCanConfirm(event)
                        if (check) {
                          const dateStr = event.date.toLocaleDateString('ja-JP')
                          const timeStr = TIME_LABELS[event.timeSlot] || event.timeSlot
                          confirmErrors.push(`${dateStr} ${timeStr}（${event.instructorName}）→ この時間帯は既に2件確定済みのため追加できません`)
                        }
                      })
                      if (confirmErrors.length > 0) {
                        alert(`以下の候補は確定できません：\n\n${confirmErrors.join('\n')}\n\n同じ時間帯は2件までです。3件以上は確定できません。`)
                        return
                      }

                      // 選択候補同士：同じ日・同じ時間帯で3件以上にならないか
                      const dateSlotPairs = new Map<string, SessionCandidate>()
                      selectedEvents.forEach((e) => {
                        const d = e.date.toISOString().split('T')[0]
                        const key = `${d}_${e.timeSlot}`
                        if (!dateSlotPairs.has(key)) dateSlotPairs.set(key, e)
                      })
                      for (const [key, ev] of dateSlotPairs) {
                        const [dateStr, timeSlot] = key.split('_')
                        const existing = getConfirmedOnDate(dateStr).filter(
                          (c) => c.timeSlot === timeSlot && !selectedEvents.some((t) => t.id === c.id)
                        ).length
                        const inBatch = selectedEvents.filter(
                          (e) => e.date.toISOString().split('T')[0] === dateStr && e.timeSlot === timeSlot
                        ).length
                        if (existing + inBatch >= 3) {
                          const displayDate = ev.date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
                          const timeStr = TIME_LABELS[ev.timeSlot] || ev.timeSlot
                          alert(`${displayDate} の${timeStr}は確定が3件以上になります。\n\n時間の重複が3件以上あるため、同じ時間帯は2件までです。`)
                          return
                        }
                      }
                      
                      if (confirm(`選択した${calendarSelectedIds.size}件の候補を確定しますか？`)) {
                        for (const event of selectedEvents) {
                          updateEventStatus(event.id, 'confirmed', user)
                        }
                        setCalendarSelectedIds(new Set())
                        setIsMultiSelectMode(false)
                      }
                    }}
                    className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 font-medium"
                  >
                    選択した候補を確定
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm(`選択した${calendarSelectedIds.size}件の候補をゴミ箱に移動しますか？`)) {
                        try {
                          await moveToTrash([...calendarSelectedIds])
                          setCalendarSelectedIds(new Set())
                          setIsMultiSelectMode(false)
                        } catch (e) {
                          console.error('ゴミ箱への移動に失敗しました', e)
                          alert('ゴミ箱への移動に失敗しました')
                        }
                      }
                    }}
                    className="bg-gray-600 text-white px-6 py-2 rounded-md hover:bg-gray-700 font-medium"
                  >
                    選択した候補をゴミ箱へ
                  </button>
                  <button
                    onClick={() => {
                      setCalendarSelectedIds(new Set())
                    }}
                    className="bg-white text-gray-700 border border-gray-300 px-6 py-2 rounded-md hover:bg-gray-50 font-medium"
                  >
                    選択解除
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">審査中候補（全講師）</h2>
              {pendingEvents.length > 0 && (
                <div className="flex gap-2 items-center">
                  <button
                    onClick={handleSelectAll}
                    className="text-sm text-blue-600 hover:text-blue-800 px-2 py-1"
                  >
                    {selectedEventIds.size === pendingEvents.length ? '全解除' : '全選択'}
                  </button>
                  {submittedInConfirmedSlots.length > 0 && (
                    <button
                      onClick={handleDeleteConfirmedSlotLosers}
                      className="bg-red-600 text-white px-4 py-1 rounded text-sm hover:bg-red-700"
                    >
                      確定枠の未確定をゴミ箱へ ({submittedInConfirmedSlots.length})
                    </button>
                  )}
                  {selectedEventIds.size > 0 && (
                    <>
                      <button
                        onClick={handleBulkConfirm}
                        className="bg-green-600 text-white px-4 py-1 rounded text-sm hover:bg-green-700"
                      >
                        選択した候補を確定 ({selectedEventIds.size})
                      </button>
                      <button
                        onClick={handleBulkDelete}
                        className="bg-gray-600 text-white px-4 py-1 rounded text-sm hover:bg-gray-700"
                      >
                        選択した候補をゴミ箱へ ({selectedEventIds.size})
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {pendingEvents.length === 0 ? (
                <p className="text-gray-500">審査中の候補はありません</p>
              ) : (
                pendingEvents
                  .sort((a, b) => {
                    // まず日付でソート
                    const dateCompare = a.date.getTime() - b.date.getTime()
                    if (dateCompare !== 0) return dateCompare
                    // 日付が同じ場合は講師名でソート
                    return a.instructorName.localeCompare(b.instructorName)
                  })
                  .map((event) => (
                    <div
                      key={event.id}
                      className={`p-4 border rounded-lg ${
                        selectedEventIds.has(event.id)
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-yellow-500 bg-yellow-50'
                      } cursor-pointer hover:bg-opacity-80`}
                      onClick={() => setSelectedEvent(event)}
                    >
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <input
                            type="checkbox"
                            checked={selectedEventIds.has(event.id)}
                            onChange={(e) => {
                              e.stopPropagation()
                              handleToggleSelectEvent(event.id)
                            }}
                            className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <div className="flex-1">
                            <p className="font-medium">{event.instructorName}講師</p>
                            <p className="text-gray-600">
                              {event.date.toLocaleDateString('ja-JP', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                              })}
                            </p>
                            <p className="text-gray-600">
                              {TIME_LABELS[event.timeSlot] || event.timeSlot}
                            </p>
                            {event.memo && (
                              <p className="text-sm text-gray-500 mt-1 italic">
                                メモ: {event.memo}
                              </p>
                            )}
                            <p className="text-sm text-gray-500 mt-1">
                              提出日: {event.submittedAt.toLocaleString('ja-JP')}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleConfirmEvent(event.id, user)
                            }}
                            className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                          >
                            確定
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation()
                              const dateStr = new Date(event.date).toLocaleDateString('ja-JP')
                              const timeStr = TIME_LABELS[event.timeSlot] || event.timeSlot
                              if (confirm(`${event.instructorName}の${dateStr} ${timeStr} の候補をゴミ箱に移動しますか？`)) {
                                try {
                                  await moveToTrash([event.id])
                                } catch (err) {
                                  console.error('ゴミ箱への移動に失敗しました', err)
                                  alert('ゴミ箱への移動に失敗しました')
                                }
                              }
                            }}
                            className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700"
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">確定カレンダー（全講師）</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {confirmedEvents.length === 0 ? (
                <p className="text-gray-500">確定済みの日時はありません</p>
              ) : (
                confirmedEvents
                  .sort((a, b) => {
                    // まず日付でソート
                    const dateCompare = a.date.getTime() - b.date.getTime()
                    if (dateCompare !== 0) return dateCompare
                    // 日付が同じ場合は講師名でソート
                    return a.instructorName.localeCompare(b.instructorName)
                  })
                  .map((event) => (
                    <div
                      key={event.id}
                      className="p-4 border border-green-500 rounded-lg bg-green-50"
                    >
                      <div>
                        <p className="font-medium">{event.instructorName ? `${event.instructorName}講師` : '講師'}</p>
                        <p className="text-gray-600">
                          {event.date.toLocaleDateString('ja-JP', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                        <p className="text-gray-600">
                          {TIME_LABELS[event.timeSlot] || event.timeSlot}
                        </p>
                        {event.memo && (
                          <p className="text-sm text-gray-500 mt-1 italic">
                            メモ: {event.memo}
                          </p>
                        )}
                        {event.confirmedAt && (
                          <p className="text-sm text-gray-500 mt-1">
                            確定日: {event.confirmedAt.toLocaleString('ja-JP')}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mt-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">ゴミ箱（{trashedEvents.length}件）</h2>
            {trashedEvents.length > 0 && (
              <button
                onClick={handleEmptyTrash}
                className="bg-red-600 text-white px-4 py-1 rounded text-sm hover:bg-red-700"
              >
                ゴミ箱を空にする
              </button>
            )}
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {trashedEvents.length === 0 ? (
              <p className="text-gray-500">ゴミ箱は空です</p>
            ) : (
              trashedEvents.map((event) => (
                <div
                  key={event.id}
                  className="p-3 border rounded-lg bg-gray-50"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{event.instructorName}講師</p>
                        {event.status === 'confirmed' && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                            確定だった予定
                          </span>
                        )}
                      </div>
                      <p className="text-gray-600">
                        {event.date.toLocaleDateString('ja-JP', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          weekday: 'short',
                        })}
                      </p>
                      <p className="text-gray-600">
                        {TIME_LABELS[event.timeSlot] || event.timeSlot}
                      </p>
                      {event.memo && (
                        <p className="text-sm text-gray-500 mt-1 italic">
                          メモ: {event.memo}
                        </p>
                      )}
                      <p className="text-sm text-gray-500 mt-1">
                        ゴミ箱に移動した日時: {event.trashedAt?.toLocaleString('ja-JP')}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleRestoreOne(event.id)}
                        className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                      >
                        元に戻す
                      </button>
                      <button
                        onClick={() => handlePermanentDeleteOne(event.id)}
                        className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                      >
                        完全に削除
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {showEditForm && eventForEditDelete && (
          <EventForm
            onSubmit={handleAdminEditSubmit}
            onCancel={() => {
              setShowEditForm(false)
            }}
            editingEvent={eventForEditDelete}
          />
        )}

        {/* 操作選択モーダル */}
        {showActionModal && actionModalEvent && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
              <h2 className="text-xl font-bold mb-4">操作を選択</h2>
              <div className="mb-4">
                <p className="font-medium text-lg">{actionModalEvent.instructorName}講師</p>
                <p className="text-gray-600">
                  {actionModalEvent.date.toLocaleDateString('ja-JP', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}{' '}
                  {TIME_LABELS[actionModalEvent.timeSlot] || actionModalEvent.timeSlot}
                </p>
              </div>
              <div className="space-y-3 mb-6">
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="action"
                    value="confirm"
                    checked={selectedAction === 'confirm'}
                    onChange={(e) => setSelectedAction(e.target.value)}
                    className="w-5 h-5 text-green-600"
                  />
                  <span className="text-green-600 font-medium">確定</span>
                </label>
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="action"
                    value="edit"
                    checked={selectedAction === 'edit'}
                    onChange={(e) => setSelectedAction(e.target.value)}
                    className="w-5 h-5 text-blue-600"
                  />
                  <span className="text-blue-600 font-medium">修正</span>
                </label>
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="action"
                    value="delete"
                    checked={selectedAction === 'delete'}
                    onChange={(e) => setSelectedAction(e.target.value)}
                    className="w-5 h-5 text-gray-600"
                  />
                  <span className="text-gray-600 font-medium">削除</span>
                </label>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowActionModal(false)
                    setActionModalEvent(null)
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleActionModalSubmit}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
                >
                  実行
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedEvent && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
              <h2 className="text-xl font-bold mb-4">イベント詳細</h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500">講師名</p>
                  <p className="font-medium">{selectedEvent.instructorName}講師</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">開催日</p>
                  <p className="font-medium">
                    {selectedEvent.date.toLocaleDateString('ja-JP', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">時間</p>
                  <p className="font-medium">
                    {TIME_LABELS[selectedEvent.timeSlot] || selectedEvent.timeSlot}
                  </p>
                </div>
                {selectedEvent.memo && (
                  <div>
                    <p className="text-sm text-gray-500">メモ</p>
                    <p className="font-medium">{selectedEvent.memo}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-500">ステータス</p>
                  <p
                    className={`font-medium ${
                      selectedEvent.status === 'confirmed'
                        ? 'text-green-600'
                        : 'text-yellow-600'
                    }`}
                  >
                    {selectedEvent.status === 'confirmed'
                      ? '確定'
                      : '候補'}
                  </p>
                </div>
                
                {/* ステータス変更ボタン */}
                <div className="pt-4 space-y-2">
                  <p className="text-sm text-gray-500 mb-2">ステータスを変更:</p>
                  <div className="flex gap-2">
                    {selectedEvent.status !== 'confirmed' && (
                      <button
                        onClick={() => {
                          handleConfirmEvent(selectedEvent.id, user)
                          setSelectedEvent(null)
                        }}
                        className="flex-1 bg-green-600 text-white py-2 px-3 rounded-md hover:bg-green-700 text-sm"
                      >
                        確定
                      </button>
                    )}
                    {selectedEvent.status !== 'submitted' && (
                      <button
                        onClick={() => {
                          updateEventStatus(selectedEvent.id, 'submitted')
                          setSelectedEvent(null)
                        }}
                        className="flex-1 bg-yellow-500 text-white py-2 px-3 rounded-md hover:bg-yellow-600 text-sm"
                      >
                        候補に戻す
                      </button>
                    )}
                  </div>
                  
                  {/* 修正・削除ボタン */}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => {
                        setSelectedEventIdForEditDelete(selectedEvent.id)
                        setShowEditForm(true)
                        setSelectedEvent(null)
                      }}
                      className="flex-1 bg-blue-600 text-white py-2 px-3 rounded-md hover:bg-blue-700 text-sm"
                    >
                      修正
                    </button>
                    <button
                      onClick={() => {
                        handleAdminDeleteForEvent(selectedEvent)
                        setSelectedEvent(null)
                      }}
                      className="flex-1 bg-gray-600 text-white py-2 px-3 rounded-md hover:bg-gray-700 text-sm"
                    >
                      削除
                    </button>
                  </div>
                </div>
                
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="w-full bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400 mt-2"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}