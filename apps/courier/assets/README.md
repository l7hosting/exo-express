Place the official EXO EXPRESS logo assets here:

- `logo.png` — full logo used on the splash screen and home header.
- `adaptive-icon.png` — foreground layer for the Android adaptive icon (navy `#071A42` background is configured in `app.json`).

Once the files are present, re-enable the `<Image source={require("../assets/logo.png")} />` reference in `app/index.tsx` and restore the `splash.image` / `adaptiveIcon.foregroundImage` entries in `app.json`.
