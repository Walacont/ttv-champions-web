/**
 * Chat System - Echtzeit-Nachrichten mit Supabase Realtime
 * 1:1 Direktnachrichten + Gruppen-Chats
 * Guardian-Sichtbarkeit: Eltern können Kinder-Chats einsehen (read-only)
 */

import { getSupabase } from './supabase-init.js';
import { escapeHtml, escapeAttr } from './utils/security.js';

// --- State ---
let db = null;
let currentUserId = null;
let chatMessageSubscription = null;
let chatParticipantSubscription = null;
let unreadSyncInterval = null;
let conversations = [];
let currentMessages = [];
let currentConversationId = null;
let currentView = 'list'; // 'list' | 'conversation' | 'new-chat' | 'guardian-children' | 'guardian-conv'
let chatPanelOpen = false;
let isLoadingMore = false;
let oldestMessageTimestamp = null;
let clientUnreadCount = 0;
let isGuardianMode = false;
let guardianChildren = [];
let selectedGuardianChildId = null;
let selectedGroupMembers = [];
let newChatTab = 'direct'; // 'direct' | 'group'
const MESSAGE_LIMIT = 50;
const MAX_CONTENT_LENGTH = 5000;
const UNREAD_SYNC_INTERVAL = 60000; // 60s

// --- Exports ---

/**
 * Initialisiert den Chat für den aktuellen Benutzer
 */
export async function initChat(userId) {
    db = getSupabase();
    if (!db || !userId) return;

    currentUserId = userId;
    setupChatButtonHandler();
    await updateChatBadge();
    setupRealtimeSubscriptions();
    unreadSyncInterval = setInterval(() => updateChatBadge(), UNREAD_SYNC_INTERVAL);

    // Deep-link: ?openChat=<conversation_id> from push notification
    const urlParams = new URLSearchParams(window.location.search);
    const openChatId = urlParams.get('openChat');
    if (openChatId) {
        // Remove param from URL to avoid re-opening on refresh
        urlParams.delete('openChat');
        const newUrl = urlParams.toString()
            ? window.location.pathname + '?' + urlParams.toString()
            : window.location.pathname;
        window.history.replaceState({}, '', newUrl);

        // Load conversations first, then open the target conversation
        await loadConversations();
        showChatPanel();
        openConversation(openChatId);
    }
}

/**
 * Guardian-Modus: Erlaubt Einsicht in Kinder-Chats (read-only)
 */
export function initGuardianChat(guardianId, children) {
    isGuardianMode = true;
    guardianChildren = children || [];
}

/**
 * Räumt alle Subscriptions und Intervalle auf
 */
export function cleanupChat() {
    if (chatMessageSubscription) {
        db?.removeChannel(chatMessageSubscription);
        chatMessageSubscription = null;
    }
    if (chatParticipantSubscription) {
        db?.removeChannel(chatParticipantSubscription);
        chatParticipantSubscription = null;
    }
    if (unreadSyncInterval) {
        clearInterval(unreadSyncInterval);
        unreadSyncInterval = null;
    }
}

/**
 * Öffnet einen Direktchat mit einem bestimmten Benutzer
 */
export async function openChatWithUser(otherUserId) {
    if (!db || !currentUserId) return;

    try {
        const { data, error } = await db.rpc('get_or_create_direct_chat', {
            current_user_id: currentUserId,
            other_user_id: otherUserId
        });

        if (error) throw error;
        const result = typeof data === 'string' ? JSON.parse(data) : data;

        if (result.success) {
            showChatPanel();
            await openConversation(result.conversation_id);
        }
    } catch (err) {
        console.error('[CHAT] Error opening direct chat:', err);
    }
}

// Expose on window for cross-module usage
window.openChatWithUser = openChatWithUser;

// --- Setup ---

function setupChatButtonHandler() {
    const btn = document.getElementById('open-chat-btn');
    if (btn) {
        btn.addEventListener('click', () => {
            if (chatPanelOpen) {
                hideChatPanel();
            } else {
                showChatPanel();
            }
        });
    }
}

function setupRealtimeSubscriptions() {
    if (!db || !currentUserId) return;

    // Channel für neue Nachrichten
    chatMessageSubscription = db
        .channel(`chat-messages-${currentUserId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages'
        }, handleNewMessage)
        .subscribe();

    // Channel für Teilnehmer-Änderungen (neue Chats, entfernt)
    chatParticipantSubscription = db
        .channel(`chat-participants-${currentUserId}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'chat_participants',
            filter: `user_id=eq.${currentUserId}`
        }, handleParticipantChange)
        .subscribe();
}

// --- Realtime Handlers ---

function handleNewMessage(payload) {
    const msg = payload.new;
    if (!msg) return;

    // Eigene Nachrichten ignorieren (schon per Optimistic UI angezeigt)
    if (msg.sender_id === currentUserId) return;

    // Wenn in aktuellem offenen Chat: Nachricht anhängen
    if (chatPanelOpen && currentView === 'conversation' && msg.conversation_id === currentConversationId) {
        appendMessageToUI(msg);
        markConversationAsRead(msg.conversation_id);
    } else {
        // Unread-Counter erhöhen
        clientUnreadCount++;
        renderBadge(clientUnreadCount);
    }

    // Konversationsliste aktualisieren (falls sichtbar)
    updateConversationInList(msg.conversation_id, msg.content, msg.sender_id, msg.created_at);
}

function handleParticipantChange(payload) {
    // Bei Änderungen an Teilnehmern: Konversationsliste neu laden
    if (chatPanelOpen && currentView === 'list') {
        loadConversations();
    }
}

// --- Panel Management ---

