import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { LogoMark } from "../components/LogoMark";
import { ThemeToggle } from "../components/ThemeToggle";
import { splashReady } from "../lib/splash";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="font-book text-xl">{title}</h2>
      <div className="mt-2 flex flex-col gap-2 text-neutral-700">{children}</div>
    </section>
  );
}

/**
 * Public privacy policy (SLM-8): Google needs a privacy-policy URL on the app's own domain to publish the OAuth
 * consent screen. Outside the shell and needs no session, like /signin.
 */
export function PrivacyPage() {
  useEffect(() => splashReady(), []);
  return (
    <main className="min-h-screen px-4 py-10" data-testid="privacy">
      <article className="mx-auto max-w-170">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark />
          <span className="font-book text-lg">Smart Library</span>
        </div>
        <h1 className="font-book text-[28px] leading-8">Privacy policy</h1>
        <p className="mt-2 text-neutral-600">
          Smart Library is a staff app for running a library. Only library staff sign in; members don't.
        </p>

        <Section title="What we collect when you sign in with Google">
          <p>
            We ask Google for the <code>openid</code>, <code>email</code> and <code>profile</code> scopes only. From
            them we keep your Google account ID, your email address and your name.
          </p>
        </Section>

        <Section title="Why">
          <p>
            To sign you in as a staff user and to look up your role (Admin, Librarian or Supervisor), which decides what
            you can do in the app. We don't use it for anything else.
          </p>
        </Section>

        <Section title="Where it is kept">
          <p>
            In the app's own PostgreSQL database. We don't share, sell or rent it to anyone, and we don't send it to
            advertisers.
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            One session cookie keeps you signed in, and a short-lived cookie protects the Google sign-in round trip.
            There are no tracking, analytics or advertising cookies. Your browser's local storage keeps two settings,
            which never leave your browser: your theme choice (Reading Room or plain) and, for Supervisors, that the
            read-only notice was dismissed.
          </p>
        </Section>

        <Section title="Demo data">
          <p>
            This is a demo deployment. Its library data (books, members and loans) is reset to the demo set every night.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            For questions, or to have your staff account and its data removed, write to the support email on the Google
            sign-in screen.
          </p>
        </Section>

        <p className="mt-10">
          <Link to="/signin" className="text-sm underline underline-offset-2" data-testid="privacy-back">
            Back to sign-in
          </Link>
        </p>
      </article>
      <ThemeToggle className="fixed top-3 right-3" />
    </main>
  );
}
