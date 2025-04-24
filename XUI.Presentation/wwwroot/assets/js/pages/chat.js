// chat.js

// اطمینان از اجرای کد بعد از بارگذاری کامل DOM
document.addEventListener("DOMContentLoaded", function () {

    console.log("[ChatApp] DOM fully loaded and parsed.");

    // ---=== CONFIGURATION & STATE ===---
    const hubUrl = "/chatHub"; // آدرس هاب SignalR
    const currentUserId = window.chatAppConfig?.currentUserId || null; // دریافت ID کاربر از window object
    const defaultAvatar = "/assets/images/users/user-dummy-img.jpg"; // مسیر تصویر پیش‌فرض کاربر
    const multiUserAvatar = "/assets/images/users/multi-user.jpg"; // مسیر تصویر پیش‌فرض گروه/کانال

    // بررسی وجود User ID قبل از ادامه
    if (!currentUserId) {
        console.error("[ChatApp] CRITICAL: User ID is not available (window.chatAppConfig.currentUserId). Chat functionality disabled.");
        // می‌توانید یک پیام خطا در UI نمایش دهید
        // مثال: document.getElementById('chat-error-message').textContent = "خطا در بارگذاری اطلاعات کاربری. امکان استفاده از چت وجود ندارد.";
        return; // توقف اجرای اسکریپت
    }
    console.log(`[ChatApp] Initializing for User ID: ${currentUserId}`);

    let connection = null;
    let currentChatTargetId = null; // ID کاربر یا کانالی که در حال چت با او هستیم
    let currentChatType = 'user'; // 'user' یا 'channel'
    let isReplying = false;
    let replyingToMessageId = null;
    let contacts = []; // آرایه‌ای برای نگهداری اطلاعات کاربران/کانال‌ها
    let chatHistory = []; // آرایه‌ای برای نگهداری پیام‌های چت فعلی
    let simpleBarChat = null; // نمونه SimpleBar برای پنجره مکالمه
    let simpleBarUsers = null; // نمونه SimpleBar برای لیست کاربران/کانال‌ها
    let emojiPicker = null; // نمونه Emoji Picker
    let lightbox = null; // نمونه GLightbox

    // ---=== DOM Elements ===---
    console.log("[ChatApp] Selecting DOM elements...");
    const userListElement = document.getElementById("userList");
    const channelListElement = document.getElementById("channelList");
    const conversationListElement = document.getElementById("users-conversation"); // ul برای پیام‌ها
    // const channelConversationListElement = document.getElementById("channel-conversation"); // اگر ساختار متفاوت است
    const chatInputElement = document.getElementById("chat-input");
    const chatFormElement = document.getElementById("chatinput-form");
    const chatWrapperElement = document.querySelector(".chat-wrapper");
    const userChatElement = document.querySelector(".user-chat");
    const chatContentElement = document.querySelector(".chat-content"); // کانتینر اصلی محتوای چت (جایی که header و conversation قرار دارد)
    const welcomeViewElement = document.getElementById("welcome-view"); // نمای خوش‌آمدگویی اولیه

    // Chat Header Elements
    const topBarContainer = document.querySelector(".user-chat-topbar"); // کانتینر اصلی هدر
    const topBarUsernameElement = topBarContainer?.querySelector(".username");
    const topBarStatusElement = topBarContainer?.querySelector(".userStatus small");
    const topBarAvatarImgElement = topBarContainer?.querySelector(".chat-user-img img");
    const topBarAvatarStatusElement = topBarContainer?.querySelector(".chat-user-img .user-status");

    // Reply Card Elements
    const replyCardElement = document.querySelector(".replyCard");
    const replyCardNameElement = replyCardElement?.querySelector(".replymessage-block .conversation-name");
    const replyCardMessageElement = replyCardElement?.querySelector(".replymessage-block .text-truncate");
    const closeReplyButton = document.getElementById("close_toggle");

    // Other UI Elements
    const emojiButtonElement = document.getElementById("emoji-btn");
    const chatConversationWrapper = document.getElementById("chat-conversation"); // Div با data-simplebar
    const chatRoomListWrapper = document.querySelector(".chat-room-list"); // Div با data-simplebar در سایدبار
    const elmLoader = document.getElementById("elmLoader"); // لودر اصلی
    const historyLoaderElement = document.getElementById('historyLoader'); // لودر مخصوص تاریخچه چت
    const copyClipboardAlert = document.getElementById("copyClipBoard"); // Alert کپی
    const userChatRemoveButton = document.querySelector(".user-chat-remove"); // دکمه بازگشت در موبایل
    const userProfileShowLinks = document.querySelectorAll(".user-profile-show"); // لینک‌های نمایش پروفایل
    const offcanvasUserProfile = document.getElementById("userProfileCanvasExample"); // Offcanvas پروفایل
    const offcanvasUserProfileName = offcanvasUserProfile?.querySelector('.profile-username');
    const offcanvasUserProfileStatus = offcanvasUserProfile?.querySelector('.profile-userstat');
    const offcanvasUserProfileAvatar = offcanvasUserProfile?.querySelector('.profile-img img');

    // بررسی وجود عناصر حیاتی
    if (!conversationListElement || !chatInputElement || !chatFormElement || !userListElement || !channelListElement || !chatConversationWrapper) {
        console.error("[ChatApp] CRITICAL: Essential DOM elements are missing. Cannot initialize chat.");
        return;
    }
    console.log("[ChatApp] DOM elements selected successfully.");


    // ---=== UTILITY FUNCTIONS ===---

    function getCurrentTimeFormatted() {
        try {
            const now = new Date();
            let hours = now.getHours();
            const minutes = now.getMinutes();
            const ampm = hours >= 12 ? 'pm' : 'am';
            hours = hours % 12;
            hours = hours ? hours : 12; // hour '0' should be '12'
            const minutesStr = minutes < 10 ? '0' + minutes : minutes;
            const hoursStr = hours < 10 ? '0' + hours : hours;
            return hoursStr + ':' + minutesStr + ' ' + ampm;
        } catch (error) {
            console.error("[ChatApp] Error in getCurrentTimeFormatted:", error);
            return "??:??"; // Fallback time
        }
    }

    function formatTimestamp(isoString) {
        if (!isoString) return getCurrentTimeFormatted(); // Fallback to current time if no timestamp
        try {
            const date = new Date(isoString);
            if (isNaN(date)) { // Check if date is valid
                console.warn("[ChatApp] Invalid date string provided to formatTimestamp:", isoString);
                return getCurrentTimeFormatted();
            }
            // نمایش فقط ساعت و دقیقه با فرمت AM/PM
            return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            // یا می‌توانید منطق پیچیده‌تری برای نمایش "دیروز" یا تاریخ کامل اضافه کنید
        } catch (error) {
            console.error("[ChatApp] Error formatting timestamp:", isoString, error);
            return getCurrentTimeFormatted();
        }
    }

    function scrollToBottom(elementId = "chat-conversation") {
        try {
            const simpleBarInstance = elementId === "chat-conversation" ? simpleBarChat : simpleBarUsers;
            const containerElement = document.getElementById(elementId); // This is the wrapper with data-simplebar

            if (!containerElement) {
                console.warn(`[ChatApp] scrollToBottom: Container element #${elementId} not found.`);
                return;
            }

            if (simpleBarInstance) {
                const scrollElement = simpleBarInstance.getScrollElement();
                if (scrollElement) {
                    // console.log(`[ChatApp] Scrolling SimpleBar #${elementId} to bottom.`);
                    // Use setTimeout to allow the browser to render new elements first
                    setTimeout(() => {
                        scrollElement.scrollTop = scrollElement.scrollHeight;
                    }, 50); // Adjust delay if needed, 0 might work sometimes
                } else {
                    console.warn(`[ChatApp] scrollToBottom: SimpleBar scroll element not found for #${elementId}. Falling back.`);
                    containerElement.scrollTop = containerElement.scrollHeight; // Fallback for the container itself
                }
            } else {
                // Fallback if SimpleBar instance wasn't found or initialized
                console.warn(`[ChatApp] scrollToBottom: SimpleBar instance not found for #${elementId}. Falling back to direct scroll.`);
                containerElement.scrollTop = containerElement.scrollHeight;
            }
        } catch (error) {
            console.error(`[ChatApp] Error in scrollToBottom for #${elementId}:`, error);
        }
    }

    function showLoader(show = true, loaderElement = elmLoader) {
        if (loaderElement) {
            // console.log(`[ChatApp] Setting loader (${loaderElement.id || 'main'}) display to: ${show ? 'block' : 'none'}`);
            loaderElement.style.display = show ? "block" : "none";
        } else {
            console.warn("[ChatApp] showLoader: Loader element not found.");
        }
    }

    function showCopyAlert() {
        if (copyClipboardAlert) {
            console.log("[ChatApp] Showing copy alert.");
            copyClipboardAlert.classList.add("show");
            setTimeout(() => {
                copyClipboardAlert.classList.remove("show");
                console.log("[ChatApp] Hiding copy alert.");
            }, 1000);
        } else {
            console.warn("[ChatApp] Copy clipboard alert element not found.");
        }
    }

    function sanitizeHtml(htmlString) {
        // Basic sanitization: prevent script execution. For robust sanitization, use a library like DOMPurify.
        if (!htmlString) return "";
        const tempDiv = document.createElement('div');
        tempDiv.textContent = htmlString; // This automatically escapes HTML tags
        return tempDiv.innerHTML;
    }

    // ---=== HTML BUILDER FUNCTIONS ===---

    function buildMessageHtml(message) {
        // --- Basic validation ---
        // Use correct property names from DTO/Entity
        if (!message || !message.messageId || !message.senderUserId || !message.timestamp) {
            console.error("[ChatApp] buildMessageHtml: Invalid message object received (Missing essential properties):", message);
            return ""; // Return empty string for invalid messages
        }

        try {
            const isSender = message.senderUserId === currentUserId;
            const alignClass = isSender ? "right" : "left";
            const messageDomId = `chat-id-${message.messageId}`; // ID for <li>
            const contentWrapperId = `content-${message.messageId}`; // ID for the core content div (used by copy action)
            const messageTime = formatTimestamp(message.timestamp); // Use the correct timestamp property

            // --- Sanitize Content ---
            // Always sanitize user input before inserting into HTML to prevent XSS
            const safeSenderName = sanitizeHtml(isSender ? "شما" : (message.senderName || "کاربر"));
            const safeMessageContent = message.content ? sanitizeHtml(message.content) : ''; // Use correct content property
            const safeReplyText = message.replyToText ? sanitizeHtml(message.replyToText) : null;
            const safeReplySenderName = message.replyToSenderName ? sanitizeHtml(message.replyToSenderName) : "کاربر";
            const senderAvatar = message.senderAvatar || defaultAvatar; // Ensure avatar is available
            // Sanitize attachment data if used
            const safeAttachmentUrl = message.attachmentUrl ? sanitizeHtml(message.attachmentUrl) : null; // Basic sanitization for URL
            const safeFilename = message.attachmentFilename ? sanitizeHtml(message.attachmentFilename) : null;

            // ---=== Build CORE Content (Reply, Text, Attachments) ===---
            //    This part will contain the actual message parts that go
            //    INSIDE the single ctext-wrap-content div below.
            //    IMPORTANT: No wrapping divs like ctext-wrap-content here!
            let coreContentHtml = '';

            // 1. Reply Block
            if (message.replyToMessageId && safeReplyText) {
                // Using improved styling similar to previous suggestions
                coreContentHtml += `
                <div class="replymessage-block mb-2 d-flex align-items-start ps-3 pt-2 pb-1 pe-2 rounded bg-light-subtle">
                    <div class="flex-grow-1">
                        <h6 class="conversation-name fs-11">${safeReplySenderName}</h6>
                        <p class="mb-0 text-truncate fs-12">${safeReplyText}</p>
                    </div>
                </div>`;
            }

            // 2. Main Content (Text) - Just the paragraph, no wrapper div here
            if (safeMessageContent) {
                coreContentHtml += `<p class="mb-0 ctext-content">${safeMessageContent}</p>`;
            }

            // 3. Attachments (Add logic based on your DTO properties)
            if (safeAttachmentUrl && message.attachmentType?.startsWith('image/')) {
                // Example for Image Attachment
                coreContentHtml += `
                 <div class="message-img mb-0 mt-1"> ${/* Add margin if needed */''}
                     <div class="message-img-list">
                         <div>
                             <a class="popup-img d-inline-block glightbox${message.messageId}" href="${safeAttachmentUrl}"> ${/* Unique class for lightbox */''}
                                 <img src="${safeAttachmentUrl}" alt="Message image" class="rounded border img-thumbnail"> ${/* Added styling */''}
                             </a>
                         </div>
                     </div>
                 </div>`;
            } else if (safeAttachmentUrl) {
                // Example for File Attachment
                coreContentHtml += `
                 <div class="attached-file border rounded p-2 mt-1">
                     <div class="d-flex align-items-center">
                          <div class="flex-shrink-0 avatar-sm me-3 ms-0"> <div class="avatar-title bg-light rounded"> <i class="ri-file-text-line fs-18"></i> </div> </div>
                         <div class="flex-grow-1 overflow-hidden"> <p class="text-truncate fw-medium mb-0">${safeFilename || 'فایل ضمیمه'}</p> </div>
                         <div class="flex-shrink-0 ms-2"> <a href="${safeAttachmentUrl}" target="_blank" download="${safeFilename || 'file'}" class="btn btn-icon btn-sm btn-soft-primary fs-16"> <i class="ri-download-2-line"></i> </a> </div>
                     </div>
                 </div>`;
            }

            // ---=== Build Message Bubble (The actual chat bubble) ===---
            //    Creates the ctext-wrap and the SINGLE ctext-wrap-content around the core content.
            const messageBubbleHtml = `
            <div class="ctext-wrap">
                <div class="ctext-wrap-content" id="${contentWrapperId}"> ${/* <<<< THE ONLY ctext-wrap-content */''}
                    ${coreContentHtml} ${/* <<<< All core content (reply, text, attachment) goes here */''}
                </div>
            </div>`;

            // ---=== Message Actions Dropdown ===---
            const dropdownId = `dropdown-${message.messageId}`;
            // Escape potential quotes in message text/sender name for data attributes
            const escapedMessageContent = safeMessageContent.replace(/"/g, '&quot;');
            const escapedSenderName = safeSenderName.replace(/"/g, '&quot;');

            let dropdownHtml = `
            <div class="dropdown align-self-start message-actions">
                <a class="btn btn-link text-muted p-1 mt-n1 ms-n1" href="#" role="button" data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                    <i class="ri-more-2-fill"></i>
                </a>
                <div class="dropdown-menu dropdown-menu-${alignClass === 'right' ? 'end' : 'start'}" aria-labelledby="${dropdownId}">
                    <a class="dropdown-item reply-message" href="#" data-message-id="${message.messageId}" data-message-text="${escapedMessageContent}" data-sender-name="${escapedSenderName}">
                       <i class="ri-reply-line me-2 text-muted align-bottom"></i>پاسخ
                    </a>
                    <a class="dropdown-item copy-message" href="#" data-message-id="${contentWrapperId}"> ${/* Use content wrapper ID for copy */''}
                       <i class="ri-file-copy-line me-2 text-muted align-bottom"></i>کپی
                    </a>`;
            if (isSender) {
                dropdownHtml += `
                    <a class="dropdown-item delete-message" href="#" data-message-id="${message.messageId}">
                       <i class="ri-delete-bin-5-line me-2 text-muted align-bottom"></i>حذف
                    </a>`;
            }
            dropdownHtml += `</div></div>`;

            // ---=== Build Message Meta (Container for Actions, Time, Status) ===---
            //    This goes *outside* the ctext-wrap, but *inside* user-chat-content
            const messageMetaHtml = `
            <div class="conversation-meta">
                <div class="conversation-actions">
                    ${dropdownHtml}
                </div>
                <small class="text-muted time">${messageTime}</small>
                ${isSender ? '<span class="text-success check-message-icon fs-12 ms-1"><i class="ri-check-double-line"></i></span>' : ''}
             </div>`;


            // ---=== Assemble Complete Message LI ===---
            // Note: Adjust avatar classes based on your template's exact structure if needed.
            const avatarHtml = !isSender ? `
            <div class="flex-shrink-0 chat-user-img align-self-start me-3 ms-0"> ${/* Example classes */''}
                <img src="${senderAvatar}" class="rounded-circle avatar-xs" alt="${safeSenderName}">
                 ${/* Add status indicator if needed: <span class="user-status"></span> */''}
            </div>` : '';

            // Final structure putting the bubble and meta side-by-side within user-chat-content
            const fullMessageHtml = `
            <li class="${alignClass}" id="${messageDomId}" ${message.isSending ? 'style="opacity: 0.6;"' : ''}> ${/* Add opacity for optimistic messages */''}
                <div class="conversation-list">
                    ${avatarHtml}
                    <div class="user-chat-content">
                         ${/* The message bubble itself */''}
                         ${messageBubbleHtml}
                         ${/* The meta information (actions, time, status) */''}
                         ${messageMetaHtml}
                    </div>
                </div>
            </li>`;

            return fullMessageHtml;

        } catch (error) {
            // Log error with more context
            console.error(`[ChatApp] Error building message HTML for messageId ${message?.messageId}:`, message, error);
            return ""; // Return empty string to prevent inserting broken HTML
        }
    }

    // ---=== Helper Functions (Make sure these exist and are correct) ===---

    /**
     * Formats an ISO timestamp string into a readable time format (e.g., HH:MM AM/PM).
     * @param {string} isoString - The ISO date string.
     * @returns {string} Formatted time string or current time as fallback.
     */
    function formatTimestamp(isoString) {
        if (!isoString) return getCurrentTimeFormatted();
        try {
            const date = new Date(isoString);
            if (isNaN(date)) {
                console.warn("[ChatApp] Invalid date string provided to formatTimestamp:", isoString);
                return getCurrentTimeFormatted();
            }
            return date.toLocaleTimeString('fa-IR', { hour: 'numeric', minute: '2-digit', hour12: false }); // یا 'en-US' برای AM/PM
        } catch (error) {
            console.error("[ChatApp] Error formatting timestamp:", isoString, error);
            return getCurrentTimeFormatted();
        }
    }

    /**
     * Gets the current time formatted as HH:MM AM/PM.
     * @returns {string} Formatted current time string.
     */
    function getCurrentTimeFormatted() {
        try {
            const now = new Date();
            return now.toLocaleTimeString('fa-IR', { hour: 'numeric', minute: '2-digit', hour12: false }); // یا 'en-US' برای AM/PM
        } catch (error) {
            console.error("[ChatApp] Error in getCurrentTimeFormatted:", error);
            return "??:??";
        }
    }

    /**
     * Basic HTML sanitizer to prevent XSS. For production, consider a robust library like DOMPurify.
     * @param {string} htmlString - The potentially unsafe HTML string.
     * @returns {string} The sanitized string (HTML tags are escaped).
     */
    function sanitizeHtml(htmlString) {
        if (typeof htmlString !== 'string') return "";
        const tempDiv = document.createElement('div');
        tempDiv.textContent = htmlString;
        return tempDiv.innerHTML;
        // OR using a library: return DOMPurify.sanitize(htmlString);
    }

    // ---=== Helper Functions (Make sure these exist and are correct) ===---

    /**
     * Formats an ISO timestamp string into a readable time format (e.g., HH:MM AM/PM).
     * @param {string} isoString - The ISO date string.
     * @returns {string} Formatted time string or current time as fallback.
     */
    function formatTimestamp(isoString) {
        if (!isoString) return getCurrentTimeFormatted();
        try {
            const date = new Date(isoString);
            if (isNaN(date)) {
                console.warn("[ChatApp] Invalid date string provided to formatTimestamp:", isoString);
                return getCurrentTimeFormatted();
            }
            return date.toLocaleTimeString('fa-IR', { hour: 'numeric', minute: '2-digit', hour12: false }); // یا 'en-US' برای AM/PM
        } catch (error) {
            console.error("[ChatApp] Error formatting timestamp:", isoString, error);
            return getCurrentTimeFormatted();
        }
    }

    /**
     * Gets the current time formatted as HH:MM AM/PM.
     * @returns {string} Formatted current time string.
     */
    function getCurrentTimeFormatted() {
        try {
            const now = new Date();
            return now.toLocaleTimeString('fa-IR', { hour: 'numeric', minute: '2-digit', hour12: false }); // یا 'en-US' برای AM/PM
        } catch (error) {
            console.error("[ChatApp] Error in getCurrentTimeFormatted:", error);
            return "??:??";
        }
    }

    /**
     * Basic HTML sanitizer to prevent XSS. For production, consider a robust library like DOMPurify.
     * @param {string} htmlString - The potentially unsafe HTML string.
     * @returns {string} The sanitized string (HTML tags are escaped).
     */
    function sanitizeHtml(htmlString) {
        if (typeof htmlString !== 'string') return "";
        const tempDiv = document.createElement('div');
        tempDiv.textContent = htmlString;
        return tempDiv.innerHTML;
        // OR using a library: return DOMPurify.sanitize(htmlString);
    }

    // Example of currentUserId and defaultAvatar (Make sure these are defined globally or passed correctly)
    // const currentUserId = window.chatAppConfig?.currentUserId;
    // const defaultAvatar = "/assets/images/users/user-dummy-img.jpg";



    function buildContactHtml(contact) {
        if (!contact || !contact.id || !contact.name) {
            console.error("[ChatApp] buildContactHtml: Invalid contact object received:", contact);
            return ""; // Return empty string for invalid contacts
        }
        try {
            const isActive = contact.id === currentChatTargetId;
            const isOnline = contact.status === 'online';
            // --- Sanitize Inputs ---
            const safeName = sanitizeHtml(contact.name || '');
            const safeLastMessage = contact.lastMessage ? sanitizeHtml(contact.lastMessage) : "---";
            // --- End Sanitize ---
            const lastMessageTime = contact.lastMessageTimestamp ? formatTimestamp(contact.lastMessageTimestamp) : "";
            const unreadCount = contact.unreadCount || 0;
            const avatar = contact.avatar || (contact.type === 'channel' ? multiUserAvatar : defaultAvatar);
            const contactId = `contact-${contact.id}`; // Unique ID for the <li> element

            // --- ساخت HTML نشانگر ---
            let unreadIndicatorHtml = '';
            if (unreadCount > 0) {
                // استفاده از کلمه "جدید" به جای تعداد
                unreadIndicatorHtml = `
                    <span class="badge badge-soft-danger rounded p-1 px-2 contact-unread">
                        جدید
                    </span>`;
            }
            // --- پایان ساخت HTML نشانگر ---

            // --- ساختار HTML اصلی ---
            return `
                <li id="${contactId}" class="${isActive ? 'active' : ''}" data-id="${contact.id}" data-type="${contact.type || 'user'}">
                    <a href="javascript: void(0);">
                        <div class="d-flex">
                            <div class="flex-shrink-0 chat-user-img ${isOnline ? 'online' : 'away'} align-self-center me-3 ms-0">
                                <img src="${avatar}" class="rounded-circle avatar-xs" alt="${safeName}">
                                <span class="user-status"></span>
                            </div>
                            <div class="flex-grow-1 overflow-hidden">
                                <p class="text-truncate mb-0 contact-name">${safeName}</p>
                                <p class="text-truncate mb-0 fs-12 contact-last-message">${safeLastMessage}</p>
                            </div>
                            <div class="flex-shrink-0 ms-2 align-self-start">
                                ${lastMessageTime ? `<small class="fs-11 mb-1 contact-time text-muted d-block">${lastMessageTime}</small>` : ''}
                                ${unreadIndicatorHtml}
                            </div>
                        </div>
                    </a>
                </li>`;
        } catch (error) {
            console.error("[ChatApp] Error in buildContactHtml for contact:", contact, error);
            return ""; // Return empty string on error
        }
    }

    // --- توابع کمکی (مطمئن شو که وجود دارند و درست کار می‌کنند) ---
    function sanitizeHtml(text) {
        if (!text) return "";
        const temp = document.createElement('div');
        temp.textContent = text;
        return temp.innerHTML;
    }

    function formatTimestamp(timestamp) {
        if (!timestamp) return "";
        try {
            const date = new Date(timestamp);
            if (isNaN(date)) {
                console.warn("[ChatApp] Invalid date string provided to formatTimestamp:", timestamp);
                return getCurrentTimeFormatted(); // یا یک مقدار پیش‌فرض دیگر
            }
            // استفاده از fa-IR برای فرمت زمان فارسی
            return date.toLocaleTimeString('fa-IR', { hour: 'numeric', minute: '2-digit', hour12: false });
        } catch (e) {
            console.error("Error formatting timestamp:", timestamp, e);
            return "";
        }
    }

    function getCurrentTimeFormatted() {
        try {
            const now = new Date();
            // استفاده از fa-IR برای فرمت زمان فارسی
            return now.toLocaleTimeString('fa-IR', { hour: 'numeric', minute: '2-digit', hour12: false });
        } catch (error) {
            console.error("[ChatApp] Error in getCurrentTimeFormatted:", error);
            return "??:??";
        }
    }





    // ---=== UI UPDATE FUNCTIONS ===---

    function updateChatHeader(targetId, type = 'user') {
        const contact = contacts.find(c => c.id === targetId);
        console.log(`[ChatApp] Updating chat header for target: ${targetId}`, contact);

        if (!contact || !topBarContainer) {
            console.warn(`[ChatApp] Cannot update header. Contact ${targetId} not found or header elements missing.`);
            // Optionally hide or reset header
            if (topBarContainer) topBarContainer.style.visibility = 'hidden';
            return;
        }

        topBarContainer.style.visibility = 'visible';
        const safeName = sanitizeHtml(contact.name || "---");
        const avatar = contact.avatar || (type === 'channel' ? multiUserAvatar : defaultAvatar);
        const isOnline = contact.status === 'online';
        const statusText = type === 'channel' ? `${contact.memberCount || '?'} عضو` : (isOnline ? 'آنلاین' : 'آفلاین'); // Example status text

        if (topBarUsernameElement) topBarUsernameElement.textContent = safeName;
        if (topBarStatusElement) topBarStatusElement.textContent = statusText;
        if (topBarAvatarImgElement) topBarAvatarImgElement.src = avatar;

        if (topBarAvatarStatusElement) {
            topBarAvatarStatusElement.className = `user-status ${isOnline ? 'online' : 'away'}`; // Reset and apply class
        }
        // Update status class on the parent div as well (like in buildContactHtml)
        const avatarWrapper = topBarAvatarImgElement?.closest('.chat-user-img');
        if (avatarWrapper) {
            avatarWrapper.classList.remove('online', 'away');
            if (type === 'user') { // Only show status indicator for users
                avatarWrapper.classList.add(isOnline ? 'online' : 'away');
            }
        }

        // Update Offcanvas Profile information (optional, based on if user clicks profile icon)
        if (offcanvasUserProfile && type === 'user') { // Only update for users
            if (offcanvasUserProfileName) offcanvasUserProfileName.textContent = safeName;
            if (offcanvasUserProfileStatus) offcanvasUserProfileStatus.textContent = statusText;
            if (offcanvasUserProfileAvatar) offcanvasUserProfileAvatar.src = avatar;
        }
        console.log("[ChatApp] Chat header updated.");
    }

    function renderUserList(userContacts) {
        if (!userListElement) return;
        console.log("[ChatApp] Rendering user list:", userContacts);
        userListElement.innerHTML = userContacts.length > 0
            ? userContacts.map(buildContactHtml).join('')
            : '<li class="text-center text-muted p-3">هیچ کاربری یافت نشد.</li>';
        attachContactClickListeners(); // Re-attach listeners after rendering
    }

    function renderChannelList(channelContacts) {
        if (!channelListElement) return;
        console.log("[ChatApp] Rendering channel list:", channelContacts);
        channelListElement.innerHTML = channelContacts.length > 0
            ? channelContacts.map(buildContactHtml).join('')
            : '<li class="text-center text-muted p-3">هیچ کانالی یافت نشد.</li>';
        attachContactClickListeners(); // Re-attach listeners after rendering
    }

    function displayChatHistory(messages) {
        const listElement = currentChatType === 'user' ? conversationListElement : channelConversationListElement; // <--- مطمئن شو این المنت‌ها درست مقداردهی اولیه شدن
        const loaderToHide = currentChatType === 'user'
            ? document.getElementById('elmLoaderUser')
            : document.getElementById('elmLoaderChannel');

        if (!listElement) {
            console.error("[ChatApp] Cannot display chat history: listElement not found.");
            if (loaderToHide) showLoader(false, loaderToHide); // حتی اگه لیست نیست، لودر رو مخفی کن
            return;
        }

        listElement.innerHTML = ""; // Clear previous messages
        chatHistory = messages || []; // Store history (مطمئن شو که null نیست)

        // ---=== تغییر اصلی اینجاست ===---
        if (chatHistory.length === 0) {
            // اگر آرایه پیام‌ها خالی است، یک پیام جایگزین نمایش بده
            let placeholderText = "";
            if (currentChatType === 'user') {
                // پیام برای چت خصوصی
                const targetContact = contacts.find(c => c.id === currentChatTargetId);
                const contactName = targetContact ? targetContact.name : "این کاربر"; // اسم کاربر رو بگیر اگه داری
                placeholderText = `
                <li class="text-center p-4">
                    <div class="fs-15 text-muted">
                         هیچ پیامی با <strong>${contactName}</strong> وجود ندارد. <br>
                         اولین پیام را شما ارسال کنید!
                    </div>
                 </li>`;
            } else {
                // پیام برای کانال (اگر پیاده‌سازی کنی)
                placeholderText = `
                 <li class="text-center p-4">
                     <div class="fs-15 text-muted">
                         هنوز پیامی در این کانال ارسال نشده است.
                     </div>
                 </li>`;
            }
            listElement.innerHTML = placeholderText;
        } else {
            // اگر پیام وجود دارد، آن‌ها را نمایش بده
            messages.forEach(msg => {
                const isSender = msg.fromUserId === currentUserId; // مطمئن شو currentUserId درست تنظیم شده
                const messageHtml = buildMessageHtml(msg, isSender);
                listElement.insertAdjacentHTML("beforeend", messageHtml);
            });
            // Listener ها رو فقط وقتی پیام هست اضافه کن
            attachMessageActionListeners();
        }
        // ---=== پایان تغییر ===---

        // اسکرول به پایین (شاید برای پیام خالی نیازی نباشه، ولی ضرر نداره)
        scrollToBottom(listElement.closest('[data-simplebar]')?.id || "chat-conversation"); // آیدی المان simplebar رو پیدا کن

        // مخفی کردن لودر
        if (loaderToHide) {
            showLoader(false, loaderToHide);
        } else {
            console.warn("[ChatApp] Could not find loader element to hide in displayChatHistory.");
        }
    }

    function displayNewMessage(message) {
        // --- Basic Validation ---
        if (!message || !message.id || !message.fromUserId) {
            console.warn("[ChatApp] displayNewMessage: Attempted to display invalid message object:", message);
            return;
        }

        // --- Determine Message Relevance ---
        const isSender = message.fromUserId === currentUserId; // Is the current user the sender?
        const targetIsCurrentChat = (isSender && message.toUserId === currentChatTargetId) || // Sent by me TO the current chat target
            (!isSender && message.fromUserId === currentChatTargetId); // Received FROM the current chat target
        // Add channel logic here if needed (e.g., || message.channelId === currentChatTargetId)

        // --- Case 1: Message is for the Currently Active Chat ---
        if (targetIsCurrentChat && conversationListElement) {
            console.log("[ChatApp] Appending new message to current chat:", message);

            // Build and append the message HTML
            const messageHtml = buildMessageHtml(message); // buildMessageHtml determines sender side automatically now
            conversationListElement.insertAdjacentHTML('beforeend', messageHtml);

            // Optional: Refresh lightbox if the new message contains an image gallery trigger
            if (message.attachmentUrl && message.attachmentType?.startsWith('image/')) {
                // Assuming initializeLightbox() can be called again or has a refresh method
                initializeLightbox(); // Or a more specific refresh function if available
            }

            // Scroll to the bottom to show the new message
            scrollToBottom("chat-conversation"); // Ensure this ID matches your scrollable container

            // Add the message to the local chat history cache
            chatHistory.push(message);

            // --- Mark as Read (if received in active window) ---
            // Important: Implement the actual MarkAsRead logic if needed.
            // This might involve calling a SignalR hub method.
            if (!isSender) {
                console.log(`[ChatApp] Message from ${currentChatTargetId} received in active window. Consider marking as read.`);
                // markMessagesAsRead(currentChatTargetId); // Uncomment and implement if needed
            }

            // --- Case 2: Message is for an Inactive Chat (or conversation element missing) ---
        } else {
            console.log(`[ChatApp] Received message for non-active chat (from: ${message.fromUserId}, to: ${message.toUserId}). Updating contact list.`);

            // Determine the contact ID (the other person in the chat)
            const contactId = isSender ? message.toUserId : message.fromUserId;
            const contactIndex = contacts.findIndex(c => c.id === contactId);

            // --- Update Contact in Local Array and UI ---
            if (contactIndex > -1) {
                // 1. Update contact data in the local 'contacts' array
                // Use appropriate message content (text or placeholder for attachments)
                contacts[contactIndex].lastMessage = message.text || (message.attachments?.length > 0 ? "فایل پیوست" : "...");
                contacts[contactIndex].lastMessageTimestamp = message.sentAt || new Date().toISOString(); // Use server time or current time

                let newUnreadCount = contacts[contactIndex].unreadCount || 0;
                if (!isSender) { // Only increment if the message was *received* by the current user
                    newUnreadCount++;
                    contacts[contactIndex].unreadCount = newUnreadCount;
                }
                console.log(`[ChatApp] Updated contact data ${contactId}: Unread=${newUnreadCount}, LastMsg=${sanitizeHtml(contacts[contactIndex].lastMessage)}`);

                // 2. Update the specific contact item in the UI for efficiency
                const contactElement = document.getElementById(`contact-${contactId}`); // Ensure ID format matches buildContactHtml
                if (contactElement) {
                    // Find specific elements within the contact's LI to update
                    const lastMsgElem = contactElement.querySelector('.contact-last-message');
                    const timeElem = contactElement.querySelector('.contact-time');
                    let unreadElem = contactElement.querySelector('.contact-unread'); // Find existing badge

                    // Update Last Message and Time
                    if (lastMsgElem) lastMsgElem.textContent = sanitizeHtml(contacts[contactIndex].lastMessage);
                    if (timeElem) timeElem.textContent = formatTimestamp(contacts[contactIndex].lastMessageTimestamp);

                    // --- Update Unread Badge (Display "جدید") ---
                    if (newUnreadCount > 0) {
                        const badgeText = "جدید"; // <<< *** THE FIX: Use "جدید" text ***

                        if (unreadElem) {
                            // If badge element already exists, update its text and ensure it's visible
                            unreadElem.textContent = badgeText;
                            unreadElem.style.display = 'inline-block'; // Make sure it's visible
                            console.log(`[ChatApp] Updated existing badge for ${contactId} to "${badgeText}".`);
                        } else {
                            // If badge element doesn't exist, create it
                            // Find the container where the time and badge reside
                            const timeContainer = contactElement.querySelector('.flex-shrink-0.ms-2.align-self-start'); // Adjust selector if needed
                            if (timeContainer) {
                                unreadElem = document.createElement('span'); // Create the new badge element
                                unreadElem.className = 'badge badge-soft-danger rounded p-1 px-2 contact-unread'; // Apply classes
                                unreadElem.textContent = badgeText; // <<< *** Set text to "جدید" ***
                                timeContainer.appendChild(unreadElem); // Add the new badge to the DOM
                                console.log(`[ChatApp] Created new badge for ${contactId} with text "${badgeText}".`);
                            } else {
                                console.warn(`[ChatApp] Could not find time container in contact-${contactId} to append new badge.`);
                            }
                        }
                    } else {
                        // If unread count is 0 (e.g., after marking as read elsewhere), hide the badge
                        if (unreadElem) {
                            unreadElem.style.display = 'none';
                            console.log(`[ChatApp] Hiding badge for ${contactId} as unread count is 0.`);
                        }
                    }
                    // --- End Unread Badge Update ---

                    console.log(`[ChatApp] Contact list item UI updated for ${contactId}.`);

                    // --- Optional: Move updated contact to the top ---
                    // Consider implementing a function to reorder the contact list based on last message time
                    // Example: bringContactToTop(contactId);

                } else {
                    // Fallback if the element wasn't found (less likely with correct IDs)
                    console.warn(`[ChatApp] Could not find contact element with ID: contact-${contactId} to update UI directly. Consider full list re-render.`);
                    // Fallback: Re-render the whole list (less efficient, uncomment if necessary)
                    // renderUserList(contacts.filter(c => c.type === 'user'));
                    // renderChannelList(contacts.filter(c => c.type === 'channel'));
                }
            } else {
                // Contact not found in the local list - might happen if a new person messages
                console.warn(`[ChatApp] Received message, but contact ${contactId} not found in local list. Consider fetching updated contacts.`);
                // Optional: Invoke a server method to get updated contact info or add the new contact
                // Example: connection.invoke("RequestContactInfo", contactId);
            }
        }
    }


    // ---=== EVENT HANDLERS ===---
    console.log("[ChatApp] Attaching event handlers...");

    // Handle click on a contact in the sidebar
    function handleContactClick(event) {
        event.preventDefault();
        // const linkElement = event.currentTarget; // The <a> element
        const listItem = event.target.closest('li'); // The parent <li> element

        if (!listItem) {
            console.warn("[ChatApp] handleContactClick: Could not find parent <li> for the clicked link.");
            return;
        }

        // Prevent unnecessary actions if the clicked item is already active
        if (listItem.classList.contains('active')) {
            console.log("[ChatApp] handleContactClick: Clicked on already active contact. No action taken.");
            // On mobile, might still want to hide sidebar if needed
            if (window.innerWidth < 992) { // Example breakpoint for mobile view toggle
                // Consider adding logic to hide the sidebar here if that's the desired behavior
            }
            return;
        }

        const contactId = listItem.dataset.id;
        const contactType = listItem.dataset.type || 'user'; // Get type from data attribute
        const contact = contacts.find(c => c.id === contactId);

        if (!contact) {
            console.error(`[ChatApp] handleContactClick: Contact data not found for ID: ${contactId}`);
            // Optionally show an error to the user
            return;
        }

        console.log(`[ChatApp] handleContactClick: Switching chat to ${contactType} ID: ${contactId} (${contact.name})`);

        // Update active state in UI
        // Remove 'active' from previously active item in both lists
        const currentlyActive = document.querySelector('#userList li.active, #channelList li.active');
        if (currentlyActive) {
            currentlyActive.classList.remove('active');
        }
        listItem.classList.add('active');

        // Update state variables
        currentChatTargetId = contactId;
        currentChatType = contactType;

        // Update UI elements
        if (welcomeViewElement) welcomeViewElement.style.display = 'none'; // Hide welcome screen
        if (chatContentElement) chatContentElement.style.display = 'flex'; // Show chat content area (use flex if it's a flex container)
        if (userChatElement) userChatElement.classList.add("user-chat-show"); // Show the main chat panel
        if (chatWrapperElement) chatWrapperElement.classList.add("usr-chat-show"); // Required for mobile view responsiveness

        updateChatHeader(currentChatTargetId, currentChatType);
        showLoader(true, historyLoaderElement); // Show loader specifically for chat history area
        if (conversationListElement) conversationListElement.innerHTML = ""; // Clear previous messages immediately

        // Reset reply state
        hideReplyCard();

        // Request chat history from server
        console.log(`[ChatApp] Requesting chat history for ${currentChatType} ID: ${currentChatTargetId}`);
        if (connection && connection.state === signalR.HubConnectionState.Connected) {
            console.log(`[ChatApp] Invoking LoadChatHistory for target ID: ${currentChatTargetId}`); // <-- اضافه کردن لاگ برای اطمینان

            // ******** تغییر اصلی اینجاست ********
            // فقط currentChatTargetId رو ارسال کن، چون متد C# فقط همینو انتظار داره
            connection.invoke("LoadChatHistory", currentChatTargetId)
                .then(() => {
                    // این بلاک then فقط نشون میده که *فراخوانی* اولیه موفق بوده.
                    // تاریخچه واقعی از طریق رویداد 'LoadHistory' که سرور میفرسته دریافت میشه.
                    console.log(`[ChatApp] LoadChatHistory invocation presumably succeeded for ${currentChatTargetId}. Waiting for 'LoadHistory' event.`);

                    // Reset unread count in local state and UI
                    // (این قسمت رو میتونی نگه داری یا به هندلر LoadHistory منتقل کنی،
                    //  ولی نگه داشتنش اینجا سریعتر UI رو آپدیت میکنه)
                    const contactIndex = contacts.findIndex(c => c.id === contactId);
                    if (contactIndex > -1 && contacts[contactIndex].unreadCount > 0) {
                        console.log(`[ChatApp] Resetting unread count for ${contactId}.`);
                        contacts[contactIndex].unreadCount = 0;
                        // Update UI for this contact specifically
                        const contactElement = document.getElementById(`contact-${contactId}`);
                        if (contactElement) {
                            // از buildContactHtml استفاده کن تا مطمئن بشی HTML به‌روزه
                            const updatedHtml = buildContactHtml(contacts[contactIndex]);
                            if (contactElement.outerHTML !== updatedHtml) { // فقط اگر تغییر کرده، آپدیت کن
                                contactElement.outerHTML = updatedHtml;
                                // Listener رو دوباره به عنصر جدید اضافه کن (مهمه!)
                                const newElement = document.getElementById(`contact-${contactId}`);
                                newElement?.querySelector('a')?.addEventListener('click', (e) => handleContactClick(e)); // استفاده از تابع اصلی
                            } else {
                                // اگر HTML تغییر نکرده، فقط badge رو آپدیت کن (بهینه‌تر)
                                const unreadElem = contactElement.querySelector('.contact-unread');
                                if (unreadElem) {
                                    unreadElem.textContent = '0';
                                    unreadElem.style.display = 'none'; // Hide the badge
                                }
                            }
                            console.log(`[ChatApp] Unread count UI updated for ${contactId}.`);
                        } else {
                            console.warn(`[ChatApp] Could not find contact element contact-${contactId} to reset unread count UI.`);
                        }
                    }
                    // نیازی به showLoader(false) اینجا نیست، چون در displayChatHistory (که با LoadHistory فعال میشه) انجام میشه.
                })
                .catch(err => {
                    // این catch خطاهای مربوط به *فراخوانی* رو میگیره (مثل عدم اتصال، خطای سرور قبل از اجرای متد و ...)
                    console.error(`[ChatApp] LoadChatHistory INVOCATION failed for ${currentChatTargetId}: `, err);
                    showLoader(false, historyLoaderElement); // در صورت خطا حتما لودر رو مخفی کن
                    // نمایش پیام خطا در پنجره چت
                    if (conversationListElement) {
                        conversationListElement.innerHTML = `<li class="text-center text-danger p-3">خطا در فرآیند بارگذاری تاریخچه چت.</li>`;
                    }
                });
        } else {
            console.error("[ChatApp] Cannot invoke LoadChatHistory: SignalR connection not established or not in Connected state.");
            showLoader(false, historyLoaderElement); // لودر رو مخفی کن
            // نمایش پیام خطا در پنجره چت
            if (conversationListElement) {
                conversationListElement.innerHTML = `<li class="text-center text-warning p-3">اتصال برقرار نیست. لطفاً از اتصال اینترنت خود مطمئن شوید و صفحه را رفرش کنید.</li>`;
            }
        }
    }

    // Handle Chat Form Submission
    function handleSendMessage(event) {
        event.preventDefault();
        const messageText = chatInputElement?.value.trim();

        // ---=== بررسی انتخاب مخاطب (تغییر اصلی اینجاست) ===---
        if (!currentChatTargetId) {
            console.warn("[ChatApp] handleSendMessage: No active chat target selected.");

            // نمایش بازخورد به کاربر
            if (chatInputElement) {
                chatInputElement.classList.add('is-invalid'); // کادر ورودی رو قرمز کن

                // المنت بازخورد رو پیدا کن یا بساز
                // از کلاس 'no-target-feedback' برای تمایز استفاده می‌کنیم
                let feedbackElement = chatInputElement.parentElement.querySelector('.invalid-feedback.no-target-feedback');
                if (!feedbackElement) {
                    feedbackElement = document.createElement('div');
                    feedbackElement.className = 'invalid-feedback no-target-feedback chat-input-feedback'; // کلاس‌های لازم + کلاس اختصاصی
                    feedbackElement.textContent = 'لطفا ابتدا یک مخاطب را برای ارسال پیام انتخاب کنید.'; // متن خطا
                    // قبل از المنت بازخوردِ "پیام خالی" (اگر وجود دارد) اضافه کن یا فقط به والد اضافه کن
                    const existingFeedback = chatInputElement.parentElement.querySelector('.invalid-feedback');
                    if (existingFeedback) {
                        chatInputElement.parentElement.insertBefore(feedbackElement, existingFeedback);
                    } else {
                        chatInputElement.parentElement.appendChild(feedbackElement);
                    }
                }
                feedbackElement.style.display = 'block'; // نمایش خطا

                // مخفی کردن خودکار بعد از چند ثانیه
                setTimeout(() => {
                    chatInputElement.classList.remove('is-invalid');
                    feedbackElement.style.display = 'none';
                }, 3000); // 3 ثانیه
            }
            return; // <<< مهم: جلوی ادامه کار رو بگیر
        }
        // ---=== پایان بررسی انتخاب مخاطب ===---

        // --- بررسی خالی بودن متن پیام (کد قبلی شما، با کمی بهبود برای تمایز) ---
        if (!messageText) {
            console.warn("[ChatApp] handleSendMessage: Message text is empty.");
            if (chatInputElement) {
                chatInputElement.classList.add('is-invalid');
                // المنت بازخورد رو پیدا کن یا بساز
                // از کلاس 'empty-message-feedback' برای تمایز استفاده می‌کنیم
                let feedbackElement = chatInputElement.parentElement.querySelector('.invalid-feedback.empty-message-feedback');
                if (!feedbackElement) {
                    feedbackElement = document.createElement('div');
                    feedbackElement.className = 'invalid-feedback empty-message-feedback chat-input-feedback'; // کلاس‌های لازم + کلاس اختصاصی
                    feedbackElement.textContent = 'لطفا پیامی وارد کنید.'; // متن خطا
                    // قبل از المنت بازخوردِ "مخاطب نامشخص" (اگر وجود دارد) اضافه کن یا فقط به والد اضافه کن
                    const existingFeedback = chatInputElement.parentElement.querySelector('.invalid-feedback');
                    if (existingFeedback) {
                        chatInputElement.parentElement.insertBefore(feedbackElement, existingFeedback);
                    } else {
                        chatInputElement.parentElement.appendChild(feedbackElement);
                    }
                }
                feedbackElement.style.display = 'block'; // نمایش خطا

                // مخفی کردن خودکار
                setTimeout(() => {
                    // فقط اگه خطای دیگری (مثل عدم انتخاب مخاطب) همزمان فعال نیست، is-invalid رو بردار
                    if (!chatInputElement.parentElement.querySelector('.invalid-feedback.no-target-feedback[style*="block"]')) {
                        chatInputElement.classList.remove('is-invalid');
                    }
                    feedbackElement.style.display = 'none';
                }, 1500); // 1.5 ثانیه
            }
            return; // <<< مهم: جلوی ادامه کار رو بگیر
        }
        // --- پایان بررسی خالی بودن متن پیام ---

        // --- بررسی اتصال SignalR (بدون تغییر) ---
        if (!connection || connection.state !== signalR.HubConnectionState.Connected) {
            console.error("[ChatApp] handleSendMessage: SignalR connection not established.");
            // اینجا هم می‌تونی یه پیام به کاربر نشون بدی (مثلاً با Toast)
            // showToast("خطا", "اتصال برقرار نیست، ارسال پیام ممکن نیست.", "error");
            return;
        }
        // --- پایان بررسی اتصال SignalR ---

        // --- بقیه کد بدون تغییر ---
        console.log(`[ChatApp] Preparing to send message to ${currentChatType} ID: ${currentChatTargetId}. ReplyTo: ${replyingToMessageId || 'N/A'}`);

        // --- Optimistic UI Update ---
        const tempMessageId = `temp_${Date.now()}`;
        const optimisticMessage = {
            messageId: tempMessageId,          // <- تغییر از id
            senderUserId: currentUserId,        // <- تغییر از fromUserId
            recipientUserId: currentChatTargetId, // <- تغییر از toUserId (فرض chatType='user')
            content: messageText,             // <- تغییر از text
            timestamp: new Date().toISOString(), // <- تغییر از sentAt
            senderName: "شما",                 // نام موقت فرستنده
            // senderAvatar: window.chatAppConfig?.currentUserAvatar || defaultAvatar, // آواتار موقت
            isRead: false,
            isDeleted: false,                  // اضافه شد برای سازگاری
            isSender: true,                    // اضافه شد برای سازگاری
            replyToMessageId: isReplying ? replyingToMessageId : null,
            replyToText: isReplying ? replyCardMessageElement?.textContent : null,
            replyToSenderName: isReplying ? replyCardNameElement?.textContent : null,
            isSending: true                    // Flag موقت
        };

        // Build and display the temporary message using the updated buildMessageHtml
        const messageHtml = buildMessageHtml(optimisticMessage); // حالا باید بدون خطا کار کند
        if (conversationListElement && messageHtml) { // چک کنید که messageHtml خالی نباشد
            conversationListElement.insertAdjacentHTML('beforeend', messageHtml);
            scrollToBottom("chat-conversation");
            const tempElement = document.getElementById(`chat-id-${tempMessageId}`); // ID باید با buildMessageHtml مچ باشد
            if (tempElement) tempElement.style.opacity = '0.6';
        } else if (!messageHtml) {
            console.error("[ChatApp] Optimistic message could not be built. HTML was empty.");
        }
        console.log("[ChatApp] Optimistic message prepared:", optimisticMessage); // لاگ کردن آبجکت جدید

        // Clear input and hide reply card AFTER getting values
        if (chatInputElement) chatInputElement.value = "";
        // emojiPicker?.reset(); // اگر از ایموجی پیکر استفاده می‌کنید
        hideReplyCard();

        // --- Send message via SignalR ---
        console.log(`[ChatApp] Invoking 'SendMessage' on Hub...`);
        connection.invoke("SendMessage",
            messageText,                         // 1. string message
            currentChatTargetId,                 // 2. string recipientUserId
            isReplying ? replyingToMessageId : null // 3. string? replyToMessageId
        )
            .then((confirmedMessage) => {
    console.log("[ChatApp] 'SendMessage' successful. Server confirmation:", confirmedMessage);
    const tempElement = document.getElementById(`chat-id-${tempMessageId}`);

    // ---=== اصلاح کلیدی: استفاده از messageId و timestamp ===---
    if (tempElement && confirmedMessage && confirmedMessage.messageId) { // <-- بررسی وجود messageId
        console.log(`[ChatApp] Updating optimistic message ${tempMessageId} with confirmed ID ${confirmedMessage.messageId}`); // <-- استفاده از messageId
        tempElement.id = `chat-id-${confirmedMessage.messageId}`; // <-- استفاده از messageId
        tempElement.style.opacity = '1';

        // Update data attributes
        const replyBtn = tempElement.querySelector(`.reply-message`);
        if (replyBtn) replyBtn.dataset.messageId = confirmedMessage.messageId; // <-- استفاده از messageId
        const copyBtn = tempElement.querySelector(`.copy-message`);
        // **نکته:** مطمئن شو که ID المنت محتوا (`ctext-wrap-content`) هم با messageId ساخته می‌شود یا نیاز به آپدیت دارد.
        // فرض می‌کنیم ID کپی بر اساس messageId پیام است.
        if (copyBtn) {
             // اینجا باید تصمیم بگیری ID مورد نیاز دکمه کپی چیست.
             // اگر ID خود پیام است:
             // copyBtn.dataset.messageId = confirmedMessage.messageId;
             // اگر ID المنت محتوای متن است (مثلا content-{messageId}):
              copyBtn.dataset.messageId = `content-${confirmedMessage.messageId}`; // <-- آپدیت با messageId (اگر ID محتوا این الگو را دارد)
             // یا اگر دکمه کپی نیاز به ID ندارد و متن را از جای دیگری می‌خواند، این خط لازم نیست.
        }
        const deleteBtn = tempElement.querySelector(`.delete-message`);
        if (deleteBtn) deleteBtn.dataset.messageId = confirmedMessage.messageId; // <-- استفاده از messageId

        // Update timestamp
        const timeElement = tempElement.querySelector('.chat-time');
        if (timeElement && confirmedMessage.timestamp) { // <-- بررسی و استفاده از timestamp
            timeElement.innerHTML = `<i class="ri-time-line align-bottom"></i> ${formatTimestamp(confirmedMessage.timestamp)}`; // <-- استفاده از timestamp
        }

        // Update local chatHistory
        const historyIndex = chatHistory.findIndex(m => m.messageId === tempMessageId); // <-- پیدا کردن با messageId موقت
        if (historyIndex > -1) {
            // جایگزینی کامل با حفظ فلگ‌ها
             chatHistory[historyIndex] = {
                ...confirmedMessage, // تمام مقادیر برگشتی از سرور
                id: confirmedMessage.messageId, // اطمینان از وجود پراپرتی id هم برای سازگاری‌های احتمالی دیگر
                isSending: false // حذف فلگ در حال ارسال
            };
            console.log(`[ChatApp] Updated message in history cache: ${confirmedMessage.messageId}`);
        } else {
            // به عنوان fallback، اگر پیدا نشد اضافه کن (که نباید اتفاق بیفتد)
            chatHistory.push({ ...confirmedMessage, id: confirmedMessage.messageId, isSending: false });
            console.warn(`[ChatApp] Optimistic message ${tempMessageId} not found in history, pushed confirmed message ${confirmedMessage.messageId}.`);
        }

    } else if (tempElement) {
        // این حالت فقط اگر confirmedMessage یا messageId آن null باشد اتفاق می‌افتد
        console.warn(`[ChatApp] Received confirmation from server for ${tempMessageId}, but confirmedMessage or confirmedMessage.messageId is missing. Removing optimistic message.`, confirmedMessage);
        tempElement.remove();
         // حذف از تاریخچه هم اگر اضافه شده بود
         chatHistory = chatHistory.filter(m => m.messageId !== tempMessageId);
    } else {
        // این حالت اگر المنت موقت اصلا پیدا نشود (خیلی بعید)
        console.error(`[ChatApp] Could not find temporary element chat-id-${tempMessageId} to update.`);
         // حذف از تاریخچه هم اگر اضافه شده بود
         chatHistory = chatHistory.filter(m => m.messageId !== tempMessageId);
    }
})
            .catch(err => {
                console.error("[ChatApp] 'SendMessage' invocation failed: ", err);
                const tempElement = document.getElementById(`chat-id-${tempMessageId}`);
                if (tempElement) {
                    tempElement.classList.add("message-failed");
                    tempElement.style.opacity = '1';
                    tempElement.title = "ارسال ناموفق بود";
                    const wrapContent = tempElement.querySelector('.ctext-wrap-content');
                    if (wrapContent && !wrapContent.querySelector('.retry-button')) {
                        const retryButton = document.createElement('button');
                        retryButton.className = 'btn btn-sm btn-warning retry-button ms-2';
                        retryButton.innerHTML = '<i class="ri-refresh-line"></i> تلاش مجدد';
                        retryButton.onclick = () => {
                            // **نکته:** منطق تلاش مجدد پیچیده‌تره، نیاز به ذخیره متن اصلی و وضعیت ریپلای داره
                            console.log(`[ChatApp] Retry requested for failed message (temp ID: ${tempMessageId}). Removing failed element.`);
                            tempElement.remove();
                            // ساده‌ترین کار: فقط به کاربر بگیم دوباره بفرسته
                            alert("خطا در ارسال. لطفا پیام را مجددا تایپ و ارسال کنید.");
                            // chatInputElement.value = optimisticMessage.text; // <-- یا متن رو برگردونیم تو کادر؟
                            // handleSendMessage(event); // <-- فراخوانی مجدد تابع؟ (مراقب حلقه بی نهایت باش)
                        };
                        wrapContent.appendChild(document.createElement('br'));
                        wrapContent.appendChild(retryButton);
                    }
                }
                // Update local chatHistory - remove the failed message
                chatHistory = chatHistory.filter(m => m.id !== tempMessageId);
            });

        // Reset reply state AFTER invoking SendMessage (اینجا جاش درسته)
        // isReplying = false; // اینها داخل hideReplyCard انجام می‌شه
        // replyingToMessageId = null;
    }


    // Handle Click on Reply Button (triggered via delegation)
    function handleReplyClick(messageId, messageText, senderName) {
        if (!messageId || !replyCardElement) {
            console.warn("[ChatApp] handleReplyClick: Missing messageId or reply card element.");
            return;
        }

        console.log(`[ChatApp] Setting up reply to message ID: ${messageId}`);
        isReplying = true;
        replyingToMessageId = messageId;

        // Use sanitized versions if available, otherwise sanitize now
        const safeSenderName = sanitizeHtml(senderName);
        const safeMessageText = sanitizeHtml(messageText);

        if (replyCardNameElement) replyCardNameElement.textContent = safeSenderName;
        if (replyCardMessageElement) replyCardMessageElement.textContent = safeMessageText;

        replyCardElement.classList.add("show");
        chatInputElement?.focus(); // Focus input after clicking reply
    }

    // Handle Click on Close Reply Button
    function hideReplyCard() {
        if (!replyCardElement || !isReplying) return; // Don't do anything if not showing or not replying
        console.log("[ChatApp] Hiding reply card.");
        replyCardElement.classList.remove("show");
        isReplying = false;
        replyingToMessageId = null;
    }

    // Handle Click on Copy Button (triggered via delegation)
    function handleCopyClick(contentWrapperId) {
        const messageContentElement = document.getElementById(contentWrapperId);
        console.log(`[ChatApp] Attempting to copy text from element ID: ${contentWrapperId}`);

        if (messageContentElement) {
            // Find the actual text content within the wrapper
            const textParagraph = messageContentElement.querySelector('p.ctext-content');
            const textToCopy = textParagraph ? textParagraph.innerText : messageContentElement.innerText; // Fallback to innerText of wrapper

            if (textToCopy) {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    console.log("[ChatApp] Text copied to clipboard successfully.");
                    showCopyAlert();
                }).catch(err => {
                    console.error('[ChatApp] Failed to copy text: ', err);
                    // Show error feedback? Maybe a different alert.
                    alert("خطا در کپی کردن متن.");
                });
            } else {
                console.warn("[ChatApp] handleCopyClick: No text found within element:", contentWrapperId);
            }
        } else {
            console.warn("[ChatApp] handleCopyClick: Content element not found:", contentWrapperId);
        }
    }

    // Handle Click on Delete Button (triggered via delegation)
    function handleDeleteClick(messageId) {
        if (!messageId) {
            console.warn("[ChatApp] handleDeleteClick: No message ID provided.");
            return;
        }
        if (!connection || connection.state !== signalR.HubConnectionState.Connected) {
            console.error("[ChatApp] handleDeleteClick: SignalR connection not established.");
            alert("امکان حذف پیام وجود ندارد. اتصال با سرور برقرار نیست.");
            return;
        }

        console.log(`[ChatApp] Attempting to delete message ID: ${messageId}`);

        // Optional: Confirmation dialog
        if (!confirm("آیا از حذف این پیام مطمئن هستید؟ این عمل قابل بازگشت نیست.")) {
            console.log("[ChatApp] Message deletion cancelled by user.");
            return;
        }

        // --- Optimistic UI Update ---
        const messageElement = document.getElementById(`chat-id-${messageId}`);
        if (messageElement) {
            console.log("[ChatApp] Optimistically removing message element from UI.");
            messageElement.style.opacity = '0.5'; // Optional: fade out before removing
            messageElement.style.transition = 'opacity 0.3s ease-out';
            setTimeout(() => messageElement.remove(), 300); // Remove after fade
        } else {
            console.warn(`[ChatApp] handleDeleteClick: Message element chat-id-${messageId} not found for optimistic removal.`);
        }


        // --- Invoke Server Method ---
        console.log(`[ChatApp] Invoking 'DeleteMessage' on Hub for ID: ${messageId}`);
        connection.invoke("DeleteMessage", messageId)
            .then(() => {
                console.log(`[ChatApp] Message ${messageId} deleted successfully on server.`);
                // Update local chatHistory cache
                const initialLength = chatHistory.length;
                chatHistory = chatHistory.filter(m => m.id !== messageId);
                console.log(`[ChatApp] Local chat history updated. Removed ${initialLength - chatHistory.length} message(s).`);
            })
            .catch(err => {
                console.error(`[ChatApp] 'DeleteMessage' failed for ID ${messageId}:`, err);
                alert("خطا در حذف پیام از سرور.");
                // Re-add the message element? Less confusing might be to refresh chat.
                // If the element was removed optimistically, it's now gone.
                // We could potentially re-fetch history or re-insert based on chatHistory (if we didn't filter it yet).
                // Simplest for now: log error, show alert. User might need to manually refresh if UI is inconsistent.
                // To revert: if messageElement was stored, could re-append it.
                console.error("[ChatApp] UI might be inconsistent after failed delete. Consider refreshing chat history.");
            });
    }

    // Handle Mobile Back Button Click
    function handleMobileBackClick() {
        console.log("[ChatApp] Mobile back button clicked.");
        if (userChatElement) userChatElement.classList.remove('user-chat-show');
        if (chatWrapperElement) chatWrapperElement.classList.remove("usr-chat-show");
        // Deactivate contact in the list?
        const currentlyActive = document.querySelector('#userList li.active, #channelList li.active');
        if (currentlyActive) {
            currentlyActive.classList.remove('active');
        }
        currentChatTargetId = null; // Clear current chat target when closing on mobile
        currentChatType = 'user'; // Reset type
        // Optionally show welcome screen again?
        // if(welcomeViewElement) welcomeViewElement.style.display = 'block';
        // if(chatContentElement) chatContentElement.style.display = 'none';
        console.log("[ChatApp] Chat view hidden, active contact cleared.");
    }

    // Handle User Profile Toggle Click
    function handleUserProfileToggle(event) {
        event.preventDefault();
        console.log("[ChatApp] User profile toggle clicked.");
        if (!currentChatTargetId || currentChatType !== 'user') {
            console.warn("[ChatApp] Cannot show profile. No user selected or current target is a channel.");
            // Maybe show a default profile or disable the button?
            return;
        }

        const targetCanvasElement = offcanvasUserProfile; // Use the selected element
        if (targetCanvasElement && window.bootstrap) { // Ensure bootstrap JS is loaded
            console.log("[ChatApp] Toggling user profile offcanvas.");
            // Update profile details *before* showing
            const contact = contacts.find(c => c.id === currentChatTargetId);
            if (contact && offcanvasUserProfile) {
                const safeName = sanitizeHtml(contact.name || "---");
                const avatar = contact.avatar || defaultAvatar;
                const isOnline = contact.status === 'online';
                const statusText = isOnline ? 'آنلاین' : 'آفلاین';

                if (offcanvasUserProfileName) offcanvasUserProfileName.textContent = safeName;
                if (offcanvasUserProfileStatus) offcanvasUserProfileStatus.textContent = statusText;
                if (offcanvasUserProfileAvatar) offcanvasUserProfileAvatar.src = avatar;
                console.log("[ChatApp] Offcanvas profile details updated for:", safeName);
            } else {
                console.warn("[ChatApp] Could not update offcanvas profile details. Contact or elements missing.");
            }

            // Get or create Bootstrap instance and show
            const offcanvasInstance = bootstrap.Offcanvas.getOrCreateInstance(targetCanvasElement);
            offcanvasInstance.show();
        } else {
            console.error("[ChatApp] Cannot toggle profile: Offcanvas element or Bootstrap JS not found.");
        }
    }


    // ---=== ATTACH EVENT LISTENERS ===---

    // Attach listeners to dynamically added contacts (using event delegation on parent ULs)
    function attachContactClickListeners() {
        console.log("[ChatApp] Attaching delegated event listeners for contact clicks.");

        // Function to handle the click event
        const delegateContactClickHandler = (event) => {
            const linkElement = event.target.closest('a'); // Find the closest <a> tag
            if (linkElement) {
                const listItem = linkElement.closest('li'); // Find the parent <li>
                if (listItem && (listItem.closest('#userList') || listItem.closest('#channelList'))) {
                    // Check if the click is directly on the link or inside it, but within our lists
                    console.log("[ChatApp] Delegated contact click detected.");
                    handleContactClick(event); // Call the original handler logic
                }
            }
        };

        // Remove previous listeners to prevent duplicates if this function is called multiple times
        userListElement?.removeEventListener('click', delegateContactClickHandler);
        channelListElement?.removeEventListener('click', delegateContactClickHandler);

        // Add new listeners to the parent UL elements
        if (userListElement) {
            userListElement.addEventListener('click', delegateContactClickHandler);
            console.log("[ChatApp] Delegated click listener attached to userList.");
        } else {
            console.warn("[ChatApp] User list element not found for attaching delegated listener.");
        }
        if (channelListElement) {
            channelListElement.addEventListener('click', delegateContactClickHandler);
            console.log("[ChatApp] Delegated click listener attached to channelList.");
        } else {
            console.warn("[ChatApp] Channel list element not found for attaching delegated listener.");
        }
    }


    // Attach listeners for message actions using EVENT DELEGATION on the conversation list
    function attachMessageActionListeners() {
        if (!conversationListElement) {
            console.error("[ChatApp] Cannot attach message action listeners: conversation list element not found.");
            return;
        }

        console.log("[ChatApp] Attaching delegated event listeners for message actions.");

        // Remove existing listener to prevent duplicates if function is called again (though ideally only once)
        conversationListElement.removeEventListener('click', handleMessageActionClick);
        // Add a single listener to the parent UL
        conversationListElement.addEventListener('click', handleMessageActionClick);
    }

    // The actual handler function for delegated message action clicks
    function handleMessageActionClick(event) {
        const target = event.target; // The element that was actually clicked

        // Check for Reply button click
        const replyButton = target.closest('.reply-message');
        if (replyButton) {
            event.preventDefault();
            console.log("[ChatApp] Delegated 'reply' click detected.");
            const messageId = replyButton.dataset.messageId;
            const messageText = replyButton.dataset.messageText; // Get from data attribute
            const senderName = replyButton.dataset.senderName; // Get from data attribute
            handleReplyClick(messageId, messageText, senderName);
            return; // Stop further processing
        }

        // Check for Copy button click
        const copyButton = target.closest('.copy-message');
        if (copyButton) {
            event.preventDefault();
            console.log("[ChatApp] Delegated 'copy' click detected.");
            const contentWrapperId = copyButton.dataset.messageId; // This should be the ID of the content wrapper div
            handleCopyClick(contentWrapperId);
            return; // Stop further processing
        }

        // Check for Delete button click
        const deleteButton = target.closest('.delete-message');
        if (deleteButton) {
            event.preventDefault();
            console.log("[ChatApp] Delegated 'delete' click detected.");
            const messageId = deleteButton.dataset.messageId;
            handleDeleteClick(messageId);
            return; // Stop further processing
        }

        // Check for Image click (for Lightbox)
        const imageLink = target.closest('a.popup-img');
        if (imageLink && lightbox) {
            console.log("[ChatApp] Delegated 'image' click detected for lightbox.");
            // GLightbox often handles this automatically if selector is set correctly during init.
            // If manual triggering is needed:
            // event.preventDefault();
            // lightbox.open({ href: imageLink.href });
            // However, usually GLightbox initialization is sufficient.
        }

        // Add checks for other actions if needed (e.g., download attachment)
        const downloadLink = target.closest('a[download]');
        if (downloadLink && downloadLink.closest('.attached-file')) {
            console.log("[ChatApp] Delegated 'download' click detected.");
            // Browser should handle the download automatically via the href and download attributes.
            // No specific JS action needed unless you want to track it.
        }
    }

    // Attach listeners that only need to be set once on static elements
    function attachStaticListeners() {
        console.log("[ChatApp] Attaching static event listeners.");

        // Form submission
        if (chatFormElement) {
            chatFormElement.addEventListener("submit", handleSendMessage);
            console.log("[ChatApp] Submit listener attached to chat form.");
        } else {
            console.warn("[ChatApp] Chat form element not found for attaching submit listener.");
        }

        // Close Reply Card Button
        if (closeReplyButton) {
            closeReplyButton.addEventListener("click", hideReplyCard);
            console.log("[ChatApp] Click listener attached to close reply button.");
        } else {
            console.warn("[ChatApp] Close reply button not found.");
        }

        // Mobile back button
        if (userChatRemoveButton) {
            userChatRemoveButton.addEventListener('click', handleMobileBackClick);
            console.log("[ChatApp] Click listener attached to mobile back button.");
        } else {
            console.warn("[ChatApp] Mobile back button (.user-chat-remove) not found.");
        }

        // User profile offcanvas toggle links (using delegation on a common ancestor if possible, otherwise loop)
        if (userProfileShowLinks && userProfileShowLinks.length > 0) {
            userProfileShowLinks.forEach(link => {
                link.addEventListener('click', handleUserProfileToggle);
            });
            console.log(`[ChatApp] Click listeners attached to ${userProfileShowLinks.length} user profile toggle links.`);
        } else {
            console.warn("[ChatApp] User profile toggle links (.user-profile-show) not found.");
        }

        // Listener for Emoji Picker button (often handled by the library's trigger config)
        // Only add if custom behavior is needed beyond the library's init
        // if(emojiButtonElement) { ... }

        // Listener for Search input within the chat conversation
        const searchMessageInput = document.getElementById("searchMessage");
        if (searchMessageInput && conversationListElement) {
            searchMessageInput.addEventListener("keyup", function () {
                const searchTerm = searchMessageInput.value.toUpperCase().trim();
                console.log(`[ChatApp] Searching messages for: "${searchTerm}"`);
                const messages = conversationListElement.getElementsByTagName("li");
                let count = 0;
                Array.from(messages).forEach(function (messageLi) {
                    // Search within the message text content
                    const messageParagraph = messageLi.querySelector("p.ctext-content");
                    const messageText = messageParagraph ? (messageParagraph.textContent || messageParagraph.innerText).toUpperCase() : "";
                    // Optionally search sender name as well
                    const senderNameElement = messageLi.querySelector("h5.conversation-name");
                    const senderName = senderNameElement ? (senderNameElement.textContent || senderNameElement.innerText).toUpperCase() : "";

                    if (messageText.includes(searchTerm) || senderName.includes(searchTerm)) {
                        messageLi.style.display = ""; // Show matching message
                        count++;
                    } else {
                        messageLi.style.display = "none"; // Hide non-matching message
                    }
                });
                console.log(`[ChatApp] Search found ${count} matching messages.`);
                // Optional: Show a "no results" message if count is 0 and searchTerm is not empty
            });
            console.log("[ChatApp] Keyup listener attached to search input (#searchMessage).");
        } else {
            console.warn("[ChatApp] Search input (#searchMessage) or conversation list not found for attaching search listener.");
        }

    } // --- End of attachStaticListeners ---


    // ---=== INITIALIZATION FUNCTIONS ===---

    // Initialize SimpleBar scrollbars
    function initSimpleBar() {
        console.log("[ChatApp] Initializing SimpleBar instances...");
        try {
            // Chat Conversation Scroll
            if (chatConversationWrapper && !simpleBarChat) { // Check if element exists and instance not yet created
                simpleBarChat = new SimpleBar(chatConversationWrapper);
                console.log("[ChatApp] SimpleBar initialized on #chat-conversation wrapper.");
            } else if (simpleBarChat) {
                console.log("[ChatApp] SimpleBar already initialized on #chat-conversation wrapper.");
            } else {
                console.warn("[ChatApp] Element #chat-conversation not found for SimpleBar init.");
            }

            // Sidebar User/Channel List Scroll
            if (chatRoomListWrapper && !simpleBarUsers) { // Check if element exists and instance not yet created
                simpleBarUsers = new SimpleBar(chatRoomListWrapper);
                console.log("[ChatApp] SimpleBar initialized on .chat-room-list wrapper.");
            } else if (simpleBarUsers) {
                console.log("[ChatApp] SimpleBar already initialized on .chat-room-list wrapper.");
            } else {
                console.warn("[ChatApp] Element .chat-room-list not found for SimpleBar init.");
            }
            // Note: Velzon might initialize SimpleBar globally. If conflicts occur, ensure this only runs if needed.
        } catch (error) {
            console.error("[ChatApp] Error initializing SimpleBar:", error);
        }
    }

    // Initialize Emoji Picker (اقتباس شده از chat.init.js و مستندات fgEmojiPicker)
    function initEmojiPicker() {
        const emojiPickerTrigger = document.getElementById('emoji-btn'); // دکمه‌ای که picker را باز می‌کند
        if (emojiPickerTrigger && chatInputElement && window.FgEmojiPicker) {
            try {
                // اطمینان حاصل کنید که مسیر 'dir' به درستی به پوشه دارایی‌های fg-emoji-picker اشاره می‌کند
                // مسیر ممکن است نیاز به تنظیم داشته باشد بسته به ساختار پروژه شما
                // مسیر پیش‌فرض از LibMan یا مشابه ممکن است '/assets/libs/fg-emoji-picker/' باشد.
                // مهم: اطمینان حاصل کنید که فایل‌های CSS و JS مورد نیاز در این مسیر وجود دارند.
                const emojiPickerAssetsDir = '../../../assets/libs/fg-emoji-picker/'; // مسیر دارایی‌های کتابخانه (مهم!)

                console.log("[ChatApp] Attempting to initialize fgEmojiPicker...");

                emojiPicker = new FgEmojiPicker({
                    trigger: ['#emoji-btn'],        // Selector(s) for the trigger element(s)
                    removeOnSelect: false,          // Do not remove the picker after selection
                    closeButton: true,              // Show a close button
                    position: ['top', 'right'],     // Position relative to the trigger (adjust as needed)
                    preFetch: true,                 // Load emojis initially
                    dir: emojiPickerAssetsDir,      // **Important:** Path to the library's assets
                    insertInto: chatInputElement,   // The input field to insert emoji into
                    // theme: 'dark'               // Optional theme
                });

                console.log("[ChatApp] fgEmojiPicker initialized successfully.");

                // Optional: Listen for emoji selection event if needed for custom logic
                emojiPicker.on('emoji_select', (emojiData) => {
                    console.log('[ChatApp] Emoji selected:', emojiData);
                    // Trigger input event manually if needed for frameworks or other listeners
                    chatInputElement.dispatchEvent(new Event('input', { bubbles: true }));
                    chatInputElement.focus(); // Keep focus on input after selection
                });

            } catch (error) {
                console.error("[ChatApp] Failed to initialize fgEmojiPicker:", error);
                // Display a subtle error to the user? Or disable the emoji button?
                if (emojiPickerTrigger) emojiPickerTrigger.disabled = true;
            }
        } else {
            // Log detailed reasons why initialization failed
            if (!emojiPickerTrigger) console.warn("[ChatApp] Emoji Picker trigger button (#emoji-btn) not found.");
            if (!chatInputElement) console.warn("[ChatApp] Emoji Picker target input (#chat-input) not found.");
            if (!window.FgEmojiPicker) console.warn("[ChatApp] FgEmojiPicker library not found. Ensure the script is loaded BEFORE chat.js.");
        }
    }

    // ---=== SIGNALR CONNECTION ===---

    // Start SignalR Connection
    function startConnection() {
        console.log("[ChatApp] Attempting to start SignalR connection...");

        // Prevent multiple connection attempts if already connected or connecting
        if (connection && (connection.state === signalR.HubConnectionState.Connected || connection.state === signalR.HubConnectionState.Connecting)) {
            console.log(`[ChatApp] SignalR connection is already ${connection.state}.`);
            return Promise.resolve(connection); // Return a resolved promise with the existing connection
        }

        // If reconnecting, wait for it to potentially succeed or fail
        if (connection && connection.state === signalR.HubConnectionState.Reconnecting) {
            console.log("[ChatApp] SignalR is currently reconnecting. Waiting for completion...");
            // Return a promise that resolves or rejects based on the reconnection outcome
            return new Promise((resolve, reject) => {
                const checkInterval = setInterval(() => {
                    if (!connection) { // Should not happen, but safety check
                        clearInterval(checkInterval);
                        reject(new Error("[ChatApp] SignalR connection object became null during reconnection wait."));
                        return;
                    }
                    if (connection.state === signalR.HubConnectionState.Connected) {
                        clearInterval(checkInterval);
                        console.log("[ChatApp] Reconnection successful during wait.");
                        resolve(connection);
                    }
                    if (connection.state === signalR.HubConnectionState.Disconnected) {
                        clearInterval(checkInterval);
                        console.error("[ChatApp] Reconnection failed during wait. Connection is now disconnected.");
                        reject(new Error("[ChatApp] SignalR reconnection failed."));
                    }
                    // Still reconnecting, continue waiting...
                }, 500); // Check every 500ms
                // Add a timeout to prevent waiting indefinitely
                setTimeout(() => {
                    if (connection && connection.state === signalR.HubConnectionState.Reconnecting) {
                        clearInterval(checkInterval);
                        console.error("[ChatApp] Reconnection attempt timed out.");
                        reject(new Error("[ChatApp] SignalR reconnection attempt timed out."));
                    }
                }, 30000); // e.g., 30 second timeout
            });
        }

        // Build the connection
        connection = new signalR.HubConnectionBuilder()
            .withUrl(hubUrl, {
                // Optional configurations:
                // transport: signalR.HttpTransportType.WebSockets, // Force specific transport
                // skipNegotiation: true, // If using WebSockets only and server configured
                // accessTokenFactory: () => {
                //     // Return JWT token if using authentication
                //     // const token = localStorage.getItem("jwt_token");
                //     // console.log("[ChatApp] Providing access token for SignalR connection.");
                //     // return token;
                //     return null; // Placeholder
                // }
                logger: signalR.LogLevel.Information, // Adjust log level (Trace, Debug, Information, Warning, Error, Critical, None)
                //logMessageContent: true, // Be cautious enabling this in production (logs message content)
            })
            // Automatic reconnection configuration (waits 0, 2, 5, 10, 15, 30 seconds before retries)
            // Server needs to be configured to allow reconnection for this to work seamlessly
            .withAutomaticReconnect([0, 2000, 5000, 10000, 15000, 30000])
            .build();

        console.log("[ChatApp] SignalR HubConnection created.");

        // --- Register Hub Event Handlers (BEFORE starting connection) ---

        // Handler for receiving a new message
        connection.on("ReceiveMessage", (message) => {
            console.log("[ChatApp] Received 'ReceiveMessage':", message);

            // ---=== VALIDATION (Corrected) ===---
            if (!message || !message.messageId || !message.senderUserId) { // Check for essential properties
                console.warn("[ChatApp] Received invalid or incomplete message object from server:", message);
                return;
            }

            // Add to local history cache (Your existing logic seems fine, ensure properties are correct)
            // const existsInHistory = chatHistory.some(m => m.messageId === message.messageId /*...*/);
            // if (!existsInHistory) {
            //    // Make sure the object pushed uses correct property names
            //     chatHistory.push({
            //         messageId: message.messageId,
            //         senderUserId: message.senderUserId,
            //         recipientUserId: message.recipientUserId,
            //         content: message.content,
            //         timestamp: message.timestamp,
            //         isSender: message.isSender, // Should be false from server for recipient
            //         senderName: message.senderName,
            //         // ... other properties like reply info ...
            //     });
            // } else {
            // Your logic for handling optimistic updates
            // }

            // ---=== Check if message belongs to the active chat (Corrected for User-to-User) ===---
            const isMessageForCurrentChat = (
                currentChatType === 'user' &&
                message.senderUserId === currentChatTargetId && // Message is from the person I'm currently chatting with
                message.recipientUserId === currentUserId        // And it's sent to me
            );
            // Note: We don't need to check for messages *sent by me* here,
            // because the server usually doesn't push the sender's own message back via ReceiveMessage.
            // The sender typically gets confirmation via the return value of the 'SendMessage' invoke.


            if (isMessageForCurrentChat) {
                console.log(`[ChatApp] Message ${message.messageId} belongs to current chat. Displaying.`);
                // Ensure displayNewMessage uses correct property names internally
                displayNewMessage(message);
                // --- Mark as read ---
                // Send confirmation back to server that message is read (if window is active/chat is open)
                if (document.hasFocus()) { // Simple check, might need more robust logic
                    connection.invoke("MarkMessageAsRead", message.messageId).catch(err => console.error("MarkAsRead SignalR Error:", err));
                    console.log(`[ChatApp] Attempting to mark message ${message.messageId} as read.`);
                } else {
                    console.log(`[ChatApp] Window not focused. Message ${message.messageId} received but not marked as read immediately.`);
                    // Unread count should be updated by the 'else' block below in this case.
                }
                // We reset the unread count locally *after* displaying,
                // assuming MarkAsRead will eventually sync server/other clients.
                resetUnreadCount(currentChatTargetId); // Reset for the current chat

            } else {
                // --- Message is for a different chat ---
                const contactIdToUpdate = message.senderUserId; // The sender is the contact to update
                console.log(`[ChatApp] Message ${message.messageId} is for contact ${contactIdToUpdate}. Updating contact list.`);

                // Update unread count and last message for the relevant contact
                const contactIndex = contacts.findIndex(c => c.id === contactIdToUpdate && c.type === 'user');

                if (contactIndex > -1) {
                    contacts[contactIndex].lastMessage = message.content;     // Correct property
                    contacts[contactIndex].lastMessageTime = message.timestamp; // Correct property (Ensure DTO name matches)
                    contacts[contactIndex].unreadCount = (contacts[contactIndex].unreadCount || 0) + 1;
                    console.log(`[ChatApp] Updated contact ${contactIdToUpdate}: Unread=${contacts[contactIndex].unreadCount}, LastMsg=${message.content}`);

                    // Update UI for this specific contact
                    updateContactInListUI(contactIdToUpdate); // Pass only ID, function finds contact data in `contacts` array
                } else {
                    console.warn(`[ChatApp] Received message from unknown contact ID ${contactIdToUpdate}. Refreshing contacts might be needed.`);
                    // TODO: Maybe fetch contacts again or add this user dynamically?
                    // For now, maybe just add a basic contact entry?
                    addNewContactPlaceholder(message.senderUserId, message.senderName, message.content, message.timestamp); // Function to add a new contact to UI and `contacts` array
                }
            }
        });

        // --- Make sure displayNewMessage uses correct properties ---
        //function displayNewMessage(message) {
        //    // Example validation (Adjust based on what you consider essential)
        //    if (!message || !message.messageId || !message.senderUserId || !message.content || !message.timestamp) {
        //        console.warn("[ChatApp] displayNewMessage: Invalid message object passed:", message);
        //        return;
        //    }

        //    const isSender = message.senderUserId === currentUserId; // Determine if current user sent it

        //    // Make sure buildMessageHtml uses message.messageId, message.content, message.timestamp, message.senderName etc.
        //    const messageHtml = buildMessageHtml(message, isSender);

        //    if (messageHtml) {
        //        const chatMessagesContainer = document.getElementById("users-conversation"); // Or your message list container ID
        //        if (chatMessagesContainer) {
        //            chatMessagesContainer.insertAdjacentHTML('beforeend', messageHtml);
        //            scrollToBottom(); // Scroll down after adding message
        //        } else {
        //            console.error("Chat message container not found!");
        //        }
        //    }
        //}

        // --- Placeholder for function to update a specific contact in the list UI ---
        function updateContactInListUI(contactId) {
            const contact = contacts.find(c => c.id === contactId && c.type === 'user');
            if (!contact) return;

            const contactElement = document.getElementById(`contact-${contactId}`);
            if (contactElement) {
                // Update last message text
                const lastMsgElement = contactElement.querySelector('.contact-last-message'); // Adjust selector
                if (lastMsgElement) {
                    lastMsgElement.textContent = contact.lastMessage ? truncateText(contact.lastMessage, 20) : ' '; // Add helper for truncation
                }

                // Update last message time
                const timeElement = contactElement.querySelector('.contact-time'); // Adjust selector
                if (timeElement) {
                    timeElement.textContent = contact.lastMessageTime ? formatRelativeTime(contact.lastMessageTime) : ''; // Add helper for time formatting
                }

                // Update unread count badge
                const unreadBadge = contactElement.querySelector('.contact-unread-badge'); // Adjust selector
                if (unreadBadge) {
                    if (contact.unreadCount > 0) {
                        unreadBadge.textContent = contact.unreadCount;
                        unreadBadge.style.display = 'block'; // Or remove 'd-none' class
                    } else {
                        unreadBadge.style.display = 'none'; // Or add 'd-none' class
                    }
                }

                // Optional: Reorder the contact list based on new last message time
                // This is more complex, might involve re-rendering the whole list or moving the element
                console.log(`[ChatApp] UI updated for contact ${contactId}. Consider reordering.`);
                // Simple reorder: Detach and prepend/append based on sort logic
                // renderContactList(); // Easier to just re-render the list if performance allows
            } else {
                console.warn(`Contact element not found for ID: ${contactId}`);
            }
        }

        // --- Placeholder for adding a new contact if message received from unknown user ---
        function addNewContactPlaceholder(userId, userName, lastMessage, timestamp) {
            console.log(`[ChatApp] Adding placeholder for new contact: ${userName} (${userId})`);
            const newContact = {
                id: userId,
                name: userName || `User ${userId.substring(0, 5)}`, // Use name if provided
                avatar: '/assets/images/users/user-dummy-img.jpg', // Default avatar
                status: 'offline', // Assume offline initially, maybe query status?
                unreadCount: 1,
                lastMessage: lastMessage,
                lastMessageTime: timestamp,
                isTyping: false,
                type: 'user'
            };
            contacts.push(newContact);
            // Re-render the contact list to include the new contact
            renderContactList(); // Assuming you have this function
        }


        // --- Ensure other functions like resetUnreadCount also use the correct ID ---
        function resetUnreadCount(targetId) {
            console.log(`[ChatApp] Resetting unread count for ${targetId}.`);
            const contactIndex = contacts.findIndex(c => c.id === targetId && c.type === 'user');
            if (contactIndex > -1 && contacts[contactIndex].unreadCount > 0) {
                contacts[contactIndex].unreadCount = 0;
                console.log(`[ChatApp] Local unread count reset for ${targetId}.`);
                // Update UI immediately for this contact
                updateContactInListUI(targetId);
            } else {
                console.log(`[ChatApp] No unread count needed reset for ${targetId}.`);
            }
        }

        // Add helper functions if you don't have them
        function truncateText(text, maxLength) {
            if (!text) return '';
            return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
        }

        function formatRelativeTime(dateString) {
            // Implement time formatting (e.g., using moment.js or Intl.RelativeTimeFormat)
            // Example placeholder:
            if (!dateString) return '';
            try {
                const date = new Date(dateString);
                // Very basic example, use a library for better results
                const hours = date.getHours().toString().padStart(2, '0');
                const minutes = date.getMinutes().toString().padStart(2, '0');
                return `${hours}:${minutes}`;
            } catch (e) {
                return '';
            }
        }

        // Handler for receiving chat history
        connection.on("LoadHistory", (messages) => {
            console.log(`[ChatApp] Received 'LoadHistory' with ${messages?.length || 0} messages.`);
            if (!Array.isArray(messages)) {
                console.error("[ChatApp] 'LoadHistory' did not return a valid array:", messages);
                messages = []; // Use empty array to prevent errors
            }
            displayChatHistory(messages); // This function should handle displaying and potentially hiding a loader
        });

        // Handler for receiving the initial list of contacts/channels
        connection.on("LoadContacts", (initialContacts) => {
            console.log(`[ChatApp] Received 'LoadContacts' with ${initialContacts?.length || 0} contacts.`);
            if (!Array.isArray(initialContacts)) {
                console.error("[ChatApp] 'LoadContacts' did not return a valid array:", initialContacts);
                contacts = [];
                showLoader(false); // Hide loader even if data is bad
                return;
            }
            contacts = initialContacts; // Store the full list locally

            // Separate users and channels based on a 'type' property (assuming 'user' or 'channel')
            const users = contacts.filter(c => c.type === 'user' || !c.type); // Default to 'user' if type is missing
            const channels = contacts.filter(c => c.type === 'channel');

            console.log(`[ChatApp] Processing ${users.length} users and ${channels.length} channels.`);

            renderUserList(users);
            renderChannelList(channels); // Implement renderChannelList if using channels

            attachContactClickListeners(); // Re-attach listeners after rendering

            showLoader(false); // Hide main loader after contacts are rendered
        });

        // Handler for when a user connects (becomes online)
        connection.on("UserConnected", (userId, userName) => {
            console.log(`[ChatApp] Received 'UserConnected': ${userName} (${userId})`);
            const contactIndex = contacts.findIndex(c => c.id === userId && c.type === 'user');
            if (contactIndex > -1) {
                contacts[contactIndex].status = 'online';
                console.log(`[ChatApp] Updated contact ${userId} status to online.`);
                updateContactInList(userId, 'user'); // Update UI

                // Update chat header if this user is the current chat target
                if (userId === currentChatTargetId && currentChatType === 'user') {
                    updateChatHeader(userId, 'user');
                }
            } else {
                console.log(`[ChatApp] User ${userName} connected but not in current contact list.`);
                // Optionally add them if your logic requires it, or refresh the list
                // fetchInitialContacts(); // Example: Refresh list
            }
        });

        // Handler for when a user disconnects (goes offline)
        connection.on("UserDisconnected", (userId, lastSeen) => {
            console.log(`[ChatApp] Received 'UserDisconnected': ${userId}, LastSeen: ${lastSeen}`);
            const contactIndex = contacts.findIndex(c => c.id === userId && c.type === 'user');
            if (contactIndex > -1) {
                contacts[contactIndex].status = 'offline';
                contacts[contactIndex].lastSeen = lastSeen; // Store last seen time if provided
                console.log(`[ChatApp] Updated contact ${userId} status to offline.`);
                updateContactInList(userId, 'user'); // Update UI

                // Update chat header if this user is the current chat target
                if (userId === currentChatTargetId && currentChatType === 'user') {
                    updateChatHeader(userId, 'user');
                }
            } else {
                console.log(`[ChatApp] User ${userId} disconnected but not in current contact list.`);
            }
        });

        // Handler for when a message is deleted by another user
        connection.on("MessageDeleted", (messageId) => {
            console.log(`[ChatApp] Received 'MessageDeleted': ${messageId}`);

            // Remove from local history cache
            const initialLength = chatHistory.length;
            chatHistory = chatHistory.filter(m => m.id !== messageId);
            if (chatHistory.length < initialLength) {
                console.log(`[ChatApp] Removed message ${messageId} from local history.`);
            }

            // Remove message element from the UI if it exists
            const messageElement = document.getElementById(`chat-id-${messageId}`);
            if (messageElement) {
                console.log(`[ChatApp] Removing message element ${messageId} from UI.`);
                messageElement.remove();
            } else {
                console.log(`[ChatApp] Message element ${messageId} not found in current view for deletion.`);
            }
            // Note: We don't need to check if it's the current user's deletion,
            // because the server should only broadcast this to *other* clients.
            // The client initiating the delete handles its own UI optimistically.
        });

        // Handler for status updates (e.g., typing, read receipts) - Optional
        connection.on("ReceiveStatusUpdate", (updateData) => {
            // Example updateData structure: { type: "typing", userId: "...", isTyping: true, chatId: "..." }
            // Or: { type: "read", messageId: "...", readerId: "...", chatId: "..." }
            console.log("[ChatApp] Received 'ReceiveStatusUpdate':", updateData);

            if (!updateData || !updateData.type) return;

            switch (updateData.type) {
                case 'typing':
                    // Check if the typing user is the current chat partner
                    if (updateData.userId === currentChatTargetId && currentChatType === 'user') {
                        handleTypingIndicator(updateData.isTyping);
                    }
                    break;
                case 'read':
                    // Update the status of a specific message (e.g., show double ticks)
                    if (updateData.readerId !== currentUserId) { // Only care about reads by the other party
                        const messageElement = document.getElementById(`chat-id-${updateData.messageId}`);
                        if (messageElement && messageElement.closest('.chat-list.right')) { // Check if it's a sent message
                            // Update UI to show read status (e.g., change icon color)
                            const readIcon = messageElement.querySelector('.ri-check-double-line'); // Example selector
                            if (readIcon) {
                                readIcon.classList.add('text-info'); // Example: Change color
                                console.log(`[ChatApp] Marked message ${updateData.messageId} as read in UI.`);
                            }
                        }
                        // Update local history as well
                        const msgIndex = chatHistory.findIndex(m => m.id === updateData.messageId);
                        if (msgIndex > -1) {
                            chatHistory[msgIndex].isRead = true;
                        }
                    }
                    break;
                // Add other status update types as needed
            }
        });

        // --- Connection Lifecycle Event Handlers ---

        // Fires when the connection is lost and attempting to reconnect automatically
        connection.onreconnecting((error) => {
            console.warn(`[ChatApp] SignalR connection lost. Attempting to reconnect... Error: ${error?.message || 'Unknown error'}`);
            // Optionally update UI to show a "reconnecting..." state
            // Example: Display a banner, disable input
            if (chatInputElement) chatInputElement.disabled = true;
            if (topBarStatusElement) topBarStatusElement.textContent = "در حال اتصال مجدد...";
            showConnectionStatusBanner("درحال اتصال مجدد...", "warning");
        });

        // Fires when the connection has been successfully re-established after a disconnect
        connection.onreconnected((connectionId) => {
            console.log(`[ChatApp] SignalR connection re-established successfully. Connection ID: ${connectionId}`);
            // Update UI to show "connected" state
            if (chatInputElement) chatInputElement.disabled = false;
            if (currentChatTargetId) { // If a chat was active, refresh its header status
                updateChatHeader(currentChatTargetId, currentChatType);
            } else {
                if (topBarStatusElement) topBarStatusElement.textContent = ""; // Clear general status if no chat open
            }
            hideConnectionStatusBanner();
            showConnectionStatusBanner("دوباره متصل شدید!", "success", 2000); // Show success briefly

            // Optionally: Re-fetch data that might have been missed during disconnect
            // Example: fetchInitialContacts();
            // Example: if(currentChatTargetId) loadChatHistory(currentChatTargetId, currentChatType);
        });

        // Fires when the connection is closed permanently (e.g., server stopped, manual stop, or reconnection failed)
        connection.onclose((error) => {
            console.error(`[ChatApp] SignalR connection closed permanently. Error: ${error?.message || 'Connection closed'}`);
            connection = null; // Clear the connection object
            // Update UI to show disconnected state, potentially prompt user to refresh
            if (chatInputElement) chatInputElement.disabled = true;
            if (topBarStatusElement) topBarStatusElement.textContent = "قطع شده";
            showConnectionStatusBanner("ارتباط قطع شد. لطفا صفحه را رفرش کنید.", "danger"); // Persistent error banner
            // Prevent further actions that require connection
        });


        // --- Start the connection ---
        return new Promise((resolve, reject) => {
            showLoader(true); // Show loader while initially connecting
            console.log("[ChatApp] Calling connection.start()...");
            connection.start()
                .then(() => {
                    console.log("[ChatApp] SignalR connection started successfully. Connection ID:", connection.connectionId);
                    // Connection is established, now load initial data from the server
                    console.log("[ChatApp] Requesting initial contacts from server...");
                    connection.invoke("LoadInitialContacts")
                        .then(() => {
                            console.log("[ChatApp] 'LoadInitialContacts' invoked. Waiting for 'LoadContacts' event.");
                            // Data will arrive via the "LoadContacts" handler registered above
                            // Loader is hidden inside LoadContacts handler
                            resolve(connection); // Resolve the promise once start is successful
                        })
                        .catch(err => {
                            console.error("[ChatApp] Failed to invoke 'LoadInitialContacts':", err);
                            showLoader(false); // Hide loader on error
                            showConnectionStatusBanner("خطا در بارگذاری لیست کاربران.", "danger");
                            reject(err); // Reject the promise if initial data load fails
                        });

                })
                .catch(err => {
                    console.error("[ChatApp] SignalR connection failed to start:", err);
                    showLoader(false); // Hide loader on connection error
                    showConnectionStatusBanner("اتصال به سرور چت ناموفق بود.", "danger");
                    connection = null; // Ensure connection is null on failed start
                    reject(err); // Reject the promise on connection failure
                });
        });
    } // --- End of startConnection ---

    // Helper function to update a single contact in the UI list
    function updateContactInList(contactId, contactType) {
        const listElement = contactType === 'user' ? userListElement : channelListElement;
        const contactIndex = contacts.findIndex(c => c.id === contactId && c.type === contactType);

        if (contactIndex === -1 || !listElement) {
            console.warn(`[ChatApp] Cannot update contact UI: Contact ${contactId} (${contactType}) not found or list element missing.`);
            return;
        }

        const contactData = contacts[contactIndex];
        const contactElement = document.getElementById(`contact-${contactId}`); // Use specific ID

        if (contactElement) {
            // Build new HTML for the contact
            const newHtml = buildContactHtml(contactData);
            // Replace existing element's outerHTML
            contactElement.outerHTML = newHtml;

            // Re-attach click listener to the new element's link
            const newLinkElement = document.querySelector(`#contact-id-${contactId} a`);
            if (newLinkElement) {
                newLinkElement.removeEventListener('click', handleContactClick); // Remove old one just in case
                newLinkElement.addEventListener('click', handleContactClick);
                console.log(`[ChatApp] Re-attached click listener for updated contact ${contactId}.`);
            } else {
                console.warn(`[ChatApp] Could not find link element inside updated contact ${contactId} to re-attach listener.`);
            }
        } else {
            console.warn(`[ChatApp] Contact element #contact-id-${contactId} not found in the DOM for update.`);
            // As a fallback, could re-render the whole list, but less efficient
            // if (contactType === 'user') renderUserList(contacts.filter(c => c.type === 'user'));
            // else renderChannelList(contacts.filter(c => c.type === 'channel'));
        }
        // Consider resorting the list if lastMessageTime changed order
        // sortContactList(listElement); // Implement this if needed
    }

    // Helper function to show/hide typing indicator in chat header
    function handleTypingIndicator(isTyping) {
        if (topBarStatusElement) {
            if (isTyping) {
                // Store original status temporarily if needed
                if (!topBarStatusElement.dataset.originalStatus) {
                    topBarStatusElement.dataset.originalStatus = topBarStatusElement.textContent;
                }
                topBarStatusElement.innerHTML = `<span class='text-muted'>در حال نوشتن... <span class="animate-typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span></span>`; // Use HTML for animation
            } else {
                // Restore original status or default status based on contact data
                const originalStatus = topBarStatusElement.dataset.originalStatus;
                if (originalStatus) {
                    topBarStatusElement.textContent = originalStatus;
                    delete topBarStatusElement.dataset.originalStatus; // Clear temporary data
                } else {
                    // Fallback: Re-fetch status from contact data if original isn't stored
                    const contact = contacts.find(c => c.id === currentChatTargetId && c.type === currentChatType);
                    topBarStatusElement.textContent = (contact?.status === 'online') ? 'آنلاین' : 'آفلاین';
                }
                topBarStatusElement.innerHTML = topBarStatusElement.textContent; // Ensure no leftover HTML
            }
        }
    }

    // Helper function to display connection status banner
    function showConnectionStatusBanner(message, type = "info", duration = 0) {
        let banner = document.getElementById('connection-status-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'connection-status-banner';
            banner.style.position = 'fixed';
            banner.style.top = '0';
            banner.style.left = '0';
            banner.style.width = '100%';
            banner.style.padding = '10px';
            banner.style.textAlign = 'center';
            banner.style.zIndex = '1050'; // Ensure it's above most elements
            banner.style.display = 'none'; // Initially hidden
            banner.style.color = '#fff';
            document.body.insertBefore(banner, document.body.firstChild);
            //document.body.appendChild(banner); // Or append at the end
        }

        banner.textContent = message;
        banner.className = `alert alert-${type}`; // Use Bootstrap alert classes
        banner.style.display = 'block';

        // Auto-hide after duration if specified
        if (duration > 0) {
            setTimeout(() => {
                hideConnectionStatusBanner();
            }, duration);
        }
    }

    // Helper function to hide connection status banner
    function hideConnectionStatusBanner() {
        const banner = document.getElementById('connection-status-banner');
        if (banner) {
            banner.style.display = 'none';
        }
    }


    // ---=== INITIALIZATION CALLS (inside DOMContentLoaded) ===---

    console.log("[ChatApp] DOM fully loaded. Starting initialization...");
    console.log("[ChatApp] Current User ID:", currentUserId);

    // 1. Check for required User ID
    if (!currentUserId || currentUserId === "FALLBACK_OR_ERROR_ID" || currentUserId === "USER_ID_PLACEHOLDER") {
        console.error("[ChatApp] CRITICAL: User ID is not set or invalid. Aborting chat initialization.");
        // Display a prominent error message in the UI
        if (chatContentElement) chatContentElement.innerHTML = '<div class="alert alert-danger m-3">خطای برنامه: شناسه کاربر یافت نشد. لطفا با پشتیبانی تماس بگیرید.</div>';
        if (userListElement) userListElement.innerHTML = '<li class="text-danger p-2">خطا در بارگذاری</li>';
        if (channelListElement) channelListElement.innerHTML = '<li class="text-danger p-2">خطا در بارگذاری</li>';
        return; // Stop execution
    }

    // 2. Initialize static UI components
    initSimpleBar();
    initEmojiPicker();
    // Initialize GLightbox if images are expected
    try {
        const lightbox = GLightbox({ selector: ".popup-img", title: false }); // Initialize lightbox for images in chat
        console.log("[ChatApp] GLightbox initialized for .popup-img");
    } catch (e) {
        console.warn("[ChatApp] GLightbox library not found or failed to initialize. Image previews will not work.", e);
    }


    // 3. Attach static event listeners (form submit, buttons, etc.)
    attachStaticListeners();
    // Note: attachContactClickListeners is called *after* contacts are loaded/rendered
    // Note: attachMessageActionListeners uses delegation, so it can be called early

    attachMessageActionListeners(); // Attach delegated listeners for message actions

    // 4. Start SignalR connection and load initial data
    showLoader(true); // Show loader before starting connection attempt
    startConnection()
        .then(() => {
            console.log("[ChatApp] Initialization complete: SignalR connected and initial contacts requested.");
            // Loader is typically hidden when 'LoadContacts' is received
        })
        .catch(err => {
            console.error("[ChatApp] Initialization failed during SignalR connection start:", err);
            showLoader(false); // Ensure loader is hidden on failure
            // Error message is shown by startConnection failure handler
        });


}); // --- End of DOMContentLoaded ---
