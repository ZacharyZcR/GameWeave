import { describe, expect, it, vi } from "vitest";
import { createI18n } from "./index.js";

describe("i18n", () => {
  const messages = { en: { greeting: "Hello, {name}", fallback: "English" }, zh: { greeting: "你好，{name}" } };
  it("defaults to English and interpolates values", () => {
    const i18n = createI18n({ messages });
    expect(i18n.locale).toBe("en");
    expect(i18n.t("greeting", { name: "Kei" })).toBe("Hello, Kei");
  });
  it("matches language variants and falls back to English", () => {
    const i18n = createI18n({ messages, locale: "zh_CN" });
    expect(i18n.t("greeting", { name: "Kei" })).toBe("你好，Kei");
    expect(i18n.t("fallback")).toBe("English");
  });
  it("notifies only when locale changes", () => {
    const listener = vi.fn(), i18n = createI18n({ messages });
    i18n.subscribe(listener); i18n.setLocale("en"); i18n.setLocale("zh-CN");
    expect(listener).toHaveBeenCalledOnce();
  });
});
