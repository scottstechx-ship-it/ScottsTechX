/* ================================================================
   KALINABIRI SECONDARY SCHOOL — Interactive Dashboard JS
   All portals: Student | Teacher | Admin
   API base: /api (routes through the Netlify function proxy — see netlify.toml)
   ================================================================ */

const API_BASE = '/api';

// ── MOCK DATA ────────────────────────────────────────────────────

const MOCK_STUDENTS = [
  { id: 1, admissionNo: 'KSS-2024-001', firstName: 'Sarah', lastName: 'Namutebi', class: 'S.4', stream: 'A', gender: 'F', phone: '0771234567', email: 'snamutebi@kalibz.ac.ug', status: 'active', parentName: 'John Namutebi', parentPhone: '0772000001' },
  { id: 2, admissionNo: 'KSS-2024-002', firstName: 'James', lastName: 'Okello', class: 'S.5', stream: 'A', gender: 'M', phone: '0771234568', email: 'jokello@kalibz.ac.ug', status: 'active', parentName: 'Peter Okello', parentPhone: '0772000002' },
  { id: 3, admissionNo: 'KSS-2024-003', firstName: 'Faith', lastName: 'Nakato', class: 'S.3', stream: 'B', gender: 'F', phone: '0771234569', email: 'fnakato@kalibz.ac.ug', status: 'active', parentName: 'Joseph Nakato', parentPhone: '0772000003' },
  { id: 4, admissionNo: 'KSS-2024-004', firstName: 'Moses', lastName: 'Kagoda', class: 'S.6', stream: 'A', gender: 'M', phone: '0771234570', email: 'mkagoda@kalibz.ac.ug', status: 'active', parentName: 'Robert Kagoda', parentPhone: '0772000004' },
  { id: 5, admissionNo: 'KSS-2024-005', firstName: 'Grace', lastName: 'Amumpire', class: 'S.2', stream: 'A', gender: 'F', phone: '0771234571', email: 'gamumpire@kalibz.ac.ug', status: 'active', parentName: 'David Amumpire', parentPhone: '0772000005' },
  { id: 6, admissionNo: 'KSS-2024-006', firstName: 'Samuel', lastName: 'Mwesigye', class: 'S.4', stream: 'B', gender: 'M', phone: '0771234572', email: 'smwesigye@kalibz.ac.ug', status: 'active', parentName: 'Geoffrey Mwesigye', parentPhone: '0772000006' },
  { id: 7, admissionNo: 'KSS-2024-007', firstName: 'Ruth', lastName: 'Achan', class: 'S.1', stream: 'A', gender: 'F', phone: '0771234573', email: 'rachan@kalibz.ac.ug', status: 'active', parentName: 'Michael Achan', parentPhone: '0772000007' },
  { id: 8, admissionNo: 'KSS-2024-008', firstName: 'Timothy', lastName: 'Okurut', class: 'S.5', stream: 'B', gender: 'M', phone: '0771234574', email: 'tokurut@kalibz.ac.ug', status: 'active', parentName: 'Charles Okurut', parentPhone: '0772000008' },
  { id: 9, admissionNo: 'KSS-2024-009', firstName: 'Esther', lastName: 'Nansubuga', class: 'S.3', stream: 'A', gender: 'F', phone: '0771234575', email: 'enansubuga@kalibz.ac.ug', status: 'active', parentName: 'Francis Nansubuga', parentPhone: '0772000009' },
  { id: 10, admissionNo: 'KSS-2024-010', firstName: 'Brian', lastName: 'Twebaza', class: 'S.2', stream: 'B', gender: 'M', phone: '0771234576', email: 'btwebaza@kalibz.ac.ug', status: 'active', parentName: 'Joseph Twebaza', parentPhone: '0772000010' },
  { id: 11, admissionNo: 'KSS-2023-011', firstName: 'Phiona', lastName: 'Katusiime', class: 'S.5', stream: 'A', gender: 'F', phone: '0771234577', email: 'pkatusiime@kalibz.ac.ug', status: 'active', parentName: 'August Katusiime', parentPhone: '0772000011' },
  { id: 12, admissionNo: 'KSS-2023-012', firstName: 'Vincent', lastName: 'Acam', class: 'S.6', stream: 'B', gender: 'M', phone: '0771234578', email: 'vcam@kalibz.ac.ug', status: 'active', parentName: 'Paul Acam', parentPhone: '0772000012' },
  { id: 13, admissionNo: 'KSS-2023-013', firstName: 'Sharon', lastName: 'Nakigozi', class: 'S.4', stream: 'A', gender: 'F', phone: '0771234579', email: 'snakigozi@kalibz.ac.ug', status: 'active', parentName: 'James Nakigozi', parentPhone: '0772000013' },
  { id: 14, admissionNo: 'KSS-2023-014', firstName: 'Alex', lastName: 'Mugarura', class: 'S.3', stream: 'B', gender: 'M', phone: '0771234580', email: 'amugarura@kalibz.ac.ug', status: 'active', parentName: 'John Mugarura', parentPhone: '0772000014' },
  { id: 15, admissionNo: 'KSS-2023-015', firstName: 'Diana', lastName: 'Karungi', class: 'S.1', stream: 'A', gender: 'F', phone: '0771234581', email: 'dkarungi@kalibz.ac.ug', status: 'active', parentName: 'Peter Karungi', parentPhone: '0772000015' },
];

const MOCK_TEACHERS = [
  { id: 1, firstName: 'Beatrice', lastName: 'Nabukeera', email: 'bnabukeera@kalibz.ac.ug', phone: '0773000001', gender: 'F', subjects: ['Mathematics'], classes: ['S.4', 'S.5', 'S.6'], status: 'active' },
  { id: 2, firstName: 'Charles', lastName: 'Muwonge', email: 'cmuwonge@kalibz.ac.ug', phone: '0773000002', gender: 'M', subjects: ['Physics'], classes: ['S.4', 'S.5', 'S.6'], status: 'active' },
  { id: 3, firstName: 'Grace', lastName: 'Namuli', email: 'gnamuli@kalibz.ac.ug', phone: '0773000003', gender: 'F', subjects: ['Chemistry'], classes: ['S.4', 'S.5', 'S.6'], status: 'active' },
  { id: 4, firstName: 'Fred', lastName: 'Ssekitoleko', email: 'fssekitoleko@kalibz.ac.ug', phone: '0773000004', gender: 'M', subjects: ['Biology'], classes: ['S.3', 'S.4', 'S.5'], status: 'active' },
  { id: 5, firstName: 'Hadija', lastName: 'Kabeuzi', email: 'hkabeuzi@kalibz.ac.ug', phone: '0773000005', gender: 'F', subjects: ['English Literature'], classes: ['S.1', 'S.2', 'S.3'], status: 'active' },
  { id: 6, firstName: 'John', lastName: 'Kayondo', email: 'jkayondo@kalibz.ac.ug', phone: '0773000006', gender: 'M', subjects: ['History', 'CRE'], classes: ['S.3', 'S.4', 'S.5'], status: 'active' },
  { id: 7, firstName: 'Agnes', lastName: 'Nabisere', email: 'anabisere@kalibz.ac.ug', phone: '0773000007', gender: 'F', subjects: ['Geography'], classes: ['S.2', 'S.3', 'S.4'], status: 'active' },
  { id: 8, firstName: 'Patrick', lastName: 'Muganzi', email: 'pmuganzi@kalibz.ac.ug', phone: '0773000008', gender: 'M', subjects: ['Economics'], classes: ['S.5', 'S.6'], status: 'active' },
  { id: 9, firstName: 'Sylvia', lastName: 'Nakayiki', email: 'snakayiki@kalibz.ac.ug', phone: '0773000009', gender: 'F', subjects: ['Physics', 'Mathematics'], classes: ['S.3', 'S.4'], status: 'active' },
  { id: 10, firstName: 'Sam', lastName: 'Nsubuga', email: 'snsubuga@kalibz.ac.ug', phone: '0773000010', gender: 'M', subjects: ['ICT'], classes: ['S.1', 'S.2', 'S.3', 'S.4'], status: 'active' },
  { id: 11, firstName: 'Miriam', lastName: 'Amongin', email: 'mamongin@kalibz.ac.ug', phone: '0773000011', gender: 'F', subjects: ['Agriculture'], classes: ['S.3', 'S.4', 'S.5'], status: 'active' },
  { id: 12, firstName: 'Robert', lastName: 'Kalule', email: 'rkalule@kalibz.ac.ug', phone: '0773000012', gender: 'M', subjects: ['Fine Art'], classes: ['S.3', 'S.4', 'S.5'], status: 'active' },
];

