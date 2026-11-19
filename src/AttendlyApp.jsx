import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, Bell, BookOpen, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Download, Ellipsis, FileBarChart2, GraduationCap, LayoutDashboard, LogOut, Menu, Plus, Search, ShieldCheck, UserRound, Users, X } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { attendanceApi } from './api.js';
import './styles.css';

const navItems = [['Overview',LayoutDashboard],['Attendance',CalendarDays],['Students',Users],['Teachers',UserRound],['Courses',BookOpen],['Reports',FileBarChart2]];
const today = () => new Date().toISOString().slice(0,10);
const demoAccounts = {
  Admin: { email:'admin@attendly.demo', password:'Attendly@2026' },
  Teacher: { email:'teacher@attendly.demo', password:'Attendly@2026' },
  Student: { email:'rahul@attendly.demo', password:'Attendly@2026' }
};

export default function AttendlyApp(){
  const [token,setToken]=useState(()=>localStorage.getItem('attendly-token'));
  const [user,setUser]=useState(()=>{try{return JSON.parse(localStorage.getItem('attendly-user'))}catch{return null}});
  const [active,setActive]=useState('Overview');
  const [dashboard,setDashboard]=useState(null);
  const [courses,setCourses]=useState([]);
  const [students,setStudents]=useState([]);
  const [teachers,setTeachers]=useState([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [toast,setToast]=useState('');
  const [mobileNav,setMobileNav]=useState(false);
  const [query,setQuery]=useState('');
  const [modal,setModal]=useState(null);
  const [period,setPeriod]=useState('This week');
  const [selectedCourse,setSelectedCourse]=useState('');
  const [date,setDate]=useState(today());
  const [session,setSession]=useState(null);
  const [register,setRegister]=useState([]);
  const [registerLoading,setRegisterLoading]=useState(false);
  const [audit,setAudit]=useState(null);
  const [reportRange,setReportRange]=useState({from:'',to:''});

  const logout=useCallback(()=>{localStorage.removeItem('attendly-token');localStorage.removeItem('attendly-user');setToken(null);setUser(null);setDashboard(null);setActive('Overview')},[]);
  useEffect(()=>{const expire=()=>logout();window.addEventListener('attendly-session-expired',expire);return()=>window.removeEventListener('attendly-session-expired',expire)},[logout]);
  const notify=message=>{setToast(message);window.clearTimeout(window.__attendlyToast);window.__attendlyToast=window.setTimeout(()=>setToast(''),2800)};
  const onLogin=async credentials=>{
    setLoading(true);setError('');
    try{const result=await attendanceApi.login(credentials);localStorage.setItem('attendly-token',result.token);localStorage.setItem('attendly-user',JSON.stringify(result.user));setToken(result.token);setUser(result.user)}
    catch(e){setError(e.message)}finally{setLoading(false)}
  };
  const loadData=useCallback(async()=>{
    if(!token)return;
    setLoading(true);setError('');
    try{
      const [dash,courseRows]=await Promise.all([attendanceApi.dashboard(),attendanceApi.courses()]);
      setDashboard(dash);
      const mergedCourses=courseRows.map(course=>({...course,...dash.courses.find(row=>String(row.id)===String(course.id)) ,teacherIds:course.teacherIds,studentIds:course.studentIds}));
      setCourses(mergedCourses);setSelectedCourse(current=>mergedCourses.some(c=>c.id===current)?current:mergedCourses[0]?.id||'');
      if(user?.role==='Admin'||user?.role==='Teacher'){
        const studentRows=await attendanceApi.students();
        setStudents(studentRows.map(student=>({...student,...dash.students.find(row=>String(row._id)===String(student._id))})));
      }
      if(user?.role==='Admin')setTeachers(await attendanceApi.teachers());
    }catch(e){setError(e.message)}finally{setLoading(false)}
  },[token,user?.role]);
  useEffect(()=>{loadData()},[loadData]);

  const exportCsv=async()=>{
    try{const blob=await attendanceApi.exportCsv(reportRange);const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download='attendly-attendance-report.csv';anchor.click();URL.revokeObjectURL(url);notify('Attendance report downloaded')}
    catch(e){setError(e.message)}
  };
  const openRegister=async()=>{
    if(!selectedCourse){setError('Create or assign a course before taking attendance.');return}
    setRegisterLoading(true);setError('');
    try{
      let result=await attendanceApi.getSession(selectedCourse,date);
      if(!result.session){
        try{await attendanceApi.createSession({courseId:selectedCourse,date})}
        catch(e){if(!/already|duplicate|unique/i.test(e.message))throw e}
        result=await attendanceApi.getSession(selectedCourse,date);
      }
      if(!result.session){setSession(null);setRegister([]);return}
      setSession(result.session);
      const data=await attendanceApi.register(result.session._id);
      setRegister(data.attendance.map(row=>({studentId:row.student._id,attendanceId:row.attendanceId,uid:row.student.uid,name:row.student.name,email:row.student.email,program:row.student.program,year:row.student.year,status:row.status||''})));
    }catch(e){setError(e.message)}finally{setRegisterLoading(false)}
  };
  const openAudit=async row=>{
    if(!row.attendanceId)return;
    setAudit({name:row.name,rows:null});
    try{setAudit({name:row.name,rows:await attendanceApi.attendanceHistory(row.attendanceId)})}
    catch(e){setAudit(null);setError(e.message)}
  };
  useEffect(()=>{if(active==='Attendance'&&user?.role!=='Student'&&selectedCourse)openRegister()},[active,selectedCourse,date,user?.role]);
  const saveRegister=async()=>{
    if(!session)return;
    if(register.some(row=>!row.status)){setError('Mark a status for every enrolled student before saving.');return}
    setRegisterLoading(true);setError('');
    try{await attendanceApi.saveRegister(session._id,register.map(row=>({studentId:row.studentId,status:row.status})));notify('Attendance saved to the database');await loadData();await openRegister()}
    catch(e){setError(e.message)}finally{setRegisterLoading(false)}
  };
  const saveEntity=async(event)=>{
    event.preventDefault();const form=new FormData(event.currentTarget);const values=Object.fromEntries(form.entries());
    try{
      if(modal.kind==='student'){
        const data={...values};if(modal.item)await attendanceApi.updateStudent(modal.item._id,data);else await attendanceApi.createStudent(data);
      }else if(modal.kind==='teacher'){
        const data={name:values.name,email:values.email,password:values.password};if(modal.item)await attendanceApi.updateTeacher(modal.item.id,data);else await attendanceApi.createTeacher(data);
      }else if(modal.kind==='course'){
        const data={code:values.code,name:values.name,room:values.room,teacherIds:Array.from(event.currentTarget.elements.teacherIds.selectedOptions,option=>option.value),studentIds:Array.from(event.currentTarget.elements.studentIds.selectedOptions,option=>option.value)};
        if(modal.item)await attendanceApi.updateCourse(modal.item.id,data);else await attendanceApi.createCourse(data);
      }
      setModal(null);notify('Changes saved');await loadData();
    }catch(e){setError(e.message)}
  };
  const removeEntity=async(kind,item)=>{
    if(!window.confirm(`Delete ${item.name||item.code}?`))return;
    try{if(kind==='student')await attendanceApi.deleteStudent(item._id);if(kind==='teacher')await attendanceApi.deleteTeacher(item.id);if(kind==='course')await attendanceApi.deleteCourse(item.id);notify('Record deleted');await loadData()}
    catch(e){setError(e.message)}
  };

  if(!token||!user)return <Login onLogin={onLogin} loading={loading} error={error}/>;
  const role=user.role;
  const allowedNav=navItems.filter(([label])=>label==='Overview'||(role==='Admin'&&label!=='Teachers'?true:role==='Admin'&&label==='Teachers')||(role==='Teacher'&&['Attendance','Students','Courses','Reports'].includes(label)));
  const filteredStudents=students.filter(student=>`${student.name} ${student.id} ${student.program}`.toLowerCase().includes(query.toLowerCase()));
  const metrics=dashboard?.metrics||{};
  const attendanceRate=metrics.overallAttendance||0;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav?'open':''}`}>
      <div className="brand"><div className="brand-mark"><GraduationCap size={23}/></div><div><strong>attend<span>ly</span></strong><small>CAMPUS PORTAL</small></div><button className="mobile-close" onClick={()=>setMobileNav(false)} aria-label="Close menu"><X size={18}/></button></div>
      <div className="workspace"><div className="campus-icon">C</div><div><b>Chandigarh University</b><small>Attendance management</small></div><ChevronDown size={15}/></div>
      <p className="nav-label">WORKSPACE</p><nav>{allowedNav.map(([label,Icon])=><button key={label} onClick={()=>{setActive(label);setMobileNav(false);setError('')}} className={`nav-link ${active===label?'selected':''}`}><Icon size={18}/><span>{label==='Overview'?'Dashboard':label}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><CircleHelp size={17}/></div><b>Role access</b><p>{role} permissions are checked by the attendance API.</p></div><div className="profile"><div className="avatar avatar-lavender">{initials(user.name)}</div><div className="profile-copy"><b>{user.name}</b><small>{role} account</small></div><button className="icon-button" onClick={logout} aria-label="Sign out"><LogOut size={17}/></button></div></div>
    </aside>
    {mobileNav&&<button className="scrim" onClick={()=>setMobileNav(false)} aria-label="Close navigation"/>}
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu" onClick={()=>setMobileNav(true)} aria-label="Open menu"><Menu size={20}/></button><div className="crumb"><span className="crumb-campus"><GraduationCap size={15}/> School of Engineering</span><ChevronRight size={15}/><b>{active==='Overview'?'Dashboard':active}</b></div><div className="top-actions"><span className="role-select"><ShieldCheck size={15}/>{role}</span><button className="icon-button notification" onClick={()=>notify('You are all caught up')} aria-label="Notifications"><Bell size={19}/></button><div className="top-avatar">{initials(user.name).slice(0,1)}</div></div></header>
      <div className="content">
        <div className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> {new Date().toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'}).toUpperCase()} · {role.toUpperCase()} WORKSPACE</div><h1>{active==='Overview'?`Welcome back, ${user.name.split(' ')[0]}`:active}</h1><p className="subtitle">{pageSubtitle(active,role)}</p></div><div className="welcome-actions">{role!=='Student'&&<button className="button button-white" onClick={exportCsv}><Download size={16}/> Export report</button>}{role!=='Student'&&<button className="button button-primary" onClick={()=>setActive('Attendance')}><Plus size={17}/> Take attendance</button>}</div></div>
        {error&&<div className="api-alert" role="alert"><span>{error}</span><button onClick={()=>setError('')} aria-label="Dismiss"><X size={16}/></button></div>}
        {loading&&!dashboard?<div className="card loading-card">Loading your attendance data...</div>:null}
        {dashboard&&active==='Overview'&&<Overview role={role} user={user} dashboard={dashboard} onNavigate={setActive} period={period} setPeriod={setPeriod}/>}
        {dashboard&&active==='Attendance'&&role!=='Student'&&<>
          <div className="attendance-toolbar card"><div className="field-group"><label>Course</label><select value={selectedCourse} onChange={e=>setSelectedCourse(e.target.value)}>{courses.map(course=><option value={course.id} key={course.id}>{course.code} · {course.name}</option>)}</select></div><div className="field-group"><label>Class date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div><div className="class-meta"><Clock3 size={16}/> {session?.startTime||'10:00'} · {courses.find(c=>c.id===selectedCourse)?.room||'No room'}</div><button className="button button-primary save-button" onClick={saveRegister} disabled={!session||registerLoading}><Check size={16}/>{registerLoading?'Saving...':'Save register'}</button></div>
          <section className="card register-card"><div className="card-heading"><div><h2>Class register <span className="soft-badge">{register.length} students</span></h2><p>Changes are saved to the shared attendance database.</p></div><div className="search-box"><Search size={16}/><input placeholder="Search students" value={query} onChange={e=>setQuery(e.target.value)}/></div></div><div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>PROGRAM</th><th>YEAR</th><th>STATUS</th><th>HISTORY</th></tr></thead><tbody>{register.filter(row=>`${row.name} ${row.uid} ${row.program}`.toLowerCase().includes(query.toLowerCase())).map(row=><tr key={row.studentId}><td><div className="person-cell"><div className="avatar avatar-blue">{initials(row.name)}</div><div><b>{row.name}</b><small>{row.uid} · {row.email}</small></div></div></td><td>{row.program}</td><td>{row.year}</td><td><select className="status-select" value={row.status} onChange={e=>setRegister(list=>list.map(item=>item.studentId===row.studentId?{...item,status:e.target.value}:item))}><option value="">Select status</option><option>Present</option><option>Late</option><option>Absent</option></select></td><td>{row.attendanceId?<button className="button button-white small-action" onClick={()=>openAudit(row)}>View changes</button>:<span className="muted">-</span>}</td></tr>)}</tbody></table>{!register.length&&!registerLoading&&<div className="empty-state">No enrolled students are assigned to this course.</div>}</div></section>
        </>}
        {dashboard&&active==='Students'&&role!=='Student'&&<Directory title="Students" rows={filteredStudents} query={query} setQuery={setQuery} readOnly={role!=='Admin'} onAdd={()=>setModal({kind:'student'})} onEdit={item=>setModal({kind:'student',item})} onDelete={item=>removeEntity('student',item)} />}
        {dashboard&&active==='Teachers'&&role==='Admin'&&<Directory title="Teachers" rows={teachers} query={query} setQuery={setQuery} onAdd={()=>setModal({kind:'teacher'})} onEdit={item=>setModal({kind:'teacher',item})} onDelete={item=>removeEntity('teacher',item)} />}
        {dashboard&&active==='Courses'&&<CourseDirectory courses={courses} readOnly={role!=='Admin'} onAdd={()=>setModal({kind:'course'})} onEdit={item=>setModal({kind:'course',item})} onDelete={item=>removeEntity('course',item)} />}
        {dashboard&&active==='Reports'&&role!=='Student'&&<Reports dashboard={dashboard} range={reportRange} setRange={setReportRange} exportCsv={exportCsv}/>}
        <footer className="footer"><span>© 2026 Attendly · Chandigarh University</span><span>Attendance insights for better learning outcomes</span></footer>
      </div>
    </main>
    {modal&&<EntityModal modal={modal} students={students} teachers={teachers} onClose={()=>setModal(null)} onSubmit={saveEntity}/>}
    {audit&&<div className="modal-backdrop" onClick={()=>setAudit(null)}><section className="modal audit-modal" onClick={event=>event.stopPropagation()}><div className="modal-head"><div><h2>Attendance changes</h2><p>{audit.name} · saved correction history</p></div><button className="icon-button" onClick={()=>setAudit(null)} aria-label="Close history"><X size={18}/></button></div>{audit.rows===null?<p className="empty-state">Loading history...</p>:audit.rows.length?<div className="audit-list">{audit.rows.map(row=><div className="audit-row" key={row._id}><div><b>{row.previousStatus} <ArrowUpRight size={13}/> {row.newStatus}</b><small>{new Date(row.changedAt).toLocaleString()} · {row.changedBy?.name||'Staff'}</small>{row.note&&<p>{row.note}</p>}</div></div>)}</div>:<p className="empty-state">No corrections have been made for this attendance record.</p>}</section></div>}
    {toast&&<div className="toast"><Check size={17}/>{toast}</div>}
  </div>;
}

function Login({onLogin,loading,error}){
  const [role,setRole]=useState('Admin');const [email,setEmail]=useState(demoAccounts.Admin.email);const [password,setPassword]=useState(demoAccounts.Admin.password);
  const choose=next=>{setRole(next);setEmail(demoAccounts[next].email);setPassword(demoAccounts[next].password)};
  return <main className="login-shell"><section className="login-card"><div className="brand login-brand"><div className="brand-mark"><GraduationCap size={23}/></div><div><strong>attend<span>ly</span></strong><small>CHANDIGARH UNIVERSITY</small></div></div><span className="login-kicker">ATTENDANCE MANAGEMENT</span><h1>Welcome back</h1><p>Sign in to view your campus attendance workspace.</p><div className="demo-role-list">{Object.keys(demoAccounts).map(name=><button type="button" className={role===name?'active':''} key={name} onClick={()=>choose(name)}>{name}</button>)}</div><form onSubmit={event=>{event.preventDefault();onLogin({email,password})}}><label>Email address<input type="email" autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)} required/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required/></label>{error&&<div className="login-error">{error}</div>}<button className="button button-primary login-submit" disabled={loading}>{loading?'Signing in...':'Sign in'} <ArrowUpRight size={16}/></button></form><div className="demo-note">Demo accounts are prefilled. Run <code>npm run seed:attendance</code> once after configuring MongoDB.</div></section></main>;
}

function Overview({role,user,dashboard,onNavigate,period,setPeriod}){
  const m=dashboard.metrics;const cards=role==='Admin'?
    [['Total students',m.totalStudents,'Active student profiles',Users,'violet'],['Teachers',m.totalTeachers,'Teaching accounts',UserRound,'green'],['Courses',m.totalCourses,'Active courses',BookOpen,'orange'],['Classes conducted',m.totalClasses,'Recorded sessions',CalendarDays,'pink'],['Overall attendance',`${m.overallAttendance}%`,'Present and late records',Activity,'violet'],['Students at risk',m.lowAttendance,'Below 75% attendance',ArrowDownRight,'pink']]:role==='Teacher'?
    [['My courses',m.totalCourses,'Assigned to your account',BookOpen,'violet'],['Students',m.totalStudents,'Across assigned courses',Users,'green'],['Classes conducted',m.totalClasses,'Recorded sessions',CalendarDays,'orange'],['Class attendance',`${m.overallAttendance}%`,'Across your courses',Activity,'pink']]:
    [['My attendance',`${m.overallAttendance}%`,'Present and late records',Activity,'violet'],['Courses',m.totalCourses,'Current enrollments',BookOpen,'green'],['Classes attended',m.presentCount,'Attendance records',Check,'orange'],['Classes recorded',m.totalRecords,'Available history',CalendarDays,'pink']];
  const trendData=period==='This week'?dashboard.daily.map(row=>({...row,label:row.day})):dashboard.monthly.slice(period==='This month'?-1:0).map(row=>({label:row.month,present:row.attendance,absent:100-row.attendance}));
  return <>
    <div className={`metric-grid ${role!=='Admin'?'role-metrics':''}`}>{cards.map(([title,value,note,icon,tint])=><Metric key={title} title={title} value={value??0} note={note} icon={icon} tint={tint}/>)}</div>
    <div className="dashboard-grid"><section className="card chart-card"><div className="card-heading"><div><h2>{role==='Student'?'My attendance trend':'Attendance overview'}</h2><p>Calculated from recorded class sessions</p></div><select className="select-control" value={period} onChange={event=>setPeriod(event.target.value)}><option>This week</option><option>This month</option><option>This semester</option></select></div><div className="chart-legend"><span><i className="legend-present"/> Present and late</span><span><i className="legend-absent"/> Absent</span><span className="chart-summary"><b>{m.overallAttendance}%</b> recorded average</span></div><div className="area-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trendData} margin={{top:12,right:8,left:-22,bottom:0}}><defs><linearGradient id="attendanceFillLive" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#858ff4" stopOpacity={.22}/><stop offset="100%" stopColor="#858ff4" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf0f4"/><XAxis dataKey="label" axisLine={false} tickLine={false}/><YAxis domain={[0,100]} axisLine={false} tickLine={false}/><Tooltip/><Area type="monotone" dataKey="present" name="Present %" stroke="#858ff4" strokeWidth={2.5} fill="url(#attendanceFillLive)"/><Area type="monotone" dataKey="absent" name="Absent %" stroke="#e6a46f" strokeWidth={2} fill="transparent"/></AreaChart></ResponsiveContainer></div></section>
      <section className="card classes-card"><div className="card-heading"><div><h2>{role==='Student'?'My courses':'Course attendance'}</h2><p>Attendance rate by course</p></div><button className="icon-button" onClick={()=>onNavigate('Courses')} aria-label="View courses"><Ellipsis size={19}/></button></div><div className="course-list">{dashboard.courses.map(course=><div className="course-row" key={course.id}><div className="course-initial" style={{background:'#858ff420',color:'#7d8df5'}}>{course.code.slice(0,2)}</div><div className="course-main"><div className="course-name"><b>{course.name}</b><span className={course.attendance<75?'low-number':''}>{course.attendance}%</span></div><div className="progress"><i style={{width:`${course.attendance}%`,background:course.attendance<75?'#dc8b80':'#7d8df5'}}/></div><small>{course.code} · {course.students} enrolled</small></div></div>)}</div></section></div>
    {role==='Admin'&&<div className="bottom-grid"><section className="card low-card"><div className="card-heading"><div><h2>Attendance watchlist</h2><p>Students below 75% attendance</p></div><span className="watch-count">{dashboard.lowAttendance.length} shown</span></div>{dashboard.lowAttendance.length?dashboard.lowAttendance.slice(0,5).map(student=><div className="watch-row" key={student._id}><div className="avatar avatar-blue">{student.initials}</div><div><b>{student.name}</b><small>{student.id} · {student.program}</small></div><strong className="low-number">{student.attendance}%</strong></div>):<p className="empty-state">No students currently fall below the threshold.</p>}<button className="text-link" onClick={()=>onNavigate('Students')}>Open student directory <ArrowUpRight size={14}/></button></section><section className="card chart-card"><div className="card-heading"><div><h2>Monthly trend</h2><p>Attendance by month</p></div></div><div className="area-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={dashboard.monthly}><CartesianGrid vertical={false} stroke="#edf0f4"/><XAxis dataKey="month" axisLine={false} tickLine={false}/><YAxis domain={[0,100]} axisLine={false} tickLine={false}/><Tooltip/><Bar dataKey="attendance" name="Attendance %" fill="#858ff4" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div></section></div>}
    {role==='Student'&&<section className="card activity-card"><div className="card-heading activity-heading"><div><h2>Recent attendance</h2><p>Your latest recorded class sessions</p></div></div><div className="student-history">{dashboard.myAttendance.slice(0,10).map((row,index)=><div className="history-row" key={`${row.date}-${row.course}-${index}`}><div className="history-check"><Check size={15}/></div><div><b>{row.course||'Course session'}</b><small>{row.date}</small></div><Status status={row.status}/></div>)}</div></section>}
    {role==='Teacher'&&<section className="card activity-card"><div className="card-heading activity-heading"><div><h2>Recent attendance activity</h2><p>Latest saved register entries</p></div><button className="text-link" onClick={()=>onNavigate('Attendance')}>Open class register <ArrowUpRight size={14}/></button></div><div className="student-history">{dashboard.activity.slice(0,8).map((row,index)=><div className="history-row" key={`${row.date}-${row.student}-${index}`}><div className="history-check"><Check size={15}/></div><div><b>{row.student} · {row.course}</b><small>{row.date}</small></div><Status status={row.status}/></div>)}</div></section>}
  </>;
}

function Directory({title,rows,query,setQuery,onAdd,onEdit,onDelete,readOnly=false}){
  return <section className="card register-card"><div className="card-heading"><div><h2>{title} <span className="soft-badge">{rows.length} records</span></h2><p>{readOnly?'Browse the records assigned to your courses.':`Manage campus ${title.toLowerCase()} and account details`}</p></div><div className="header-controls"><div className="search-box"><Search size={16}/><input placeholder={`Search ${title.toLowerCase()}`} value={query} onChange={e=>setQuery(e.target.value)}/></div>{!readOnly&&<button className="button button-primary" onClick={onAdd}><Plus size={16}/> Add {title.slice(0,-1).toLowerCase()}</button>}</div></div><div className="table-wrap"><table><thead><tr><th>NAME</th><th>{title==='Students'?'STUDENT ID':'EMAIL'}</th><th>{title==='Students'?'PROGRAM':'ROLE'}</th><th>{title==='Students'?'ATTENDANCE':'ACCOUNT'}</th>{!readOnly&&<th>ACTIONS</th>}</tr></thead><tbody>{rows.map(row=><tr key={row._id||row.id}><td><div className="person-cell"><div className="avatar avatar-lavender">{initials(row.name)}</div><div><b>{row.name}</b><small>{row.email}</small></div></div></td><td>{title==='Students'?row.id:row.email}</td><td>{title==='Students'?row.program:'Teacher'}</td><td>{title==='Students'?`${row.attendance??0}%`:'Active'}</td>{!readOnly&&<td><div className="row-actions"><button className="button button-white small-action" onClick={()=>onEdit(row)}>Edit</button><button className="button button-white small-action danger-action" onClick={()=>onDelete(row)}>Delete</button></div></td>}</tr>)}</tbody></table>{!rows.length&&<div className="empty-state">No records match your search.</div>}</div></section>;
}

function CourseDirectory({courses,onAdd,onEdit,onDelete,readOnly=false}){
  return <><div className="course-toolbar"><p>{readOnly?'Courses assigned to your account.':'Course enrollment and teacher assignments'}</p>{!readOnly&&<button className="button button-primary" onClick={onAdd}><Plus size={16}/> Add course</button>}</div><div className="course-grid">{courses.map(course=><section className="card course-card" key={course.id}><div className="course-card-top"><div className="course-initial large" style={{background:'#858ff420',color:'#7d8df5'}}>{course.code.slice(0,2)}</div><span className="course-tag">{course.code}</span></div><h2>{course.name}</h2><p><Users size={15}/>{course.students} students <span/> <BookOpen size={15}/>{course.room}</p><div className="course-card-rate"><span>Attendance rate</span><b>{course.attendance}%</b></div><div className="progress"><i style={{width:`${course.attendance}%`}}/></div>{!readOnly&&<div className="course-card-actions"><button className="button button-white small-action" onClick={()=>onEdit(course)}>Manage course</button><button className="button button-white small-action danger-action" onClick={()=>onDelete(course)}>Delete</button></div>}</section>)}</div></>;
}

function Reports({dashboard,range,setRange,exportCsv}){
  return <><div className="report-summary"><Metric title="Overall attendance" value={`${dashboard.metrics.overallAttendance}%`} note="Filtered recorded data" icon={Activity} tint="violet"/><Metric title="Classes conducted" value={dashboard.metrics.totalClasses} note="Saved class sessions" icon={BookOpen} tint="green"/><Metric title="Students at risk" value={dashboard.metrics.lowAttendance} note="Below 75% attendance" icon={Users} tint="pink"/></div><div className="dashboard-grid report-grid"><section className="card chart-card"><div className="card-heading"><div><h2>Monthly attendance</h2><p>Calculated from saved class registers</p></div></div><div className="area-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={dashboard.monthly}><CartesianGrid vertical={false} stroke="#edf0f4"/><XAxis dataKey="month" axisLine={false} tickLine={false}/><YAxis domain={[0,100]} axisLine={false} tickLine={false}/><Tooltip/><Bar dataKey="attendance" name="Attendance %" fill="#858ff4" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div></section><section className="card chart-card"><div className="card-heading"><div><h2>Export attendance</h2><p>Choose a date range for your CSV report</p></div></div><div className="report-filter"><label>From<input type="date" value={range.from} onChange={e=>setRange(current=>({...current,from:e.target.value}))}/></label><label>To<input type="date" value={range.to} onChange={e=>setRange(current=>({...current,to:e.target.value}))}/></label><button className="button button-primary" onClick={exportCsv}><Download size={15}/> Download CSV</button></div></section></div></>;
}

function EntityModal({modal,students,teachers,onClose,onSubmit}){
  const item=modal.item;const kind=modal.kind;const title=`${item?'Edit':'Add'} ${kind}`;
  return <div className="modal-backdrop" onClick={onClose}><div className="modal entity-modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><h2>{title}</h2><p>{kind==='course'?'Assign teaching staff and enrolled students.':`Create or update a ${kind} account.`}</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18}/></button></div><form onSubmit={onSubmit}>
    {kind==='student'&&<><label>Full name<input name="name" required defaultValue={item?.name}/></label><label>Email address<input name="email" type="email" required defaultValue={item?.email}/></label><label>Student ID<input name="uid" required defaultValue={item?.id}/></label><label>Program<input name="program" required defaultValue={item?.program||'Computer Science'}/></label><label>Year<input name="year" required defaultValue={item?.year||'Year 3'}/></label>{!item&&<label>Temporary password<input name="password" type="password" minLength="8" required placeholder="At least 8 characters"/></label>}</>}
    {kind==='teacher'&&<><label>Full name<input name="name" required defaultValue={item?.name}/></label><label>Email address<input name="email" type="email" required defaultValue={item?.email}/></label><label>{item?'New password (optional)':'Temporary password'}<input name="password" type="password" minLength="8" required={!item} placeholder={item?'Leave blank to keep current password':'At least 8 characters'}/></label></>}
    {kind==='course'&&<><label>Course code<input name="code" required defaultValue={item?.code}/></label><label>Course name<input name="name" required defaultValue={item?.name}/></label><label>Classroom<input name="room" defaultValue={item?.room||'TBA'}/></label><label>Assigned teachers<select name="teacherIds" multiple defaultValue={item?.teacherIds?.map(String)||[]}>{teachers.map(t=><option key={t.id} value={t.id}>{t.name} · {t.email}</option>)}</select><small>Use Ctrl (Windows) or Command (Mac) to select multiple.</small></label><label>Enrolled students<select name="studentIds" multiple defaultValue={item?.studentIds?.map(String)||[]}>{students.map(s=><option key={s._id} value={s._id}>{s.name} · {s.id}</option>)}</select><small>Choose the students who can appear in this course register.</small></label></>}
    <div className="modal-actions"><button type="button" className="button button-white" onClick={onClose}>Cancel</button><button className="button button-primary"><Check size={16}/> Save</button></div>
  </form></div></div>;
}

function Metric({title,value,note,icon:Icon,tint}){return <section className="card metric-card"><div className="metric-top"><span>{title}</span><div className={`metric-icon ${tint}`}><Icon size={18}/></div></div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></section>}
function Status({status}){return <span className={`status status-${String(status||'pending').toLowerCase().replaceAll(' ','-')}`}><i/>{status||'Pending'}</span>}
function initials(name=''){return name.split(/\s+/).filter(Boolean).map(part=>part[0]).slice(0,2).join('').toUpperCase()||'U'}
function pageSubtitle(page,role){if(page==='Overview')return role==='Admin'?'Here is what is happening across your campus.':role==='Teacher'?'Your assigned classes and attendance activity.':'Your attendance standing and course history.';if(page==='Attendance')return 'Select a course and date, then submit the class register.';if(page==='Reports')return 'Review attendance trends and export filtered records.';return `Manage and review campus ${page.toLowerCase()} records.`}
