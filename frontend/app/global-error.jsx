'use client'

// The last safety net: if even the page frame breaks, this replaces the whole
// page. It brings its own html and body (and its own styling, since the app's
// stylesheet is not loaded here) and follows the device's light or dark setting.
export default function GlobalError({ retry }) {
  return (
    <html lang="en">
      <body>
        <style>{`
          body { margin: 0; font-family: system-ui, sans-serif; background: #f7f8fa; color: #101828; }
          .box { max-width: 26rem; margin: 6rem auto; padding: 2rem; text-align: center; background: #fff; border-radius: 1rem; box-shadow: 0 1px 3px rgba(16,24,40,.1); }
          h1 { font-size: 1.125rem; margin: 0 0 .5rem; }
          p { font-size: .875rem; color: #667085; margin: 0 0 1.25rem; }
          button { background: #059669; color: #fff; border: 0; border-radius: .5rem; padding: .5rem 1rem; font-size: .875rem; font-weight: 500; cursor: pointer; }
          @media (prefers-color-scheme: dark) {
            body { background: #090c12; color: #eef0f4; }
            .box { background: #171d28; box-shadow: none; }
            p { color: #98a2b3; }
          }
        `}</style>
        <div className="box">
          <h1>Something went wrong</h1>
          <p>The app could not be shown. Your data is safe. Please try again.</p>
          <button onClick={() => retry()}>Try again</button>
        </div>
      </body>
    </html>
  )
}
