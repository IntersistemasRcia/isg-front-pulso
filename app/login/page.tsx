"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Card, TextField } from "@/components/ui";
import { MyButtons } from "@/utils/MyButtons";
import { useAuth } from "@/components/providers/AuthProvider";
import styles from "./login.module.css";

export default function LoginPage() {
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const hardNavigatingRef = useRef(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hardNavigatingRef.current) return;
    if (!authLoading && isAuthenticated) {
      // Hard nav: cookie + LS listos para middleware y /api/* (evita 401 hasta F5).
      window.location.replace("/dashboard");
    }
  }, [authLoading, isAuthenticated]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login({ username: username.trim(), password });
      hardNavigatingRef.current = true;
      // login() ya esperó /api/auth/session OK (headers + cookie listos).
      window.location.assign("/dashboard");
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } }; message?: string })
          ?.response?.data?.message ||
        (err as Error)?.message ||
        "No se pudo iniciar sesión";
      setError(message);
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <Card className={styles.card}>
          <div className={styles.brand}>
            <Image
              src="/logos/isg.png"
              alt="isGestion"
              width={320}
              height={96}
              priority
              className={styles.logo}
            />
            <p className={styles.brandSub}>Pulso</p>
          </div>

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <TextField
              label="Usuario"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              required
            />
            <TextField
              label="Contraseña"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />

            {error ? <div className={styles.error}>{error}</div> : null}

            <MyButtons
              type="submit"
              color="primary"
              size="large"
              fullWidth
              className={styles.submit}
              disabled={loading || !username || !password}
            >
              {loading ? "Ingresando…" : "Ingresar"}
            </MyButtons>
          </form>

          <p className={styles.hint}>
            Autenticación vía API Auth de la instancia.
          </p>
        </Card>
      </div>
    </div>
  );
}
