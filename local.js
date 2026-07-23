import { Telegraf } from 'telegraf';
import { config } from './src/config.js';
import { connectDB } from './src/database.js';
import { setupHandlers } from './src/handlers.js';

const startLocalBot = async () => {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await connectDB();
    
    const bot = new Telegraf(config.botToken);
    setupHandlers(bot);

    bot.catch((err, ctx) => {
      console.error(`Ooops, encountered an error for ${ctx.updateType}`, err);
    });

    bot.launch();
    console.log('\n✅ Bot is successfully running locally in testing mode!');
    console.log('You can now message your bot on Telegram to test it.\n');
    
    // Run the auto-deletion logic locally every 1 minute
    setInterval(() => {
      import('./src/cron.js').then(module => {
        module.runCron(bot);
      });
    }, 60000);

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (error) {
    console.error("Failed to start local bot:", error);
  }
};

startLocalBot();
