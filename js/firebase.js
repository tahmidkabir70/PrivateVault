// ===== Private Vault — File Description =====
// firebase.js
// Responsibility: Firebase initialization, exported auth/database instances,
// and shared presentation-agnostic utilities (language system, hashing,
// formatting, linkify, emoji palette, Cloudinary/Giphy config, vault session).
// This file must NEVER contain application/database business logic.
// All reads/writes to Firebase Authentication and Realtime Database live in js/auth.js.
// Media uploads use Cloudinary (unsigned preset) — never Firebase Storage.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ----------------------------------------------------------------------------
// Firebase configuration (client-side config — safe to expose; this is not a
// secret key. Never place Admin SDK / service-account credentials here.)
// ----------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyD_uwPJURNmwK3nUHlmcoJH-h58tfdmv2I",
  authDomain: "sns-bd.firebaseapp.com",
  databaseURL: "https://sns-bd-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sns-bd",
  storageBucket: "sns-bd.firebasestorage.app",
  messagingSenderId: "996829966910",
  appId: "1:996829966910:web:0060ff07d8322616fd176f",
};

const app = initializeApp(firebaseConfig);

/** Firebase Authentication instance, shared across the app. */
export const auth = getAuth(app);

/** Firebase Realtime Database instance, shared across the app. */
export const database = getDatabase(app);

// ============================================================================
// LANGUAGE SYSTEM
// ============================================================================

const LANG_STORAGE_KEY = "pv_lang";
const DEFAULT_LANG = "bn";

