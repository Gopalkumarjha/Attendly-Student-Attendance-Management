import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  department: { type: String, default: 'School of Engineering', trim: true },
  room: { type: String, default: 'TBA', trim: true },
  teacherIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
  active: { type: Boolean, default: true }
}, { timestamps: true });

export const Course = mongoose.model('Course', courseSchema);
