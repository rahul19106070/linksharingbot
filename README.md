# Telegram Bot with Broadcast Feature (Node.js)

A lightweight Telegram bot written in Node.js using `telegraf` and SQLite. It registers users when they start the bot and allows administrators to broadcast messages (text, photos, files, etc.) to all registered users.

## Features

- **User Auto-Registration**: Saves user details (`user_id`, `username`, `first_name`) in a local SQLite database (`users.db`) when they run the `/start` command.
- **Customizable Start Message**: Greets the user with a welcoming message and updates their status to active.
- **Admin Broadcast**: Admins can broadcast messages using:
  - `/broadcast <your text>` to send a plain text message.
  - Replying to any message (text with formatting, photo, voice, video, document, etc.) with `/broadcast` to send that message as-is to all subscribers.
- **Automatic Subscriber Invalidation**: Detects when a user has blocked the bot (Error 403) or deleted their account (Error 400) and marks them as `inactive` so future broadcasts bypass them (saves API limits).
- **Rate-Limitation Protection**: Introduces a 35ms delay between sent messages to avoid hitting Telegram's broadcast limits.
- **Admin Statistics**: Access bot metrics via `/stats`.

## Setup Instructions

### 1. Configuration
Create a `.env` file from the example:
```bash
cp .env.example .env
```

Open `.env` and fill in the parameters:
1. **`TELEGRAM_BOT_TOKEN`**: Obtain this by creating a new bot on Telegram using [@BotFather](https://t.me/BotFather).
2. **`ADMIN_IDS`**: Get your Telegram User ID (using a bot like `@userinfobot` or `@MissRose_bot`) and insert it. If there are multiple admins, separate their IDs with commas (e.g. `123456789,987654321`).

### 2. Install Dependencies
Install packages listed in `package.json`:
```bash
npm install
```

### 3. Run the Bot
Start the bot:
```bash
npm start
```

## Commands

- `/start` - Starts the bot, registers you in the database, and displays the welcome message.
- `/help` - Lists available commands.
- `/stats` *(Admin only)* - Displays user metrics (total, active, inactive).
- `/broadcast <message>` *(Admin only)* - Broadcasts the message to all active users.
- Replying to a message with `/broadcast` *(Admin only)* - Broadcasts the replied-to message (supports images, audio, formatting, etc.).
