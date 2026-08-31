import { fileURLToPath } from 'node:url';

export const USERS_PUBLIC_DIR = fileURLToPath(new URL('../../../public/users/', import.meta.url));