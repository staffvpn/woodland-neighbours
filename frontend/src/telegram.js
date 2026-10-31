export function getTelegramWebApp() {
    return window.Telegram?.WebApp ?? null;
}
export function getInitData() {
    return getTelegramWebApp()?.initData ?? "";
}
