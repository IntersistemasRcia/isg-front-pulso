import type { CardProps as MuiCardProps } from "@mui/material/Card";
import MuiCard from "@mui/material/Card";
import styles from "./Card.module.css";

export type CardProps = MuiCardProps;

/**
 * Wrapper de Card de MUI. Las páginas deben importar desde `@/utils/ui`.
 */
export function Card({ className, children, ...props }: CardProps) {
  const classes = [styles.card, className].filter(Boolean).join(" ");

  return (
    <MuiCard className={classes} elevation={0} {...props}>
      {children}
    </MuiCard>
  );
}
