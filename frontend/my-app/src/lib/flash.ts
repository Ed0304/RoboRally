export type FlashMessageData = {
  type: "success" | "error";
  message: string;
};

const FLASH_KEY = "roborally_flash";
export const FLASH_EVENT = "roborally:flash";

export function setFlashMessage(flash: FlashMessageData) {
  if (typeof window === "undefined") return;

  sessionStorage.setItem(FLASH_KEY, JSON.stringify(flash));
  window.dispatchEvent(new Event(FLASH_EVENT));
}

export function consumeFlashMessage(): FlashMessageData | null {
  if (typeof window === "undefined") return null;

  const stored = sessionStorage.getItem(FLASH_KEY);
  if (!stored) return null;

  sessionStorage.removeItem(FLASH_KEY);

  try {
    const parsed = JSON.parse(stored);

    if (
      parsed &&
      (parsed.type === "success" || parsed.type === "error") &&
      typeof parsed.message === "string"
    ) {
      return parsed as FlashMessageData;
    }

    return null;
  } catch {
    return null;
  }
}
