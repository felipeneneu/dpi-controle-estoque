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
  await expect(page).toHaveURL(/\/$/, { timeout: 45_000 });
  await waitTitleBarHydrated(page);
}

async function waitTitleBarHydrated(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const triggers = Array.from(
        document.querySelectorAll<HTMLElement>('nav [data-slot="dropdown-menu-trigger"]')
      );
      return (
        triggers.length === 5 &&
        triggers.every((t) => t.getAttribute('aria-haspopup') !== null)
      );
    },
    undefined,
    { timeout: 15_000 }
  );
}

test('titlebar shows all menu buttons', async ({ page }) => {
  await login(page);
  for (const name of ['Arquivo', 'Editar', 'Exibir', 'Janela', 'Ajuda']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
});

test('Exibir toggles the sidebar column', async ({ page }) => {
  await login(page);
  const sidebarHeading = page.getByText('Estoque & Mídias');
  await expect(sidebarHeading).toBeVisible();

  await page.getByRole('button', { name: 'Exibir', exact: true }).click();
  const toggle = page.getByRole('menuitemcheckbox', { name: 'Alternar barra lateral' });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(sidebarHeading).toBeHidden();

  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(sidebarHeading).toBeVisible();
});

test('Ajuda opens the About dialog and closes via Esc', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Ajuda', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Sobre o GráficaOS' }).click();

  await expect(page.getByRole('heading', { name: 'Sobre o GráficaOS' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Sobre o GráficaOS' })).toBeHidden();
});

test('Home and Search icons navigate correctly', async ({ page }) => {
  await login(page);
  await page.goto('/produtos');
  await page.getByRole('button', { name: 'Início' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page).toHaveURL(/\/produtos/);
  await expect(page.getByPlaceholder('Buscar insumo…')).toBeFocused();
});