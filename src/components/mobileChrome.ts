import { useEffect, useState } from "react";

/** Mobile / iPad chrome: narrow viewport or coarse pointer (touch). */
export const MOBILE_CHROME_QUERY = "(max-width: 720px), (pointer: coarse)";

export function useMobileChrome(): boolean {
  const [mobile, setMobile] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(MOBILE_CHROME_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(MOBILE_CHROME_QUERY);
    const sync = () => setMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return mobile;
}
