import type { Me } from "@slm/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link, useRouter } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button, EyeIcon, EyeOffIcon, GoogleMark, InlineAlert, Input } from "../../components/ui";
import { LogoMark } from "../../components/LogoMark";
import { ThemeToggle } from "../../components/ThemeToggle";
import { ApiError, api } from "../../lib/apiClient";
import { useAuthProviders } from "./providers";
import { meQueryKey, safeNext, useMe } from "./session";

const route = getRouteApi("/signin");

const GOOGLE_NOTICES: Record<string, string> = {
  google: "Google sign-in didn't complete. Try again.",
  google_unverified: "Your Google email isn't verified. Verify it with Google, then try again.",
  disabled: "Your staff account is disabled.",
  google_busy: "Too many sign-in attempts. Wait a minute, then try again.",
};

const formatCountdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Decorative shelf on the sign-in plate: [width, height, colour] of each spine (Reading Room). */
const SHELF: Array<[number, number, string]> = [
  [26, 150, "#2f5a4c"],
  [34, 182, "#8b6a2c"],
  [22, 140, "#6a3b4f"],
  [30, 196, "#3a4668"],
  [24, 160, "#7c3f2f"],
  [38, 174, "#4c5a63"],
  [20, 130, "#2f5a4c"],
  [28, 188, "#a07a3a"],
  [34, 150, "#5a3542"],
  [24, 170, "#2c3a58"],
  [30, 200, "#6d4a22"],
  [22, 144, "#3f5d50"],
  [36, 178, "#7c3f2f"],
  [26, 160, "#4c5a63"],
];

/** Left half at ≥ 1024 px in Reading Room: the library plate with a quote and a shelf. Hidden in plain. */
function SignInPlate() {
  return (
    <section
      className="relative hidden min-h-screen flex-col overflow-hidden bg-spine px-16 pt-14 text-spine-ink lg:flex plain:hidden"
      data-testid="signin-plate"
    >
      <div className="flex items-center gap-3" aria-hidden="true">
        <LogoMark large />
        <span className="font-book text-[22px] text-[#f6efe0]">
          Smart <i className="text-brass-200">Library</i>
        </span>
      </div>
      <blockquote className="mt-12 max-w-115 font-book text-[30px] leading-10 font-normal text-[#f6efe0] book-italic">
        “Every book its reader. Every reader their book.”
        <cite className="mt-3.5 block font-sans eyebrow not-italic text-brass-200">
          After S. R. Ranganathan · Five laws of library science
        </cite>
      </blockquote>
      <div className="mt-auto flex h-52.5 items-end gap-0.75" aria-hidden="true">
        {SHELF.map(([w, h, c], i) => (
          <span
            key={i}
            className="relative block rounded-t-[1px] shadow-[inset_2px_0_0_rgb(0_0_0/.2)]"
            style={{ width: w, height: h, background: c }}
          >
            <span className="absolute top-3.5 right-0.75 left-0.75 h-px bg-[rgb(240_220_170/.5)] shadow-[0_3px_0_rgb(240_220_170/.3)]" />
          </span>
        ))}
      </div>
      <div className="-mx-16 h-1.5 bg-[#0f241c]" aria-hidden="true" />
    </section>
  );
}

/**
 * ux.md §1.1. Google is the primary path; the demo form is secondary under a divider.
 * Reading Room: plate on the left (≥ 1024 px) and the form on an index card; plain: the centred card.
 */
