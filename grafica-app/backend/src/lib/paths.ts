import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Empacotado: resources/graficaos/backend/public/users (populado pelo sync-staging.js)
const PACKAGED_USERS_DIR = fileURLToPath(new URL('../../public/users/', import.meta.url));
// Desenvolvimento: os avatares vivem no public do front (grafica-app/public/users)
const DEV_USERS_DIR = fileURLToPath(new URL('../../../public/users/', import.meta.url));

// Escolhe a primeira que existir; em runtime empacotado a correta é a PACKAGED.
export const USERS_PUBLIC_DIR = existsSync(PACKAGED_USERS_DIR) ? PACKAGED_USERS_DIR : DEV_USERS_DIR;