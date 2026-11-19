import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { Student } from '../models/Student.js';
import { Course } from '../models/Course.js';
import { ClassSession } from '../models/ClassSession.js';
import { Attendance } from '../models/Attendance.js';
import { AttendanceRevision } from '../models/AttendanceRevision.js';
import { authenticate, authorize, createToken } from '../middleware/auth.js';

const router = Router();
const cleanUser = user => ({ id: user._id, name: user.name, email: user.email, role: user.role });
const courseScope = async user => {
  if (user.role === 'Admin') return {};
  if (user.role === 'Teacher') return { teacherIds: user._id };
  const profile = await Student.findOne({ user: user._id });
  return profile ? { studentIds: profile._id } : null;
};
const canUseCourse = async (courseId, user) => {
  const filter = { _id: courseId, active: true };
  if (user.role === 'Teacher') filter.teacherIds = user._id;
  if (user.role === 'Student') {
    const profile = await Student.findOne({ user: user._id });
    if (!profile) return null;
    filter.studentIds = profile._id;
  }
  return Course.findOne(filter);
};

router.post('/auth/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }
    res.json({ token: createToken(user), user: cleanUser(user) });
  } catch (error) { next(error); }
});

router.get('/auth/me', authenticate, (req, res) => res.json({ user: cleanUser(req.user) }));

router.get('/dashboard', authenticate, async (req, res, next) => {
  try {
    const { user } = req;
    const studentProfile = user.role === 'Student' ? await Student.findOne({ user: user._id }) : null;
    if (user.role === 'Student' && !studentProfile) return res.status(403).json({ message: 'No student profile is linked to this account.' });
    const filter = user.role === 'Student' ? { studentIds: studentProfile._id } : await courseScope(user);
    const activeFilter = { ...filter, active: true };
    const [courses, totalStudents, classCount] = await Promise.all([
      Course.find(activeFilter).populate('teacherIds', 'name email').populate('studentIds'),
      user.role === 'Admin' ? Student.countDocuments() : user.role === 'Teacher'
        ? Student.countDocuments({ _id: { $in: await Course.distinct('studentIds', activeFilter) } })
        : 1,
      ClassSession.countDocuments({ course: { $in: await Course.distinct('_id', activeFilter) } })
    ]);
    const studentIds = user.role === 'Student' ? [studentProfile?._id].filter(Boolean) : courses.flatMap(course => course.studentIds.map(s => s._id));
    const courseIds = courses.map(course => course._id);
    const attendanceMatch = { course: { $in: courseIds } };
    if (user.role === 'Student') attendanceMatch.student = studentProfile?._id;
    const records = await Attendance.find(attendanceMatch).populate('session', 'date').populate('student', 'uid user').sort({ markedAt: -1 }).limit(2000);
    const totalRecords = records.length;
    const attended = records.filter(record => ['Present', 'Late'].includes(record.status)).length;
    const overall = totalRecords ? Math.round(attended / totalRecords * 1000) / 10 : 0;
    const courseData = courses.map(course => {
      const rows = records.filter(row => row.course.equals(course._id));
      const attendedRows = rows.filter(row => ['Present', 'Late'].includes(row.status)).length;
      return { id: course._id, code: course.code, name: course.name, room: course.room, students: course.studentIds.length, teachers: course.teacherIds, attendance: rows.length ? Math.round(attendedRows / rows.length * 100) : 0 };
    });
    const dayKeys = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setUTCDate(d.getUTCDate() - (6 - i)); return d.toISOString().slice(0, 10);
    });
    const daily = dayKeys.map(date => {
      const rows = records.filter(row => row.session?.date === date);
      const present = rows.length ? Math.round(rows.filter(row => ['Present', 'Late'].includes(row.status)).length / rows.length * 100) : 0;
      return { day: new Date(`${date}T00:00:00Z`).toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' }), date, present, absent: rows.length ? 100 - present : 0 };
    });
    const monthly = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(); d.setUTCMonth(d.getUTCMonth() - (5 - i));
      const prefix = d.toISOString().slice(0, 7);
      const rows = records.filter(row => row.session?.date?.startsWith(prefix));
      return { month: d.toLocaleDateString('en', { month: 'short', timeZone: 'UTC' }), attendance: rows.length ? Math.round(rows.filter(row => ['Present', 'Late'].includes(row.status)).length / rows.length * 100) : 0 };
    });
    const ids = studentIds.map(id => id.toString());
    const studentDocs = user.role === 'Student' ? await Student.find({ _id: { $in: ids } }).populate('user', 'name email') : await Student.find({ _id: { $in: [...new Set(ids)] } }).populate('user', 'name email').limit(200);
    const students = studentDocs.map((student, i) => {
      const rows = records.filter(row => row.student?._id.equals(student._id));
      const attendedRows = rows.filter(row => ['Present', 'Late'].includes(row.status)).length;
      const latest = rows[0]?.status || 'Absent';
      return { id: student.uid, _id: student._id, name: student.user?.name || 'Student', email: student.user?.email || '', program: student.program, year: student.year, initials: (student.user?.name || 'S').split(' ').map(part => part[0]).slice(0,2).join('').toUpperCase(), color: ['lavender','peach','blue','mint','rose'][i%5], attendance: rows.length ? Math.round(attendedRows / rows.length * 100) : 0, today: latest, userId: student.user?._id };
    });
    const low = students.filter(student => student.attendance < 75);
    res.json({ role: user.role, metrics: { totalStudents, totalTeachers: user.role === 'Admin' ? await User.countDocuments({ role: 'Teacher', active: true }) : user.role === 'Teacher' ? 1 : 0, totalCourses: courses.length, totalClasses: classCount, overallAttendance: overall, presentCount: attended, lowAttendance: low.length, totalRecords }, courses: courseData, students, lowAttendance: low.slice(0,8), daily, monthly, activity: records.slice(0,12).map(row => ({ student: row.student?.uid, course: courses.find(c => c._id.equals(row.course))?.code, status: row.status, date: row.session?.date })), myAttendance: user.role === 'Student' ? records.map(row => ({ course: courseData.find(c => c.id.toString() === row.course.toString())?.name, status: row.status, date: row.session?.date })) : [] });
  } catch (error) { next(error); }
});

