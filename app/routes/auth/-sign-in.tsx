import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useSignIn } from "@clerk/tanstack-react-start";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { sanitizeRedirectPath } from "@/lib/redirect";

type SupportedSecondFactor =
  | {
      strategy: "email_code";
      emailAddressId: string;
      safeIdentifier: string;
      primary?: boolean;
    }
  | {
      strategy: "phone_code";
      phoneNumberId: string;
      safeIdentifier: string;
      primary?: boolean;
      default?: boolean;
      channel?: string;
    }
  | { strategy: "totp" }
  | { strategy: "backup_code" }
  | {
      strategy: "email_link";
      emailAddressId: string;
      safeIdentifier: string;
      primary?: boolean;
    };

function isSupportedSecondFactor(value: unknown): value is SupportedSecondFactor {
  if (!value || typeof value !== "object" || !("strategy" in value)) {
    return false;
  }

  const strategy = value.strategy;

  return (
    strategy === "email_code" ||
    strategy === "phone_code" ||
    strategy === "totp" ||
    strategy === "backup_code" ||
    strategy === "email_link"
  );
}

function isSecondFactorStatus(status: string | null | undefined) {
  return status === "needs_second_factor" || status === "needs_client_trust";
}

function getSecondFactorLabel(factor: SupportedSecondFactor) {
  switch (factor.strategy) {
    case "email_code":
      return `Email code to ${factor.safeIdentifier}`;
    case "phone_code":
      return `Text code to ${factor.safeIdentifier}`;
    case "totp":
      return "Authenticator app";
    case "backup_code":
      return "Backup code";
    case "email_link":
      return `Email link to ${factor.safeIdentifier}`;
  }
}

function getPreferredSecondFactor(factors: SupportedSecondFactor[]) {
  return (
    factors.find((factor) => factor.strategy === "totp") ||
    factors.find((factor) => factor.strategy === "email_code" && factor.primary) ||
    factors.find((factor) => factor.strategy === "phone_code" && factor.default) ||
    factors.find((factor) => factor.strategy === "email_code") ||
    factors.find((factor) => factor.strategy === "phone_code") ||
    factors.find((factor) => factor.strategy === "backup_code") ||
    factors.find((factor) => factor.strategy === "email_link") ||
    null
  );
}

function getClerkErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "errors" in error &&
    Array.isArray(error.errors) &&
    error.errors.length > 0
  ) {
    const firstError = error.errors[0];

    if (
      firstError &&
      typeof firstError === "object" &&
      "longMessage" in firstError &&
      typeof firstError.longMessage === "string"
    ) {
      return firstError.longMessage;
    }

    if (
      firstError &&
      typeof firstError === "object" &&
      "message" in firstError &&
      typeof firstError.message === "string"
    ) {
      return firstError.message;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Sign-in failed. Try again.";
}

export default function SignInPage() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const search = useRouterState({
    select: (state) => state.location.searchStr,
  });
  const redirectUrl = sanitizeRedirectPath(
    new URLSearchParams(search).get("redirect_url"),
    "/dashboard",
  );
  const signUpHref = redirectUrl ? `/sign-up?redirect_url=${encodeURIComponent(redirectUrl)}` : "/sign-up";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [selectedFactor, setSelectedFactor] = useState<SupportedSecondFactor | null>(null);
  const [availableFactors, setAvailableFactors] = useState<SupportedSecondFactor[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreparingFactor, setIsPreparingFactor] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [factorMessage, setFactorMessage] = useState<string | null>(null);

  async function activateSession(sessionId: string | null) {
    if (!sessionId) {
      throw new Error("Clerk did not create a session.");
    }

    await setActive({
      session: sessionId,
      redirectUrl: redirectUrl || "/dashboard",
    });
  }

  async function prepareSecondFactor(factor: SupportedSecondFactor) {
    setGlobalError(null);
    setFactorMessage(null);
    setVerificationCode("");
    setSelectedFactor(factor);

    if (factor.strategy === "email_link") {
      setGlobalError("Email link verification is not supported in this screen yet.");
      return;
    }

    if (factor.strategy !== "email_code" && factor.strategy !== "phone_code") {
      return;
    }

    setIsPreparingFactor(true);

    try {
      if (factor.strategy === "email_code") {
        await signIn.prepareSecondFactor({
          strategy: "email_code",
          emailAddressId: factor.emailAddressId,
        });
        setFactorMessage(`We sent a code to ${factor.safeIdentifier}.`);
      } else {
        await signIn.prepareSecondFactor({
          strategy: "phone_code",
          phoneNumberId: factor.phoneNumberId,
        });
        setFactorMessage(`We sent a code to ${factor.safeIdentifier}.`);
      }
    } catch (error) {
      setGlobalError(getClerkErrorMessage(error));
    } finally {
      setIsPreparingFactor(false);
    }
  }

  async function handleSignInState(nextSignIn: typeof signIn) {
    const status = nextSignIn.status as string | null;

    if (status === "complete") {
      await activateSession(nextSignIn.createdSessionId);
      return;
    }

    if (isSecondFactorStatus(status)) {
      const factors = (nextSignIn.supportedSecondFactors ?? []).filter(isSupportedSecondFactor);
      setAvailableFactors(factors);

      if (factors.length === 0) {
        setGlobalError("Your account requires another verification step that this screen cannot complete.");
        return;
      }

      const preferredFactor = getPreferredSecondFactor(factors);
      if (!preferredFactor) {
        setGlobalError("No supported verification method is available for this sign-in.");
        return;
      }

      await prepareSecondFactor(preferredFactor);
      return;
    }

    setGlobalError("Sign-in is waiting on an unsupported step.");
  }

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) {
      return;
    }

    setIsSubmitting(true);
    setGlobalError(null);

    try {
      const nextSignIn = await signIn.create({
        strategy: "password",
        identifier,
        password,
      });

      await handleSignInState(nextSignIn);
    } catch (error) {
      setGlobalError(getClerkErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSecondFactorSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded || !selectedFactor) {
      return;
    }

    if (selectedFactor.strategy === "email_link") {
      setGlobalError("Email link verification is not supported in this screen yet.");
      return;
    }

    setIsSubmitting(true);
    setGlobalError(null);

    try {
      const nextSignIn = await signIn.attemptSecondFactor({
        strategy: selectedFactor.strategy,
        code: verificationCode,
      });

      await handleSignInState(nextSignIn);
    } catch (error) {
      setGlobalError(getClerkErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetToPasswordStep() {
    setSelectedFactor(null);
    setAvailableFactors([]);
    setVerificationCode("");
    setFactorMessage(null);
    setGlobalError(null);
  }

  if (!isLoaded) {
    return (
      <Card>
        <CardContent className="p-6 font-mono text-sm text-[var(--foreground-muted)]">
          Loading sign-in…
        </CardContent>
      </Card>
    );
  }

  const isSecondFactorStep = selectedFactor !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isSecondFactorStep ? "Verify sign-in" : "Sign in"}</CardTitle>
        <CardDescription>
          {isSecondFactorStep
            ? "This device needs one more verification step before we can sign you in."
            : "Use your email or username and password to get back into loam."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {globalError ? (
          <div className="border-2 border-[var(--destructive)] bg-[color-mix(in_srgb,var(--destructive)_12%,transparent)] p-3 text-sm font-mono text-[var(--foreground)]">
            {globalError}
          </div>
        ) : null}

        {isSecondFactorStep ? (
          <div className="space-y-4">
            {availableFactors.length > 1 ? (
              <div className="space-y-2">
                <p className="text-xs font-mono uppercase tracking-[0.2em] text-[var(--foreground-muted)]">
                  Choose a verification method
                </p>
                <div className="grid gap-2">
                  {availableFactors.map((factor) => {
                    const isSelected =
                      selectedFactor.strategy === factor.strategy &&
                      (factor.strategy !== "email_code" ||
                        ("emailAddressId" in factor &&
                          "emailAddressId" in selectedFactor &&
                          factor.emailAddressId === selectedFactor.emailAddressId)) &&
                      (factor.strategy !== "phone_code" ||
                        ("phoneNumberId" in factor &&
                          "phoneNumberId" in selectedFactor &&
                          factor.phoneNumberId === selectedFactor.phoneNumberId));

                    return (
                      <Button
                        key={getSecondFactorLabel(factor)}
                        type="button"
                        variant={isSelected ? "primary" : "outline"}
                        className="justify-start"
                        onClick={() => void prepareSecondFactor(factor)}
                        disabled={isPreparingFactor || isSubmitting}
                      >
                        {getSecondFactorLabel(factor)}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {factorMessage ? (
              <p className="text-sm font-mono text-[var(--foreground-muted)]">{factorMessage}</p>
            ) : null}

            <form className="space-y-4" onSubmit={(event) => void handleSecondFactorSubmit(event)}>
              <div className="space-y-2">
                <label
                  htmlFor="verification-code"
                  className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--foreground-muted)]"
                >
                  {selectedFactor?.strategy === "backup_code" ? "Backup code" : "Verification code"}
                </label>
                <Input
                  id="verification-code"
                  name="verification-code"
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value)}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  placeholder={selectedFactor?.strategy === "backup_code" ? "Enter your backup code" : "Enter the code"}
                  required
                />
              </div>

              <div className="flex gap-3">
                <Button type="submit" variant="primary" disabled={isSubmitting || isPreparingFactor}>
                  {isSubmitting ? "Verifying…" : "Verify and sign in"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting || isPreparingFactor}
                  onClick={resetToPasswordStep}
                >
                  Start over
                </Button>
              </div>
            </form>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(event) => void handlePasswordSubmit(event)}>
            <div className="space-y-2">
              <label
                htmlFor="identifier"
                className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--foreground-muted)]"
              >
                Email or username
              </label>
              <Input
                id="identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="you@company.com"
                required
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--foreground-muted)]"
              >
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>

            <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        )}

        <p className="text-sm font-mono text-[var(--foreground-muted)]">
          Need an account?{" "}
          <Link to={signUpHref} className="font-bold text-[var(--accent)] hover:text-[var(--foreground)]">
            Start your trial
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
