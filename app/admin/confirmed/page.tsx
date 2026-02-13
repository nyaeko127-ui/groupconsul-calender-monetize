'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useEventStore } from '@/store/eventStore'
import Calendar from '@/components/Calendar'
import { SessionCandidate, User } from '@/types'

export default function ConfirmedEventsPage() {
  const router = useRouter()
  const { currentUser, events, getEventsByStatus, initializeFromLocalStorage, setCurrentUser } = useEventStore()
  const [confirmedEvents, setConfirmedEvents] = useState<SessionCandidate[]>([])
  const [instructorAvatars, setInstructorAvatars] = useState<Record<string, string | null>>({})

  useEffect(() => {
    initializeFromLocalStorage()
    // デフォルトで運営ユーザーを設定
    if (!currentUser || currentUser.role !== 'admin') {
      const defaultUser: User = {
        id: 'admin-1',
        name: '運営',
        email: 'admin@example.com',
        role: 'admin',
      }
      setCurrentUser(defaultUser)
    }
  }, [currentUser, router, initializeFromLocalStorage, setCurrentUser])

  const updateEvents = useCallback(() => {
    // 「候補あり」という特別なイベントは除外して、全講師の確定済み候補を表示
    const allConfirmed = events.filter(
      (event) => event.status === 'confirmed' && event.instructorName !== '候補あり'
    )
    setConfirmedEvents(allConfirmed)
  }, [events])

  useEffect(() => {
    updateEvents()
  }, [events, updateEvents])

  // 講師のアバター画像を取得
  useEffect(() => {
    const fetchInstructorInfo = async () => {
      if (confirmedEvents.length === 0) return

      const instructorIds = [...new Set(confirmedEvents.map(e => e.instructorId))]
      
      try {
        const response = await fetch('/api/avatar/instructors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instructorIds }),
        })
        const data = await response.json()
        if (data.avatars) {
          setInstructorAvatars(data.avatars)
        }
      } catch (error) {
        console.error('Failed to fetch instructor info:', error)
      }
    }
    fetchInstructorInfo()
  }, [confirmedEvents])

  const user = currentUser || {
    id: 'admin-1',
    name: '運営',
    email: 'admin@example.com',
    role: 'admin' as const,
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">確定カレンダー</h1>
            <div className="flex items-center gap-4">
              <a
                href="/"
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
              >
                講師カレンダー
              </a>
              <a
                href="/admin"
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                運営カレンダー
              </a>
              <span className="text-gray-700">{user.name}さん</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 確定カレンダー：スクロールせず全体表示（講師・運営カレンダーと同じ） */}
        <section className="mb-8 overflow-visible" style={{ maxHeight: 'none', height: 'auto' }} aria-label="確定カレンダー">
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-4">確定済み開催日時（全講師）</h2>
            <p className="text-gray-600 mb-4">
              全講師の確定したグルコンの開催日時をカレンダーと一覧で確認できます。
            </p>
          </div>

          <Calendar
            events={confirmedEvents}
            defaultView="month"
            instructorAvatars={instructorAvatars}
            variant="confirmed"
          />
        </section>

        <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">確定カレンダー（全講師）</h2>
          <div className="space-y-2">
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
                    className="p-3 border border-green-500 rounded-lg bg-green-50"
                  >
                    <div className="flex items-center gap-3">
                      {/* 講師アバター */}
                      <div className="flex-shrink-0">
                        {instructorAvatars[event.instructorId] ? (
                          <img
                            src={instructorAvatars[event.instructorId]!}
                            alt={event.instructorName}
                            className="w-10 h-10 rounded-full object-cover border-2 border-green-300"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-green-200 flex items-center justify-center border-2 border-green-300">
                            <span className="text-green-700 font-bold">
                              {event.instructorName.charAt(0)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="font-medium">{event.instructorName}講師</span>
                        <span className="text-gray-700">
                          {event.date.toLocaleDateString('ja-JP', {
                            month: 'numeric',
                            day: 'numeric',
                            weekday: 'short',
                          })}
                        </span>
                        <span className="text-gray-700">
                          {event.timeSlot === '21:00-23:00' ? '21時〜23時' : '22時〜24時'}
                        </span>
                        {event.memo && (
                          <span className="text-sm text-gray-600 italic">
                            メモ: {event.memo}
                          </span>
                        )}
                      </div>
                      <span className="flex-shrink-0 px-3 py-1 bg-green-200 text-green-800 rounded-full text-sm font-medium">
                        確定
                      </span>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      </main>
    </div>
  )
}