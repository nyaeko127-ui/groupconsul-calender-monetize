export type UserRole = 'instructor' | 'admin'

export interface User {
  id: string
  name: string
  role: UserRole
  email: string
}

export type TimeSlot = '21:00-23:00' | '22:00-24:00'
export type SessionStatus = 'submitted' | 'confirmed'

export interface SessionCandidate {
  id: string
  instructorId: string
  instructorName: string
  month: string // 例：2026-02
  date: Date
  timeSlot: TimeSlot // 21:00-23:00 または 22:00-24:00
  status: SessionStatus // 候補（提出）、確定
  memo?: string
  submittedAt: Date
  confirmedAt?: Date
  googleCalendarEventId?: string // Googleカレンダーに追加された予定のID
}

// 後方互換性のため、EventDate も残す（既存コードで使用）
export type EventDate = SessionCandidate
export type EventDateStatus = SessionStatus

export interface EventFormData {
  date: Date
  timeSlot: TimeSlot
  memo?: string
}

export interface AuditLog {
  id: string
  eventId: string
  action: SessionStatus
  adminId: string
  adminName: string
  timestamp: Date
  eventDate: Date
  eventTimeSlot: TimeSlot
  instructorId: string
  instructorName: string
}

export interface GoogleCalendarEvent {
  id: string
  summary: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
}

export interface GoogleCalendarConflict {
  dateStr: string
  timeSlot: TimeSlot
  hasConflict: boolean
}