"use client";

import { useEffect } from "react";

/** Marks <html> when running as an installed / home-screen web app (incl. older iOS). */
export function WebAppFontBoost() {
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches ||
      // iOS Safari "Add to Home Screen"
      Boolean(
        (navigator as Navigator & { standalone?: boolean }).standalone,
      );

    document.documentElement.classList.toggle("web-app", standalone);
  }, []);

  return null;
}
