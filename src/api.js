import axios from 'axios';

const defaultApiUrl = import.meta.env.PROD
  ? '/api/attendance'
  : 'http://127.0.0.1:5001/api/attendance';

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || defaultApiUrl).replace(/\/$/, ''),
  timeout: 12000,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('attendly-token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(response => response, error => {
  if (error.response?.status === 401 && localStorage.getItem('attendly-token')) {
    localStorage.removeItem('attendly-token');
    localStorage.removeItem('attendly-user');
    window.dispatchEvent(new Event('attendly-session-expired'));
  }
  return Promise.reject(new Error(error.response?.data?.message || error.message || 'Could not reach the attendance API.'));
});

export const attendanceApi = {
  login: async credentials => (await api.post('/auth/login', credentials)).data,
  me: async () => (await api.get('/auth/me')).data,
  dashboard: async () => (await api.get('/dashboard')).data,
  students: async () => (await api.get('/students')).data,
  createStudent: async data => (await api.post('/students', data)).data,
  updateStudent: async (id, data) => (await api.put(`/students/${id}`, data)).data,
  deleteStudent: async id => api.delete(`/students/${id}`),
  teachers: async () => (await api.get('/teachers')).data,
  createTeacher: async data => (await api.post('/teachers', data)).data,
  updateTeacher: async (id, data) => (await api.put(`/teachers/${id}`, data)).data,
  deleteTeacher: async id => api.delete(`/teachers/${id}`),
  courses: async () => (await api.get('/courses')).data,
  createCourse: async data => (await api.post('/courses', data)).data,
  updateCourse: async (id, data) => (await api.put(`/courses/${id}`, data)).data,
  deleteCourse: async id => api.delete(`/courses/${id}`),
  createSession: async data => (await api.post('/sessions', data)).data,
  getSession: async (courseId, date) => (await api.get('/sessions', { params: { courseId, date } })).data,
  register: async id => (await api.get(`/sessions/${id}`)).data,
  attendanceHistory: async id => (await api.get(`/attendance/${id}/history`)).data,
  saveRegister: async (id, records) => (await api.put(`/sessions/${id}/attendance`, { records })).data,
  exportCsv: async params => (await api.get('/reports/attendance.csv', { params, responseType: 'blob' })).data
};
