import { ScheduledDeletion } from './database.js';

export const runCron = async (bot) => {
  console.log('[CRON] Running auto-deletion check...');
  try {
    const now = new Date();
    
    // Find all deletions that are scheduled for now or in the past
    const expiredSchedules = await ScheduledDeletion.find({ deleteAt: { $lte: now } });
    
    if (expiredSchedules.length === 0) {
      console.log('[CRON] No messages to delete.');
      return;
    }

    for (const schedule of expiredSchedules) {
      try {
        // Attempt to delete each message in the batch
        for (const msgId of schedule.messageIds) {
          try {
            await bot.telegram.deleteMessage(schedule.chatId, msgId);
            console.log(`[CRON] Deleted message ${msgId} in chat ${schedule.chatId}`);
          } catch (delErr) {
            console.error(`[CRON] Failed to delete message ${msgId} (maybe already deleted or too old):`, delErr.message);
          }
        }
      } finally {
        // Always delete the record so we don't try again endlessly
        await ScheduledDeletion.findByIdAndDelete(schedule._id);
      }
    }
    
    console.log('[CRON] Auto-deletion check complete.');
  } catch (err) {
    console.error('[CRON] Error during auto-deletion check:', err);
  }
};