router.get('/students', authenticate, authorize('Admin', 'Teacher'), async (req, res, next) => {
  try {
    const courseIds = req.user.role === 'Teacher' ? await Course.distinct('studentIds', { teacherIds: req.user._id }) : null;
    const filter = courseIds ? { _id: { $in: courseIds } } : {};
    const students = await Student.find(filter).populate('user', 'name email').sort({ uid: 1 });
    res.json(students.map(student => ({ _id: student._id, id: student.uid, name: student.user.name, email: student.user.email, program: student.program, year: student.year })));
  } catch (error) { next(error); }
});

router.post('/students', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const { name, email, password, uid, program, year } = req.body;
    if (![name,email,password,uid,program,year].every(value => String(value || '').trim())) return res.status(400).json({ message: 'Name, email, password, student ID, program and year are required.' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must contain at least 8 characters.' });
    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12), role: 'Student' });
    const student = await Student.create({ user: user._id, uid, program, year });
    res.status(201).json({ _id: student._id, id: student.uid, name: user.name, email: user.email, program: student.program, year: student.year });
  } catch (error) { next(error); }
});

router.put('/students/:id', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const student = await Student.findByIdAndUpdate(req.params.id, { uid: req.body.uid, program: req.body.program, year: req.body.year }, { new: true, runValidators: true }).populate('user');
    if (!student) return res.status(404).json({ message: 'Student not found.' });
    await User.findByIdAndUpdate(student.user._id, { name: req.body.name, email: req.body.email }, { runValidators: true });
    res.json({ _id: student._id, id: student.uid, name: req.body.name, email: req.body.email, program: student.program, year: student.year });
  } catch (error) { next(error); }
});

router.delete('/students/:id', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found.' });
    await Promise.all([User.findByIdAndUpdate(student.user, { active: false }), Course.updateMany({ studentIds: student._id }, { $pull: { studentIds: student._id } }), Student.deleteOne({ _id: student._id })]);
    res.status(204).end();
  } catch (error) { next(error); }
});

router.get('/courses', authenticate, async (req, res, next) => {
  try {
    const scope = await courseScope(req.user);
    if (!scope) return res.status(403).json({ message: 'No student profile is linked to this account.' });
    const courses = await Course.find({ ...scope, active: true }).populate('teacherIds','name email').populate('studentIds');
    res.json(courses.map(course => ({ id: course._id, code: course.code, name: course.name, room: course.room, students: course.studentIds.length, teachers: course.teacherIds, teacherIds: course.teacherIds.map(t => t._id), studentIds: course.studentIds.map(s => s._id) })));
  } catch (error) { next(error); }
});

