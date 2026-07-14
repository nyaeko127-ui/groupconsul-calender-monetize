-- ゴミ箱（ソフトデリート）用の列。
-- NULL = 通常表示（カレンダー・一覧に出る）、非NULL = ゴミ箱に入っている（通常表示から除外）。
-- 「ゴミ箱へ移動」= trashed_at に日時をセット、「元に戻す」= NULL に戻す、「完全に削除」= 行そのものを DELETE。
ALTER TABLE session_candidates
ADD COLUMN IF NOT EXISTS trashed_at timestamptz;

-- 通常表示のクエリ（trashed_at IS NULL）を高速化するための部分インデックス。
CREATE INDEX IF NOT EXISTS idx_session_candidates_trashed_at
ON session_candidates (trashed_at)
WHERE trashed_at IS NULL;