const MOCK_FEES = [
  { id: 1, student: 'Sarah Namutebi', class: 'S.4', admissionNo: 'KSS-2024-001', amount: 480000, paid: 320000, status: 'partial', dueDate: '2026-05-15', term: 'Term 2' },
  { id: 2, student: 'James Okello', class: 'S.5', admissionNo: 'KSS-2024-002', amount: 520000, paid: 520000, status: 'paid', dueDate: '2026-05-15', term: 'Term 2' },
  { id: 3, student: 'Faith Nakato', class: 'S.3', admissionNo: 'KSS-2024-003', amount: 420000, paid: 0, status: 'pending', dueDate: '2026-05-15', term: 'Term 2' },
  { id: 4, student: 'Moses Kagoda', class: 'S.6', admissionNo: 'KSS-2024-004', amount: 560000, paid: 200000, status: 'partial', dueDate: '2026-04-30', term: 'Term 2' },
  { id: 5, student: 'Grace Amumpire', class: 'S.2', admissionNo: 'KSS-2024-005', amount: 380000, paid: 380000, status: 'paid', dueDate: '2026-05-15', term: 'Term 2' },
  { id: 6, student: 'Samuel Mwesigye', class: 'S.4', admissionNo: 'KSS-2024-006', amount: 480000, paid: 0, status: 'overdue', dueDate: '2026-04-01', term: 'Term 2' },
  { id: 7, student: 'Ruth Achan', class: 'S.1', admissionNo: 'KSS-2024-007', amount: 360000, paid: 360000, status: 'paid', dueDate: '2026-05-15', term: 'Term 2' },
  { id: 8, student: 'Timothy Okurut', class: 'S.5', admissionNo: 'KSS-2024-008', amount: 520000, paid: 520000, status: 'paid', dueDate: '2026-05-15', term: 'Term 2' },
  { id: 9, student: 'Esther Nansubuga', class: 'S.3', admissionNo: 'KSS-2024-009', amount: 420000, paid: 420000, status: 'paid', dueDate: '2026-05-15', term: 'Term 2' },
  { id: 10, student: 'Phiona Katusiime', class: 'S.5', admissionNo: 'KSS-2023-011', amount: 520000, paid: 0, status: 'pending', dueDate: '2026-05-15', term: 'Term 2' },
];

const MOCK_ANNOUNCEMENTS = [
  { id: 1, title: 'Term 2 Examinations Schedule', content: 'Examinations will run from June 9 to June 20, 2026. All students must be prepared. The timetable is posted on the notice board.', category: 'Academic', createdAt: '2026-05-25', author: 'Beatrice Nabukeera' },
  { id: 2, title: 'Fee Payment Final Deadline', content: 'The final deadline for Term 2 fees is June 1st, 2026. Parents are urged to pay before this date to avoid penalties. Payment can be made via mobile money.', category: 'Finance', createdAt: '2026-05-20', author: 'Admin' },
  { id: 3, title: 'Science Fair 2026', content: 'The annual science fair will be held on June 21, 2026. Students interested in participating should submit their project proposals by June 5th.', category: 'Event', createdAt: '2026-05-18', author: 'Fred Ssekitoleko' },
  { id: 4, title: 'Inter-Class Athletics Meet', content: 'The inter-class athletics meet will take place on July 10th, 2026 at the school field. All students are encouraged to participate.', category: 'Sports', createdAt: '2026-05-15', author: 'Admin' },
  { id: 5, title: 'New ICT Lab Opening', content: 'Our newly equipped ICT lab with 50 computers is now open. Students can access the lab during scheduled hours and free periods.', category: 'General', createdAt: '2026-05-10', author: 'Sam Nsubuga' },
];

const MOCK_NEWS = [
  { id: 1, title: 'Kalinabiri SS Wins National Science Fair', content: 'Our students brought glory to the school after winning 1st place in the Uganda National Science Fair 2026. The team of 5 students impressed judges with their innovative project on solar water purification.', category: 'Achievement', image: 'https://picsum.photos/seed/kalibz1/800/400', createdAt: '2026-05-20' },
  { id: 2, title: '2026 S.1 Admissions Now Open', content: 'Applications for Senior One 2027 are now open. Parents and guardians can collect application forms from the school secretariat or download from our website.', category: 'Academic', image: 'https://picsum.photos/seed/kalibz2/800/400', createdAt: '2026-05-15' },
  { id: 3, title: 'Speech Day & Prize Giving Ceremony', content: 'The annual Speech Day and Prize Giving ceremony is scheduled for June 21, 2026. Parents are warmly invited to attend and celebrate their children\'s achievements.', category: 'Event', image: 'https://picsum.photos/seed/kalibz3/800/400', createdAt: '2026-05-10' },
  { id: 4, title: 'School Choir Wins Regional Competition', content: 'The Kalinabiri SS choir won 1st place at the Jinja Regional Music Competition. They will now represent the region at the national level in Kampala.', category: 'Achievement', image: 'https://picsum.photos/seed/kalibz4/800/400', createdAt: '2026-05-05' },
];

const MOCK_CLASSES = [
  { id: 1, name: 'S.4 Physics', subject: 'Physics', teacher: 'Charles Muwonge', students: 42, avgScore: 72, passRate: 78, trend: 3 },
  { id: 2, name: 'S.4 Chemistry', subject: 'Chemistry', teacher: 'Grace Namuli', students: 40, avgScore: 68, passRate: 71, trend: 1 },
  { id: 3, name: 'S.5 Physics', subject: 'Physics', teacher: 'Charles Muwonge', students: 38, avgScore: 75, passRate: 82, trend: 5 },
  { id: 4, name: 'S.6 Biology', subject: 'Biology', teacher: 'Fred Ssekitoleko', students: 35, avgScore: 70, passRate: 74, trend: -2 },
  { id: 5, name: 'S.3 Mathematics', subject: 'Mathematics', teacher: 'Beatrice Nabukeera', students: 45, avgScore: 64, passRate: 65, trend: 4 },
  { id: 6, name: 'S.5 Economics', subject: 'Economics', teacher: 'Patrick Muganzi', students: 36, avgScore: 76, passRate: 83, trend: 2 },
  { id: 7, name: 'S.2 Geography', subject: 'Geography', teacher: 'Agnes Nabisere', students: 43, avgScore: 71, passRate: 76, trend: 1 },
  { id: 8, name: 'S.1 ICT', subject: 'ICT', teacher: 'Sam Nsubuga', students: 48, avgScore: 82, passRate: 91, trend: 6 },
];

const MOCK_RESULTS = [
  { id: 1, student: 'Sarah Namutebi', admissionNo: 'KSS-2024-001', class: 'S.4', subject: 'Mathematics', score: 87, grade: 'A', position: 3, classAvg: 68 },
  { id: 2, student: 'Sarah Namutebi', admissionNo: 'KSS-2024-001', class: 'S.4', subject: 'English', score: 82, grade: 'A-', position: 5, classAvg: 71 },
  { id: 3, student: 'Sarah Namutebi', admissionNo: 'KSS-2024-001', class: 'S.4', subject: 'Physics', score: 78, grade: 'B+', position: 8, classAvg: 72 },
  { id: 4, student: 'Sarah Namutebi', admissionNo: 'KSS-2024-001', class: 'S.4', subject: 'Chemistry', score: 75, grade: 'B', position: 12, classAvg: 68 },
  { id: 5, student: 'Sarah Namutebi', admissionNo: 'KSS-2024-001', class: 'S.4', subject: 'History', score: 91, grade: 'A+', position: 1, classAvg: 65 },
  { id: 6, student: 'James Okello', admissionNo: 'KSS-2024-002', class: 'S.5', subject: 'Mathematics', score: 94, grade: 'A+', position: 1, classAvg: 71 },
  { id: 7, student: 'James Okello', admissionNo: 'KSS-2024-002', class: 'S.5', subject: 'Physics', score: 89, grade: 'A', position: 2, classAvg: 75 },
  { id: 8, student: 'James Okello', admissionNo: 'KSS-2024-002', class: 'S.5', subject: 'Chemistry', score: 85, grade: 'A', position: 4, classAvg: 73 },
  { id: 9, student: 'Faith Nakato', admissionNo: 'KSS-2024-003', class: 'S.3', subject: 'Mathematics', score: 61, grade: 'C', position: 18, classAvg: 64 },
  { id: 10, student: 'Faith Nakato', admissionNo: 'KSS-2024-003', class: 'S.3', subject: 'English', score: 74, grade: 'B+', position: 9, classAvg: 69 },
  { id: 11, student: 'Moses Kagoda', admissionNo: 'KSS-2024-004', class: 'S.6', subject: 'Biology', score: 79, grade: 'B+', position: 6, classAvg: 70 },
  { id: 12, student: 'Moses Kagoda', admissionNo: 'KSS-2024-004', class: 'S.6', subject: 'Chemistry', score: 83, grade: 'A-', position: 3, classAvg: 74 },
];

