import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, BACKEND_PORT } from '../world.js';

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript((backendPort) => {
    window.localStorage.setItem('grafica_backend_url', `http://localhost:${backendPort}`);
  }, BACKEND_PORT);
});

test('login with valid DEV_MASTER credentials lands on dashboard', async ({ page }) => {
  await page.goto('/auth');
  await page.getByPlaceholder('Seu e-mail cadastrado').fill(ADMIN_EMAIL);
  await page.getByPlaceholder('Sua senha de acesso').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Acessar' }).click();

  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await expect(page.locator('body')).not.toContainText('Acesse sua conta');
});

test('login with wrong password shows an error', async ({ page }) => {
  await page.goto('/auth');
  await page.getByPlaceholder('Seu e-mail cadastrado').fill(ADMIN_EMAIL);
  await page.getByPlaceholder('Sua senha de acesso').fill('senha-muio-errada');
  await page.getByRole('button', { name: 'Acessar' }).click();

  await expect(page.locator('body')).toContainText('Invalid credentials', { timeout: 15_000 });
});
