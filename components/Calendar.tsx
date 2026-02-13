'use client'

import { useState } from 'react'
import { Calendar as BigCalendar, momentLocalizer, View } from 'react-big-calendar'
import moment from 'moment'
import 'moment/locale/ja'
import { SessionCandidate, TimeSlot } from '@/types'

moment.locale('ja')
const baseLocalizer = momentLocalizer(moment)

/** 常に6週間（42日）分の日付を返す localizer（全月6行表示固定用） */
const localizer = (() => {
  const visibleDays = (date: Date) => {
    const first = moment(date).startOf('month').startOf('week').toDate()
    const days: Date[] = []
    for (let i = 0; i < 42; i++) {
      days.push(moment(first).add(i, 'days').toDate())
    }
    return days
  }
  return { ...baseLocalizer, visibleDays } as unknown as typeof baseLocalizer
})()

/** Date をローカル YYYY-MM-DD に変換 */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface CalendarProps {
  events: SessionCandidate[]
  onSelectSlot?: (slotInfo: { start: Date; end: Date }) => void
  onSelectEvent?: (event: SessionCandidate) => void
  selectedSlots?: Set<string> // "2026-01-26_21:00-23:00" 形式
  onToggleSlot?: (dateStr: string, timeSlot: TimeSlot) => void
  googleCalendarConflicts?: Map<string, Set<TimeSlot>> // 日付 -> 重複している時間枠のセット
  submittedSlots?: SessionCandidate[] // 提出済みの候補
  defaultView?: View
  maxEventsPerDay?: number // 1日に表示する最大イベント数
  onMonthChange?: (date: Date) => void // 月が変わった時のコールバック
  selectedEventIds?: Set<string> // 複数選択モードで選択されたイベントID
  instructorAvatars?: Record<string, string | null> // 講師ID -> アバターURL
  instructorGenres?: Record<string, string | null> // 講師ID -> ジャンル
  variant?: 'default' | 'confirmed' // カレンダーの種類（確定カレンダー用は枠なし・大きい表示）
}

