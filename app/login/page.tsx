"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { useAuth } from "@/components/providers/AuthProvider";
import FormularioLogin from "./FormularioLogin";
import styles from "./login.module.css";

const VERSION_APP = "0.1.0";

function IconoBarras() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M5 19V11M10 19V7M15 19V13M20 19V5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconoFoco() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3 11c.5.5 1 1.2 1 2h4c0-.8.5-1.5 1-2a6 6 0 0 0-3-11Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconoReloj() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v4.5l3 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function LoginPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const hardNavigatingRef = useRef(false);
  const anioActual = new Date().getFullYear();

  useEffect(() => {
    if (hardNavigatingRef.current) return;
    if (!authLoading && isAuthenticated) {
      window.location.replace("/dashboard");
    }
  }, [authLoading, isAuthenticated]);

  return (
    <main className={styles.pagina}>
      <section className={styles.panel}>
        <div>
          <div className={styles.marca}>
            <Image
              src="/logos/pulso-icon.svg"
              alt=""
              width={64}
              height={64}
              priority
              unoptimized
              className={styles.logo}
            />
            <span>ISG PULSO</span>
          </div>

          <p className={styles.insignia}>BUSINESS INTELLIGENCE PARA TU NEGOCIO</p>

          <h1 className={styles.titulo}>
            Datos que impulsan <em>mejores decisiones.</em>
          </h1>
          <p className={styles.descripcion}>
            Toda la información de tu negocio, siempre a mano, en cualquier lugar.
          </p>

          <div className={styles.pilares}>
            <div className={styles.pilar}>
              <span className={styles.pilarIcono}>
                <IconoBarras />
              </span>
              <span>
                <b>Analizá</b>
                Tu negocio en tiempo real.
              </span>
            </div>
            <div className={styles.pilar}>
              <span className={styles.pilarIcono}>
                <IconoFoco />
              </span>
              <span>
                <b>Detectá</b>
                Oportunidades de crecimiento.
              </span>
            </div>
            <div className={styles.pilar}>
              <span className={styles.pilarIcono}>
                <IconoReloj />
              </span>
              <span>
                <b>Decidí</b>
                Con información confiable.
              </span>
            </div>
          </div>

          <Image
            src="/login/pulso-bi-hero.svg"
            alt="Panel con indicadores comerciales de ejemplo"
            width={900}
            height={450}
            priority
            unoptimized
            className={styles.hero}
          />
        </div>

        <p className={styles.pieProducto}>
          Un producto de inter<strong>Sistemas</strong>
        </p>
      </section>

      <section className={styles.columnaFormulario}>
        <div className={styles.tarjeta}>
          <FormularioLogin
            onNavigate={() => {
              hardNavigatingRef.current = true;
            }}
          />

          <div className={styles.divisor}>
            <span />
            <span className={styles.divisorTexto}>o</span>
            <span />
          </div>

          <p className={styles.version}>Versión {VERSION_APP}</p>
          <p className={styles.copyright}>
            © {anioActual} inter<strong>Sistemas</strong>. Todos los derechos reservados.
          </p>
        </div>
      </section>
    </main>
  );
}
