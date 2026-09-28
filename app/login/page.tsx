"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { useAuth } from "@/components/providers/AuthProvider";
import FormularioLogin from "./FormularioLogin";
import styles from "./login.module.css";

const VERSION_APP = "0.1.0";

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
      <Image
        src="/login/FondoLogin.svg"
        alt=""
        fill
        priority
        unoptimized
        className={styles.fondoDecorativo}
      />

      <div className={styles.contenido}>
        <header className={styles.encabezado} />

        <div className={styles.contenedor}>
          <section className={styles.panelInformativo}>
            <Image
              src="/login/ISGLOGO2.png"
              alt="interSistemas"
              width={4076}
              height={1542}
              priority
              className={styles.logo}
            />

            <h2 className={styles.eslogan}>
              <span className={styles.esloganPrincipal}>Consultá simple.</span>
              <br />
              <span className={styles.esloganAcento}>Decidí con datos.</span>
            </h2>

            <p className={styles.descripcion}>
              Preguntá por ventas, clientes y finanzas del ERP y mirá el resultado en pantalla.
            </p>

            <Image
              src="/login/ComputadoraLogin.png"
              alt="Consulta de datos en computadora"
              width={1536}
              height={1024}
              className={styles.imagenComputadora}
            />
          </section>

          <section className={styles.tarjetaFormulario}>
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
          </section>
        </div>
      </div>
    </main>
  );
}
