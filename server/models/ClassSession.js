import mongoose from 'mongoose';

const classSessionSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  date: { type: String, required: true },
  startTime: { type: String, default: '10:00' },
  endTime: { type: String, default: '11:00' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['Open', 'Submitted'], default: 'Open' }
}, { timestamps: true });

classSessionSchema.index({ course: 1, date: 1, startTime: 1 }, { unique: true });
export const ClassSession = mongoose.model('ClassSession', classSessionSchema);
