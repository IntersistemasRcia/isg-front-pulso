"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import styles from "./login.module.css";

type FormularioLoginProps = {
  onNavigate: () => void;
};

function IconoUsuario() {
  return (
    <svg className={styles.icono} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5.5 19.2c1.2-3 3.4-4.5 6.5-4.5s5.3 1.5 6.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconoCandado() {
  return (
    <svg className={styles.icono} viewBox="0 0 24 24" aria-hidden>
      <rect x="6" y="11" width="12" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconoOjo({ oculto }: { oculto: boolean }) {
  if (oculto) {
    return (
      <svg className={styles.icono} viewBox="0 0 24 24" aria-hidden>
        <path
          d="M4 5l16 16M9.5 9.8A3.5 3.5 0 0 0 14.2 14.5M7.2 7.6C5.2 8.8 3.6 10.6 2.8 12c1.6 3 5 6 9.2 6 1.5 0 2.9-.4 4.2-1M10.2 6.2A9 9 0 0 1 12 6c4.2 0 7.6 3 9.2 6-.5 1-1.3 2.1-2.3 3.1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg className={styles.icono} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M2.8 12C4.4 9 7.8 6 12 6s7.6 3 9.2 6c-1.6 3-5 6-9.2 6s-7.6-3-9.2-6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export default function FormularioLogin({ onNavigate }: FormularioLoginProps) {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarContrasena, setMostrarContrasena] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login({ username: username.trim(), password });
      onNavigate();
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
    <form className={styles.formulario} onSubmit={handleSubmit} noValidate>
      <h1 className={styles.titulo}>Bienvenido a Pulso</h1>
      <p className={styles.subtitulo}>Iniciá sesión para continuar</p>

      <label className={styles.etiqueta} htmlFor="usuario">
        Usuario
      </label>
      <div className={styles.campoConIcono}>
        <IconoUsuario />
        <input
          id="usuario"
          name="username"
          type="text"
          autoComplete="username"
          placeholder="Ingresá tu usuario"
          className={styles.input}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          disabled={loading}
          required
        />
      </div>

      <label className={styles.etiqueta} htmlFor="contrasena">
        Contraseña
      </label>
      <div className={styles.campoConIcono}>
        <IconoCandado />
        <input
          id="contrasena"
          name="password"
          type={mostrarContrasena ? "text" : "password"}
          autoComplete="current-password"
          placeholder="Ingresá tu contraseña"
          className={styles.input}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={loading}
          required
        />
        <button
          type="button"
          className={styles.botonMostrarContrasena}
          onClick={() => setMostrarContrasena((valor) => !valor)}
          aria-label={mostrarContrasena ? "Ocultar contraseña" : "Mostrar contraseña"}
          disabled={loading}
        >
          <IconoOjo oculto={mostrarContrasena} />
        </button>
      </div>

      {error ? <p className={styles.mensajeError}>{error}</p> : null}

      <button
        type="submit"
        className={styles.botonIngresar}
        disabled={loading || !username.trim() || !password}
      >
        <IconoCandado />
        {loading ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
