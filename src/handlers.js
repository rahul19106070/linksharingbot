import { Batch } from './database.js';
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

      for (const file of batch.files) {
        try {
          if (file.fileType === 'photo') {
            await ctx.replyWithPhoto(file.fileId, { caption: file.caption });
          } else if (file.fileType === 'video') {
            await ctx.replyWithVideo(file.fileId, { caption: file.caption });
          } else if (file.fileType === 'document') {
            await ctx.replyWithDocument(file.fileId, { caption: file.caption });
          } else {
            await ctx.replyWithDocument(file.fileId, { caption: file.caption });
          }
        } catch (e) {
           console.error('Error sending file', e);
        }
      }
    } catch (dbError) {
      console.error(dbError);
      ctx.reply("An error occurred while fetching files.");
    }
  });

  bot.command('newbatch', async (ctx) => {
    if (config.adminUserId && ctx.from.id !== config.adminUserId) return;
    
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
    if (config.adminUserId && ctx.from.id !== config.adminUserId) return;
    
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
    if (config.adminUserId && ctx.from.id !== config.adminUserId) {
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
