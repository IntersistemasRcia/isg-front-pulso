import type { ButtonProps as MuiButtonProps } from "@mui/material/Button";
import MuiButton from "@mui/material/Button";
import styles from "./Button.module.css";

export type ButtonProps = MuiButtonProps & {
  fullWidth?: boolean;
};

/**
 * Wrapper de Button de MUI. Las páginas deben importar desde `@/components/ui`.
 */
export function Button({ className, children, ...props }: ButtonProps) {
  const classes = [styles.button, className].filter(Boolean).join(" ");

  return (
    <MuiButton className={classes} disableElevation {...props}>
      {children}
    </MuiButton>
  );
}
