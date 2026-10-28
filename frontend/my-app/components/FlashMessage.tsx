"use client";

import { useEffect, useState } from "react";
import {
  consumeFlashMessage,
  FLASH_EVENT,
  type FlashMessageData as Flash,} from "@/lib/flash";
export default function FlashMessage() {
  const [flash, setFlash] = useState<Flash | null>(null);

  
useEffect(() => {
    let timer: number | undefined;

    function showMessage() {
        if (timer !== undefined) {
        window.clearTimeout(timer);
        }

        const nextFlash = consumeFlashMessage();
        setFlash(nextFlash);

        if (nextFlash) {
        timer = window.setTimeout(() => {
            setFlash(null);
        }, 4000);
        }
    }

    showMessage();
    window.addEventListener(FLASH_EVENT, showMessage);

    return () => {
        window.removeEventListener(FLASH_EVENT, showMessage);

        if (timer !== undefined) {
        window.clearTimeout(timer);
        }
    };
    }, []);


  if (!flash) return null;

  const isSuccess = flash.type === "success";

  return (
    <div
      role={isSuccess ? "status" : "alert"}
      className={`fixed right-5 top-20 z-50 flex items-center gap-3 rounded-lg border p-4 shadow-lg ${
        isSuccess
          ? "border-green-500 bg-green-50 text-green-900"
          : "border-red-500 bg-red-50 text-red-900"
      }`}
    >
      <span>{flash.message}</span>

      <button
        type="button"
        onClick={() => setFlash(null)}
        aria-label="Dismiss notification"
        className="font-bold"
      >
        ×
      </button>
    </div>
  );
}