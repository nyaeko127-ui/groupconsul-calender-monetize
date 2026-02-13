'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useEventStore } from '@/store/eventStore'
import { User, AuditLog } from '@/types'

export default function AuditLogPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { currentUser, auditLogs: storeAuditLogs, getAuditLogs, fetchAuditLogs, setCurrentUser } = useEventStore()
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])

  // 運営かどうかを判定
  const isAdmin = session?.user?.isAdmin || false

  useEffect(() => {
    fetchAuditLogs()
    // 定期的にデータを再取得（5秒ごと）
    const interval = setInterval(() => {
      fetchAuditLogs()
    }, 5000)
    return () => clearInterval(interval)
  }, [fetchAuditLogs])

  useEffect(() => {
    setAuditLogs(getAuditLogs())
  }, [storeAuditLogs, getAuditLogs])

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

  // 未認証または運営でない場合はリダイレクト
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p>読み込み中...</p>
      </div>
    )
  }

  if (status === 'unauthenticated' || !isAdmin) {
    router.push('/')
    return null
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
            <h1 className="text-2xl font-bold">監査ログ</h1>
            <div className="flex items-center gap-4 flex-wrap">
              <a
                href="/admin"
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm"
              >
                運営カレンダー
              </a>
              <a
                href="/admin/confirmed"
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 text-sm"
              >
                確定カレンダー
              </a>
              <span className="text-gray-700 text-sm">{user.name}さん</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4">運営操作の履歴</h2>
          <p className="text-gray-600 mb-4">
            運営が候補を確定した履歴を確認できます。
          </p>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作日時
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    運営者
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    講師
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    開催日
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    時間枠
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                      監査ログはありません
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                        {log.timestamp.toLocaleString('ja-JP', {
                          timeZone: 'Asia/Tokyo',
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                        {log.adminName}
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            log.action === 'confirmed'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {log.action === 'confirmed' ? '確定' : log.action}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                        {log.instructorName}講師
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                        {log.eventDate.toLocaleDateString('ja-JP', {
                          timeZone: 'Asia/Tokyo',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                        {log.eventTimeSlot === '21:00-23:00' ? '21時〜23時' : '22時〜24時'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}