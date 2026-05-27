import { google, Auth } from 'googleapis';
import log from '../log';

type OAuth2Client = Auth.OAuth2Client;

export interface FetchedCalendarEvent {
  id: string;
  startTimeMs: number;
  endTimeMs: number;
  title: string;
  description: string;
  attendeesCount: number;
  isAllDay: boolean;
  declined: boolean;
  rawJson: string;
}

/**
 * Fetches events from the user's calendar for the given local date.
 * - Skips all-day events (no startDateTime)
 * - Skips events the user declined
 * - Skips events without a summary (title)
 * - Returns events sorted by start time
 */
export async function fetchEventsForDate(
  client: OAuth2Client,
  calendarId: string,
  date: Date,
): Promise<FetchedCalendarEvent[]> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const calendar = google.calendar({ version: 'v3', auth: client });
  const res = await calendar.events.list({
    calendarId,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 100,
  });

  const events: FetchedCalendarEvent[] = [];
  for (const e of res.data.items ?? []) {
    if (!e.id || !e.start || !e.end) continue;
    if (!e.start.dateTime || !e.end.dateTime) continue; // skip all-day
    const selfAttendee = (e.attendees ?? []).find(a => a.self);
    if (selfAttendee?.responseStatus === 'declined') continue;
    if (!e.summary) continue;

    events.push({
      id: e.id,
      startTimeMs: new Date(e.start.dateTime).getTime(),
      endTimeMs: new Date(e.end.dateTime).getTime(),
      title: e.summary,
      description: e.description ?? '',
      attendeesCount: (e.attendees ?? []).length,
      isAllDay: false,
      declined: false,
      rawJson: JSON.stringify(e),
    });
  }

  events.sort((a, b) => a.startTimeMs - b.startTimeMs);
  log.info(`Fetched ${events.length} calendar events for ${date.toDateString()}`);
  return events;
}