const MOCK_ATTENDANCE = [
  { student: 'Sarah Namutebi', class: 'S.4', date: '2026-05-28', status: 'present' },
  { student: 'James Okello', class: 'S.5', date: '2026-05-28', status: 'present' },
  { student: 'Faith Nakato', class: 'S.3', date: '2026-05-28', status: 'absent' },
  { student: 'Moses Kagoda', class: 'S.6', date: '2026-05-28', status: 'present' },
  { student: 'Grace Amumpire', class: 'S.2', date: '2026-05-28', status: 'present' },
  { student: 'Samuel Mwesigye', class: 'S.4', date: '2026-05-28', status: 'late' },
  { student: 'Ruth Achan', class: 'S.1', date: '2026-05-28', status: 'present' },
  { student: 'Timothy Okurut', class: 'S.5', date: '2026-05-28', status: 'present' },
  { student: 'Esther Nansubuga', class: 'S.3', date: '2026-05-28', status: 'present' },
  { student: 'Phiona Katusiime', class: 'S.5', date: '2026-05-28', status: 'absent' },
];

const MOCK_ADMISSIONS = [
  { id: 1, appNo: 'APP-2026-001', studentName: 'Ivan Mwamba', class: 'S.1', gender: 'M', parentName: 'Robert Mwamba', parentPhone: '0774000001', status: 'pending', dateApplied: '2026-05-20' },
  { id: 2, appNo: 'APP-2026-002', studentName: 'Prossy Namutebi', class: 'S.1', gender: 'F', parentName: 'David Namutebi', parentPhone: '0774000002', status: 'pending', dateApplied: '2026-05-18' },
  { id: 3, appNo: 'APP-2026-003', studentName: 'Kevin Owino', class: 'S.1', gender: 'M', parentName: 'John Owino', parentPhone: '0774000003', status: 'accepted', dateApplied: '2026-05-15' },
  { id: 4, appNo: 'APP-2026-004', studentName: 'Anitah Kyomuhendo', class: 'S.1', gender: 'F', parentName: 'George Kyomuhendo', parentPhone: '0774000004', status: 'pending', dateApplied: '2026-05-12' },
  { id: 5, appNo: 'APP-2026-005', studentName: 'Emmanuel Ssentamu', class: 'S.4', gender: 'M', parentName: 'Joseph Ssentamu', parentPhone: '0774000005', status: 'rejected', dateApplied: '2026-05-10' },
];

const MOCK_ACTIVITY = [
  { user: 'Admin', action: 'Added new student', entity: 'Sarah Namutebi', time: '2 min ago' },
  { user: 'Beatrice Nabukeera', action: 'Posted announcement', entity: 'Term 2 Exams Schedule', time: '1 hour ago' },
  { user: 'Charles Muwonge', action: 'Entered marks', entity: 'S.4 Physics - CAT1', time: '3 hours ago' },
  { user: 'Admin', action: 'Updated fee record', entity: 'Samuel Mwesigye', time: '5 hours ago' },
  { user: 'Sam Nsubuga', action: 'Uploaded notes', entity: 'S.1 ICT - Week 8', time: 'Yesterday' },
  { user: 'Admin', action: 'Published news', entity: 'Science Fair 2026', time: 'Yesterday' },
  { user: 'Grace Namuli', action: 'Marked attendance', entity: 'S.4 Chemistry', time: 'Yesterday' },
  { user: 'Fred Ssekitoleko', action: 'Created exam', entity: 'S.6 Biology Mid-Term', time: '2 days ago' },
];

const SUBJECTS = ['Mathematics', 'English', 'Physics', 'Chemistry', 'Biology', 'History', 'Geography', 'Economics', 'ICT', 'Fine Art', 'Music', 'Agriculture', 'CRE', 'French', 'Literature'];
const CLASSES = ['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'];
const STREAMS = ['A', 'B'];
const TERMS = ['Term 1', 'Term 2', 'Term 3'];

// ── STANDARD HELPERS ──────────────────────────────────────────────
function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  const colors = {
    success: 'linear-gradient(135deg,#22c55e,#16a34a)',
    error: 'linear-gradient(135deg,#ef4444,#dc2626)',
    info: 'linear-gradient(135deg,#3b82f6,#2563eb)',
    warning: 'linear-gradient(135deg,#f59e0b,#d97706)',
  };
  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  toast.style.cssText = `display:flex;align-items:center;gap:10px;padding:12px 20px;background:${colors[type] || colors.success};color:#fff;border-radius:12px;font-size:0.85rem;font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,0.4);opacity:0;transform:translateX(30px);transition:all 0.3s ease;min-width:260px;`;
  toast.innerHTML = `<span style="font-size:1rem;">${icons[type] || icons.success}</span><span>${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(0)'; });
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(30px)'; setTimeout(() => toast.remove(), 300); }, 3500);
}

async function apiCall(endpoint, options = {}) {
  const token = sessionStorage.getItem('kalibz_token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  } catch (e) {
    // don't spam toast for expected mock data fallback
    if (!e.message.includes('network') && !e.message.includes('Failed')) {
      showToast(e.message, 'error');
    }
    throw e;
  }
}

function getUser() {
  try { return JSON.parse(sessionStorage.getItem('kalibz_user') || 'null'); } catch { return null; }
}

function logout() {
  sessionStorage.removeItem('kalibz_token');
  sessionStorage.removeItem('kalibz_user');
  sessionStorage.removeItem('kalibz_role');
  window.location.href = '/admin-login/index.html';
}

// ── UTILITIES ────────────────────────────────────────────────────

function formatUGX(num) {
  return 'UGX ' + Number(num).toLocaleString();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getGradeBadge(score) {
  if (score >= 90) return '<span class="badge badge-success">A+</span>';
  if (score >= 80) return '<span class="badge badge-success">A</span>';
  if (score >= 75) return '<span class="badge badge-success">A-</span>';
  if (score >= 70) return '<span class="badge badge-info">B+</span>';
  if (score >= 65) return '<span class="badge badge-info">B</span>';
  if (score >= 60) return (score >= 60 ? '<span class="badge badge-info">B-</span>' : '');
  if (score >= 50) return '<span class="badge badge-warning">C</span>';
  if (score >= 40) return '<span class="badge badge-warning">D</span>';
  return '<span class="badge badge-danger">F</span>';
}

function getStatusBadge(status) {
  const map = {
    paid: '<span class="badge badge-success">Paid</span>',
    pending: '<span class="badge badge-warning">Pending</span>',
    partial: '<span class="badge badge-info">Partial</span>',
    overdue: '<span class="badge badge-danger">Overdue</span>',
    active: '<span class="badge badge-success">Active</span>',
    inactive: '<span class="badge badge-danger">Inactive</span>',
    accepted: '<span class="badge badge-success">Accepted</span>',
    rejected: '<span class="badge badge-danger">Rejected</span>',
    present: '<span class="badge badge-success">Present</span>',
    absent: '<span class="badge badge-danger">Absent</span>',
    late: '<span class="badge badge-warning">Late</span>',
  };
  return map[status] || `<span class="badge badge-info">${status}</span>`;
}

function getRoleFromPath() {
  const path = window.location.pathname;
  if (path.includes('admin')) return 'admin';
  if (path.includes('teacher')) return 'teacher';
  return 'student';
}

function animateCounter(el, target, suffix = '', duration = 1000) {
  if (!el) return;
  const start = 0;
  const startTime = performance.now();
  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(eased * target);
    el.textContent = current.toLocaleString() + suffix;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ── MODAL HELPERS ────────────────────────────────────────────────
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
  document.body.style.overflow = '';
}

// ── TABLE HELPERS ────────────────────────────────────────────────

function paginateTable(tableId, rowsPerPage = 10) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const page = parseInt(table.dataset.page || '1');
  const totalPages = Math.ceil(rows.length / rowsPerPage);
  rows.forEach((row, i) => {
    const start = (page - 1) * rowsPerPage;
    row.style.display = i >= start && i < start + rowsPerPage ? '' : 'none';
  });
  // Update pagination info if it exists
  const pager = document.getElementById(tableId + '_pager');
  if (pager) pager.textContent = `Showing ${((page - 1) * rowsPerPage) + 1}-${Math.min(page * rowsPerPage, rows.length)} of ${rows.length}`;
}

function filterTable(tableId, searchInputId) {
  const table = document.getElementById(tableId);
  const input = document.getElementById(searchInputId);
  if (!table || !input) return;
  const query = input.value.toLowerCase();
  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(query) ? '' : 'none';
  });
}

function exportTableToCSV(tableId, filename) {
  const table = document.getElementById(tableId);
  if (!table) return;
  let csv = [];
  table.querySelectorAll('thead th').forEach(th => csv.push(th.textContent.trim()));
  csv = [csv.join(',')];
  table.querySelectorAll('tbody tr').forEach(row => {
    if (row.style.display !== 'none') {
      const cells = row.querySelectorAll('td');
      if (cells.length > 0) {
        csv.push(Array.from(cells).map(td => `"${td.textContent.trim().replace(/"/g, '""')}"`).join(','));
      }
    }
  });
  const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (filename || 'export') + '_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  showToast('Exported to CSV', 'success');
}

