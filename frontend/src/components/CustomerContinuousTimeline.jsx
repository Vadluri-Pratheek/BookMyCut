import React from 'react';
import { T, pct, pctW, fmtTime, getDateStr } from '../pages/CustomerDashboard';
import { isTuesdayDateStr } from '../utils/date';

export const ContinuousTimeline = ({ availableSlots, loading, onSlotSelect, selectedSlot, duration, openTime = 540, closeTime = 1260, date }) => {
  const OPEN = openTime;
  const CLOSE = closeTime;
  const TOTAL = CLOSE - OPEN;
  const isToday = date === getDateStr(0);
  const isClosedDay = isTuesdayDateStr(date);
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();

  if (loading) {
    return <div style={{ color: T.text3, fontSize: 13, padding: '1rem 0' }}>Loading available slots...</div>;
  }

  // availableSlots from backend is now an array of { start, end, color }
  const segments = availableSlots || [];

  const isSlotValid = (mins) => {
    if (isToday && mins < nowMins) return false;
    if (mins + duration > CLOSE) return false;
    return segments.some(s => s.color === 'GREEN' && mins >= s.start && mins < s.end);
  };

  return (
    <div style={{ padding: '1rem 0' }}>
      <div style={{ position: 'relative', height: 44, borderRadius: 8, background: '#e2e8f0', border: `1px solid ${T.br}`, overflow: 'hidden', cursor: isClosedDay ? 'not-allowed' : 'crosshair' }}
        onClick={(e) => {
          if (isClosedDay) {
            return;
          }
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const p = x / rect.width;
          let clickedMins = Math.round(OPEN + p * TOTAL);

          if (clickedMins < OPEN) clickedMins = OPEN;
          if (clickedMins > CLOSE - duration) clickedMins = CLOSE - duration;

          const clickedSeg = segments.find(s => clickedMins >= s.start && clickedMins < s.end);

          if (!clickedSeg || clickedSeg.color !== 'GREEN') {
            return; // Grey block does nothing
          }

          if (isToday && clickedMins < nowMins) {
            return;
          }

          if (isSlotValid(clickedMins)) {
            onSlotSelect(clickedMins);
          }
        }}
      >
        {/* Segments — green for available, grey for booked */}
        {segments.map((seg, i) => (
          <div key={i} style={{
            position: 'absolute', top: 0, height: '100%',
            left: pct(seg.start, OPEN, TOTAL), width: pctW(seg.end - seg.start, TOTAL),
            background: seg.color === 'GREEN'
              ? 'rgba(90,158,111,0.55)'
              : 'rgba(100,116,139,0.35)',
            borderLeft: seg.color === 'GREEN'
              ? '1px solid rgba(90,158,111,0.6)'
              : '1px solid rgba(100,116,139,0.4)',
            borderRight: seg.color === 'GREEN'
              ? '1px solid rgba(90,158,111,0.6)'
              : '1px solid rgba(100,116,139,0.4)',
          }} />
        ))}

        {/* Past time greyed out overlay */}
        {isToday && !isClosedDay && nowMins > OPEN && (
          <div style={{
            position: 'absolute', top: 0, bottom: 0, left: 0,
            width: pctW(Math.min(nowMins, CLOSE) - OPEN, TOTAL),
            background: 'rgba(71, 85, 105, 0.55)',
            backdropFilter: 'grayscale(100%)',
            borderRight: `2px dashed ${T.text3}`,
            zIndex: 10,
            pointerEvents: 'none'
          }} />
        )}

        {isClosedDay && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(71, 85, 105, 0.72)',
            zIndex: 15,
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

        {/* Selected slot indicator */}
        {selectedSlot !== null && !isClosedDay && (
          <div style={{
            position: 'absolute', top: 0, height: '100%',
            left: pct(selectedSlot, OPEN, TOTAL), width: pctW(duration, TOTAL),
            background: T.gold,
            border: '2px solid #fff',
            zIndex: 20,
            boxShadow: '0 0 10px rgba(0,0,0,0.2)'
          }}>
            <div style={{ position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)', background: T.gold, color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap', fontWeight: 700 }}>
              {fmtTime(selectedSlot)}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: T.text3 }}>
        <span>{fmtTime(OPEN)}</span>
        <span>{fmtTime(OPEN + TOTAL / 2)}</span>
        <span>{fmtTime(CLOSE)}</span>
      </div>

      {isClosedDay && (
        <div style={{ marginTop: 8, fontSize: 11, color: T.text3 }}>
          This shop is closed every Tuesday.
        </div>
      )}

      {/* Fine-tune Minute Slider */}
      {selectedSlot !== null && !isClosedDay && (
        <div style={{ marginTop: '1.5rem', background: T.s2, padding: '1rem', borderRadius: 12, border: `1px solid ${T.br}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.text2 }}>Fine-tune Start Time (Minutes)</label>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.gold }}>{fmtTime(selectedSlot)}</span>
          </div>
          <input
            type="range"
            min={OPEN}
            max={CLOSE - duration}
            step={1}
            value={selectedSlot}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (isSlotValid(val)) {
                onSlotSelect(val);
              } else {
                // Snap to current value's closest valid GREEN minute
                let closest = val;
                let minDiff = Infinity;
                segments.forEach(s => {
                  if (s.color !== 'GREEN') return;
                  if (val < s.start) {
                    if (s.start - val < minDiff) { minDiff = s.start - val; closest = s.start; }
                  } else if (val >= s.end) {
                    // Maximum valid start in this block is s.end - 1
                    // Actually, if a duration is fixed, max start is just before block end. Wait, s.end is the boundary of valid START times!
                    // Yes, s.end is actually `lastT + 1`, meaning the highest slot start time is `s.end - 1`.
                    if (val - (s.end - 1) < minDiff) { minDiff = val - (s.end - 1); closest = s.end - 1; }
                  }
                });

                // Extra protection against past slots today
                if (isToday && closest < nowMins && closest !== val) {
                  closest = Math.max(closest, nowMins);
                }

                if (isSlotValid(closest)) onSlotSelect(closest);
              }
            }}
            style={{ width: '100%', accentColor: T.gold, cursor: 'pointer' }}
          />
          <p style={{ fontSize: 10, color: T.text3, marginTop: 6 }}>
            Slider only snaps to valid free segments calculated by the shop algorithm.
          </p>
        </div>
      )}
    </div>
  );
};

