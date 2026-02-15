-- 運営のGoogleカレンダーに登録した予定のイベントIDを保存（講師・運営どちらのカレンダーで削除されてもアプリから削除するため）
ALTER TABLE session_candidates
ADD COLUMN IF NOT EXISTS admin_google_calendar_event_id text;
