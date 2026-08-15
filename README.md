<div align="center">

# 📡 ScottsTechX WiFi

### *Generate and share Wi-Fi QR codes instantly — with custom styles, printable cards, and offline-first security.*

[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev)
[![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Gemini](https://img.shields.io/badge/Powered_by-Gemini_API-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)

</div>

---

## ✨ What it does

**Stop typing Wi-Fi passwords.** Generate a QR code in 3 seconds, scan it from any phone, connect instantly.

- 📶 **All encryption modes** — WPA/WPA2, WPA3, WEP, no-password
- 🎨 **Custom styles** — colors, gradients, logos, frames
- 🖨️ **Printable cards** — guest-network cards for cafés, Airbnbs, offices
- 🔒 **Offline-first** — networks stored locally, no server uploads
- 🤖 **AI assist** (Gemini) — auto-suggest SSID/security from a photo of a router label
- 📷 **QR decoder** — scan any Wi-Fi QR to import its settings

---

## 🧰 Tech stack

| Layer | Choice |
|---|---|
| UI | **React 19** + **TypeScript 5** |
| Bundler | **Vite 6** |
| Styling | **Tailwind CSS 4** |
| QR codes | `qrcode` (encode) + `jsqr` (decode) |
| AI | **`@google/genai`** (Gemini) |
| State | Local component state + `localStorage` |

---

## 🚀 Quick start

```bash
bun install      # or: npm install
bun dev          # or: npm run dev
# open http://localhost:3000
```

## 🏗️ Build

```bash
bun run build    # outputs to dist/
```

---

## 📂 Layout

```
src/
├── App.tsx              # main shell + tabs
├── main.tsx             # React root
├── types.ts             # WifiNetwork, QrOptions types
├── index.css            # Tailwind + globals
└── components/
    ├── Navbar.tsx       # top nav + theme toggle
    ├── WifiForm.tsx     # SSID, password, security, hidden-ssid flags
    ├── QrDisplay.tsx    # live QR + style controls
    ├── QrDecoder.tsx    # camera-based QR scanner
    ├── SavedNetworks.tsx# localStorage persistence
    └── PrintableCard.tsx# print-ready guest card layout
```

---

## 🔒 Security & privacy

- **No backend.** All networks are saved in your browser's `localStorage` only.
- **No telemetry.** The Gemini API call sends only what you paste into the AI-assist input.
- **Open source.** Audit the code, self-host, fork it.

---

## 🛣️ Roadmap

- [ ] NFC tag writing (Web NFC API)
- [ ] Mesh-network sharing between devices
- [ ] Guest-network analytics (SSID only, no passwords)

---

## 📬 Contact

- 📧 **scottsstechx@gmail.com**
- 🐙 **[@scottstechx-ship-it](https://github.com/scottstechx-ship-it)**

<sub>© 2026 ScottsTechX Enterprise (U) Ltd · Made with ❤️ in Kampala 🇺🇬</sub>