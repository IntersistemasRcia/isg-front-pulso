"use client";

import type { ButtonProps as MuiButtonProps } from "@mui/material/Button";
import MuiButton from "@mui/material/Button";
import styles from "./MyButtons.module.css";

export type MyButtonColor = "primary" | "secondary";
export type MyButtonSize = "small" | "medium" | "large";

export type MyButtonsProps = Omit<MuiButtonProps, "color" | "size"> & {
  /** primary = naranja ISG, secondary = violeta ISG */
  color?: MyButtonColor;
  /** Tamaño visual del botón */
  size?: MyButtonSize;
};

const sizeClassMap: Record<MyButtonSize, string> = {
  small: styles.sizeSmall,
  medium: styles.sizeMedium,
  large: styles.sizeLarge,
};

const colorClassMap: Record<MyButtonColor, string> = {
  primary: styles.colorPrimary,
  secondary: styles.colorSecondary,
};

/**
 * Botón ISG basado en MUI, estilizado con variables de `globals.css`.
 * Importar desde `@/utils/MyButtons`.
 */
export function MyButtons({
  className,
  children,
  color = "primary",
  size = "medium",
  fullWidth,
  disabled,
  ...props
}: MyButtonsProps) {
  const classes = [
    styles.button,
    colorClassMap[color],
    sizeClassMap[size],
    fullWidth ? styles.fullWidth : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <MuiButton
      className={classes}
      disableElevation
      disabled={disabled}
      fullWidth={fullWidth}
      {...props}
    >
      {children}
    </MuiButton>
  );
}

export default MyButtons;
