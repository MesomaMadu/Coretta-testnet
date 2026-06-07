export type Locale = "en" | "es" | "fr" | "hi" | "zh" | "ja";

export const LOCALES: { code: Locale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "hi", label: "हिन्दी" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
];

export type TranslationKey =
  | "welcome"
  | "askName"
  | "niceToMeet"
  | "personalize"
  | "welcomeBack"
  | "readyTransfer"
  | "askDamian"
  | "settings"
  | "profile"
  | "preferredName"
  | "language"
  | "linkEmail"
  | "disconnectWallet"
  | "disconnectEmail"
  | "connectedWallets"
  | "identity";

const T: Record<Locale, Record<TranslationKey, string>> = {
  en: {
    welcome: "Welcome to Coretta 👋",
    askName: "What would you like me to call you?",
    niceToMeet: "Nice to meet you, {name}.",
    personalize: "I'll personalize your Coretta experience for you.",
    welcomeBack: "Welcome back, {name} 👋",
    readyTransfer: "Ready to send another transfer today?",
    askDamian: "Ask Damian…",
    settings: "Settings",
    profile: "Profile",
    preferredName: "Preferred name",
    language: "Language",
    linkEmail: "Link email address",
    disconnectWallet: "Disconnect wallet",
    disconnectEmail: "Unlink email",
    connectedWallets: "Connected wallets",
    identity: "Identity",
  },
  es: {
    welcome: "Bienvenido a Coretta 👋",
    askName: "¿Cómo te gustaría que te llamara?",
    niceToMeet: "Encantado de conocerte, {name}.",
    personalize: "Personalizaré tu experiencia en Coretta.",
    welcomeBack: "Bienvenido de nuevo, {name} 👋",
    readyTransfer: "¿Listo para enviar otra transferencia hoy?",
    askDamian: "Pregunta a Damian…",
    settings: "Ajustes",
    profile: "Perfil",
    preferredName: "Nombre preferido",
    language: "Idioma",
    linkEmail: "Vincular correo",
    disconnectWallet: "Desconectar billetera",
    disconnectEmail: "Desvincular correo",
    connectedWallets: "Billeteras conectadas",
    identity: "Identidad",
  },
  fr: {
    welcome: "Bienvenue sur Coretta 👋",
    askName: "Comment aimeriez-vous que je vous appelle ?",
    niceToMeet: "Enchanté, {name}.",
    personalize: "Je personnaliserai votre expérience Coretta.",
    welcomeBack: "Bon retour, {name} 👋",
    readyTransfer: "Prêt pour un autre transfert aujourd'hui ?",
    askDamian: "Demandez à Damian…",
    settings: "Paramètres",
    profile: "Profil",
    preferredName: "Nom préféré",
    language: "Langue",
    linkEmail: "Lier l'e-mail",
    disconnectWallet: "Déconnecter le portefeuille",
    disconnectEmail: "Dissocier l'e-mail",
    connectedWallets: "Portefeuilles connectés",
    identity: "Identité",
  },
  hi: {
    welcome: "Coretta में आपका स्वागत है 👋",
    askName: "मैं आपको क्या नाम से बुलाऊँ?",
    niceToMeet: "आपसे मिलकर अच्छा लगा, {name}।",
    personalize: "मैं आपके Coretta अनुभव को व्यक्तिगत बनाऊँगा।",
    welcomeBack: "वापसी पर स्वागत है, {name} 👋",
    readyTransfer: "आज एक और ट्रांसफर भेजने के लिए तैयार?",
    askDamian: "Damian से पूछें…",
    settings: "सेटिंग्स",
    profile: "प्रोफ़ाइल",
    preferredName: "पसंदीदा नाम",
    language: "भाषा",
    linkEmail: "ईमेल जोड़ें",
    disconnectWallet: "वॉलेट डिस्कनेक्ट करें",
    disconnectEmail: "ईमेल हटाएँ",
    connectedWallets: "कनेक्टेड वॉलेट",
    identity: "पहचान",
  },
  zh: {
    welcome: "欢迎使用 Coretta 👋",
    askName: "您希望我如何称呼您？",
    niceToMeet: "很高兴认识您，{name}。",
    personalize: "我将为您个性化 Coretta 体验。",
    welcomeBack: "欢迎回来，{name} 👋",
    readyTransfer: "今天再发一笔汇款吗？",
    askDamian: "询问 Damian…",
    settings: "设置",
    profile: "个人资料",
    preferredName: "首选名称",
    language: "语言",
    linkEmail: "绑定邮箱",
    disconnectWallet: "断开钱包",
    disconnectEmail: "解绑邮箱",
    connectedWallets: "已连接钱包",
    identity: "身份",
  },
  ja: {
    welcome: "Coretta へようこそ 👋",
    askName: "どのようにお呼びすればよろしいですか？",
    niceToMeet: "はじめまして、{name} さん。",
    personalize: "Coretta の体験をあなた用にカスタマイズします。",
    welcomeBack: "おかえりなさい、{name} さん 👋",
    readyTransfer: "本日もう一度送金しますか？",
    askDamian: "Damian に聞く…",
    settings: "設定",
    profile: "プロフィール",
    preferredName: "呼び名",
    language: "言語",
    linkEmail: "メールをリンク",
    disconnectWallet: "ウォレットを切断",
    disconnectEmail: "メールのリンク解除",
    connectedWallets: "接続中のウォレット",
    identity: "アイデンティティ",
  },
};

export function t(
  locale: Locale,
  key: TranslationKey,
  vars?: Record<string, string>,
): string {
  let s = T[locale][key] ?? T.en[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(`{${k}}`, v);
    }
  }
  return s;
}
