'use client'

import { useState } from 'react'

/** Date をローカル YYYY-MM-DD に変換 */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

type TimeSlot = '21:00-23:00' | '22:00-24:00'

interface RegisteredSlot {
  dateStr: string
  timeSlot: TimeSlot
}

export default function MockupPage() {
  // 選択状態: "2026-01-26_21:00-23:00" のような形式で保存
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(
    new Set(['2026-01-26_21:00-23:00', '2026-01-28_22:00-24:00'])
  )
  // 登録済み候補
  const [registeredSlots, setRegisteredSlots] = useState<RegisteredSlot[]>([
    { dateStr: '2026-01-15', timeSlot: '22:00-24:00' },
  ])
  // 編集中の候補
  const [editingSlot, setEditingSlot] = useState<RegisteredSlot | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)

  const handleToggleSlot = (dateStr: string, timeSlot: TimeSlot) => {
    const key = `${dateStr}_${timeSlot}`
    setSelectedSlots((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleRegisterSelected = () => {
    if (selectedSlots.size === 0) {
      alert('候補を選択してください。')
      return
    }

    const newRegistered: RegisteredSlot[] = []
    selectedSlots.forEach((key) => {
      const [dateStr, timeSlot] = key.split('_') as [string, TimeSlot]
      // 既に登録済みでないかチェック
      const alreadyRegistered = registeredSlots.some(
        (r) => r.dateStr === dateStr && r.timeSlot === timeSlot
      )
      if (!alreadyRegistered) {
        newRegistered.push({ dateStr, timeSlot })
      }
    })

    if (newRegistered.length > 0) {
      setRegisteredSlots((prev) => [...prev, ...newRegistered])
      setSelectedSlots(new Set())
      alert(`${newRegistered.length}件の候補を登録しました。`)
    } else {
      alert('選択した候補は既に登録済みです。')
    }
  }

  const getRegisteredSlotsForDate = (dateStr: string): TimeSlot[] => {
    return registeredSlots.filter((r) => r.dateStr === dateStr).map((r) => r.timeSlot)
  }

  const handleEditSlot = (slot: RegisteredSlot) => {
    setEditingSlot(slot)
    setShowEditModal(true)
  }

  const handleDeleteSlot = (slot: RegisteredSlot) => {
    if (confirm('この候補を削除しますか？')) {
      setRegisteredSlots((prev) =>
        prev.filter((r) => !(r.dateStr === slot.dateStr && r.timeSlot === slot.timeSlot))
      )
    }
  }

  const handleSaveEdit = (newDateStr: string, newTimeSlot: TimeSlot) => {
    if (!editingSlot) return

    // 既に同じ日付・時間枠の候補がないかチェック（自分自身を除く）
    const duplicate = registeredSlots.some(
      (r) =>
        r.dateStr === newDateStr &&
        r.timeSlot === newTimeSlot &&
        !(r.dateStr === editingSlot.dateStr && r.timeSlot === editingSlot.timeSlot)
    )

    if (duplicate) {
      alert('同じ日付・時間枠の候補が既に登録されています。')
      return
    }

    setRegisteredSlots((prev) =>
      prev.map((r) =>
        r.dateStr === editingSlot.dateStr && r.timeSlot === editingSlot.timeSlot
          ? { dateStr: newDateStr, timeSlot: newTimeSlot }
          : r
      )
    )
    setShowEditModal(false)
    setEditingSlot(null)
  }

  const handleClickRegisteredSlot = (dateStr: string, timeSlot: TimeSlot) => {
    const slot = registeredSlots.find((r) => r.dateStr === dateStr && r.timeSlot === timeSlot)
    if (!slot) return

    const action = prompt(
      `${dateStr} ${timeSlot === '21:00-23:00' ? '21時〜23時' : '22時〜24時'}\n\n操作を選択してください:\n1: 修正\n2: 削除\n\n1または2を入力してください`,
      '1'
    )

    if (action === '1') {
      handleEditSlot(slot)
    } else if (action === '2') {
      handleDeleteSlot(slot)
    }
  }

  // 2026年1月のカレンダーを生成
  const year = 2026
  const month = 1
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const startDate = new Date(firstDay)
  startDate.setDate(startDate.getDate() - startDate.getDay()) // 週の最初の日（日曜日）に調整

  const weeks: Date[][] = []
  let currentDate = new Date(startDate)

  while (currentDate <= lastDay || weeks.length < 6) {
    const week: Date[] = []
    for (let i = 0; i < 7; i++) {
      week.push(new Date(currentDate))
      currentDate.setDate(currentDate.getDate() + 1)
    }
    weeks.push(week)
    if (currentDate > lastDay && currentDate.getDate() > 7) break
  }

  const weekDays = ['日', '月', '火', '水', '木', '金', '土']

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="bg-white shadow-sm rounded-lg p-4 sm:p-6 mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">講師ダッシュボード（モックアップ）</h1>
          <p className="text-gray-600">カレンダーの日付にチェックボックスが表示され、選択できるモックアップです</p>
        </header>

        <div className="bg-white rounded-lg shadow p-4 sm:p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">開催候補日時の提出</h2>
          <p className="text-gray-600 mb-4">
            カレンダーの日付のチェックボックスで候補日を選択するか、日付をクリックして候補日時を入力してください。
          </p>
          {selectedSlots.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <button
                type="button"
                onClick={handleRegisterSelected}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                選択した候補を登録（{selectedSlots.size}件）
              </button>
              <button
                type="button"
                onClick={() => setSelectedSlots(new Set())}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                選択を解除
              </button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">
              {year}年{month}月
            </h2>
            <div className="flex gap-2">
              <button className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">前</button>
              <button className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">次</button>
            </div>
          </div>

          {/* カレンダーグリッド */}
          <div className="border border-gray-300 rounded-lg overflow-hidden">
            {/* 曜日ヘッダー */}
            <div className="grid grid-cols-7 bg-gray-100 border-b border-gray-300">
              {weekDays.map((day) => (
                <div
                  key={day}
                  className="p-2 sm:p-3 text-center text-sm sm:text-base font-semibold text-gray-700 border-r border-gray-300 last:border-r-0"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* 日付セル */}
            {weeks.map((week, weekIdx) => (
              <div key={weekIdx} className="grid grid-cols-7 border-b border-gray-300 last:border-b-0">
                {week.map((date, dayIdx) => {
                  const dateStr = toLocalDateStr(date)
                  const isCurrentMonth = date.getMonth() === month - 1
                  const isToday = dateStr === toLocalDateStr(new Date())
                  const isSelected21 = selectedSlots.has(`${dateStr}_21:00-23:00`)
                  const isSelected22 = selectedSlots.has(`${dateStr}_22:00-24:00`)
                  const registeredForDate = getRegisteredSlotsForDate(dateStr)
                  const hasRegistered21 = registeredForDate.includes('21:00-23:00')
                  const hasRegistered22 = registeredForDate.includes('22:00-24:00')

                  return (
                    <div
                      key={dayIdx}
                      className={`min-h-[80px] sm:min-h-[100px] p-1 sm:p-2 border-r border-gray-300 last:border-r-0 flex flex-col items-start ${
                        !isCurrentMonth ? 'bg-gray-50 text-gray-400' : 'bg-white'
                      } ${isToday ? 'bg-blue-50' : ''} hover:bg-blue-50 transition-colors`}
                    >
                      {/* 日付番号 */}
                      <div className="w-full text-center mb-1">
                        <span
                          className={`text-sm sm:text-base font-medium ${
                            isToday
                              ? 'bg-blue-600 text-white rounded-full w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center mx-auto'
                              : ''
                          }`}
                        >
                          {date.getDate()}
                        </span>
                      </div>

                      {/* 21:00〜のチェックボックス */}
                      {isCurrentMonth && (
                        <div className="w-full flex items-center gap-1 mb-1">
                          <input
                            type="checkbox"
                            checked={isSelected21}
                            onChange={(e) => {
                              e.stopPropagation()
                              handleToggleSlot(dateStr, '21:00-23:00')
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer flex-shrink-0"
                            title="21時〜23時を選択"
                          />
                          <span className="text-xs sm:text-sm text-gray-700 whitespace-nowrap">21:00〜</span>
                        </div>
                      )}

                      {/* 22:00〜のチェックボックス */}
                      {isCurrentMonth && (
                        <div className="w-full flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={isSelected22}
                            onChange={(e) => {
                              e.stopPropagation()
                              handleToggleSlot(dateStr, '22:00-24:00')
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer flex-shrink-0"
                            title="22時〜24時を選択"
                          />
                          <span className="text-xs sm:text-sm text-gray-700 whitespace-nowrap">22:00〜</span>
                        </div>
                      )}

                      {/* 登録済み候補の表示 */}
                      {isCurrentMonth && registeredForDate.length > 0 && (
                        <div className="mt-1 w-full space-y-0.5">
                          {hasRegistered21 && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation()
                                handleClickRegisteredSlot(dateStr, '21:00-23:00')
                              }}
                              className="bg-yellow-200 text-yellow-800 px-1 py-0.5 rounded text-center text-xs sm:text-sm cursor-pointer hover:bg-yellow-300 transition-colors"
                              title="クリックして修正・削除"
                            >
                              21時〜23時
                            </div>
                          )}
                          {hasRegistered22 && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation()
                                handleClickRegisteredSlot(dateStr, '22:00-24:00')
                              }}
                              className="bg-yellow-200 text-yellow-800 px-1 py-0.5 rounded text-center text-xs sm:text-sm cursor-pointer hover:bg-yellow-300 transition-colors"
                              title="クリックして修正・削除"
                            >
                              22時〜24時
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="mt-4 text-sm text-gray-600">
            <p>✓ 各日付の下に2つのチェックボックス（21:00〜、22:00〜）が表示されています</p>
            <p>✓ チェックボックスをクリックして時間枠を選択できます</p>
            <p>✓ 選択した候補は「選択した候補を登録」ボタンで一括登録できます</p>
          </div>
        </div>

        <div className="mt-6 bg-white rounded-lg shadow p-4 sm:p-6">
          <h2 className="text-xl font-semibold mb-4">提出済み候補一覧</h2>
          <div className="space-y-2">
            {registeredSlots.length === 0 ? (
              <p className="text-gray-500">まだ候補が提出されていません</p>
            ) : (
              registeredSlots
                .sort((a, b) => {
                  if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr)
                  return a.timeSlot.localeCompare(b.timeSlot)
                })
                .map((slot, idx) => {
                  const [y, m, d] = slot.dateStr.split('-').map(Number)
                  const date = new Date(y, m - 1, d)
                  const timeDisplay = slot.timeSlot === '21:00-23:00' ? '21時〜23時' : '22時〜24時'
                  return (
                    <div
                      key={`${slot.dateStr}_${slot.timeSlot}_${idx}`}
                      className="p-4 border border-yellow-500 rounded-lg bg-yellow-50"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium">
                            {date.toLocaleDateString('ja-JP', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </p>
                          <p className="text-gray-600">{timeDisplay}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 bg-yellow-200 text-yellow-800 rounded-full text-sm font-medium">
                            候補
                          </span>
                          <button
                            onClick={() => handleEditSlot(slot)}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                          >
                            修正
                          </button>
                          <button
                            onClick={() => handleDeleteSlot(slot)}
                            className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
            )}
          </div>
        </div>
      </div>

      {/* 修正モーダル */}
      {showEditModal && editingSlot && (
        <EditSlotModal
          slot={editingSlot}
          onSave={handleSaveEdit}
          onCancel={() => {
            setShowEditModal(false)
            setEditingSlot(null)
          }}
        />
      )}
    </div>
  )
}

interface EditSlotModalProps {
  slot: RegisteredSlot
  onSave: (dateStr: string, timeSlot: TimeSlot) => void
  onCancel: () => void
}

function EditSlotModal({ slot, onSave, onCancel }: EditSlotModalProps) {
  const [dateStr, setDateStr] = useState(slot.dateStr)
  const [timeSlot, setTimeSlot] = useState<TimeSlot>(slot.timeSlot)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!dateStr || !timeSlot) {
      alert('すべての項目を入力してください。')
      return
    }
    onSave(dateStr, timeSlot)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow-lg max-w-md w-full">
        <h2 className="text-lg sm:text-xl font-bold mb-4">候補を修正</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              開催日 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              保存
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
