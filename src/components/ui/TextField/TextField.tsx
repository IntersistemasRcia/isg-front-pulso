import type { TextFieldProps as MuiTextFieldProps } from "@mui/material/TextField";
import MuiTextField from "@mui/material/TextField";
import styles from "./TextField.module.css";

export type TextFieldProps = MuiTextFieldProps;

/**
 * Wrapper de TextField de MUI. Las páginas deben importar desde `@/components/ui`.
 */
export function TextField({ className, ...props }: TextFieldProps) {
  const classes = [styles.field, className].filter(Boolean).join(" ");

  return (
    <MuiTextField
      className={classes}
      variant={props.variant ?? "outlined"}
      fullWidth={props.fullWidth ?? true}
      {...props}
    />
  );
}
