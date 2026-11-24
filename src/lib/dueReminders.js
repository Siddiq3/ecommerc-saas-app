import * as Notifications from 'expo-notifications';
import { nextMondayMorning } from './book.js';

/**
 * A khata due date becomes a reminder for the owner at 9 in the morning that day, on this
 * phone. Tapping it opens the party's khata (the push bridge follows `data.link`). One
 * reminder per party: setting a new date replaces it, clearing the date removes it.
 * ponytail: the phone that set the date reminds; others sync the date but stay quiet.
 */
const idFor = (partyId) => `khata-due-${partyId}`;

export const scheduleDueReminder = async (party, { title, body }) => {
  await Notifications.cancelScheduledNotificationAsync(idFor(party.partyId)).catch(() => undefined);
  if (!party.dueDate || party.deleted) return false;
  const when = new Date(`${party.dueDate}T09:00:00`);
  if (when <= new Date()) return false;
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return false;
  await Notifications.scheduleNotificationAsync({
    identifier: idFor(party.partyId),
    content: { title, body, data: { link: `/khata/${party.partyId}` } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: 'store_updates' },
  });
  return true;
};

/**
 * The weekly nudge: "3 customers owe you ₹1,240", next Monday at 10, opening the khata ready to
 * send reminders. Rescheduled with fresh figures whenever the book is looked at; removed when
 * nobody owes anything. Never asks for permission itself: due dates do that when one is set.
 */
export const scheduleWeeklySummary = async ({ count, title, body }) => {
  await Notifications.cancelScheduledNotificationAsync('khata-weekly').catch(() => undefined);
  if (!count) return false;
  if (!(await Notifications.getPermissionsAsync()).granted) return false;
  await Notifications.scheduleNotificationAsync({
    identifier: 'khata-weekly',
    content: { title, body, data: { link: '/khata?remind=1' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: nextMondayMorning(), channelId: 'store_updates' },
  });
  return true;
};
