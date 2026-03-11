import { SignIn } from "@clerk/clerk-react";

export function LoginRoute() {
  return (
    <main className="login-shell">
      <div className="login-layout">
        <section className="panel panel-primary login-copy">
          <div>
            <p className="eyebrow">desktop sign-in</p>
            <h1>Use the same Loam identity you already trust</h1>
          </div>
          <p className="lede">
            The desktop renderer reuses Clerk directly in the Tauri webview and
            hands the resulting session to Convex. That keeps auth defaults
            aligned with the web app and avoids a second session model.
          </p>
          <div className="login-points">
            <div className="login-point">
              <strong>Same account</strong>
              <p>Desktop and web share the Clerk session contract.</p>
            </div>
            <div className="login-point">
              <strong>Same authorization</strong>
              <p>Convex uses the Clerk token, so team and project access stay canonical.</p>
            </div>
            <div className="login-point">
              <strong>No native fallback by default</strong>
              <p>A desktop-specific auth layer stays unnecessary until the webview proves otherwise.</p>
            </div>
          </div>
        </section>

        <section className="panel panel-primary login-card">
          <SignIn routing="virtual" fallbackRedirectUrl="/" />
          <p className="login-note">
            Once sign-in completes, the recorder shell immediately runs an
            authenticated Convex query.
          </p>
        </section>
      </div>
    </main>
  );
}
