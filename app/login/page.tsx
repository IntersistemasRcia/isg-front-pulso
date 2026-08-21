"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, TextField } from "@/utils/ui";
import { useAuth } from "@/utils/AuthProvider";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [authLoading, isAuthenticated, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login({ username: username.trim(), password });
      router.replace("/dashboard");
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } }; message?: string })
          ?.response?.data?.message ||
        (err as Error)?.message ||
        "No se pudo iniciar sesión";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>Pulso</div>
          <p className={styles.brandSub}>Copilot on-premise · ISG</p>
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

          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            className={styles.submit}
            disabled={loading || !username || !password}
          >
            {loading ? "Ingresando…" : "Ingresar"}
          </Button>
        </form>

        <p className={styles.hint}>
          Autenticación vía API Auth local de la instancia del cliente.
        </p>
      </Card>
    </div>
  );
}
