/**
 * api.js - Shared API client for all Kalinabiri SS dashboards
 * Provides consistent API base URL, token handling, and request methods
 */

(function() {
  'use strict';

  // ─── Configuration ───────────────────────────────────────
  const API_BASE = '/api';
  
  // Single unified token key for all dashboards
  const TOKEN_KEY = 'kalinabiri_token';
  const USER_KEY = 'kalinabiri_user';
  const ROLE_KEY = 'kalinabiri_role';

  // ─── Token Management ────────────────────────────────────
  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  function removeToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ROLE_KEY);
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function getRole() {
    return localStorage.getItem(ROLE_KEY);
  }

  function setRole(role) {
    localStorage.setItem(ROLE_KEY, role);
  }

  function clearAuth() {
    removeToken();
  }

  function isAuthenticated() {
    return !!getToken();
  }

  function hasRole(...roles) {
    const role = getRole();
    return roles.includes(role);
  }

  // ─── Core API Request ────────────────────────────────────
  async function request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const token = getToken();
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    // Don't set Content-Type for FormData
    if (options.body instanceof FormData) {
      delete headers['Content-Type'];
    }

    const url = API_BASE + endpoint;
    const config = {
      ...options,
      headers: { ...headers, ...(options.headers || {}) }
    };

    try {
      const res = await fetch(url, config);
      
      // Handle 401 - token expired
      if (res.status === 401) {
        clearAuth();
        // Don't redirect automatically - let the page handle it
        throw new Error('SESSION_EXPIRED');
      }

      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Request failed');
      }
      
      return data;
    } catch (err) {
      if (err.message === 'SESSION_EXPIRED') {
        throw err;
      }
      // Network or other error
      throw new Error(err.message || 'Network error');
    }
  }

  // ─── Convenience Methods ─────────────────────────────────
  const api = {
    // Configuration
    get API_BASE() { return API_BASE; },
    
    // Auth
    getToken,
    setToken,
    removeToken,
    getUser,
    setUser,
    getRole,
    setRole,
    clearAuth,
    isAuthenticated,
    hasRole,
    
    // Login
    async login(username, password) {
      const data = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      if (data.token) {
        setToken(data.token);
        setUser(data.user);
        setRole(data.user.role);
      }
      return data;
    },
    
    async logout() {
      clearAuth();
    },
    
    // Authenticated user
    async me() {
      return request('/auth/me');
    },
    
    // Generic CRUD
    get: (endpoint) => request(endpoint, { method: 'GET' }),
    post: (endpoint, body) => request(endpoint, { method: 'POST', body: JSON.stringify(body) }),
    put: (endpoint, body) => request(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
    
    // File upload
    async upload(endpoint, formData) {
      return request(endpoint, { method: 'POST', body: formData });
    },
    
    // ─── Specific Endpoints ────────────────────────────────
    
    // Users
    getUsers: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/admin/users' + (q ? '?' + q : ''));
    },
    
    // Students
    getStudents: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/admin/students' + (q ? '?' + q : ''));
    },
    
    // Teachers
    getTeachers: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/admin/teachers' + (q ? '?' + q : ''));
    },
    
    // Parent children
    getMyChildren: () => request('/parent/children'),
    
    // Classes
    getClasses: () => request('/classes'),
    getAdminClasses: () => request('/admin/classes'),
    
    // Subjects
    getSubjects: () => request('/subjects'),
    getAdminSubjects: () => request('/admin/subjects'),
    
    // Attendance
    getAttendance: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/admin/attendance' + (q ? '?' + q : ''));
    },
    getStudentAttendance: () => request('/student/attendance'),
    getChildAttendance: (childId) => request(`/parent/children/${childId}/attendance`),
    
    // Results
    getResults: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/admin/results' + (q ? '?' + q : ''));
    },
    getStudentResults: () => request('/student/results'),
    
    // Fees
    getFees: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/admin/fees' + (q ? '?' + q : ''));
    },
    getStudentFees: () => request('/student/fees'),
    
    // Assignments
    getAssignments: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/admin/assignments' + (q ? '?' + q : ''));
    },
    getStudentAssignments: () => request('/student/assignments'),
    
    // Submissions
    getSubmissions: (assignmentId) => {
      const q = assignmentId ? '?assignment_id=' + assignmentId : '';
      return request('/admin/submissions' + q);
    },
    getStudentSubmissions: () => request('/student/submissions'),
    
    // Announcements
    getAnnouncements: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/announcements' + (q ? '?' + q : ''));
    },
    getAdminAnnouncements: () => request('/admin/announcements'),
    createAnnouncement: (data) => request('/admin/announcements', { method: 'POST', body: JSON.stringify(data) }),
    deleteAnnouncement: (id) => request('/admin/announcements/' + id, { method: 'DELETE' }),
    
    // News
    getNews: () => request('/news'),
    getAdminNews: () => request('/admin/news'),
    
    // Events
    getEvents: () => request('/events'),
    createEvent: (data) => request('/events', { method: 'POST', body: JSON.stringify(data) }),
    
    // Gallery
    getGallery: () => request('/gallery'),
    uploadGallery: (formData) => request('/admin/gallery', { method: 'POST', body: formData }),
    
    // Settings
    getSettings: () => request('/settings'),
    updateSetting: (key, value) => request('/admin/settings', { method: 'PUT', body: JSON.stringify({ key, value }) }),
    
    // Site content
    getSiteContent: () => request('/admin/site-content'),
    updateSiteContent: (page, section, content) => request('/admin/site-content', { method: 'PUT', body: JSON.stringify({ page, section, content }) }),
    
    // Notifications
    getNotifications: (limit = 10) => request('/notifications?limit=' + limit),
    markNotificationRead: (id) => request('/notifications/' + id + '/read', { method: 'PUT' }),
    markAllNotificationsRead: () => request('/notifications/read-all', { method: 'PUT' }),
    
    // Messages (legacy)
    getMessages: () => request('/messages'),
    sendMessage: (receiverId, subject, body) => request('/messages', { method: 'POST', body: JSON.stringify({ receiver_id: receiverId, subject, body }) }),
    
    // Stats
    getAdminStats: () => request('/admin/stats'),
    getStudentStats: () => request('/student/stats'),
    
    // Timetable
    getTimetable: () => request('/student/timetable'),
    getChildTimetable: (childId) => request('/parent/children/' + childId + '/timetable'),
    
    // Communication Center
    getConversations: () => request('/conversations'),
    getConversation: (id) => request('/conversations/' + id),
    createConversation: (data) => request('/conversations', { method: 'POST', body: JSON.stringify(data) }),
    getConversationMessages: (id, limit = 50, before = null) => {
      const q = new URLSearchParams({ limit: limit.toString() });
      if (before) q.append('before', before);
      return request('/conversations/' + id + '/messages?' + q.toString());
    },
    sendConversationMessage: (id, content, options = {}) => request('/conversations/' + id + '/messages', { method: 'POST', body: JSON.stringify({ content, ...options }) }),
    markConversationRead: (id) => request('/conversations/' + id + '/read-all', { method: 'PUT' }),
    addReaction: (messageId, reaction) => request('/messages/' + messageId + '/reactions', { method: 'POST', body: JSON.stringify({ reaction }) }),
    removeReaction: (messageId, reaction) => request('/messages/' + messageId + '/reactions', { method: 'DELETE', body: JSON.stringify({ reaction }) }),
    setTyping: (conversationId, isTyping) => request('/conversations/' + conversationId + '/typing', { method: 'POST', body: JSON.stringify({ is_typing: isTyping }) }),
    
    // Presence
    updatePresence: (status) => request('/presence', { method: 'PUT', body: JSON.stringify({ status }) }),
    getPresence: () => request('/presence'),
    
    // Emergency alerts
    getEmergencyAlerts: () => request('/emergency-alerts'),
    createEmergencyAlert: (data) => request('/emergency-alerts', { method: 'POST', body: JSON.stringify(data) }),
    
    // Directory
    getDirectory: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/directory' + (q ? '?' + q : ''));
    },
    
    // Search
    search: (query, type = null) => {
      const q = new URLSearchParams({ q: query });
      if (type) q.append('type', type);
      return request('/search?' + q.toString());
    },
    
    // Moderation (admin)
    getModerationActions: () => request('/admin/moderation'),
    createModerationAction: (data) => request('/admin/moderation', { method: 'POST', body: JSON.stringify(data) }),
    
    // Audit logs (admin)
    getAuditLogs: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/admin/audit-logs' + (q ? '?' + q : ''));
    },
    
    // Assessments
    getAssessments: () => request('/assessments'),
    createAssessment: (data) => request('/assessments', { method: 'POST', body: JSON.stringify(data) }),
    getAssessmentSubmissions: (id) => request('/assessments/' + id + '/submissions'),
    gradeSubmission: (id, data) => request('/submissions/' + id + '/grade', { method: 'POST', body: JSON.stringify(data) }),
    
    // Teacher endpoints
    getTeacherStudents: (classId) => request('/teacher/students' + (classId ? '?class=' + classId : '')),
    getTeacherMe: () => request('/teacher/me'),
    
    // Student endpoints
    getStudentSubjects: () => request('/student/subjects'),
    getStudentTeachers: () => request('/student/teachers'),
    
    // Admissions
    getAdmissions: (status) => request('/admissions' + (status ? '?status=' + status : '')),
    approveAdmission: (id) => request('/admissions/' + id + '/approve', { method: 'POST' }),
    rejectAdmission: (id) => request('/admissions/' + id + '/reject', { method: 'POST' }),
    
    // User profile
    updateProfile: (data) => request('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
    changePassword: (current, newPassword) => request('/auth/password', { method: 'PUT', body: JSON.stringify({ current_password: current, new_password: newPassword }) }),
    
    // Contact form
    submitContact: (data) => request('/contact', { method: 'POST', body: JSON.stringify(data) }),
    
    // Sync
    syncPull: () => request('/sync/pull'),
    
    // Raw request (for callers that need full control)
    request: (endpoint, options) => request(endpoint, options)
  };

  // ─── Export ──────────────────────────────────────────────
  window.KalinabiriAPI = api;

})();