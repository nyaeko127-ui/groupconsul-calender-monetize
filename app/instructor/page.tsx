'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useEventStore } from '@/store/eventStore'
import Calendar from '@/components/Calendar'
import EventForm from '@/components/EventForm'
import { EventDate, EventFormData } from '@/types'

export default function InstructorPage() {
  const router = useRouter()
  const { currentUser, events, addEvent, getEventsByInstructor, initializeFromLocalStorage } =
    useEventStore()
  const [showForm, setShowForm] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [instructorEvents, setInstructorEvents] = useState<EventDate[]>([])

  useEffect(() => {
    initializeFromLocalStorage()
    if (!currentUser || currentUser.role !== 'instructor') {
      router.push('/login')
      return
    }
  }, [currentUser, router, initializeFromLocalStorage])

  const updateEvents = useCallback(() => {
    if (currentUser) {
      setInstructorEvents(getEventsByInstructor(currentUser.id))
    }
  }, [currentUser, getEventsByInstructor])

  useEffect(() => {
    updateEvents()
  }, [events, updateEvents])

  const handleSelectSlot = (slotInfo: { start: Date; end: Date }) => {
    setSelectedDate(slotInfo.start)
    setShowForm(true)
  }

  const handleSubmitEvent = (formData: EventFormData) => {
    if (!currentUser) return

    const selectedDate = formData.date
    const yearMonth = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`
    const newEvent: EventDate = {
      id: `event-${Date.now()}-${Math.random()}`,
      instructorId: currentUser.id,
      instructorName: currentUser.name,
      month: yearMonth,
      date: selectedDate,
      timeSlot: formData.timeSlot,
      memo: formData.memo,
      status: 'submitted',
      submittedAt: new Date(),
    }

    addEvent(newEvent)
    setShowForm(false)
    setSelectedDate(null)
  }

  const handleLogout = () => {
    useEventStore.getState().setCurrentUser(null)
    router.push('/login')
  }

  if (!currentUser) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">講師ダッシュボード</h1>
            <div className="flex items-center gap-4">
              <span className="text-gray-700">{currentUser.name}さん</span>
              <button
                onClick={handleLogout}
                className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400"
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4">開催候補日時の提出</h2>
          <p className="text-gray-600 mb-4">
            カレンダー上で日付をクリックして候補日時を入力してください。
          </p>
        </div>

        <div className="mb-8">
          <Calendar
            events={instructorEvents}
            onSelectSlot={handleSelectSlot}
            defaultView="month"
          />
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">提出済み候補一覧</h2>
          <div className="space-y-2">
            {instructorEvents.length === 0 ? (
              <p className="text-gray-500">まだ候補が提出されていません</p>
            ) : (
              instructorEvents
                .sort((a, b) => a.date.getTime() - b.date.getTime())
                .map((event) => (
                  <div
                    key={event.id}
                    className={`p-4 border rounded-lg ${
                      event.status === 'confirmed'
                        ? 'border-green-500 bg-green-50'
                        : 'border-yellow-500 bg-yellow-50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">
                          {event.date.toLocaleDateString('ja-JP', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                        <p className="text-gray-600">
                          {event.timeSlot}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          提出日: {event.submittedAt.toLocaleString('ja-JP')}
                        </p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          event.status === 'confirmed'
                            ? 'bg-green-200 text-green-800'
                            : 'bg-yellow-200 text-yellow-800'
                        }`}
                      >
                        {event.status === 'confirmed' ? '確定' : '審査中'}
                      </span>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        {showForm && (
          <EventForm
            onSubmit={handleSubmitEvent}
            onCancel={() => {
              setShowForm(false)
              setSelectedDate(null)
            }}
            initialDate={selectedDate || undefined}
          />
        )}
      </main>
    </div>
  )
}