router.post('/courses', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const course = await Course.create({ code: req.body.code, name: req.body.name, room: req.body.room, teacherIds: req.body.teacherIds || [], studentIds: req.body.studentIds || [] });
    res.status(201).json(course);
  } catch (error) { next(error); }
});

router.put('/courses/:id', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const course = await Course.findByIdAndUpdate(req.params.id, { code: req.body.code, name: req.body.name, room: req.body.room, teacherIds: req.body.teacherIds, studentIds: req.body.studentIds }, { new: true, runValidators: true });
    if (!course) return res.status(404).json({ message: 'Course not found.' });
    res.json(course);
  } catch (error) { next(error); }
});

router.delete('/courses/:id', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const course = await Course.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
    if (!course) return res.status(404).json({ message: 'Course not found.' });
    res.status(204).end();
  } catch (error) { next(error); }
});

router.get('/teachers', authenticate, authorize('Admin'), async (_req, res, next) => {
  try { res.json((await User.find({ role: 'Teacher', active: true }).sort({ name: 1 })).map(cleanUser)); }
  catch (error) { next(error); }
});

router.post('/teachers', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (![name,email,password].every(value => String(value || '').trim())) return res.status(400).json({ message: 'Name, email and password are required.' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must contain at least 8 characters.' });
    const teacher = await User.create({ name, email, role: 'Teacher', passwordHash: await bcrypt.hash(password, 12) });
    res.status(201).json(cleanUser(teacher));
  } catch (error) { next(error); }
});

router.put('/teachers/:id', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const update = { name: req.body.name, email: req.body.email };
    if (req.body.password) {
      if (req.body.password.length < 8) return res.status(400).json({ message: 'Password must contain at least 8 characters.' });
      update.passwordHash = await bcrypt.hash(req.body.password, 12);
    }
    const teacher = await User.findOneAndUpdate({ _id: req.params.id, role: 'Teacher' }, update, { new: true, runValidators: true });
    if (!teacher) return res.status(404).json({ message: 'Teacher not found.' });
    res.json(cleanUser(teacher));
  } catch (error) { next(error); }
});

router.delete('/teachers/:id', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const teacher = await User.findOneAndUpdate({ _id: req.params.id, role: 'Teacher' }, { active: false }, { new: true });
    if (!teacher) return res.status(404).json({ message: 'Teacher not found.' });
    await Course.updateMany({ teacherIds: teacher._id }, { $pull: { teacherIds: teacher._id } });
    res.status(204).end();
  } catch (error) { next(error); }
});

