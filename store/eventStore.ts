import { create } from 'zustand'
import { SessionCandidate, User, SessionStatus, AuditLog, TimeSlot } from '@/types'
import { supabase, DBSessionCandidate, DBAuditLog } from '@/lib/supabase'

interface EventStore {
  events: SessionCandidate[]
  auditLogs: AuditLog[]
  currentUser: User | null
  isLoading: boolean
  trashedEvents: SessionCandidate[]
  setCurrentUser: (user: User | null) => void
  addEvent: (event: SessionCandidate) => Promise<void>
  updateEvent: (id: string, updates: Partial<SessionCandidate>) => Promise<void>
  deleteEvent: (id: string, forceAdmin?: boolean) => Promise<void>
  deleteEvents: (ids: string[]) => Promise<void>
  moveToTrash: (ids: string[]) => Promise<void>
  restoreFromTrash: (ids: string[]) => Promise<void>
  fetchTrashedEvents: () => Promise<void>
  updateEventStatus: (id: string, status: SessionStatus, adminUser?: User) => Promise<void>
  getEventsByStatus: (status: SessionStatus) => SessionCandidate[]
  getEventsByInstructor: (instructorId: string) => SessionCandidate[]
  getAuditLogs: () => AuditLog[]
  fetchEvents: () => Promise<void>
  fetchAllEvents: () => Promise<void>
  fetchAuditLogs: () => Promise<void>
  initializeFromLocalStorage: () => void
  saveToLocalStorage: () => void
}

// DBの行をSessionCandidateに変換
const dbRowToSessionCandidate = (row: DBSessionCandidate): SessionCandidate => ({
  id: row.id,
  instructorId: row.instructor_id,
  instructorName: row.instructor_name,
  month: row.month,
  date: new Date(row.date),
  timeSlot: row.time_slot as TimeSlot,
  memo: row.memo || undefined,
  status: row.status as SessionStatus,
  submittedAt: new Date(row.submitted_at),
  confirmedAt: row.confirmed_at ? new Date(row.confirmed_at) : undefined,
  googleCalendarEventId: row.google_calendar_event_id || undefined,
  adminGoogleCalendarEventId: row.admin_google_calendar_event_id || undefined,
  trashedAt: row.trashed_at ? new Date(row.trashed_at) : undefined,
})

// SessionCandidateをDB形式に変換
const sessionCandidateToDbRow = (event: SessionCandidate): Omit<DBSessionCandidate, 'created_at'> => ({
  id: event.id,
  instructor_id: event.instructorId,
  instructor_name: event.instructorName,
  month: event.month,
  date: event.date.toISOString(),
  time_slot: event.timeSlot,
  memo: event.memo || null,
  status: event.status,
  submitted_at: event.submittedAt.toISOString(),
  confirmed_at: event.confirmedAt ? event.confirmedAt.toISOString() : null,
  google_calendar_event_id: event.googleCalendarEventId ?? null,
  admin_google_calendar_event_id: event.adminGoogleCalendarEventId ?? null,
  trashed_at: event.trashedAt ? event.trashedAt.toISOString() : null,
})

// DBの行をAuditLogに変換
const dbRowToAuditLog = (row: DBAuditLog): AuditLog => ({
  id: row.id,
  eventId: row.event_id,
  action: row.action as SessionStatus,
  adminId: row.admin_id,
  adminName: row.admin_name,
  timestamp: new Date(row.timestamp),
  eventDate: new Date(row.event_date),
  eventTimeSlot: row.event_time_slot as TimeSlot,
  instructorId: row.instructor_id,
  instructorName: row.instructor_name,
})

