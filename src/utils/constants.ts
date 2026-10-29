/** Nombre de la cookie con el JWT (compartido cliente/servidor). */
export const AUTH_COOKIE_NAME = "pulso_token";

/**
 * Header alternativo al Authorization Bearer.
 * IIS/ARR a menudo elimina Authorization; este header llega al Node de Next.
 */
export const AUTH_TOKEN_HEADER = "x-pulso-token";

export const TOKEN_STORAGE_KEY = "pulso_jwt";
export const USER_STORAGE_KEY = "pulso_user";
