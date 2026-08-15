import { useEffect, useState } from "react";

export function useNetworkStatus() {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const sync = () => setOnline(window.navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);

    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return { online, isOffline: !online };
}