// ── CANVAS CHART HELPERS ─────────────────────────────────────────

function drawBarChart(canvasId, labels, data, colors) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.scale(2, 2);
  const max = Math.max(...data);
  const barW = (canvas.offsetWidth - 60) / data.length;
  const chartH = canvas.offsetHeight - 60;

  ctx.clearRect(0, 0, w, h);
  // Y-axis lines
  for (let i = 0; i <= 4; i++) {
    const y = 20 + (chartH / 4) * i;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(canvas.offsetWidth - 10, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '10px Inter, sans-serif';
    const val = Math.round(max - (i / 4) * max);
    return;
    ctx.fillText(val, 5, y + 4);
  }
  // Re-draw
  for (let i = 0; i <= 4; i++) {
    const y = 20 + (chartH / 4) * i;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText(Math.round(max - (i / 4) * max), 5, y + 4);
  }
  // Bars
  data.forEach((val, i) => {
    const barHeight = (val / max) * chartH;
    const x = 50 + i * barW + 5;
    const y = 20 + chartH - barHeight;
    const color = Array.isArray(colors) ? colors[i] : (colors || '#22c55e');
    const grad = ctx.createLinearGradient(x, y, x, y + barHeight);
    grad.addColorStop(0, color);
    grad.addColorStop(1, color + '88');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, barW - 10, barHeight, 4);
    ctx.fill();
    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '9px Inter, sans-serif';
    ctx.fillText(labels[i] || '', x, canvas.offsetHeight - 5, barW - 10);
    // Value on bar
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.fillText(val, x + 2, y - 4, barW - 14);
  });
}

function drawDonutChart(canvasId, data, colors, labels) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.scale(2, 2);
  const cx = canvas.offsetWidth / 2;
  const cy = canvas.offsetHeight / 2;
  const r = Math.min(cx, cy) - 20;
  const total = data.reduce((a, b) => a + b, 0);
  let startAngle = -Math.PI / 2;

  data.forEach((val, i) => {
    const slice = (val / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + slice);
    ctx.closePath();
    ctx.fillStyle = colors[i] || '#22c55e';
    ctx.fill();
    startAngle += slice;
  });
  // Center hole
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, 0, 2 * Math.PI);
  ctx.fillStyle = 'var(--primary)';
  ctx.fill();
  // Total in center
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(total, cx, cy - 3);
  ctx.font = '10px Inter, sans-serif';
  ctx.fillText('Total', cx, cy + 12);
}

function drawLineChart(canvasId, labels, dataPoints, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.scale(2, 2);
  const chartX = 40, chartY = 10, chartW = canvas.offsetWidth - 50, chartH = canvas.offsetHeight - 40;
  const max = Math.max(...dataPoints);
  const min = Math.min(...dataPoints);
  const range = max - min || 1;

  ctx.clearRect(0, 0, w, h);
  // Grid
  for (let i = 0; i <= 4; i++) {
    const y = chartY + (chartH / 4) * i;
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(chartX, y); ctx.lineTo(chartX + chartW, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '9px Inter';
    ctx.fillText(Math.round(max - (i / 4) * range), 5, y + 4);
  }
  // Line
  const stepX = chartW / (dataPoints.length - 1 || 1);
  ctx.beginPath();
  ctx.strokeStyle = color || '#22c55e';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  dataPoints.forEach((val, i) => {
    const x = chartX + i * stepX;
    const y = chartY + chartH - ((val - min) / range) * chartH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  // Gradient fill
  ctx.lineTo(chartX + (dataPoints.length - 1) * stepX, chartY + chartH);
  ctx.lineTo(chartX, chartY + chartH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, chartY, 0, chartY + chartH);
  grad.addColorStop(0, (color || '#22c55e') + '40');
  grad.addColorStop(1, (color || '#22c55e') + '00');
  ctx.fillStyle = grad;
  ctx.fill();
  // Dots
  dataPoints.forEach((val, i) => {
    const x = chartX + i * stepX;
    const y = chartY + chartH - ((val - min) / range) * chartH;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 2 * Math.PI);
    ctx.fillStyle = color || '#22c55e';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  // Labels
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '9px Inter, sans-serif';
  ctx.textAlign = 'center';
  labels.forEach((l, i) => ctx.fillText(l, chartX + i * stepX, canvas.offsetHeight - 5));
}

// ── LIVE CLOCK ──────────────────────────────────────────────────
function startLiveClock(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  function tick() {
    const now = new Date();
    const date = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (el) el.textContent = `${date} — ${time}`;
  }
  tick();
  setInterval(tick, 1000);
}

// ── EXAM COUNTDOWN ──────────────────────────────────────────────
function startExamCountdown(elId, targetDate) {
  const el = document.getElementById(elId);
  if (!el) return;
  function tick() {
    const now = new Date();
    const target = new Date(targetDate);
    const diff = target - now;
    if (diff <= 0) { el.textContent = 'Exams have started!'; return; }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    el.textContent = `${days} Days ${hours}h left`;
  }
  tick();
  setInterval(tick, 1000 * 60);
}

// ── STUDENT PORTAL ───────────────────────────────────────────────

function initStudentPortal() {
  if (!window.location.pathname.includes('student-dashboard')) return;

  // Live clock
  startLiveClock('greetingDate');

  // Exam countdown
  startExamCountdown('examValue', '2026-06-09T08:00:00');

  // Stats counters
  const observerStats = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const gpa = document.getElementById('gpaValue');
        const att = document.getElementById('attendanceValue');
        if (gpa) animateCounter(gpa, 3.75, '', 1200);
        if (att) animateCounter(att, 94, '%', 1000);
        observerStats.unobserve(e.target);
      }
    });
  }, { threshold: 0.3 });
  document.querySelectorAll('.stat-card').forEach(c => observerStats.observe(c));

  // Load results
  loadStudentResults();
  // Load announcements
  loadAnnouncementsList('announcementsList', MOCK_ANNOUNCEMENTS);
  // Init charts
  initStudentCharts();
  // Profile
  initProfileDropdown();
}

function loadStudentResults() {
  // Try API, fallback to mock based on current user
  const user = getUser();
  const myResults = user
    ? MOCK_STUDENTS.slice(0, 1).map(s => ({
        name: s.firstName + ' ' + s.lastName,
        subjects: MOCK_RESULTS.filter(r => r.admissionNo === s.admissionNo || r.class === s.class).slice(0, 6)
      }))
    : [{ name: 'Student', subjects: MOCK_RESULTS.slice(0, 6) }];

  const tbody = document.getElementById('resultsTable');
  if (!tbody) return;
  tbody.innerHTML = myResults[0].subjects.map(r => `
    <tr>
      <td>${r.subject}</td>
      <td>${r.score}/100</td>
      <td>${getGradeBadge(r.score)}</td>
      <td>#${r.position} / ${r.classAvg} avg</td>
    </tr>
  `).join('');
}

