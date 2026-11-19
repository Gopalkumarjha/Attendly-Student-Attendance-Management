import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from './models/User.js';
import { Student } from './models/Student.js';
import { Course } from './models/Course.js';
import { ClassSession } from './models/ClassSession.js';
import { Attendance } from './models/Attendance.js';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('Set MONGODB_URI in .env before running the attendance seed script.');

const password = await bcrypt.hash('Attendly@2026', 12);
await mongoose.connect(uri);
try {
  if (await User.exists({})) throw new Error('Database already contains users. Seed cancelled to protect existing data.');
  const [admin, teacher, ...studentUsers] = await User.create([
    { name: 'Gopal Kumar Jha', email: 'admin@attendly.demo', role: 'Admin', passwordHash: password },
    { name: 'Dr. Riya Sen', email: 'teacher@attendly.demo', role: 'Teacher', passwordHash: password },
    ...[
      ['Aarav Mehta','aarav@attendly.demo'],['Ananya Iyer','ananya@attendly.demo'],['Ishaan Kapoor','ishaan@attendly.demo'],['Diya Sharma','diya@attendly.demo'],
      ['Kabir Nair','kabir@attendly.demo'],['Meera Joshi','meera@attendly.demo'],['Rohan Das','rohan@attendly.demo'],['Sara Fernandes','sara@attendly.demo'],
      ['Rahul Dhatwalia','rahul@attendly.demo']
    ].map(([name,email]) => ({ name, email, role: 'Student', passwordHash: password }))
  ]);
  const roster = await Student.create(studentUsers.map((user,index) => ({
    user: user._id,
    uid: index === 8 ? '24BCS12474' : `STU-${String(2401+index).padStart(4,'0')}`,
    program: index === 2 || index === 7 ? 'Information Technology' : 'Computer Science',
    year: index % 3 === 0 ? 'Year 2' : 'Year 3'
  })));
  const definitions = [
    ['CS301','Data Structures & Algorithms','Block A · Room 204'],
    ['CS305','Database Management Systems','Block B · Lab 3'],
    ['CS309','Computer Networks','Block A · Room 108'],
    ['CS312','Software Engineering','Block C · Room 301']
  ];
  const courseDocs = await Course.create(definitions.map(([code,name,room]) => ({ code,name,room,teacherIds:[teacher._id],studentIds:roster.map(s=>s._id) })));
  const sessions=[];
  for(let offset=20;offset>=0;offset--){
    const date=new Date(); date.setUTCHours(0,0,0,0); date.setUTCDate(date.getUTCDate()-offset);
    if(date.getUTCDay()===0||date.getUTCDay()===6) continue;
    for(const course of courseDocs) sessions.push({ course:course._id,date:date.toISOString().slice(0,10),createdBy:teacher._id,status:'Submitted' });
  }
  const sessionDocs=await ClassSession.insertMany(sessions,{ordered:true});
  const records=[];
  for(const session of sessionDocs){
    const day=Number(session.date.slice(-2)); const courseIndex=courseDocs.findIndex(c=>c._id.equals(session.course));
    for(let studentIndex=0;studentIndex<roster.length;studentIndex++){
      const n=(studentIndex*3+day+courseIndex)%13;
      records.push({ session:session._id,course:session.course,student:roster[studentIndex]._id,markedBy:teacher._id,status:n===0?'Absent':n===1?'Late':'Present',markedAt:new Date(`${session.date}T10:00:00Z`) });
    }
  }
  await Attendance.insertMany(records,{ordered:false});
  console.log(`Seeded Attendly demo data: 1 admin, 1 teacher, ${roster.length} students, ${courseDocs.length} courses and ${records.length} attendance records.`);
  console.log('Demo accounts use the same password: Attendly@2026');
} finally {
  await mongoose.disconnect();
}
