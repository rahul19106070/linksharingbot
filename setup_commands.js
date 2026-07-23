import { Telegraf } from 'telegraf';
import { config } from './src/config.js';

const bot = new Telegraf(config.botToken);

const adminCommands = [
  { command: 'start', description: 'Start the bot' },
  { command: 'admin', description: 'Show admin menu' },
  { command: 'stats', description: 'View bot statistics' },
  { command: 'newbatch', description: 'Start uploading a new movie' },
  { command: 'endbatch', description: 'Finish uploading and get link' },
  { command: 'broadcast', description: 'Send a message to all users' },
  { command: 'addpremium', description: 'Give a user unlimited access' },
  { command: 'removepremium', description: 'Revoke premium access' },
  { command: 'refer', description: 'Get your referral link' },
  { command: 'myaccount', description: 'View your links balance' }
];

const userCommands = [
  { command: 'start', description: 'Start the bot' },
  { command: 'refer', description: 'Get your referral link' },
  { command: 'myaccount', description: 'View your links balance' }
];

async function setup() {
  try {
    // Set default commands for everyone
    await bot.telegram.setMyCommands(userCommands);
    
    // Set admin commands specifically for the admins
    if (config.adminUserIds && config.adminUserIds.length > 0) {
      for (const adminId of config.adminUserIds) {
        try {
            await bot.telegram.setMyCommands(adminCommands, {
              scope: { type: 'chat', chat_id: adminId }
            });
            console.log(`Set admin commands for ${adminId}`);
        } catch (e) {
            console.error(`Could not set commands for admin ${adminId} (they might not have messaged the bot yet):`, e.message);
        }
      }
    }
    console.log('✅ Successfully configured the Telegram popup menu (/)!');
  } catch (err) {
    console.error('Error setting commands:', err);
  }
}

setup();
