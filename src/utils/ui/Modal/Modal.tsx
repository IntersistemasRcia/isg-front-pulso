import type { ModalProps as MuiModalProps } from "@mui/material/Modal";
import MuiModal from "@mui/material/Modal";
import Box from "@mui/material/Box";
import type { ReactNode } from "react";
import styles from "./Modal.module.css";

export type ModalProps = Omit<MuiModalProps, "children"> & {
  children: ReactNode;
  /** Ancho máximo del panel interno. */
  maxWidth?: number | string;
};

/**
 * Wrapper de Modal de MUI con contenedor centrado estilizado.
 */
export function Modal({
  children,
  className,
  maxWidth = 420,
  ...props
}: ModalProps) {
  return (
    <MuiModal className={[styles.root, className].filter(Boolean).join(" ")} {...props}>
      <Box className={styles.panel} style={{ maxWidth }}>
        {children}
      </Box>
    </MuiModal>
  );
}
