import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// データベースの型定義
export interface DBSessionCandidate {
  id: string
  instructor_id: string
  instructor_name: string
  month: string
  date: string
  time_slot: string
  memo: string | null
  status: string
  submitted_at: string
  confirmed_at: string | null
  created_at: string
  google_calendar_event_id: string | null
  admin_google_calendar_event_id: string | null
}

export interface DBAuditLog {
  id: string
  event_id: string
  action: string
  admin_id: string
  admin_name: string
  timestamp: string
  event_date: string
  event_time_slot: string
  instructor_id: string
  instructor_name: string
  created_at: string
}

// アカウント権限（講師・運営の登録用）
export interface DBAccountRole {
  email: string
  role: 'instructor' | 'admin'
  created_at: string
}