function showChatPanel() {
    chatPanelOpen = true;
    let panel = document.getElementById('chat-fullscreen');

    if (!panel) {
        panel = createChatPanel();
        const root = document.getElementById('chat-panel-root');
        if (root) {
            root.appendChild(panel);
        } else {
            document.body.appendChild(panel);
        }
    }

    // Panel öffnen (mit Animation)
    requestAnimationFrame(() => {
        panel.classList.add('chat-open');
    });

    // Standardansicht laden
    if (isGuardianMode && guardianChildren.length > 0) {
        showGuardianChildrenView();
    } else {
        showConversationListView();
    }
}

function hideChatPanel() {
    chatPanelOpen = false;
    currentView = 'list';
    currentConversationId = null;
    currentMessages = [];

    const panel = document.getElementById('chat-fullscreen');
    if (panel) {
        panel.classList.remove('chat-open');
    }
}

function createChatPanel() {
    const panel = document.createElement('div');
    panel.id = 'chat-fullscreen';
    panel.innerHTML = `
        <div class="chat-header" id="chat-header"></div>
        <div id="chat-body" style="flex:1;display:flex;flex-direction:column;overflow:hidden;position:relative;"></div>
    `;
    return panel;
}

// --- Views ---

async function showConversationListView() {
    currentView = 'list';
    currentConversationId = null;

    renderHeader({
        title: 'Chat',
        showBack: false,
        showClose: true,
        rightAction: isGuardianMode ? {
            icon: 'fas fa-child',
            title: 'Kinder-Chats',
            onClick: () => showGuardianChildrenView()
        } : {
            icon: 'fas fa-plus',
            title: 'Neuer Chat',
            onClick: () => showNewChatView()
        },
        leftAction: isGuardianMode ? null : undefined
    });

    const body = document.getElementById('chat-body');
    if (!body) return;

    body.innerHTML = `
        <div class="chat-search-bar">
            <div class="chat-search-wrapper">
                <i class="fas fa-search chat-search-icon"></i>
                <input type="text" class="chat-search-input" id="chat-search" placeholder="Chats durchsuchen...">
            </div>
        </div>
        ${isGuardianMode ? '' : `
        <button id="chat-new-btn-inline" style="display:none;padding:0.75rem 1rem;background:white;border:none;border-bottom:1px solid #f3f4f6;width:100%;text-align:left;cursor:pointer;color:#4f46e5;font-weight:500;font-size:0.875rem;">
            <i class="fas fa-plus mr-2"></i>Neuen Chat starten
        </button>`}
        <div class="chat-conversation-list" id="chat-conv-list">
            <div class="chat-loading"><div class="chat-spinner"></div> Chats laden...</div>
        </div>
    `;

    // Search handler
    const searchInput = document.getElementById('chat-search');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => filterConversations(searchInput.value), 300);
        });
    }

    await loadConversations();
}

async function loadConversations() {
    if (!db || !currentUserId) return;

    try {
        const { data, error } = await db.rpc('get_my_conversations', {
            current_user_id: currentUserId
        });

        if (error) throw error;
        conversations = data || [];
        renderConversationList(conversations);
    } catch (err) {
        console.error('[CHAT] Error loading conversations:', err);
        const list = document.getElementById('chat-conv-list');
        if (list) {
            list.innerHTML = `<div class="chat-empty-state">
                <div class="chat-empty-icon"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="chat-empty-title">Fehler beim Laden</div>
                <div class="chat-empty-text">Bitte versuche es später erneut.</div>
            </div>`;
        }
    }
}

