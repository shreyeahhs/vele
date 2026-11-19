"use client";

/** Last resort when the root layout itself fails: no app styles are guaranteed here. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-GB">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#fbfcfd", color: "#1c2433", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 8px" }}>Vele couldn’t load.</h1>
          <p style={{ color: "#5b626b" }}>Nothing in your calendar was changed.</p>
          <button
            onClick={reset}
            style={{ marginTop: 12, padding: "8px 14px", borderRadius: 2, border: 0, background: "#1c2433", color: "#fbfcfd", fontWeight: 700, cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