export const translations = {
  bn: {
    app_name: "প্রাইভেট ভল্ট",
    lang_toggle: "🌐 বাংলা | English",

    // Formula / landing page
    formula_page_title: "বীজগণিতের সূত্রাবলি",
    formula_page_subtitle: "স্পর্শ করে প্রতিটি সূত্রের ব্যাখ্যা দেখুন",
    help_button: "সাহায্য",
    help_modal_title: "কীভাবে ব্যবহার করবেন",
    help_modal_body:
      "প্রতিটি কার্ডে একবার স্পর্শ করলে সূত্রের বিস্তৃতি ও ব্যাখ্যা দেখা যায়। আবার স্পর্শ করলে ব্যাখ্যাটি বন্ধ হয়ে যায়। ভাষা পরিবর্তন করতে উপরের ভাষা বোতাম ব্যবহার করুন।",
    help_close: "বন্ধ করুন",
    formula_hint_title: "🧩 সূত্রের ইঙ্গিত",
    formula_hint_body:
      "একবার স্পর্শে সূত্রের ব্যাখ্যা,\nদুবার স্পর্শে হয়তো খুলবে অন্য কোনো পথ।\n\nকিছু দরজা একবার ছোঁয়ায় খোলে না—\nএকই জায়গায় দুবার স্পর্শ করলেই\nহয়তো আবিষ্কার হবে নতুন কিছু। 😉\n\nকোন সূত্রটি সেই পথের চাবি?\n\n⏱️ একটু ভাবুন...",

    // Formula cards
    f_sum_sq_title: "(a + b)²",
    f_sum_sq_expansion: "a² + 2ab + b²",
    f_sum_sq_explain: "দুটি রাশির যোগফলের বর্গ, প্রথম রাশির বর্গ, দ্বিগুণ গুণফল এবং দ্বিতীয় রাশির বর্গের সমষ্টির সমান।",

    f_diff_sq_title: "(a − b)²",
    f_diff_sq_expansion: "a² − 2ab + b²",
    f_diff_sq_explain: "দুটি রাশির বিয়োগফলের বর্গ, প্রথম রাশির বর্গ বিয়োগ দ্বিগুণ গুণফল যোগ দ্বিতীয় রাশির বর্গের সমান।",

    f_sum_cube_title: "(a + b)³",
    f_sum_cube_expansion: "a³ + 3a²b + 3ab² + b³",
    f_sum_cube_explain: "দুটি রাশির যোগফলের ঘন, চারটি পদের সমষ্টি হিসেবে বিস্তৃত হয়।",

    f_diff_cube_title: "(a − b)³",
    f_diff_cube_expansion: "a³ − 3a²b + 3ab² − b³",
    f_diff_cube_explain: "দুটি রাশির বিয়োগফলের ঘন, পদগুলোর চিহ্ন পালাক্রমে পরিবর্তিত হয়।",

    f_sum_of_sq_title: "a² + b²",
    f_sum_of_sq_expansion: "(a + b)² − 2ab",
    f_sum_of_sq_explain: "দুটি বর্গের যোগফলকে যোগফলের বর্গ থেকে দ্বিগুণ গুণফল বিয়োগ করে পাওয়া যায়।",

    f_diff_of_sq_title: "a² − b²",
    f_diff_of_sq_expansion: "(a + b)(a − b)",
    f_diff_of_sq_explain: "দুটি বর্গের বিয়োগফল দুটি রাশির যোগফল ও বিয়োগফলের গুণফলের সমান। এটি এই পাতার সবচেয়ে বিশেষ রূপান্তর।",

    f_sum_cubes_title: "a³ + b³",
    f_sum_cubes_expansion: "(a + b)(a² − ab + b²)",
    f_sum_cubes_explain: "দুটি ঘনের যোগফল একটি দ্বিপদী ও একটি ত্রিপদী উৎপাদকের গুণফলে প্রকাশ করা যায়।",

    f_diff_cubes_title: "a³ − b³",
    f_diff_cubes_expansion: "(a − b)(a² + ab + b²)",
    f_diff_cubes_explain: "দুটি ঘনের বিয়োগফল একটি দ্বিপদী ও একটি ত্রিপদী উৎপাদকের গুণফলে প্রকাশ করা যায়।",

    tap_hint: "ব্যাখ্যার জন্য স্পর্শ করুন",

    // Auth
    email_label: "ইমেইল",
    password_label: "পাসওয়ার্ড",
    email_placeholder: "you@example.com",
    password_placeholder: "••••••••",
    show_password: "পাসওয়ার্ড দেখান",
    hide_password: "পাসওয়ার্ড লুকান",

    login_title: "প্রবেশ করুন",
    login_subtitle: "আপনার ভল্টে ফিরে স্বাগতম",
    login_button: "প্রবেশ করুন",
    forgot_password: "পাসওয়ার্ড ভুলে গেছেন?",
    reset_email_sent: "পাসওয়ার্ড রিসেট লিংক ইমেইলে পাঠানো হয়েছে (যদি অ্যাকাউন্ট থাকে)।",
    login_loading: "প্রবেশ করা হচ্ছে...",
    no_account_text: "অ্যাকাউন্ট নেই?",
    go_to_signup: "নিবন্ধন করুন",
    err_invalid_credentials: "ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।",
    err_too_many_requests: "অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।",
    err_network: "নেটওয়ার্ক সংযোগ পাওয়া যায়নি।",
    err_generic: "কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।",
    err_required_fields: "ইমেইল ও পাসওয়ার্ড দিন।",

    signup_title: "নিবন্ধন করুন",
    signup_subtitle: "আপনার প্রাইভেট ভল্ট তৈরি করুন",
    display_name_label: "প্রদর্শিত নাম",
    display_name_placeholder: "আপনার নাম",
    username_label: "ইউজারনেম",
    username_placeholder: "username",
    confirm_password_label: "পাসওয়ার্ড নিশ্চিত করুন",
    signup_button: "অ্যাকাউন্ট তৈরি করুন",
    signup_loading: "তৈরি করা হচ্ছে...",
    have_account_text: "ইতিমধ্যে অ্যাকাউন্ট আছে?",
    go_to_login: "প্রবেশ করুন",
    username_checking: "যাচাই করা হচ্ছে...",
    username_available: "এই ইউজারনেম নেওয়া যাবে",
    username_taken: "এই ইউজারনেম ইতিমধ্যে ব্যবহৃত হয়েছে",
    username_invalid: "৩–২০ অক্ষর, শুধু অক্ষর/সংখ্যা/আন্ডারস্কোর ব্যবহার করুন",
    err_email_invalid: "সঠিক ইমেইল ঠিকানা দিন।",
    err_display_name_required: "প্রদর্শিত নাম আবশ্যক।",
    err_password_short: "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।",
    err_password_mismatch: "পাসওয়ার্ড দুটি মিলছে না।",
    err_email_in_use: "এই ইমেইল দিয়ে ইতিমধ্যে অ্যাকাউন্ট আছে।",
    err_weak_password: "পাসওয়ার্ডটি খুবই দুর্বল।",
    signup_success: "অ্যাকাউন্ট তৈরি হয়েছে। ভল্টে যাওয়া হচ্ছে...",

    // Vault
    vault_title_setup: "ভল্ট পাসওয়ার্ড তৈরি করুন",
    vault_title_verify: "ভল্ট আনলক করুন",
    vault_subtitle_setup: "এটি আপনার ফায়ারবেস পাসওয়ার্ড থেকে আলাদা একটি অতিরিক্ত নিরাপত্তা স্তর।",
    vault_subtitle_verify: "চালিয়ে যেতে আপনার ভল্ট পাসওয়ার্ড দিন।",
    vault_password_label: "ভল্ট পাসওয়ার্ড",
    vault_confirm_label: "ভল্ট পাসওয়ার্ড নিশ্চিত করুন",
    vault_button_setup: "ভল্ট তৈরি করুন",
    vault_button_verify: "আনলক করুন",
    vault_loading: "যাচাই করা হচ্ছে...",
    err_vault_mismatch: "দুটি পাসওয়ার্ড মিলছে না।",
    err_vault_short: "ভল্ট পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।",
    err_vault_incorrect: "ভল্ট পাসওয়ার্ড সঠিক নয়।",

    // Dashboard
    dashboard_greeting: "স্বাগতম",
    dashboard_nav_friends: "বন্ধুরা",
    dashboard_nav_friends_desc: "বন্ধু খুঁজুন ও অনুরোধ পরিচালনা করুন",
    dashboard_nav_chats: "চ্যাট",
    dashboard_nav_chats_desc: "কথোপকথন শুরু করুন বা চালিয়ে যান",
    dashboard_nav_notifications: "নোটিফিকেশন",
    dashboard_nav_notifications_desc: "সব নোটিফিকেশন দেখুন",
    dashboard_nav_stories: "স্টোরিজ",
    dashboard_nav_stories_desc: "বন্ধুদের ২৪-ঘণ্টার আপডেট",
    dashboard_nav_profile: "প্রোফাইল",
    dashboard_nav_profile_desc: "তথ্য ও গোপনীয়তা সেটিংস পরিচালনা করুন",
    lock_vault_button: "ভল্ট লক করুন",
    sign_out_button: "সাইন আউট",
    status_online: "🟢 অনলাইন",
    status_offline: "⚪ অফলাইন",
    dashboard_loading: "লোড হচ্ছে...",

    // Friends
    friends_title: "বন্ধুরা",
    friends_subtitle: "ইউজারনেম দিয়ে খুঁজুন এবং অনুরোধ পাঠান",
    back_to_dashboard: "← ড্যাশবোর্ড",
    friends_search_placeholder: "ইউজারনেম লিখুন...",
    friends_search_button: "খুঁজুন",
    friends_tab_all: "বন্ধু তালিকা",
    friends_tab_requests: "অনুরোধ",
    friends_empty_list: "এখনো কোনো বন্ধু নেই।",
    friends_empty_search: "ইউজারনেম লিখে খুঁজুন।",
    friends_search_no_results: "কোনো ব্যবহারকারী পাওয়া যায়নি।",
    btn_add_friend: "বন্ধু যোগ করুন",
    btn_cancel_request: "অনুরোধ বাতিল করুন",
    btn_accept: "গ্রহণ করুন",
    btn_reject: "প্রত্যাখ্যান করুন",
    btn_remove_friend: "বন্ধু তালিকা থেকে সরান",
    label_friends_badge: "✓ বন্ধু",
    incoming_requests_title: "আগত অনুরোধ",
    sent_requests_title: "পাঠানো অনুরোধ",
    no_incoming_requests: "কোনো আগত অনুরোধ নেই।",
    no_sent_requests: "কোনো পাঠানো অনুরোধ নেই।",
    searching_label: "খোঁজা হচ্ছে...",
    friend_request_sent: "অনুরোধ পাঠানো হয়েছে।",
    err_search_failed: "খুঁজতে সমস্যা হয়েছে। আবার চেষ্টা করুন।",
    err_search_too_short: "কমপক্ষে ২ অক্ষর লিখুন।",

    // Chat list
    chat_title: "চ্যাট",
    chat_subtitle: "আপনার কথোপকথন",
    new_chat_button: "+ নতুন",
    chat_list_empty: "এখনো কোনো কথোপকথন নেই।",
    chat_list_no_friends_hint: "প্রথমে বন্ধু যোগ করুন, তারপর চ্যাট শুরু করুন।",
    go_to_friends: "বন্ধু খুঁজুন",
    new_dialog_title: "নতুন কথোপকথন",
    new_dialog_tab_direct: "ডাইরেক্ট",
    new_dialog_tab_group: "গ্রুপ",
    new_dialog_no_friends: "চ্যাট শুরু করতে আগে কাউকে বন্ধু বানান।",
    group_name_label: "গ্রুপের নাম",
    group_name_placeholder: "গ্রুপের নাম লিখুন",
    group_select_members: "সদস্য নির্বাচন করুন",
    create_group_button: "গ্রুপ তৈরি করুন",
    err_group_name_required: "গ্রুপের নাম আবশ্যক।",
    err_group_members_required: "কমপক্ষে একজন সদস্য নির্বাচন করুন।",
    cancel_button: "বাতিল",
    untitled_group: "নামহীন গ্রুপ",
    group_member_count: "জন সদস্য",

    // Chat room
    back_to_chats: "← চ্যাট তালিকা",
    type_message_placeholder: "একটি বার্তা লিখুন...",
    send_button: "পাঠান",
    messages_loading: "বার্তা লোড হচ্ছে...",
    messages_empty: "এখনো কোনো বার্তা নেই। প্রথম বার্তাটি পাঠান।",
    err_message_failed: "বার্তা পাঠাতে ব্যর্থ হয়েছে।",
    err_load_messages_failed: "বার্তা লোড করা যায়নি।",
    err_chat_not_found: "এই কথোপকথনটি পাওয়া যায়নি।",

    // Message actions
    message_actions_label: "আরও অপশন",
    reply_label: "উত্তর দিন",
    copy_label: "কপি করুন",
    copied_label: "কপি হয়েছে",
    edit_label: "সম্পাদনা করুন",
    delete_label: "মুছুন",
    save_label: "সংরক্ষণ করুন",
    react_label: "প্রতিক্রিয়া",
    replying_to_label: "উত্তর দিচ্ছেন",
    deleted_message_placeholder: "এই বার্তাটি মুছে ফেলা হয়েছে।",
    message_edited_label: "(সম্পাদিত)",
    confirm_delete_message: "আপনি কি নিশ্চিত এই বার্তাটি মুছতে চান?",
    err_edit_failed: "বার্তা সম্পাদনা করা যায়নি।",
    err_delete_failed: "বার্তা মুছা যায়নি।",

    // Media
    attach_button: "সংযুক্তি যোগ করুন",
    emoji_button: "ইমোজি",
    gif_button: "GIF",
    gif_dialog_title: "GIF খুঁজুন",
    gif_search_placeholder: "GIF খুঁজুন...",
    gif_search_button: "খুঁজুন",
    gif_loading: "খোঁজা হচ্ছে...",
    gif_type_to_search: "GIF খুঁজতে কিছু লিখুন।",
    gif_no_results: "কোনো GIF পাওয়া যায়নি।",
    err_gif_network: "GIF লোড করা যায়নি। নেটওয়ার্ক পরীক্ষা করুন।",
    err_gif_rate_limited: "অনেকবার চেষ্টা করা হয়েছে। একটু পর আবার চেষ্টা করুন।",
    err_file_too_large: "ফাইলটি অনেক বড়। সর্বোচ্চ ৮ MB অনুমোদিত।",
    err_upload_failed: "আপলোড ব্যর্থ হয়েছে।",
    uploading_label: "আপলোড হচ্ছে...",
    attachment_generic_label: "ফাইল",
    download_label: "ডাউনলোড করুন",

    // Real-time
    is_typing_suffix: "লিখছে...",
    several_typing: "কয়েকজন লিখছে...",
    last_seen_prefix: "সর্বশেষ সক্রিয়",
    sending_label: "পাঠানো হচ্ছে...",
    sent_label: "✓ পাঠানো হয়েছে",
    seen_label: "✓✓ দেখা হয়েছে",
    loading_older_label: "পুরনো বার্তা লোড হচ্ছে...",

    // Groups
    group_settings_button: "গ্রুপ সেটিংস",
    chat_options_button: "অপশন",
    group_settings_title: "গ্রুপ সেটিংস",
    group_members_label: "সদস্যরা",
    add_member_button: "সদস্য যোগ করুন",
    remove_member_button: "সরিয়ে দিন",
    leave_group_button: "গ্রুপ ত্যাগ করুন",
    confirm_leave_group: "আপনি কি এই গ্রুপ ত্যাগ করতে চান?",
    confirm_remove_member: "এই সদস্যকে সরিয়ে দিতে চান?",
    err_not_group_admin: "শুধুমাত্র গ্রুপ তৈরিকারীই এই কাজ করতে পারবেন।",
    group_creator_badge: "স্রষ্টা",
    no_more_friends_to_add: "যোগ করার মতো আর কোনো বন্ধু নেই।",

    // Safety
    block_user_button: "ব্যবহারকারীকে ব্লক করুন",
    report_user_button: "রিপোর্ট করুন",
    confirm_block_user: "এই ব্যবহারকারীকে ব্লক করতে চান?",
    report_dialog_title: "রিপোর্ট করুন",
    report_reason_label: "কারণ লিখুন",
    report_reason_placeholder: "কী সমস্যা হয়েছে তা লিখুন...",
    submit_report_button: "জমা দিন",
    report_submitted: "রিপোর্ট জমা দেওয়া হয়েছে।",
    err_report_failed: "রিপোর্ট জমা দেওয়া যায়নি।",
    user_blocked_badge: "ব্লক করা হয়েছে",

    // Profile
    profile_title: "প্রোফাইল",
    profile_subtitle: "আপনার তথ্য ও গোপনীয়তা সেটিংস",
    email_readonly_label: "ইমেইল",
    username_readonly_label: "ইউজারনেম",
    save_changes_button: "পরিবর্তন সংরক্ষণ করুন",
    profile_updated: "প্রোফাইল হালনাগাদ হয়েছে।",
    privacy_settings_title: "গোপনীয়তা",
    show_status_label: "অনলাইন স্ট্যাটাস দেখান",
    show_last_seen_label: "সর্বশেষ সক্রিয়তার সময় দেখান",

    // Notifications
    notifications_title: "নোটিফিকেশন",
    notifications_subtitle: "আপনার সাম্প্রতিক কার্যকলাপ",
    notifications_empty: "কোনো নোটিফিকেশন নেই।",
    mark_all_read_button: "সব পড়া হয়েছে",
    mark_read_button: "পড়া হয়েছে",
    notification_default_title: "নতুন নোটিফিকেশন",
    notification_default_body: "আপনার একটি নতুন নোটিফিকেশন আছে।",
    notif_friend_request_title: "নতুন বন্ধু অনুরোধ",
    notif_friend_request_body: "আপনাকে একটি ফ্রেন্ড রিকোয়েস্ট পাঠানো হয়েছে।",
    notif_friend_accepted_title: "অনুরোধ গৃহীত হয়েছে",
    notif_friend_accepted_body: "আপনার ফ্রেন্ড রিকোয়েস্ট গ্রহণ করা হয়েছে।",
    notif_group_added_title: "নতুন গ্রুপে যুক্ত হয়েছেন",
    notif_group_added_body: "আপনাকে একটি গ্রুপে যুক্ত করা হয়েছে।",

    // Stories
    stories_title: "স্টোরিজ",
    stories_subtitle: "আপনার বন্ধুদের ২৪-ঘণ্টার আপডেট",
    stories_empty: "কোনো স্টোরি নেই।",
    add_story_button: "+ নতুন স্টোরি",
    add_story_title: "নতুন স্টোরি যোগ করুন",
    add_story_subtitle: "একটি ইমেজ বা শর্ট ভিডিও আপলোড করুন",
    story_file_label: "ফাইল নির্বাচন করুন",
    story_count: "টি স্টোরি",
    just_now: "এইমাত্র",
    err_story_upload_failed: "স্টোরি আপলোড ব্যর্থ হয়েছে।",
    err_file_required: "একটি ফাইল নির্বাচন করুন।",
    err_unsupported_file_type: "শুধু ইমেজ বা ভিডিও অনুমোদিত।",
    err_unsupported_file: "এই ফাইল ধরন অনুমোদিত নয়।",
    err_permission_denied: "এই কাজের অনুমতি নেই।",
    err_video_too_large: "ভিডিও ৫০ MB-এর বেশি হতে পারে না।",
    err_not_authorized: "আপনার এই কাজ করার অনুমতি নেই।",
    err_story_not_found: "স্টোরি পাওয়া যায়নি।",
    story_created: "স্টোরি তৈরি হয়েছে।",
  },

  en: {
    app_name: "Private Vault",
    lang_toggle: "🌐 বাংলা | English",

    formula_page_title: "Algebraic Formula Reference",
    formula_page_subtitle: "Tap any card to see how it expands",
    help_button: "Help",
    help_modal_title: "How this page works",
    help_modal_body:
      "Tap a card once to reveal its expansion and explanation. Tap it again to close it. Use the language button above to switch languages.",
    help_close: "Close",
    formula_hint_title: "🧩 Formula hint",
    formula_hint_body:
      "One touch reveals a formula's meaning,\ntwo touches, in the same place, might open something else.\n\nSome doors don't open on the first touch—\ntouch the same spot twice\nand something new might be waiting. 😉\n\nWhich formula holds that key?\n\n⏱️ Think for a moment...",

    f_sum_sq_title: "(a + b)²",
    f_sum_sq_expansion: "a² + 2ab + b²",
    f_sum_sq_explain: "The square of a sum equals the square of the first term, plus twice their product, plus the square of the second term.",

    f_diff_sq_title: "(a − b)²",
    f_diff_sq_expansion: "a² − 2ab + b²",
    f_diff_sq_explain: "The square of a difference equals the square of the first term, minus twice their product, plus the square of the second term.",

    f_sum_cube_title: "(a + b)³",
    f_sum_cube_expansion: "a³ + 3a²b + 3ab² + b³",
    f_sum_cube_explain: "The cube of a sum expands into four terms with steadily shifting powers of a and b.",

    f_diff_cube_title: "(a − b)³",
    f_diff_cube_expansion: "a³ − 3a²b + 3ab² − b³",
    f_diff_cube_explain: "The cube of a difference expands like the sum, but the sign alternates term by term.",

    f_sum_of_sq_title: "a² + b²",
    f_sum_of_sq_expansion: "(a + b)² − 2ab",
    f_sum_of_sq_explain: "A sum of squares can be recovered from the square of the sum by subtracting twice the product.",

    f_diff_of_sq_title: "a² − b²",
    f_diff_of_sq_expansion: "(a + b)(a − b)",
    f_diff_of_sq_explain: "A difference of squares factors into the product of the sum and the difference. The most distinctive transformation on this page.",

    f_sum_cubes_title: "a³ + b³",
    f_sum_cubes_expansion: "(a + b)(a² − ab + b²)",
    f_sum_cubes_explain: "A sum of cubes factors into a binomial times a trinomial.",

    f_diff_cubes_title: "a³ − b³",
    f_diff_cubes_expansion: "(a − b)(a² + ab + b²)",
    f_diff_cubes_explain: "A difference of cubes also factors into a binomial times a trinomial, with the middle sign flipped.",

    tap_hint: "Tap for explanation",

    email_label: "Email",
    password_label: "Password",
    email_placeholder: "you@example.com",
    password_placeholder: "••••••••",
    show_password: "Show password",
    hide_password: "Hide password",

    login_title: "Sign in",
    login_subtitle: "Welcome back to your vault",
    login_button: "Sign in",
    login_loading: "Signing in...",
    forgot_password: "Forgot password?",
    reset_email_sent: "If an account exists for that email, a reset link has been sent.",
    no_account_text: "Don't have an account?",
    go_to_signup: "Create one",
    err_invalid_credentials: "That email or password isn't right.",
    err_too_many_requests: "Too many attempts. Try again in a little while.",
    err_network: "Couldn't reach the network.",
    err_generic: "Something went wrong. Please try again.",
    err_required_fields: "Enter your email and password.",

    signup_title: "Create account",
    signup_subtitle: "Set up your private vault",
    display_name_label: "Display name",
    display_name_placeholder: "Your name",
    username_label: "Username",
    username_placeholder: "username",
    confirm_password_label: "Confirm password",
    signup_button: "Create account",
    signup_loading: "Creating account...",
    have_account_text: "Already have an account?",
    go_to_login: "Sign in",
    username_checking: "Checking...",
    username_available: "This username is available",
    username_taken: "This username is already taken",
    username_invalid: "3–20 characters, letters/numbers/underscore only",
    err_email_invalid: "Enter a valid email address.",
    err_display_name_required: "Display name is required.",
    err_password_short: "Password must be at least 6 characters.",
    err_password_mismatch: "Passwords don't match.",
    err_email_in_use: "An account already exists for this email.",
    err_weak_password: "That password is too weak.",
    signup_success: "Account created. Taking you to your vault...",

    vault_title_setup: "Create your vault password",
    vault_title_verify: "Unlock your vault",
    vault_subtitle_setup: "This is a separate security layer from your account password.",
    vault_subtitle_verify: "Enter your vault password to continue.",
    vault_password_label: "Vault password",
    vault_confirm_label: "Confirm vault password",
    vault_button_setup: "Create vault",
    vault_button_verify: "Unlock",
    vault_loading: "Checking...",
    err_vault_mismatch: "The two passwords don't match.",
    err_vault_short: "The vault password must be at least 6 characters.",
    err_vault_incorrect: "That vault password isn't right.",

    dashboard_greeting: "Welcome",
    dashboard_nav_friends: "Friends",
    dashboard_nav_friends_desc: "Find friends and manage requests",
    dashboard_nav_chats: "Chats",
    dashboard_nav_chats_desc: "Start or continue a conversation",
    dashboard_nav_notifications: "Notifications",
    dashboard_nav_notifications_desc: "View all notifications",
    dashboard_nav_stories: "Stories",
    dashboard_nav_stories_desc: "Friends' 24-hour updates",
    dashboard_nav_profile: "Profile",
    dashboard_nav_profile_desc: "Manage your info and privacy settings",
    lock_vault_button: "Lock vault",
    sign_out_button: "Sign out",
    status_online: "🟢 Online",
    status_offline: "⚪ Offline",
    dashboard_loading: "Loading...",

    friends_title: "Friends",
    friends_subtitle: "Search by username and send requests",
    back_to_dashboard: "← Dashboard",
    friends_search_placeholder: "Type a username...",
    friends_search_button: "Search",
    friends_tab_all: "Friend list",
    friends_tab_requests: "Requests",
    friends_empty_list: "No friends yet.",
    friends_empty_search: "Search for a username above.",
    friends_search_no_results: "No users found.",
    btn_add_friend: "Add friend",
    btn_cancel_request: "Cancel request",
    btn_accept: "Accept",
    btn_reject: "Reject",
    btn_remove_friend: "Remove friend",
    label_friends_badge: "✓ Friends",
    incoming_requests_title: "Incoming requests",
    sent_requests_title: "Sent requests",
    no_incoming_requests: "No incoming requests.",
    no_sent_requests: "No sent requests.",
    searching_label: "Searching...",
    friend_request_sent: "Request sent.",
    err_search_failed: "Search failed. Please try again.",
    err_search_too_short: "Type at least 2 characters.",

    chat_title: "Chats",
    chat_subtitle: "Your conversations",
    new_chat_button: "+ New",
    chat_list_empty: "No conversations yet.",
    chat_list_no_friends_hint: "Add a friend first, then start a chat.",
    go_to_friends: "Find friends",
    new_dialog_title: "New conversation",
    new_dialog_tab_direct: "Direct",
    new_dialog_tab_group: "Group",
    new_dialog_no_friends: "Make a friend first to start a chat.",
    group_name_label: "Group name",
    group_name_placeholder: "Enter a group name",
    group_select_members: "Select members",
    create_group_button: "Create group",
    err_group_name_required: "A group name is required.",
    err_group_members_required: "Select at least one member.",
    cancel_button: "Cancel",
    untitled_group: "Untitled group",
    group_member_count: "members",

    back_to_chats: "← Chat list",
    type_message_placeholder: "Type a message...",
    send_button: "Send",
    messages_loading: "Loading messages...",
    messages_empty: "No messages yet. Send the first one.",
    err_message_failed: "Failed to send the message.",
    err_load_messages_failed: "Couldn't load messages.",
    err_chat_not_found: "This conversation couldn't be found.",

    message_actions_label: "More options",
    reply_label: "Reply",
    copy_label: "Copy",
    copied_label: "Copied",
    edit_label: "Edit",
    delete_label: "Delete",
    save_label: "Save",
    react_label: "React",
    replying_to_label: "Replying to",
    deleted_message_placeholder: "This message was deleted.",
    message_edited_label: "(edited)",
    confirm_delete_message: "Delete this message?",
    err_edit_failed: "Couldn't edit the message.",
    err_delete_failed: "Couldn't delete the message.",

    attach_button: "Add attachment",
    emoji_button: "Emoji",
    gif_button: "GIF",
    gif_dialog_title: "Search GIFs",
    gif_search_placeholder: "Search GIFs...",
    gif_search_button: "Search",
    gif_loading: "Searching...",
    gif_type_to_search: "Type something to search for GIFs.",
    gif_no_results: "No GIFs found.",
    err_gif_network: "Couldn't load GIFs. Check your connection.",
    err_gif_rate_limited: "Too many attempts. Try again shortly.",
    err_file_too_large: "That file is too large. 8 MB maximum.",
    err_upload_failed: "Upload failed.",
    uploading_label: "Uploading...",
    attachment_generic_label: "File",
    download_label: "Download",

    is_typing_suffix: "is typing...",
    several_typing: "Several people are typing...",
    last_seen_prefix: "Last active",
    sending_label: "Sending...",
    sent_label: "✓ Sent",
    seen_label: "✓✓ Seen",
    loading_older_label: "Loading older messages...",

    group_settings_button: "Group settings",
    chat_options_button: "Options",
    group_settings_title: "Group settings",
    group_members_label: "Members",
    add_member_button: "Add member",
    remove_member_button: "Remove",
    leave_group_button: "Leave group",
    confirm_leave_group: "Leave this group?",
    confirm_remove_member: "Remove this member?",
    err_not_group_admin: "Only the group's creator can do that.",
    group_creator_badge: "Creator",
    no_more_friends_to_add: "No more friends left to add.",

    block_user_button: "Block user",
    report_user_button: "Report",
    confirm_block_user: "Block this user?",
    report_dialog_title: "Report",
    report_reason_label: "Reason",
    report_reason_placeholder: "Describe the issue...",
    submit_report_button: "Submit",
    report_submitted: "Report submitted.",
    err_report_failed: "Couldn't submit the report.",
    user_blocked_badge: "Blocked",

    profile_title: "Profile",
    profile_subtitle: "Your info and privacy settings",
    email_readonly_label: "Email",
    username_readonly_label: "Username",
    save_changes_button: "Save changes",
    profile_updated: "Profile updated.",
    privacy_settings_title: "Privacy",
    show_status_label: "Show online status",
    show_last_seen_label: "Show last-seen time",

    notifications_title: "Notifications",
    notifications_subtitle: "Your recent activity",
    notifications_empty: "No notifications.",
    mark_all_read_button: "Mark all read",
    mark_read_button: "Mark read",
    notification_default_title: "New notification",
    notification_default_body: "You have a new notification.",
    notif_friend_request_title: "New friend request",
    notif_friend_request_body: "Someone sent you a friend request.",
    notif_friend_accepted_title: "Request accepted",
    notif_friend_accepted_body: "Your friend request was accepted.",
    notif_group_added_title: "Added to a group",
    notif_group_added_body: "You were added to a group.",

    stories_title: "Stories",
    stories_subtitle: "Your friends' 24-hour updates",
    stories_empty: "No stories.",
    add_story_button: "+ New story",
    add_story_title: "Add new story",
    add_story_subtitle: "Upload an image or short video",
    story_file_label: "Select file",
    story_count: " stories",
    just_now: "Just now",
    err_story_upload_failed: "Story upload failed.",
    err_file_required: "Please select a file.",
    err_unsupported_file_type: "Only images or videos are allowed.",
    err_unsupported_file: "That file type is not allowed.",
    err_permission_denied: "You do not have permission for that action.",
    err_video_too_large: "Video cannot exceed 50 MB.",
    err_not_authorized: "You are not authorized to do that.",
    err_story_not_found: "Story not found.",
    story_created: "Story created.",
  }
};

