# @gameweave/i18n

Lightweight runtime localization for GameWeave. Both the default locale and fallback locale are English.

```ts
const i18n = createI18n({
  messages: { en: { greeting: "Hello, {name}" }, zh: { greeting: "你好，{name}" } },
});

i18n.t("greeting", { name: "Kei" });
i18n.setLocale("zh-CN");
```