export const useEventStore = create<EventStore>((set, get) => ({
  events: [],
  auditLogs: [],
  currentUser: null,
  isLoading: false,
  trashedEvents: [],

  setCurrentUser: (user) => set({ currentUser: user }),

  // Supabaseからイベントを取得
  fetchEvents: async () => {
    set({ isLoading: true })
    try {
      const { data, error } = await supabase
        .from('session_candidates')
        .select('*')
        .is('trashed_at', null)
        .order('date', { ascending: true })

      if (error) {
        console.error('Error fetching events:', error)
        return
      }

      const events = (data || []).map(dbRowToSessionCandidate)
      set({ events, isLoading: false })
    } catch (error) {
      console.error('Error fetching events:', error)
      set({ isLoading: false })
    }
  },

  // サーバーサイドAPIを経由して全イベントを取得（RLSをバイパス）
  fetchAllEvents: async () => {
    set({ isLoading: true })
    try {
      const response = await fetch('/api/events')
      if (!response.ok) {
        console.error('fetchAllEvents failed:', response.status)
        set({ isLoading: false })
        return
      }
      const data = await response.json()
      const events = (data.events || []).map((row: any): SessionCandidate => ({
        id: row.id,
        instructorId: row.instructor_id,
        instructorName: row.instructor_name,
        month: row.month,
        date: new Date(row.date),
        timeSlot: row.time_slot as SessionCandidate['timeSlot'],
        memo: row.memo || undefined,
        status: row.status as SessionCandidate['status'],
        submittedAt: new Date(row.submitted_at),
        confirmedAt: row.confirmed_at ? new Date(row.confirmed_at) : undefined,
        googleCalendarEventId: row.google_calendar_event_id || undefined,
        adminGoogleCalendarEventId: row.admin_google_calendar_event_id || undefined,
        trashedAt: row.trashed_at ? new Date(row.trashed_at) : undefined,
      }))
      set({ events, isLoading: false })
    } catch (error) {
      console.error('Error in fetchAllEvents:', error)
      set({ isLoading: false })
    }
  },

  addEvent: async (event) => {
    const user = get().currentUser
    // 講師は自分名義でのみ登録可能
    const safeEvent =
      user?.role === 'instructor'
        ? { ...event, instructorId: user.id, instructorName: user.name }
        : event

    try {
      const dbRow = sessionCandidateToDbRow(safeEvent)
      const { error } = await supabase
        .from('session_candidates')
        .insert(dbRow)

      if (error) {
        console.error('Error adding event:', error)
        return
      }

      // ローカルステートを更新
      set((state) => ({
        events: [...state.events, safeEvent],
      }))
    } catch (error) {
      console.error('Error adding event:', error)
    }
  },

  updateEvent: async (id: string, updates: Partial<SessionCandidate>) => {
    const event = get().events.find((e) => e.id === id)
    const user = get().currentUser
    
    // 講師は自分の候補のみ編集可能
    if (user?.role === 'instructor' && event) {
      if (event.instructorId !== user.id) return
    }
    
    // 講師は担当者・担当者名の変更不可
    const sanitized =
      user?.role === 'instructor'
        ? (() => {
            const { instructorId, instructorName, ...rest } = updates
            return rest
          })()
        : updates

    try {
      // DB用の更新データを作成
      const dbUpdates: Record<string, any> = {}
      if (sanitized.date) dbUpdates.date = sanitized.date.toISOString()
      if (sanitized.month) dbUpdates.month = sanitized.month
      if (sanitized.timeSlot) dbUpdates.time_slot = sanitized.timeSlot
      if (sanitized.memo !== undefined) dbUpdates.memo = sanitized.memo || null
      if (sanitized.status) dbUpdates.status = sanitized.status
      if (sanitized.confirmedAt) dbUpdates.confirmed_at = sanitized.confirmedAt.toISOString()
      if (sanitized.submittedAt) dbUpdates.submitted_at = sanitized.submittedAt.toISOString()
      if (sanitized.googleCalendarEventId !== undefined) dbUpdates.google_calendar_event_id = sanitized.googleCalendarEventId || null
      if (sanitized.adminGoogleCalendarEventId !== undefined) dbUpdates.admin_google_calendar_event_id = sanitized.adminGoogleCalendarEventId || null

      // dbUpdatesが空でないことを確認
      if (Object.keys(dbUpdates).length === 0) {
        console.error('No updates to apply')
        return
      }

      const { error } = await supabase
        .from('session_candidates')
        .update(dbUpdates)
        .eq('id', id)

      if (error) {
        console.error('Error updating event:', error)
        return
      }

      // 更新後にデータを再取得して最新の状態を反映
      await get().fetchEvents()
    } catch (error) {
      console.error('Error updating event:', error)
    }
  },

  deleteEvent: async (id, forceAdmin = false) => {
    const event = get().events.find((e) => e.id === id)
    const user = get().currentUser
    
    // 講師は自分の・未確定の候補のみ削除可能
    if (!forceAdmin && user?.role === 'instructor' && event) {
      if (event.instructorId !== user.id) return
      if (event.status === 'confirmed') return
    }

    try {
      const { error } = await supabase
        .from('session_candidates')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('Error deleting event:', error)
        return
      }

      // 削除後にデータを再取得
      await get().fetchEvents()
    } catch (error) {
      console.error('Error deleting event:', error)
    }
  },

  deleteEvents: async (ids) => {
    if (ids.length === 0) return

    const { error } = await supabase
      .from('session_candidates')
      .delete()
      .in('id', ids)

    if (error) {
      console.error('Error deleting events:', error)
      throw new Error(error.message || 'イベントの削除に失敗しました')
    }

    // RLSに依存せず、削除したIDをローカルstateから直接除去（楽観的更新）
    const idSet = new Set(ids)
    set((state) => ({
      events: state.events.filter((e) => !idSet.has(e.id)),
    }))
  },

  moveToTrash: async (ids) => {
    if (ids.length === 0) return

    const { error } = await supabase
      .from('session_candidates')
      .update({ trashed_at: new Date().toISOString() })
      .in('id', ids)

    if (error) {
      console.error('Error moving events to trash:', error)
      throw new Error(error.message || 'ゴミ箱への移動に失敗しました')
    }

    // 通常一覧からは即座に消す（楽観的更新）。ゴミ箱一覧は再取得で反映。
    const idSet = new Set(ids)
    set((state) => ({
      events: state.events.filter((e) => !idSet.has(e.id)),
    }))
    await get().fetchTrashedEvents()
  },

  restoreFromTrash: async (ids) => {
    if (ids.length === 0) return

    // 確定枠2件上限チェック（復元対象に確定だった予定が含まれる場合のみ）
    const eventsToRestore = get().trashedEvents.filter((e) => ids.includes(e.id))
    const activeConfirmed = get().events.filter((e) => e.status === 'confirmed')
    const slotCounts = new Map<string, number>()
    activeConfirmed.forEach((e) => {
      const key = `${e.date.toISOString().split('T')[0]}_${e.timeSlot}`
      slotCounts.set(key, (slotCounts.get(key) || 0) + 1)
    })
    for (const e of eventsToRestore) {
      if (e.status !== 'confirmed') continue
      const key = `${e.date.toISOString().split('T')[0]}_${e.timeSlot}`
      const count = slotCounts.get(key) || 0
      if (count >= 2) {
        const dateStr = e.date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
        const timeStr = e.timeSlot
        throw new Error(
          `${dateStr} の${timeStr}は既に2件確定済みのため、確定だった予定を戻せません。\n先に確定枠を空けてから復元してください。`
        )
      }
      slotCounts.set(key, count + 1)
    }

    const { error } = await supabase
      .from('session_candidates')
      .update({ trashed_at: null })
      .in('id', ids)

    if (error) {
      console.error('Error restoring events:', error)
      throw new Error(error.message || 'ゴミ箱からの復元に失敗しました')
    }

    // ゴミ箱一覧から除去。通常一覧は次回 fetchAllEvents で反映される。
    const idSet = new Set(ids)
    set((state) => ({
      trashedEvents: state.trashedEvents.filter((e) => !idSet.has(e.id)),
    }))
  },

  updateEventStatus: async (id, status, adminUser) => {
    const event = get().events.find((e) => e.id === id)
    if (!event) return

    const now = new Date()

    // 監査ログを追加（確定時のみ）
    if (status === 'confirmed' && adminUser) {
      const auditLog: AuditLog = {
        id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        eventId: id,
        action: status,
        adminId: adminUser.id,
        adminName: adminUser.name,
        timestamp: now,
        eventDate: event.date,
        eventTimeSlot: event.timeSlot,
        instructorId: event.instructorId,
        instructorName: event.instructorName,
      }

      // Supabaseに監査ログを保存
      try {
        const { error: auditError } = await supabase
          .from('audit_logs')
          .insert({
            id: auditLog.id,
            event_id: auditLog.eventId,
            action: auditLog.action,
            admin_id: auditLog.adminId,
            admin_name: auditLog.adminName,
            timestamp: auditLog.timestamp.toISOString(),
            event_date: auditLog.eventDate.toISOString(),
            event_time_slot: auditLog.eventTimeSlot,
            instructor_id: auditLog.instructorId,
            instructor_name: auditLog.instructorName,
          })

        if (auditError) {
          console.error('Error saving audit log:', auditError)
        } else {
          set((state) => ({
            auditLogs: [...state.auditLogs, auditLog],
          }))
        }
      } catch (error) {
        console.error('Error saving audit log:', error)
      }
    }

    try {
      const dbUpdates: Record<string, any> = {
        status,
      }
      if (status === 'confirmed') {
        dbUpdates.confirmed_at = now.toISOString()
      }

      const { error } = await supabase
        .from('session_candidates')
        .update(dbUpdates)
        .eq('id', id)

      if (error) {
        console.error('Error updating event status:', error)
        return
      }

      // 更新後にデータを再取得
      await get().fetchEvents()
    } catch (error) {
      console.error('Error updating event status:', error)
    }
  },

  getEventsByStatus: (status) => {
    return get().events.filter((event) => event.status === status)
  },

  getEventsByInstructor: (instructorId) => {
    return get().events.filter((event) => event.instructorId === instructorId)
  },

  getAuditLogs: () => {
    return get().auditLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  },

  // Supabaseから監査ログを取得
  fetchAuditLogs: async () => {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })

      if (error) {
        console.error('Error fetching audit logs:', error)
        return
      }

      const auditLogs = (data || []).map(dbRowToAuditLog)
      set({ auditLogs })
    } catch (error) {
      console.error('Error fetching audit logs:', error)
    }
  },

  // サーバーサイドAPIを経由してゴミ箱内のイベントを取得（RLSをバイパス）
  fetchTrashedEvents: async () => {
    try {
      const response = await fetch('/api/events/trashed')
      if (!response.ok) {
        console.error('fetchTrashedEvents failed:', response.status)
        return
      }
      const data = await response.json()
      const trashedEvents = (data.events || []).map((row: any): SessionCandidate => ({
        id: row.id,
        instructorId: row.instructor_id,
        instructorName: row.instructor_name,
        month: row.month,
        date: new Date(row.date),
        timeSlot: row.time_slot as SessionCandidate['timeSlot'],
        memo: row.memo || undefined,
        status: row.status as SessionCandidate['status'],
        submittedAt: new Date(row.submitted_at),
        confirmedAt: row.confirmed_at ? new Date(row.confirmed_at) : undefined,
        googleCalendarEventId: row.google_calendar_event_id || undefined,
        adminGoogleCalendarEventId: row.admin_google_calendar_event_id || undefined,
        trashedAt: row.trashed_at ? new Date(row.trashed_at) : undefined,
      }))
      set({ trashedEvents })
    } catch (error) {
      console.error('Error in fetchTrashedEvents:', error)
    }
  },

  // 後方互換性のため残す（使用しない）
  initializeFromLocalStorage: () => {
    // Supabaseを使用するため、このメソッドはfetchEventsを呼び出す
    get().fetchEvents()
  },

  saveToLocalStorage: () => {
    // Supabaseを使用するため、何もしない
  },
}))
