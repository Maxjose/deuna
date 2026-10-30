"use client";
import { useEffect, useState } from "react";

export function LaunchScreen({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<"opening" | "leaving" | "ready">(
    "opening",
  );
  useEffect(() => {
    const fade = window.setTimeout(() => setPhase("leaving"), 1750);
    const finish = window.setTimeout(() => setPhase("ready"), 2050);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(finish);
    };
  }, []);
  const visible = phase !== "ready";
  return (
    <>
      {visible && (
        <div
          className={
            "launch-screen " + (phase === "leaving" ? "launch-leaving" : "")
          }
          role="status"
          aria-label="Abriendo De1na"
        >
          <div className="launch-glow" />
          <div className="launch-center">
            <div className="launch-icon">
              <img
                src="/icons/icon-512.png"
                width="116"
                height="116"
                alt=""
                fetchPriority="high"
              />
            </div>
            <div className="launch-wordmark">
              De<span>1</span>na
            </div>
            <p>¿Vamos? ¡De una!</p>
          </div>
          <span className="launch-progress" aria-hidden="true" />
        </div>
      )}
      <div
        className={visible ? "app-content is-opening" : "app-content"}
        inert={visible}
        aria-hidden={visible || undefined}
      >
        {children}
      </div>
    </>
  );
}