export default function Calendar({
  events = [],
  onSelectSlot,
  onSelectEvent,
  selectedSlots,
  onToggleSlot,
  googleCalendarConflicts,
  submittedSlots,
  defaultView = 'month',
  maxEventsPerDay = 2,
  onMonthChange,
  selectedEventIds,
  instructorAvatars,
  instructorGenres,
  variant = 'default',
}: CalendarProps) {
  const [currentView, setCurrentView] = useState<View>(defaultView)
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [expandedDate, setExpandedDate] = useState<string | null>(null)

  // 月が変わった時にコールバックを呼び出す
  const handleNavigate = (newDate: Date) => {
    setCurrentDate(newDate)
    if (onMonthChange) {
      onMonthChange(newDate)
    }
  }

  // 日付ごとにイベントをグループ化
  const eventsByDate = new Map<string, SessionCandidate[]>()
  events.forEach((event) => {
    const dateStr = toLocalDateStr(new Date(event.date))
    if (!eventsByDate.has(dateStr)) {
      eventsByDate.set(dateStr, [])
    }
    eventsByDate.get(dateStr)!.push(event)
  })

  // 表示用イベントを作成（maxEventsPerDay件まで + 「+○件」表示用）
  const displayEvents: SessionCandidate[] = []
  const moreCountByDate = new Map<string, number>()

  // ソート順: 確定→提出、同じステータス内では21時→22時
  const calcSortOrder = (status: string, timeSlot: string): number => {
    const statusPriority: Record<string, number> = { confirmed: 0, submitted: 10 }
    const timePriority = timeSlot === '21:00-23:00' ? 0 : 1 // 21時が先
    return (statusPriority[status] ?? 99) + timePriority
  }

  eventsByDate.forEach((dateEvents, dateStr) => {
    // 確定→提出、同じステータス内では21時→22時でソート
    const sortedEvents = [...dateEvents].sort((a, b) => {
      const orderA = calcSortOrder(a.status, a.timeSlot)
      const orderB = calcSortOrder(b.status, b.timeSlot)
      return orderA - orderB
    })
    
    if (sortedEvents.length <= maxEventsPerDay) {
      displayEvents.push(...sortedEvents)
    } else {
      displayEvents.push(...sortedEvents.slice(0, maxEventsPerDay))
      moreCountByDate.set(dateStr, sortedEvents.length - maxEventsPerDay)
    }
  })

  // ソート順を計算：確定→提出、同じステータス内では21時→22時
  const getSortOrder = (status: string, timeSlot: string): number => {
    const statusOrder: Record<string, number> = { confirmed: 0, submitted: 10 }
    const timeOrder = timeSlot === '21:00-23:00' ? 0 : 1 // 21時が先
    return (statusOrder[status] ?? 99) + timeOrder
  }

  const calendarEvents = displayEvents.map((event) => {
    const eventDate = new Date(event.date)
    const dateStr = toLocalDateStr(eventDate)
    
    if (event.instructorName === '候補あり') {
      return {
        id: event.id,
        title: '候補あり',
        start: new Date(`${dateStr}T00:00:00+09:00`),
        end: new Date(`${dateStr}T23:59:59+09:00`),
        resource: event,
      }
    }
    const [startTime, endTime] = event.timeSlot.split('-')
    const sortOrder = getSortOrder(event.status, event.timeSlot)
    const timeDisplay = event.timeSlot === '21:00-23:00' ? '21時〜23時' : '22時〜24時'
    const title = `${event.instructorName}講師\n${timeDisplay}`
    // 開始時間をソート順に合わせて調整（00:00, 00:01, 00:10, 00:11, etc.）
    const sortHour = Math.floor(sortOrder / 10)
    const sortMin = sortOrder % 10
    return {
      id: event.id,
      title: title,
      start: new Date(`${dateStr}T${sortHour.toString().padStart(2, '0')}:${sortMin.toString().padStart(2, '0')}:00+09:00`),
      end: new Date(`${dateStr}T${endTime}:00+09:00`),
      resource: event,
    }
  })

  const eventStyleGetter = (event: any) => {
    const status = event.resource.status
    const instructorName = event.resource.instructorName
    
    if (instructorName === '候補あり') {
      return {
        style: {
          backgroundColor: '#6c757d',
          borderRadius: '5px',
          opacity: 0.8,
          color: 'white',
          border: '2px dashed #ffffff',
          display: 'block',
        },
      }
    }

    // 確定カレンダー用のスタイル（枠なし、大きい表示）
    if (variant === 'confirmed') {
      let style: any = {
        backgroundColor: 'transparent',
        borderRadius: '0',
        opacity: 1,
        color: '#111827',
        border: 'none',
        display: 'block',
        boxShadow: 'none',
      }

      if (selectedEventIds?.has(event.resource.id)) {
        style.backgroundColor = 'rgba(59, 130, 246, 0.2)'
        style.borderRadius = '5px'
      }

      return { style }
    }

    // デフォルトのスタイル（講師カレンダー、運営カレンダー用）
    let style: any = {
      backgroundColor: '#3174ad',
      borderRadius: '5px',
      opacity: 0.8,
      color: 'white',
      border: '0px',
      display: 'block',
    }

    if (status === 'confirmed') {
      style.backgroundColor = '#22c55e'
      style.opacity = 0.9
      style.border = '2px solid #16a34a'
    } else if (status === 'submitted') {
      style.backgroundColor = '#ffc107'
    }

    // 複数選択モードで選択されている場合は枠線を強調
    if (selectedEventIds?.has(event.resource.id)) {
      style.border = '3px solid #3b82f6'
      style.boxShadow = '0 0 8px rgba(59, 130, 246, 0.6)'
    }

    return {
      style,
    }
  }

  const handleShowMore = (dateStr: string) => {
    setExpandedDate(dateStr)
  }

  const getEventsForDate = (dateStr: string) => {
    const events = eventsByDate.get(dateStr) || []
    // 確定→提出、同じステータス内では21時→22時でソート
    const calcOrder = (status: string, timeSlot: string): number => {
      const statusPriority: Record<string, number> = { confirmed: 0, submitted: 10 }
      const timePriority = timeSlot === '21:00-23:00' ? 0 : 1 // 21時が先
      return (statusPriority[status] ?? 99) + timePriority
    }
    return [...events].sort((a, b) => {
      return calcOrder(a.status, a.timeSlot) - calcOrder(b.status, b.timeSlot)
    })
  }

  return (
    <div className={`w-full bg-white p-2 sm:p-4 rounded-lg shadow overflow-x-auto ${variant === 'confirmed' ? 'calendar-variant-confirmed' : ''}`} style={{ minWidth: 0 }}>
      <div
        className="w-full min-h-0 min-w-0"
        style={{ position: 'relative', width: '100%' }}
      >
        <BigCalendar
          localizer={localizer}
          events={calendarEvents}
          startAccessor="start"
          endAccessor="end"
          style={{ height: 'fit-content' }}
          onSelectSlot={onSelectSlot || undefined}
          onSelectEvent={onSelectEvent ? (event) => onSelectEvent(event.resource) : undefined}
          selectable={!!onSelectSlot}
          selectableRows={1}
          view={currentView}
          onView={setCurrentView}
          date={currentDate}
          onNavigate={handleNavigate}
          views={['month']}
          formats={{
            monthHeaderFormat: 'YYYY年M月',
            dateFormat: 'D', // 1〜9（ゼロ埋めなし）
          }}
          messages={{
            today: '今月',
            previous: '前',
            next: '次',
            month: '月',
            week: '週',
            day: '日',
            agenda: '予定',
            date: '日付',
            time: '時間',
            event: 'イベント',
            noEventsInRange: 'この期間にイベントはありません',
          }}
          eventPropGetter={eventStyleGetter}
          popup={false}
          components={{
            dateHeader: (dateHeaderProps: any) => {
              const { label, date, drilldownView, onDrillDown } = dateHeaderProps
              if (variant === 'confirmed') {
                const dateStr = toLocalDateStr(new Date(date))
                const count = eventsByDate.get(dateStr)?.length ?? 0
                const suffix = count === 1 ? 'グルコン' : count === 2 ? '講師対談' : ''
                return (
                  <span className="flex w-full items-baseline justify-between gap-1">
                    <span>{label}</span>
                    {suffix && <span className="text-gray-600 font-normal text-[0.95em] shrink-0 text-right">{suffix}</span>}
                  </span>
                )
              }
              if (!drilldownView) return <span>{label}</span>
              return (
                <button type="button" className="rbc-button-link" onClick={onDrillDown}>
                  {label}
                </button>
              )
            },
            toolbar: (toolbarProps: any) => {
              const { label, onNavigate } = toolbarProps
              return (
                <div className="rbc-toolbar relative flex items-center justify-center mb-4">
                  <span className="rbc-btn-group absolute left-0">
                    <button type="button" onClick={() => onNavigate('PREV')}>前</button>
                    <button type="button" onClick={() => onNavigate('TODAY')}>今月</button>
                    <button type="button" onClick={() => onNavigate('NEXT')}>次</button>
                  </span>
                  <span className="rbc-toolbar-label text-3xl sm:text-4xl font-bold">{label}</span>
                </div>
              )
            },
            event: (props: any) => {
              const event = props.event.resource as SessionCandidate
              if (!event) return <div>{props.title}</div>
              
              const timeDisplay = event.timeSlot === '21:00-23:00' ? '21時〜23時' : '22時〜24時'
              const avatarUrl = instructorAvatars?.[event.instructorId]
              
              // 確定カレンダー用の大きい表示
              if (variant === 'confirmed') {
                return (
                  <div className="text-sm p-0.5 leading-tight flex flex-col gap-0.5">
                    <div className="flex items-start gap-1.5">
                      {instructorAvatars && (
                        <div className="flex-shrink-0">
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                              <span className="text-sm font-bold text-gray-600">
                                {event.instructorName.charAt(0)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="min-w-0 flex-1 text-gray-900 overflow-hidden">
                        <div className="font-bold break-words leading-tight text-[13px]">
                          {event.instructorName}
                          <br />
                          講師
                        </div>
                      </div>
                    </div>
                    <div className="text-[16px] leading-tight">{timeDisplay}</div>
                  </div>
                )
              }
              
              // デフォルトの表示（講師カレンダー、運営カレンダー用）
              return (
                <div className="text-xs p-0.5 leading-tight">
                  <div className="font-semibold truncate">{event.instructorName}講師</div>
                  <div className="truncate">{timeDisplay}</div>
                </div>
              )
            },
            dateCellWrapper: (props: any) => {
              const date = props.value
              if (!date) return <div>{props.children}</div>
              
              const dateStr = toLocalDateStr(new Date(date))
              const moreCount = moreCountByDate.get(dateStr) || 0
              const conflicts = googleCalendarConflicts?.get(dateStr) || new Set<TimeSlot>()
              const hasConflict21 = conflicts.has('21:00-23:00')
              const hasConflict22 = conflicts.has('22:00-24:00')
              
              const hasSubmitted21 = submittedSlots?.some(
                (slot) => toLocalDateStr(new Date(slot.date)) === dateStr && slot.timeSlot === '21:00-23:00'
              ) ?? false
              const hasSubmitted22 = submittedSlots?.some(
                (slot) => toLocalDateStr(new Date(slot.date)) === dateStr && slot.timeSlot === '22:00-24:00'
              ) ?? false
              
              const isSelected21 = selectedSlots?.has(`${dateStr}_21:00-23:00`) ?? false
              const isSelected22 = selectedSlots?.has(`${dateStr}_22:00-24:00`) ?? false
              // グレーアウトはGoogleカレンダーの競合のみ（両方の時間帯が競合している場合）
              const isGrayedOut = hasConflict21 && hasConflict22

              return (
                <div
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('input[type="checkbox"]')) return
                    if ((e.target as HTMLElement).closest('.show-more-btn')) return
                    e.stopPropagation()
                    e.preventDefault()
                    if (onSelectSlot && !isGrayedOut) {
                      const startDate = new Date(date)
                      startDate.setHours(0, 0, 0, 0)
                      const endDate = new Date(date)
                      endDate.setHours(23, 59, 59, 999)
                      onSelectSlot({ start: startDate, end: endDate })
                    }
                  }}
                  style={{
                    cursor: onSelectSlot && !isGrayedOut ? 'pointer' : 'default',
                    width: '100%',
                    height: '100%',
                    minHeight: '100px',
                    position: 'relative',
                    opacity: isGrayedOut ? 0.5 : 1,
                    backgroundColor: isGrayedOut ? '#e5e7eb' : 'transparent',
                  }}
                  className={`date-cell-wrapper flex flex-col justify-start items-start ${onSelectSlot && !isGrayedOut ? 'hover:bg-blue-50 transition-colors' : ''}`}
                  title={isGrayedOut ? 'Googleカレンダーに予定があるため選択できません' : onSelectSlot ? 'クリックして候補日を登録' : undefined}
                >
                  {/* 「+○件」ボタン - 日付の横に表示 */}
                  {moreCount > 0 && (
                    <button
                      className="show-more-btn absolute top-1 right-1 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded hover:bg-blue-600 z-20"
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        handleShowMore(dateStr)
                      }}
                    >
                      +{moreCount}件
                    </button>
                  )}
                  
                  {onToggleSlot && !isGrayedOut && (
                    <div className="absolute bottom-1 left-1 right-1 flex flex-col gap-1 z-10">
                      {!hasConflict21 && !hasSubmitted21 && (
                        <div className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={isSelected21}
                            onChange={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              onToggleSlot(dateStr, '21:00-23:00')
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer flex-shrink-0"
                            title="21時〜23時を選択"
                          />
                          <span className="text-sm sm:text-base text-gray-700 whitespace-nowrap">21:00〜</span>
                        </div>
                      )}
                      {!hasConflict22 && !hasSubmitted22 && (
                        <div className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={isSelected22}
                            onChange={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              onToggleSlot(dateStr, '22:00-24:00')
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer flex-shrink-0"
                            title="22時〜24時を選択"
                          />
                          <span className="text-sm sm:text-base text-gray-700 whitespace-nowrap">22:00〜</span>
                        </div>
                      )}
                    </div>
                  )}
                  {props.children}
                </div>
              )
            },
          } as any}
        />
      </div>

      {/* 展開モーダル */}
      {expandedDate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg shadow-lg max-w-sm w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-lg">
                {new Date(expandedDate + 'T00:00:00').toLocaleDateString('ja-JP', {
                  month: 'long',
                  day: 'numeric',
                })}の候補
              </h3>
              <button
                onClick={() => setExpandedDate(null)}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2">
              {getEventsForDate(expandedDate).map((event) => {
                const timeDisplay = event.timeSlot === '21:00-23:00' ? '21時〜23時' : '22時〜24時'
                const statusColor = event.status === 'confirmed' 
                  ? 'bg-green-500' 
                  : 'bg-yellow-500'
                const isSelected = selectedEventIds?.has(event.id)
                return (
                  <div
                    key={event.id}
                    className={`${statusColor} text-white p-3 rounded-lg cursor-pointer hover:opacity-90 ${
                      isSelected ? 'ring-4 ring-blue-400 ring-offset-2' : ''
                    }`}
                    onClick={() => {
                      if (onSelectEvent) {
                        onSelectEvent(event)
                      }
                      // 複数選択モードでない場合のみモーダルを閉じる
                      if (!selectedEventIds) {
                        setExpandedDate(null)
                      }
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-start gap-2">
                        {instructorAvatars && (
                          <div className="flex-shrink-0 mt-0.5">
                            {instructorAvatars[event.instructorId] ? (
                              <img
                                src={instructorAvatars[event.instructorId]!}
                                alt=""
                                className="w-8 h-8 rounded-full object-cover border border-white/50"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-white/30 flex items-center justify-center border border-white/50">
                                <span className="text-sm font-bold">
                                  {event.instructorName.charAt(0)}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold">{event.instructorName}講師</div>
                          <div className="text-sm">{timeDisplay}</div>
                          {event.memo && <div className="text-xs mt-1 opacity-90">{event.memo}</div>}
                        </div>
                      </div>
                      {isSelected && (
                        <div className="ml-2">
                          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
