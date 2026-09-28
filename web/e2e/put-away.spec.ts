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
  'Put-away page renders and API returns arrays',
  async ({ page }) => {

    const errors: string[] = [];

    page.on(
      'pageerror',
      (e) =>
        errors.push(e.message),
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
          name: 'Giriş Yap',
          exact: true,
        },
      )
      .click();


    await expect(
      page.getByRole(
        'heading',
        {
          name: 'Genel Bakış',
        },
      ),
    ).toBeVisible();


    for (
      const path of [
        '/put-away/pending',
        '/put-away/history',
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
            'Rafa Yerleştirme',
          exact: true,
        },
      )
      .click();


    await expect(
      page.getByRole(
        'heading',
        {
          name:
            'Rafa Yerleştirme',
          exact: true,
        },
      ),
    ).toBeVisible();


    await expect(
      page.getByRole(
        'heading',
        {
          name:
            'BUFFER Bekleyen Ürünler',
        },
      ),
    ).toBeVisible();


    await expect(
      page.getByRole(
        'heading',
        {
          name:
            'Yerleştirme Geçmişi',
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
        'docs/put-away.png',
      fullPage: true,
    });


    expect(errors).toEqual([]);
  },
);