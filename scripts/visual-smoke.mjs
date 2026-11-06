import { chromium } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.SMARTDOCS_WEB_URL ?? "http://localhost:4300";
const browser = await chromium.launch({
  executablePath:
    process.env.SMARTDOCS_CHROME_PATH ??
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});

try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  await page.goto(`${baseUrl}/login`);
  await page.getByRole("heading", { name: "Welcome back" }).waitFor();
  const desktop = join(tmpdir(), "smartdocs-login-desktop.png");
  await page.screenshot({ path: desktop, fullPage: true });

  await page.evaluate(() => {
    localStorage.setItem("smartdocs.theme", "dark");
    localStorage.setItem("smartdocs.locale", "ar");
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("heading", { name: "تسجيل الدخول" }).waitFor();
  const mobile = join(tmpdir(), "smartdocs-login-mobile-ar-dark.png");
  await page.screenshot({ path: mobile, fullPage: true });
  const state = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    overflow: document.documentElement.scrollWidth > window.innerWidth,
  }));
  if (
    state.theme !== "dark" ||
    state.lang !== "ar" ||
    state.dir !== "rtl" ||
    state.overflow
  ) {
    throw new Error(`Visual smoke state failed: ${JSON.stringify(state)}`);
  }
  const combinations = [];
  for (const [width, theme, locale] of [
    [320, "light", "ar"],
    [390, "dark", "en"],
    [1280, "dark", "en"],
  ]) {
    await page.evaluate(
      ([nextTheme, nextLocale]) => {
        localStorage.setItem("smartdocs.theme", nextTheme);
        localStorage.setItem("smartdocs.locale", nextLocale);
      },
      [theme, locale],
    );
    await page.setViewportSize({ width, height: 800 });
    await page.reload();
    const result = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    }));
    if (result.theme !== theme || result.lang !== locale || result.overflow) {
      throw new Error(
        `Visual smoke state failed at ${width}px: ${JSON.stringify(result)}`,
      );
    }
    combinations.push({ width, ...result });
  }
  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => localStorage.setItem("smartdocs.locale", "ar"));
  await page.goto(`${baseUrl}/register`);
  await page.getByRole("heading", { name: "إنشاء حساب" }).waitFor();
  const registerOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  if (registerOverflow) throw new Error("Registration page overflows at 320px");
  const register = join(tmpdir(), "smartdocs-register-mobile-ar.png");
  await page.screenshot({ path: register, fullPage: true });
  console.log(
    JSON.stringify({ desktop, mobile, register, state, combinations }),
  );
} finally {
  await browser.close();
}
