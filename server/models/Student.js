import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  uid: { type: String, required: true, unique: true, trim: true },
  program: { type: String, required: true, trim: true },
  year: { type: String, required: true, trim: true },
  department: { type: String, default: 'School of Engineering', trim: true }
}, { timestamps: true });

export const Student = mongoose.model('Student', studentSchema);
