import {
  test,
  expect,
} from '@playwright/test';


test.use({
  baseURL:
    process.env.BEDSS_BROWSER_URL ||
    'http://127.0.0.1:4100',
});


test(
  'Incident and quarantine page renders with real API responses',
  async ({ page }) => {

    const errors: string[] = [];

    page.on(
      'pageerror',
      (error) =>
        errors.push(
          error.message,
        ),
    );


    await page.goto('/');


    await page
      .getByLabel(
        'E-posta adresi',
      )
      .fill(
        'bayi@depomtakip.local',
      );


    await page
      .getByLabel(
        'Şifre',
        {
          exact: true,
        },
      )
      .fill(
        'DepomTakip!2026',
      );


    await page
      .getByRole(
        'button',
        {
          name:
            'Giriş Yap',
          exact: true,
        },
      )
      .click();


    await expect(
      page.getByRole(
        'heading',
        {
          name:
            'Genel Bakış',
        },
      ),
    ).toBeVisible();


    for (
      const path of [
        '/incidents/sources',
        '/incidents/history',
      ]
    ) {

      const response =
        await page.request.get(
          '/api' + path,
        );


      expect(
        response.status(),
        path,
      ).toBe(200);


      expect(
        Array.isArray(
          await response.json(),
        ),
      ).toBe(true);
    }


    await page
      .locator('nav')
      .getByRole(
        'button',
        {
          name:
            'Hasar / Karantina',
          exact: true,
        },
      )
      .click();


    await expect(
      page.getByRole(
        'heading',
        {
          name:
            'Hasar / Kayıp / Karantina',
          exact: true,
        },
      ),
    ).toBeVisible();


    await expect(
      page.getByRole(
        'heading',
        {
          name:
            'Yeni Olay Bildirimi',
          exact: true,
        },
      ),
    ).toBeVisible();


    await expect(
      page.getByRole(
        'heading',
        {
          name:
            'Olay Geçmişi',
          exact: true,
        },
      ),
    ).toBeVisible();


    await expect(
      page.locator(
        '.alert.error',
      ),
    ).toHaveCount(0);


    await page.screenshot({
      path:
        'docs/incidents.png',
      fullPage: true,
    });


    expect(errors)
      .toEqual([]);
  },
);