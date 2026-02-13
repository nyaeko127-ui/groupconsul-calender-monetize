'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'

type AccountRole = 'instructor' | 'admin'

interface InstructorRow {
  email: string
  role: string
  created_at: string
  user_id: string | null
}

interface AdminRow {
  email: string
  role: string
  created_at: string
}

export default function AccountPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [instructors, setInstructors] = useState<InstructorRow[]>([])
  const [admins, setAdmins] = useState<AdminRow[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  // 追加フォーム
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<AccountRole>('instructor')
  const [submitting, setSubmitting] = useState(false)

  const isAdmin = session?.user?.isAdmin ?? false
  const currentEmail = session?.user?.email?.toLowerCase() ?? ''

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/accounts')
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/')
          return
        }
        throw new Error(await res.text())
      }
      const data = await res.json()
      setInstructors(data.instructors ?? [])
      setAdmins(data.admins ?? [])
    } catch (e) {
      setMessage({ type: 'error', text: '一覧の取得に失敗しました' })
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (status === 'unauthenticated' || (status === 'authenticated' && !isAdmin)) {
      router.push('/')
      return
    }
    if (status === 'authenticated' && isAdmin) {
      fetchAccounts()
    }
  }, [status, isAdmin, router, fetchAccounts])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = newEmail.trim().toLowerCase()
    if (!email) {
      setMessage({ type: 'error', text: 'メールアドレスを入力してください' })
      return
    }
    setSubmitting(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: newRole }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '追加に失敗しました' })
        return
      }
      setMessage({ type: 'ok', text: newRole === 'instructor' ? '講師を追加しました' : '運営を追加しました' })
      setNewEmail('')
      fetchAccounts()
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (email: string, role: string) => {
    if (!confirm(`${email} を削除しますか？`)) return
    setMessage(null)
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '削除に失敗しました' })
        return
      }
      setMessage({ type: 'ok', text: '削除しました' })
      fetchAccounts()
    } catch {
      setMessage({ type: 'error', text: '削除に失敗しました' })
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p>読み込み中...</p>
      </div>
    )
  }

  if (!session?.user) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <h1 className="text-xl sm:text-2xl font-bold">アカウント管理</h1>
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
              <a
                href="/admin"
                className="bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 text-sm"
              >
                運営カレンダー
              </a>
              <a
                href="/admin/confirmed"
                className="bg-green-600 text-white px-3 py-2 rounded-md hover:bg-green-700 text-sm"
              >
                確定カレンダー
              </a>
              <span className="text-gray-700 text-sm">{session.user.name ?? '運営'}さん</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {message && (
          <div
            className={`mb-4 px-4 py-2 rounded-md ${
              message.type === 'ok' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">ログイン中のアカウント</h2>
          <div className="space-y-2 text-gray-700">
            {session.user.image && (
              <div className="flex items-center gap-3 mb-4">
                <img
                  src={session.user.image}
                  alt=""
                  className="w-12 h-12 rounded-full"
                />
              </div>
            )}
            <p><span className="font-medium">名前:</span> {session.user.name ?? '—'}</p>
            <p><span className="font-medium">メール:</span> {session.user.email ?? '—'}</p>
            <p><span className="font-medium">権限:</span> {isAdmin ? '運営' : '講師'}</p>
          </div>
        </div>

        {/* 講師アカウント */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">講師アカウント</h2>
          <p className="text-gray-600 text-sm mb-4">
            登録された講師は講師カレンダーから候補日時を提出できます。
          </p>
          {loading ? (
            <p className="text-gray-500">読み込み中...</p>
          ) : (
            <>
              <ul className="divide-y divide-gray-200 mb-6">
                {instructors.length === 0 ? (
                  <li className="py-3 text-gray-500 text-sm">登録されている講師はいません</li>
                ) : (
                  instructors.map((row) => (
                    <li key={row.email} className="py-3 flex justify-between items-center gap-2">
                      <span className="text-gray-800">{row.email}</span>
                      <button
                        type="button"
                        onClick={() => handleDelete(row.email, row.role)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        削除
                      </button>
                    </li>
                  ))
                )}
              </ul>
              <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="instructor@example.com"
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm w-64"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">権限</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as AccountRole)}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="instructor">講師として追加</option>
                    <option value="admin">運営として追加</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
                >
                  {submitting ? '追加中...' : '追加'}
                </button>
              </form>
            </>
          )}
        </div>

        {/* 運営アカウント */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">運営権限のあるアカウント</h2>
          <p className="text-gray-600 text-sm mb-4">
            運営は候補の確定・監査ログの確認・アカウント管理ができます。環境変数 ADMIN_EMAILS で指定したメールも運営として扱われます。
          </p>
          {loading ? (
            <p className="text-gray-500">読み込み中...</p>
          ) : (
            <>
              <ul className="divide-y divide-gray-200">
                {admins.length === 0 ? (
                  <li className="py-3 text-gray-500 text-sm">DBに登録されている運営はいません（環境変数のみの場合はここに表示されません）</li>
                ) : (
                  admins.map((row) => (
                    <li key={row.email} className="py-3 flex justify-between items-center gap-2">
                      <span className="text-gray-800">{row.email}</span>
                      {row.email.toLowerCase() === currentEmail ? (
                        <span className="text-gray-400 text-sm">（自分自身）</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDelete(row.email, row.role)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          削除
                        </button>
                      )}
                    </li>
                  ))
                )}
              </ul>
              <p className="mt-4 text-gray-500 text-sm">運営の追加は上の「講師アカウント」で権限を「運営として追加」にして追加してください。</p>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
