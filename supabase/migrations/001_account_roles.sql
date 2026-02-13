-- 講師・運営アカウントを管理するテーブル（アカウント管理画面で追加・削除）
-- Supabase の SQL Editor で実行してください。

CREATE TABLE IF NOT EXISTS account_roles (
  email text PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('instructor', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: アプリは anon key で API 経由のみアクセスするため、必要に応じてポリシーを設定
-- 例: 全許可（API 側で getServerSession により運営のみ操作可能）
ALTER TABLE account_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for account_roles"
  ON account_roles FOR ALL
  USING (true)
  WITH CHECK (true);
