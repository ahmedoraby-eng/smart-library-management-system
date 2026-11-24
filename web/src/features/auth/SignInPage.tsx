import type { Me } from "@slm/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, useRouter } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button, EyeIcon, EyeOffIcon, GoogleMark, InlineAlert, Input, BookIcon } from "../../components/ui";
import { ApiError, api } from "../../lib/apiClient";
import { useAuthProviders } from "./providers";
import { meQueryKey, safeNext, useMe } from "./session";

const route = getRouteApi("/signin");

const GOOGLE_NOTICES: Record<string, string> = {
  google: "Google sign-in didn't complete. Try again.",
  google_unverified: "Your Google email isn't verified. Verify it with Google, then try again.",
  disabled: "Your staff account is disabled.",
};

const formatCountdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** ux.md §1.1. Google is the primary path; the demo form is secondary under a divider. */
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
    <main className="flex min-h-screen flex-col items-center px-4 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-brand-600 text-white">
          <BookIcon size={22} />
        </div>
        <h1 className="text-xl font-semibold">Smart Library</h1>
        <p className="mt-1 text-base text-neutral-600">Staff sign-in</p>
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

        <div className="rounded-xl border border-border bg-surface p-7 shadow-card">
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
          <p className={googleOn ? "mt-3 text-center text-sm text-neutral-600" : "text-center text-sm text-neutral-600"}>
            Library staff only. Members don't sign in.
          </p>

          {demoOff || !demoOn ? (
            <InlineAlert variant="info" className="mt-6" testId="demo-off">
              {googleOn ? "Demo accounts are turned off. Sign in with Google." : "Sign-in is not available right now."}
            </InlineAlert>
          ) : (
            <>
              {googleOn ? (
                <div className="my-6 flex items-center gap-3 text-sm text-neutral-600" role="separator" data-testid="signin-divider">
                  <span className="h-px flex-1 bg-border" />
                  or use a demo account
                  <span className="h-px flex-1 bg-border" />
                </div>
              ) : (
                <div className="h-6" aria-hidden />
              )}

              {notice && (
                <InlineAlert variant="danger" className="mb-4" testId="signin-error">
                  <span>
                    {notice.text}
                    {notice.countdown && wait > 0 && <span className="ml-1 tabular-nums">({formatCountdown(wait)})</span>}
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
              <p className="mt-4 text-center text-sm text-neutral-600">Demo credentials are in the submission email.</p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
