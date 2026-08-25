import type { Language } from '@/constants/india';

/**
 * The translation catalogue.
 *
 * English is the source of truth: its keys define `TranslationKey`, so every
 * other language is a `Record<TranslationKey, string>` and a missing Hindi
 * string is a compile error rather than an English word leaking into a Hindi
 * screen.
 *
 * Keys are flat and namespaced by screen (`portal.review.approve`). Components
 * never hold a literal user-facing string for a translated surface - they call
 * `t('...')` - so adding a language later is a change to this file only.
 *
 * Module 7 translates the customer-facing surface. The staff application is
 * English-only for now; the layer is deliberately general so the rest of the
 * software can be moved onto it without redesign.
 */
export const EN = {
  'language.name.en': 'English',
  'language.name.hi': 'Hindi',
  'language.switch': 'Language',

  'portal.brand': 'Devasriya Print',
  'portal.signIn.title': 'Design review',
  'portal.signIn.subtitle': 'Sign in to see your designs and approve them.',
  'portal.signIn.email': 'Email address',
  'portal.signIn.password': 'Password',
  'portal.signIn.submit': 'Sign in',
  'portal.signIn.working': 'Signing in...',
  'portal.signIn.forgot': 'Forgot your password?',
  'portal.signIn.forgotSent': 'If that email has an account, a reset link is on its way.',
  'portal.signIn.staffHint': 'Staff sign-in is on a different page.',
  'portal.signOut': 'Sign out',

  'portal.home.title': 'Your designs',
  'portal.home.subtitle': 'Designs we have sent you for approval.',
  'portal.home.empty': 'Nothing is waiting for you right now.',
  'portal.home.awaiting': 'Waiting for your reply',
  'portal.home.done': 'Already answered',
  'portal.home.open': 'Open',
  'portal.home.job': 'Order',
  'portal.home.version': 'Version {{n}}',

  'portal.review.title': 'Design approval',
  'portal.review.job': 'Order',
  'portal.review.currentVersion': 'Version {{n}}, sent for your approval',
  'portal.review.viewingVersion': 'Version {{n}}',
  'portal.review.requirement': 'What you asked for',
  'portal.review.requirementAudio': 'Your voice message',
  'portal.review.designerNote': 'Note from our designer',
  'portal.review.history': 'Earlier versions',
  'portal.review.noHistory': 'This is the first version.',
  'portal.review.openFile': 'Open the file',
  'portal.review.previewUnavailable': 'Preview is not available. Open the file instead.',
  'portal.review.pickup': 'Collection office',
  'portal.review.contact': 'Contact person',

  'portal.decision.heading': 'What would you like to do?',
  'portal.decision.approve': 'Approve',
  'portal.decision.requestChanges': 'Ask for changes',
  'portal.decision.reject': 'Reject',
  'portal.decision.comment': 'Your comment',
  'portal.decision.commentHintApprove':
    'You can approve and still tell us what to change, for example "approved, please make the font bigger".',
  'portal.decision.commentHintChanges': 'Tell us what to change.',
  'portal.decision.commentHintReject': 'Tell us why, so we can start again.',
  'portal.decision.commentRequired': 'Please write a short comment.',
  'portal.decision.confirmApprove': 'Send approval',
  'portal.decision.confirmChanges': 'Send change request',
  'portal.decision.confirmReject': 'Send rejection',
  'portal.decision.cancel': 'Cancel',
  'portal.decision.sending': 'Sending...',
  'portal.decision.sent': 'Thank you, we have your reply.',
  'portal.decision.failed': 'That could not be sent. Please try again.',

  'portal.decided.approved': 'You approved this version',
  'portal.decided.rejected': 'You rejected this version',
  'portal.decided.changesRequested': 'You asked for changes to this version',
  'portal.decided.on': 'on {{date}}',
  'portal.decided.yourComment': 'Your comment',
  'portal.decided.byStaff': 'Recorded by our team on your behalf',
  'portal.decided.waitingNewVersion': 'Our designer is working on a new version.',

  'portal.status.draft': 'Being prepared',
  'portal.status.submitted-for-review': 'Waiting for your approval',
  'portal.status.approved': 'Approved',
  'portal.status.rejected': 'Rejected',
  'portal.status.changes-requested': 'Changes requested',
  'portal.status.superseded': 'Replaced by a newer version',

  'portal.error.notFound': 'This design is not available.',
  'portal.error.loading': 'We could not load this. Please try again.',
  'portal.error.signIn': 'Those details did not work. Please check and try again.',
} as const;

export type TranslationKey = keyof typeof EN;

