// @ts-nocheck
import { useEffect, useRef } from 'react';
import type { TaskAlarm } from '../domain/entities/TaskAlarm';
import { taskAlarmRepo, taskRepo } from '../container';

interface Props {
  currentUser: { id: string; [k: string]: unknown };
}

/**
 * Headless scheduler: on mount, reads every alarm for the current user
 * and schedules a browser notification for the moment
 * `triggerAt - advanceMinutes`. On fire:
 *   - shows a Web Notification with the task title,
 *   - increments fired_count via taskAlarmRepo.markFired(id).
 *
 * v1 handles a single fire per alarm (no repetition interval). The
 * repetitions column is preserved for a follow-up that reschedules
 * subsequent rings.
 *
 * Permission is requested the first time this component mounts.
 * If the user denies, we silently stop.
 */
export function TaskAlarmScheduler({ currentUser }: Props) {
  const timeoutsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    let cancelled = false;

    const ensurePermission = async (): Promise<boolean> => {
      if (Notification.permission === 'granted') return true;
      if (Notification.permission === 'denied') return false;
      try {
        const res = await Notification.requestPermission();
        return res === 'granted';
      } catch {
        return false;
      }
    };

    const fire = async (alarm: TaskAlarm) => {
      try {
        const task = await taskRepo.findById(alarm.taskId);
        const title = task?.title ?? 'Task reminder';
        const code = task?.code ? `${task.code} · ` : '';
        // eslint-disable-next-line no-new
        new Notification(`${code}${title}`, {
          body: `Reminder: ${new Date(alarm.triggerAt).toLocaleString()}`,
          tag: `vl-alarm-${alarm.id}`,
          icon: '/favicon.ico',
        });
        await taskAlarmRepo.markFired(alarm.id);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[TaskAlarmScheduler] failed to fire alarm', alarm.id, err);
      }
    };

    const schedule = (alarm: TaskAlarm) => {
      // Already fired at least once in this v1 model — skip.
      if (alarm.firedCount > 0) return;
      const fireAt = new Date(alarm.triggerAt).getTime() - alarm.advanceMinutes * 60_000;
      const delay = fireAt - Date.now();
      if (delay <= 0) return; // overdue — don't auto-fire old alarms on session start
      // Cap to a sensible window: browsers throttle very long timeouts.
      if (delay > 7 * 86_400_000) return;
      const id = window.setTimeout(() => {
        timeoutsRef.current.delete(alarm.id);
        fire(alarm);
      }, delay);
      timeoutsRef.current.set(alarm.id, id);
    };

    (async () => {
      const ok = await ensurePermission();
      if (!ok || cancelled) return;
      try {
        const alarms = await taskAlarmRepo.list(currentUser.id);
        if (cancelled) return;
        alarms.forEach(schedule);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[TaskAlarmScheduler] failed to load alarms', err);
      }
    })();

    return () => {
      cancelled = true;
      timeoutsRef.current.forEach((id) => window.clearTimeout(id));
      timeoutsRef.current.clear();
    };
  }, [currentUser.id]);

  return null;
}
