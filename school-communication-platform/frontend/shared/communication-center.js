/**
 * Communication Center - Shared module for all dashboards
 * Provides real-time messaging, conversations, notifications, and presence
 */

class CommunicationCenter {
  constructor(options = {}) {
    this.apiBase = options.apiBase || '/api';
    this.socket = options.socket || null;
    this.currentUser = options.currentUser || null;
    this.conversations = [];
    this.activeConversation = null;
    this.messages = [];
    this.unreadCount = 0;
    this.typingUsers = new Map();
    this.presence = new Map();
    this.notifications = [];
    this.isInitialized = false;
    
    // Event callbacks
    this.onMessage = options.onMessage || (() => {});
    this.onConversationChange = options.onConversationChange || (() => {});
    this.onNotification = options.onNotification || (() => {});
    this.onPresenceChange = options.onPresenceChange || (() => {});
    this.onTyping = options.onTyping || (() => {});
    this.onError = options.onError || (console.error);
  }

  async init(socket, currentUser) {
    this.socket = socket;
    this.currentUser = currentUser;
    
    if (this.socket) {
      this.setupSocketListeners();
      this.socket.emit('join');
    }
    
    await this.loadConversations();
    await this.loadNotifications();
    await this.loadPresence();
    
    this.isInitialized = true;
    return this;
  }

  setupSocketListeners() {
    this.socket.on('new_message', (message) => {
      this.handleNewMessage(message);
    });
    
    this.socket.on('message_updated', (message) => {
      this.handleMessageUpdated(message);
    });
    
    this.socket.on('message_deleted', (data) => {
      this.handleMessageDeleted(data.id);
    });
    
    this.socket.on('message_reaction_added', (data) => {
      this.handleReactionAdded(data);
    });
    
    this.socket.on('message_reaction_removed', (data) => {
      this.handleReactionRemoved(data);
    });
    
    this.socket.on('message_read', (data) => {
      this.handleMessageRead(data);
    });
    
    this.socket.on('typing', (data) => {
      this.handleTyping(data);
    });
    
    this.socket.on('presence_update', (data) => {
      this.handlePresenceUpdate(data);
    });
    
    this.socket.on('notification', (notification) => {
      this.handleNotification(notification);
    });
    
    this.socket.on('conversation_created', (conversation) => {
      this.conversations.unshift(conversation);
      this.onConversationChange(this.conversations);
    });
    
    this.socket.on('conversation_updated', (conversation) => {
      const idx = this.conversations.findIndex(c => c.id === conversation.id);
      if (idx !== -1) this.conversations[idx] = conversation;
      this.onConversationChange(this.conversations);
    });
    
    this.socket.on('conversation_deleted', (data) => {
      this.conversations = this.conversations.filter(c => c.id !== data.id);
      this.onConversationChange(this.conversations);
    });
    
    this.socket.on('conversation_member_added', (data) => {
      this.handleMemberAdded(data);
    });
    
    this.socket.on('conversation_member_removed', (data) => {
      this.handleMemberRemoved(data);
    });
    
    this.socket.on('emergency_alert', (alert) => {
      this.handleEmergencyAlert(alert);
    });
    
    this.socket.on('moderation_action', (action) => {
      this.handleModerationAction(action);
    });
  }

