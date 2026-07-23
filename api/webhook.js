import { Telegraf } from 'telegraf';
import { config } from '../src/config.js';
import { connectDB } from '../src/database.js';
import { setupHandlers } from '../src/handlers.js';

// Initialize bot
const bot = new Telegraf(config.botToken);

// Setup handlers
setupHandlers(bot);

// Catch errors so the serverless function doesn't crash silently
bot.catch((err, ctx) => {
  console.error(`Ooops, encountered an error for ${ctx.updateType}`, err);
});

export default async function handler(request, response) {
  try {
    // 1. Connect to MongoDB (using our cached connection logic)
    await connectDB();

    // 2. Handle the Telegram Webhook request
    if (request.method === 'POST') {
      await bot.handleUpdate(request.body, response);
    } else {
      // If someone visits the URL in a browser
      response.status(200).json({ status: 'Bot is running serverless!' });
    }
  } catch (error) {
    console.error('Webhook Error:', error);
    response.status(500).send('Server Error');
  }
}
