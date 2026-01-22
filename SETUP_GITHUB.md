# 🚀 GitHub Setup Instructions

## Krok 1: Vytvořit GitHub Repository

1. Jdi na **https://github.com/new**
2. Vyplň údaje:
   - **Repository name**: `geo-analyser`
   - **Description**: "Generative Engine Optimization Desktop App"
   - **Visibility**: Private nebo Public (podle tebe)
   - ❌ **NECENTRUJ** "Initialize with README" (už máme README.md)
3. Klikni **"Create repository"**

---

## Krok 2: Nahrát Kód na GitHub

Otevři PowerShell v kořenové složce projektu a spusť:

```powershell
# Inicializuj Git (pokud ještě není)
git init

# Přidej všechny soubory
git add .

# První commit
git commit -m "Initial commit - GEO Analyser v1.0.0"

# Připoj GitHub repository (NAHRAĎ 'YOUR_USERNAME' svým GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/geo-analyser.git

# Přejmenuj branch na 'main' (GitHub default)
git branch -M main

# Nahraj kód na GitHub
git push -u origin main
```

---

## Krok 3: Automatický Build

Po pushnutí kódu:

1. **GitHub Actions se spustí automaticky!** 🎉
2. Jdi na **https://github.com/YOUR_USERNAME/geo-analyser/actions**
3. Uvidíš běžící workflow "Build GEO Analyser"
4. Build trvá cca **5-10 minut**

### Co se builduje:

✅ **Windows** (portable .exe) - běží na `windows-latest`  
✅ **macOS** (.dmg) - běží na `macos-latest`

---

## Krok 4: Stáhnout Buildy

Po dokončení buildu:

1. Jdi do **Actions** → klikni na poslední úspěšný workflow
2. V sekci **Artifacts** najdeš:
   - 📦 `GEO-Analyser-Windows` - Windows .exe
   - 📦 `GEO-Analyser-macOS` - macOS .dmg
3. Stáhni a rozbal

---

## 🔄 Manuální Build Trigger

Můžeš spustit build ručně:

1. Jdi na **Actions** → "Build GEO Analyser"
2. Klikni **"Run workflow"** → **"Run workflow"**
3. Vyber branch `main`

---

## 🐛 Troubleshooting

### Git není nainstalován
```powershell
winget install Git.Git
```

### GitHub žádá přihlášení
```powershell
# Nastav credentials
git config --global user.name "Tvoje Jméno"
git config --global user.email "tvuj@email.com"

# Použij GitHub CLI nebo Personal Access Token
gh auth login  # Pokud máš GitHub CLI
```

### Build selhal
- Zkontroluj **Actions** tab pro error log
- Ujisti se že jsou všechny soubory commitnuty

---

## ✅ Hotovo!

Teď máš:
- ✅ Kód na GitHubu
- ✅ Automatické buildy pro Windows i Mac
- ✅ Čistou databázi (vytvoří se při prvním spuštění)
- ✅ Professional setup s CI/CD