  // API Methods
  async apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem('kalinabiri_token') || localStorage.getItem('token');
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    };
    
    if (options.body instanceof FormData) {
      delete headers['Content-Type'];
    }
    
    const response = await fetch(`${this.apiBase}${endpoint}`, {
      ...options,
      headers
    });
    
    if (response.status === 401) {
      // Token expired
      localStorage.removeItem('kalinabiri_token');
      localStorage.removeItem('token');
      window.location.href = '/login';
      return null;
    }
    
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'API Error');
    return data;
  }

  // Conversations
  async loadConversations() {
    try {
      const data = await this.apiRequest('/conversations');
      this.conversations = data || [];
      this.onConversationChange(this.conversations);
      return this.conversations;
    } catch (e) {
      this.onError(e);
      return [];
    }
  }

  async createConversation(type, name, description, memberIds) {
    try {
      const data = await this.apiRequest('/conversations', {
        method: 'POST',
        body: JSON.stringify({ type, name, description, member_ids: memberIds })
      });
      return data.conversation;
    } catch (e) {
      this.onError(e);
      throw e;
    }
  }

  async getConversation(id) {
    try {
      return await this.apiRequest(`/conversations/${id}`);
    } catch (e) {
      this.onError(e);
      throw e;
    }
  }

  async updateConversation(id, updates) {
    try {
      const data = await this.apiRequest(`/conversations/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      return data.conversation;
    } catch (e) {
      this.onError(e);
      throw e;
    }
  }

  async addMember(conversationId, userId, role = 'member') {
    try {
      const data = await this.apiRequest(`/conversations/${conversationId}/members`, {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, role })
      });
      return data.member;
    } catch (e) {
      this.onError(e);
      throw e;
    }
  }

  async removeMember(conversationId, userId) {
    try {
      await this.apiRequest(`/conversations/${conversationId}/members/${userId}`, {
        method: 'DELETE'
      });
    } catch (e) {
      this.onError(e);
      throw e;
    }
  }

  // Messages
  async loadMessages(conversationId, limit = 50, before = null) {
    try {
      const params = new URLSearchParams({ limit: limit.toString() });
      if (before) params.append('before', before);
      const data = await this.apiRequest(`/conversations/${conversationId}/messages?${params}`);
      return data || [];
    } catch (e) {
      this.onError(e);
      return [];
    }
  }

  async sendMessage(conversationId, content, options = {}) {
    try {
      const data = await this.apiRequest(`/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content,
          message_type: options.messageType || 'text',
          attachment_url: options.attachmentUrl,
          attachment_name: options.attachmentName,
          attachment_size: options.attachmentSize,
          parent_id: options.parentId
        })
      });
      return data.message;
    } catch (e) {
      this.onError(e);
      throw e;
    }
  }

  async updateMessage(messageId, content) {
    try {
      const data = await this.apiRequest(`/messages/${messageId}`, {
        method: 'PUT',
        body: JSON.stringify({ content })
      });
      return data.message;
    } catch (e) {
      this.onError(e);
      throw e;
    }
  }

  async deleteMessage(messageId) {
    try {
      await this.apiRequest(`/messages/${messageId}`, { method: 'DELETE' });
    } catch (e) {
      this.onError(e);
      throw e;
    }
  }

  // Reactions
  async addReaction(messageId, reaction) {
    try {
      const data = await this.apiRequest(`/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ reaction })
      });
      return data.reaction;
    } catch (e) {
      this.onError(e);
      throw e;
    }
  }

  async removeReaction(messageId, reaction) {
    try {
      await this.apiRequest(`/messages/${messageId}/reactions`, {
        method: 'DELETE',
        body: JSON.stringify({ reaction })
      });
    } catch (e) {
      this.onError(e);
      throw e;
    }
  }

  // Read Receipts
  async markAsRead(messageId) {
    try {
      await this.apiRequest(`/messages/${messageId}/read`, { method: 'POST' });
    } catch (e) {
      this.onError(e);
    }
  }

  async markConversationAsRead(conversationId) {
    try {
      await this.apiRequest(`/conversations/${conversationId}/read-all`, { method: 'POST' });
    } catch (e) {
      this.onError(e);
    }
  }

  // Typing Indicators
  async sendTyping(conversationId, isTyping) {
    try {
      await this.apiRequest(`/conversations/${conversationId}/typing`, {
        method: 'POST',
        body: JSON.stringify({ is_typing: isTyping })
      });
      
      // Also send via socket for immediate effect
      if (this.socket) {
        this.socket.emit('typing', { conversation_id: conversationId, is_typing: isTyping });
      }
    } catch (e) {
      this.onError(e);
    }
  }

  // Presence
  async updatePresence(status) {
    try {
      await this.apiRequest('/presence', {
        method: 'PUT',
        body: JSON.stringify({ status })
      });
      
      if (this.socket) {
        // Presence is broadcasted via socket join/disconnect
      }
    } catch (e) {
      this.onError(e);
    }
  }

  async loadPresence() {
    try {
      const data = await this.apiRequest('/presence');
      this.presence = new Map(data.map(p => [p.user_id, p]));
      this.onPresenceChange(this.presence);
    } catch (e) {
      this.onError(e);
    }
  }

  // Emergency Alerts
  async loadEmergencyAlerts() {
    try {
      return await this.apiRequest('/emergency-alerts');
    } catch (e) {
      this.onError(e);
      return [];
    }
  }

  async sendEmergencyAlert(title, message, options = {}) {
    try {
      const data = await this.apiRequest('/emergency-alerts', {
        method: 'POST',
        body: JSON.stringify({
          title,
          message,
          severity: options.severity || 'high',
          target_audience: options.targetAudience,
          target_class: options.targetClass,
          expires_at: options.expiresAt
        })
      });
      return data.alert;
    } catch (e) {
      this.onError(e);
      throw e;
    }
  }

  // Search
  async search(query, type = null) {
    try {
      const params = new URLSearchParams({ q: query });
      if (type) params.append('type', type);
      return await this.apiRequest(`/search?${params}`);
    } catch (e) {
      this.onError(e);
      return { users: [], conversations: [], messages: [] };
    }
  }

  // User Directory
  async loadDirectory(role = null, className = null) {
    try {
      const params = new URLSearchParams();
      if (role) params.append('role', role);
      if (className) params.append('class', className);
      return await this.apiRequest(`/directory?${params}`);
    } catch (e) {
      this.onError(e);
      return [];
    }
  }

  // Notifications
  async loadNotifications() {
    try {
      const data = await this.apiRequest('/notifications');
      this.notifications = data || [];
      this.unreadCount = this.notifications.filter(n => !n.is_read).length;
      this.onNotification(this.notifications);
      return this.notifications;
    } catch (e) {
      this.onError(e);
      return [];
    }
  }

  async markNotificationRead(id) {
    try {
      await this.apiRequest(`/notifications/${id}/read`, { method: 'PUT' });
      const notif = this.notifications.find(n => n.id === id);
      if (notif) {
        notif.is_read = true;
        this.unreadCount = Math.max(0, this.unreadCount - 1);
        this.onNotification(this.notifications);
      }
    } catch (e) {
      this.onError(e);
    }
  }

  async markAllNotificationsRead() {
    try {
      await this.apiRequest('/notifications/read-all', { method: 'PUT' });
      this.notifications.forEach(n => n.is_read = true);
      this.unreadCount = 0;
      this.onNotification(this.notifications);
    } catch (e) {
      this.onError(e);
    }
  }

  // Moderation (admin only)
  async loadModerationActions() {
    try {
      return await this.apiRequest('/admin/moderation');
    } catch (e) {
      this.onError(e);
      return [];
    }
  }

  async createModerationAction(actionType, targetUserId, targetMessageId, reason, expiresAt) {
    try {
      const data = await this.apiRequest('/admin/moderation', {
        method: 'POST',
        body: JSON.stringify({ action_type: actionType, target_user_id: targetUserId, target_message_id: targetMessageId, reason, expires_at: expiresAt })
      });
      return data.action;
    } catch (e) {
      this.onError(e);
      throw e;
    }
  }

  // Audit Logs (admin only)
  async loadAuditLogs(options = {}) {
    try {
      const params = new URLSearchParams();
      if (options.limit) params.append('limit', options.limit);
      if (options.userId) params.append('user_id', options.userId);
      if (options.action) params.append('action', options.action);
      return await this.apiRequest(`/admin/audit-logs?${params}`);
    } catch (e) {
      this.onError(e);
      return [];
    }
  }

  // Socket Event Handlers
  handleNewMessage(message) {
    if (this.activeConversation && this.activeConversation.id === message.conversation_id) {
      this.messages.push(message);
      this.onMessage(message);
    }
    
    // Update conversation list
    const conv = this.conversations.find(c => c.id === message.conversation_id);
    if (conv) {
      conv.last_message_at = message.created_at;
      conv.message_count = (conv.message_count || 0) + 1;
      // Move to top
      this.conversations = [conv, ...this.conversations.filter(c => c.id !== conv.id)];
      this.onConversationChange(this.conversations);
    }
  }

  handleMessageUpdated(message) {
    const idx = this.messages.findIndex(m => m.id === message.id);
    if (idx !== -1) {
      this.messages[idx] = message;
      this.onMessage(message);
    }
  }

  handleMessageDeleted(messageId) {
    this.messages = this.messages.filter(m => m.id !== messageId);
    this.onMessage({ id: messageId, deleted: true });
  }

  handleReactionAdded(data) {
    const msg = this.messages.find(m => m.id === data.message_id);
    if (msg) {
      if (!msg.reactions) msg.reactions = [];
      msg.reactions.push(data);
      this.onMessage(msg);
    }
  }

  handleReactionRemoved(data) {
    const msg = this.messages.find(m => m.id === data.message_id);
    if (msg && msg.reactions) {
      msg.reactions = msg.reactions.filter(r => !(r.user_id === data.user_id && r.reaction === data.reaction));
      this.onMessage(msg);
    }
  }

  handleMessageRead(data) {
    const msg = this.messages.find(m => m.id === data.message_id);
    if (msg) {
      msg.read_count = (msg.read_count || 0) + 1;
      this.onMessage(msg);
    }
  }

  handleTyping(data) {
    if (data.user_id === this.currentUser?.id) return;
    
    if (data.is_typing) {
      this.typingUsers.set(data.conversation_id, {
        ...(this.typingUsers.get(data.conversation_id) || { users: [] }),
        users: [...new Set([...(this.typingUsers.get(data.conversation_id)?.users || []), data.user_id])]
      });
    } else {
      const typing = this.typingUsers.get(data.conversation_id);
      if (typing) {
        typing.users = typing.users.filter(id => id !== data.user_id);
        if (typing.users.length === 0) {
          this.typingUsers.delete(data.conversation_id);
        }
      }
    }
    this.onTyping(this.typingUsers);
  }

  handlePresenceUpdate(data) {
    this.presence.set(data.user_id, { user_id: data.user_id, status: data.status, last_seen: new Date().toISOString() });
    this.onPresenceChange(this.presence);
  }

  handleNotification(notification) {
    this.notifications.unshift(notification);
    if (!notification.is_read) this.unreadCount++;
    this.onNotification(this.notifications);
  }

  handleMemberAdded(data) {
    const conv = this.conversations.find(c => c.id === data.conversation_id);
    if (conv && conv.members) {
      conv.members.push(data.member);
      this.onConversationChange(this.conversations);
    }
  }

  handleMemberRemoved(data) {
    const conv = this.conversations.find(c => c.id === data.conversation_id);
    if (conv && conv.members) {
      conv.members = conv.members.filter(m => m.id !== data.userId);
      this.onConversationChange(this.conversations);
    }
  }

  handleEmergencyAlert(alert) {
    this.handleNotification({
      type: 'emergency',
      title: alert.title,
      message: alert.message,
      severity: alert.severity,
      alertId: alert.id
    });
  }

  handleModerationAction(action) {
    this.handleNotification({
      type: 'moderation',
      title: 'Moderation Action',
      message: `${action.action_type} applied`,
      actionId: action.id
    });
  }

  // Utility Methods
  setActiveConversation(conversation) {
    this.activeConversation = conversation;
    this.messages = [];
    this.onConversationChange(this.conversations);
  }

  getTypingUsers(conversationId) {
    return this.typingUsers.get(conversationId)?.users || [];
  }

  getUserPresence(userId) {
    return this.presence.get(userId) || { status: 'offline' };
  }

  formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  }
}

// Export for both browser and module environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CommunicationCenter;
} else if (typeof window !== 'undefined') {
  window.CommunicationCenter = CommunicationCenter;
}