function renderConversationList(convs) {
    const list = document.getElementById('chat-conv-list');
    if (!list) return;

    if (!convs || convs.length === 0) {
        list.innerHTML = `
            <div class="chat-empty-state">
                <div class="chat-empty-icon"><i class="far fa-comment-dots"></i></div>
                <div class="chat-empty-title">Noch keine Chats</div>
                <div class="chat-empty-text">Starte einen Chat mit einem Freund!</div>
            </div>`;

        // Show inline new chat button
        const inlineBtn = document.getElementById('chat-new-btn-inline');
        if (inlineBtn) {
            inlineBtn.style.display = 'block';
            inlineBtn.onclick = () => showNewChatView();
        }
        return;
    }

    list.innerHTML = convs.map(conv => {
        const isGroup = conv.conversation_type === 'group';
        const name = isGroup
            ? escapeHtml(conv.conversation_name || 'Gruppe')
            : escapeHtml((conv.participant_names && conv.participant_names[0]) || 'Unbekannt');
        const avatar = !isGroup && conv.participant_avatars && conv.participant_avatars[0]
            ? conv.participant_avatars[0]
            : null;
        const initials = getInitials(isGroup ? conv.conversation_name : (conv.participant_names && conv.participant_names[0]));
        const unread = conv.unread_count || 0;
        const hasUnread = unread > 0;
        const preview = conv.last_message_content
            ? escapeHtml(truncate(conv.last_message_content, 60))
            : '<i style="color:#9ca3af">Noch keine Nachrichten</i>';
        const senderPrefix = conv.last_message_sender_id === currentUserId
            ? 'Du: '
            : (isGroup && conv.last_message_sender_name ? escapeHtml(conv.last_message_sender_name.split(' ')[0]) + ': ' : '');
        const time = conv.last_message_at ? formatRelativeTime(conv.last_message_at) : '';

        return `
            <div class="chat-conversation-item ${hasUnread ? 'has-unread' : ''}" data-conv-id="${conv.conversation_id}" onclick="window._chatOpenConv('${conv.conversation_id}')">
                ${avatar
                    ? `<img class="chat-avatar" src="${escapeAttr(avatar)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="chat-avatar-placeholder" style="display:none">${escapeHtml(initials)}</div>`
                    : isGroup
                        ? `<div class="chat-avatar-group"><i class="fas fa-users"></i></div>`
                        : `<div class="chat-avatar-placeholder">${escapeHtml(initials)}</div>`
                }
                <div class="chat-conv-content">
                    <div class="chat-conv-name">${name}</div>
                    <div class="chat-conv-preview ${hasUnread ? 'unread' : ''}">${senderPrefix}${preview}</div>
                </div>
                <div class="chat-conv-meta">
                    <div class="chat-conv-time ${hasUnread ? 'unread' : ''}">${time}</div>
                    ${hasUnread ? `<div class="chat-unread-count">${unread > 99 ? '99+' : unread}</div>` : ''}
                </div>
            </div>`;
    }).join('');
}

function filterConversations(query) {
    if (!query || !query.trim()) {
        renderConversationList(conversations);
        return;
    }
    const q = query.toLowerCase().trim();
    const filtered = conversations.filter(conv => {
        const name = conv.conversation_type === 'group'
            ? (conv.conversation_name || '')
            : ((conv.participant_names && conv.participant_names[0]) || '');
        return name.toLowerCase().includes(q);
    });
    renderConversationList(filtered);
}

// --- Conversation (Message View) ---

async function openConversation(conversationId, readOnly = false) {
    currentView = readOnly ? 'guardian-conv' : 'conversation';
    currentConversationId = conversationId;
    currentMessages = [];
    oldestMessageTimestamp = null;

    // Konversationsinfo aus Cache holen
    const conv = conversations.find(c => c.conversation_id === conversationId);
    const isGroup = conv?.conversation_type === 'group';
    const title = isGroup
        ? (conv?.conversation_name || 'Gruppe')
        : ((conv?.participant_names && conv.participant_names[0]) || 'Chat');
    const avatar = !isGroup && conv?.participant_avatars && conv.participant_avatars[0]
        ? conv.participant_avatars[0]
        : null;

    renderHeader({
        title: title,
        subtitle: isGroup ? `${(conv?.participant_names?.length || 0) + 1} Mitglieder` : null,
        avatar: avatar,
        isGroup: isGroup,
        showBack: true,
        showClose: true,
        onBack: () => {
            if (readOnly && isGuardianMode) {
                showGuardianConversationsView(selectedGuardianChildId);
            } else {
                showConversationListView();
            }
        }
    });

    const body = document.getElementById('chat-body');
    if (!body) return;

    body.innerHTML = `
        ${readOnly ? '<div class="chat-guardian-banner"><i class="fas fa-eye"></i> Nur Lesen (Eltern-Ansicht)</div>' : ''}
        <div class="chat-messages-area" id="chat-messages"></div>
        <div class="chat-new-msg-indicator" id="chat-new-msg-ind" onclick="window._chatScrollBottom()">Neue Nachrichten <i class="fas fa-arrow-down ml-1"></i></div>
        ${readOnly ? '' : `
        <div class="chat-char-counter" id="chat-char-counter" style="display:none"></div>
        <div class="chat-input-area">
            <textarea class="chat-message-input" id="chat-msg-input" placeholder="Nachricht schreiben..." rows="1" maxlength="${MAX_CONTENT_LENGTH}"></textarea>
            <button class="chat-send-btn" id="chat-send-btn" disabled title="Senden">
                <i class="far fa-paper-plane"></i>
            </button>
        </div>`}
    `;

    // Messages laden
    await loadMessages(conversationId, readOnly);

    // Input Handler (nur wenn nicht read-only)
    if (!readOnly) {
        setupMessageInput();
    }

    // Scroll-Pagination
    setupScrollPagination(readOnly);

    // Als gelesen markieren (nur eigene Chats)
    if (!readOnly) {
        markConversationAsRead(conversationId);
        // Unread in Liste aktualisieren
        if (conv) {
            clientUnreadCount = Math.max(0, clientUnreadCount - (conv.unread_count || 0));
            conv.unread_count = 0;
            renderBadge(clientUnreadCount);
        }
    }
}

// Global accessor for inline onclick
window._chatOpenConv = (id) => openConversation(id);
window._chatScrollBottom = () => {
    const area = document.getElementById('chat-messages');
    if (area) area.scrollTop = area.scrollHeight;
    const ind = document.getElementById('chat-new-msg-ind');
    if (ind) ind.classList.remove('visible');
};

async function loadMessages(conversationId, readOnly = false) {
    const area = document.getElementById('chat-messages');
    if (!area) return;

    area.innerHTML = '<div class="chat-loading"><div class="chat-spinner"></div> Nachrichten laden...</div>';

    try {
        const params = {
            current_user_id: currentUserId,
            p_conversation_id: conversationId,
            p_limit: MESSAGE_LIMIT
        };
        if (oldestMessageTimestamp) {
            params.p_before = oldestMessageTimestamp;
        }

        const { data, error } = await db.rpc('get_conversation_messages', params);
        if (error) throw error;

        const messages = (data || []).reverse(); // RPC gibt DESC zurück, wir brauchen ASC
        currentMessages = messages;

        if (messages.length > 0) {
            oldestMessageTimestamp = messages[0].created_at;
        }

        renderMessages(messages, area);

        // Scroll to bottom
        requestAnimationFrame(() => {
            area.scrollTop = area.scrollHeight;
        });
    } catch (err) {
        console.error('[CHAT] Error loading messages:', err);
        area.innerHTML = `<div class="chat-empty-state">
            <div class="chat-empty-icon"><i class="fas fa-exclamation-triangle"></i></div>
            <div class="chat-empty-text">Fehler beim Laden der Nachrichten</div>
        </div>`;
    }
}

function renderMessages(messages, container) {
    if (!messages || messages.length === 0) {
        container.innerHTML = `
            <div class="chat-empty-state">
                <div class="chat-empty-icon"><i class="far fa-comment"></i></div>
                <div class="chat-empty-title">Noch keine Nachrichten</div>
                <div class="chat-empty-text">Schreibe die erste Nachricht!</div>
            </div>`;
        return;
    }

    const conv = conversations.find(c => c.conversation_id === currentConversationId);
    const isGroup = conv?.conversation_type === 'group';
    const fragment = document.createDocumentFragment();
    let lastDate = null;

    messages.forEach(msg => {
        const msgDate = new Date(msg.created_at).toLocaleDateString('de-DE');

        // Date separator
        if (msgDate !== lastDate) {
            lastDate = msgDate;
            const sep = document.createElement('div');
            sep.className = 'chat-date-separator';
            sep.innerHTML = `<span>${escapeHtml(formatDateSeparator(msg.created_at))}</span>`;
            fragment.appendChild(sep);
        }

        fragment.appendChild(createMessageElement(msg, isGroup));
    });

    container.innerHTML = '';
    container.appendChild(fragment);
}

function createMessageElement(msg, isGroup) {
    const isOwn = msg.is_own || msg.sender_id === currentUserId;
    const row = document.createElement('div');
    row.className = `chat-message-row ${isOwn ? 'own' : 'other'}`;
    row.dataset.msgId = msg.message_id || msg.id || '';

    const time = formatTime(msg.created_at);
    const edited = msg.edited_at ? ' <span class="chat-bubble-edited">(bearbeitet)</span>' : '';
    const senderName = !isOwn && isGroup && msg.sender_name
        ? `<div class="chat-bubble-sender">${escapeHtml(msg.sender_name.split(' ')[0])}</div>`
        : '';

    row.innerHTML = `
        <div class="chat-bubble ${isOwn ? 'chat-bubble-own' : 'chat-bubble-other'}">
            ${senderName}
            <div>${escapeHtml(msg.content)}</div>
            <div class="chat-bubble-time">${time}${edited}</div>
        </div>
    `;

    return row;
}

function appendMessageToUI(msg) {
    const area = document.getElementById('chat-messages');
    if (!area) return;

    // Prüfe ob Empty State angezeigt wird
    const emptyState = area.querySelector('.chat-empty-state');
    if (emptyState) {
        area.innerHTML = '';
    }

    const conv = conversations.find(c => c.conversation_id === currentConversationId);
    const isGroup = conv?.conversation_type === 'group';

    // Date separator prüfen
    const lastMsg = currentMessages[currentMessages.length - 1];
    const lastDate = lastMsg ? new Date(lastMsg.created_at).toLocaleDateString('de-DE') : null;
    const msgDate = new Date(msg.created_at).toLocaleDateString('de-DE');

    if (msgDate !== lastDate) {
        const sep = document.createElement('div');
        sep.className = 'chat-date-separator';
        sep.innerHTML = `<span>${escapeHtml(formatDateSeparator(msg.created_at))}</span>`;
        area.appendChild(sep);
    }

    // Nachricht mit Sender-Info anreichern (vom Realtime Payload kommt kein sender_name)
    const enrichedMsg = {
        ...msg,
        message_id: msg.id,
        is_own: msg.sender_id === currentUserId,
        sender_name: msg.sender_name || '' // wird von Realtime nicht mitgeliefert
    };

    area.appendChild(createMessageElement(enrichedMsg, isGroup));
    currentMessages.push(enrichedMsg);

    // Auto-scroll oder Indikator anzeigen
    const isNearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 100;
    if (isNearBottom) {
        requestAnimationFrame(() => {
            area.scrollTop = area.scrollHeight;
        });
    } else {
        const ind = document.getElementById('chat-new-msg-ind');
        if (ind) ind.classList.add('visible');
    }
}

// --- Message Input ---

function setupMessageInput() {
    const input = document.getElementById('chat-msg-input');
    const sendBtn = document.getElementById('chat-send-btn');
    const charCounter = document.getElementById('chat-char-counter');
    if (!input || !sendBtn) return;

    // Auto-resize textarea
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';

        const hasContent = input.value.trim().length > 0;
        sendBtn.disabled = !hasContent;

        // Character counter
        const len = input.value.length;
        if (charCounter) {
            if (len > MAX_CONTENT_LENGTH * 0.8) {
                charCounter.style.display = 'block';
                charCounter.textContent = `${len} / ${MAX_CONTENT_LENGTH}`;
                charCounter.className = 'chat-char-counter' + (len > MAX_CONTENT_LENGTH * 0.95 ? ' danger' : ' warning');
            } else {
                charCounter.style.display = 'none';
            }
        }
    });

    // Enter zum Senden (Shift+Enter für Zeilenumbruch)
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (input.value.trim()) {
                sendMessage();
            }
        }
    });

    sendBtn.addEventListener('click', () => {
        if (input.value.trim()) {
            sendMessage();
        }
    });

    // Focus input
    setTimeout(() => input.focus(), 300);
}

async function sendMessage() {
    const input = document.getElementById('chat-msg-input');
    const sendBtn = document.getElementById('chat-send-btn');
    if (!input || !currentConversationId) return;

    const content = input.value.trim();
    if (!content || content.length > MAX_CONTENT_LENGTH) return;

    // Optimistic UI
    const tempId = 'temp-' + Date.now();
    const tempMsg = {
        id: tempId,
        message_id: tempId,
        conversation_id: currentConversationId,
        sender_id: currentUserId,
        content: content,
        created_at: new Date().toISOString(),
        is_own: true
    };

    appendMessageToUI(tempMsg);

    // Input zurücksetzen
    input.value = '';
    input.style.height = 'auto';
    if (sendBtn) sendBtn.disabled = true;
    const charCounter = document.getElementById('chat-char-counter');
    if (charCounter) charCounter.style.display = 'none';

    try {
        const { error } = await db.from('chat_messages').insert({
            conversation_id: currentConversationId,
            sender_id: currentUserId,
            content: content
        });

        if (error) throw error;

        // Konversationsliste im Hintergrund aktualisieren
        updateConversationInList(currentConversationId, content, currentUserId, new Date().toISOString());
    } catch (err) {
        console.error('[CHAT] Error sending message:', err);
        showToast('Nachricht konnte nicht gesendet werden');

        // Optimistic Message entfernen
        const tempEl = document.querySelector(`[data-msg-id="${tempId}"]`);
        if (tempEl) tempEl.remove();
        currentMessages = currentMessages.filter(m => m.message_id !== tempId);
    }
}

// --- Scroll Pagination ---

function setupScrollPagination(readOnly) {
    const area = document.getElementById('chat-messages');
    if (!area) return;

    area.addEventListener('scroll', async () => {
        // Near top -> load more
        if (area.scrollTop < 50 && !isLoadingMore && oldestMessageTimestamp) {
            await loadOlderMessages(readOnly);
        }

        // "New messages" indicator ausblenden wenn am Ende
        const isNearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 100;
        if (isNearBottom) {
            const ind = document.getElementById('chat-new-msg-ind');
            if (ind) ind.classList.remove('visible');
        }
    });
}

async function loadOlderMessages(readOnly) {
    if (isLoadingMore || !currentConversationId || !oldestMessageTimestamp) return;
    isLoadingMore = true;

    const area = document.getElementById('chat-messages');
    if (!area) { isLoadingMore = false; return; }

    // Scroll-Position merken
    const scrollHeightBefore = area.scrollHeight;

    // Loading indicator oben anzeigen
    const loader = document.createElement('div');
    loader.className = 'chat-loading-top';
    loader.innerHTML = '<div class="chat-spinner" style="margin:0 auto"></div>';
    area.prepend(loader);

    try {
        const { data, error } = await db.rpc('get_conversation_messages', {
            current_user_id: currentUserId,
            p_conversation_id: currentConversationId,
            p_limit: MESSAGE_LIMIT,
            p_before: oldestMessageTimestamp
        });

        if (error) throw error;

        const messages = (data || []).reverse();
        loader.remove();

        if (messages.length === 0) {
            oldestMessageTimestamp = null; // Keine weiteren Nachrichten
            isLoadingMore = false;
            return;
        }

        oldestMessageTimestamp = messages[0].created_at;

        const conv = conversations.find(c => c.conversation_id === currentConversationId);
        const isGroup = conv?.conversation_type === 'group';

        // Nachrichten oben einfügen
        const fragment = document.createDocumentFragment();
        let lastDate = null;

        messages.forEach(msg => {
            const msgDate = new Date(msg.created_at).toLocaleDateString('de-DE');
            if (msgDate !== lastDate) {
                lastDate = msgDate;
                const sep = document.createElement('div');
                sep.className = 'chat-date-separator';
                sep.innerHTML = `<span>${escapeHtml(formatDateSeparator(msg.created_at))}</span>`;
                fragment.appendChild(sep);
            }
            fragment.appendChild(createMessageElement(msg, isGroup));
        });

        area.prepend(fragment);
        currentMessages = [...messages, ...currentMessages];

        // Scroll-Position wiederherstellen
        requestAnimationFrame(() => {
            area.scrollTop = area.scrollHeight - scrollHeightBefore;
        });
    } catch (err) {
        console.error('[CHAT] Error loading older messages:', err);
        loader.remove();
    }

    isLoadingMore = false;
}

// --- New Chat View ---

async function showNewChatView() {
    currentView = 'new-chat';
    selectedGroupMembers = [];
    newChatTab = 'direct';

    renderHeader({
        title: 'Neuer Chat',
        showBack: true,
        showClose: true,
        onBack: () => showConversationListView()
    });

    const body = document.getElementById('chat-body');
    if (!body) return;

    body.innerHTML = `
        <div class="chat-tabs">
            <button class="chat-tab active" id="chat-tab-direct" onclick="window._chatSwitchTab('direct')">
                <i class="fas fa-user mr-1"></i> Direktnachricht
            </button>
            <button class="chat-tab" id="chat-tab-group" onclick="window._chatSwitchTab('group')">
                <i class="fas fa-users mr-1"></i> Gruppenchat
            </button>
        </div>
        <div id="chat-new-group-form" class="chat-group-form" style="display:none">
            <input type="text" class="chat-group-input" id="chat-group-name" placeholder="Gruppenname eingeben..." maxlength="100">
            <div class="chat-selected-members" id="chat-selected-members" style="display:none"></div>
            <button class="chat-create-group-btn" id="chat-create-group-btn" disabled onclick="window._chatCreateGroup()">
                Gruppe erstellen
            </button>
        </div>
        <div class="chat-search-bar">
            <div class="chat-search-wrapper">
                <i class="fas fa-search chat-search-icon"></i>
                <input type="text" class="chat-search-input" id="chat-friend-search" placeholder="Freunde suchen...">
            </div>
        </div>
        <div class="chat-conversation-list" id="chat-contact-list">
            <div class="chat-loading"><div class="chat-spinner"></div> Freunde laden...</div>
        </div>
    `;

    // Search handler
    const searchInput = document.getElementById('chat-friend-search');
    if (searchInput) {
        let timeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => loadFriends(searchInput.value), 300);
        });
    }

    await loadFriends();
}

// Global handlers for new chat view
window._chatSwitchTab = (tab) => {
    newChatTab = tab;
    selectedGroupMembers = [];

    document.getElementById('chat-tab-direct')?.classList.toggle('active', tab === 'direct');
    document.getElementById('chat-tab-group')?.classList.toggle('active', tab === 'group');

    const groupForm = document.getElementById('chat-new-group-form');
    if (groupForm) groupForm.style.display = tab === 'group' ? 'block' : 'none';

    const selectedDiv = document.getElementById('chat-selected-members');
    if (selectedDiv) { selectedDiv.style.display = 'none'; selectedDiv.innerHTML = ''; }

    // Re-render contacts
    renderContactList(window._chatFriendsList || []);
};

window._chatCreateGroup = async () => {
    const nameInput = document.getElementById('chat-group-name');
    const name = nameInput?.value?.trim();
    if (!name || selectedGroupMembers.length === 0) return;

    const btn = document.getElementById('chat-create-group-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Wird erstellt...'; }

    try {
        const { data, error } = await db.rpc('create_group_chat', {
            current_user_id: currentUserId,
            group_name: name,
            member_ids: selectedGroupMembers.map(m => m.id)
        });

        if (error) throw error;
        const result = typeof data === 'string' ? JSON.parse(data) : data;

        if (result.success) {
            // Reload conversations and open the new one
            await loadConversations();
            await openConversation(result.conversation_id);
        }
    } catch (err) {
        console.error('[CHAT] Error creating group:', err);
        showToast('Gruppe konnte nicht erstellt werden');
        if (btn) { btn.disabled = false; btn.textContent = 'Gruppe erstellen'; }
    }
};

async function loadFriends(searchQuery) {
    if (!db || !currentUserId) return;

    try {
        const { data, error } = await db.rpc('get_friends', {
            current_user_id: currentUserId
        });

        if (error) throw error;

        let friends = data || [];
        window._chatFriendsList = friends;

        if (searchQuery && searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            friends = friends.filter(f =>
                (f.first_name + ' ' + f.last_name).toLowerCase().includes(q)
            );
        }

        renderContactList(friends);
    } catch (err) {
        console.error('[CHAT] Error loading friends:', err);
        const list = document.getElementById('chat-contact-list');
        if (list) {
            list.innerHTML = `<div class="chat-empty-state">
                <div class="chat-empty-text">Fehler beim Laden der Freunde</div>
            </div>`;
        }
    }
}

function renderContactList(friends) {
    const list = document.getElementById('chat-contact-list');
    if (!list) return;

    if (!friends || friends.length === 0) {
        list.innerHTML = `
            <div class="chat-empty-state">
                <div class="chat-empty-icon"><i class="fas fa-user-friends"></i></div>
                <div class="chat-empty-title">Keine Freunde gefunden</div>
                <div class="chat-empty-text">Füge zuerst Freunde hinzu, um zu chatten.</div>
            </div>`;
        return;
    }

    const isGroupMode = newChatTab === 'group';

    list.innerHTML = friends.map(f => {
        const name = escapeHtml((f.first_name || '') + ' ' + (f.last_name || ''));
        const initials = getInitials(f.first_name + ' ' + f.last_name);
        const isSelected = selectedGroupMembers.some(m => m.id === f.id);
        const club = f.club_name ? escapeHtml(f.club_name) : '';

        return `
            <div class="chat-contact-item ${isSelected ? 'selected' : ''}" onclick="window._chatSelectContact('${f.id}', '${escapeAttr(f.first_name)}', '${escapeAttr(f.last_name)}')">
                ${f.avatar_url
                    ? `<img class="chat-avatar-sm" src="${escapeAttr(f.avatar_url)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="chat-avatar-sm-placeholder" style="display:none">${escapeHtml(initials)}</div>`
                    : `<div class="chat-avatar-sm-placeholder">${escapeHtml(initials)}</div>`
                }
                <div class="chat-conv-content">
                    <div class="chat-conv-name" style="font-size:0.875rem">${name}</div>
                    ${club ? `<div class="chat-conv-preview" style="font-size:0.75rem">${club}</div>` : ''}
                </div>
                ${isGroupMode ? `<div class="chat-contact-check">${isSelected ? '<i class="fas fa-check" style="font-size:0.625rem"></i>' : ''}</div>` : ''}
            </div>`;
    }).join('');
}

window._chatSelectContact = async (userId, firstName, lastName) => {
    if (newChatTab === 'direct') {
        // Direktchat sofort öffnen
        try {
            const { data, error } = await db.rpc('get_or_create_direct_chat', {
                current_user_id: currentUserId,
                other_user_id: userId
            });
            if (error) throw error;
            const result = typeof data === 'string' ? JSON.parse(data) : data;
            if (result.success) {
                await loadConversations();
                await openConversation(result.conversation_id);
            }
        } catch (err) {
            console.error('[CHAT] Error creating direct chat:', err);
            showToast('Chat konnte nicht erstellt werden');
        }
    } else {
        // Gruppenmitglied hinzufügen/entfernen
        const idx = selectedGroupMembers.findIndex(m => m.id === userId);
        if (idx >= 0) {
            selectedGroupMembers.splice(idx, 1);
        } else {
            selectedGroupMembers.push({ id: userId, name: firstName + ' ' + lastName });
        }

        // Selected members anzeigen
        renderSelectedMembers();

        // Contact list aktualisieren (Checkmarks)
        renderContactList(window._chatFriendsList || []);

        // Button aktivieren/deaktivieren
        const btn = document.getElementById('chat-create-group-btn');
        const nameInput = document.getElementById('chat-group-name');
        if (btn) {
            btn.disabled = selectedGroupMembers.length === 0 || !nameInput?.value?.trim();
        }
    }
};

function renderSelectedMembers() {
    const container = document.getElementById('chat-selected-members');
    if (!container) return;

    if (selectedGroupMembers.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    container.style.display = 'flex';
    container.innerHTML = selectedGroupMembers.map(m => `
        <div class="chat-member-chip">
            ${escapeHtml(m.name.split(' ')[0])}
            <button class="chat-member-chip-remove" onclick="event.stopPropagation();window._chatRemoveMember('${m.id}')">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

window._chatRemoveMember = (userId) => {
    selectedGroupMembers = selectedGroupMembers.filter(m => m.id !== userId);
    renderSelectedMembers();
    renderContactList(window._chatFriendsList || []);
    const btn = document.getElementById('chat-create-group-btn');
    if (btn) btn.disabled = selectedGroupMembers.length === 0;
};

// --- Guardian Views ---

function showGuardianChildrenView() {
    currentView = 'guardian-children';

    renderHeader({
        title: 'Kinder-Chats',
        subtitle: 'Nur Lesen',
        showBack: true,
        showClose: true,
        onBack: () => showConversationListView(),
        rightAction: {
            icon: 'far fa-comment-dots',
            title: 'Meine Chats',
            onClick: () => showConversationListView()
        }
    });

    const body = document.getElementById('chat-body');
    if (!body) return;

    if (!guardianChildren || guardianChildren.length === 0) {
        body.innerHTML = `
            <div class="chat-empty-state">
                <div class="chat-empty-icon"><i class="fas fa-child"></i></div>
                <div class="chat-empty-title">Keine Kinder verknüpft</div>
                <div class="chat-empty-text">Verknüpfe zuerst ein Kind im Eltern-Dashboard.</div>
            </div>`;
        return;
    }

    body.innerHTML = `
        <div class="chat-guardian-banner"><i class="fas fa-eye"></i> Du kannst die Chatverläufe deiner Kinder einsehen</div>
        <div class="chat-conversation-list" id="chat-guardian-children-list">
            ${guardianChildren.map(child => {
                const name = escapeHtml((child.first_name || '') + ' ' + (child.last_name || child.display_name || ''));
                const initials = getInitials(child.first_name + ' ' + (child.last_name || ''));
                return `
                    <div class="chat-guardian-child-item" onclick="window._chatViewChildChats('${child.id}')">
                        ${child.avatar_url
                            ? `<img class="chat-avatar" src="${escapeAttr(child.avatar_url)}" alt="">`
                            : `<div class="chat-avatar-placeholder">${escapeHtml(initials)}</div>`
                        }
                        <div class="chat-conv-content">
                            <div class="chat-conv-name">${name}</div>
                            <div class="chat-conv-preview">Chatverläufe einsehen</div>
                        </div>
                        <i class="fas fa-chevron-right text-gray-400"></i>
                    </div>`;
            }).join('')}
        </div>`;
}

window._chatViewChildChats = (childId) => showGuardianConversationsView(childId);

async function showGuardianConversationsView(childId) {
    currentView = 'guardian-conv';
    selectedGuardianChildId = childId;

    const child = guardianChildren.find(c => c.id === childId);
    const childName = child ? (child.first_name || child.display_name || 'Kind') : 'Kind';

    renderHeader({
        title: `Chats von ${childName}`,
        subtitle: 'Nur Lesen',
        showBack: true,
        showClose: true,
        onBack: () => showGuardianChildrenView()
    });

    const body = document.getElementById('chat-body');
    if (!body) return;

    body.innerHTML = `
        <div class="chat-guardian-banner"><i class="fas fa-eye"></i> Nur Lesen (Eltern-Ansicht)</div>
        <div class="chat-conversation-list" id="chat-guardian-conv-list">
            <div class="chat-loading"><div class="chat-spinner"></div> Chats laden...</div>
        </div>
    `;

    try {
        const { data, error } = await db.rpc('get_child_conversations', {
            guardian_user_id: currentUserId,
            child_user_id: childId
        });

        if (error) throw error;

        const list = document.getElementById('chat-guardian-conv-list');
        if (!list) return;

        if (!data || data.length === 0) {
            list.innerHTML = `
                <div class="chat-empty-state">
                    <div class="chat-empty-icon"><i class="far fa-comment"></i></div>
                    <div class="chat-empty-title">Keine Chats</div>
                    <div class="chat-empty-text">${escapeHtml(childName)} hat noch keine Chats.</div>
                </div>`;
            return;
        }

        // Store in conversations cache for openConversation to find
        data.forEach(conv => {
            if (!conversations.find(c => c.conversation_id === conv.conversation_id)) {
                conversations.push({
                    ...conv,
                    participant_names: conv.participant_names || [],
                    unread_count: 0
                });
            }
        });

        list.innerHTML = data.map(conv => {
            const isGroup = conv.conversation_type === 'group';
            const name = isGroup
                ? escapeHtml(conv.conversation_name || 'Gruppe')
                : escapeHtml((conv.participant_names && conv.participant_names.filter(n => n !== childName)[0]) || 'Chat');
            const preview = conv.last_message_content
                ? escapeHtml(truncate(conv.last_message_content, 60))
                : '<i style="color:#9ca3af">Keine Nachrichten</i>';
            const time = conv.last_message_at ? formatRelativeTime(conv.last_message_at) : '';

            return `
                <div class="chat-conversation-item" onclick="window._chatOpenConvReadonly('${conv.conversation_id}')">
                    ${isGroup
                        ? `<div class="chat-avatar-group"><i class="fas fa-users"></i></div>`
                        : `<div class="chat-avatar-placeholder">${escapeHtml(getInitials(name))}</div>`
                    }
                    <div class="chat-conv-content">
                        <div class="chat-conv-name">${name}</div>
                        <div class="chat-conv-preview">${preview}</div>
                    </div>
                    <div class="chat-conv-meta">
                        <div class="chat-conv-time">${time}</div>
                    </div>
                </div>`;
        }).join('');
    } catch (err) {
        console.error('[CHAT] Error loading child conversations:', err);
        const list = document.getElementById('chat-guardian-conv-list');
        if (list) {
            list.innerHTML = `<div class="chat-empty-state"><div class="chat-empty-text">Fehler beim Laden</div></div>`;
        }
    }
}

window._chatOpenConvReadonly = (id) => openConversation(id, true);

// --- Header Rendering ---

function renderHeader({ title, subtitle, showBack, showClose, onBack, rightAction, leftAction, avatar, isGroup }) {
    const header = document.getElementById('chat-header');
    if (!header) return;

    let leftHtml = '';
    if (showBack) {
        leftHtml = `<button class="chat-header-btn" id="chat-back-btn"><i class="fas fa-arrow-left"></i></button>`;
    }

    let rightHtml = '';
    if (showClose) {
        rightHtml += `<button class="chat-header-btn" id="chat-close-btn"><i class="fas fa-times"></i></button>`;
    }
    if (rightAction) {
        rightHtml = `<button class="chat-header-btn" id="chat-right-action" title="${escapeAttr(rightAction.title || '')}"><i class="${rightAction.icon}"></i></button>` + rightHtml;
    }

    // Avatar
    let avatarHtml = '';
    if (avatar) {
        const initials = getInitials(title);
        avatarHtml = `<img class="chat-header-avatar" src="${escapeAttr(avatar)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="chat-header-avatar-placeholder" style="display:none">${escapeHtml(initials)}</div>`;
    } else if (isGroup) {
        avatarHtml = `<div class="chat-header-avatar-group"><i class="fas fa-users"></i></div>`;
    } else if (title) {
        avatarHtml = `<div class="chat-header-avatar-placeholder">${escapeHtml(getInitials(title))}</div>`;
    }

    header.innerHTML = `
        ${leftHtml}
        ${avatarHtml}
        <div class="chat-header-title">
            ${escapeHtml(title)}
            ${subtitle ? `<div class="chat-header-subtitle">${escapeHtml(subtitle)}</div>` : ''}
        </div>
        <div style="display:flex;gap:0.25rem">
            ${rightHtml}
        </div>
    `;

    // Event handlers
    const backBtn = document.getElementById('chat-back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', onBack || (() => showConversationListView()));
    }

    const closeBtn = document.getElementById('chat-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => hideChatPanel());
    }

    if (rightAction) {
        const rightBtn = document.getElementById('chat-right-action');
        if (rightBtn) {
            rightBtn.addEventListener('click', rightAction.onClick);
        }
    }
}

// --- Badge Management ---

async function updateChatBadge() {
    if (!db || !currentUserId) return;

    try {
        const { data, error } = await db.rpc('get_total_unread_count', {
            current_user_id: currentUserId
        });

        if (error) throw error;
        clientUnreadCount = data || 0;
        renderBadge(clientUnreadCount);
    } catch (err) {
        console.error('[CHAT] Error updating badge:', err);
    }
}

function renderBadge(count) {
    const badge = document.getElementById('chat-unread-badge');
    if (!badge) return;

    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

async function markConversationAsRead(conversationId) {
    if (!db || !currentUserId) return;

    try {
        await db.from('chat_participants')
            .update({ last_read_at: new Date().toISOString() })
            .eq('conversation_id', conversationId)
            .eq('user_id', currentUserId);
    } catch (err) {
        console.error('[CHAT] Error marking as read:', err);
    }
}

function updateConversationInList(conversationId, content, senderId, timestamp) {
    const conv = conversations.find(c => c.conversation_id === conversationId);
    if (conv) {
        conv.last_message_content = content;
        conv.last_message_sender_id = senderId;
        conv.last_message_at = timestamp;

        // Konversation nach oben sortieren
        conversations.sort((a, b) => {
            const aTime = a.last_message_at || a.created_at;
            const bTime = b.last_message_at || b.created_at;
            return new Date(bTime) - new Date(aTime);
        });
    }

    // UI aktualisieren wenn Konversationsliste sichtbar
    if (currentView === 'list') {
        renderConversationList(conversations);
    }
}

// --- Utility Functions ---

function formatRelativeTime(timestamp) {
    const now = new Date();
    const date = new Date(timestamp);
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'Jetzt';
    if (mins < 60) return `${mins} Min.`;
    if (hours < 24) return `${hours} Std.`;
    if (days === 1) return 'Gestern';
    if (days < 7) return date.toLocaleDateString('de-DE', { weekday: 'short' });
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function formatDateSeparator(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Heute';
    if (date.toDateString() === yesterday.toDateString()) return 'Gestern';
    return date.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function truncate(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function showToast(message) {
    let toast = document.querySelector('.chat-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'chat-toast';
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add('visible');

    setTimeout(() => {
        toast.classList.remove('visible');
    }, 3000);
}
