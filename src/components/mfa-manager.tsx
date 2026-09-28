"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Factor = {
  id: string;
  friendly_name?: string | null;
  status?: string | null;
};

export function MfaManager() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [currentLevel, setCurrentLevel] = useState<string | null>(null);
  const [nextLevel, setNextLevel] = useState<string | null>(null);
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const supabase = createClient();

  async function load() {
    const [factorResult, aalResult] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (factorResult.error) {
      setMessage(factorResult.error.message);
      return;
    }
    setFactors(factorResult.data.totp ?? []);
    if (aalResult.data) {
      setCurrentLevel(aalResult.data.currentLevel);
      setNextLevel(aalResult.data.nextLevel);
    }
  }

  useEffect(() => {
    // The async loader only updates state after Supabase network/session reads complete.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function startEnrollment() {
    setBusy(true);
    setMessage("");
    try {
      const result = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "GLOHAUS authenticator",
      });
      if (result.error) throw result.error;
      setFactorId(result.data.id);
      setQrCode(result.data.totp.qr_code);
      setSecret(result.data.totp.secret);
      setMessage("Scan the QR code with your authenticator app, then enter the 6-digit code.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start two-step verification.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyFactor(targetFactorId?: string) {
    const id = targetFactorId || factorId || factors[0]?.id;
    if (!id || !/^\d{6}$/.test(code.trim())) {
      setMessage("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: id });
      if (challenge.error) throw challenge.error;
      const verify = await supabase.auth.mfa.verify({
        factorId: id,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verify.error) throw verify.error;
      await supabase.auth.refreshSession();
      setMessage("Two-step verification complete.");
      await load();
      window.location.assign("/admin");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That verification code could not be confirmed.");
    } finally {
      setBusy(false);
    }
  }

  const verifiedFactor = factors.find((factor) => factor.status === "verified") ?? factors[0];
  const needsChallenge = currentLevel === "aal1" && nextLevel === "aal2";

  return (
    <section className="editor-form" aria-labelledby="mfa-title">
      <h2 id="mfa-title">Two-step verification</h2>
      <p className="lead">
        Owner and admin access requires a recent authenticator-app check. GLOHAUS uses Supabase TOTP MFA.
      </p>

      {currentLevel === "aal2" && (
        <p className="form-notice" role="status">
          Your current session has passed two-step verification.
        </p>
      )}

      {!verifiedFactor && !qrCode && (
        <button className="button" type="button" disabled={busy} onClick={startEnrollment}>
          {busy ? "Starting…" : "Set up authenticator app"}
        </button>
      )}

      {qrCode && (
        <div className="mfa-enrolment">
          <img src={qrCode} width={220} height={220} alt="QR code for GLOHAUS two-step verification" />
          <p>
            If you cannot scan the QR code, enter this secret manually:
            <br />
            <strong>{secret}</strong>
          </p>
        </div>
      )}

      {(qrCode || verifiedFactor || needsChallenge) && currentLevel !== "aal2" && (
        <>
          <label>
            Authenticator code
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="123456"
            />
          </label>
          <button
            className="button"
            type="button"
            disabled={busy || code.length !== 6}
            onClick={() => verifyFactor(verifiedFactor?.id)}
          >
            {busy ? "Verifying…" : qrCode ? "Enable two-step verification" : "Verify and open Admin"}
          </button>
        </>
      )}

      {message && <p className="form-notice" role="status">{message}</p>}
    </section>
  );
}
