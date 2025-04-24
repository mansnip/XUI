// chat.js (جایگزین chat.init.js)

// اطمینان از اجرای کد بعد از بارگذاری کامل DOM
document.addEventListener("DOMContentLoaded", function () {

    // ---=== CONFIGURATION & STATE ===---
    const hubUrl = "/chatHub"; // آدرس هاب SignalR
    // const currentUserId = "USER_ID_PLACEHOLDER"; // !!! مهم: با ID کاربر لاگین شده جایگزین شود
    const currentUserId = window.chatAppConfig?.currentUserId || "FALLBACK_OR_ERROR_ID"; // از مقدار تزریق شده استفاده کنید
    const defaultAvatar = "/assets/images/users/user-dummy-img.jpg"; // مسیر تصویر پیش‌فرض کاربر
    const multiUserAvatar = "/assets/images/users/multi-user.jpg"; // مسیر تصویر پیش‌فرض گروه/کانال

    if (!currentUserId || currentUserId === "FALLBACK_OR_ERROR_ID") {
        console.error("FATAL: currentUserId could not be retrieved from window.chatAppConfig in chat.js.");
        // مدیریت خطا در اینجا (مثلاً نمایش پیام خطا در UI)
    }

    let connection = null;
    let currentChatTargetId = null; // ID کاربر یا کانالی که در حال چت با او هستیم
    let currentChatType = 'user'; // 'user' یا 'channel'
    let isReplying = false;
    let replyingToMessageId = null;
    let contacts = []; // آرایه‌ای برای نگهداری اطلاعات کاربران/کانال‌ها (id, name, avatar, status, unreadCount, lastMessage)
    let chatHistory = []; // آرایه‌ای برای نگهداری پیام‌های چت فعلی
    let simpleBarChat = null; // نمونه SimpleBar برای پنجره مکالمه
    let simpleBarUsers = null; // نمونه SimpleBar برای لیست کاربران/کانال‌ها
    let emojiPicker = null; // نمونه Emoji Picker

    // ---=== DOM Elements ===---
    const userListElement = document.getElementById("userList");
    const channelListElement = document.getElementById("channelList");
    const conversationListElement = document.getElementById("users-conversation"); // ul برای پیام‌ها
    const channelConversationListElement = document.getElementById("channel-conversation"); // ul برای پیام‌های کانال (اگر جدا هستند)
    const chatInputElement = document.getElementById("chat-input");
    const chatFormElement = document.getElementById("chatinput-form");
    const chatWrapperElement = document.querySelector(".chat-wrapper"); // برای نمایش/مخفی کردن چت در موبایل
    const userChatElement = document.querySelector(".user-chat"); // بخش اصلی چت کاربر
    const chatContentElement = document.querySelector(".chat-content"); // کانتینر داخلی user-chat

    // Chat Header Elements
    const topBarContainer = document.querySelector(".p-3.user-chat-topbar"); // کانتینر اصلی هدر
    const topBarUsernameElement = topBarContainer?.querySelector(".username");
    const topBarStatusElement = topBarContainer?.querySelector(".userStatus small"); // .userStatus > small
    const topBarAvatarImgElement = topBarContainer?.querySelector(".chat-user-img img"); // .chat-user-img > img
    const topBarAvatarStatusElement = topBarContainer?.querySelector(".chat-user-img .user-status"); // .chat-user-img > .user-status

    // Reply Card Elements
    const replyCardElement = document.querySelector(".replyCard");
    const replyCardNameElement = replyCardElement?.querySelector(".replymessage-block .conversation-name");
    const replyCardMessageElement = replyCardElement?.querySelector(".replymessage-block .text-truncate"); // .text-truncate might be better
    const closeReplyButton = document.getElementById("close_toggle");

    // Other UI Elements
    const emojiButtonElement = document.getElementById("emoji-btn");
    const chatConversationWrapper = document.getElementById("chat-conversation"); // Div با data-simplebar
    const chatRoomListWrapper = document.querySelector(".chat-room-list"); // Div با data-simplebar در سایدبار
    const elmLoader = document.getElementById("elmLoader");
    const copyClipboardAlert = document.getElementById("copyClipBoard"); // Alert کپی
    const userChatRemoveButton = document.querySelector(".user-chat-remove"); // دکمه بازگشت در موبایل
    const userProfileShowLinks = document.querySelectorAll(".user-profile-show"); // لینک‌های نمایش پروفایل
    const offcanvasUserProfile = document.getElementById("userProfileCanvasExample"); // Offcanvas پروفایل

    // ---=== UTILITY FUNCTIONS ===---

    // Get current time formatted (like y() in chat.init.js)
    function getCurrentTimeFormatted() {
        const now = new Date();
        let hours = now.getHours();
        const minutes = now.getMinutes();
        const ampm = hours >= 12 ? 'pm' : 'am';
        hours = hours % 12;
        hours = hours ? hours : 12; // hour '0' should be '12'
        const minutesStr = minutes < 10 ? '0' + minutes : minutes;
        const hoursStr = hours < 10 ? '0' + hours : hours;
        return hoursStr + ':' + minutesStr + ' ' + ampm;
    }

    // Scroll chat to bottom (like v() in chat.init.js)
    function scrollToBottom(elementId = "chat-conversation") {
        const simpleBarInstance = elementId === "chat-conversation" ? simpleBarChat : simpleBarUsers;
        const containerElement = document.getElementById(elementId);

        if (simpleBarInstance && containerElement) {
            const scrollElement = simpleBarInstance.getScrollElement();
            if (scrollElement) {
                // Use setTimeout to ensure rendering is complete before scrolling
                setTimeout(() => {
                    scrollElement.scrollTop = scrollElement.scrollHeight;
                }, 50); // Adjust delay if needed
            } else {
                console.warn(`SimpleBar scroll element not found for #${elementId}.`);
                containerElement.scrollTop = containerElement.scrollHeight; // Fallback
            }
        } else {
            console.warn(`SimpleBar instance or container element not found for #${elementId}.`);
            if (containerElement) {
                containerElement.scrollTop = containerElement.scrollHeight; // Fallback
            }
        }
    }

    // Show/Hide Loader (like original show/hide logic)
    function showLoader(show = true) {
        if (elmLoader) {
            elmLoader.style.display = show ? "block" : "none";
        }
    }

    // Show Copy Alert (like original)
    function showCopyAlert() {
        if (copyClipboardAlert) {
            copyClipboardAlert.classList.add("show");
            setTimeout(() => copyClipboardAlert.classList.remove("show"), 1000);
        }
    }

    // Build HTML for a single message (Adapted from u() in chat.init.js)
    function buildMessageHtml(message, isSender) {
        // message object structure example (adjust based on your ChatMessage Entity/DTO):
        // message = { id: "guid", fromUserId: "id1", toUserId: "id2", text: "...", sentAt: "iso", senderName: "...", senderAvatar: "...", isRead: bool, replyToMessageId: "guid", replyToText: "...", replyToSenderName: "..." }
        const alignClass = isSender ? "right" : "left";
        const messageId = `msg-${message.id}`; // Prefix to avoid DOM ID conflicts
        const messageTime = message.sentAt ? new Date(message.sentAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : getCurrentTimeFormatted();
        const senderName = isSender ? "شما" : (message.senderName || "کاربر"); // Use "شما" for sender

        let messageContentHtml = '';

        // --- Reply Block ---
        if (message.replyToMessageId && message.replyToText) {
            const replySenderName = message.replyToSenderName || "کاربر";
            messageContentHtml += `
                <div class="replymessage-block mb-0 d-flex align-items-start">
                    <div class="flex-grow-1">
                        <h5 class="conversation-name">${replySenderName}</h5>
                        <p class="mb-0 text-truncate">${message.replyToText}</p>
                    </div>
                    <div class="flex-shrink-0">
                        <button type="button" class="btn btn-sm btn-link mt-n2 me-n3 font-size-18"> </button> <!-- Placeholder like original -->
                    </div>
                </div>`;
        }

        // --- Main Content (Text) ---
        if (message.text) {
            const textMarginClass = (message.replyToMessageId && message.replyToText) ? "mt-1" : "";
            messageContentHtml += `<div class="ctext-wrap-content" id="${messageId}">`;
            messageContentHtml += `<p class="mb-0 ctext-content ${textMarginClass}">${message.text}</p>`;
            messageContentHtml += `</div>`;
        }
        // TODO: Add similar blocks for images and files based on `chat.init.js`'s `u` function if needed

        // --- Message Meta & Dropdown ---
        messageContentHtml += `
            <div class="conversation-name">
                <small class="text-muted time">${messageTime}</small>
                ${isSender ? '<span class="text-success check-message-icon fs-12 ms-1"><i class="ri-check-double-line"></i></span>' : ''}
            </div>`;

        // --- Full Message HTML ---
        const messageHtml = `
            <li class="chat-list ${alignClass}" id="chat-id-${message.id}">
                <div class="conversation-list">
                    ${!isSender ? `
                        <div class="chat-avatar">
                            <img src="${message.senderAvatar || defaultAvatar}" alt="${senderName}">
                        </div>`
                : ''}
                    <div class="user-chat-content">
                        <div class="ctext-wrap">
                           ${messageContentHtml}
                        </div>
                        <div class="dropdown align-self-start message-dropdown">
                             <a class="btn btn-link text-muted p-1 mt-n1 dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                                 <i class="ri-more-2-fill"></i>
                             </a>
                             <div class="dropdown-menu">
                                 <a class="dropdown-item reply-message" href="#" data-message-id="${message.id}" data-message-text="${message.text || ''}" data-sender-name="${senderName}"><i class="ri-reply-line me-2 text-muted align-bottom"></i>پاسخ</a>
                                 <a class="dropdown-item copy-message" href="#" data-message-id="${messageId}"><i class="ri-file-copy-line me-2 text-muted align-bottom"></i>کپی</a>
                                 ${isSender ? `<a class="dropdown-item delete-message" href="#" data-message-id="${message.id}"><i class="ri-delete-bin-5-line me-2 text-muted align-bottom"></i>حذف</a>` : ''}
                                 <!-- Add Forward, Bookmark etc. if needed -->
                             </div>
                         </div>
                    </div>
                </div>
            </li>`;

        return messageHtml;
    }

    // Build HTML for a user/contact item in the sidebar
    function buildContactHtml(contact) {
        // contact object: { id: "guid", name: "...", avatar: "...", status: "online/offline", unreadCount: 0, lastMessage: "...", lastMessageTime: "..." }
        const isActive = contact.id === currentChatTargetId;
        const statusClass = contact.status === 'online' ? 'online' : 'away'; // Use 'away' for offline or other statuses as per Velzon style
        const timeStr = contact.lastMessageTime ? new Date(contact.lastMessageTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';

        return `
            <li id="contact-id-${contact.id}" class="${isActive ? 'active' : ''}">
                <a href="javascript: void(0);" class="unread-msg-user">
                    <div class="d-flex align-items-center">
                        <div class="flex-shrink-0 chat-user-img ${statusClass} user-own-img align-self-center me-3 ms-0">
                            <img src="${contact.avatar || defaultAvatar}" class="rounded-circle avatar-xs" alt="${contact.name}">
                            <span class="user-status"></span>
                        </div>
                        <div class="flex-grow-1 overflow-hidden">
                            <p class="text-truncate mb-0">${contact.name}</p>
                        </div>
                        ${contact.lastMessageTime ? `<div class="flex-shrink-0"><span class="time">${timeStr}</span></div>` : ''}
                        ${contact.unreadCount > 0 ? `<div class="flex-shrink-0 ms-2"><span class="badge badge-soft-dark rounded p-1">${contact.unreadCount}</span></div>` : ''}
                    </div>
                    ${contact.lastMessage ? `<div class="text-muted fs-12 text-truncate">${contact.lastMessage}</div>` : ''}
                 </a>
            </li>`;
    }


    // Update Chat Header
    function updateChatHeader(targetId, targetType = 'user') {
        const targetContact = contacts.find(c => c.id === targetId);
        if (!targetContact || !topBarContainer) return;

        if (topBarUsernameElement) topBarUsernameElement.textContent = targetContact.name;
        if (topBarAvatarImgElement) {
            topBarAvatarImgElement.src = targetContact.avatar || (targetType === 'user' ? defaultAvatar : multiUserAvatar);
            topBarAvatarImgElement.alt = targetContact.name;
        }

        // Update Status (Text and Badge)
        if (topBarStatusElement) {
            topBarStatusElement.textContent = targetContact.status === 'online' ? 'آنلاین' : 'آفلاین'; // Adjust text as needed
        }
        if (topBarAvatarStatusElement) {
            topBarAvatarStatusElement.className = `user-status ${targetContact.status === 'online' ? '' : 'd-none'}`; // Hide badge if offline
        }
        if (topBarUserImgElement) {
            topBarUserImgElement.classList.toggle('online', targetContact.status === 'online');
        }


        // Update Offcanvas Link Attributes (optional, but good practice)
        if (offcanvasUserProfile) {
            // Find elements inside offcanvas and update them too if needed
            const offcanvasUsername = offcanvasUserProfile.querySelector(".username");
            const offcanvasAvatar = offcanvasUserProfile.querySelector(".profile-img img");
            if (offcanvasUsername) offcanvasUsername.textContent = targetContact.name;
            if (offcanvasAvatar) {
                offcanvasAvatar.src = targetContact.avatar || defaultAvatar;
                offcanvasAvatar.alt = targetContact.name;
            }
        }
        // Update other offcanvas details based on targetContact if necessary
    }


    // Render User List
    function renderUserList(updatedContacts) {
        contacts = updatedContacts; // Update local cache
        if (!userListElement) return;

        userListElement.innerHTML = ""; // Clear existing list
        contacts.forEach(contact => {
            if (contact.type === 'user') { // Assuming a 'type' property distinguishes users/channels
                const contactHtml = buildContactHtml(contact);
                userListElement.insertAdjacentHTML("beforeend", contactHtml);
            }
        });

        // Re-attach click listeners after rendering
        attachContactClickListeners();
    }

    // Render Channel List (Similar to User List)
    function renderChannelList(updatedChannels) {
        // TODO: Implement if using channels separately
        console.log("Updating Channel List:", updatedChannels);
        if (!channelListElement) return;
        channelListElement.innerHTML = "";
        updatedChannels.forEach(channel => {
            // Assuming channel object has id, name, avatar etc.
            const channelHtml = buildContactHtml(channel); // Can reuse or adapt buildContactHtml
            channelListElement.insertAdjacentHTML("beforeend", channelHtml);
        });
        // Attach click listeners for channels if needed
    }


    // Display Chat History
    function displayChatHistory(messages) {
        const listElement = currentChatType === 'user' ? conversationListElement : channelConversationListElement;
        if (!listElement) return;

        listElement.innerHTML = ""; // Clear previous messages
        chatHistory = messages; // Store history

        messages.forEach(msg => {
            const isSender = msg.fromUserId === currentUserId;
            const messageHtml = buildMessageHtml(msg, isSender);
            listElement.insertAdjacentHTML("beforeend", messageHtml);
        });

        attachMessageActionListeners(); // Attach listeners to new messages
        scrollToBottom("chat-conversation");
        showLoader(false); // Hide loader after loading history
    }

    // Add a new message to the chat window
    function displayNewMessage(message) {
        // Only display if the message belongs to the currently active chat
        const isRelevant = (message.fromUserId === currentUserId && message.toUserId === currentChatTargetId) || // Sent by me to current target
            (message.fromUserId === currentChatTargetId && message.toUserId === currentUserId);   // Sent by current target to me
        // Add logic for channels if needed

        if (!isRelevant || !conversationListElement) {
            // Update unread count for the relevant contact in the list
            const contactIndex = contacts.findIndex(c => c.id === (message.fromUserId === currentUserId ? message.toUserId : message.fromUserId));
            if (contactIndex > -1) {
                contacts[contactIndex].unreadCount = (contacts[contactIndex].unreadCount || 0) + 1;
                contacts[contactIndex].lastMessage = message.text; // Update last message preview
                contacts[contactIndex].lastMessageTime = message.sentAt;
                // Re-render just that contact item for efficiency (or full list)
                const contactElement = document.getElementById(`contact-id-${contacts[contactIndex].id}`);
                if (contactElement) {
                    contactElement.outerHTML = buildContactHtml(contacts[contactIndex]);
                    // Need to re-attach listener to the updated element
                    const newElement = document.getElementById(`contact-id-${contacts[contactIndex].id}`);
                    newElement?.querySelector('a')?.addEventListener("click", handleContactClick);
                } else {
                    renderUserList(contacts); // Fallback to full re-render
                }
            }
            return;
        }


        const isSender = message.fromUserId === currentUserId;
        const messageHtml = buildMessageHtml(message, isSender);
        conversationListElement.insertAdjacentHTML("beforeend", messageHtml);
        chatHistory.push(message); // Add to local history cache

        attachMessageActionListeners(); // Re-attach listeners in case old ones were lost
        scrollToBottom("chat-conversation");

        // Optional: Send read receipt if the message was received and chat window is active
        // if (!isSender && connection && connection.state === signalR.HubConnectionState.Connected) {
        //     connection.invoke("MarkAsRead", currentChatTargetId).catch(err => console.error("MarkAsRead failed: ", err));
        // }
    }


    // ---=== EVENT HANDLERS ===---

    // Handle click on a contact in the sidebar
    function handleContactClick(event) {
        event.preventDefault();
        const listItem = event.currentTarget.closest('li');
        if (!listItem) return;

        const contactId = listItem.id.replace('contact-id-', '');
        const contact = contacts.find(c => c.id === contactId);

        if (!contact || contactId === currentChatTargetId) return; // No change or invalid contact

        // Update active state in UI
        document.querySelectorAll('#userList li.active, #channelList li.active').forEach(el => el.classList.remove('active'));
        listItem.classList.add('active');

        // Update state
        currentChatTargetId = contactId;
        currentChatType = contact.type || 'user'; // Assuming contact object has a 'type' ('user' or 'channel')

        // Show chat window, update header, show loader
        userChatElement?.classList.add("user-chat-show");
        chatWrapperElement?.classList.add("usr-chat-show"); // For mobile view
        updateChatHeader(currentChatTargetId, currentChatType);
        showLoader(true);
        if (conversationListElement) conversationListElement.innerHTML = ""; // Clear previous messages immediately

        // Reset reply state
        hideReplyCard();

        // Request chat history from server
        if (connection && connection.state === signalR.HubConnectionState.Connected) {
            connection.invoke("LoadChatHistory", currentChatTargetId)
                .then(() => {
                    // Reset unread count in local state and UI after loading history
                    const contactIndex = contacts.findIndex(c => c.id === contactId);
                    if (contactIndex > -1 && contacts[contactIndex].unreadCount > 0) {
                        contacts[contactIndex].unreadCount = 0;
                        // Update UI for this contact
                        const updatedElement = document.getElementById(listItem.id);
                        if (updatedElement) {
                            updatedElement.outerHTML = buildContactHtml(contacts[contactIndex]);
                            const newElement = document.getElementById(listItem.id);
                            newElement?.querySelector('a')?.addEventListener("click", handleContactClick);
                        }
                    }
                })
                .catch(err => {
                    console.error("LoadChatHistory failed: ", err);
                    showLoader(false);
                    // Display error message in chat window?
                });
        } else {
            console.error("SignalR connection not established.");
            showLoader(false);
            // Display connection error message?
        }
    }

    // Handle Chat Form Submission
    function handleSendMessage(event) {
        event.preventDefault();
        const messageText = chatInputElement?.value.trim();

        if (!messageText || !currentChatTargetId || !connection || connection.state !== signalR.HubConnectionState.Connected) {
            // Add feedback if input is empty? (Original had .chat-input-feedback)
            if (!messageText && chatInputElement) {
                chatInputElement.classList.add('is-invalid');
                setTimeout(() => chatInputElement.classList.remove('is-invalid'), 1500);
            }
            console.warn("Cannot send message. Text:", messageText, "Target:", currentChatTargetId, "Connection:", connection?.state);
            return;
        }

        // Clear input and hide reply card
        if (chatInputElement) chatInputElement.value = "";
        emojiPicker?.reset(); // Clear emoji picker selection if used
        hideReplyCard();


        // Optimistic UI Update (Optional but improves perceived speed)
        // Create a temporary message object and display it immediately
        const tempMessageId = `temp_${Date.now()}`; // Temporary ID
        const optimisticMessage = {
            id: tempMessageId,
            fromUserId: currentUserId,
            toUserId: currentChatTargetId,
            text: messageText,
            sentAt: new Date().toISOString(),
            senderName: "شما",
            senderAvatar: "...", // Fetch current user avatar if available
            isRead: false,
            replyToMessageId: isReplying ? replyingToMessageId : null,
            replyToText: isReplying ? replyCardMessageElement?.textContent : null,
            replyToSenderName: isReplying ? replyCardNameElement?.textContent : null
        };
        displayNewMessage(optimisticMessage); // Display greyed out or with sending indicator?


        // Send message via SignalR
        connection.invoke("SendMessage", currentChatTargetId, messageText, isReplying ? replyingToMessageId : null)
            .then((confirmedMessage) => {
                // Message confirmed by server. Update the optimistic message with real ID/timestamp if needed.
                console.log("Message sent successfully:", confirmedMessage);
                const tempElement = document.getElementById(`chat-id-${tempMessageId}`);
                if (tempElement && confirmedMessage && confirmedMessage.id) {
                    tempElement.id = `chat-id-${confirmedMessage.id}`;
                    // Update message ID in dropdown data attributes etc. if needed
                    tempElement.querySelectorAll('[data-message-id]').forEach(el => {
                        if (el.dataset.messageId === tempMessageId || el.dataset.messageId === `msg-${tempMessageId}`) {
                            el.dataset.messageId = confirmedMessage.id; // Or msg-id based on usage
                        }
                    });
                    // Maybe update timestamp or show read receipt checkmark?
                }
            })
            .catch(err => {
                console.error("SendMessage failed: ", err);
                // Handle error: Show error message, maybe revert optimistic update?
                const tempElement = document.getElementById(`chat-id-${tempMessageId}`);
                if (tempElement) {
                    // Option 1: Remove the message
                    // tempElement.remove();

                    // Option 2: Show a "failed to send" indicator
                    tempElement.classList.add("message-failed");
                    tempElement.title = "ارسال ناموفق بود";
                    // Consider adding a retry button
                }
            });

        // Reset reply state AFTER invoking SendMessage
        isReplying = false;
        replyingToMessageId = null;
    }

    // Handle Click on Reply Button
    function handleReplyClick(event) {
        event.preventDefault();
        const button = event.currentTarget;
        const messageId = button.dataset.messageId;
        const messageText = button.dataset.messageText;
        const senderName = button.dataset.senderName;

        if (!messageId || !replyCardElement) return;

        isReplying = true;
        replyingToMessageId = messageId;

        if (replyCardNameElement) replyCardNameElement.textContent = senderName;
        if (replyCardMessageElement) replyCardMessageElement.textContent = messageText;

        replyCardElement.classList.add("show");
        chatInputElement?.focus(); // Focus input after clicking reply
    }

    // Handle Click on Close Reply Button
    function hideReplyCard() {
        if (!replyCardElement) return;
        replyCardElement.classList.remove("show");
        isReplying = false;
        replyingToMessageId = null;
    }

    // Handle Click on Copy Button
    function handleCopyClick(event) {
        event.preventDefault();
        const button = event.currentTarget;
        const messageContentId = button.dataset.messageId; // Should be the ID of the ctext-wrap-content div
        const messageElement = document.getElementById(messageContentId);

        if (messageElement) {
            const textToCopy = messageElement.querySelector('.ctext-content')?.innerText;
            if (textToCopy) {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    showCopyAlert();
                }).catch(err => {
                    console.error('Failed to copy text: ', err);
                    // Show error feedback?
                });
            }
        }
    }

    // Handle Click on Delete Button
    function handleDeleteClick(event) {
        event.preventDefault();
        const button = event.currentTarget;
        const messageId = button.dataset.messageId;

        if (!messageId || !connection || connection.state !== signalR.HubConnectionState.Connected) return;

        // Optional: Confirmation dialog
        // if (!confirm("آیا از حذف این پیام مطمئن هستید؟")) return;

        // Visually remove immediately (Optimistic UI) - Or wait for confirmation
        const messageElement = document.getElementById(`chat-id-${messageId}`);
        messageElement?.remove(); // Remove the whole <li>

        connection.invoke("DeleteMessage", messageId)
            .then(() => {
                console.log("Message deleted successfully on server:", messageId);
                // Update local chatHistory if needed
                chatHistory = chatHistory.filter(m => m.id !== messageId);
            })
            .catch(err => {
                console.error("DeleteMessage failed:", err);
                // Re-add the message element? Show error?
                // You might need to re-render from chatHistory if the removal failed.
            });
    }


    // ---=== ATTACH EVENT LISTENERS ===---

    // Attach listeners to dynamically added contacts
    function attachContactClickListeners() {
        document.querySelectorAll('#userList li a, #channelList li a').forEach(link => {
            // Remove existing listener before adding a new one to prevent duplicates
            link.removeEventListener("click", handleContactClick);
            link.addEventListener("click", handleContactClick);
        });
    }

    // Attach listeners to dynamically added message action buttons
    function attachMessageActionListeners() {
        document.querySelectorAll('.reply-message').forEach(button => {
            button.removeEventListener('click', handleReplyClick); // Prevent duplicates
            button.addEventListener('click', handleReplyClick);
        });
        document.querySelectorAll('.copy-message').forEach(button => {
            button.removeEventListener('click', handleCopyClick);
            button.addEventListener('click', handleCopyClick);
        });
        document.querySelectorAll('.delete-message').forEach(button => {
            button.removeEventListener('click', handleDeleteClick);
            button.addEventListener('click', handleDeleteClick);
        });
        // Add listeners for GLightbox if images are present
        // const lightbox = GLightbox({ selector: ".popup-img", title: !1 });
    }

    // Attach listeners that only need to be set once
    function attachStaticListeners() {
        // Form submission
        chatFormElement?.addEventListener("submit", handleSendMessage);

        // Close Reply Card
        closeReplyButton?.addEventListener("click", hideReplyCard);

        // Mobile back button
        userChatRemoveButton?.addEventListener('click', function () {
            userChatElement?.classList.remove('user-chat-show');
            chatWrapperElement?.classList.remove("usr-chat-show");
            currentChatTargetId = null; // Clear current chat target when closing on mobile
        });

        // User profile offcanvas toggle links (from original Velzon)
        userProfileShowLinks?.forEach(link => {
            link.addEventListener('click', function (event) {
                event.preventDefault();
                const targetCanvas = document.querySelector(link.getAttribute('href')); // Assumes href links to offcanvas ID
                if (targetCanvas && bootstrap) { // Ensure bootstrap JS is loaded
                    const offcanvasInstance = bootstrap.Offcanvas.getOrCreateInstance(targetCanvas);
                    offcanvasInstance.show();
                }
                // Also update the offcanvas content if needed based on currentChatTargetId
                updateChatHeader(currentChatTargetId, currentChatType);
                // همچنین در صورت نیاز، محتوای offcanvas را بر اساس currentChatTargetId به‌روز کنید
                // updateChatHeader در حال حاضر هدر را به‌روز می‌کند، شاید لازم باشد یک تابع اختصاصی برای به‌روزرسانی جزئیات پروفایل در offcanvas اضافه شود.
                // مثال: updateOffcanvasProfile(currentChatTargetId);
            });
        });

        // Listener for Emoji Picker button
        // منطق باز و بسته شدن واقعی ممکن است توسط خود کتابخانه fgEmojiPicker کنترل شود اگر به درستی مقداردهی اولیه شده باشد.
        // اگر منطق toggle سفارشی نیاز است (مانند chat.init.js)، آن را اینجا اضافه کنید.
        // emojiButtonElement?.addEventListener('click', () => { ... });

        // Listener for Search input (اقتباس شده از searchMessages در chat.init.js)
        const searchMessageInput = document.getElementById("searchMessage");
        searchMessageInput?.addEventListener("keyup", function () {
            const searchTerm = searchMessageInput.value.toUpperCase();
            const messagesContainer = conversationListElement; // یا #channel-conversation بسته به نوع چت
            const messages = messagesContainer?.getElementsByTagName("li");
            if (!messages) return;

            Array.from(messages).forEach(function (messageLi) {
                // متن پیام را از <p class="ctext-content"> یا ساختار مشابه بگیرید
                const messageParagraph = messageLi.querySelector("p.ctext-content");
                const messageText = messageParagraph ? (messageParagraph.textContent || messageParagraph.innerText) : "";
                if (messageText.toUpperCase().indexOf(searchTerm) > -1) {
                    messageLi.style.display = ""; // نمایش پیام مطابق
                } else {
                    messageLi.style.display = "none"; // مخفی کردن پیام نامطابق
                }
            });
        });

    } // --- End of attachStaticListeners ---


    // ---=== INITIALIZATION FUNCTIONS ===---

    // Initialize SimpleBar (اقتباس شده از استفاده Velzon)
    function initSimpleBar() {
        const chatConversationElement = document.getElementById('chat-conversation');
        if (chatConversationElement) {
            try {
                // اگر simplebar قبلاً توسط تم مقداردهی شده است، نمونه موجود را بگیرید
                if (SimpleBar.instances.has(chatConversationElement)) {
                    simpleBarChat = SimpleBar.instances.get(chatConversationElement);
                    console.log("Using existing SimpleBar instance for #chat-conversation.");
                } else {
                    simpleBarChat = new SimpleBar(chatConversationElement);
                    console.log("Initialized new SimpleBar instance for #chat-conversation.");
                }
            } catch (e) {
                console.error("Failed to initialize SimpleBar for #chat-conversation:", e);
                // Fallback: Allow native scroll if SimpleBar fails
                chatConversationElement.style.overflowY = 'auto';
            }

        } else {
            console.warn("SimpleBar target #chat-conversation not found.");
        }

        const chatRoomListElement = document.querySelector('.chat-room-list'); // لیست سایدبار
        if (chatRoomListElement) {
            try {
                // بررسی کنید که آیا قبلاً simplebar توسط تم اعمال شده است
                if (SimpleBar.instances.has(chatRoomListElement)) {
                    simpleBarUsers = SimpleBar.instances.get(chatRoomListElement);
                    console.log("Using existing SimpleBar instance for .chat-room-list.");
                } else if (!chatRoomListElement.closest('.simplebar-scrollable-y')) { // بررسی مضاعف
                    simpleBarUsers = new SimpleBar(chatRoomListElement);
                    console.log("Initialized new SimpleBar instance for .chat-room-list.");
                } else {
                    console.log("SimpleBar seems already initialized for .chat-room-list by the theme.");
                }
            } catch (e) {
                console.error("Failed to initialize SimpleBar for .chat-room-list:", e);
                chatRoomListElement.style.overflowY = 'auto'; // Fallback
            }

        } else {
            console.warn("SimpleBar target .chat-room-list not found.");
        }
    }

    // Initialize Emoji Picker (اقتباس شده از chat.init.js و مستندات fgEmojiPicker)
    function initEmojiPicker() {
        const emojiPickerTrigger = document.querySelector('#emoji-btn'); // دکمه‌ای که picker را باز می‌کند
        if (emojiPickerTrigger && chatInputElement && window.FgEmojiPicker) {
            try {
                // اطمینان حاصل کنید که مسیر 'dir' به درستی به پوشه دارایی‌های fg-emoji-picker اشاره می‌کند
                // مسیر ممکن است نیاز به تنظیم داشته باشد بسته به ساختار پروژه شما
                const emojiPickerDir = '/lib/fg-emoji-picker/fgEmojiPicker.css'; // مسیر پیش‌فرض از LibMan یا مشابه
                // یا اگر از npm نصب شده: '/node_modules/fg-emoji-picker/dist/'

                emojiPicker = new FgEmojiPicker({
                    trigger: ['#emoji-btn'], // ID دکمه
                    removeOnSelect: false, // ایموجی پس از انتخاب پاک نشود
                    closeButton: true, // دکمه بستن
                    position: ['top', 'right'], // موقعیت (بالا، راست) - تنظیم کنید
                    preFetch: true, // بارگذاری اولیه ایموجی‌ها
                    dir: emojiPickerDir, // مسیر دارایی‌های کتابخانه (مهم!)
                    insertInto: chatInputElement, // فیلد ورودی برای درج ایموجی
                    // theme: 'dark' // تم اختیاری
                });
                console.log("fgEmojiPicker initialized.");
            } catch (error) {
                console.error("Failed to initialize fgEmojiPicker:", error);
            }
        } else {
            if (!emojiPickerTrigger) console.warn("Emoji Picker trigger button #emoji-btn not found.");
            if (!chatInputElement) console.warn("Emoji Picker target input #chat-input not found.");
            if (!window.FgEmojiPicker) console.warn("FgEmojiPicker library not found. Ensure it's loaded.");
        }
    }

    // ---=== SIGNALR CONNECTION ===---

    // Start SignalR Connection
    function startConnection() {
        // اگر از قبل متصل است، دوباره شروع نکن
        if (connection && connection.state === signalR.HubConnectionState.Connected) {
            console.log("SignalR already connected.");
            return Promise.resolve(); // یک Promise حل شده برگردان
        }

        // اگر در حال اتصال یا اتصال مجدد است، صبر کنید
        if (connection && (connection.state === signalR.HubConnectionState.Connecting || connection.state === signalR.HubConnectionState.Reconnecting)) {
            console.log("SignalR is currently connecting or reconnecting. Waiting...");
            // می‌توانید یک Promise برگردانید که وقتی اتصال برقرار شد، حل شود
            return new Promise((resolve, reject) => {
                const checkInterval = setInterval(() => {
                    if (!connection) {
                        clearInterval(checkInterval);
                        reject(new Error("Connection object became null during wait."));
                        return;
                    }
                    if (connection.state === signalR.HubConnectionState.Connected) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                    if (connection.state === signalR.HubConnectionState.Disconnected) {
                        clearInterval(checkInterval);
                        // تلاش برای شروع مجدد یا رد کردن خطا
                        console.log("Connection became disconnected while waiting. Attempting restart...");
                        startConnection().then(resolve).catch(reject);
                    }
                }, 500); // هر 500 میلی‌ثانیه بررسی کنید
            });
        }


        connection = new signalR.HubConnectionBuilder()
            .withUrl(hubUrl, {
                // اختیاری: پیکربندی انواع انتقال، تایم‌اوت‌ها، لاگ‌گیری، توکن دسترسی و غیره.
                accessTokenFactory: () => {
                    // اگر از احراز هویت استفاده می‌کنید، توکن JWT را اینجا برگردانید
                    // مثال: return localStorage.getItem("authToken");
                    return null; // نگهدارنده جا
                }
            })
            .withAutomaticReconnect([0, 2000, 5000, 10000, 15000, 30000]) // تلاش برای اتصال مجدد با تأخیرهای افزایشی
            .configureLogging(signalR.LogLevel.Information) // تنظیم سطح لاگ (Trace, Debug, Information, Warning, Error, Critical, None)
            .build();

        // --- Register Hub Event Handlers ---

        // دریافت پیام جدید
        connection.on("ReceiveMessage", (message) => {
            console.log("Message received:", message);
            displayNewMessage(message); // نمایش پیام در چت فعال یا به‌روزرسانی شمارنده خوانده نشده

            // به‌روزرسانی آخرین پیام/زمان لیست تماس‌ها (اگر چت فعلی نیست)
            const contactIdToUpdate = message.fromUserId === currentUserId ? message.toUserId : message.fromUserId;
            const contactIndex = contacts.findIndex(c => c.id === contactIdToUpdate);
            if (contactIndex > -1) {
                const isCurrentChat = currentChatTargetId === contactIdToUpdate;
                contacts[contactIndex].lastMessage = message.text;
                contacts[contactIndex].lastMessageTime = message.sentAt;
                // افزایش شمارنده خوانده نشده فقط اگر چت فعال نیست
                if (!isCurrentChat) {
                    contacts[contactIndex].unreadCount = (contacts[contactIndex].unreadCount || 0) + 1;
                }

                // رندر مجدد آیتم تماس (یا کل لیست)
                const contactElement = document.getElementById(`contact-id-${contactIdToUpdate}`);
                if (contactElement) {
                    const currentHtml = contactElement.outerHTML;
                    const newHtml = buildContactHtml(contacts[contactIndex]);
                    // فقط در صورت تغییر HTML رندر مجدد کنید تا از flicker جلوگیری شود
                    if (currentHtml !== newHtml) {
                        contactElement.outerHTML = newHtml;
                        // نیاز به اتصال مجدد listener به عنصر به‌روز شده
                        const newElement = document.getElementById(`contact-id-${contactIdToUpdate}`);
                        newElement?.querySelector('a')?.addEventListener("click", handleContactClick);
                    }
                }
            }
            // TODO: Logic for updating channel list if message is for a channel
        });

        // دریافت تاریخچه چت
        connection.on("LoadHistory", (messages) => {
            console.log("Chat history loaded:", messages);
            displayChatHistory(messages); // این تابع loader را نیز مخفی می‌کند
        });

        // دریافت لیست اولیه تماس‌ها/کاربران/کانال‌ها
        connection.on("LoadContacts", (initialContacts) => {
            console.log("Initial contacts received:", initialContacts);
            contacts = initialContacts; // ذخیره در حافظه پنهان محلی

            // جدا کردن کاربران و کانال‌ها بر اساس contact.type (اگر وجود دارد)
            const users = contacts.filter(c => c.type === 'user' || !c.type); // پیش‌فرض کاربر
            const channels = contacts.filter(c => c.type === 'channel');

            renderUserList(users);
            renderChannelList(channels); // پیاده‌سازی این اگر از کانال‌ها استفاده می‌کنید

            // پنهان کردن loader اگر تماس‌ها اولین چیزی هستند که بارگذاری می‌شوند
            showLoader(false);
        });


        // اتصال/ آنلاین شدن یک کاربر
        connection.on("UserConnected", (userId, userName) => {
            console.log(`User connected: ${userName} (${userId})`);
            const contactIndex = contacts.findIndex(c => c.id === userId && (c.type === 'user' || !c.type));
            if (contactIndex > -1) {
                contacts[contactIndex].status = 'online';
                // به‌روزرسانی UI برای این تماس
                const contactElement = document.getElementById(`contact-id-${userId}`);
                if (contactElement) {
                    contactElement.outerHTML = buildContactHtml(contacts[contactIndex]);
                    // نیاز به اتصال مجدد listener
                    const newElement = document.getElementById(`contact-id-${userId}`);
                    newElement?.querySelector('a')?.addEventListener("click", handleContactClick);
                }
                // به‌روزرسانی هدر اگر این کاربر هدف چت فعلی است
                if (userId === currentChatTargetId && currentChatType === 'user') {
                    updateChatHeader(currentChatTargetId, currentChatType);
                }
            } else {
                // اختیاری: اضافه کردن کاربر جدید به لیست تماس اگر قبلاً آنجا نبودند
                // این بستگی به منطق برنامه شما دارد
                console.log("New user connected who wasn't in the initial list:", userName);
                // const newUserContact = { id: userId, name: userName, avatar: defaultAvatar, status: 'online', type: 'user', unreadCount: 0, lastMessage: null, lastMessageTime: null };
                // contacts.push(newUserContact);
                // renderUserList(contacts.filter(c => c.type === 'user' || !c.type)); // یا افزودن انتخابی
            }
        });

        // قطع اتصال/ آفلاین شدن یک کاربر
        connection.on("UserDisconnected", (userId, lastSeen) => { // ممکن است سرور زمان آخرین بازدید را بفرستد
            console.log(`User disconnected: ${userId}`);
            const contactIndex = contacts.findIndex(c => c.id === userId && (c.type === 'user' || !c.type));
            if (contactIndex > -1) {
                contacts[contactIndex].status = 'offline'; // یا 'away'
                contacts[contactIndex].lastSeen = lastSeen; // ذخیره زمان آخرین بازدید (اختیاری)
                // به‌روزرسانی UI برای این تماس
                const contactElement = document.getElementById(`contact-id-${userId}`);
                if (contactElement) {
                    contactElement.outerHTML = buildContactHtml(contacts[contactIndex]);
                    // نیاز به اتصال مجدد listener
                    const newElement = document.getElementById(`contact-id-${userId}`);
                    newElement?.querySelector('a')?.addEventListener("click", handleContactClick);
                }
                // به‌روزرسانی هدر اگر این کاربر هدف چت فعلی است
                if (userId === currentChatTargetId && currentChatType === 'user') {
                    updateChatHeader(currentChatTargetId, currentChatType);
                }
            }
        });

        // تأیید/پخش حذف پیام (در صورت نیاز)
        connection.on("MessageDeleted", (messageId, deletedByUserId) => {
            console.log(`Message ${messageId} deleted by ${deletedByUserId}`);
            // فقط در صورتی حذف کنید که کاربر فعلی حذف را آغاز نکرده باشد (قبلاً به صورت خوش‌بینانه حذف شده است)
            if (deletedByUserId !== currentUserId) {
                const messageElement = document.getElementById(`chat-id-${messageId}`);
                messageElement?.remove();
                // به‌روزرسانی حافظه پنهان محلی chatHistory
                chatHistory = chatHistory.filter(m => m.id !== messageId);
            }
        });

        // اختیاری: مدیریت به‌روزرسانی‌های وضعیت (مانند رسید خواندن، در حال تایپ)
        connection.on("UpdateUserStatus", (userId, status, targetUserId) => {
            console.log(`Status update for ${userId}: ${status}`);
            // اگر وضعیت 'typing' است و مربوط به چت فعلی است، نشانگر تایپ را نمایش دهید
            if (status === 'typing' && userId === currentChatTargetId && targetUserId === currentUserId) {
                // TODO: نمایش نشانگر تایپ در هدر یا نزدیک فیلد ورودی
                // clearTimeout(typingTimer); // پاک کردن تایمر قبلی
                // typingTimer = setTimeout(() => { /* مخفی کردن نشانگر تایپ */ }, 3000); // مخفی کردن بعد از 3 ثانیه عدم فعالیت
            }
            // اگر وضعیت 'read' است، تیک‌های پیام‌های ارسال شده را به‌روز کنید
            // ...
        });

        // اختیاری: مدیریت خطاها از Hub
        connection.on("HubError", (errorMessage) => {
            console.error("Hub Error:", errorMessage);
            // نمایش خطا به کاربر؟ استفاده از یک toast یا alert
            // alert(`خطای سرور چت: ${errorMessage}`);
        });

        // --- Connection Lifecycle Handlers ---

        connection.onreconnecting(error => {
            console.warn(`SignalR connection lost. Attempting to reconnect... Error: ${error}`);
            // اختیاری: غیرفعال کردن ورودی، نمایش نشانگر اتصال مجدد
            if (chatInputElement) chatInputElement.disabled = true;
            if (topBarStatusElement) topBarStatusElement.textContent = "در حال اتصال مجدد...";
            // نمایش یک نشانگر بصری برای وضعیت اتصال مجدد
        });

        connection.onreconnected(connectionId => {
            console.log(`SignalR connection re-established. Connection ID: ${connectionId}`);
            // فعال کردن مجدد ورودی، پنهان کردن نشانگر
            if (chatInputElement) chatInputElement.disabled = false;
            // وضعیت هدر را به‌روز کنید
            if (currentChatTargetId) {
                updateChatHeader(currentChatTargetId, currentChatType);
            } else if (topBarStatusElement) {
                topBarStatusElement.textContent = ""; // پاک کردن وضعیت اتصال مجدد
            }

            // اختیاری: واکشی مجدد تماس‌ها یا پیام‌های از دست رفته در صورت لزوم،
            // اگرچه SignalR اغلب این را مدیریت می‌کند اگر به درستی پیکربندی شده باشد.
            // شاید فراخوانی یک متد Hub برای دریافت به‌روزرسانی‌ها از زمان قطع اتصال.
            // connection.invoke("GetUpdatesSince", lastSyncTime).catch(err => console.error("GetUpdatesSince failed: ", err));
        });

        connection.onclose(error => {
            console.error(`SignalR connection closed permanently. Error: ${error}`);
            connection = null; // تنظیم مجدد متغیر اتصال
            // غیرفعال کردن ورودی، نمایش وضعیت قطع شده، درخواست رفرش از کاربر؟
            if (chatInputElement) chatInputElement.disabled = true;
            if (topBarStatusElement) topBarStatusElement.textContent = "قطع شده";
            // به‌روزرسانی UI برای نشان دادن قطع دائمی اتصال
            alert("اتصال با سرور چت به طور دائمی قطع شده است. لطفاً صفحه را رفرش کنید.");
        });

        // --- Start the connection ---
        return connection.start()
            .then(() => {
                console.log("SignalR Connected successfully. Connection ID:", connection.connectionId);
                if (chatInputElement) chatInputElement.disabled = false; // اطمینان از فعال بودن ورودی
                showLoader(true); // نمایش loader هنگام واکشی داده‌های اولیه

                // اختیاری: فراخوانی یک متد Hub بلافاصله پس از اتصال در صورت نیاز
                // مثال: connection.invoke("GetInitialContacts").catch(err => console.error("GetInitialContacts failed: ", err));
                // نکته: فرض می‌کنیم سرور تماس‌های اولیه را از طریق "LoadContacts" پس از اتصال ارسال می‌کند.

                // درخواست لیست تماس‌ها اگر سرور آن را خودکار ارسال نمی‌کند
                if (connection && connection.state === signalR.HubConnectionState.Connected) {
                    connection.invoke("GetInitialContacts")
                        .catch(err => {
                            console.error("Failed to invoke GetInitialContacts:", err);
                            showLoader(false); // پنهان کردن لودر در صورت خطا
                        });
                }

            })
            .catch(err => {
                console.error("SignalR Connection Failed: ", err);
                connection = null; // تنظیم مجدد متغیر اتصال
                if (chatInputElement) chatInputElement.disabled = true;
                showLoader(false);
                alert("اتصال با سرور چت برقرار نشد. لطفاً بعداً امتحان کنید یا صفحه را رفرش کنید.");
                return Promise.reject(err); // انتشار خطا
            });

    } // --- End of startConnection ---

    // ---=== MAIN EXECUTION ===---

    // بررسی اولیه برای جایگزینی placeholder
    if (currentUserId === "USER_ID_PLACEHOLDER" || !currentUserId) {
        console.error("FATAL: 'currentUserId' is not set in chat.js. Please replace 'USER_ID_PLACEHOLDER' with the actual user ID from the server-side model/view.");
        // اختیاری: نمایش پیام خطا در صفحه
        if (chatContentElement) {
            chatContentElement.innerHTML = '<div class="alert alert-danger m-3">خطا در بارگذاری چت: شناسه کاربر یافت نشد. لطفاً با پشتیبانی تماس بگیرید.</div>';
        } else {
            // افزودن پیام خطا به body اگر chatContentElement یافت نشد
            const errorDiv = document.createElement('div');
            errorDiv.className = 'alert alert-danger m-3';
            errorDiv.textContent = 'خطا در بارگذاری چت: شناسه کاربر یافت نشد.';
            document.body.prepend(errorDiv);
        }
        showLoader(false); // اطمینان از پنهان بودن لودر
        return; // توقف اجرا اگر شناسه کاربر وجود ندارد
    }

    console.log("Initializing Chat with User ID:", currentUserId);

    // مقداردهی اولیه کامپوننت‌های UI
    // SimpleBar و EmojiPicker به کمی تاخیر نیاز دارند تا مطمئن شوند عناصر در DOM هستند
    setTimeout(() => {
        initSimpleBar();
        initEmojiPicker();
    }, 100); // 100 میلی‌ثانیه تاخیر (تنظیم کنید در صورت نیاز)

    attachStaticListeners(); // اتصال listeners برای عناصر استاتیک

    // نمایش loader در ابتدا
    showLoader(true);

    // شروع اتصال SignalR و واکشی داده‌های اولیه
    startConnection()
        .then(() => {
            // اتصال موفقیت‌آمیز بود، loader توسط LoadContacts یا LoadHistory پنهان خواهد شد.
            console.log("Chat initialization sequence started after connection.");
        })
        .catch(() => {
            // اتصال ناموفق بود، خطا قبلاً لاگ شده و loader توسط startConnection پنهان شده است.
            console.error("Chat initialization failed due to connection error.");
        });


}); // --- End of DOMContentLoaded ---