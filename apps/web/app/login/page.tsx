"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiClientError, storeSession } from "@/lib/api";
import { BrandLogo } from "@/components/BrandLogo";
import { ApiNotice } from "@/components/ApiNotice";
import type { LoginResponse } from "@exo/shared";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = { email?: string; password?: string };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const next: FieldErrors = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      next.email = "L'adresse email est requise.";
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      next.email = "Saisissez une adresse email valide (ex. nom@entreprise.ma).";
    }

    if (!password) {
      next.password = "Le mot de passe est requis.";
    } else if (password.length < 8) {
      next.password = "Le mot de passe doit contenir au moins 8 caractères.";
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!validate()) return;

    setSubmitting(true);
    try {
      const session = await apiRequest<LoginResponse>("/api/v1/auth/login", {
        method: "POST",
        body: { email: email.trim(), password }
      });
      storeSession(session);
      router.push("/shipments");
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "API_NOT_CONFIGURED") {
        setError(
          "Connexion impossible : l'API EXO EXPRESS n'est pas configurée pour cette version du tableau de bord."
        );
      } else if (err instanceof ApiClientError && err.status === 401) {
        setError("Email ou mot de passe incorrect.");
      } else if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Connexion impossible. Vérifiez votre connexion réseau puis réessayez.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="loginWrap">
      <div className="loginStack">
        <ApiNotice />
        <form className="loginCard" onSubmit={submit} noValidate>
          <div className="loginBrand">
            <BrandLogo variant="login" />
          </div>
          <h1 className="loginTitle">Connexion</h1>
          <p className="loginSub">Espace opérations EXO EXPRESS</p>

          {error ? <div className="errorState" role="alert">{error}</div> : null}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              inputMode="email"
              autoComplete="username"
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: undefined }));
              }}
            />
            {fieldErrors.email ? (
              <span className="fieldError" id="email-error" role="alert">{fieldErrors.email}</span>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: undefined }));
              }}
            />
            {fieldErrors.password ? (
              <span className="fieldError" id="password-error" role="alert">{fieldErrors.password}</span>
            ) : null}
          </div>
          <div className="formActions">
            <button className="btn btnPrimary" type="submit" disabled={submitting}>
              {submitting ? "Connexion…" : "Se connecter"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
