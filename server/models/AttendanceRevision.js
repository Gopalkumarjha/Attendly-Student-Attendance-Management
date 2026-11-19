import mongoose from 'mongoose';

const attendanceRevisionSchema = new mongoose.Schema({
  attendance: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance', required: true, index: true },
  previousStatus: { type: String, enum: ['Present', 'Absent', 'Late'], required: true },
  newStatus: { type: String, enum: ['Present', 'Absent', 'Late'], required: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  changedAt: { type: Date, default: Date.now },
  note: { type: String, trim: true, maxlength: 300 }
}, { timestamps: true });

export const AttendanceRevision = mongoose.model('AttendanceRevision', attendanceRevisionSchema);
