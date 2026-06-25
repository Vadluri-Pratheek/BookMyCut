import React from 'react';
import { C, OPEN, CLOSE, TOTAL, TODAY, pctW, minsToLabel, getVisibleWorkWindow, getVisibleTimelineSegment } from '../pages/BarberDashboard';
import { isTuesdayDateStr } from '../utils/date';

export const ContinuousTimeline = ({ bookings, blockedSlots, schedule, date }) => {
  const bks = (bookings[date] || []).filter((booking) => booking.status === 'upcoming');
  const blocked = Array.isArray(schedule?.breaks)
    ? schedule.breaks
    : blockedSlots.filter((item) => item.date === date);
  const isToday = date === TODAY;
  const isClosedDay = isTuesdayDateStr(date);
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const visibleWorkWindow = getVisibleWorkWindow(schedule);
  const outsideSegments = isClosedDay
    ? [{ startMins: OPEN, endMins: CLOSE }]
    : visibleWorkWindow
      ? [
        ...(visibleWorkWindow.start > OPEN ? [{ startMins: OPEN, endMins: visibleWorkWindow.start }] : []),
        ...(visibleWorkWindow.end < CLOSE ? [{ startMins: visibleWorkWindow.end, endMins: CLOSE }] : []),
      ]
      : (schedule ? [{ startMins: OPEN, endMins: CLOSE }] : []);

  return (
    <div>
      {/* Track */}
      <div style={{ position: 'relative', height: 44, borderRadius: 8, background: '#f8fafc', border: `1px solid ${C.border}`, overflow: 'hidden' }}>

        {/* Green base — available */}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,122,0,0.16)', borderRight: '1px solid rgba(255,122,0,0.24)' }} />

        {outsideSegments.map((segment, index) => {
          const visibleSegment = getVisibleTimelineSegment(segment.startMins, segment.endMins);
          if (!visibleSegment) return null;

          return (
            <div key={`outside-${index}`} style={{
              position: 'absolute',
              top: 0,
              height: '100%',
              left: visibleSegment.left,
              width: visibleSegment.width,
              background: 'rgba(148,163,184,0.3)',
              borderLeft: '1px solid rgba(148,163,184,0.35)',
              borderRight: '1px solid rgba(148,163,184,0.35)',
            }} />
          );
        })}

        {/* Booked segments (grey) */}
        {!isClosedDay && bks.map((b, i) => {
          const visibleSegment = getVisibleTimelineSegment(b.startMins, b.endMins);
          if (!visibleSegment) return null;

          return (
            <div key={i} style={{
              position: 'absolute', top: 0, height: '100%',
              left: visibleSegment.left, width: visibleSegment.width,
              background: 'rgba(100,116,139,0.45)',
              borderLeft: '1px solid rgba(100,116,139,0.5)',
              borderRight: '1px solid rgba(100,116,139,0.5)',
            }} />
          );
        })}

        {/* Blocked segments (amber) */}
        {!isClosedDay && blocked.map((b, i) => {
          const visibleSegment = getVisibleTimelineSegment(
            b.startMins ?? b.breakStart,
            b.endMins ?? b.breakEnd
          );
          if (!visibleSegment) return null;

          return (
            <div key={i} style={{
              position: 'absolute', top: 0, height: '100%',
              left: visibleSegment.left, width: visibleSegment.width,
              background: 'rgba(201,124,46,0.38)',
              borderLeft: '1px solid rgba(201,124,46,0.5)',
              borderRight: '1px solid rgba(201,124,46,0.5)',
            }} />
          );
        })}

        {/* Past time greyed out overlay */}
        {isToday && !isClosedDay && nowMins > OPEN && (
          <div style={{
            position: 'absolute', top: 0, bottom: 0, left: 0,
            width: pctW(Math.min(nowMins, CLOSE) - OPEN),
            background: 'rgba(226,232,240,0.6)', /* translucent slate background */
            backdropFilter: 'grayscale(80%)',
            borderRight: `2px dashed ${C.text3}`,
            zIndex: 10,
            pointerEvents: 'none'
          }} />
        )}

        {isClosedDay && (
          <div style={{
            position: 'absolute',
            inset: 0,
            zIndex: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            pointerEvents: 'none',
          }}>
            Closed On Tuesday
          </div>
        )}
      </div>

      {/* Time labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 10, color: C.text3 }}>
        <span>{minsToLabel(OPEN)}</span>
        <span>{minsToLabel(OPEN + TOTAL / 4)}</span>
        <span>{minsToLabel(OPEN + TOTAL / 2)}</span>
        <span>{minsToLabel(OPEN + TOTAL * 3 / 4)}</span>
        <span>{minsToLabel(CLOSE)}</span>
      </div>


    </div>
  );
};

