import { connectDB } from '../src/database.js';
import { runCron } from '../src/cron.js';
import { Telegraf } from 'telegraf';
import { config } from '../src/config.js';

export default async function handler(request, response) {
  try {
    // Authenticate the cron request (Vercel standard)
    // In production, Vercel sets an authorization header for cron jobs.
    // If you add a CRON_SECRET to Vercel env, uncomment the check below for security:
    /*
    const authHeader = request.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return response.status(401).json({ error: 'Unauthorized' });
    }
    */

    await connectDB();
    
    // We instantiate a bot strictly to use bot.telegram API calls, 
    // it won't listen for long-polling.
    const bot = new Telegraf(config.botToken);
    
    await runCron(bot);
    
    response.status(200).json({ status: 'ok', message: 'Cron job ran successfully' });
  } catch (error) {
    console.error('Error in cron endpoint:', error);
    response.status(500).json({ error: 'Internal server error' });
  }
}