function loadAnnouncementsList(elId, data) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = data.slice(0, 3).map(a => `
    <div class="glass-card-body" style="padding:16px;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:var(--radius);">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px;">
        <span style="font-weight:600;font-size:0.85rem;">${a.title}</span>
        <span class="badge badge-accent" style="font-size:0.6rem;">${a.category}</span>
      </div>
      <p style="font-size:0.75rem;color:rgba(255,255,255,0.4);">${formatDate(a.createdAt)}</p>
      <p style="font-size:0.8rem;color:rgba(255,255,255,0.6);margin-top:6px;">${a.content.substring(0, 80)}...</p>
    </div>
  `).join('');
}

function initStudentCharts() {
  drawLineChart('gpaChart', ['T1', 'T2', 'T3', 'T4'], [3.2, 3.4, 3.6, 3.75], '#22c55e');
  drawDonutChart('attChart', [94, 6], ['#22c55e', '#ef4444'], ['Present', 'Absent']);
}

// canvas charts will be rendered only if canvas elements exist in HTML
// Add to HTML: #gpaChart, #attChart in student dashboard

function initProfileDropdown() {
  const avatar = document.getElementById('userAvatar');
  if (!avatar) return;
  avatar.addEventListener('click', () => {
    showToast('Profile settings coming soon', 'info');
  });
}

// ── TEACHER PORTAL ──────────────────────────────────────────────

function initTeacherPortal() {
  if (!window.location.pathname.includes('teacher-dashboard')) return;

  startLiveClock('greetingDate');

  loadTeacherClasses();
  loadTeacherSubmissions();
  initTeacherCharts();
  initMarksEntry();
}

function loadTeacherClasses() {
  const tbody = document.getElementById('classPerfTable');
  if (!tbody) return;
  tbody.innerHTML = MOCK_CLASSES.map(c => `
    <tr>
      <td>${c.name}</td>
      <td>${c.subject}</td>
      <td>${c.avgScore}%</td>
      <td>${getStatusBadge(c.passRate >= 75 ? 'paid' : 'pending')}</td>
      <td><span style="color:${c.trend >= 0 ? 'var(--success)' : 'var(--danger)'};">${c.trend >= 0 ? '↑' : '↓'} ${Math.abs(c.trend)}%</span></td>
    </tr>
  `).join('');
}

function loadTeacherSubmissions() {
  const tbody = document.getElementById('submissionsTable');
  if (!tbody) return;
  const subs = [
    { student: 'Achan Sarah', class: 'S.4 Physics', status: 'Submitted' },
    { student: 'Mwesigye John', class: 'S.5 Physics', status: 'Pending' },
    { student: 'Nakato Faith', class: 'S.4 Chemistry', status: 'Submitted' },
    { student: 'Okello Peter', class: 'S.6 Biology', status: 'Late' },
    { student: 'Amumpire Grace', class: 'S.3 Math', status: 'Submitted' },
  ];
  tbody.innerHTML = subs.map(s => `
    <tr>
      <td>${s.student}</td>
      <td>${s.class}</td>
      <td>${getStatusBadge(s.status.toLowerCase())}</td>
    </tr>
  `).join('');
}

function initTeacherCharts() {
  const canvas = document.getElementById('classPerfChart');
  if (canvas) {
    const labels = MOCK_CLASSES.map(c => c.name.split(' ')[1]);
    const scores = MOCK_CLASSES.map(c => c.avgScore);
    drawBarChart('classPerfChart', labels, scores, ['#22c55e', '#16a34a', '#15803d', '#fbbf24', '#f59e0b', '#a3e635', '#84cc16', '#22c55e']);
  }
}

function initMarksEntry() {
  const modal = document.getElementById('marksModal');
  if (!modal) return;

  // When marks form submitted
  const form = document.getElementById('marksForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      showToast('Marks submitted successfully!', 'success');
      closeModal('marksModal');
      form.reset();
    });
  }

  // Live search for student
  const searchInput = document.getElementById('marksSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.marks-student-row').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }

  // Class change updates student list
  const classSelect = document.getElementById('marksClass');
  if (classSelect) {
    classSelect.addEventListener('change', (e) => {
      const cls = e.target.value;
      const students = MOCK_STUDENTS.filter(s => s.class === cls).slice(0, 10);
      const tbody = document.getElementById('marksStudentList');
      if (tbody) {
        tbody.innerHTML = students.map(s => `
          <tr class="marks-student-row">
            <td>${s.admissionNo}</td>
            <td>${s.firstName} ${s.lastName}</td>
            <td>${s.class}</td>
            <td><input type="number" min="0" max="100" class="form-input" style="width:80px;" name="score_${s.id}" placeholder="男"></td>
          </tr>
        `).join('');
      }
    });
  }
}

function openMarksModal() {
  openModal('marksModal');
  // Reset/populate class select
  const sel = document.getElementById('marksClass');
  if (sel) sel.value = '';
  const tbody = document.getElementById('marksStudentList');
  if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:rgba(255,255,255,0.4);">Select a class to load students</td></tr>';
}

function initUploadNotes() {
  const input = document.getElementById('notesUploadInput');
  if (!input) return;
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    showToast(`Uploading ${file.name}...`, 'info');
    const progressBar = document.getElementById('uploadProgress');
    if (progressBar) {
      progressBar.style.display = 'block';
      for (let p = 0; p <= 100; p += 10) {
        await new Promise(r => setTimeout(r, 150));
        progressBar.querySelector('.progress-fill').style.width = p + '%';
      }
    }
    showToast(`Notes uploaded: ${file.name}`, 'success');
    if (progressBar) progressBar.style.display = 'none';
  });
}

function openAnnouncementModal() {
  openModal('announcementModal');
}

function submitAnnouncement(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());
  showToast('Announcement posted!', 'success');
  closeModal('announcementModal');
  form.reset();
}

function createExam(e) {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  showToast(`Exam "${data.examName}" created!`, 'success');
  closeModal('examModal');
  form.reset();
}

// ── ADMIN PORTAL ────────────────────────────────────────────────

function initAdminPortal() {
  if (!window.location.pathname.includes('admin-dashboard')) return;

  startLiveClock('adminClock');

  loadAdminStats();
  loadAdminOverview();
  loadSectionStudents();
  loadSectionTeachers();
  loadSectionFees();
  loadSectionAttendance();
  loadSectionAnnouncements();
  loadSectionNews();
  loadSectionAdmissions();

  initAdminCharts();

  // Search handlers
  document.querySelectorAll('.admin-search-input').forEach(input => {
    input.addEventListener('input', debounce((e) => {
      filterTable(e.target.dataset.table, e.target.id);
    }, 300));
  });
}

function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

function loadAdminStats() {
  animateCounter(document.getElementById('totalStudents'), 248, '+', 1500);
  animateCounter(document.getElementById('totalTeachers'), 12, '+', 1200);
  animateCounter(document.getElementById('newAdmissions'), 18, '+', 1000);
  try {
    document.getElementById('feeCollection').textContent = 'UGX 142.4M';
    document.getElementById('pendingFees').textContent = 'UGX 8.2M';
    animateCounter(document.getElementById('publishedNews'), 24, '+', 800);
  } catch {}
}

function loadAdminOverview() {
  loadActivityTable();
  loadUsersOverview();
  loadOverviewAnnouncements();
  loadOverviewNews();
}

function loadActivityTable() {
  const tbody = document.getElementById('activityTable');
  if (!tbody) return;
  tbody.innerHTML = MOCK_ACTIVITY.map(a => `
    <tr>
      <td>${a.user}</td>
      <td>${a.action}</td>
      <td>${a.entity}</td>
      <td>${a.time}</td>
    </tr>
  `).join('');
}

