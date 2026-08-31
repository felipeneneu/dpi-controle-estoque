import { test, expect, type Page } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, BACKEND_PORT } from '../world.js';

async function login(page: Page): Promise<void> {
  await page.addInitScript((backendPort) => {
    window.localStorage.setItem('grafica_backend_url', `http://localhost:${backendPort}`);
  }, BACKEND_PORT);
  await page.goto('/auth');
  await page.getByPlaceholder('Seu e-mail cadastrado').fill(ADMIN_EMAIL);
  await page.getByPlaceholder('Sua senha de acesso').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Acessar' }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
}

test('estoque lists seeded items and performs a stock baixa', async ({ page }) => {
  await login(page);

  await page.goto('/estoque');
  await expect(page.getByRole('heading', { name: 'Estoque de Mídias' })).toBeVisible();

  // Seeded sample item should render.
  const card = page.getByText('Bobina de Vinil 1.37m').first();
  await expect(card).toBeVisible({ timeout: 15_000 });

  await page
    .locator('div.grid > div')
    .filter({ hasText: 'Bobina de Vinil 1.37m' })
    .first()
    .getByRole('button', { name: 'Dar Baixa no Estoque' })
    .click();

  await expect(page.getByRole('heading', { name: 'Baixa no Estoque' })).toBeVisible();
  await page.getByPlaceholder('Ex: 5 (m)').fill('5');
  await page.getByRole('button', { name: 'Confirmar Baixa' }).click();

  // Dialog closes and a fresh load triggers — wait for the heading to disappear.
  await expect(page.getByRole('heading', { name: 'Baixa no Estoque' })).toBeHidden();

  const newRoot = page.locator('div.grid > div').filter({ hasText: 'Bobina de Vinil 1.37m' }).first();
  await expect(newRoot).toContainText('115 m', { timeout: 15_000 });
});
