import { ImageResponse } from "next/og";

export const ogSize = {
  width: 1200,
  height: 630,
};

export function generateOgImage(title: string, subtitle?: string) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: "60px",
        background: "linear-gradient(135deg, #0a0a0f 0%, #0f1a1a 50%, #0a0a0f 100%)",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "4px",
          background: "linear-gradient(90deg, #0f766e, #2dd4bf, #0f766e)",
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div
          style={{
            fontSize: "64px",
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: "28px",
              color: "#94a3b8",
              maxWidth: "800px",
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>,
    ogSize,
  );
}