function loadUsersOverview() {
  const studentCount = MOCK_STUDENTS.length;
  const teacherCount = MOCK_TEACHERS.length;
  document.getElementById('studentCount').textContent = studentCount;
  document.getElementById('teacherCount').textContent = teacherCount;

  const tbody = document.getElementById('recentUsersTable');
  if (!tbody) return;
  const combined = [...MOCK_STUDENTS.slice(0, 3).map(s => ({ name: s.firstName + ' ' + s.lastName, role: 'Student' })),
    ...MOCK_TEACHERS.slice(0, 2).map(t => ({ name: t.firstName + ' ' + t.lastName, role: 'Teacher' }))];
  tbody.innerHTML = combined.map(u => `<tr><td>${u.name}</td><td>${u.role}</td></tr>`).join('');
}

function loadOverviewAnnouncements() {
  loadAnnouncementsList('overviewAnnouncementsList', MOCK_ANNOUNCEMENTS);
}

function loadOverviewNews() {
  const el = document.getElementById('overviewNewsList');
  if (!el) return;
  el.innerHTML = MOCK_NEWS.slice(0, 3).map(n => `
    <div style="padding:12px;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:var(--radius);">
      <p style="font-weight:600;font-size:0.8rem;">${n.title}</p>
      <p style="font-size:0.7rem;color:rgba(255,255,255,0.4);margin-top:4px;">${formatDate(n.createdAt)}</p>
    </div>
  `).join('');
}

// SECTION NAVIGATION
function showSection(section) {
  document.querySelectorAll('.section-panel').forEach(p => p.style.display = 'none');
  const el = document.getElementById('section-' + section);
  if (el) el.style.display = 'block';
  document.querySelectorAll('.admin-nav-item').forEach(a => a.classList.remove('active'));
  document.querySelectorAll(`.admin-nav-item[onclick*="${section}"]`).forEach(a => a.classList.add('active'));
  window.scrollTo(0, 0);
}

// STUDENTS
function loadSectionStudents() {
  renderStudentsTable(MOCK_STUDENTS);
}

function renderStudentsTable(students) {
  const tbody = document.getElementById('studentsTable');
  if (!tbody) return;
  tbody.innerHTML = students.map(s => `
    <tr>
      <td>${s.admissionNo}</td>
      <td>${s.firstName} ${s.lastName}</td>
      <td>${s.class}</td>
      <td>${s.stream}</td>
      <td>${s.gender === 'M' ? 'Male' : 'Female'}</td>
      <td>${s.phone}</td>
      <td>${s.email}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button onclick="editStudent(${s.id})" style="padding:4px 10px;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:8px;font-size:0.7rem;color:rgba(255,255,255,0.7);cursor:pointer;">Edit</button>
          <button onclick="deleteStudent(${s.id})" style="padding:4px 10px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);border-radius:8px;font-size:0.7rem;color:var(--danger);cursor:pointer;">Del</button>
        </div>
      </td>
    </tr>
  `).join('');
  paginateTable('studentsTable', 20);
}

function openStudentModal(id = null) {
  openModal('studentModal');
  const form = document.getElementById('studentForm');
  if (form) form.reset();
  if (id) {
    const s = MOCK_STUDENTS.find(x => x.id === id);
    if (s) {
      document.getElementById('studentId').value = s.id;
      document.getElementById('studentFirstName').value = s.firstName;
      document.getElementById('studentLastName').value = s.lastName;
      document.getElementById('studentEmail').value = s.email || '';
      document.getElementById('studentUsername').value = s.admissionNo;
    }
  }
}

function handleStudentSubmit(e) {
  e.preventDefault();
  const form = e.target;
  showToast('Student saved!', 'success');
  closeModal('studentModal');
  form.reset();
}

function editStudent(id) {
  openStudentModal(id);
  showToast('Editing student record', 'info');
}

function deleteStudent(id) {
  if (confirm('Delete this student? This cannot be undone.')) {
    showToast('Student deleted', 'warning');
    loadSectionStudents();
  }
}

function searchStudents(q) {
  const filtered = MOCK_STUDENTS.filter(s =>
    `${s.firstName} ${s.lastName} ${s.admissionNo} ${s.class}`.toLowerCase().includes(q.toLowerCase())
  );
  renderStudentsTable(filtered);
}

// TEACHERS
function loadSectionTeachers() {
  renderTeachersTable(MOCK_TEACHERS);
}