export function SignInPage() {
  const search = route.useSearch();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  // Which sign-in methods the server has configured; the Google button only shows when it works.
  const providers = useAuthProviders();
  const googleOn = providers.data?.google === true;
  const demoOn = providers.data?.demo !== false;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [notice, setNotice] = useState<{ text: string; countdown?: boolean } | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [demoOff, setDemoOff] = useState(false);
  const [wait, setWait] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);

  const target = safeNext(search.next) ?? "/dashboard";

  // Already signed in → straight to the app.
  useEffect(() => {
    if (me.data) router.history.replace(target);
  }, [me.data, router, target]);

  // Without Google, the demo form is the main path, so focus starts on Email (ux.md §1.1 focus rule).
  useEffect(() => {
    if (providers.isSuccess && !googleOn) emailRef.current?.focus();
  }, [providers.isSuccess, googleOn]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const login = useMutation({
    mutationFn: (body: { email: string; password: string }) => api<Me>("/auth/demo-login", { method: "POST", body }),
    onSuccess: (user) => {
      queryClient.setQueryData(meQueryKey, user);
      router.history.push(target);
    },
    onError: (err) => {
      setPassword("");
      if (err instanceof ApiError && err.status === 401) {
        setNotice({ text: "Email or password is incorrect." });
      } else if (err instanceof ApiError && err.status === 429) {
        setNotice({ text: "Too many sign-in attempts. Wait a minute and try again.", countdown: true });
        setWait(err.retryAfter ?? 60);
      } else if (err instanceof ApiError && err.code === "USER_DISABLED") {
        setNotice({ text: "This account is disabled. Ask a library Admin to reactivate it." });
      } else if (err instanceof ApiError && err.status === 404) {
        setDemoOff(true);
        setNotice(null);
      } else {
        setNotice({ text: "Couldn't sign in. Check your connection and try again." });
      }
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (wait > 0 || login.isPending || googleBusy) return;
    const errs = {
      email: email.trim() ? undefined : "Enter your email.",
      password: password ? undefined : "Enter your password.",
    };
    setFieldErrors(errs);
    if (errs.email) return emailRef.current?.focus();
    if (errs.password) return (document.getElementById("signin-password") as HTMLInputElement | null)?.focus();
    setNotice(null);
    login.mutate({ email: email.trim().toLowerCase(), password });
  };

  const googleNotice = search.error ? (GOOGLE_NOTICES[search.error] ?? GOOGLE_NOTICES.google) : undefined;

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-2 plain:block">
      <SignInPlate />
      <div className="flex min-h-screen flex-col items-center px-4 py-10 lg:justify-center plain:justify-start">
        {/* "Smart Library" stays the page h1; at ≥ 1024 px in Reading Room the plate shows it, so this block is visually hidden. */}
        <div className="mb-8 flex flex-col items-center text-center lg:sr-only plain:not-sr-only plain:mb-8">
          <div className="mb-4 flex">
            <LogoMark large />
          </div>
          <h1 className="font-book text-[28px] leading-8 plain:text-xl">Smart Library</h1>
          <p className="mt-1 hidden text-base text-neutral-600 plain:block">Staff sign-in</p>
        </div>

        <div className="w-full max-w-100">
          {search.expired && (
            <InlineAlert variant="info" className="mb-3" testId="signin-expired">
              Your session ended. Sign in again to continue.
            </InlineAlert>
          )}
          {googleNotice && (
            <InlineAlert variant="danger" className="mb-3" testId="signin-google-error">
              {googleNotice}
            </InlineAlert>
          )}

          <div
            className="relative rounded-sm border border-border bg-surface shadow-pop plain:rounded-xl plain:shadow-card"
            data-testid="signin-card"
          >
            {/* Index card head: call number, title, caption, the red top line of a catalogue card. */}
            <div className="border-b-2 border-[#c98a8a] px-7 pt-5.5 pb-3.5 plain:hidden">
              <div
                className="flex justify-between font-mono text-xs tracking-[.04em] text-neutral-500"
                aria-hidden="true"
              >
                <span>STAFF</span>
                <span>025.1 · SL</span>
              </div>
              <h2 className="mt-2.5 mb-0.5 font-book text-[28px] leading-8">Staff sign-in</h2>
              <p className="text-neutral-600">Library staff only. Members don't sign in.</p>
            </div>
            <div className="px-7 pt-5.5 pb-10 plain:p-7">
              {googleOn && (
                <Button
                  size="lg"
                  block
                  autoFocus
                  loading={googleBusy}
                  disabled={login.isPending}
                  data-testid="google-signin"
                  icon={<GoogleMark />}
                  onClick={() => {
                    setGoogleBusy(true);
                    window.location.assign(`/api/auth/google/start?next=${encodeURIComponent(target)}`);
                  }}
                >
                  Sign in with Google
                </Button>
              )}
              <p
                className={
                  googleOn
                    ? "mt-3 hidden text-center text-sm text-neutral-600 plain:block"
                    : "hidden text-center text-sm text-neutral-600 plain:block"
                }
              >
                Library staff only. Members don't sign in.
              </p>

              {demoOff || !demoOn ? (
                <InlineAlert variant="info" className="mt-6" testId="demo-off">
                  {googleOn
                    ? "Demo accounts are turned off. Sign in with Google."
                    : "Sign-in is not available right now."}
                </InlineAlert>
              ) : (
                <>
                  {googleOn ? (
                    <div
                      className="my-6 flex items-center gap-3 text-sm text-neutral-600"
                      role="separator"
                      data-testid="signin-divider"
                    >
                      <span className="h-px flex-1 bg-border" />
                      or use a demo account
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  ) : (
                    <div className="hidden h-6 plain:block" aria-hidden />
                  )}

                  {notice && (
                    <InlineAlert variant="danger" className="mb-4" testId="signin-error">
                      <span>
                        {notice.text}
                        {notice.countdown && wait > 0 && (
                          <span className="ml-1 tabular-nums">({formatCountdown(wait)})</span>
                        )}
                      </span>
                    </InlineAlert>
                  )}

                  <form onSubmit={submit} noValidate className="flex flex-col gap-4">
                    <Input
                      ref={emailRef}
                      label="Email"
                      type="email"
                      name="email"
                      autoComplete="username"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      error={fieldErrors.email}
                      data-testid="signin-email"
                    />
                    <Input
                      id="signin-password"
                      label="Password"
                      type={showPassword ? "text" : "password"}
                      name="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      error={fieldErrors.password}
                      data-testid="signin-password"
                      trailing={
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-pressed={showPassword}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          onClick={() => setShowPassword((v) => !v)}
                          icon={showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                        >
                          {showPassword ? "Hide" : "Show"}
                        </Button>
                      }
                    />
                    <Button
                      type="submit"
                      block
                      loading={login.isPending}
                      disabled={wait > 0 || googleBusy}
                      data-testid="signin-submit"
                    >
                      Sign in
                    </Button>
                  </form>
                  <p className="mt-4 text-center text-sm text-neutral-600">
                    Demo credentials are in the submission email.
                  </p>
                </>
              )}
            </div>
            {/* The punched hole of a catalogue card. */}
            <span
              className="absolute bottom-3 left-1/2 -ml-1.75 h-3.5 w-3.5 rounded-full bg-canvas shadow-[inset_0_1px_2px_rgb(0_0_0/.18)] plain:hidden"
              aria-hidden="true"
            />
          </div>
          <footer className="mt-6 text-center text-sm text-neutral-600">
            <Link to="/privacy" className="underline underline-offset-2" data-testid="signin-privacy">
              Privacy policy
            </Link>
          </footer>
        </div>
      </div>
      <ThemeToggle className="fixed top-3 right-3" />
    </main>
  );
}
