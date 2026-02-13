'use client'

import { useState, useEffect } from 'react'
import { EventFormData, SessionCandidate, TimeSlot } from '@/types'

/** Date をローカル日付の YYYY-MM-DD に変換（UTC ずれを防ぐ） */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** YYYY-MM-DD をローカル日付の Date に変換（UTC ずれを防ぐ） */
function parseLocalDate(s: string): Date {
  const [y, m, day] = s.split('-').map(Number)
  return new Date(y, m - 1, day, 0, 0, 0, 0)
}

interface EventFormProps {
  onSubmit: (data: EventFormData) => void
  onCancel: () => void
  initialDate?: Date
  editingEvent?: SessionCandidate | null
}

export default function EventForm({ onSubmit, onCancel, initialDate, editingEvent }: EventFormProps) {
  const [date, setDate] = useState('')
  const [timeSlot, setTimeSlot] = useState<TimeSlot>('21:00-23:00')
  const [memo, setMemo] = useState('')

  useEffect(() => {
    if (editingEvent) {
      const eventDate = new Date(editingEvent.date)
      setDate(toLocalDateString(eventDate))
      setTimeSlot(editingEvent.timeSlot)
      setMemo(editingEvent.memo || '')
    } else if (initialDate) {
      setDate(toLocalDateString(new Date(initialDate)))
      setTimeSlot('21:00-23:00')
      setMemo('')
    }
  }, [editingEvent, initialDate])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!date || !timeSlot) {
      alert('すべての必須フィールドを入力してください')
      return
    }
    const submitDate = parseLocalDate(date)
    onSubmit({
      date: submitDate,
      timeSlot,
      memo: memo || undefined,
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow-lg max-w-md w-full mx-4 my-4">
        <h2 className="text-lg sm:text-xl font-bold mb-4">
          {editingEvent ? '候補日時を編集' : '候補日時を入力'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              開催日 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {date && (
              <p className="text-sm text-gray-500 mt-1">
                選択日: {parseLocalDate(date).toLocaleDateString('ja-JP', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  weekday: 'long',
                })}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              開催時間 <span className="text-red-500">*</span>
            </label>
            <select
              value={timeSlot}
              onChange={(e) => setTimeSlot(e.target.value as TimeSlot)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
            >
              <option value="21:00-23:00">21時〜23時</option>
              <option value="22:00-24:00">22時〜24時</option>
            </select>
            <p className="text-sm text-gray-500 mt-1">
              選択中の時間: {timeSlot === '21:00-23:00' ? '21時〜23時' : '22時〜24時'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              メモ（任意）
            </label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="メモを入力してください（任意）"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {editingEvent ? '更新' : '提出'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              キャンセル
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}