// Language functions
export function getLanguage() {
  const stored = localStorage.getItem(LANG_STORAGE_KEY);
  return stored === "en" || stored === "bn" ? stored : DEFAULT_LANG;
}

export function setLanguage(lang) {
  const next = lang === "en" ? "en" : "bn";
  localStorage.setItem(LANG_STORAGE_KEY, next);
  document.documentElement.setAttribute("lang", next);
  languageListeners.forEach((cb) => {
    try {
      cb(next);
    } catch (err) {
      console.error("Language listener failed:", err);
    }
  });
}

export function t(key) {
  const lang = getLanguage();
  return translations[lang]?.[key] ?? translations.bn?.[key] ?? key;
}

const languageListeners = new Set();

export function onLanguageChange(callback) {
  languageListeners.add(callback);
  return () => languageListeners.delete(callback);
}

export function applyTranslations(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
  });
  root.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label")));
  });
}

// ============================================================================
// SHARED UTILITIES
// ============================================================================

export async function hashPassword(value) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function formatDate(timestamp) {
  if (!timestamp) return "";
  const lang = getLanguage();
  return new Date(timestamp).toLocaleString(lang === "bn" ? "bn-BD" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });
}

export function linkify(text, container) {
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  let lastIndex = 0;
  let match;
  while ((match = urlPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const link = document.createElement("a");
    link.href = match[0];
    link.textContent = match[0];
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    container.appendChild(link);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    container.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

// ============================================================================
// Vault session state
// ============================================================================

const VAULT_SESSION_KEY = "pv_vault_unlocked";

export function setVaultUnlocked() {
  sessionStorage.setItem(VAULT_SESSION_KEY, "1");
}

export function isVaultUnlocked() {
  return sessionStorage.getItem(VAULT_SESSION_KEY) === "1";
}

export function clearVaultUnlocked() {
  sessionStorage.removeItem(VAULT_SESSION_KEY);
}

export const EMOJI_PALETTE = [
  "😀", "😂", "😍", "😢", "😮", "😡", "👍", "👎",
  "❤️", "🔥", "🎉", "🙏", "😴", "🤔", "😅", "🥳",
];

// ============================================================================
// GIPHY CONFIGURATION
// ============================================================================
export const GIPHY_API_KEY = "GZx7gukFC0juWvLpjbHXuov7zq5R1AFt";
export const GIPHY_SEARCH_ENDPOINT = "https://api.giphy.com/v1/gifs/search";

// ============================================================================
// CLOUDINARY CONFIGURATION
// ============================================================================
export const CLOUDINARY_CLOUD_NAME = "aidyjvmr";
export const CLOUDINARY_UPLOAD_PRESET = "private_vault_upload";