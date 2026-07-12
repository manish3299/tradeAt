export type SessionDay = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type MarketSession = Readonly<{
  id: string;
  timezone: string;
  days: readonly SessionDay[];
  open: string;
  close: string;
}>;

export type SessionState = 'pre_open' | 'open' | 'closed';

export type SessionStatus = Readonly<{
  sessionId: string;
  state: SessionState;
  evaluatedAt: Date;
  localDate: string;
  localTime: string;
}>;

export function getSessionStatus(session: MarketSession, at: Date): SessionStatus {
  validateSession(session);
  const local = localParts(at, session.timezone);
  const scheduledToday = session.days.includes(local.day);
  const state = !scheduledToday
    ? 'closed'
    : local.time < session.open
      ? 'pre_open'
      : local.time < session.close
        ? 'open'
        : 'closed';

  return {
    sessionId: session.id,
    state,
    evaluatedAt: at,
    localDate: local.date,
    localTime: local.time,
  };
}

function validateSession(session: MarketSession): void {
  if (session.days.length === 0) throw new Error('session_days_required');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(session.open)) throw new Error('invalid_session_open');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(session.close)) throw new Error('invalid_session_close');
  if (session.open >= session.close) throw new Error('overnight_session_not_supported');
}

function localParts(at: Date, timezone: string): { date: string; time: string; day: SessionDay } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const weekdays: Record<string, SessionDay> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  const weekday = weekdays[value('weekday')];
  if (!weekday) throw new Error('invalid_session_timezone');
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    time: `${value('hour')}:${value('minute')}`,
    day: weekday,
  };
}