export const HI: Record<TranslationKey, string> = {
  'language.name.en': 'अंग्रेज़ी',
  'language.name.hi': 'हिंदी',
  'language.switch': 'भाषा',

  'portal.brand': 'देवश्रिया प्रिंट',
  'portal.signIn.title': 'डिज़ाइन स्वीकृति',
  'portal.signIn.subtitle': 'अपने डिज़ाइन देखने और स्वीकृति देने के लिए साइन इन करें।',
  'portal.signIn.email': 'ईमेल पता',
  'portal.signIn.password': 'पासवर्ड',
  'portal.signIn.submit': 'साइन इन करें',
  'portal.signIn.working': 'साइन इन हो रहा है...',
  'portal.signIn.forgot': 'पासवर्ड भूल गए?',
  'portal.signIn.forgotSent': 'यदि उस ईमेल पर खाता है, तो रीसेट लिंक भेज दिया गया है।',
  'portal.signIn.staffHint': 'स्टाफ़ का साइन इन दूसरे पेज पर है।',
  'portal.signOut': 'साइन आउट',

  'portal.home.title': 'आपके डिज़ाइन',
  'portal.home.subtitle': 'जो डिज़ाइन हमने आपकी स्वीकृति के लिए भेजे हैं।',
  'portal.home.empty': 'अभी आपके लिए कुछ बाकी नहीं है।',
  'portal.home.awaiting': 'आपके उत्तर की प्रतीक्षा',
  'portal.home.done': 'उत्तर दिया जा चुका है',
  'portal.home.open': 'खोलें',
  'portal.home.job': 'ऑर्डर',
  'portal.home.version': 'संस्करण {{n}}',

  'portal.review.title': 'डिज़ाइन स्वीकृति',
  'portal.review.job': 'ऑर्डर',
  'portal.review.currentVersion': 'संस्करण {{n}}, आपकी स्वीकृति के लिए भेजा गया',
  'portal.review.viewingVersion': 'संस्करण {{n}}',
  'portal.review.requirement': 'आपने क्या माँगा था',
  'portal.review.requirementAudio': 'आपका वॉइस संदेश',
  'portal.review.designerNote': 'हमारे डिज़ाइनर का संदेश',
  'portal.review.history': 'पिछले संस्करण',
  'portal.review.noHistory': 'यह पहला संस्करण है।',
  'portal.review.openFile': 'फ़ाइल खोलें',
  'portal.review.previewUnavailable': 'पूर्वावलोकन उपलब्ध नहीं है। कृपया फ़ाइल खोलें।',
  'portal.review.pickup': 'संग्रह कार्यालय',
  'portal.review.contact': 'संपर्क व्यक्ति',

  'portal.decision.heading': 'आप क्या करना चाहेंगे?',
  'portal.decision.approve': 'स्वीकृत करें',
  'portal.decision.requestChanges': 'बदलाव माँगें',
  'portal.decision.reject': 'अस्वीकार करें',
  'portal.decision.comment': 'आपकी टिप्पणी',
  'portal.decision.commentHintApprove':
    'आप स्वीकृति देकर भी बदलाव बता सकते हैं, जैसे "स्वीकृत है, कृपया अक्षर बड़े कर दें"।',
  'portal.decision.commentHintChanges': 'हमें बताइए क्या बदलना है।',
  'portal.decision.commentHintReject': 'कारण बताइए, ताकि हम नए सिरे से बना सकें।',
  'portal.decision.commentRequired': 'कृपया एक छोटी टिप्पणी लिखें।',
  'portal.decision.confirmApprove': 'स्वीकृति भेजें',
  'portal.decision.confirmChanges': 'बदलाव का अनुरोध भेजें',
  'portal.decision.confirmReject': 'अस्वीकृति भेजें',
  'portal.decision.cancel': 'रद्द करें',
  'portal.decision.sending': 'भेजा जा रहा है...',
  'portal.decision.sent': 'धन्यवाद, आपका उत्तर मिल गया है।',
  'portal.decision.failed': 'यह भेजा नहीं जा सका। कृपया फिर कोशिश करें।',

  'portal.decided.approved': 'आपने इस संस्करण को स्वीकृत किया',
  'portal.decided.rejected': 'आपने इस संस्करण को अस्वीकार किया',
  'portal.decided.changesRequested': 'आपने इस संस्करण में बदलाव माँगे',
  'portal.decided.on': '{{date}} को',
  'portal.decided.yourComment': 'आपकी टिप्पणी',
  'portal.decided.byStaff': 'हमारी टीम ने आपकी ओर से दर्ज किया',
  'portal.decided.waitingNewVersion': 'हमारे डिज़ाइनर नया संस्करण बना रहे हैं।',

  'portal.status.draft': 'तैयार किया जा रहा है',
  'portal.status.submitted-for-review': 'आपकी स्वीकृति की प्रतीक्षा',
  'portal.status.approved': 'स्वीकृत',
  'portal.status.rejected': 'अस्वीकृत',
  'portal.status.changes-requested': 'बदलाव माँगे गए',
  'portal.status.superseded': 'नए संस्करण से बदला गया',

  'portal.error.notFound': 'यह डिज़ाइन उपलब्ध नहीं है।',
  'portal.error.loading': 'हम इसे लोड नहीं कर सके। कृपया फिर कोशिश करें।',
  'portal.error.signIn': 'ये विवरण काम नहीं आए। कृपया जाँच कर फिर कोशिश करें।',
};

/**
 * Each language written in itself.
 *
 * A switcher labelled in the language you cannot read is no use, so these are
 * never translated: Hindi always reads "हिंदी" and English always "English",
 * whichever way the screen is currently set.
 */
export const LANGUAGE_ENDONYMS: Record<Language, string> = {
  hi: 'हिंदी',
  en: 'English',
};

export const TRANSLATIONS: Record<Language, Record<TranslationKey, string>> = {
  en: EN,
  hi: HI,
};

/** Replaces `{{name}}` placeholders. Missing values are left as written. */
export function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export function translate(
  language: Language,
  key: TranslationKey,
  values?: Record<string, string | number>,
): string {
  return interpolate(TRANSLATIONS[language][key], values);
}
