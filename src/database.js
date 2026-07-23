import mongoose from 'mongoose';
import { config } from './config.js';

let cachedConnection = null;

export const connectDB = async () => {
  // If we already have a connection, use it (crucial for Serverless functions)
  if (cachedConnection) {
    return cachedConnection;
  }

  // Otherwise, create a new connection
  if (!config.mongoUri) {
    throw new Error('Please define the MONGODB_URI environment variable');
  }

  try {
    cachedConnection = await mongoose.connect(config.mongoUri);
    console.log('MongoDB connected successfully');
    return cachedConnection;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
};

const FileSchema = new mongoose.Schema({
  fileId: { type: String, required: true },
  fileType: { type: String, required: true },
  caption: { type: String }
});

const BatchSchema = new mongoose.Schema({
  batchId: { type: String, required: true, unique: true },
  files: [FileSchema],
  createdAt: { type: Date, default: Date.now }
});

const UserSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  firstName: { type: String },
  lastName: { type: String },
  username: { type: String },
  languageCode: { type: String },
  joinedAt: { type: Date, default: Date.now },
  isPremium: { type: Boolean, default: false },
  linksUsedToday: { type: Number, default: 0 },
  lastResetDate: { type: String, default: "" }, // Format: "YYYY-MM-DD" in IST
  bonusLinks: { type: Number, default: 0 },
  referredBy: { type: Number, default: null }
});

const ScheduledDeletionSchema = new mongoose.Schema({
  chatId: { type: Number, required: true },
  messageIds: { type: [Number], required: true },
  deleteAt: { type: Date, required: true, index: true }
});

export const Batch = mongoose.models.Batch || mongoose.model('Batch', BatchSchema);
export const User = mongoose.models.User || mongoose.model('User', UserSchema);
export const ScheduledDeletion = mongoose.models.ScheduledDeletion || mongoose.model('ScheduledDeletion', ScheduledDeletionSchema);