function renderTeachersTable(teachers) {
  const tbody = document.getElementById('teachersTable');
  if (!tbody) return;
  tbody.innerHTML = teachers.map(t => `
    <tr>
      <td>${t.firstName} ${t.lastName}</td>
      <td>${t.email}</td>
      <td>${t.phone}</td>
      <td>${t.gender === 'M' ? 'Male' : 'Female'}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button onclick="editTeacher(${t.id})" style="padding:4px 10px;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:8px;font-size:0.7rem;color:rgba(255,255,255,0.7);cursor:pointer;">Edit</button>
          <button onclick="deleteTeacher(${t.id})" style="padding:4px 10px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);border-radius:8px;font-size:0.7rem;color:var(--danger);cursor:pointer;">Del</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openTeacherModal(id = null) {
  openModal('teacherModal');
  const form = document.getElementById('teacherForm');
  if (form) form.reset();
}

function handleTeacherSubmit(e) {
  e.preventDefault();
  showToast('Teacher saved!', 'success');
  closeModal('teacherModal');
}

function editTeacher(id) { openTeacherModal(id); showToast('Editing teacher record', 'info'); }
function deleteTeacher(id) { if (confirm('Delete this teacher?')) { showToast('Teacher deleted', 'warning'); loadSectionTeachers(); } }

function searchTeachers(q) {
  const filtered = MOCK_TEACHERS.filter(t => `${t.firstName} ${t.lastName} ${t.email}`.toLowerCase().includes(q.toLowerCase()));
  renderTeachersTable(filtered);
}

// FEES
function loadSectionFees() {
  renderFeesTable(MOCK_FEES);
}

function renderFeesTable(fees) {
  const tbody = document.getElementById('feesTable');
  if (!tbody) return;
  tbody.innerHTML = fees.map(f => `
    <tr>
      <td>${f.student}</td>
      <td>${f.class}</td>
      <td>${formatUGX(f.amount)}</td>
      <td>${getStatusBadge(f.status)}</td>
      <td>${formatDate(f.dueDate)}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button onclick="markFeePaid(${f.id})" style="padding:4px 10px;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);border-radius:8px;font-size:0.7rem;color:var(--success cursor:pointer;">Paid</button>
          <button onclick="deleteFee(${f.id})" style="padding:4px 10px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);border-radius:8px;font-size:0.7rem;color:var(--danger);cursor:pointer;">Del</button>
        </div>
      </td>
    </tr>
  `).join('');
  paginateTable('feesTable', 20);
}

function markFeePaid(id) {
  showToast('Fee marked as paid!', 'success');
  loadSectionFees();
}

function deleteFee(id) { if (confirm('Delete fee record?')) { showToast('Deleted', 'warning'); loadSectionFees(); } }

function handleFeeSubmit(e) {
  e.preventDefault();
  showToast('Fee record created!', 'success');
  closeModal('feeModal');
}

// ATTENDANCE
function loadSectionAttendance() {
  renderAttendanceTable(MOCK_ATTENDANCE);
}

function renderAttendanceTable(records) {
  const tbody = document.getElementById('attendanceTable');
  if (!tbody) return;
  tbody.innerHTML = records.map(r => `
    <tr>
      <td>${r.student}</td>
      <td>${r.class}</td>
      <td>${formatDate(r.date)}</td>
      <td>${getStatusBadge(r.status)}</td>
      <td><button onclick="editAttendance('${r.student}')" style="padding:4px 10px;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:8px;font-size:0.7rem;color:rgba(255,255,255,0.7);cursor:pointer;">Edit</button></td>
    </tr>
  `).join('');
}

function editAttendance(student) { showToast(`Editing attendance for ${student}`, 'info'); }

function filterAttendanceByDate() {
  const input = document.getElementById('attendanceDate');
  if (!input) return;
  const filtered = MOCK_ATTENDANCE.filter(r => r.date === input.value);
  renderAttendanceTable(filtered.length ? filtered : MOCK_ATTENDANCE);
}

// ANNOUNCEMENTS (admin)
function loadSectionAnnouncements() {
  renderAnnouncementsAdmin('announcementsList', MOCK_ANNOUNCEMENTS);
}

function renderAnnouncementsAdmin(elId, data) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = data.map(a => `
    <div style="padding:16px;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:var(--radius);margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
        <div>
          <p style="font-weight:700;font-size:0.95rem;">${a.title}</p>
          <p style="font-size:0.75rem;color:rgba(255,255,255,0.4);margin-top:2px;">By ${a.author} · ${formatDate(a.createdAt)}</p>
        </div>
        <div style="display:flex;gap:6px;">
          <button onclick="editAnnouncement(${a.id})" style="padding:4px 10px;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:8px;font-size:0.7rem;color:rgba(255,255,255,0.7);cursor:pointer;">Edit</button>
          <button onclick="deleteAnnouncement(${a.id})" style="padding:4px 10px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);border-radius:8px;font-size:0.7rem;color:var(--danger);cursor:pointer;">Del</button>
        </div>
      </div>
      <p style="font-size:0.85rem;color:rgba(255,255,255,0.6);">${a.content}</p>
      <span class="badge badge-accent" style="margin-top:8px;">${a.category}</span>
    </div>
  `).join('');
}

function handleAnnouncementSubmit(e) {
  e.preventDefault();
  showToast('Announcement published!', 'success');
  closeModal('announcementModal');
}

function editAnnouncement(id) { showToast('Editing announcement...', 'info'); openModal('announcementModal'); }
function deleteAnnouncement(id) { if (confirm('Delete this announcement?')) { showToast('Deleted', 'warning'); loadSectionAnnouncements(); } }

// NEWS (admin)
function loadSectionNews() {
  renderNewsAdmin('newsList', MOCK_NEWS);
}

function renderNewsAdmin(elId, data) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = data.map(n => `
    <div style="padding:16px;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:var(--radius);">
      <img src="${n.image}" alt="${n.title}" style="width:100%;height:120px;object-fit:cover;border-radius:8px;margin-bottom:10px;">
      <h4 style="font-weight:700;font-size:0.95rem;">${n.title}</h4>
      <p style="font-size:0.8rem;color:rgba(255,255,255,0.5);margin-top:4px;">${formatDate(n.createdAt)}</p>
      <p style="font-size:0.85rem;color:rgba(255,255,255,0.6);margin-top:6px;">${n.content.substring(0, 100)}...</p>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button onclick="editNews(${n.id})" style="padding:4px 10px;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:8px;font-size:0.7rem;color:rgba(255,255,255,0.7);cursor:pointer;">Edit</button>
        <button onclick="deleteNews(${n.id})" style="padding:4px 10px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);border-radius:8px;font-size:0.7rem;color:var(--danger);cursor:pointer;">Del</button>
      </div>
    </div>
  `).join('');
}

function handleNewsSubmit(e) {
  e.preventDefault();
  showToast('News article published!', 'success');
  closeModal('newsModal');
}
function editNews(id) { showToast('Editing news...', 'info'); openModal('newsModal'); }
function deleteNews(id) { if (confirm('Delete this news article?')) { showToast('Deleted', 'warning'); loadSectionNews(); } }

// ADMISSIONS
function loadSectionAdmissions() {
  renderAdmissionsTable(MOCK_ADMISSIONS);
}

function renderAdmissionsTable(apps) {
  const tbody = document.getElementById('admissionsTable');
  if (!tbody) return;
  tbody.innerHTML = apps.map(a => `
    <tr>
      <td>${a.appNo}</td>
      <td>${a.studentName}</td>
      <td>${a.class}</td>
      <td>${getStatusBadge(a.status)}</td>
      <td>${formatDate(a.dateApplied)}</td>
      <td>
        <div style="display:flex;gap:6px;">
          ${a.status === 'pending' ? `<button onclick="acceptAdmission(${a.id})" style="padding:4px 10px;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);border-radius:8px;font-size:0.7rem;color:var(--success);cursor:pointer;">Accept</button><button onclick="rejectAdmission(${a.id})" style="padding:4px 10px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);border-radius:8px;font-size:0.7rem;color:var(--danger);cursor:pointer;">Reject</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

function acceptAdmission(id) {
  showToast('Application accepted!', 'success');
  loadSectionAdmissions();
}

function rejectAdmission(id) {
  showToast('Application rejected', 'warning');
  loadSectionAdmissions();
}

// ADMIN CHARTS
function initAdminCharts() {
  const canvas = document.getElementById('enrollmentChart');
  if (canvas) drawBarChart('enrollmentChart',
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    [220, 235, 242, 248, 252, 260],
    ['#22c55e', '#16a34a', '#15803d', '#22c55e', '#fbbf24', '#22c55e']
  );

  const donut = document.getElementById('feeDonut');
  if (donut) drawDonutChart('feeDonut', [142400000, 8200000], ['#22c55e', '#ef4444'], ['Collected', 'Pending']);

  const resultsBar = document.getElementById('resultsDistChart');
  if (resultsBar) drawBarChart('resultsDistChart',
    ['A+', 'A', 'B+', 'B', 'C', 'D', 'F'],
    [42, 68, 55, 48, 35, 18, 12],
    ['#22c55e', '#16a34a', '#fbbf24', '#f59e0b', '#a3e635', '#ef4444', '#dc2626']
  );
}

// ── TIMETABLE MODAL ─────────────────────────────────────────────
function openTimetableModal() {
  openModal('timetableModal');
  renderTimetable();
}

const TIMETABLE = {
  monday: [
    { time: '7:00-8:00', subject: 'Mathematics', teacher: 'Beatrice N.' },
    { time: '8:00-9:00', subject: 'English', teacher: 'Hadija K.' },
    { time: '9:00-10:00', subject: 'Physics', teacher: 'Charles M.' },
    { time: '10:00-10:30', subject: 'BREAK', teacher: '' },
    { time: '10:30-11:30', subject: 'Chemistry', teacher: 'Grace N.' },
    { time: '11:30-12:30', subject: 'History', teacher: 'John K.' },
    { time: '12:30-1:30', subject: 'LUNCH', teacher: '' },
    { time: '1:30-2:30', subject: 'Biology', teacher: 'Fred S.' },
    { time: '2:30-3:30', subject: 'Geography', teacher: 'Agnes N.' },
  ],
  tuesday: [
    { time: '7:00-8:00', subject: 'Physics', teacher: 'Charles M.' },
    { time: '8:00-9:00', subject: 'Mathematics', teacher: 'Beatrice N.' },
    { time: '9:00-10:00', subject: 'English Lit', teacher: 'Hadija K.' },
    { time: '10:00-10:30', subject: 'BREAK', teacher: '' },
    { time: '10:30-11:30', subject: 'ICT', teacher: 'Sam N.' },
    { time: '11:30-12:30', subject: 'Chemistry', teacher: 'Grace N.' },
    { time: '12:30-1:30', subject: 'LUNCH', teacher: '' },
    { time: '1:30-2:30', subject: 'CRE', teacher: 'John K.' },
    { time: '2:30-3:30', subject: 'Sports', teacher: '' },
  ],
  wednesday: [
    { time: '7:00-8:00', subject: 'Chemistry', teacher: 'Grace N.' },
    { time: '8:00-9:00', subject: 'Mathematics', teacher: 'Beatrice N.' },
    { time: '9:00-10:00', subject: 'Biology', teacher: 'Fred S.' },
    { time: '10:00-10:30', subject: 'BREAK', teacher: '' },
    { time: '10:30-11:30', subject: 'English', teacher: 'Hadija K.' },
    { time: '11:30-12:30', subject: 'Geography', teacher: 'Agnes N.' },
    { time: '12:30-1:30', subject: 'LUNCH', teacher: '' },
    { time: '1:30-2:30', subject: 'Agriculture', teacher: 'Miriam A.' },
    { time: '2:30-3:30', subject: 'Club Activity', teacher: '' },
  ],
  thursday: [
    { time: '7:00-8:00', subject: 'Biology', teacher: 'Fred S.' },
    { time: '8:00-9:00', subject: 'Physics', teacher: 'Charles M.' },
    { time: '9:00-10:00', subject: 'Mathematics', teacher: 'Beatrice N.' },
    { time: '10:00-10:30', subject: 'BREAK', teacher: '' },
    { time: '10:30-11:30', subject: 'English', teacher: 'Hadija K.' },
    { time: '11:30-12:30', subject: 'History', teacher: 'John K.' },
    { time: '12:30-1:30', subject: 'LUNCH', teacher: '' },
    { time: '1:30-2:30', subject: 'Fine Art', teacher: 'Robert K.' },
    { time: '2:30-3:30', subject: 'Music', teacher: '' },
  ],
  friday: [
    { time: '7:00-8:00', subject: 'Mathematics', teacher: 'Beatrice N.' },
    { time: '8:00-9:00', subject: 'Chemistry', teacher: 'Grace N.' },
    { time: '9:00-10:00', subject: 'Physics', teacher: 'Sylvia N.' },
    { time: '10:00-10:30', subject: 'BREAK', teacher: '' },
    { time: '10:30-11:30', subject: 'Biology', teacher: 'Fred S.' },
    { time: '11:30-12:30', subject: 'Assembly', teacher: '' },
    { time: '12:30-1:30', subject: 'LUNCH', teacher: '' },
    { time: '1:30-2:30', subject: 'Revision', teacher: '' },
  ],
};

function renderTimetable() {
  const container = document.getElementById('timetableContent');
  if (!container) return;
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  container.innerHTML = `
    <div style="display:flex;gap:4px;overflow-x:auto;">
      ${days.map((day, idx) => `
        <div style="min-width:160px;flex:1;">
          <div style="text-align:center;padding:8px;background:linear-gradient(135deg,var(--accent),var(--accent-2));border-radius:8px 8px 0 0;font-weight:700;font-size:0.85rem;">${dayNames[idx]}</div>
          <div style="display:flex;flex-direction:column;gap:4px;padding:8px;background:var(--glass-bg);border:1px solid var(--glass-border);border-top:none;border-radius:0 0 8px 8px;">
            ${TIMETABLE[day].map(slot => `
              <div style="padding:8px;background:${slot.subject === 'BREAK' || slot.subject === 'LUNCH' || slot.subject === 'Sports' || slot.subject === 'Club Activity' || slot.subject === 'Assembly' || slot.subject === 'Revision' ? 'rgba(251,191,36,0.1)' : 'rgba(34,197,94,0.08)'};border:1px solid ${slot.subject === 'BREAK' || slot.subject === 'LUNCH' ? 'rgba(251,191,36,0.3)' : 'rgba(34,197,94,0.15)'};border-radius:6px;">
                <p style="font-size:0.65rem;color:var(--gold);font-weight:600;">${slot.time}</p>
                <p style="font-size:0.75rem;font-weight:600;margin-top:2px;color:${slot.subject === 'BREAK' || slot.subject === 'LUNCH' ? 'var(--warning)' : '#fff'};">${slot.subject}</p>
                ${slot.teacher ? `<p style="font-size:0.6rem;color:rgba(255,255,255,0.4);margin-top:1px;">${slot.teacher}</p>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ── MESSAGE COMPOSER MODAL ───────────────────────────────────────
function openMessageModal() {
  openModal('messageModal');
}

function sendMessage(e) {
  e.preventDefault();
  showToast('Message sent!', 'success');
  closeModal('messageModal');
}

// ── REPORT GENERATOR ────────────────────────────────────────────
function generateReport() {
  const user = getUser();
  const name = user ? `${user.firstName} ${user.lastName}` : 'Student';
  const cls = user ? user.studentClass || 'S.4' : 'S.4';
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Report Card - ${name}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; background: #fff; color: #000; }
    h1 { text-align: center; border-bottom: 3px solid #22c55e; padding-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
    th { background: #22c55e; color: #fff; }
    tr:nth-child(even) { background: #f5f5f5; }
    .grade-a { color: #22c55e; font-weight: bold; }
    .grade-b { color: #3b82f6; font-weight: bold; }
    .grade-c { color: #f59e0b; font-weight: bold; }
    .grade-f { color: #ef4444; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Kalinabiri Secondary School</h1>
  <h2>Term 2 Report Card — ${new Date().toLocaleDateString()}</h2>
  <p><strong>Student:</strong> ${name} &nbsp; <strong>Class:</strong> ${cls}</p>
  <table>
    <thead><tr><th>Subject</th><th>Score</th><th>Grade</th><th>Position</th></tr></thead>
    <tbody>
      <tr><td>Mathematics</td><td>87/100</td><td class="grade-a">A</td><td>#3/45</td></tr>
      <tr><td>English</td><td>82/100</td><td class="grade-a">A-</td><td>#5/45</td></tr>
      <tr><td>Physics</td><td>78/100</td><td class="grade-b">B+</td><td>#8/45</td></tr>
      <tr><td>Chemistry</td><td>75/100</td><td class="grade-b">B</td><td>#12/45</td></tr>
      <tr><td>History</td><td>91/100</td><td class="grade-a">A+</td><td>#1/45</td></tr>
      <tr><td>Geography</td><td>73/100</td><td class="grade-b">B</td><td>#7/45</td></tr>
    </tbody>
  </table>
  <p style="margin-top:20px;"><strong>Term GPA:</strong> 3.75 &nbsp; <strong>Class Avg:</strong> 72%</p>
  <p style="margin-top:20px;text-align:center;font-size:0.8rem;color:#666;">Generated by Kalinabiri SS Portal | ${new Date().toLocaleString()}</p>
</body>
</html>`;
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  showToast('Report generated!', 'success');
}

// ── INIT ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initStudentPortal();
  initTeacherPortal();
  initAdminPortal();

  // Close modals on backdrop click
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeAllModals();
    });
  });

  // Escape key closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
  });

  // Form submissions
  document.querySelectorAll('form').forEach(form => {
    const modal = form.closest('.modal-overlay');
    if (form.id === 'studentForm' && modal) form.addEventListener('submit', handleStudentSubmit);
    if (form.id === 'teacherForm' && modal) form.addEventListener('submit', handleTeacherSubmit);
    if (form.id === 'feeForm') form.addEventListener('submit', handleFeeSubmit);
    if (form.id === 'announcementForm') form.addEventListener('submit', handleAnnouncementSubmit);
    if (form.id === 'newsForm') form.addEventListener('submit', handleNewsSubmit);
    if (form.id === 'messageForm') form.addEventListener('submit', sendMessage);
    if (form.id === 'examForm') form.addEventListener('submit', createExam);
    if (form.id === 'marksForm') form.addEventListener('submit', initMarksEntry);
  });
});

