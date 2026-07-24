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
    
    // Save user profile and handle referrals
    let user;
    try {
      user = await User.findOne({ telegramId: ctx.from.id });
      if (!user) {
        user = new User({
          telegramId: ctx.from.id,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
          username: ctx.from.username,
          languageCode: ctx.from.language_code
        });
        
        // Handle referral logic
        if (payload && payload.startsWith('ref_')) {
          const inviterId = parseInt(payload.split('_')[1]);
          if (!isNaN(inviterId) && inviterId !== ctx.from.id) {
             user.referredBy = inviterId;
             try {
                const inviter = await User.findOneAndUpdate(
                   { telegramId: inviterId }, 
                   { $inc: { bonusLinks: 2 } }, 
                   { new: true }
                );
                if (inviter) {
                   ctx.telegram.sendMessage(inviterId, `🎉 <b>Good news!</b> Someone just joined using your referral link!\n\nYou have been rewarded with +2 bonus links!`, { parse_mode: 'HTML' }).catch(e => console.error(e));
                }
             } catch (e) {
                console.error("Referral error", e);
             }
          }
        }
        await user.save();
      } else {
        // Update their details just in case
        user.firstName = ctx.from.first_name;
        user.lastName = ctx.from.last_name;
        user.username = ctx.from.username;
        user.languageCode = ctx.from.language_code;
        await user.save();
      }
    } catch (err) {
      console.error("Error saving user:", err);
      // In case of a rare error, create a dummy object to prevent crashing
      user = { isPremium: false, linksUsedToday: 0, bonusLinks: 0, lastResetDate: '' };
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

    if (!payload || payload.startsWith('ref_')) {
      const welcomeMsg = `Wana watch Exclus!ve Prem!um V!deos Join Us Now 🥰🥰\n\nAisi v!deos int@rnet pe kahi nahi milegi 🥰\n\nMost Exclus!ve V!deos join Now 🥰 \n\nhttps://t.me/+8HZISEj5vs4yM2I1\n\nhttps://t.me/+8HZISEj5vs4yM2I1`;
      return ctx.reply(welcomeMsg, { disable_web_page_preview: true });
    }

    try {
      const batch = await Batch.findOne({ batchId: payload });
      if (!batch || batch.files.length === 0) {
        return ctx.reply('Sorry, no files found for this link.');
      }

      // IST Midnight Reset Logic
      const now = new Date();
      // IST is UTC + 5:30
      const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
      const todayIST = istTime.toISOString().split('T')[0]; // "YYYY-MM-DD"
      
      if (user.lastResetDate !== todayIST) {
        user.linksUsedToday = 0;
        user.bonusLinks = 0;
        user.lastResetDate = todayIST;
        if (user.save) await user.save();
      }

      // Check limits!
      const availableFree = Math.max(0, 3 - user.linksUsedToday);
      const availableLinks = availableFree + user.bonusLinks;
      
      if (!user.isPremium && availableLinks <= 0) {
        return ctx.reply(
          `🚫 <b>Daily Limit Reached!</b>\n\n` + 
          `You have used all your free links for today. Your free balance will renew tonight at midnight.\n\n` +
          `🎁 <b>Want more links right now?</b>\n` +
          `Invite friends using your unique referral link! You instantly earn 2 bonus links for every person who joins.\n\n` +
          `Your Referral Link:\n` +
          `https://t.me/${ctx.botInfo.username}?start=ref_${ctx.from.id}\n\n` +
          `👑 Or contact the admin to buy Premium for unlimited access!`,
          { 
            parse_mode: 'HTML', 
            disable_web_page_preview: true,
            reply_markup: {
              inline_keyboard: [[
                { text: '📤 Share with Friends', url: `https://t.me/share/url?url=https://t.me/${ctx.botInfo.username}?start=ref_${ctx.from.id}&text=Join%20this%20awesome%20bot%20to%20get%20exclusive%20videos!` }
              ]]
            }
          }
        );
      }
      
      // If we are here, they have access!
      if (!user.isPremium) {
        if (user.linksUsedToday < 3) {
          user.linksUsedToday += 1;
        } else {
          user.bonusLinks -= 1;
        }
        if (user.save) await user.save();
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
    
    const menu = `🛠 <b>Admin Command Menu</b> 🛠\n\n` +
                 `🔹 /stats - View total users and file batches\n` +
                 `🔹 /newbatch <id> - Start a new movie upload session\n` +
                 `🔹 /endbatch - Finish uploading and get the sharing link\n` +
                 `🔹 /broadcast <message> - Send a message to all users\n\n` +
                 `<i>Note:</i> The broadcast command currently supports text only.`;
                 
    ctx.reply(menu, { parse_mode: 'HTML' });
  });

  bot.command('broadcast', async (ctx) => {
    if (config.adminUserIds.length > 0 && !config.adminUserIds.includes(ctx.from.id)) return;
    
    const message = ctx.message.text.substring('/broadcast'.length).trim();
    if (!message) {
      return ctx.reply('⚠️ Please provide a message to broadcast.\nUsage: <code>/broadcast Hello everyone!</code>', { parse_mode: 'HTML' });
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
      
      ctx.reply(`✅ <b>Broadcast Complete!</b>\n\n🟢 Successful: ${successCount}\n🔴 Failed (Blocked bot): ${failCount}`, { parse_mode: 'HTML' });
      
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

  bot.command('refer', async (ctx) => {
    const refLink = `https://t.me/${ctx.botInfo.username}?start=ref_${ctx.from.id}`;
    ctx.reply(
      `🎁 <b>Invite Friends, Get Free Links!</b>\n\n` +
      `Share this unique link with your friends. For every new person who joins using your link, you will instantly unlock <b>2 extra bonus links for today!</b>\n\n` +
      `Your Link: \n${refLink}`,
      { 
        parse_mode: 'HTML', 
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [[
            { text: '📤 Share Link', url: `https://t.me/share/url?url=${refLink}&text=Join%20this%20awesome%20bot%20to%20get%20exclusive%20videos!` }
          ]]
        }
      }
    );
  });

  bot.command('myaccount', async (ctx) => {
    try {
      const user = await User.findOne({ telegramId: ctx.from.id });
      if (!user) return ctx.reply('Please type /start first.');
      
      const availableFree = Math.max(0, 3 - user.linksUsedToday);
      const totalAvailable = user.isPremium ? "Unlimited 👑" : (availableFree + user.bonusLinks);
      
      const msg = `👤 <b>Your Account Profile</b>\n\n` +
                  `👑 <b>Status:</b> ${user.isPremium ? "Premium" : "Free"}\n` +
                  `🔗 <b>Total Links Available:</b> ${totalAvailable}\n` +
                  `  ├ Daily Free Links: ${user.isPremium ? "Unlimited" : availableFree}\n` +
                  `  └ Referral Bonus Links: ${user.bonusLinks}\n\n` +
                  `<i>Note: You get 3 free links every day. All free & bonus links reset at midnight (IST).</i>`;
                  
      ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (e) {
      console.error(e);
    }
  });

  bot.command('addpremium', async (ctx) => {
    if (config.adminUserIds.length > 0 && !config.adminUserIds.includes(ctx.from.id)) return;
    const targetId = parseInt(ctx.message.text.split(' ')[1]);
    if (!targetId || isNaN(targetId)) return ctx.reply('Usage: /addpremium <telegram_user_id>');
    
    try {
      const user = await User.findOneAndUpdate({ telegramId: targetId }, { isPremium: true }, { new: true });
      if (user) {
        ctx.reply(`✅ Granted Premium to user ${targetId}.`);
        ctx.telegram.sendMessage(targetId, `🎉 <b>Congratulations!</b>\n\nAn admin has granted you Premium Access! You now have unlimited link views without any daily limits!`, { parse_mode: 'HTML' }).catch(e=>console.error(e));
      } else {
        ctx.reply(`❌ User ${targetId} not found in database. Make sure they typed /start first.`);
      }
    } catch (e) {
       ctx.reply('Error updating database.');
    }
  });

  bot.command('removepremium', async (ctx) => {
    if (config.adminUserIds.length > 0 && !config.adminUserIds.includes(ctx.from.id)) return;
    const targetId = parseInt(ctx.message.text.split(' ')[1]);
    if (!targetId || isNaN(targetId)) return ctx.reply('Usage: /removepremium <telegram_user_id>');
    
    try {
      const user = await User.findOneAndUpdate({ telegramId: targetId }, { isPremium: false }, { new: true });
      if (user) {
        ctx.reply(`✅ Removed Premium from user ${targetId}.`);
      } else {
        ctx.reply(`❌ User ${targetId} not found.`);
      }
    } catch (e) {
       ctx.reply('Error updating database.');
    }
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
