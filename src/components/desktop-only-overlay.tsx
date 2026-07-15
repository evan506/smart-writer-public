/**
 * Desktop-only overlay — shown on screens narrower than 768px.
 * Uses a CSS media query and skips planning, which has its own narrow layout.
 * Place inside app layouts (dashboard, write).
 * Landing page is excluded by not including this in the root layout.
 */
"use client";

import { usePathname } from "next/navigation";

export function DesktopOnlyOverlay() {
  const pathname = usePathname();

  if (/^\/projects\/[^/]+\/planning$/.test(pathname)) {
    return null;
  }

  return (
    <>
      <style>{`
        .desktop-only-overlay {
          display: none;
        }
        @media (max-width: 767px) {
          .desktop-only-overlay {
            display: flex;
            position: fixed;
            inset: 0;
            z-index: 9999;
            background: #060a12;
            align-items: center;
            justify-content: center;
            padding: 24px;
          }
        }
      `}</style>
      <div className="desktop-only-overlay">
        <div
          style={{
            background: "rgba(12,20,37,0.85)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "20px",
            padding: "40px 32px",
            maxWidth: "360px",
            width: "100%",
            textAlign: "center",
            fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif",
          }}
        >
          <div style={{ fontSize: "40px", marginBottom: "20px" }}>🖥️</div>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 800,
              color: "#f0f4f8",
              letterSpacing: "-0.02em",
              marginBottom: "16px",
            }}
          >
            데스크톱 환경을 권장합니다
          </h2>
          <p
            style={{
              fontSize: "14px",
              lineHeight: 1.7,
              color: "#94a3b8",
            }}
          >
            Smart Writer는 집필에 최적화된 도구로,
            <br />
            넓은 화면에서 에디터와 작품 기억을 함께 사용할 때
            <br />
            최고의 경험을 제공합니다.
            <br />
            <br />
            <strong style={{ color: "#f0f4f8" }}>PC 또는 노트북에서 접속해주세요.</strong>
          </p>
        </div>
      </div>
    </>
  );
}
