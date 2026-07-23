import dotenv from 'dotenv';
dotenv.config();

export const config = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN,
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/telegram_file_bot',
  adminUserId: process.env.ADMIN_IDS ? parseInt(process.env.ADMIN_IDS.split(',')[0]) : null,
  forceSubChannel: process.env.FORCE_SUB_CHANNEL,
};

if (!config.botToken) {
  console.error("FATAL ERROR: BOT_TOKEN is not defined in environment variables.");
  process.exit(1);
}
