import { Batch, User, ScheduledDeletion } from './database.js';
import { config } from './config.js';

// In serverless, memory is ephemeral, but during a short window (like creating a batch),
// this memory state might persist across a few quick requests. 
// However, for robust serverless admin flows, it's better to store "active state" in a DB.
// For simplicity in this bot, we keep it in-memory. If you face issues where it forgets active batches,
// we will need to store admin state in MongoDB.
let activeBatches = {}; 

export const setupHandlers = (bot) => {
  bot.command('start', async (ctx) => {
    const payload = ctx.payload;
    
    // Save user profile
    try {
      await User.findOneAndUpdate(
        { telegramId: ctx.from.id },
        {
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
          username: ctx.from.username,
          languageCode: ctx.from.language_code
        },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.error("Error saving user:", err);
    }

    // Force sub check
    if (config.forceSubChannel) {
        try {
            const member = await ctx.telegram.getChatMember(config.forceSubChannel, ctx.from.id);
            if (member.status === 'left' || member.status === 'kicked') {
                return ctx.reply('Please join our channel first to access this file!', {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: 'Join Channel', url: `https://t.me/${config.forceSubChannel.replace('@', '')}` }
                        ]]
                    }
                });
            }
        } catch (error) {
            console.error('Error checking channel membership:', error);
        }
    }

    if (!payload) {
      return ctx.reply('Welcome! This bot provides files via special links from our channel.');
    }

    try {
      const batch = await Batch.findOne({ batchId: payload });
      if (!batch || batch.files.length === 0) {
        return ctx.reply('Sorry, no files found for this link.');
      }

      const sentMessageIds = [];
      for (const file of batch.files) {
        try {
          let msg;
          if (file.fileType === 'photo') {
            msg = await ctx.replyWithPhoto(file.fileId, { caption: file.caption });
          } else if (file.fileType === 'video') {
            msg = await ctx.replyWithVideo(file.fileId, { caption: file.caption });
          } else if (file.fileType === 'document') {
            msg = await ctx.replyWithDocument(file.fileId, { caption: file.caption });
          } else {
            msg = await ctx.replyWithDocument(file.fileId, { caption: file.caption });
          }
          if (msg && msg.message_id) {
            sentMessageIds.push(msg.message_id);
          }
        } catch (e) {
           console.error('Error sending file', e);
        }
      }

      // Schedule deletion if we sent messages
      if (sentMessageIds.length > 0) {
        const deleteAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
        await ScheduledDeletion.create({
          chatId: ctx.chat.id,
          messageIds: sentMessageIds,
          deleteAt
        });
        
        // Optional: inform user that files self-destruct
        await ctx.reply("⚠️ *Note:* These files will automatically delete in 5 minutes.", { parse_mode: 'Markdown' }).then(msg => {
          // Schedule this warning message for deletion too!
          ScheduledDeletion.create({
            chatId: ctx.chat.id,
            messageIds: [msg.message_id],
            deleteAt
          });
        });
      }
    } catch (dbError) {
      console.error(dbError);
      ctx.reply("An error occurred while fetching files.");
    }
  });

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  bot.command('admin', async (ctx) => {
    if (config.adminUserIds.length > 0 && !config.adminUserIds.includes(ctx.from.id)) return;
    
    const menu = `🛠 *Admin Command Menu* 🛠\n\n` +
                 `🔹 /stats - View total users and file batches\n` +
                 `🔹 /newbatch <id> - Start a new movie upload session\n` +
                 `🔹 /endbatch - Finish uploading and get the sharing link\n` +
                 `🔹 /broadcast <message> - Send a message to all users\n\n` +
                 `*Note:* The broadcast command currently supports text only.`;
                 
    ctx.reply(menu, { parse_mode: 'Markdown' });
  });

  bot.command('broadcast', async (ctx) => {
    if (config.adminUserIds.length > 0 && !config.adminUserIds.includes(ctx.from.id)) return;
    
    const message = ctx.message.text.substring('/broadcast'.length).trim();
    if (!message) {
      return ctx.reply('⚠️ Please provide a message to broadcast.\nUsage: `/broadcast Hello everyone!`', { parse_mode: 'Markdown' });
    }
    
    ctx.reply('🚀 Broadcast started! This might take a while depending on the number of users...');
    
    let successCount = 0;
    let failCount = 0;
    
    try {
      const users = await User.find({}, 'telegramId');
      
      for (const user of users) {
        try {
          await ctx.telegram.sendMessage(user.telegramId, message);
          successCount++;
        } catch (error) {
          console.error(`Failed to send to ${user.telegramId}:`, error.message);
          failCount++;
        }
        // Delay to respect Telegram API limits (approx 30 msgs/sec limit, we use 50ms to be safe = 20/sec)
        await sleep(50);
      }
      
      ctx.reply(`✅ *Broadcast Complete!*\n\n🟢 Successful: ${successCount}\n🔴 Failed (Blocked bot): ${failCount}`, { parse_mode: 'Markdown' });
      
    } catch (dbError) {
      console.error(dbError);
      ctx.reply("❌ Error fetching users from database.");
    }
  });

  bot.command('stats', async (ctx) => {
    if (config.adminUserIds.length > 0 && !config.adminUserIds.includes(ctx.from.id)) return;
    
    try {
      const count = await User.countDocuments();
      const batchCount = await Batch.countDocuments();
      ctx.reply(`📊 Bot Statistics:\n\n👥 Total Users: ${count}\n📁 Total Batches: ${batchCount}`);
    } catch (e) {
      console.error(e);
      ctx.reply("Error fetching stats.");
    }
  });

  bot.command('newbatch', async (ctx) => {
    if (config.adminUserIds.length > 0 && !config.adminUserIds.includes(ctx.from.id)) return;
    
    const batchId = ctx.message.text.split(' ')[1];
    if (!batchId) {
      return ctx.reply('Please provide a batch ID. Usage: /newbatch <id>');
    }
    
    activeBatches[ctx.from.id] = batchId;
    
    try {
      await Batch.findOneAndDelete({ batchId });
      await Batch.create({ batchId, files: [] });
      ctx.reply(`Batch '${batchId}' started. Now send me photos, videos, or documents. When done, send /endbatch`);
    } catch (e) {
      console.error(e);
      ctx.reply("Database error starting batch.");
    }
  });

  bot.command('endbatch', async (ctx) => {
    if (config.adminUserIds.length > 0 && !config.adminUserIds.includes(ctx.from.id)) return;
    
    const batchId = activeBatches[ctx.from.id];
    if (!batchId) {
      return ctx.reply('No active batch. Start one with /newbatch <id>');
    }
    
    const botUsername = ctx.botInfo.username;
    const deepLink = `https://t.me/${botUsername}?start=${batchId}`;
    
    delete activeBatches[ctx.from.id];
    ctx.reply(`Batch closed! Here is your sharing link:\n\n${deepLink}`);
  });

  bot.on(['photo', 'video', 'document'], async (ctx, next) => {
    if (config.adminUserIds.length > 0 && !config.adminUserIds.includes(ctx.from.id)) {
        return next();
    }
    
    const batchId = activeBatches[ctx.from.id];
    if (!batchId) return next();
    
    let fileId, fileType;
    const caption = ctx.message.caption || '';
    
    if (ctx.message.photo) {
      fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id; 
      fileType = 'photo';
    } else if (ctx.message.video) {
      fileId = ctx.message.video.file_id;
      fileType = 'video';
    } else if (ctx.message.document) {
      fileId = ctx.message.document.file_id;
      fileType = 'document';
    }
    
    if (fileId) {
      try {
        await Batch.updateOne({ batchId }, {
          $push: { files: { fileId, fileType, caption } }
        });
        ctx.reply(`Saved ${fileType} to batch '${batchId}'.`);
      } catch (e) {
        console.error(e);
        ctx.reply("Error saving file to database.");
      }
    }
  });
};