// Expose globally
window.showSection = showSection;
window.openModal = openModal;
window.closeModal = closeModal;
window.closeAllModals = closeAllModals;
window.showToast = showToast;
window.apiCall = apiCall;
window.getUser = getUser;
window.logout = logout;
window.animateCounter = animateCounter;
window.paginateTable = paginateTable;
window.filterTable = filterTable;
window.exportTableToCSV = exportTableToCSV;
window.renderStudentsTable = renderStudentsTable;
window.renderTeachersTable = renderTeachersTable;
window.renderFeesTable = renderFeesTable;
window.renderAttendanceTable = renderAttendanceTable;
window.renderAnnouncementsAdmin = renderAnnouncementsAdmin;
window.renderNewsAdmin = renderNewsAdmin;
window.renderAdmissionsTable = renderAdmissionsTable;
window.openStudentModal = openStudentModal;
window.openTeacherModal = openTeacherModal;
window.editStudent = editStudent;
window.deleteStudent = deleteStudent;
window.editTeacher = editTeacher;
window.deleteTeacher = deleteTeacher;
window.markFeePaid = markFeePaid;
window.deleteFee = deleteFee;
window.editAttendance = editAttendance;
window.filterAttendanceByDate = filterAttendanceByDate;
window.editAnnouncement = editAnnouncement;
window.deleteAnnouncement = deleteAnnouncement;
window.editNews = editNews;
window.deleteNews = deleteNews;
window.acceptAdmission = acceptAdmission;
window.rejectAdmission = rejectAdmission;
window.openTimetableModal = openTimetableModal;
window.openMessageModal = openMessageModal;
window.openMarksModal = openMarksModal;
window.initUploadNotes = initUploadNotes;
window.submitAnnouncement = submitAnnouncement;
window.createExam = createExam;
window.generateReport = generateReport;
window.searchStudents = searchStudents;
window.searchTeachers = searchTeachers;
window.formatUGX = formatUGX;
window.formatDate = formatDate;
window.getGradeBadge = getGradeBadge;
window.getStatusBadge = getStatusBadge;
