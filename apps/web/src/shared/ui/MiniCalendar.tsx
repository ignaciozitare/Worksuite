import React from 'react';
import { DAYS_EN, DAYS_ES, TODAY } from '../lib/constants';
import { daysInMonth, firstMonday, isoFromYMD } from '../lib/utils';

interface MiniCalendarProps {
  year:           number;
  month:          number;
  lang:           string;
  selectedDates:  string[];
  onToggleDate:   (iso: string) => void;
  occupiedDates?: string[];
  minDate?:       string;
}

export function MiniCalendar({ year, month, lang, selectedDates, onToggleDate, occupiedDates = [], minDate = "" }: MiniCalendarProps) {
  const DAYS = lang === "es" ? DAYS_ES : DAYS_EN;
  const days = daysInMonth(year, month);
  const first = firstMonday(year, month);

  return (
    <div className="mini-cal">
      <div className="mini-day-grid">
        {DAYS.map(d => <div key={d} className="mini-dh">{d}</div>)}
        {Array.from({ length: first }).map((_, i) => <div key={"e" + i} />)}
        {Array.from({ length: days }, (_, i) => i + 1).map(d => {
          const iso = isoFromYMD(year, month, d);
          const dow = (new Date(iso + "T00:00:00").getDay() + 6) % 7;
          const isWe = dow >= 5;
          const isPast = iso < TODAY;
          const isOcc = occupiedDates.includes(iso);
          const isSel = selectedDates.includes(iso);
          const dis = isWe || isPast || isOcc;
          let cls = "mini-day ";
          if (dis) cls += "dis";
          else if (isSel) cls += "sel";
          else if (isOcc) cls += "occ";
          else cls += "avail";
          return (
            <div key={d} className={cls} onClick={() => !dis && onToggleDate(iso)}>
              {d}
            </div>
          );
        })}
      </div>
    </div>
  );
}