router.post('/sessions', authenticate, authorize('Admin','Teacher'), async (req, res, next) => {
  try {
    const course = await canUseCourse(req.body.courseId, req.user);
    if (!course) return res.status(404).json({ message: 'Course not found or not assigned to your account.' });
    const parsedDate = new Date(`${req.body.date}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body.date || '') || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0,10) !== req.body.date) return res.status(400).json({ message: 'Choose a valid class date.' });
    if (req.body.date > new Date().toISOString().slice(0,10)) return res.status(400).json({ message: 'A class session cannot be created for a future date.' });
    const session = await ClassSession.create({ course: course._id, date: req.body.date, startTime: req.body.startTime || '10:00', endTime: req.body.endTime || '11:00', createdBy: req.user._id });
    res.status(201).json(session);
  } catch (error) { next(error); }
});

router.get('/sessions', authenticate, async (req, res, next) => {
  try {
    const course = await canUseCourse(req.query.courseId, req.user);
    if (!course) return res.status(404).json({ message: 'Course not found or not assigned to your account.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '')) return res.status(400).json({ message: 'Choose a valid class date.' });
    const session = await ClassSession.findOne({ course: course._id, date: req.query.date, startTime: req.query.startTime || '10:00' });
    res.json({ session });
  } catch (error) { next(error); }
});

router.get('/sessions/:id', authenticate, authorize('Admin','Teacher'), async (req, res, next) => {
  try {
    const session = await ClassSession.findById(req.params.id).populate('course');
    if (!session || !await canUseCourse(session.course._id, req.user)) return res.status(404).json({ message: 'Class session not found.' });
    const records = await Attendance.find({ session: session._id }).populate({ path: 'student', populate: { path: 'user', select: 'name email' } });
    const recorded = new Map(records.map(record => [record.student._id.toString(), record]));
    const roster = await Student.find({ _id: { $in: session.course.studentIds } }).populate('user','name email').sort({ uid: 1 });
    res.json({ session, course: session.course, attendance: roster.map(student => ({ student: { _id: student._id, uid: student.uid, name: student.user.name, email: student.user.email, program: student.program, year: student.year }, attendanceId: recorded.get(student._id.toString())?._id || null, status: recorded.get(student._id.toString())?.status || null })) });
  } catch (error) { next(error); }
});

router.put('/sessions/:id/attendance', authenticate, authorize('Admin','Teacher'), async (req, res, next) => {
  try {
    const session = await ClassSession.findById(req.params.id);
    if (!session || !await canUseCourse(session.course, req.user)) return res.status(404).json({ message: 'Class session not found or not assigned to your account.' });
    const rows = req.body.records;
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ message: 'Attendance records are required.' });
    const course = await Course.findById(session.course);
    const allowedStudents = new Set(course.studentIds.map(id => id.toString()));
    if (rows.some(row => !allowedStudents.has(String(row.studentId)) || !['Present','Absent','Late'].includes(row.status))) return res.status(400).json({ message: 'The register contains an invalid student or attendance status.' });
    if (new Set(rows.map(row => String(row.studentId))).size !== rows.length) return res.status(400).json({ message: 'Each student can appear only once in a class register.' });
    const existing = await Attendance.find({ session: session._id, student: { $in: rows.map(row => row.studentId) } });
    const existingByStudent = new Map(existing.map(record => [record.student.toString(), record]));
    const operations = rows.map(row => ({ updateOne: { filter: { session: session._id, student: row.studentId }, update: { $set: { course: course._id, status: row.status, markedBy: req.user._id, markedAt: new Date(), note: String(row.note || '').slice(0,300) } }, upsert: true } }));
    await Attendance.bulkWrite(operations, { ordered: true });
    const changed = rows.flatMap(row => {
      const previous = existingByStudent.get(String(row.studentId));
      return previous && previous.status !== row.status ? [{ attendance: previous._id, previousStatus: previous.status, newStatus: row.status, changedBy: req.user._id, note: String(row.note || '').slice(0,300) }] : [];
    });
    if (changed.length) await AttendanceRevision.insertMany(changed);
    session.status = 'Submitted'; await session.save();
    res.json({ saved: rows.length, revisions: changed.length, sessionId: session._id, status: session.status });
  } catch (error) { next(error); }
});

router.get('/attendance/:id/history', authenticate, authorize('Admin','Teacher'), async (req, res, next) => {
  try {
    const record = await Attendance.findById(req.params.id).populate('course');
    if (!record || !await canUseCourse(record.course._id, req.user)) return res.status(404).json({ message: 'Attendance record not found or not assigned to your account.' });
    res.json(await AttendanceRevision.find({ attendance: record._id }).populate('changedBy', 'name role').sort({ changedAt: -1 }));
  } catch (error) { next(error); }
});

router.get('/reports/attendance.csv', authenticate, authorize('Admin','Teacher'), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.courseId) {
      const course = await canUseCourse(req.query.courseId, req.user);
      if (!course) return res.status(404).json({ message: 'Course not found or not assigned.' });
      filter.course = course._id;
    } else if (req.user.role === 'Teacher') filter.course = { $in: await Course.distinct('_id', { teacherIds: req.user._id }) };
    if (req.query.from || req.query.to) {
      const dateFilter = {};
      if (req.query.from) dateFilter.$gte = req.query.from;
      if (req.query.to) dateFilter.$lte = req.query.to;
      const sessionIds = await ClassSession.distinct('_id', { date: dateFilter }); filter.session = { $in: sessionIds };
    }
    const records = await Attendance.find(filter).populate('student').populate('course').populate('session').sort({ 'session.date': -1 });
    const escapeCsv = value => `"${String(value ?? '').replaceAll('"','""')}"`;
    const lines = [['Date','Course','Student ID','Status'], ...records.map(row => [row.session.date,row.course.code,row.student.uid,row.status])].map(row => row.map(escapeCsv).join(',')).join('\r\n');
    res.type('text/csv').attachment('attendly-attendance-report.csv').send(lines);
  } catch (error) { next(error); }
});

export default router;
