/**
 * dataApi.js - Kalinabiri SS shared data layer
 * Bridges localStorage (offline-first) with backend API
 * Backend: /api
 */
(function() {
  'use strict';

  // /api/* routes through the Netlify function proxy on production.
  // On localhost, point directly at the backend (assumes it's running on :3000).
  const API_BASE = '/api';
  const DB_KEY = 'KalinabiriSS_DB';
  const TOKEN_KEY = 'kalibz_token';

  // ── Default seed data ────────────────────────────────
  const SEED = {
    students: [
      { id: 'st-001', backendId: 'st-001', name: 'Nakato Grace', first_name: 'Nakato', last_name: 'Grace', admNo: 'KSS/2024/001', admission_no: 'KSS/2024/001', class: 'S.1', stream: 'A', gender: 'Female', dob: '2008-03-15', parent_name: 'Nakato Joseph', parent_phone: '+256700123456', parent_email: 'joseph.nakato@email.com', status: 'active', address: 'Kampala' },
      { id: 'st-002', backendId: 'st-002', name: 'Opolot Brian', first_name: 'Opolot', last_name: 'Brian', admNo: 'KSS/2024/002', admission_no: 'KSS/2024/002', class: 'S.1', stream: 'A', gender: 'Male', dob: '2007-08-22', parent_name: 'Opolot Sam', parent_phone: '+256701234567', status: 'active', address: 'Jinja' },
      { id: 'st-003', backendId: 'st-003', name: 'Amumpiire Faith', first_name: 'Amumpiire', last_name: 'Faith', admNo: 'KSS/2023/001', admission_no: 'KSS/2023/001', class: 'S.2', stream: 'A', gender: 'Female', parent_name: 'Amumpiire Ruth', parent_phone: '+256702345678', status: 'active', address: 'Kampala' },
      { id: 'st-004', backendId: 'st-004', name: 'Mugisha Peter', first_name: 'Mugisha', last_name: 'Peter', admNo: 'KSS/2023/002', admission_no: 'KSS/2023/002', class: 'S.2', stream: 'B', gender: 'Male', parent_name: 'Mugisha John', parent_phone: '+256703456789', status: 'active', address: 'Mbarara' },
      { id: 'st-005', backendId: 'st-005', name: 'Namuli Resty', first_name: 'Namuli', last_name: 'Resty', admNo: 'KSS/2022/001', admission_no: 'KSS/2022/001', class: 'S.3', stream: 'A', gender: 'Female', parent_name: 'Namuli Teddy', parent_phone: '+256704567890', status: 'active', address: 'Kampala' },
      { id: 'st-006', backendId: 'st-006', name: 'Okello Francis', first_name: 'Okello', last_name: 'Francis', admNo: 'KSS/2022/002', admission_no: 'KSS/2022/002', class: 'S.4', stream: 'A', gender: 'Male', parent_name: 'Okello Patrick', parent_phone: '+256705678901', status: 'active', address: 'Gulu' },
      { id: 'st-007', backendId: 'st-007', name: 'Katusiime Diana', first_name: 'Katusiime', last_name: 'Diana', admNo: 'KSS/2024/003', admission_no: 'KSS/2024/003', class: 'S.1', stream: 'B', gender: 'Female', parent_name: 'Katusiime Moses', parent_phone: '+256706789012', status: 'active', address: 'Fort Portal' },
      { id: 'st-008', backendId: 'st-008', name: 'Tumusiime Andrew', first_name: 'Tumusiime', last_name: 'Andrew', admNo: 'KSS/2023/003', admission_no: 'KSS/2023/003', class: 'S.3', stream: 'B', gender: 'Male', parent_name: 'Tumusiime Fred', parent_phone: '+256707890123', status: 'active', address: 'Kampala' },
    ],
    teachers: [
      { id: 'tc-001', backendId: 'tc-001', name: 'Obwire Charles', first_name: 'Obwire', last_name: 'Charles', email: 'obwire@kalinabiriss.ac.ug', phone: '+256700111222', gender: 'Male', subjects: ['Mathematics', 'Physics'], classes: ['S.4', 'S.5', 'S.6'], status: 'active' },
      { id: 'tc-002', backendId: 'tc-002', name: 'Nabukeera Scovia', first_name: 'Nabukeera', last_name: 'Scovia', email: 'scovia@kalinabiriss.ac.ug', phone: '+256701222333', gender: 'Female', subjects: ['English', 'Literature'], classes: ['S.1', 'S.2', 'S.3'], status: 'active' },
      { id: 'tc-003', backendId: 'tc-003', name: 'Mukama Deus', first_name: 'Mukama', last_name: 'Deus', email: 'mukama@kalinabiriss.ac.ug', phone: '+256702333444', gender: 'Male', subjects: ['Chemistry', 'Biology'], classes: ['S.4', 'S.5', 'S.6'], status: 'active' },
      { id: 'tc-004', backendId: 'tc-004', name: 'Atwijukire Bronia', first_name: 'Atwijukire', last_name: 'Bronia', email: 'atwijukire@kalinabiriss.ac.ug', phone: '+256703444555', gender: 'Female', subjects: ['Geography', 'History'], classes: ['S.1', 'S.2', 'S.3'], status: 'active' },
    ],
    parents: [
      { id: 'pa-001', backendId: 'pa-001', name: 'Nakato Joseph', first_name: 'Nakato', last_name: 'Joseph', phone: '+256700123456', relationship: 'Father', email: 'joseph.nakato@email.com' },
      { id: 'pa-002', backendId: 'pa-002', name: 'Opolot Sam', first_name: 'Opolot', last_name: 'Sam', phone: '+256701234567', relationship: 'Father', email: 'opolot.sam@email.com' },
    ],
    classes: [
      { id: 'cl-001', backendId: 'cl-001', name: 'S.1', stream: 'A' },
      { id: 'cl-002', backendId: 'cl-002', name: 'S.1', stream: 'B' },
      { id: 'cl-003', backendId: 'cl-003', name: 'S.2', stream: 'A' },
      { id: 'cl-004', backendId: 'cl-004', name: 'S.2', stream: 'B' },
      { id: 'cl-005', backendId: 'cl-005', name: 'S.3', stream: 'A' },
      { id: 'cl-006', backendId: 'cl-006', name: 'S.3', stream: 'B' },
      { id: 'cl-007', backendId: 'cl-007', name: 'S.4', stream: 'A' },
      { id: 'cl-008', backendId: 'cl-008', name: 'S.4', stream: 'B' },
      { id: 'cl-009', backendId: 'cl-009', name: 'S.5', stream: 'A' },
      { id: 'cl-010', backendId: 'cl-010', name: 'S.5', stream: 'B' },
      { id: 'cl-011', backendId: 'cl-011', name: 'S.6', stream: 'A' },
      { id: 'cl-012', backendId: 'cl-012', name: 'S.6', stream: 'B' },
    ],
    subjects: [
      { id: 'sj-001', backendId: 'sj-001', name: 'Mathematics', code: 'MTH', category: 'Mathematics', level: 'O Level' },
      { id: 'sj-002', backendId: 'sj-002', name: 'English', code: 'ENG', category: 'Languages', level: 'O Level' },
      { id: 'sj-003', backendId: 'sj-003', name: 'Physics', code: 'PHY', category: 'Science', level: 'O Level' },
      { id: 'sj-004', backendId: 'sj-004', name: 'Chemistry', code: 'CHM', category: 'Science', level: 'O Level' },
      { id: 'sj-005', backendId: 'sj-005', name: 'Biology', code: 'BIO', category: 'Science', level: 'O Level' },
      { id: 'sj-006', backendId: 'sj-006', name: 'Geography', code: 'GEO', category: 'Humanities', level: 'O Level' },
      { id: 'sj-007', backendId: 'sj-007', name: 'History', code: 'HIS', category: 'Humanities', level: 'O Level' },
      { id: 'sj-008', backendId: 'sj-008', name: 'CRE', code: 'CRE', category: 'Applied', level: 'O Level' },
      { id: 'sj-009', backendId: 'sj-009', name: 'Literature', code: 'LIT', category: 'Languages', level: 'O Level' },
      { id: 'sj-010', backendId: 'sj-010', name: 'Agriculture', code: 'AGR', category: 'Applied', level: 'O Level' },
      { id: 'sj-011', backendId: 'sj-011', name: 'Computer', code: 'COMP', category: 'Applied', level: 'O Level' },
      { id: 'sj-012', backendId: 'sj-012', name: 'Entrepreneurship', code: 'ENT', category: 'Applied', level: 'O Level' },
    ],
    attendance: [
      { id: 'at-001', studentId: 'st-001', student_name: 'Nakato Grace', date: '2026-06-01', class: 'S.1 A', status: 'present' },
      { id: 'at-002', studentId: 'st-002', student_name: 'Opolot Brian', date: '2026-06-01', class: 'S.1 A', status: 'present' },
      { id: 'at-003', studentId: 'st-001', student_name: 'Nakato Grace', date: '2026-06-02', class: 'S.1 A', status: 'present' },
      { id: 'at-004', studentId: 'st-002', student_name: 'Opolot Brian', date: '2026-06-02', class: 'S.1 A', status: 'absent' },
      { id: 'at-005', studentId: 'st-003', student_name: 'Amumpiire Faith', date: '2026-06-02', class: 'S.2 A', status: 'present' },
    ],
    results: [
      { id: 'rs-001', studentId: 'st-001', student_name: 'Nakato Grace', class: 'S.1 A', subject: 'Mathematics', term: 'Term 1', exam_type: 'End of Term', score: 85, grade: 'A', date: '2026-04-15' },
      { id: 'rs-002', studentId: 'st-001', student_name: 'Nakato Grace', class: 'S.1 A', subject: 'English', term: 'Term 1', exam_type: 'End of Term', score: 78, grade: 'B', date: '2026-04-15' },
      { id: 'rs-003', studentId: 'st-002', student_name: 'Opolot Brian', class: 'S.1 A', subject: 'Mathematics', term: 'Term 1', exam_type: 'End of Term', score: 62, grade: 'C', date: '2026-04-15' },
      { id: 'rs-004', studentId: 'st-003', student_name: 'Amumpiire Faith', class: 'S.2 A', subject: 'Physics', term: 'Term 1', exam_type: 'End of Term', score: 91, grade: 'A', date: '2026-04-15' },
      { id: 'rs-005', studentId: 'st-003', student_name: 'Amumpiire Faith', class: 'S.2 A', subject: 'Chemistry', term: 'Term 1', exam_type: 'End of Term', score: 88, grade: 'A', date: '2026-04-16' },
      { id: 'rs-006', studentId: 'st-006', student_name: 'Okello Francis', class: 'S.4 A', subject: 'Mathematics', term: 'Term 1', exam_type: 'End of Term', score: 55, grade: 'C', date: '2026-04-15' },
    ],
    fees: [
      { id: 'fe-001', studentId: 'st-001', student_name: 'Nakato Grace', class: 'S.1 A', term: 'Term 1', amount: 1200000, paid: 800000, balance: 400000, status: 'partial' },
      { id: 'fe-002', studentId: 'st-002', student_name: 'Opolot Brian', class: 'S.1 A', term: 'Term 1', amount: 1200000, paid: 1200000, balance: 0, status: 'paid' },
      { id: 'fe-003', studentId: 'st-003', student_name: 'Amumpiire Faith', class: 'S.2 A', term: 'Term 1', amount: 1400000, paid: 600000, balance: 800000, status: 'partial' },
      { id: 'fe-004', studentId: 'st-004', student_name: 'Mugisha Peter', class: 'S.2 B', term: 'Term 1', amount: 1400000, paid: 0, balance: 1400000, status: 'unpaid' },
    ],
    announcements: [
      { id: 'an-001', backendId: 'an-001', title: 'End of Term Exams - Week 3', content: 'Final examinations for Term 2 will begin on Monday, 30th June 2026. All students must prepare accordingly. Timetables are posted on the notice board.', priority: 'high', date: '2026-06-10', active: true },
      { id: 'an-002', backendId: 'an-002', title: 'Fee Balance Reminder', content: 'Parents are reminded to clear all outstanding fee balances before the end of term. Please contact the bursar for payment plans.', priority: 'normal', date: '2026-06-08', active: true },
      { id: 'an-003', backendId: 'an-003', title: 'Sports Day - Saturday', content: 'Annual Sports Day is scheduled for Saturday 14th June 2026 at the school field. All students are encouraged to participate. Parents are welcome.', priority: 'normal', date: '2026-06-05', active: true },
      { id: 'an-004', backendId: 'an-004', title: 'URGENT: School Closure', content: 'School will close early on Friday 13th June due to heavy rainfall warning from the meteorology department. Students to go home by 12:00 noon.', priority: 'urgent', date: '2026-06-12', active: true },
    ],
    news: [
      { id: 'nw-001', backendId: 'nw-001', title: 'Kalibz Students Excel at National Science Fair', content: 'Three students from Kalinabiri SS represented the school at the Uganda National Science Fair held in Kampala last week. Nakato Grace (S.1) won the gold medal in the Junior Physics category. The school is proud of their achievement.', status: 'published', date: '2026-06-05', image: '' },
      { id: 'nw-002', backendId: 'nw-002', title: 'New Computer Lab Opened', content: 'Kalinabiri Secondary School has opened a brand new 40-station computer laboratory equipped with modern computers and internet access. The lab will serve both O-Level and A-Level students from the new term.', status: 'published', date: '2026-05-20', image: '' },
    ],
    activity: [
      { user: 'Admin', action: 'added student', entity: 'Nakato Grace', time: new Date(Date.now() - 3600000).toISOString() },
      { user: 'Admin', action: 'posted announcement', entity: 'End of Term Exams', time: new Date(Date.now() - 7200000).toISOString() },
      { user: 'Teacher Obwire', action: 'entered results for', entity: 'Mathematics - S.1 A', time: new Date(Date.now() - 10800000).toISOString() },
      { user: 'Admin', action: 'recorded payment for', entity: 'Nakato Grace - UGX 800,000', time: new Date(Date.now() - 14400000).toISOString() },
    ]
  };

  // ── DataAPI class ────────────────────────────────────
  class DataAPI {
    constructor() {
      this._db = null;
      this._listeners = [];
      this._syncPending = false;
    }

    // ── INIT ────────────────────────────────────────────
    async init() {
      const stored = localStorage.getItem(DB_KEY);
      if (stored) {
        try {
          this._db = JSON.parse(stored);
          // Ensure all keys exist
          for (const key of Object.keys(SEED)) {
            if (!Array.isArray(this._db[key])) this._db[key] = SEED[key];
          }
        } catch {
          this._db = JSON.parse(JSON.stringify(SEED));
          localStorage.setItem(DB_KEY, JSON.stringify(this._db));
        }
      } else {
        this._db = JSON.parse(JSON.stringify(SEED));
        localStorage.setItem(DB_KEY, JSON.stringify(this._db));
      }
      // Try to sync with backend — fire and forget, don't block
      this._syncWithBackend();
      return this._db;
    }

    // ── PERSISTENCE ─────────────────────────────────────
    _save() {
      localStorage.setItem(DB_KEY, JSON.stringify(this._db));
      this._emit('db_update', this._db);
    }

    _emit(event, data) {
      this._listeners.forEach(fn => { try { fn(event, data); } catch(e) {} });
    }

    on(event, fn) {
      if (event === 'db_update') this._listeners.push(fn);
    }

    off(event, fn) {
      if (event === 'db_update') {
        this._listeners = this._listeners.filter(l => l !== fn);
      }
    }

    getDB() { return this._db || {}; }

    // ── GENERATE ID ─────────────────────────────────────
    _genId(prefix) {
      return prefix + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    }

    // ── ACTIVITY LOG ────────────────────────────────────
    _log(user, action, entity) {
      if (!this._db.activity) this._db.activity = [];
      this._db.activity.unshift({
        user, action, entity,
        time: new Date().toISOString()
      });
      if (this._db.activity.length > 50) this._db.activity = this._db.activity.slice(0, 50);
    }

    // ── BACKEND SYNC ────────────────────────────────────
    async _syncWithBackend() {
      const token = sessionStorage.getItem(TOKEN_KEY);
      if (!token) return;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1500);
        const res = await fetch(API_BASE + '/sync/pull', {
          headers: { 'Authorization': 'Bearer ' + token },
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          if (data.students) this._db.students = data.students;
          if (data.teachers) this._db.teachers = data.teachers;
          if (data.results) this._db.results = data.results;
          if (data.attendance) this._db.attendance = data.attendance;
          this._save();
        }
      } catch (err) {
        console.error('Sync failed:', err);
        localStorage.setItem('sync_error', err.message);
      }
    }

    async _pushToBackend(endpoint, payload) {
      const token = sessionStorage.getItem(TOKEN_KEY);
      if (!token) return;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1500);
        await fetch(API_BASE + endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeout);
      } catch (err) {
        console.error('Push to backend failed:', err);
      }
    }

    // ── STUDENTS ────────────────────────────────────────
    getStudents() { return this._db.students || []; }

    async addStudent(data) {
      const student = {
        id: this._genId('st'),
        backendId: this._genId('st'),
        name: (data.first_name||'') + ' ' + (data.last_name||''),
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        admission_no: data.admission_no || data.admNo || '',
        admNo: data.admission_no || data.admNo || '',
        class: data.class || '',
        stream: data.stream || 'A',
        gender: data.gender || '',
        dob: data.dob || '',
        parent_name: data.parent_name || data.guardian || '',
        guardian: data.parent_name || data.guardian || '',
        parent_phone: data.parent_phone || data.phone || '',
        phone: data.parent_phone || data.phone || '',
        parent_email: data.parent_email || data.email || '',
        email: data.parent_email || data.email || '',
        address: data.address || '',
        username: data.username || '',
        password: data.password || '',
        status: 'active',
        created_at: new Date().toISOString()
      };
      this._db.students = this._db.students || [];
      this._db.students.push(student);
      this._log('Admin', 'added student', student.name);
      this._save();
      this._pushToBackend('/admin/students', student);
      return student;
    }

    async updateStudent(id, data) {
      const idx = this._db.students.findIndex(s => (s.id||s.backendId) == id);
      if (idx < 0) return;
      const existing = this._db.students[idx];
      const updated = {
        ...existing,
        ...data,
        name: (data.first_name || existing.first_name || '') + ' ' + (data.last_name || existing.last_name || ''),
        admNo: data.admission_no || existing.admission_no || existing.admNo || '',
        admission_no: data.admission_no || existing.admission_no || existing.admNo || '',
        class: data.class || existing.class || '',
        stream: data.stream || existing.stream || 'A',
        parent_name: data.parent_name || existing.parent_name || '',
        parent_phone: data.parent_phone || existing.parent_phone || '',
        parent_email: data.parent_email || existing.parent_email || '',
        updated_at: new Date().toISOString()
      };
      this._db.students[idx] = updated;
      this._log('Admin', 'updated student', updated.name);
      this._save();
      this._pushToBackend('/admin/students/update', { id, ...data });
      return updated;
    }

    async deleteStudent(id) {
      this._db.students = (this._db.students||[]).filter(s => (s.id||s.backendId) != id);
      this._log('Admin', 'deleted student', id);
      this._save();
    }

    // ── TEACHERS ────────────────────────────────────────
    getTeachers() { return this._db.teachers || []; }

    async addTeacher(data) {
      const teacher = {
        id: this._genId('tc'),
        backendId: this._genId('tc'),
        name: (data.first_name||'') + ' ' + (data.last_name||''),
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        username: data.username || data.email || '',
        email: data.email || '',
        phone: data.phone || '',
        gender: data.gender || '',
        subjects: Array.isArray(data.subjects) ? data.subjects : (data.subjects ? data.subjects.split(',').map(s=>s.trim()).filter(Boolean) : []),
        classes: Array.isArray(data.classes) ? data.classes : (data.classes ? data.classes.split(',').map(s=>s.trim()).filter(Boolean) : []),
        password: data.password || '',
        status: 'active',
        created_at: new Date().toISOString()
      };
      this._db.teachers = this._db.teachers || [];
      this._db.teachers.push(teacher);
      this._log('Admin', 'added teacher', teacher.name);
      this._save();
      this._pushToBackend('/admin/teachers', teacher);
      return teacher;
    }

    async deleteTeacher(id) {
      this._db.teachers = (this._db.teachers||[]).filter(t => (t.id||t.backendId) != id);
      this._log('Admin', 'deleted teacher', id);
      this._save();
      this._pushToBackend('/admin/teachers/delete', { id });
    }

    // ── PARENTS ─────────────────────────────────────────
    getParents() { return this._db.parents || []; }

    async addParent(data) {
      const parent = {
        id: this._genId('pa'),
        backendId: this._genId('pa'),
        name: (data.first_name||'') + ' ' + (data.last_name||''),
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        phone: data.phone || '',
        relationship: data.relationship || 'Guardian',
        email: data.email || '',
        created_at: new Date().toISOString()
      };
      this._db.parents = this._db.parents || [];
      this._db.parents.push(parent);
      this._log('Admin', 'added parent', parent.name);
      this._save();
      this._pushToBackend('/parents', parent);
      return parent;
    }

    async deleteParent(id) {
      this._db.parents = (this._db.parents||[]).filter(p => (p.id||p.backendId) != id);
      this._log('Admin', 'deleted parent', id);
      this._save();
    }

    // ── CLASSES ─────────────────────────────────────────
    getClasses() { return this._db.classes || []; }

    async addClass(data) {
      const cls = {
        id: this._genId('cl'),
        backendId: this._genId('cl'),
        name: data.name || '',
        stream: data.stream || 'A',
        created_at: new Date().toISOString()
      };
      this._db.classes = this._db.classes || [];
      this._db.classes.push(cls);
      this._log('Admin', 'added class', cls.name + ' ' + cls.stream);
      this._save();
      return cls;
    }

    async deleteClass(id) {
      this._db.classes = (this._db.classes||[]).filter(c => (c.id||c.backendId) != id);
      this._log('Admin', 'deleted class', id);
      this._save();
    }

    // ── SUBJECTS ────────────────────────────────────────
    getSubjects() { return this._db.subjects || []; }

    async addSubject(data) {
      const subj = {
        id: this._genId('sj'),
        backendId: this._genId('sj'),
        name: data.name || '',
        code: data.code || '',
        category: data.category || '',
        level: data.level || 'O Level',
        created_at: new Date().toISOString()
      };
      this._db.subjects = this._db.subjects || [];
      this._db.subjects.push(subj);
      this._log('Admin', 'added subject', subj.name);
      this._save();
      return subj;
    }

    async deleteSubject(id) {
      this._db.subjects = (this._db.subjects||[]).filter(s => (s.id||s.backendId) != id);
      this._log('Admin', 'deleted subject', id);
      this._save();
    }

    // ── ATTENDANCE ──────────────────────────────────────
    getAttendance() { return this._db.attendance || []; }

    async addAttendance(data) {
      const att = {
        id: this._genId('at'),
        studentId: data.studentId || '',
        student_name: data.student_name || data.studentId || '',
        date: data.date || new Date().toISOString().split('T')[0],
        class: data.class || '',
        status: data.status || 'present',
        created_at: new Date().toISOString()
      };
      this._db.attendance = this._db.attendance || [];
      this._db.attendance.push(att);
      this._log('Teacher', 'marked attendance for', att.student_name + ' (' + att.status + ')');
      this._save();
      this._pushToBackend('/attendance', att);
      return att;
    }

    async addAttendanceBatch(records) {
      const now = new Date().toISOString().split('T')[0];
      const added = records.map(r => ({
        id: this._genId('at'),
        studentId: r.studentId || '',
        student_name: r.student_name || r.studentId || '',
        date: r.date || now,
        class: r.class || '',
        status: r.status || 'present',
        created_at: new Date().toISOString()
      }));
      this._db.attendance = this._db.attendance || [];
      this._db.attendance.push(...added);
      this._log('Teacher', 'marked bulk attendance', added.length + ' students');
      this._save();
      this._pushToBackend('/attendance/batch', added);
      return added;
    }

    async deleteAttendance(id) {
      this._db.attendance = (this._db.attendance||[]).filter(a => a.id != id);
      this._save();
    }

    // ── RESULTS ─────────────────────────────────────────
    getResults() { return this._db.results || []; }

    async addResult(data) {
      const result = {
        id: this._genId('rs'),
        studentId: data.studentId || data.student_id || '',
        student_name: data.student_name || data.studentId || '',
        class: data.class || '',
        subject: data.subject || '',
        term: data.term || 'Term 1',
        exam_type: data.exam_type || 'End of Term',
        score: parseInt(data.score) || 0,
        grade: data.grade || this._calcGrade(parseInt(data.score)),
        position: data.position,
        date: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString()
      };
      this._db.results = this._db.results || [];
      this._db.results.push(result);
      this._log('Teacher', 'entered result', result.subject + ' - ' + result.score + ' for ' + result.student_name);
      this._save();
      this._pushToBackend('/results', result);
      return result;
    }

    _calcGrade(score) {
      if (score >= 85) return 'A';
      if (score >= 75) return 'B';
      if (score >= 65) return 'C';
      if (score >= 55) return 'D';
      if (score >= 45) return 'E';
      return 'F';
    }

    async deleteResult(id) {
      this._db.results = (this._db.results||[]).filter(r => r.id != id);
      this._save();
    }

    // ── FEES ────────────────────────────────────────────
    getFees() { return this._db.fees || []; }

    async addFee(data) {
      const amount = parseFloat(data.amount) || 0;
      const paid = parseFloat(data.paid) || 0;
      const balance = Math.max(0, amount - paid);
      const status = balance === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
      const fee = {
        id: this._genId('fe'),
        studentId: data.studentId || '',
        student_name: data.student_name || '',
        class: data.class || '',
        term: data.term || 'Term 1',
        amount, paid, balance, status,
        due_date: data.due_date || '',
        created_at: new Date().toISOString()
      };
      this._db.fees = this._db.fees || [];
      this._db.fees.push(fee);
      this._log('Admin', 'recorded fee', 'Class ' + fee.class + ' - UGX ' + amount.toLocaleString());
      this._save();
      this._pushToBackend('/fees', fee);
      return fee;
    }

    // ── ANNOUNCEMENTS ───────────────────────────────────
    getAnnouncements() { return this._db.announcements || []; }

    async addAnnouncement(data) {
      const ann = {
        id: this._genId('an'),
        backendId: this._genId('an'),
        title: data.title || '',
        content: data.content || '',
        priority: data.priority || 'normal',
        date: new Date().toISOString().split('T')[0],
        active: true,
        created_at: new Date().toISOString()
      };
      this._db.announcements = this._db.announcements || [];
      this._db.announcements.unshift(ann);
      this._log('Admin', 'posted announcement', ann.title);
      this._save();
      this._pushToBackend('/announcements', ann);
      return ann;
    }

    async deleteAnnouncement(id) {
      this._db.announcements = (this._db.announcements||[]).filter(a => (a.id||a.backendId) != id);
      this._log('Admin', 'deleted announcement', id);
      this._save();
    }

    // ── NEWS ────────────────────────────────────────────
    getNews() { return this._db.news || []; }

    async addNews(data) {
      const news = {
        id: this._genId('nw'),
        backendId: this._genId('nw'),
        title: data.title || '',
        content: data.content || '',
        status: data.status || 'published',
        image: data.image || '',
        date: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString()
      };
      this._db.news = this._db.news || [];
      this._db.news.unshift(news);
      this._log('Admin', 'published news', news.title);
      this._save();
      this._pushToBackend('/news', news);
      return news;
    }

    async deleteNews(id) {
      this._db.news = (this._db.news||[]).filter(n => (n.id||n.backendId) != id);
      this._log('Admin', 'deleted news', id);
      this._save();
    }

    // ── ACTIVITY ─────────────────────────────────────────
    getActivity() { return this._db.activity || []; }

    // ── ASSESSMENTS ──────────────────────────────────────
    getAssessments() { return this._db.assessments || []; }

    async createAssessment(data) {
      const assessment = {
        id: this._genId('as'),
        backendId: this._genId('as'),
        title: data.title || '',
        description: data.description || '',
        class: data.class || '',
        subject: data.subject || '',
        type: data.type || 'auto',   // 'auto' = MCQ/TF, 'manual' = short answer/essay
        duration_min: parseInt(data.duration_min) || 0,
        total_marks: parseInt(data.total_marks) || 0,
        deadline: data.deadline || '',
        status: 'open',  // open | closed | draft
        questions: [],   // populated below
        created_by: data.created_by || 'Teacher',
        attachment: data.attachment || '',  // base64 encoded file
        attachment_name: data.attachment_name || '',
        attachment_type: data.attachment_type || '',
        created_at: new Date().toISOString()
      };

      // Build questions array
      const qTitles = data.question_titles || [];
      const qTypes = data.question_types || [];
      const qOptions = data.question_options || [];  // array of comma-separated strings
      const qCorrect = data.question_correct || [];  // array of correct answer strings
      const qMarks = data.question_marks || [];
      const qShort = data.question_short_answers || [];  // for manual short answers

      for (let i = 0; i < qTitles.length; i++) {
        const qType = qTypes[i] || 'short';
        const opts = qOptions[i] ? qOptions[i].split('|').map(o => o.trim()).filter(Boolean) : [];
        assessment.questions.push({
          id: this._genId('qn'),
          title: qTitles[i],
          type: qType,
          options: opts,
          correct_answer: qType !== 'short' ? (qCorrect[i] || opts[0] || '') : '',
          short_answer: qShort[i] || '',  // rubric/expected answer for short answer
          marks: parseInt(qMarks[i]) || 1
        });
        assessment.total_marks += parseInt(qMarks[i]) || 1;
      }

      this._db.assessments = this._db.assessments || [];
      this._db.assessments.push(assessment);
      this._log('Teacher', 'created assessment', assessment.title + ' (' + assessment.class + ')');
      this._save();
      this._pushToBackend('/assessments', assessment);
      return assessment;
    }

    async updateAssessment(id, data) {
      const idx = this._db.assessments.findIndex(a => a.id == id);
      if (idx < 0) return;
      const existing = this._db.assessments[idx];
      const updated = { ...existing, ...data };
      this._db.assessments[idx] = updated;
      this._log('Teacher', 'updated assessment', updated.title);
      this._save();
      return updated;
    }

    async deleteAssessment(id) {
      this._db.assessments = (this._db.assessments||[]).filter(a => a.id != id);
      this._db.submissions = (this._db.submissions||[]).filter(s => s.assessmentId != id);
      this._log('Teacher', 'deleted assessment', id);
      this._save();
    }

    async submitAssessment(data) {
      const submission = {
        id: this._genId('sb'),
        assessmentId: data.assessmentId || '',
        studentId: data.studentId || '',
        student_name: data.student_name || '',
        answers: data.answers || [],   // [{questionId, answer, correct, marks_earned}]
        auto_score: data.auto_score || 0,
        teacher_score: data.teacher_score || null,
        total_score: data.total_score || 0,
        max_marks: data.max_marks || 0,
        submitted_at: new Date().toISOString(),
        graded: false
      };

      // Auto-grade MCQ and T/F
      const assessment = this._db.assessments?.find(a => a.id === data.assessmentId);
      if (assessment && assessment.type === 'auto') {
        let earned = 0;
        submission.answers.forEach(ans => {
          const q = (assessment.questions||[]).find(q => q.id === ans.questionId);
          if (q && (q.type === 'mcq' || q.type === 'tf')) {
            ans.correct = (ans.answer || '').toLowerCase().trim() === (q.correct_answer||'').toLowerCase().trim();
            ans.marks_earned = ans.correct ? (q.marks||0) : 0;
            earned += ans.marks_earned;
          } else {
            // manual - leave for teacher
            ans.correct = null;
            ans.marks_earned = 0;
          }
        });
        submission.auto_score = earned;
        submission.total_score = earned;
      }

      this._db.submissions = this._db.submissions || [];
      // Check if resubmission
      const existingIdx = submission.assessmentId ?
        this._db.submissions.findIndex(s => s.assessmentId === submission.assessmentId && s.studentId === submission.studentId) : -1;
      if (existingIdx >= 0) {
        this._db.submissions[existingIdx] = submission;
      } else {
        this._db.submissions.push(submission);
      }
      this._log('Student', 'submitted assessment', assessment?.title || submission.assessmentId);
      this._save();
      this._pushToBackend('/submissions', submission);
      return submission;
    }

    async gradeSubmission(id, teacher_score, feedback) {
      const idx = this._db.submissions.findIndex(s => s.id == id);
      if (idx < 0) return;
      this._db.submissions[idx].teacher_score = teacher_score;
      this._db.submissions[idx].total_score = (this._db.submissions[idx].auto_score || 0) + teacher_score;
      this._db.submissions[idx].feedback = feedback || '';
      this._db.submissions[idx].graded = true;
      this._log('Teacher', 'graded submission', 'Score: ' + this._db.submissions[idx].total_score);
      this._save();
      return this._db.submissions[idx];
    }

    getSubmissions(assessmentId) {
      return (this._db.submissions||[]).filter(s => !assessmentId || s.assessmentId === assessmentId);
    }

    getMySubmissions(studentId) {
      return (this._db.submissions||[]).filter(s => s.studentId === studentId);
    }

    // ── STATS ────────────────────────────────────────────
    getStats() {
      const db = this._db;
      const students = db.students || [];
      const teachers = db.teachers || [];
      const fees = db.fees || [];
      const announcements = (db.announcements||[]).filter(a => a.active !== false);

      const feesCollected = fees.reduce((sum, f) => sum + (f.paid||0), 0);
      const feesOutstanding = fees.reduce((sum, f) => sum + (f.balance||0), 0);

      return {
        students: students.length,
        teachers: teachers.length,
        feesCollected,
        feesOutstanding,
        pendingAdmissions: 0
      };
    }
  }

  // ── Export globally ───────────────────────────────────
  window.api = window.api || new DataAPI();

})();